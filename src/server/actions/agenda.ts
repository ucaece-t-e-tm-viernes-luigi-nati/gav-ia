"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { asUser, dbErrorMessage } from "@/server/db";
import { superadminFor, tenantForAction } from "@/server/auth/context";
import { isISODate, localToISO } from "@/lib/dates";
import type { ActionResult } from "@/lib/utils";

async function resolveScope(area: "tenant" | "gavia") {
  if (area === "gavia") {
    const v = await superadminFor("calendario");
    return v ? { userId: v.id, scope: "gavia" as const, balnearioId: null, path: "/plataforma" } : null;
  }
  const t = await tenantForAction(["owner", "staff"]);
  return t ? { userId: t.viewer.id, scope: "balneario" as const, balnearioId: t.balnearioId, path: "/empresa" } : null;
}

const schema = z.object({
  area: z.enum(["tenant", "gavia"]),
  type: z.enum(["recordatorio", "evento"]),
  title: z.string().trim().min(2, { error: "Ingresá un título." }).max(150),
  description: z.string().trim().max(1000),
  date: z.string().refine(isISODate, { error: "Fecha inválida." }),
  time: z.string().regex(/^\d{2}:\d{2}$/, { error: "Hora inválida." }),
  kind: z.enum(["cliente", "reserva", "tarea", "comercial"]),
  assignedTo: z.uuid().nullable(),
  relatedId: z.uuid().nullable(),
});

export async function createAgendaItemAction(input: z.input<typeof schema>): Promise<ActionResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const v = parsed.data;
  const s = await resolveScope(v.area);
  if (!s) return { ok: false, error: "No autorizado." };
  if (s.scope === "balneario" && v.kind === "comercial") return { ok: false, error: "Tipo no permitido." };
  const at = localToISO(v.date, v.time);
  try {
    await asUser(s.userId, async (db) => {
      if (v.type === "evento") {
        await db.exec(
          `insert into calendar_events (scope, balneario_id, title, description, starts_at, ends_at, created_by) values ($1, $2, $3, $4, $5, $5::timestamptz + interval '1 hour', auth.uid())`,
          [s.scope, s.balnearioId, v.title, v.description, at],
        );
        return;
      }
      const rel = { customer: null as string | null, reservation: null as string | null, lead: null as string | null };
      if (v.relatedId) {
        if (v.kind === "cliente") rel.customer = v.relatedId;
        if (v.kind === "reserva") rel.reservation = v.relatedId;
        if (v.kind === "comercial") rel.lead = v.relatedId;
      }
      await db.exec(
        `insert into reminders (scope, balneario_id, kind, title, description, due_at, assigned_to, customer_id, reservation_id, lead_id, created_by)
         values ($1, $2, $3, $4, $5, $6, coalesce($7, auth.uid()), $8, $9, $10, auth.uid())`,
        [s.scope, s.balnearioId, v.kind, v.title, v.description, at, v.assignedTo, rel.customer, rel.reservation, rel.lead],
      );
    });
    revalidatePath(s.path, "layout");
    return { ok: true, message: v.type === "evento" ? "Evento creado." : "Recordatorio creado." };
  } catch (e) {
    return { ok: false, error: dbErrorMessage(e) };
  }
}

export async function setReminderStatusAction(input: { area: "tenant" | "gavia"; id: string; status: "pendiente" | "completado" | "cancelado" }): Promise<ActionResult> {
  const s = await resolveScope(input.area);
  if (!s) return { ok: false, error: "No autorizado." };
  if (!z.uuid().safeParse(input.id).success || !["pendiente", "completado", "cancelado"].includes(input.status)) return { ok: false, error: "Datos inválidos." };
  try {
    await asUser(s.userId, (db) =>
      db.exec(`update reminders set status = $2, completed_at = case when $2 = 'completado' then now() end where id = $1`, [input.id, input.status]),
    );
    revalidatePath(s.path, "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: dbErrorMessage(e) };
  }
}
