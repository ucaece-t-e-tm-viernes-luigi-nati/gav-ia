"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { asUser, dbErrorMessage } from "@/server/db";
import { tenantForAction, tenantWithModule } from "@/server/auth/context";
import { hasModule } from "@/lib/plan";
import { createReservation, insertManualPayment, listCustomerOptions } from "@/server/repos/reservas";
import { listFreeUnits } from "@/server/repos/plano";
import { parseMoney } from "@/lib/money";
import { isISODate } from "@/lib/dates";
import type { ActionResult } from "@/lib/utils";

const NO_SESSION = { ok: false as const, error: "No se pudo guardar: tu sesión expiró o la cuenta del balneario está en solo lectura." };
const NO_MODULE = { ok: false as const, error: "Esta función no está incluida en el plan del balneario." };
const MANUAL_METHODS = ["efectivo", "transferencia", "tarjeta", "otro"] as const;

function revalidateOps() {
  revalidatePath("/empresa", "layout");
}

const date = z.string().refine(isISODate, { error: "Fecha inválida." });
const money = z.string().transform((v, ctx) => {
  const c = parseMoney(v);
  if (c === null) ctx.addIssue({ code: "custom", message: "Importe inválido. Usá números, por ejemplo 150000 o 150.000,50." });
  return c ?? 0;
});

const newCustomer = z.object({
  firstName: z.string().trim().min(1, { error: "Ingresá el nombre del cliente." }).max(80),
  lastName: z.string().trim().max(80),
  phone: z.string().trim().max(40),
  email: z.union([z.literal(""), z.email({ error: "Correo inválido." })]),
});

const createSchema = z
  .object({
    unitIds: z.array(z.uuid()).min(1, { error: "Seleccioná al menos una unidad." }).max(10),
    startDate: date,
    endDate: date,
    customerId: z.uuid().nullable(),
    newCustomer: newCustomer.nullable(),
    /** Carpa compartida: segundo cliente (existente o nuevo). */
    coCustomerId: z.uuid().nullable().optional(),
    coNewCustomer: newCustomer.nullable().optional(),
    total: money,
    status: z.enum(["pendiente", "confirmada"]),
    paymentMode: z.enum(["ninguno", "parcial", "total"]),
    paymentAmount: z.string(),
    paymentMethod: z.enum(MANUAL_METHODS),
    notes: z.string().trim().max(1000),
  })
  .refine((v) => v.endDate >= v.startDate, { error: "La fecha de fin debe ser igual o posterior al inicio.", path: ["endDate"] })
  .refine((v) => v.customerId || v.newCustomer, { error: "Elegí un cliente existente o cargá uno nuevo.", path: ["customerId"] });

export type CreateReservationInput = z.input<typeof createSchema>;

export async function createReservationAction(input: CreateReservationInput): Promise<ActionResult<{ id: string; number: number }>> {
  const t = await tenantForAction(["owner", "staff"]);
  if (!t) return NO_SESSION;
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const v = parsed.data;

  if (v.paymentMode !== "ninguno" && !hasModule(t.modules, "pagos")) return NO_MODULE;
  let paymentCents = 0;
  if (v.paymentMode === "total") paymentCents = v.total;
  if (v.paymentMode === "parcial") {
    const p = parseMoney(v.paymentAmount);
    if (p === null || p <= 0) return { ok: false, error: "Ingresá el importe del pago parcial." };
    if (p > v.total) return { ok: false, error: "El pago no puede superar el importe total de la reserva." };
    paymentCents = p;
  }

  try {
    const res = await asUser(t.viewer.id, async (db) => {
      let customerId = v.customerId;
      if (!customerId && v.newCustomer) {
        const c = await db.one<{ id: string }>(
          `insert into customers (balneario_id, first_name, last_name, phone, whatsapp, email) values ($1, $2, $3, $4, $4, $5) returning id`,
          [t.balnearioId, v.newCustomer.firstName, v.newCustomer.lastName, v.newCustomer.phone, v.newCustomer.email],
        );
        customerId = c!.id;
      }
      let coCustomerId = v.coCustomerId ?? null;
      if (!coCustomerId && v.coNewCustomer) {
        const c = await db.one<{ id: string }>(
          `insert into customers (balneario_id, first_name, last_name, phone, whatsapp, email) values ($1, $2, $3, $4, $4, $5) returning id`,
          [t.balnearioId, v.coNewCustomer.firstName, v.coNewCustomer.lastName, v.coNewCustomer.phone, v.coNewCustomer.email],
        );
        coCustomerId = c!.id;
      }
      return createReservation(db, t.balnearioId, {
        coCustomerIds: coCustomerId ? [coCustomerId] : [],
        customerId: customerId!, unitIds: v.unitIds, startDate: v.startDate, endDate: v.endDate, totalCents: v.total,
        status: v.status, notes: v.notes, payment: paymentCents ? { amountCents: paymentCents, method: v.paymentMethod } : null,
      });
    });
    revalidateOps();
    return { ok: true, data: res, message: `Reserva #${res.number} creada.` };
  } catch (e) {
    return { ok: false, error: dbErrorMessage(e) };
  }
}

const updateSchema = z
  .object({ id: z.uuid(), startDate: date, endDate: date, total: money, status: z.enum(["pendiente", "confirmada", "finalizada"]), notes: z.string().trim().max(1000) })
  .refine((v) => v.endDate >= v.startDate, { error: "La fecha de fin debe ser igual o posterior al inicio." });

export async function updateReservationAction(input: z.input<typeof updateSchema>): Promise<ActionResult> {
  const t = await tenantForAction(["owner", "staff"]);
  if (!t) return NO_SESSION;
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const v = parsed.data;
  try {
    const row = await asUser(t.viewer.id, (db) =>
      db.one(
        `update reservations set start_date = $3, end_date = $4, total_cents = $5, status = $6, notes = $7
          where id = $1 and balneario_id = $2 and status <> 'cancelada' returning id`,
        [v.id, t.balnearioId, v.startDate, v.endDate, v.total, v.status, v.notes],
      ),
    );
    if (!row) return { ok: false, error: "La reserva no existe, está cancelada o no tenés acceso." };
    revalidateOps();
    return { ok: true, message: "Reserva actualizada." };
  } catch (e) {
    return { ok: false, error: dbErrorMessage(e) };
  }
}

/**
 * Cambia una unidad de la reserva por otra libre en las mismas fechas.
 * Importe, pagos y fechas no se modifican (se cambian aparte si hace falta).
 */
export async function changeReservationUnitAction(input: { reservationId: string; fromUnitId: string; toUnitId: string }): Promise<ActionResult> {
  const t = await tenantForAction(["owner", "staff"]);
  if (!t) return NO_SESSION;
  const p = z.object({ reservationId: z.uuid(), fromUnitId: z.uuid(), toUnitId: z.uuid() }).safeParse(input);
  if (!p.success) return { ok: false, error: "Elegí la unidad actual y la nueva." };
  if (p.data.fromUnitId === p.data.toUnitId) return { ok: false, error: "La unidad nueva es la misma que la actual." };
  try {
    const res = await asUser(t.viewer.id, async (db) => {
      const r = await db.one<{ status: string }>(`select status from reservations where id = $1 and balneario_id = $2`, [p.data.reservationId, t.balnearioId]);
      if (!r || r.status === "cancelada") throw Object.assign(new Error(), { code: "P0001", message: "La reserva no existe o está cancelada." });
      const units = await db.many<{ id: string; code: string }>(`select id, code from units where balneario_id = $1 and id = any($2::uuid[])`, [t.balnearioId, [p.data.fromUnitId, p.data.toUnitId]]);
      const from = units.find((u) => u.id === p.data.fromUnitId);
      const to = units.find((u) => u.id === p.data.toUnitId);
      if (!from || !to) throw Object.assign(new Error(), { code: "P0001", message: "Unidad inválida." });
      const removed = await db.one(`delete from reservation_units where reservation_id = $1 and unit_id = $2 returning unit_id`, [p.data.reservationId, from.id]);
      if (!removed) throw Object.assign(new Error(), { code: "P0001", message: `${from.code} no pertenece a esta reserva.` });
      // La restricción de exclusión rechaza la unidad nueva si está ocupada en esas fechas.
      await db.exec(`insert into reservation_units (reservation_id, unit_id, balneario_id, period) values ($1, $2, $3, 'empty')`, [p.data.reservationId, to.id, t.balnearioId]);
      await db.exec(`select log_action($1, 'reservations.unidad_cambiada', 'reservations', $2, $3)`, [t.balnearioId, p.data.reservationId, JSON.stringify({ de: from.code, a: to.code })]);
      return { from: from.code, to: to.code };
    });
    revalidateOps();
    return { ok: true, message: `Unidad cambiada: ${res.from} → ${res.to}. El importe y los pagos se mantienen.` };
  } catch (e) {
    return { ok: false, error: dbErrorMessage(e) };
  }
}

export async function cancelReservationAction(input: { id: string; reason: string }): Promise<ActionResult> {
  const t = await tenantForAction(["owner", "staff"]);
  if (!t) return NO_SESSION;
  const parsed = z.object({ id: z.uuid(), reason: z.string().trim().min(3, { error: "Indicá el motivo de la cancelación." }).max(500) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  try {
    const row = await asUser(t.viewer.id, (db) =>
      db.one(
        `update reservations set status = 'cancelada', cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = $3
          where id = $1 and balneario_id = $2 and status <> 'cancelada' returning id`,
        [parsed.data.id, t.balnearioId, parsed.data.reason],
      ),
    );
    if (!row) return { ok: false, error: "La reserva no existe o ya estaba cancelada." };
    revalidateOps();
    return { ok: true, message: "Reserva cancelada. La unidad quedó liberada para esas fechas." };
  } catch (e) {
    return { ok: false, error: dbErrorMessage(e) };
  }
}

/**
 * Elimina una reserva cargada por error. El cliente queda en el listado de contactos.
 * Si tiene cobros registrados no se elimina (se cancela), para conservar el historial de pagos.
 */
export async function deleteReservationAction(input: { id: string }): Promise<ActionResult> {
  const t = await tenantForAction(["owner", "staff"]);
  if (!t) return NO_SESSION;
  if (!z.uuid().safeParse(input.id).success) return { ok: false, error: "Reserva inválida." };
  try {
    const res = await asUser(t.viewer.id, async (db) => {
      const r = await db.one<{ number: number }>(`select number from reservations where id = $1 and balneario_id = $2 for update`, [input.id, t.balnearioId]);
      if (!r) return null;
      const paid = await db.one<{ n: number }>(`select count(*)::int as n from payments where reservation_id = $1`, [input.id]);
      if (paid && paid.n > 0) {
        throw Object.assign(new Error(), { code: "P0001", message: "La reserva tiene cobros registrados: no se puede eliminar para no perder el historial de pagos. Podés cancelarla." });
      }
      await db.exec(`delete from reservations where id = $1 and balneario_id = $2`, [input.id, t.balnearioId]);
      return r;
    });
    if (!res) return { ok: false, error: "La reserva no existe o no tenés acceso." };
    revalidateOps();
    return { ok: true, message: `Reserva #${res.number} eliminada. El cliente sigue en el listado de clientes.` };
  } catch (e) {
    return { ok: false, error: dbErrorMessage(e) };
  }
}

/** Carpa compartida: suma un cliente (existente o nuevo) a la reserva. */
export async function addCoHolderAction(input: { reservationId: string; customerId?: string | null; newCustomer?: z.input<typeof newCustomer> | null }): Promise<ActionResult> {
  const t = await tenantForAction(["owner", "staff"]);
  if (!t) return NO_SESSION;
  const p = z.object({ reservationId: z.uuid(), customerId: z.uuid().nullable().optional(), newCustomer: newCustomer.nullable().optional() }).safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Datos inválidos." };
  if (!p.data.customerId && !p.data.newCustomer) return { ok: false, error: "Elegí un cliente existente o cargá uno nuevo." };
  try {
    await asUser(t.viewer.id, async (db) => {
      const r = await db.one<{ status: string }>(`select status from reservations where id = $1 and balneario_id = $2`, [p.data.reservationId, t.balnearioId]);
      if (!r || r.status === "cancelada") throw Object.assign(new Error(), { code: "P0001", message: "La reserva no existe o está cancelada." });
      let customerId = p.data.customerId ?? null;
      if (!customerId && p.data.newCustomer) {
        const n = p.data.newCustomer;
        const c = await db.one<{ id: string }>(
          `insert into customers (balneario_id, first_name, last_name, phone, whatsapp, email) values ($1, $2, $3, $4, $4, $5) returning id`,
          [t.balnearioId, n.firstName, n.lastName, n.phone, n.email],
        );
        customerId = c!.id;
      }
      await db.exec(
        `insert into reservation_customers (reservation_id, balneario_id, customer_id) values ($1, $2, $3) on conflict do nothing`,
        [p.data.reservationId, t.balnearioId, customerId],
      );
    });
    revalidateOps();
    return { ok: true, message: "Cliente agregado a la reserva (carpa compartida)." };
  } catch (e) {
    return { ok: false, error: dbErrorMessage(e) };
  }
}

export async function removeCoHolderAction(input: { reservationId: string; customerId: string }): Promise<ActionResult> {
  const t = await tenantForAction(["owner", "staff"]);
  if (!t) return NO_SESSION;
  const p = z.object({ reservationId: z.uuid(), customerId: z.uuid() }).safeParse(input);
  if (!p.success) return { ok: false, error: "Datos inválidos." };
  try {
    await asUser(t.viewer.id, (db) =>
      db.exec(`delete from reservation_customers where reservation_id = $1 and customer_id = $2 and balneario_id = $3`, [p.data.reservationId, p.data.customerId, t.balnearioId]),
    );
    revalidateOps();
    return { ok: true, message: "Cliente quitado de la reserva. Sigue en el listado de clientes." };
  } catch (e) {
    return { ok: false, error: dbErrorMessage(e) };
  }
}

export async function registerPaymentAction(input: { reservationId: string; amount: string; method: string; notes: string }): Promise<ActionResult> {
  const t = await tenantWithModule(["owner", "staff"], "pagos");
  if (!t) return NO_SESSION;
  if (t === "sin-modulo") return NO_MODULE;
  const parsed = z
    .object({ reservationId: z.uuid(), amount: money, method: z.enum(MANUAL_METHODS), notes: z.string().trim().max(300) })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const v = parsed.data;
  if (v.amount <= 0) return { ok: false, error: "El importe debe ser mayor a cero." };
  try {
    await asUser(t.viewer.id, async (db) => {
      const r = await db.one<{ balance_cents: number; status: string }>(
        `select balance_cents, status from reservations where id = $1 and balneario_id = $2 for update`,
        [v.reservationId, t.balnearioId],
      );
      if (!r) throw Object.assign(new Error("Reserva inexistente"), { code: "P0001", message: "La reserva no existe o no tenés acceso." });
      if (r.status === "cancelada") throw Object.assign(new Error(), { code: "P0001", message: "No se pueden registrar cobros en una reserva cancelada." });
      if (v.amount > r.balance_cents) throw Object.assign(new Error(), { code: "P0001", message: "El importe supera el saldo pendiente de la reserva." });
      await insertManualPayment(db, t.balnearioId, v.reservationId, v.amount, v.method, v.notes);
    });
    revalidateOps();
    return { ok: true, message: "Cobro registrado." };
  } catch (e) {
    return { ok: false, error: dbErrorMessage(e) };
  }
}

/** Solo el dueño puede anular un cobro (corrección). Queda auditado. */
export async function voidPaymentAction(input: { paymentId: string; reason: string }): Promise<ActionResult> {
  const t = await tenantWithModule(["owner"], "pagos");
  if (t === "sin-modulo") return NO_MODULE;
  if (!t || t.role !== "owner") return { ok: false, error: "Solo el dueño del balneario puede anular cobros." };
  const parsed = z.object({ paymentId: z.uuid(), reason: z.string().trim().min(3, { error: "Indicá el motivo." }).max(300) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  try {
    const row = await asUser(t.viewer.id, (db) =>
      db.one(
        `update payments set status = 'anulado', voided_at = now(), voided_by = auth.uid(), void_reason = $3
          where id = $1 and balneario_id = $2 and status = 'aprobado' returning id`,
        [parsed.data.paymentId, t.balnearioId, parsed.data.reason],
      ),
    );
    if (!row) return { ok: false, error: "El cobro no existe o ya estaba anulado." };
    revalidateOps();
    return { ok: true, message: "Cobro anulado." };
  } catch (e) {
    return { ok: false, error: dbErrorMessage(e) };
  }
}

export async function searchCustomersAction(q: string) {
  const t = await tenantForAction(["owner", "staff"]);
  if (!t || q.trim().length < 2) return [];
  return asUser(t.viewer.id, (db) => listCustomerOptions(db, t.balnearioId, q.trim().slice(0, 60)));
}

export async function freeUnitsAction(from: string, to: string) {
  const t = await tenantForAction(["owner", "staff"]);
  if (!t || !isISODate(from) || !isISODate(to) || to < from) return [];
  return asUser(t.viewer.id, (db) => listFreeUnits(db, t.balnearioId, from, to));
}
