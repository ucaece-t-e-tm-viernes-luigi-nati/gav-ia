"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { asService, asUser, dbErrorMessage } from "@/server/db";
import { superadminFor } from "@/server/auth/context";
import { PLATFORM_PERMISSIONS, type PlatformPermission } from "@/lib/platform";
import { findOrCreateUser, resetUserPassword, setUserPassword, updateUserEmail } from "@/server/users";
import { createLayout, DEFAULT_LAYOUT } from "@/server/db/layouts";
import { parseMoney, splitInstallments } from "@/lib/money";
import { addDays, addMonths, isISODate, todayISO } from "@/lib/dates";

const TRIAL_DAYS = 15;
const FULL_PAYMENT_DISCOUNT = 0.05;
import type { ActionResult } from "@/lib/utils";

/** Superadmin con el permiso de la sección (también lo exige la base de datos). */
const superadmin = (permission: PlatformPermission) => superadminFor(permission);
const DENIED = { ok: false as const, error: "Acceso exclusivo del equipo de GAVIA." };
const money = z.string().transform((v, ctx) => {
  const c = parseMoney(v);
  if (c === null) ctx.addIssue({ code: "custom", message: "Importe inválido." });
  return c ?? 0;
});

function done(path: string, message?: string): ActionResult {
  revalidatePath(path, "layout");
  return { ok: true, message };
}

const phone = (label: string) => z.string().trim().min(6, { error: `Ingresá el teléfono ${label}.` }).max(40);
const balnearioSchema = z.object({
  name: z.string().trim().min(2, { error: "Ingresá el nombre del balneario." }).max(100),
  phone: phone("del balneario"),
  address: z.string().trim().min(3, { error: "Ingresá la dirección del balneario." }).max(200),
  city: z.string().trim().max(100),
  ownerName: z.string().trim().min(2, { error: "Ingresá el nombre del dueño." }).max(100),
  ownerPhone: phone("del dueño"),
  ownerEmail: z.email({ error: "Correo del dueño inválido." }),
  planId: z.uuid({ error: "Elegí un plan." }),
});

/** Identificador interno derivado del nombre ("La Gaviota" → "la-gaviota"). */
function slugify(name: string) {
  const s = name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50);
  return s.length >= 3 ? s : `balneario-${s || "nuevo"}`;
}

export async function createBalnearioAction(input: z.input<typeof balnearioSchema>): Promise<ActionResult<{ id: string; tempPassword?: string }>> {
  const v = await superadmin("balnearios");
  if (!v) return DENIED;
  const parsed = balnearioSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const d = parsed.data;
  try {
    const owner = await findOrCreateUser(v.id, d.ownerEmail.toLowerCase(), d.ownerName, d.ownerPhone);
    const res = await asUser(v.id, async (db) => {
      const base = slugify(d.name);
      let slug = base;
      for (let i = 2; await db.one(`select 1 from balnearios where slug = $1`, [slug]); i++) slug = `${base}-${i}`;
      const b = await db.one<{ id: string }>(
        `insert into balnearios (name, slug, city, address, phone, status) values ($1, $2, $3, $4, $5, 'prueba') returning id`,
        [d.name, slug, d.city, d.address, d.phone],
      );
      // Plano predeterminado (playa y cocheras) que el dueño luego adapta en el editor.
      await createLayout(db, b!.id, DEFAULT_LAYOUT);
      await db.exec(`insert into memberships (user_id, balneario_id, role) values ($1, $2, 'owner')`, [owner.userId, b!.id]);
      const plan = await db.one<{ price_cents: number; currency: string }>(`select price_cents, currency from plans where id = $1`, [d.planId]);
      // TESTING: 15 días de prueba gratuita.
      await db.exec(
        `insert into subscriptions (balneario_id, plan_id, status, price_cents, currency, current_period_start, current_period_end) values ($1, $2, 'prueba', $3, $4, $5, $6)`,
        [b!.id, d.planId, plan?.price_cents ?? 0, plan?.currency ?? "USD", todayISO(), addDays(todayISO(), TRIAL_DAYS)],
      );
      return { id: b!.id, tempPassword: owner.tempPassword };
    });
    revalidatePath("/backoffice", "layout");
    return { ok: true, data: res, message: "Balneario creado con el plano predeterminado. El dueño puede adaptarlo desde el editor." };
  } catch (e) {
    return { ok: false, error: dbErrorMessage(e) };
  }
}

const balnearioInfoSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(2, { error: "Ingresá el nombre." }).max(100),
  phone: z.string().trim().max(40),
  address: z.string().trim().max(200),
  city: z.string().trim().max(100),
  email: z.union([z.literal(""), z.email({ error: "Correo inválido." })]),
});

/** Datos de contacto del balneario (no toca información operativa ni financiera). */
export async function updateBalnearioInfoAction(input: z.input<typeof balnearioInfoSchema>): Promise<ActionResult> {
  const v = await superadmin("balnearios");
  if (!v) return DENIED;
  const p = balnearioInfoSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Datos inválidos." };
  const d = p.data;
  try {
    const row = await asUser(v.id, (db) =>
      db.one(`update balnearios set name = $2, phone = $3, address = $4, city = $5, email = $6 where id = $1 returning id`, [d.id, d.name, d.phone, d.address, d.city, d.email]),
    );
    if (!row) return { ok: false, error: "Balneario inexistente." };
    return done("/backoffice", "Datos del balneario actualizados.");
  } catch (e) {
    return { ok: false, error: dbErrorMessage(e) };
  }
}
export async function setBalnearioStatusAction(input: { id: string; status: string }): Promise<ActionResult> {
  const v = await superadmin("balnearios");
  if (!v) return DENIED;
  const p = z.object({ id: z.uuid(), status: z.enum(["prueba", "activo", "suspendido"]) }).safeParse(input);
  if (!p.success) return { ok: false, error: "Datos inválidos." };
  try {
    await asUser(v.id, async (db) => {
      await db.exec(`update balnearios set status = $2 where id = $1`, [p.data.id, p.data.status]);
      // La suscripción acompaña la etapa: TESTING = prueba, ACTIVO = activa.
      if (p.data.status !== "suspendido") {
        await db.exec(
          `update subscriptions set status = $2 where id = (select id from subscriptions where balneario_id = $1 order by created_at desc limit 1)`,
          [p.data.id, p.data.status === "activo" ? "activa" : "prueba"],
        );
      }
    });
    return done("/backoffice", "Etapa actualizada.");
  } catch (e) {
    return { ok: false, error: dbErrorMessage(e) };
  }
}

export async function addMemberAction(input: { balnearioId: string; email: string; fullName: string; phone: string; role: string }): Promise<ActionResult<{ tempPassword?: string }>> {
  const v = await superadmin("balnearios");
  if (!v) return DENIED;
  const p = z
    .object({
      balnearioId: z.uuid(),
      email: z.email({ error: "Correo inválido." }),
      fullName: z.string().trim().min(2, { error: "Ingresá el nombre." }).max(100),
      phone: phone(""),
      role: z.enum(["owner", "admin"]),
    })
    .safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Datos inválidos." };
  try {
    const u = await findOrCreateUser(v.id, p.data.email.toLowerCase(), p.data.fullName, p.data.phone);
    await asUser(v.id, (db) =>
      db.exec(
        `insert into memberships (user_id, balneario_id, role) values ($1, $2, $3) on conflict (user_id, balneario_id) do update set role = excluded.role, active = true`,
        [u.userId, p.data.balnearioId, p.data.role],
      ),
    );
    revalidatePath("/backoffice", "layout");
    return { ok: true, data: { tempPassword: u.tempPassword }, message: "Usuario asociado." };
  } catch (e) {
    return { ok: false, error: dbErrorMessage(e) };
  }
}

/** Cambia el rol (dueño/administrador) o el acceso de un miembro. La base impide dejar el balneario sin dueño. */
export async function setMemberAction(input: { membershipId: string; role?: string; active?: boolean }): Promise<ActionResult> {
  const v = await superadmin("balnearios");
  if (!v) return DENIED;
  const p = z.object({ membershipId: z.uuid(), role: z.enum(["owner", "admin"]).optional(), active: z.boolean().optional() }).safeParse(input);
  if (!p.success) return { ok: false, error: "Datos inválidos." };
  try {
    const row = await asUser(v.id, (db) =>
      db.one(`update memberships set role = coalesce($2, role), active = coalesce($3, active) where id = $1 returning id`, [p.data.membershipId, p.data.role ?? null, p.data.active ?? null]),
    );
    if (!row) return { ok: false, error: "Miembro inexistente." };
    return done("/backoffice", "Acceso actualizado.");
  } catch (e) {
    return { ok: false, error: dbErrorMessage(e) };
  }
}
const permissionsSchema = z
  .array(z.enum(PLATFORM_PERMISSIONS.map((p) => p.code) as [PlatformPermission, ...PlatformPermission[]]))
  .min(1, { error: "Elegí al menos una sección para este usuario." })
  .max(PLATFORM_PERMISSIONS.length);

/** Crea un superadmin (o promueve una cuenta existente) con las secciones elegidas una por una. */
export async function createSuperadminAction(input: { email: string; fullName: string; permissions: string[] }): Promise<ActionResult<{ tempPassword?: string }>> {
  const v = await superadmin("usuarios");
  if (!v) return DENIED;
  const p = z.object({ email: z.email({ error: "Correo inválido." }), fullName: z.string().trim().min(2, { error: "Ingresá el nombre." }).max(100), permissions: permissionsSchema }).safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Datos inválidos." };
  try {
    const u = await findOrCreateUser(v.id, p.data.email.toLowerCase(), p.data.fullName);
    await asUser(v.id, async (db) => {
      await db.exec(`update profiles set platform_role = 'superadmin', platform_permissions = $2 where id = $1`, [u.userId, p.data.permissions]);
      await db.exec(`select log_action(null, 'roles.superadmin.otorgado', 'profiles', $1, $2)`, [u.userId, JSON.stringify({ permisos: p.data.permissions })]);
    });
    revalidatePath("/backoffice/usuarios");
    return { ok: true, data: { tempPassword: u.tempPassword }, message: u.tempPassword ? "Superadmin creado." : "La cuenta ya existía: se le otorgaron los permisos elegidos." };
  } catch (e) {
    return { ok: false, error: dbErrorMessage(e) };
  }
}

export async function updateSuperadminAction(input: { userId: string; permissions: string[]; revoke?: boolean }): Promise<ActionResult> {
  const v = await superadmin("usuarios");
  if (!v) return DENIED;
  if (!z.uuid().safeParse(input.userId).success) return { ok: false, error: "Usuario inválido." };
  const self = input.userId === v.id;
  if (self && input.revoke) return { ok: false, error: "No podés quitarte tu propio acceso." };
  let perms: string[] = [];
  if (!input.revoke) {
    const p = permissionsSchema.safeParse(input.permissions);
    if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Permisos inválidos." };
    perms = p.data;
    if (self && !perms.includes("usuarios")) return { ok: false, error: "No podés quitarte el permiso de Usuarios a vos mismo." };
  }
  try {
    await asUser(v.id, async (db) => {
      await db.exec(`update profiles set platform_role = $2, platform_permissions = $3 where id = $1`, [input.userId, input.revoke ? null : "superadmin", perms]);
      await db.exec(`select log_action(null, $1, 'profiles', $2, $3)`, [input.revoke ? "roles.superadmin.revocado" : "roles.superadmin.permisos", input.userId, JSON.stringify({ permisos: perms })]);
    });
    return done("/backoffice/usuarios", input.revoke ? "Acceso de GAVIA revocado." : "Permisos actualizados.");
  } catch (e) {
    return { ok: false, error: dbErrorMessage(e) };
  }
}

export async function resetPasswordAction(input: { userId: string }): Promise<ActionResult<{ tempPassword?: string }>> {
  const v = await superadmin("usuarios");
  if (!v) return DENIED;
  if (!z.uuid().safeParse(input.userId).success) return { ok: false, error: "Usuario inválido." };
  try {
    const exists = await asUser(v.id, (db) => db.one(`select id from profiles where id = $1`, [input.userId]));
    if (!exists) return { ok: false, error: "El usuario no existe." };
    const tempPassword = await resetUserPassword(input.userId);
    await asUser(v.id, (db) => db.exec(`select log_action(null, 'usuarios.clave_blanqueada', 'profiles', $1, '{}'::jsonb)`, [input.userId]));
    return { ok: true, data: { tempPassword }, message: "Contraseña temporal generada." };
  } catch (e) {
    return { ok: false, error: dbErrorMessage(e) };
  }
}

/** Corrige el correo de ingreso de un usuario (balneario o GAVIA). */
export async function updateUserEmailAction(input: { userId: string; email: string }): Promise<ActionResult> {
  const v = await superadmin("usuarios");
  if (!v) return DENIED;
  const p = z.object({ userId: z.uuid(), email: z.email({ error: "Correo inválido." }) }).safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Datos inválidos." };
  const email = p.data.email.toLowerCase();
  try {
    const current = await asUser(v.id, (db) => db.one<{ email: string }>(`select email from profiles where id = $1`, [p.data.userId]));
    if (!current) return { ok: false, error: "El usuario no existe." };
    if (current.email === email) return { ok: true, message: "Sin cambios." };
    const taken = await asUser(v.id, (db) => db.one<{ id: string | null }>(`select find_profile_id_by_email($1) as id`, [email]));
    if (taken?.id) return { ok: false, error: "Ya existe otro usuario con ese correo." };
    await updateUserEmail(p.data.userId, email);
    await asUser(v.id, (db) => db.exec(`select log_action(null, 'usuarios.correo_cambiado', 'profiles', $1, $2)`, [p.data.userId, JSON.stringify({ anterior: current.email, nuevo: email })]));
    return done("/backoffice/usuarios", "Correo actualizado. La persona ingresa con el correo nuevo.");
  } catch (e) {
    return { ok: false, error: dbErrorMessage(e) };
  }
}

/** Define una contraseña elegida por el superadmin (para la propia, usar "Cambiar contraseña"). */
export async function setUserPasswordAction(input: { userId: string; password: string }): Promise<ActionResult> {
  const v = await superadmin("usuarios");
  if (!v) return DENIED;
  const p = z.object({ userId: z.uuid(), password: z.string().min(10, { error: "La contraseña debe tener al menos 10 caracteres." }).max(72) }).safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Datos inválidos." };
  if (p.data.userId === v.id) return { ok: false, error: "Para tu propia contraseña usá “Cambiar contraseña”." };
  try {
    const exists = await asUser(v.id, (db) => db.one(`select id from profiles where id = $1`, [p.data.userId]));
    if (!exists) return { ok: false, error: "El usuario no existe." };
    await setUserPassword(p.data.userId, p.data.password);
    // Solo se registra el hecho, nunca la contraseña.
    await asUser(v.id, (db) => db.exec(`select log_action(null, 'usuarios.clave_definida', 'profiles', $1, '{}'::jsonb)`, [p.data.userId]));
    return { ok: true, message: "Contraseña actualizada. Comunicala por un medio seguro." };
  } catch (e) {
    return { ok: false, error: dbErrorMessage(e) };
  }
}
const leadSchema = z.object({
  businessName: z.string().trim().min(2, { error: "Ingresá el nombre del establecimiento." }).max(120),
  contactName: z.string().trim().max(100),
  phone: z.string().trim().max(40),
  email: z.union([z.literal(""), z.email({ error: "Correo inválido." })]),
  city: z.string().trim().max(100),
  source: z.string().trim().max(100),
  notes: z.string().trim().max(2000),
});

export async function createLeadAction(input: z.input<typeof leadSchema>): Promise<ActionResult> {
  const v = await superadmin("crm");
  if (!v) return DENIED;
  const p = leadSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Datos inválidos." };
  const d = p.data;
  try {
    await asUser(v.id, (db) =>
      db.exec(`insert into leads (business_name, contact_name, phone, email, city, source, notes, assigned_to) values ($1, $2, $3, $4, $5, $6, $7, auth.uid())`,
        [d.businessName, d.contactName, d.phone, d.email, d.city, d.source, d.notes]),
    );
    return done("/backoffice/crm", "Prospecto creado.");
  } catch (e) {
    return { ok: false, error: dbErrorMessage(e) };
  }
}

export async function updateLeadStageAction(input: { id: string; stage: string }): Promise<ActionResult> {
  const v = await superadmin("crm");
  if (!v) return DENIED;
  const p = z.object({ id: z.uuid(), stage: z.enum(["prospecto", "contactado", "demo", "propuesta", "ganado", "perdido"]) }).safeParse(input);
  if (!p.success) return { ok: false, error: "Datos inválidos." };
  try {
    await asUser(v.id, (db) => db.exec(`update leads set stage = $2 where id = $1`, [p.data.id, p.data.stage]));
    return done("/backoffice/crm");
  } catch (e) {
    return { ok: false, error: dbErrorMessage(e) };
  }
}

export async function addLeadInteractionAction(input: { leadId: string; kind: string; summary: string }): Promise<ActionResult> {
  const v = await superadmin("crm");
  if (!v) return DENIED;
  const p = z.object({ leadId: z.uuid(), kind: z.enum(["llamada", "whatsapp", "email", "reunion", "nota"]), summary: z.string().trim().min(2).max(1000) }).safeParse(input);
  if (!p.success) return { ok: false, error: "Escribí un resumen." };
  try {
    await asUser(v.id, (db) => db.exec(`insert into interactions (scope, lead_id, kind, summary, created_by) values ('gavia', $1, $2, $3, auth.uid())`, [p.data.leadId, p.data.kind, p.data.summary]));
    return done("/backoffice/crm");
  } catch (e) {
    return { ok: false, error: dbErrorMessage(e) };
  }
}

/**
 * Emite la facturación del plan contratado: de contado (con 5 % de descuento)
 * o en cuotas mensuales. El importe sale del precio del plan de la suscripción.
 */
export async function createInvoiceAction(input: { balnearioId: string; mode: string; installments: string; dueDate: string }): Promise<ActionResult> {
  const v = await superadmin("facturacion");
  if (!v) return DENIED;
  const p = z
    .object({
      balnearioId: z.uuid({ error: "Elegí un balneario." }),
      mode: z.enum(["contado", "cuotas"]),
      installments: z.coerce.number().int().min(1).max(12),
      dueDate: z.string().refine(isISODate, { error: "Vencimiento inválido." }),
    })
    // "Cantidad de cuotas" solo se envía en la modalidad en cuotas.
    .safeParse({ ...input, installments: input.mode === "cuotas" ? input.installments : "1" });
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Datos inválidos." };
  const d = p.data;
  try {
    const n = await asUser(v.id, async (db) => {
      const sub = await db.one<{ id: string; price_cents: number; currency: string; plan: string }>(
        `select s.id, s.price_cents, s.currency, pl.name as plan from subscriptions s join plans pl on pl.id = s.plan_id
          where s.balneario_id = $1 order by s.created_at desc limit 1`,
        [d.balnearioId],
      );
      if (!sub || sub.price_cents <= 0) throw Object.assign(new Error(), { code: "P0001", message: "El balneario no tiene un plan con precio definido." });
      if (d.mode === "contado") {
        const total = Math.round(sub.price_cents * (1 - FULL_PAYMENT_DISCOUNT));
        await db.exec(
          `insert into gavia_invoices (balneario_id, subscription_id, concept, amount_cents, currency, due_date, installment_no, installments)
           values ($1, $2, $3, $4, $5, $6, 1, 1)`,
          [d.balnearioId, sub.id, `Plan ${sub.plan} — pago total (5 % de descuento)`, total, sub.currency, d.dueDate],
        );
        return 1;
      }
      const parts = splitInstallments(sub.price_cents, d.installments);
      for (const [i, amount] of parts.entries()) {
        await db.exec(
          `insert into gavia_invoices (balneario_id, subscription_id, concept, amount_cents, currency, due_date, installment_no, installments)
           values ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [d.balnearioId, sub.id, `Plan ${sub.plan} — cuota ${i + 1} de ${parts.length}`, amount, sub.currency, addMonths(d.dueDate, i), i + 1, parts.length],
        );
      }
      return parts.length;
    });
    return done("/backoffice/facturacion", n === 1 ? "Factura emitida." : `${n} cuotas emitidas.`);
  } catch (e) {
    return { ok: false, error: dbErrorMessage(e) };
  }
}

export async function registerGaviaPaymentAction(input: { invoiceId: string; method: string; reference: string }): Promise<ActionResult> {
  const v = await superadmin("facturacion");
  if (!v) return DENIED;
  const p = z.object({ invoiceId: z.uuid(), method: z.enum(["transferencia", "mercadopago", "efectivo", "otro"]), reference: z.string().trim().max(120) }).safeParse(input);
  if (!p.success) return { ok: false, error: "Datos inválidos." };
  try {
    const balnearioId = await asUser(v.id, async (db) => {
      const inv = await db.one<{ balneario_id: string; amount_cents: number; status: string; currency: string; installment_no: number | null }>(`select balneario_id, amount_cents, status, currency, installment_no from gavia_invoices where id = $1 for update`, [p.data.invoiceId]);
      if (!inv || !["emitida", "vencida"].includes(inv.status)) throw Object.assign(new Error(), { code: "P0001", message: "La factura no está pendiente de pago." });
      await db.exec(`insert into gavia_payments (invoice_id, balneario_id, amount_cents, currency, method, reference, created_by) values ($1, $2, $3, $4, $5, $6, auth.uid())`,
        [p.data.invoiceId, inv.balneario_id, inv.amount_cents, inv.currency, p.data.method, p.data.reference]);
      await db.exec(`update gavia_invoices set status = 'pagada', paid_at = now() where id = $1`, [p.data.invoiceId]);
      return { balnearioId: inv.balneario_id, opensPeriod: (inv.installment_no ?? 1) === 1 };
    });
    // El pago total o la primera cuota abre un año de plan: activa (o reactiva) el balneario y,
    // si renueva antes de vencer, el año nuevo empieza al terminar el vigente.
    // Se aplica con privilegios de servicio porque Facturación no requiere el permiso de Balnearios.
    const activated = !balnearioId.opensPeriod ? false : await asService(async (db) => {
      await db.exec(
        `update subscriptions set
            current_period_start = case when status = 'activa' and current_period_end >= current_date then current_period_end else current_date end,
            current_period_end = case when status = 'activa' and current_period_end >= current_date then current_period_end else current_date end + 365,
            status = 'activa'
          where id = (select id from subscriptions where balneario_id = $1 order by created_at desc limit 1)`,
        [balnearioId.balnearioId],
      );
      const r = await db.one<{ id: string }>(`update balnearios set status = 'activo' where id = $1 and status <> 'activo' returning id`, [balnearioId.balnearioId]);
      await db.exec(`insert into audit_log (balneario_id, actor_id, action, entity, entity_id, data) values ($1, $2, $3, 'balnearios', $1, '{}')`,
        [balnearioId.balnearioId, v.id, r ? "balnearios.activado_por_pago" : "suscripciones.renovada"]);
      return !!r;
    });
    return done("/backoffice/facturacion", activated ? "Pago registrado. El balneario pasó a ACTIVO." : "Pago registrado.");
  } catch (e) {
    return { ok: false, error: dbErrorMessage(e) };
  }
}

export async function updateSubscriptionAction(input: { id: string; status: string; planId: string; periodEnd: string }): Promise<ActionResult> {
  const v = await superadmin("suscripciones");
  if (!v) return DENIED;
  const p = z.object({ id: z.uuid(), status: z.enum(["prueba", "activa", "vencida", "cancelada"]), planId: z.uuid(), periodEnd: z.string().refine(isISODate) }).safeParse(input);
  if (!p.success) return { ok: false, error: "Datos inválidos." };
  try {
    await asUser(v.id, (db) =>
      db.exec(`update subscriptions set status = $2, plan_id = $3, current_period_end = $4, price_cents = (select price_cents from plans where id = $3) where id = $1`,
        [p.data.id, p.data.status, p.data.planId, p.data.periodEnd]),
    );
    return done("/backoffice/suscripciones", "Suscripción actualizada.");
  } catch (e) {
    return { ok: false, error: dbErrorMessage(e) };
  }
}

export async function updatePlanAction(input: { id: string; name: string; description: string; price: string; active: boolean; features: string }): Promise<ActionResult> {
  const v = await superadmin("planes");
  if (!v) return DENIED;
  const p = z.object({ id: z.uuid(), name: z.string().trim().min(2).max(60), description: z.string().trim().max(300), price: money, active: z.boolean(), features: z.string().max(2000) }).safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Datos inválidos." };
  const features = p.data.features.split("\n").map((s) => s.trim()).filter(Boolean);
  try {
    await asUser(v.id, (db) =>
      db.exec(`update plans set name = $2, description = $3, price_cents = $4, active = $5, features = $6 where id = $1`,
        [p.data.id, p.data.name, p.data.description, p.data.price, p.data.active, JSON.stringify(features)]),
    );
    return done("/backoffice/planes", "Plan actualizado.");
  } catch (e) {
    return { ok: false, error: dbErrorMessage(e) };
  }
}
