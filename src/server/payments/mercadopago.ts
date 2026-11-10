import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { asService } from "@/server/db";
import { env } from "@/server/env";
import { loadIntegrationSecrets } from "@/server/integrations";

/**
 * Integración con Mercado Pago — cobro presencial con QR dinámico mediante la
 * API de Orders (POST /v1/orders, type "qr", config.qr.mode "dynamic").
 *
 * Requisitos para el modo real (por balneario):
 *  - Access Token de producción de la cuenta del balneario (solo backend, cifrado).
 *  - Una sucursal y una caja (POS) creadas en Mercado Pago: su external_id es el external_pos_id.
 *  - Clave secreta de notificaciones (webhooks) configurada en la aplicación de Mercado Pago,
 *    con la URL {APP_URL}/api/webhooks/mercadopago?b={id del balneario} y el tópico "Order".
 *
 * Un pago nunca se confirma por una acción del usuario: solo cuando el backend
 * consulta la order en Mercado Pago y su estado es "processed".
 */

const API = "https://api.mercadopago.com";

export type MpConfig = { accessToken: string; webhookSecret: string; externalPosId: string; mode: string };

export async function getMpConfig(balnearioId: string): Promise<MpConfig | null> {
  const i = await loadIntegrationSecrets(balnearioId, "mercadopago");
  if (!i || i.status !== "activa" || i.mode !== "produccion" || !i.secrets?.accessToken || !i.publicConfig.externalPosId) return null;
  return { accessToken: i.secrets.accessToken, webhookSecret: i.secrets.webhookSecret ?? "", externalPosId: i.publicConfig.externalPosId, mode: i.mode };
}

const toDecimal = (cents: number) => `${Math.trunc(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;

export async function createMpQrOrder(cfg: MpConfig, input: { externalReference: string; amountCents: number; description: string; idempotencyKey: string }) {
  const amount = toDecimal(input.amountCents);
  const res = await fetch(`${API}/v1/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.accessToken}`, "X-Idempotency-Key": input.idempotencyKey },
    body: JSON.stringify({
      type: "qr",
      total_amount: amount,
      description: input.description.slice(0, 150),
      external_reference: input.externalReference,
      expiration_time: "PT15M",
      config: { qr: { external_pos_id: cfg.externalPosId, mode: "dynamic" } },
      transactions: { payments: [{ amount }] },
    }),
    cache: "no-store",
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(`Mercado Pago rechazó la solicitud (${res.status}): ${String(body.message ?? body.error ?? "error")}`);
  const typeResponse = body.type_response as { qr_data?: string } | undefined;
  const qrData = typeResponse?.qr_data ?? (body.qr_data as string | undefined);
  if (!qrData) throw new Error("Mercado Pago no devolvió los datos del QR.");
  return { orderId: String(body.id), qrData };
}

export type MpOrder = {
  id: string;
  status: string;
  status_detail?: string;
  external_reference?: string;
  total_amount?: string;
  transactions?: { payments?: { id: string; amount: string; status: string; status_detail?: string }[] };
};

export async function fetchMpOrder(cfg: MpConfig, orderId: string): Promise<MpOrder> {
  const res = await fetch(`${API}/v1/orders/${encodeURIComponent(orderId)}`, { headers: { Authorization: `Bearer ${cfg.accessToken}` }, cache: "no-store" });
  if (!res.ok) throw new Error(`No se pudo consultar la order (${res.status})`);
  return (await res.json()) as MpOrder;
}

export async function cancelMpOrder(cfg: MpConfig, orderId: string) {
  await fetch(`${API}/v1/orders/${encodeURIComponent(orderId)}/cancel`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.accessToken}`, "X-Idempotency-Key": randomUUID() },
    cache: "no-store",
  });
}

/**
 * Valida la firma x-signature de Mercado Pago.
 * Plantilla: "id:{data.id};request-id:{x-request-id};ts:{ts};" firmada con HMAC-SHA256.
 */
export function verifyMpSignature(params: { signature: string | null; requestId: string | null; dataId: string; secret: string }): boolean {
  if (!params.signature || !params.secret) return false;
  const parts = Object.fromEntries(params.signature.split(",").map((p) => p.trim().split("=", 2) as [string, string]));
  if (!parts.ts || !parts.v1) return false;
  let manifest = `id:${params.dataId.toLowerCase()};`;
  if (params.requestId) manifest += `request-id:${params.requestId};`;
  manifest += `ts:${parts.ts};`;
  const expected = createHmac("sha256", params.secret).update(manifest).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(parts.v1);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Aplica el resultado confirmado de una order a la reserva. Idempotente:
 * el índice único (provider, provider_payment_id) evita pagos duplicados.
 */
export async function applyOrderResult(order: MpOrder, provider: "mercadopago" | "mercadopago_prueba") {
  return asService(async (db) => {
    const req = await db.one<{ id: string; balneario_id: string; reservation_id: string; amount_cents: number; status: string; created_by: string | null }>(
      `select id, balneario_id, reservation_id, amount_cents, status, created_by from payment_requests
        where provider_order_id = $1 or external_reference = $2 for update`,
      [order.id, order.external_reference ?? ""],
    );
    if (!req) return "solicitud-desconocida";
    if (req.status === "aprobado") return "ya-aplicado";

    if (order.status === "processed") {
      const payment = order.transactions?.payments?.[0];
      const paidCents = payment ? Math.round(Number(payment.amount) * 100) : req.amount_cents;
      if (paidCents !== req.amount_cents) {
        await db.exec(`update payment_requests set status = 'error', status_detail = 'Importe confirmado distinto al solicitado', resolved_at = now() where id = $1`, [req.id]);
        return "importe-inconsistente";
      }
      await db.exec(
        `insert into payments (balneario_id, reservation_id, amount_cents, method, status, paid_at, provider, provider_payment_id, payment_request_id, created_by, notes)
         values ($1, $2, $3, 'mercadopago_qr', 'aprobado', now(), $4, $5, $6, $7, $8)
         on conflict (provider, provider_payment_id) where provider_payment_id is not null do nothing`,
        [req.balneario_id, req.reservation_id, req.amount_cents, provider, payment?.id ?? order.id, req.id, req.created_by,
         provider === "mercadopago_prueba" ? "PAGO DE PRUEBA SIMULADO — entorno local, no es dinero real" : "Cobro QR confirmado por Mercado Pago"],
      );
      await db.exec(`update payment_requests set status = 'aprobado', status_detail = $2, resolved_at = now() where id = $1`, [req.id, order.status_detail ?? "accredited"]);
      return "aprobado";
    }
    const map: Record<string, string> = { canceled: "cancelado", expired: "expirado", failed: "rechazado", refunded: "cancelado" };
    if (map[order.status]) {
      await db.exec(`update payment_requests set status = $2, status_detail = $3, resolved_at = now() where id = $1 and status = 'creado'`, [req.id, map[order.status], order.status_detail ?? order.status]);
      return map[order.status];
    }
    return "sin-cambios";
  });
}

// QR de prueba ("Simular aprobación"): solo fuera de producción. En producción sin credenciales, el cobro con QR queda "pendiente de configuración".
export const isTestModeAvailable = () => !env.isProduction;
