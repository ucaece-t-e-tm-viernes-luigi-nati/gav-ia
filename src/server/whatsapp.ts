import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/server/env";
import { loadIntegrationSecrets } from "@/server/integrations";

/**
 * WhatsApp Business Cloud API (Meta).
 * - GavIA (conversaciones comerciales): variables WHATSAPP_* del entorno.
 * - Cada balneario: integración propia cargada por el dueño (cifrada).
 * Sin configuración, el módulo funciona en modo lectura y no simula envíos.
 */
const GRAPH = "https://graph.facebook.com/v21.0";

export type WaConfig = { phoneNumberId: string; accessToken: string; appSecret: string };

export async function getWhatsAppConfig(balnearioId: string | null): Promise<WaConfig | null> {
  if (!balnearioId) {
    const w = env.whatsapp;
    return w.phoneNumberId && w.accessToken && w.appSecret ? { phoneNumberId: w.phoneNumberId, accessToken: w.accessToken, appSecret: w.appSecret } : null;
  }
  const i = await loadIntegrationSecrets(balnearioId, "whatsapp");
  if (!i || i.status !== "activa" || !i.secrets?.accessToken || !i.publicConfig.phoneNumberId) return null;
  return { phoneNumberId: i.publicConfig.phoneNumberId, accessToken: i.secrets.accessToken, appSecret: i.secrets.appSecret ?? "" };
}

export async function sendWhatsAppText(cfg: WaConfig, to: string, body: string): Promise<string> {
  const res = await fetch(`${GRAPH}/${cfg.phoneNumberId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.accessToken}` },
    body: JSON.stringify({ messaging_product: "whatsapp", to: to.replace(/[^\d]/g, ""), type: "text", text: { body } }),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string } };
  if (!res.ok || !json.messages?.[0]?.id) throw new Error(json.error?.message ?? `Error de WhatsApp (${res.status})`);
  return json.messages[0].id;
}

export function verifyWhatsAppSignature(raw: string, header: string | null, appSecret: string) {
  if (!header?.startsWith("sha256=") || !appSecret) return false;
  const expected = Buffer.from(createHmac("sha256", appSecret).update(raw).digest("hex"));
  const given = Buffer.from(header.slice(7));
  return expected.length === given.length && timingSafeEqual(expected, given);
}
