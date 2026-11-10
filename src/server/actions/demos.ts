"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { asService, asUser, dbErrorMessage } from "@/server/db";
import { superadminFor } from "@/server/auth/context";
import { DEMO_SLOT_MINUTES, isValidSlot } from "@/lib/demo-slots";
import { formatDateTime } from "@/lib/dates";
import type { ActionResult } from "@/lib/utils";

const schema = z.object({
  slot: z.string().min(10),
  name: z.string().trim().min(2, { error: "Ingresá tu nombre." }).max(100),
  business: z.string().trim().min(2, { error: "Ingresá el nombre del balneario." }).max(120),
  email: z.email({ error: "Ingresá un correo válido." }),
  phone: z.string().trim().min(6, { error: "Ingresá un teléfono o WhatsApp." }).max(40),
  city: z.string().trim().max(100),
  notes: z.string().trim().max(1000),
});

const recent = new Map<string, number[]>();

/**
 * Reserva pública de una demo. Valida el turno (30 min, 09–17 h, días hábiles,
 * 24 h de anticipación), evita turnos duplicados con un índice único y crea el
 * evento en el calendario de GavIA y el prospecto en el CRM.
 */
export async function bookDemoAction(input: z.input<typeof schema> & { website?: string }): Promise<ActionResult<{ when: string }>> {
  if (input.website) return { ok: true, data: { when: "" } }; // trampa anti-bots
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const now = Date.now();
  const hits = (recent.get(ip) ?? []).filter((t) => now - t < 3600_000);
  if (hits.length >= 3) return { ok: false, error: "Recibimos varias reservas desde tu conexión. Probá más tarde o escribinos." };
  const p = schema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Datos inválidos." };
  const d = p.data;
  if (!isValidSlot(d.slot)) return { ok: false, error: "Ese horario ya no está disponible. Elegí otro (con al menos 24 horas de anticipación)." };
  const startsAt = new Date(d.slot).toISOString();
  const endsAt = new Date(Date.parse(startsAt) + DEMO_SLOT_MINUTES * 60_000).toISOString();

  try {
    await asService(async (db) => {
      const existingLead = await db.one<{ id: string }>(`select id from leads where lower(email) = lower($1) order by created_at desc limit 1`, [d.email]);
      const lead =
        existingLead ??
        (await db.one<{ id: string }>(
          `insert into leads (business_name, contact_name, phone, email, city, stage, source, notes) values ($1, $2, $3, $4, $5, 'demo', 'Agenda web', $6) returning id`,
          [d.business, d.name, d.phone, d.email, d.city, d.notes],
        ));
      if (existingLead) await db.exec(`update leads set stage = case when stage in ('prospecto', 'contactado') then 'demo' else stage end where id = $1`, [lead!.id]);
      const ev = await db.one<{ id: string }>(
        `insert into calendar_events (scope, title, description, starts_at, ends_at) values ('gavia', $1, $2, $3, $4) returning id`,
        [`Demo: ${d.business}`, `${d.name} · ${d.phone} · ${d.email}${d.city ? ` · ${d.city}` : ""}${d.notes ? `\n${d.notes}` : ""}`, startsAt, endsAt],
      );
      // El índice único sobre starts_at impide que dos personas tomen el mismo turno.
      await db.exec(
        `insert into demo_bookings (starts_at, name, business_name, email, phone, city, notes, lead_id, event_id) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [startsAt, d.name, d.business, d.email, d.phone, d.city, d.notes, lead!.id, ev!.id],
      );
    });
    recent.set(ip, [...hits, now]);
    return { ok: true, data: { when: formatDateTime(startsAt) } };
  } catch (e) {
    if ((e as { code?: string }).code === "23505") return { ok: false, error: "Ese horario se acaba de ocupar. Elegí otro, por favor." };
    return { ok: false, error: dbErrorMessage(e) };
  }
}

/** El equipo de GavIA marca la demo como realizada o cancelada (libera el turno). */
export async function updateDemoAction(input: { id: string; status: string }): Promise<ActionResult> {
  const v = await superadminFor("calendario");
  if (!v) return { ok: false, error: "Requiere el permiso de Calendario." };
  const p = z.object({ id: z.uuid(), status: z.enum(["agendada", "realizada", "cancelada"]) }).safeParse(input);
  if (!p.success) return { ok: false, error: "Datos inválidos." };
  try {
    await asUser(v.id, async (db) => {
      const b = await db.one<{ event_id: string | null }>(`update demo_bookings set status = $2 where id = $1 returning event_id`, [p.data.id, p.data.status]);
      if (b?.event_id && p.data.status === "cancelada") await db.exec(`delete from calendar_events where id = $1`, [b.event_id]);
    });
    revalidatePath("/plataforma", "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: dbErrorMessage(e) };
  }
}
