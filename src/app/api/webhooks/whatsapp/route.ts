import { NextResponse, type NextRequest } from "next/server";
import { asService } from "@/server/db";
import { env } from "@/server/env";
import { getWhatsAppConfig, verifyWhatsAppSignature } from "@/server/whatsapp";

/**
 * Webhook de WhatsApp Business Cloud API.
 * URL: {APP_URL}/api/webhooks/whatsapp  (?b={id del balneario} para la línea de un balneario)
 */
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  if (p.get("hub.mode") === "subscribe" && env.whatsapp.verifyToken && p.get("hub.verify_token") === env.whatsapp.verifyToken) {
    return new NextResponse(p.get("hub.challenge") ?? "", { status: 200 });
  }
  return NextResponse.json({ error: "verificación inválida" }, { status: 403 });
}

type WaPayload = {
  entry?: { changes?: { value?: { contacts?: { profile?: { name?: string }; wa_id?: string }[]; messages?: { id: string; from: string; text?: { body?: string }; type: string }[]; statuses?: { id: string; status: string }[] } }[] }[];
};

export async function POST(request: NextRequest) {
  const balnearioId = request.nextUrl.searchParams.get("b");
  const raw = await request.text();
  const cfg = await getWhatsAppConfig(balnearioId);
  if (!cfg || !verifyWhatsAppSignature(raw, request.headers.get("x-hub-signature-256"), cfg.appSecret)) {
    return NextResponse.json({ error: "firma inválida" }, { status: 401 });
  }
  const payload = JSON.parse(raw) as WaPayload;
  await asService(async (db) => {
    for (const change of payload.entry?.flatMap((e) => e.changes ?? []) ?? []) {
      const value = change.value;
      for (const m of value?.messages ?? []) {
        const name = value?.contacts?.find((c) => c.wa_id === m.from)?.profile?.name ?? "";
        const phone = `+${m.from}`;
        const conv = await db.one<{ id: string }>(
          `insert into conversations (scope, balneario_id, contact_name, contact_phone, status, unread_count, last_message_at)
           values ($1, $2, $3, $4, 'pendiente', 1, now())
           on conflict (scope, coalesce(balneario_id, '00000000-0000-0000-0000-000000000000'::uuid), channel, contact_phone)
           do update set unread_count = conversations.unread_count + 1, last_message_at = now(), status = 'pendiente',
                         contact_name = coalesce(nullif(excluded.contact_name, ''), conversations.contact_name)
           returning id`,
          [balnearioId ? "balneario" : "gavia", balnearioId, name, phone],
        );
        await db.exec(
          `insert into messages (conversation_id, direction, body, status, provider_message_id) values ($1, 'entrante', $2, 'recibido', $3)
           on conflict (provider_message_id) do nothing`,
          [conv!.id, m.text?.body ?? `[${m.type}]`, m.id],
        );
      }
      for (const s of value?.statuses ?? []) {
        const map: Record<string, string> = { sent: "enviado", delivered: "entregado", read: "leido", failed: "fallido" };
        if (map[s.status]) await db.exec(`update messages set status = $2 where provider_message_id = $1`, [s.id, map[s.status]]);
      }
    }
  });
  return NextResponse.json({ ok: true });
}
