"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { asUser, dbErrorMessage } from "@/server/db";
import { superadminFor } from "@/server/auth/context";
import type { PlatformPermission } from "@/lib/platform";
import type { ActionResult } from "@/lib/utils";

// CRM comercial de GavIA (de la v2.1). Lo usa /plataforma/crm. La base (RLS platform_can) vuelve a validar.

const superadmin = (permission: PlatformPermission) => superadminFor(permission);
const DENIED = { ok: false as const, error: "Acceso exclusivo del equipo de GavIA." };

function done(path: string, message?: string): ActionResult {
  revalidatePath(path, "layout");
  return { ok: true, message };
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
    return done("/plataforma/crm", "Prospecto creado.");
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
    return done("/plataforma/crm");
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
    return done("/plataforma/crm");
  } catch (e) {
    return { ok: false, error: dbErrorMessage(e) };
  }
}

