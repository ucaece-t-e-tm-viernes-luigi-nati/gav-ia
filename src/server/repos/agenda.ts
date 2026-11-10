import "server-only";
import type { Db } from "@/server/db";

export type Scope = { scope: "balneario"; balnearioId: string } | { scope: "gavia" };

export type AgendaItem = {
  id: string;
  type: "recordatorio" | "evento" | "ingreso" | "salida";
  title: string;
  description: string;
  at: string; // ISO o fecha
  allDay: boolean;
  status?: string;
  kind?: string;
  assignee?: string | null;
  link?: string | null;
};

const scopeWhere = (alias: string, s: Scope, idx: number) =>
  s.scope === "gavia" ? `${alias}.scope = 'gavia'` : `${alias}.scope = 'balneario' and ${alias}.balneario_id = $${idx}`;

export async function listAgenda(db: Db, s: Scope, from: string, to: string, panel: string): Promise<AgendaItem[]> {
  const p: unknown[] = [from, to];
  if (s.scope === "balneario") p.push(s.balnearioId);
  const reminders = await db.many<{ id: string; title: string; description: string; due_at: string; status: string; kind: string; assignee: string | null; customer_id: string | null; reservation_id: string | null; lead_id: string | null }>(
    `select r.id, r.title, r.description, r.due_at, r.status, r.kind, p.full_name as assignee, r.customer_id, r.reservation_id, r.lead_id
       from reminders r left join profiles p on p.id = r.assigned_to
      where ${scopeWhere("r", s, 3)} and local_date(r.due_at) between $1 and $2 and r.status <> 'cancelado'
      order by r.due_at`,
    p,
  );
  const events = await db.many<{ id: string; title: string; description: string; starts_at: string }>(
    `select e.id, e.title, e.description, e.starts_at from calendar_events e where ${scopeWhere("e", s, 3)} and local_date(e.starts_at) between $1 and $2 order by e.starts_at`,
    p,
  );
  const items: AgendaItem[] = [
    ...reminders.map((r) => ({
      id: r.id, type: "recordatorio" as const, title: r.title, description: r.description, at: r.due_at, allDay: false, status: r.status, kind: r.kind, assignee: r.assignee,
      link: r.reservation_id ? `${panel}/reservas/${r.reservation_id}` : r.customer_id ? `${panel}/clientes/${r.customer_id}` : r.lead_id ? `${panel}/crm?lead=${r.lead_id}` : null,
    })),
    ...events.map((e) => ({ id: e.id, type: "evento" as const, title: e.title, description: e.description, at: e.starts_at, allDay: false })),
  ];
  if (s.scope === "balneario") {
    const moves = await db.many<{ id: string; number: number; start_date: string; end_date: string; customer: string; units: string }>(
      `select r.id, r.number, r.start_date, r.end_date, trim(c.first_name || ' ' || c.last_name) as customer,
              coalesce((select string_agg(u.code, ', ') from reservation_units ru join units u on u.id = ru.unit_id where ru.reservation_id = r.id), '') as units
         from reservations r join customers c on c.id = r.customer_id
        where r.balneario_id = $3 and r.status in ('pendiente', 'confirmada') and (r.start_date between $1 and $2 or r.end_date between $1 and $2)`,
      p,
    );
    for (const m of moves) {
      if (m.start_date >= from && m.start_date <= to) items.push({ id: `in-${m.id}`, type: "ingreso", title: `Ingreso: ${m.customer}`, description: `${m.units} · reserva #${m.number}`, at: m.start_date, allDay: true, link: `${panel}/reservas/${m.id}` });
      if (m.end_date >= from && m.end_date <= to) items.push({ id: `out-${m.id}`, type: "salida", title: `Salida: ${m.customer}`, description: `${m.units} · reserva #${m.number}`, at: m.end_date, allDay: true, link: `${panel}/reservas/${m.id}` });
    }
  }
  return items;
}

export async function listPendingReminders(db: Db, s: Scope, limit = 8) {
  const p: unknown[] = [limit];
  if (s.scope === "balneario") p.push(s.balnearioId);
  return db.many<{ id: string; title: string; due_at: string; kind: string; assignee: string | null; overdue: boolean }>(
    `select r.id, r.title, r.due_at, r.kind, p.full_name as assignee, r.due_at < now() as overdue
       from reminders r left join profiles p on p.id = r.assigned_to
      where ${scopeWhere("r", s, 2)} and r.status = 'pendiente' and r.due_at < now() + interval '14 days'
      order by r.due_at limit $1`,
    p,
  );
}
