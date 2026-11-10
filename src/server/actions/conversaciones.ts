"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { asUser, dbErrorMessage } from "@/server/db";
import { superadminFor, tenantForAction } from "@/server/auth/context";
import { hasModule } from "@/lib/plan";
import { getWhatsAppConfig, sendWhatsAppText } from "@/server/whatsapp";
import type { ActionResult } from "@/lib/utils";

async function ctx(area: "tenant" | "gavia") {
  if (area === "gavia") {
    const v = await superadminFor("conversaciones");
    return v ? { userId: v.id, balnearioId: null as string | null, path: "/plataforma/conversaciones" } : null;
  }
  const t = await tenantForAction(["owner", "staff"]);
  // Las conversaciones de un balneario requieren el módulo WhatsApp del plan.
  return t && hasModule(t.modules, "whatsapp") ? { userId: t.viewer.id, balnearioId: t.balnearioId, path: `/empresa/conversaciones` } : null;
}

export async function sendMessageAction(input: { area: "tenant" | "gavia"; conversationId: string; body: string }): Promise<ActionResult> {
  const c = await ctx(input.area);
  if (!c) return { ok: false, error: "No autorizado." };
  const parsed = z.object({ conversationId: z.uuid(), body: z.string().trim().min(1).max(4000) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Escribí un mensaje." };
  const cfg = await getWhatsAppConfig(c.balnearioId);
  if (!cfg) return { ok: false, error: "La integración de WhatsApp Business no está configurada. El mensaje no se envió." };
  try {
    // La conversación se lee con RLS: si no pertenece al scope del usuario, no existe para él.
    const conv = await asUser(c.userId, (db) =>
      db.one<{ contact_phone: string }>(`select contact_phone from conversations where id = $1 and balneario_id is not distinct from $2`, [parsed.data.conversationId, c.balnearioId]),
    );
    if (!conv) return { ok: false, error: "Conversación inexistente." };
    let providerId: string | null = null;
    let status = "enviado";
    try {
      providerId = await sendWhatsAppText(cfg, conv.contact_phone, parsed.data.body);
    } catch (e) {
      status = "fallido";
      console.error("[GavIA] Envío de WhatsApp fallido", e);
    }
    await asUser(c.userId, async (db) => {
      await db.exec(
        `insert into messages (conversation_id, direction, body, status, provider_message_id, sent_by) values ($1, 'saliente', $2, $3, $4, auth.uid())`,
        [parsed.data.conversationId, parsed.data.body, status, providerId],
      );
      await db.exec(`update conversations set last_message_at = now(), status = 'abierta', unread_count = 0 where id = $1`, [parsed.data.conversationId]);
    });
    revalidatePath(c.path);
    return status === "enviado" ? { ok: true } : { ok: false, error: "WhatsApp rechazó el envío. Quedó registrado como fallido." };
  } catch (e) {
    return { ok: false, error: dbErrorMessage(e) };
  }
}

export async function updateConversationAction(input: { area: "tenant" | "gavia"; id: string; status?: string; customerId?: string | null; markRead?: boolean }): Promise<ActionResult> {
  const c = await ctx(input.area);
  if (!c) return { ok: false, error: "No autorizado." };
  const parsed = z
    .object({ id: z.uuid(), status: z.enum(["abierta", "pendiente", "cerrada"]).optional(), customerId: z.uuid().nullable().optional(), markRead: z.boolean().optional() })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Datos inválidos." };
  const v = parsed.data;
  try {
    await asUser(c.userId, async (db) => {
      if (v.status) await db.exec(`update conversations set status = $2 where id = $1`, [v.id, v.status]);
      if (v.markRead) await db.exec(`update conversations set unread_count = 0 where id = $1`, [v.id]);
      if (v.customerId !== undefined && c.balnearioId) {
        await db.exec(`update conversations set customer_id = (select id from customers where id = $2 and balneario_id = $3) where id = $1`, [v.id, v.customerId, c.balnearioId]);
      }
    });
    revalidatePath(c.path);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: dbErrorMessage(e) };
  }
}
