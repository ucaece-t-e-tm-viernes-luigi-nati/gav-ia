"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { asUser, dbErrorMessage } from "@/server/db";
import { tenantForAction } from "@/server/auth/context";
import type { ActionResult } from "@/lib/utils";

const customerSchema = z.object({
  id: z.uuid().nullable(),
  firstName: z.string().trim().min(1, { error: "El nombre es obligatorio." }).max(80),
  lastName: z.string().trim().max(80),
  phone: z.string().trim().max(40),
  whatsapp: z.string().trim().max(40),
  email: z.union([z.literal(""), z.email({ error: "Correo inválido." })]),
  documentId: z.string().trim().max(30).optional(),
  address: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(2000),
});

export async function saveCustomerAction(input: z.input<typeof customerSchema>): Promise<ActionResult<{ id: string }>> {
  const t = await tenantForAction(["owner", "staff"]);
  if (!t) return { ok: false, error: "No se pudo guardar: tu sesión expiró o la cuenta del balneario está en solo lectura." };
  const parsed = customerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const v = parsed.data;
  const owner = t.role === "owner";
  try {
    const row = await asUser(t.viewer.id, (db) =>
      v.id
        ? db.one<{ id: string }>(
            `update customers set first_name = $3, last_name = $4, phone = $5, whatsapp = $6, email = $7, notes = $8,
                    document_id = case when $11 then $9 else document_id end, address = case when $11 then $10 else address end
              where id = $1 and balneario_id = $2 returning id`,
            [v.id, t.balnearioId, v.firstName, v.lastName, v.phone, v.whatsapp, v.email, v.notes, v.documentId ?? "", v.address ?? "", owner],
          )
        : db.one<{ id: string }>(
            `insert into customers (balneario_id, first_name, last_name, phone, whatsapp, email, notes, document_id, address)
             values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id`,
            [t.balnearioId, v.firstName, v.lastName, v.phone, v.whatsapp, v.email, v.notes, owner ? (v.documentId ?? "") : "", owner ? (v.address ?? "") : ""],
          ),
    );
    if (!row) return { ok: false, error: "El cliente no existe o no tenés acceso." };
    revalidatePath(`/empresa/clientes`, "layout");
    return { ok: true, data: { id: row.id }, message: "Cliente guardado." };
  } catch (e) {
    return { ok: false, error: dbErrorMessage(e) };
  }
}

export async function addInteractionAction(input: { customerId: string; kind: string; summary: string }): Promise<ActionResult> {
  const t = await tenantForAction(["owner", "staff"]);
  if (!t) return { ok: false, error: "No se pudo guardar: tu sesión expiró o la cuenta del balneario está en solo lectura." };
  const parsed = z
    .object({ customerId: z.uuid(), kind: z.enum(["llamada", "whatsapp", "email", "reunion", "nota"]), summary: z.string().trim().min(2, { error: "Escribí un resumen." }).max(1000) })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  try {
    await asUser(t.viewer.id, (db) =>
      db.exec(
        `insert into interactions (scope, balneario_id, customer_id, kind, summary, created_by)
         select 'balneario', $1, id, $3, $4, auth.uid() from customers where id = $2 and balneario_id = $1`,
        [t.balnearioId, parsed.data.customerId, parsed.data.kind, parsed.data.summary],
      ),
    );
    revalidatePath(`/empresa/clientes/${parsed.data.customerId}`);
    return { ok: true, message: "Interacción registrada." };
  } catch (e) {
    return { ok: false, error: dbErrorMessage(e) };
  }
}
