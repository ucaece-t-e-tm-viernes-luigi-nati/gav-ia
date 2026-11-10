import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { asService } from "@/server/db";
import { applyOrderResult, fetchMpOrder, getMpConfig, verifyMpSignature } from "@/server/payments/mercadopago";
import { loadIntegrationSecrets } from "@/server/integrations";

/**
 * Notificaciones de Mercado Pago (tópico "Order").
 * URL a configurar: {APP_URL}/api/webhooks/mercadopago?b={id del balneario}
 * 1) Valida la firma x-signature con la clave secreta del balneario.
 * 2) Registra el evento (idempotencia).
 * 3) Consulta la order en la API de Mercado Pago y recién ahí confirma el pago.
 */
export async function POST(request: NextRequest) {
  const balnearioId = request.nextUrl.searchParams.get("b") ?? "";
  if (!z.uuid().safeParse(balnearioId).success) return NextResponse.json({ error: "balneario inválido" }, { status: 400 });

  const payload = (await request.json().catch(() => null)) as { type?: string; action?: string; data?: { id?: string } } | null;
  const dataId = payload?.data?.id ?? request.nextUrl.searchParams.get("data.id") ?? "";
  if (!payload || !dataId) return NextResponse.json({ error: "payload inválido" }, { status: 400 });

  const integration = await loadIntegrationSecrets(balnearioId, "mercadopago");
  const valid = verifyMpSignature({
    signature: request.headers.get("x-signature"),
    requestId: request.headers.get("x-request-id"),
    dataId,
    secret: integration?.secrets?.webhookSecret ?? "",
  });

  const eventKey = `${balnearioId}:${request.headers.get("x-request-id") ?? ""}:${dataId}:${payload.action ?? payload.type ?? ""}`;
  const inserted = await asService((db) =>
    db.one<{ id: string }>(
      `insert into webhook_events (provider, event_key, payload, signature_valid) values ('mercadopago', $1, $2, $3)
       on conflict (provider, event_key) do nothing returning id`,
      [eventKey, JSON.stringify(payload), valid],
    ),
  );
  if (!valid) return NextResponse.json({ error: "firma inválida" }, { status: 401 });
  if (!inserted) return NextResponse.json({ ok: true, duplicate: true });

  let result = "ignorado";
  try {
    const cfg = await getMpConfig(balnearioId);
    if (cfg && (payload.type === "order" || payload.action?.startsWith("order"))) {
      const order = await fetchMpOrder(cfg, dataId);
      result = await applyOrderResult(order, "mercadopago");
    }
  } catch (e) {
    result = `error: ${(e as Error).message}`.slice(0, 300);
  }
  await asService((db) => db.exec(`update webhook_events set processed_at = now(), result = $2 where id = $1`, [inserted.id, result]));
  return NextResponse.json({ ok: true });
}
