import Link from "next/link";
import { ChevronLeft, ChevronRight, LogIn, LogOut, Bell, CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardHeader, PageHeader } from "@/components/ui/primitives";
import { requireSuperadmin, requireTenant, type TenantRole } from "@/server/auth/context";
import { asUser } from "@/server/db";
import { listAgenda, listPendingReminders, type AgendaItem, type Scope } from "@/server/repos/agenda";
import { addDays, addMonths, endOfMonth, formatDate, formatDateLong, formatTime, isISODate, localDateOf, monthLabel, startOfMonth, startOfWeek, todayISO } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/money";
import { hasModule } from "@/lib/plan";
import { CompleteReminder, NewAgendaItem } from "./agenda-client";

type Search = Promise<{ vista?: string; fecha?: string }>;
type View = "mes" | "semana" | "dia";

const ICON = { recordatorio: Bell, evento: CalendarClock, ingreso: LogIn, salida: LogOut };
const TONE = { recordatorio: "border-l-sea bg-foam/60", evento: "border-l-navy bg-sand/70", ingreso: "border-l-st-free bg-st-free-bg", salida: "border-l-st-held bg-st-held-bg" };

function dayOf(i: AgendaItem) {
  return i.allDay ? i.at.slice(0, 10) : localDateOf(i.at);
}

function ItemChip({ i, area, compact }: { i: AgendaItem; area: "tenant" | "gavia"; compact?: boolean }) {
  const Icon = ICON[i.type];
  const done = i.status === "completado";
  const body = (
    <div className={cn("flex items-start gap-1.5 rounded-md border-l-2 px-1.5 py-1 text-[11px] leading-tight", TONE[i.type], done && "opacity-50 line-through")}>
      {i.type === "recordatorio" && !compact ? <CompleteReminder area={area} id={i.id} done={done} /> : <Icon className="mt-px size-3 shrink-0" aria-hidden />}
      <span className="min-w-0">
        {!i.allDay ? <span className="font-bold tabular-nums">{formatTime(i.at)} </span> : null}
        <span className={compact ? "line-clamp-1" : ""}>{i.title}</span>
        {!compact && i.description ? <span className="block text-mist">{i.description}</span> : null}
        {!compact && i.assignee ? <span className="block text-mist">Responsable: {i.assignee}</span> : null}
      </span>
    </div>
  );
  return i.link && compact ? <Link href={i.link}>{body}</Link> : body;
}

async function AgendaView({ area, scope, userId, panel, sp, title, eyebrow, members, related, top }: {
  top?: React.ReactNode;
  // members: todo el equipo con permisos en el ámbito (incluye a quien crea el evento).
  area: "tenant" | "gavia"; scope: Scope; userId: string; panel: string; sp: Awaited<Search>; title: string; eyebrow: string;
  members: { id: string; label: string }[]; related: Record<string, { id: string; label: string }[]>;
}) {
  const view: View = sp.vista === "semana" || sp.vista === "dia" ? sp.vista : "mes";
  const date = isISODate(sp.fecha) ? sp.fecha : todayISO();
  const range =
    view === "mes" ? { from: startOfWeek(startOfMonth(date)), to: addDays(startOfWeek(endOfMonth(date)), 6) } :
    view === "semana" ? { from: startOfWeek(date), to: addDays(startOfWeek(date), 6) } : { from: date, to: date };
  const step = (n: number) => (view === "mes" ? addMonths(date, n) : addDays(date, n * (view === "semana" ? 7 : 1)));
  const { items, pending } = await asUser(userId, async (db) => ({
    items: await listAgenda(db, scope, range.from, range.to, panel),
    pending: await listPendingReminders(db, scope, 10),
  }));
  const byDay = new Map<string, AgendaItem[]>();
  for (const i of items.sort((a, b) => a.at.localeCompare(b.at))) {
    const d = dayOf(i);
    byDay.set(d, [...(byDay.get(d) ?? []), i]);
  }
  const base = `${panel}/calendario`;
  const today = todayISO();
  const label = view === "mes" ? monthLabel(date) : view === "semana" ? `Semana del ${formatDate(range.from)}` : formatDateLong(date);
  const days = Array.from({ length: Math.round((Date.parse(range.to) - Date.parse(range.from)) / 86_400_000) + 1 }, (_, i) => addDays(range.from, i));

  return (
    <>
      <PageHeader eyebrow={eyebrow} title={title} description="Recordatorios, tareas y eventos. Las tareas vencidas aparecen también en el inicio." actions={<NewAgendaItem area={area} date={date} members={members} related={related} currentUserId={userId} />} />
      {top}
      <div className="grid gap-4 xl:grid-cols-[1fr_300px]">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
            <div className="flex items-center gap-2">
              <Button size="icon" variant="outline" asChild><Link aria-label="Anterior" href={`${base}?vista=${view}&fecha=${step(-1)}`}><ChevronLeft /></Link></Button>
              <Button size="icon" variant="outline" asChild><Link aria-label="Siguiente" href={`${base}?vista=${view}&fecha=${step(1)}`}><ChevronRight /></Link></Button>
              <Button size="sm" variant="ghost" asChild><Link href={`${base}?vista=${view}`}>Hoy</Link></Button>
              <h2 className="ml-1 text-sm font-bold text-navy first-letter:uppercase">{label}</h2>
            </div>
            <div className="flex rounded-lg border border-line p-0.5 text-sm">
              {(["mes", "semana", "dia"] as View[]).map((v) => (
                <Link key={v} href={`${base}?vista=${v}&fecha=${date}`} aria-current={v === view ? "page" : undefined} className={cn("rounded-md px-3 py-1 font-semibold capitalize", v === view ? "bg-navy text-white" : "text-mist")}>{v === "dia" ? "Día" : v}</Link>
              ))}
            </div>
          </div>
          {view === "dia" ? (
            <div className="space-y-2 p-4">
              {(byDay.get(date) ?? []).map((i) => <ItemChip key={i.id} i={i} area={area} />)}
              {!byDay.get(date)?.length ? <p className="py-8 text-center text-sm text-mist">Sin actividades para este día.</p> : null}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <div className="grid min-w-[720px] grid-cols-7">
                {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => <div key={d} className="border-b border-line px-2 py-1.5 text-[11px] font-bold uppercase text-mist">{d}</div>)}
                {days.map((d) => {
                  const list = byDay.get(d) ?? [];
                  const outside = view === "mes" && d.slice(0, 7) !== date.slice(0, 7);
                  return (
                    <div key={d} className={cn("border-b border-r border-line p-1.5", view === "semana" ? "min-h-64" : "min-h-28", outside && "bg-sand/30")}>
                      <Link href={`${base}?vista=dia&fecha=${d}`} className={cn("mb-1 inline-grid size-6 place-items-center rounded-full text-xs font-semibold", d === today ? "bg-navy text-white" : outside ? "text-mist/60" : "text-ink hover:bg-sand")}>{Number(d.slice(8))}</Link>
                      <div className="space-y-1">
                        {list.slice(0, view === "semana" ? 12 : 3).map((i) => <ItemChip key={i.id} i={i} area={area} compact={view === "mes"} />)}
                        {view === "mes" && list.length > 3 ? <Link href={`${base}?vista=dia&fecha=${d}`} className="block text-[11px] font-semibold text-sea">+{list.length - 3} más</Link> : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </Card>
        <Card className="h-fit">
          <CardHeader title="Pendientes" description="Vencidas y próximas 2 semanas" />
          <ul className="divide-y divide-line">
            {pending.map((p) => (
              <li key={p.id} className="flex items-start gap-2 px-4 py-2.5 text-sm">
                <CompleteReminder area={area} id={p.id} done={false} />
                <div className="min-w-0">
                  <p className="font-medium">{p.title}</p>
                  <p className="text-xs text-mist">{formatDate(p.due_at)} {formatTime(p.due_at)} {p.assignee ? `· ${p.assignee}` : ""}</p>
                </div>
                {p.overdue ? <Badge tone="danger" className="ml-auto">Vencida</Badge> : null}
              </li>
            ))}
            {!pending.length ? <li className="px-4 py-6 text-center text-sm text-mist">Nada pendiente.</li> : null}
          </ul>
        </Card>
      </div>
    </>
  );
}

export async function TenantCalendarPage({ role, searchParams }: { role: TenantRole; searchParams: Search }) {
  const t = await requireTenant(role);
  const { members, customers, reservations } = await asUser(t.viewer.id, async (db) => ({
    // Dueño(s) y administradores activos del balneario.
    members: await db.many<{ id: string; label: string }>(
      `select p.id, coalesce(nullif(p.full_name, ''), p.email) || case m.role when 'owner' then ' · dueño' else ' · staff' end as label
         from memberships m join profiles p on p.id = m.user_id where m.balneario_id = $1 and m.active order by m.role desc, p.full_name`,
      [t.balnearioId],
    ),
    customers: await db.many<{ id: string; label: string }>(`select id, trim(first_name || ' ' || last_name) as label from customers where balneario_id = $1 order by last_name limit 200`, [t.balnearioId]),
    reservations: await db.many<{ id: string; label: string }>(
      `select r.id, '#' || r.number || ' · ' || trim(c.first_name || ' ' || c.last_name) as label from reservations r join customers c on c.id = r.customer_id
        where r.balneario_id = $1 and r.status in ('pendiente', 'confirmada') order by r.start_date limit 200`, [t.balnearioId]),
  }));
  return (
    <AgendaView area="tenant" scope={{ scope: "balneario", balnearioId: t.balnearioId }} userId={t.viewer.id} panel={"/empresa"} sp={await searchParams}
      top={hasModule(t.modules, "pagos") ? <DueTodayCard userId={t.viewer.id} balnearioId={t.balnearioId} panel={"/empresa"} /> : null}
      title="Calendario y recordatorios" eyebrow={t.balnearioName} members={members} related={{ cliente: customers, reserva: reservations }} />
  );
}

export async function GaviaCalendarPage({ searchParams }: { searchParams: Search }) {
  const v = await requireSuperadmin("calendario");
  const { members, leads } = await asUser(v.id, async (db) => ({
    members: await db.many<{ id: string; label: string }>(`select id, coalesce(nullif(full_name, ''), email) as label from profiles where platform_role = 'superadmin' order by full_name`),
    leads: await db.many<{ id: string; label: string }>(`select id, business_name as label from leads where stage not in ('ganado', 'perdido') order by business_name`),
  }));
  return <AgendaView area="gavia" scope={{ scope: "gavia" }} userId={v.id} panel="/plataforma" sp={await searchParams} title="Calendario comercial" eyebrow="GavIA" members={members} related={{ comercial: leads }} />;
}

/** Cada reserva debe quedar paga el último día de la estadía: lista lo que vence hoy y lo vencido sin cobrar. */
async function DueTodayCard({ userId, balnearioId, panel }: { userId: string; balnearioId: string; panel: string }) {
  const today = todayISO();
  const rows = await asUser(userId, (db) =>
    db.many<{ id: string; number: number; end_date: string; customer: string; phone: string; units: string; balance_cents: number }>(
      `select r.id, r.number, r.end_date, trim(c.first_name || ' ' || c.last_name) as customer, coalesce(nullif(c.whatsapp, ''), c.phone) as phone,
              coalesce((select string_agg(u.code, ', ') from reservation_units ru join units u on u.id = ru.unit_id where ru.reservation_id = r.id), '') as units,
              r.balance_cents
         from reservations r join customers c on c.id = r.customer_id
        where r.balneario_id = $1 and r.status in ('pendiente', 'confirmada') and r.balance_cents > 0
          and r.end_date between $2::date - 30 and $2::date
        order by r.end_date desc, r.number`,
      [balnearioId, today],
    ),
  );
  const dueToday = rows.filter((r) => r.end_date === today);
  const overdue = rows.filter((r) => r.end_date < today);
  const Row = ({ r }: { r: (typeof rows)[number] }) => (
    <li className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
      <span>
        <Link href={`${panel}/reservas/${r.id}`} className="font-semibold text-navy hover:underline">#{r.number} · {r.customer}</Link>
        <span className="block text-xs text-mist">{r.units} · {r.phone || "sin teléfono"}{r.end_date < today ? ` · terminó el ${formatDate(r.end_date)}` : ""}</span>
      </span>
      <span className="font-bold tabular-nums text-st-busy">{formatMoney(r.balance_cents)}</span>
    </li>
  );
  return (
    <Card className="mb-4 border-st-busy/30">
      <CardHeader title="Cobros que vencen hoy" description="Toda reserva debe quedar paga el último día de la estadía." action={<Badge tone={dueToday.length ? "danger" : "success"}>{dueToday.length ? `${dueToday.length} pendiente${dueToday.length === 1 ? "" : "s"}` : "Al día"}</Badge>} />
      <ul className="divide-y divide-line">
        {dueToday.map((r) => <Row key={r.id} r={r} />)}
        {!dueToday.length ? <li className="px-4 py-3 text-sm text-mist">No hay saldos que venzan hoy.</li> : null}
      </ul>
      {overdue.length ? (
        <>
          <p className="border-t border-line bg-st-busy-bg/40 px-4 py-2 text-xs font-bold uppercase tracking-wide text-[#9b2f2c]">Vencidos sin cobrar ({overdue.length})</p>
          <ul className="divide-y divide-line">{overdue.map((r) => <Row key={r.id} r={r} />)}</ul>
        </>
      ) : null}
    </Card>
  );
}