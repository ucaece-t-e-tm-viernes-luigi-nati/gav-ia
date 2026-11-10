"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { asUser, dbErrorMessage } from "@/server/db";
import { tenantForAction } from "@/server/auth/context";
import { hasModule } from "@/lib/plan";
import { findOrCreateUser, resetUserPassword } from "@/server/users";
import { saveIntegration } from "@/server/integrations";
import { isISODate } from "@/lib/dates";
import type { ActionResult } from "@/lib/utils";

async function ownerOnly() {
  const t = await tenantForAction(["owner"]);
  return t && t.role === "owner" ? t : null;
}
const DENIED = { ok: false as const, error: "Solo el dueño del balneario puede realizar esta acción (y la cuenta no puede estar en solo lectura)." };

/** El dueño suma dueños o staff a su balneario (con teléfono de contacto). */
export async function addMemberOwnerAction(input: { email: string; fullName: string; phone: string; role: string }): Promise<ActionResult<{ tempPassword?: string }>> {
  const t = await ownerOnly();
  if (!t) return DENIED;
  const parsed = z
    .object({
      email: z.email({ error: "Correo inválido." }),
      fullName: z.string().trim().min(2, { error: "Ingresá el nombre." }).max(100),
      phone: z.string().trim().min(6, { error: "Ingresá el teléfono." }).max(40),
      role: z.enum(["owner", "staff"]),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const d = parsed.data;
  try {
    const res = await findOrCreateUser(t.viewer.id, d.email.toLowerCase(), d.fullName, d.phone, t.balnearioName);
    await asUser(t.viewer.id, (db) =>
      db.exec(
        `insert into memberships (user_id, balneario_id, role) values ($1, $2, $3)
         on conflict (user_id, balneario_id) do update set active = true, role = excluded.role`,
        [res.userId, t.balnearioId, d.role],
      ),
    );
    revalidatePath("/empresa/usuarios");
    const who = d.role === "owner" ? "Dueño" : "Staff";
    return { ok: true, data: { tempPassword: res.tempPassword }, message: res.tempPassword ? `${who} creado.` : `La persona ya tenía cuenta: quedó asociada como ${who.toLowerCase()} con su contraseña actual.` };
  } catch (e) {
    return { ok: false, error: dbErrorMessage(e) };
  }
}

/** Cambia rol (dueño/staff), acceso o permiso de plano. La base impide quedarse sin dueños. */
export async function updateMemberAction(input: { membershipId: string; active?: boolean; canEditPlano?: boolean; role?: string }): Promise<ActionResult> {
  const t = await ownerOnly();
  if (!t) return DENIED;
  const parsed = z.object({ membershipId: z.uuid(), active: z.boolean().optional(), canEditPlano: z.boolean().optional(), role: z.enum(["owner", "staff"]).optional() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Datos inválidos." };
  const v = parsed.data;
  try {
    const row = await asUser(t.viewer.id, async (db) => {
      const m = await db.one<{ user_id: string }>(`select user_id from memberships where id = $1 and balneario_id = $2`, [v.membershipId, t.balnearioId]);
      if (!m) return null;
      if (m.user_id === t.viewer.id && (v.active === false || v.role === "staff")) {
        throw Object.assign(new Error(), { code: "P0001", message: "No podés quitarte tu propio acceso de dueño. Pedíselo a otro dueño." });
      }
      return db.one(
        `update memberships set active = coalesce($3, active), can_edit_plano = coalesce($4, can_edit_plano), role = coalesce($5, role)
          where id = $1 and balneario_id = $2 returning id`,
        [v.membershipId, t.balnearioId, v.active ?? null, v.canEditPlano ?? null, v.role ?? null],
      );
    });
    if (!row) return { ok: false, error: "El usuario no pertenece a tu balneario." };
    revalidatePath("/empresa", "layout");
    return { ok: true, message: v.role ? (v.role === "owner" ? "Ahora es dueño del balneario." : "Ahora es staff del balneario.") : undefined };
  } catch (e) {
    return { ok: false, error: dbErrorMessage(e) };
  }
}

/** El dueño puede blanquear la contraseña de otro usuario de su balneario. */
export async function resetAdminPasswordAction(input: { membershipId: string }): Promise<ActionResult<{ tempPassword?: string }>> {
  const t = await ownerOnly();
  if (!t) return DENIED;
  if (!z.uuid().safeParse(input.membershipId).success) return { ok: false, error: "Datos inválidos." };
  try {
    // RLS + filtro explícito: solo membresías del balneario del dueño (nunca la propia).
    const m = await asUser(t.viewer.id, (db) =>
      db.one<{ user_id: string }>(`select user_id from memberships where id = $1 and balneario_id = $2`, [input.membershipId, t.balnearioId]),
    );
    if (m?.user_id === t.viewer.id) return { ok: false, error: "Para tu contraseña usá “Cambiar contraseña”." };
    if (!m) return { ok: false, error: "Solo podés blanquear contraseñas de usuarios de tu balneario." };
    const tempPassword = await resetUserPassword(m.user_id, t.balnearioName);
    await asUser(t.viewer.id, (db) => db.exec(`select log_action($1, 'usuarios.clave_blanqueada', 'profiles', $2, '{}'::jsonb)`, [t.balnearioId, m.user_id]));
    return { ok: true, data: { tempPassword }, message: "Contraseña temporal generada." };
  } catch (e) {
    return { ok: false, error: dbErrorMessage(e) };
  }
}

/** Marca un cobro como facturado (comprobante emitido al cliente) o lo desmarca. Solo el dueño. */
export async function setPaymentInvoicedAction(input: { paymentId: string; invoiced: boolean; invoiceRef?: string }): Promise<ActionResult> {
  const t = await ownerOnly();
  if (!t) return DENIED;
  if (!hasModule(t.modules, "pagos")) return { ok: false, error: "Cobros y pagos están incluidos en el plan PLUS." };
  const p = z.object({ paymentId: z.uuid(), invoiced: z.boolean(), invoiceRef: z.string().trim().max(60).optional() }).safeParse(input);
  if (!p.success) return { ok: false, error: "Datos inválidos." };
  try {
    const row = await asUser(t.viewer.id, (db) =>
      db.one(
        `update payments set invoiced = $3, invoice_ref = case when $3 then coalesce($4, invoice_ref) else '' end,
                invoiced_at = case when $3 then coalesce(invoiced_at, now()) else null end
          where id = $1 and balneario_id = $2 and status = 'aprobado' returning id`,
        [p.data.paymentId, t.balnearioId, p.data.invoiced, p.data.invoiceRef ?? null],
      ),
    );
    if (!row) return { ok: false, error: "Cobro inexistente o anulado." };
    revalidatePath("/empresa/pagos");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: dbErrorMessage(e) };
  }
}
const balnearioSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    city: z.string().trim().max(100),
    address: z.string().trim().max(200),
    phone: z.string().trim().max(40),
    email: z.union([z.literal(""), z.email({ error: "Correo inválido." })]),
    seasonStart: z.string().refine((v) => v === "" || isISODate(v)),
    seasonEnd: z.string().refine((v) => v === "" || isISODate(v)),
  })
  .refine((v) => !v.seasonStart || !v.seasonEnd || v.seasonEnd >= v.seasonStart, { error: "El fin de temporada debe ser posterior al inicio." });

export async function updateBalnearioAction(input: z.input<typeof balnearioSchema>): Promise<ActionResult> {
  const t = await ownerOnly();
  if (!t) return DENIED;
  const parsed = balnearioSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const v = parsed.data;
  try {
    await asUser(t.viewer.id, (db) =>
      db.exec(
        `update balnearios set name = $2, city = $3, address = $4, phone = $5, email = $6, season_start = nullif($7, '')::date, season_end = nullif($8, '')::date where id = $1`,
        [t.balnearioId, v.name, v.city, v.address, v.phone, v.email, v.seasonStart, v.seasonEnd],
      ),
    );
    revalidatePath("/empresa", "layout");
    return { ok: true, message: "Datos del balneario actualizados." };
  } catch (e) {
    return { ok: false, error: dbErrorMessage(e) };
  }
}

export async function saveMercadoPagoAction(input: { enabled: boolean; externalPosId: string; accessToken: string; webhookSecret: string }): Promise<ActionResult> {
  const t = await ownerOnly();
  if (!t) return DENIED;
  if (!hasModule(t.modules, "pagos")) return { ok: false, error: "La integración de pagos está incluida en el plan PLUS." };
  const parsed = z
    .object({ enabled: z.boolean(), externalPosId: z.string().trim().max(60), accessToken: z.string().trim().max(300), webhookSecret: z.string().trim().max(200) })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Datos inválidos." };
  const v = parsed.data;
  if (v.accessToken && !v.accessToken.startsWith("APP_USR-")) return { ok: false, error: "El Access Token de producción de Mercado Pago comienza con APP_USR-." };
  try {
    const current = await asUser(t.viewer.id, (db) =>
      db.one<{ has_secret: boolean }>(`select has_secret from integrations where balneario_id = $1 and provider = 'mercadopago'`, [t.balnearioId]),
    );
    const hasSecret = !!v.accessToken || !!current?.has_secret;
    if (v.enabled && (!hasSecret || !v.externalPosId)) {
      return { ok: false, error: "Para activar los cobros cargá el Access Token, la clave de notificaciones y el ID externo de la caja." };
    }
    await saveIntegration(t.viewer.id, t.balnearioId, "mercadopago", {
      mode: "produccion",
      status: v.enabled ? "activa" : "desactivada",
      publicConfig: { externalPosId: v.externalPosId },
      secrets: v.accessToken ? { accessToken: v.accessToken, webhookSecret: v.webhookSecret } : null,
    });
    revalidatePath("/empresa/configuracion");
    return { ok: true, message: "Configuración de Mercado Pago guardada." };
  } catch (e) {
    return { ok: false, error: dbErrorMessage(e) };
  }
}

export async function saveWhatsAppAction(input: { enabled: boolean; phoneNumberId: string; accessToken: string; appSecret: string }): Promise<ActionResult> {
  const t = await ownerOnly();
  if (!t) return DENIED;
  if (!hasModule(t.modules, "whatsapp")) return { ok: false, error: "WhatsApp está incluido en los planes PRO y PLUS." };
  const parsed = z.object({ enabled: z.boolean(), phoneNumberId: z.string().trim().regex(/^\d*$/, { error: "El Phone Number ID es numérico." }).max(30), accessToken: z.string().trim().max(500), appSecret: z.string().trim().max(200) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const v = parsed.data;
  try {
    const current = await asUser(t.viewer.id, (db) =>
      db.one<{ has_secret: boolean }>(`select has_secret from integrations where balneario_id = $1 and provider = 'whatsapp'`, [t.balnearioId]),
    );
    if (v.enabled && (!v.phoneNumberId || !(v.accessToken || current?.has_secret))) {
      return { ok: false, error: "Para activar WhatsApp cargá el Phone Number ID, el token de acceso y el App Secret." };
    }
    await saveIntegration(t.viewer.id, t.balnearioId, "whatsapp", {
      mode: "produccion",
      status: v.enabled ? "activa" : "desactivada",
      publicConfig: { phoneNumberId: v.phoneNumberId },
      secrets: v.accessToken ? { accessToken: v.accessToken, appSecret: v.appSecret } : null,
    });
    revalidatePath("/empresa/configuracion");
    return { ok: true, message: "Configuración de WhatsApp guardada." };
  } catch (e) {
    return { ok: false, error: dbErrorMessage(e) };
  }
}
