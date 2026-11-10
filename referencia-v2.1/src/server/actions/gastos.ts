"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { asUser, dbErrorMessage } from "@/server/db";
import { tenantForAction } from "@/server/auth/context";
import { parseMoney } from "@/lib/money";
import { isISODate } from "@/lib/dates";
import type { ActionResult } from "@/lib/utils";

/** Gastos: solo el dueño (también lo exige RLS en expense_categories y expenses). */
async function owner() {
  const t = await tenantForAction(["owner"]);
  return t && t.role === "owner" ? t : null;
}
const DENIED = { ok: false as const, error: "Solo el dueño del balneario gestiona los gastos." };

function done(message?: string): ActionResult {
  revalidatePath("/owner", "layout");
  return { ok: true, message };
}

export async function createCategoryAction(input: { name: string }): Promise<ActionResult> {
  const t = await owner();
  if (!t) return DENIED;
  const p = z.object({ name: z.string().trim().min(2, { error: "Ingresá un nombre." }).max(60) }).safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Datos inválidos." };
  try {
    await asUser(t.viewer.id, (db) => db.exec(`insert into expense_categories (balneario_id, name) values ($1, $2)`, [t.balnearioId, p.data.name]));
    return done("Categoría creada.");
  } catch (e) {
    return { ok: false, error: dbErrorMessage(e) };
  }
}

export async function renameCategoryAction(input: { id: string; name: string }): Promise<ActionResult> {
  const t = await owner();
  if (!t) return DENIED;
  const p = z.object({ id: z.uuid(), name: z.string().trim().min(2).max(60) }).safeParse(input);
  if (!p.success) return { ok: false, error: "Nombre inválido." };
  try {
    await asUser(t.viewer.id, (db) => db.exec(`update expense_categories set name = $3 where id = $1 and balneario_id = $2`, [p.data.id, t.balnearioId, p.data.name]));
    return done("Categoría actualizada.");
  } catch (e) {
    return { ok: false, error: dbErrorMessage(e) };
  }
}

export async function deleteCategoryAction(input: { id: string }): Promise<ActionResult> {
  const t = await owner();
  if (!t) return DENIED;
  if (!z.uuid().safeParse(input.id).success) return { ok: false, error: "Categoría inválida." };
  try {
    const cat = await asUser(t.viewer.id, (db) => db.one<{ kind: string }>(`select kind from expense_categories where id = $1`, [input.id]));
    if (cat?.kind === "sueldos") return { ok: false, error: "La categoría Sueldos es predeterminada y no se puede eliminar." };
    const used = await asUser(t.viewer.id, (db) => db.one(`select 1 from expenses where category_id = $1 limit 1`, [input.id]));
    if (used) return { ok: false, error: "La categoría tiene gastos cargados: no se puede eliminar." };
    await asUser(t.viewer.id, (db) => db.exec(`delete from expense_categories where id = $1 and balneario_id = $2`, [input.id, t.balnearioId]));
    return done("Categoría eliminada.");
  } catch (e) {
    return { ok: false, error: dbErrorMessage(e) };
  }
}

const expenseSchema = z.object({
  categoryId: z.uuid({ error: "Elegí una categoría." }),
  spentOn: z.string().refine(isISODate, { error: "Fecha inválida." }),
  amount: z.string(),
  paymentMethod: z.enum(["efectivo", "transferencia", "tarjeta", "otro"]),
  description: z.string().trim().max(300),
  employeeId: z.string().optional(),
});

export async function createExpenseAction(input: z.input<typeof expenseSchema>): Promise<ActionResult> {
  const t = await owner();
  if (!t) return DENIED;
  const p = expenseSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Datos inválidos." };
  const cents = parseMoney(p.data.amount);
  if (cents === null || cents <= 0) return { ok: false, error: "Ingresá un importe válido, por ejemplo 150000 o 150.000,50." };
  const employeeId = p.data.employeeId && z.uuid().safeParse(p.data.employeeId).success ? p.data.employeeId : null;
  try {
    await asUser(t.viewer.id, async (db) => {
      const cat = await db.one<{ kind: string }>(`select kind from expense_categories where id = $1 and balneario_id = $2`, [p.data.categoryId, t.balnearioId]);
      if (!cat) throw Object.assign(new Error(), { code: "P0001", message: "Categoría inválida." });
      if (cat.kind === "sueldos" && !employeeId) throw Object.assign(new Error(), { code: "P0001", message: "Elegí el empleado al que corresponde el sueldo." });
      await db.exec(
        `insert into expenses (balneario_id, category_id, spent_on, amount_cents, description, payment_method, created_by, employee_id)
         values ($1, $2, $3, $4, $5, $6, auth.uid(), $7)`,
        [t.balnearioId, p.data.categoryId, p.data.spentOn, cents, p.data.description, p.data.paymentMethod, cat.kind === "sueldos" ? employeeId : null],
      );
    });
    return done("Gasto registrado.");
  } catch (e) {
    return { ok: false, error: dbErrorMessage(e) };
  }
}

export async function deleteExpenseAction(input: { id: string }): Promise<ActionResult> {
  const t = await owner();
  if (!t) return DENIED;
  if (!z.uuid().safeParse(input.id).success) return { ok: false, error: "Gasto inválido." };
  try {
    await asUser(t.viewer.id, (db) => db.exec(`delete from expenses where id = $1 and balneario_id = $2`, [input.id, t.balnearioId]));
    return done("Gasto eliminado.");
  } catch (e) {
    return { ok: false, error: dbErrorMessage(e) };
  }
}

const employeeSchema = z.object({
  fullName: z.string().trim().min(2, { error: "Ingresá el nombre del empleado." }).max(100),
  phone: z.string().trim().max(40),
  bank: z.string().trim().max(80),
  accountHolder: z.string().trim().max(100),
  cbu: z.string().transform((v) => v.replace(/\D/g, "")).refine((v) => v === "" || v.length === 22, { error: "El CBU/CVU tiene 22 números." }),
  alias: z.string().trim().max(40),
});

/** Empleados para registrar sueldos (con su cuenta bancaria). Solo el dueño. */
export async function saveEmployeeAction(input: z.input<typeof employeeSchema> & { id?: string }): Promise<ActionResult> {
  const t = await owner();
  if (!t) return DENIED;
  const p = employeeSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Datos inválidos." };
  const d = p.data;
  const id = input.id && z.uuid().safeParse(input.id).success ? input.id : null;
  try {
    await asUser(t.viewer.id, (db) =>
      id
        ? db.exec(
            `update employees set full_name = $3, phone = $4, bank = $5, account_holder = $6, cbu = $7, alias = $8 where id = $1 and balneario_id = $2`,
            [id, t.balnearioId, d.fullName, d.phone, d.bank, d.accountHolder, d.cbu, d.alias],
          )
        : db.exec(
            `insert into employees (balneario_id, full_name, phone, bank, account_holder, cbu, alias) values ($1, $2, $3, $4, $5, $6, $7)`,
            [t.balnearioId, d.fullName, d.phone, d.bank, d.accountHolder, d.cbu, d.alias],
          ),
    );
    return done(id ? "Empleado actualizado." : "Empleado agregado.");
  } catch (e) {
    return { ok: false, error: dbErrorMessage(e) };
  }
}

export async function setEmployeeActiveAction(input: { id: string; active: boolean }): Promise<ActionResult> {
  const t = await owner();
  if (!t) return DENIED;
  if (!z.uuid().safeParse(input.id).success) return { ok: false, error: "Empleado inválido." };
  try {
    await asUser(t.viewer.id, (db) => db.exec(`update employees set active = $3 where id = $1 and balneario_id = $2`, [input.id, t.balnearioId, !!input.active]));
    return done(input.active ? "Empleado reactivado." : "Empleado dado de baja. Sus sueldos cargados se conservan.");
  } catch (e) {
    return { ok: false, error: dbErrorMessage(e) };
  }
}