import Link from "next/link";
import { BedDouble, CalendarCheck, CircleDollarSign, Coins, HandCoins, Hourglass, LogIn, LogOut, Map, MessageCircle, Percent, Receipt, Umbrella, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardBody, CardHeader, PageHeader, Stat, Table, Td, Th } from "@/components/ui/primitives";
import { BarGroups, HBar } from "@/components/ui/charts";
import { ExportButtons } from "@/features/owner/pages";
import { requireModule, requireTenant } from "@/server/auth/context";
import { hasModule } from "@/lib/plan";
import { asUser } from "@/server/db";
import { chargesToManage, financeSummary, incomeVsExpenses, occupancy, operationalSnapshot } from "@/server/repos/dashboard";
import { listPendingReminders } from "@/server/repos/agenda";
import { formatMoney } from "@/lib/money";
import { daysBetweenInclusive, endOfMonth, formatDate, formatTime, isISODate, startOfMonth, todayISO } from "@/lib/dates";
import { METHOD_LABEL } from "@/features/reservas/labels";
import { CompleteReminder } from "@/features/agenda/agenda-client";

function MovesCard({ moves, panel }: { moves: { id: string; type: "ingreso" | "salida"; day: string; customer: string; units: string; number: number }[]; panel: string }) {
  return (
    <Card>
      <CardHeader title="Próximos ingresos y salidas" description="Próximos 7 días" />
      <ul className="divide-y divide-line">
        {moves.map((m) => (
          <li key={`${m.type}-${m.id}`} className="flex items-center gap-3 px-5 py-2.5 text-sm">
            {m.type === "ingreso" ? <LogIn className="size-4 text-st-free" aria-label="Ingreso" /> : <LogOut className="size-4 text-st-held" aria-label="Salida" />}
            <span className="w-20 text-xs font-semibold text-mist">{formatDate(m.day, { day: "2-digit", month: "short" })}</span>
            <Link href={`${panel}/reservas/${m.id}`} className="flex-1 truncate font-medium hover:underline">{m.customer}</Link>
            <span className="truncate text-xs text-mist">{m.units}</span>
          </li>
        ))}
        {!moves.length ? <li className="px-5 py-6 text-center text-sm text-mist">Sin movimientos en los próximos días.</li> : null}
      </ul>
    </Card>
  );
}

function RemindersCard({ items }: { items: { id: string; title: string; due_at: string; overdue: boolean; assignee: string | null }[] }) {
  return (
    <Card>
      <CardHeader title="Tareas y recordatorios" description="Vencidos y próximos" />
      <ul className="divide-y divide-line">
        {items.map((r) => (
          <li key={r.id} className="flex items-start gap-3 px-5 py-2.5 text-sm">
            <CompleteReminder area="tenant" id={r.id} done={false} />
            <div className="min-w-0 flex-1">
              <p className="font-medium">{r.title}</p>
              <p className="text-xs text-mist">{formatDate(r.due_at)} {formatTime(r.due_at)} {r.assignee ? `· ${r.assignee}` : ""}</p>
            </div>
            {r.overdue ? <Badge tone="danger">Vencida</Badge> : null}
          </li>
        ))}
        {!items.length ? <li className="px-5 py-6 text-center text-sm text-mist">Sin tareas pendientes.</li> : null}
      </ul>
    </Card>
  );
}


/** Vencimiento del cobro: el último día del período reservado. */
function DueBadge({ endDate, today }: { endDate: string; today: string }) {
  const days = daysBetweenInclusive(today, endDate) - 1;
  if (days < 0) return <Badge tone="danger">Vencido</Badge>;
  if (days === 0) return <Badge tone="danger">Vence hoy</Badge>;
  if (days <= 3) return <Badge tone="warning">Vence en {days} {days === 1 ? "día" : "días"}</Badge>;
  return <Badge tone="neutral">Vence {formatDate(endDate, { day: "2-digit", month: "2-digit" })}</Badge>;
}

export async function OwnerDashboard({ searchParams }: { searchParams: Promise<{ desde?: string; hasta?: string }> }) {
  const t = await requireTenant("owner");
  const pagos = hasModule(t.modules, "pagos");
  const ocupacion = hasModule(t.modules, "ocupacion");
  const whatsapp = hasModule(t.modules, "whatsapp");
  const sp = await searchParams;
  const today = todayISO();
  const from = isISODate(sp.desde) ? sp.desde : startOfMonth(today);
  const to = isISODate(sp.hasta) && sp.hasta >= from ? sp.hasta : endOfMonth(today);
  const d = await asUser(t.viewer.id, async (db) => {
    const season = await db.one<{ season_start: string | null; season_end: string | null }>(`select season_start, season_end from balnearios where id = $1`, [t.balnearioId]);
    const balance = await incomeVsExpenses(db, t.balnearioId, from, to, pagos ? "cobros" : "ventas");
    const [fin, occ, snap, rem, gastos] = await Promise.all([
      financeSummary(db, t.balnearioId, from, to),
      occupancy(db, t.balnearioId, from, to),
      operationalSnapshot(db, t.balnearioId, today),
      listPendingReminders(db, { scope: "balneario", balnearioId: t.balnearioId }, 6),
      db.one<{ total: number }>(`select coalesce(sum(amount_cents), 0) as total from expenses where balneario_id = $1 and spent_on between $2 and $3`, [t.balnearioId, from, to]),
    ]);
    return { fin, occ, snap, rem, season, balance, gastos: gastos?.total ?? 0 };
  });
  const presets = [
    { label: "Este mes", from: startOfMonth(today), to: endOfMonth(today) },
    ...(d.season?.season_start && d.season.season_end ? [{ label: "Temporada", from: d.season.season_start, to: d.season.season_end }] : []),
    { label: "Año calendario", from: `${today.slice(0, 4)}-01-01`, to: `${today.slice(0, 4)}-12-31` },
  ];
  const methods = Object.entries(d.fin.por_medio).map(([k, v]) => ({ label: METHOD_LABEL[k] ?? k, value: v })).sort((a, b) => b.value - a.value);

  return (
    <>
      <PageHeader
        eyebrow={t.balnearioName}
        title={`Hola, ${t.viewer.fullName.split(" ")[0]}`}
        description={`Resumen del ${formatDate(from)} al ${formatDate(to)}.`}
        actions={presets.map((p) => (
          <Button key={p.label} size="sm" variant={p.from === from && p.to === to ? "primary" : "outline"} asChild>
            <Link href={`/empresa?desde=${p.from}&hasta=${p.to}`}>{p.label}</Link>
          </Button>
        ))}
      />
      <form action="/empresa" className="mb-4 flex flex-wrap items-end gap-2" aria-label="Período del resumen">
        <label className="flex flex-col gap-1 text-xs font-semibold text-mist">Desde<input type="date" name="desde" defaultValue={from} className="h-9 rounded-lg border border-line px-2 text-sm text-ink" /></label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-mist">Hasta<input type="date" name="hasta" defaultValue={to} className="h-9 rounded-lg border border-line px-2 text-sm text-ink" /></label>
        <button className="h-9 rounded-lg bg-foam px-4 text-sm font-semibold text-navy">Aplicar</button>
      </form>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Facturación del período" value={formatMoney(d.fin.facturacion)} icon={Receipt} hint="Total de reservas no canceladas que comienzan en el período." />
        {pagos ? <Stat label="Cobros realizados" value={formatMoney(d.fin.cobros)} icon={Wallet} tone="free" hint="Pagos aprobados con fecha dentro del período." /> : null}
        {pagos ? <Stat label="Saldo pendiente" value={formatMoney(d.fin.saldo_pendiente)} icon={Hourglass} tone="busy" hint="De las reservas que comienzan en el período." /> : null}
        <Stat label="Gastos del período" value={formatMoney(d.gastos)} icon={Coins} tone="held" hint={pagos ? `Resultado (cobros − gastos): ${formatMoney(d.fin.cobros - d.gastos)}` : "Cargados en Gastos."} />
        {ocupacion ? <Stat label="Ocupación" value={`${d.occ.pct.toLocaleString("es-AR")}%`} icon={Percent} tone="sea" hint={`${d.occ.used} de ${d.occ.capacity} días-unidad confirmados.`} /> : null}
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <Stat label="Reservas activas" value={d.snap.active} icon={CalendarCheck} hint="Pendientes o confirmadas vigentes y futuras." />
        <Stat label="Unidades disponibles hoy" value={`${d.snap.free_today} / ${d.snap.total_units}`} icon={Umbrella} tone="free" />
        {whatsapp ? <Stat label="Mensajes sin leer" value={d.snap.unread} icon={MessageCircle} /> : null}
      </div>
      <Card className="mt-4">
        <CardHeader
          title="Ingresos y gastos"
          description={`${d.balance.monthly ? "Por mes" : "Por semana"} · ingresos: ${pagos ? "cobros aprobados por fecha de cobro" : "reservas por fecha de inicio"}. Resultado del período: ${formatMoney(d.balance.income - d.balance.expense)}.`}
          action={<ExportButtons base="/empresa/balance/exportar" query={(formato) => new URLSearchParams({ formato, desde: from, hasta: to }).toString()} />}
        />
        <CardBody>
          <div className="mb-3 flex flex-wrap gap-4 text-sm">
            <span>Ingresos: <strong className="text-st-free">{formatMoney(d.balance.income)}</strong></span>
            <span>Gastos: <strong className="text-st-held">{formatMoney(d.balance.expense)}</strong></span>
          </div>
          <BarGroups
            data={d.balance.buckets.map((b) => ({ label: b.label, values: [b.income, b.expense] }))}
            series={[{ name: "Ingresos", className: "bg-st-free" }, { name: "Gastos", className: "bg-st-held" }]}
            format={formatMoney}
          />
        </CardBody>
      </Card>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {pagos ? (
          <Card>
            <CardHeader title="Cobros por medio de pago" description="En el período" />
            <CardBody>{methods.length ? <HBar items={methods} format={formatMoney} /> : <p className="text-sm text-mist">Sin cobros en el período.</p>}</CardBody>
          </Card>
        ) : null}
        <MovesCard moves={d.snap.moves} panel="/empresa" />
        <RemindersCard items={d.rem} />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="secondary" asChild><Link href="/empresa/plano"><Map /> Abrir plano</Link></Button>
        <Button variant="outline" asChild><Link href="/empresa/gastos"><Coins /> Gastos</Link></Button>
        {ocupacion ? <Button variant="outline" asChild><Link href="/empresa/reportes"><CircleDollarSign /> Ver reportes</Link></Button> : null}
      </div>
    </>
  );
}

export async function AdminDashboard() {
  const t = await requireTenant("staff");
  const pagos = hasModule(t.modules, "pagos");
  const whatsapp = hasModule(t.modules, "whatsapp");
  const today = todayISO();
  const d = await asUser(t.viewer.id, async (db) => {
    const [snap, rem, charges] = await Promise.all([
      operationalSnapshot(db, t.balnearioId, today),
      listPendingReminders(db, { scope: "balneario", balnearioId: t.balnearioId }, 8),
      pagos ? chargesToManage(db, t.balnearioId, today) : Promise.resolve([]),
    ]);
    return { snap, rem, charges: charges.slice(0, 8) };
  });
  return (
    <>
      <PageHeader eyebrow={t.balnearioName} title="Operación del día" description={`Hoy, ${formatDate(today, { weekday: "long", day: "numeric", month: "long" })}.`} actions={<Button asChild><Link href="/empresa/plano"><Map /> Abrir plano</Link></Button>} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Reservas de hoy" value={d.snap.today} icon={BedDouble} />
        <Stat label="Unidades disponibles" value={`${d.snap.free_today} / ${d.snap.total_units}`} icon={Umbrella} tone="free" />
        {pagos ? <Stat label="Cobros a gestionar" value={d.snap.to_collect} icon={HandCoins} tone="held" hint="Reservas en curso o próximas con saldo." /> : null}
        {whatsapp ? <Stat label="Mensajes sin responder" value={d.snap.unread} icon={MessageCircle} /> : null}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <MovesCard moves={d.snap.moves} panel="/empresa" />
        <RemindersCard items={d.rem} />
        {pagos ? (
          <Card>
            <CardHeader title="Cobros a gestionar" description="Ordenados por vencimiento (fin del período reservado)" action={<Link href="/empresa/pagos" className="text-xs font-semibold text-sea">Ver todos</Link>} />
            <Table>
              <tbody>
                {d.charges.map((c) => (
                  <tr key={c.id}>
                    <Td>
                      <Link href={`/empresa/reservas/${c.id}`} className="font-medium hover:underline">{c.customer}</Link>
                      <p className="text-xs text-mist">{c.units}</p>
                      <div className="mt-1"><DueBadge endDate={c.end_date} today={today} /></div>
                    </Td>
                    <Td className="text-right font-semibold tabular-nums text-st-busy">{formatMoney(c.balance_cents)}</Td>
                  </tr>
                ))}
                {!d.charges.length ? <tr><Td className="text-center text-mist">Sin saldos pendientes.</Td></tr> : null}
              </tbody>
            </Table>
          </Card>
        ) : null}
      </div>
    </>
  );
}

export async function AdminCobrosPage() {
  const t = await requireModule("staff", "pagos");
  const today = todayISO();
  const rows = await asUser(t.viewer.id, (db) => chargesToManage(db, t.balnearioId, today));
  return (
    <>
      <PageHeader eyebrow={t.balnearioName} title="Cobros" description="Reservas con saldo pendiente, ordenadas por vencimiento: el cobro vence cuando termina el período reservado." />
      <Card>
        <Table>
          <thead><tr><Th>Vencimiento</Th><Th>Reserva</Th><Th>Cliente</Th><Th>Unidades</Th><Th>Fechas</Th><Th className="text-right">Saldo a cobrar</Th><Th /></tr></thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id}>
                <Td><DueBadge endDate={c.end_date} today={today} /></Td>
                <Td className="font-bold">#{c.number}</Td>
                <Td>{c.customer}</Td>
                <Td className="text-mist">{c.units}</Td>
                <Td className="whitespace-nowrap">{formatDate(c.start_date)} – {formatDate(c.end_date)}</Td>
                <Td className="text-right font-semibold tabular-nums text-st-busy">{formatMoney(c.balance_cents)}</Td>
                <Td><Button size="sm" variant="secondary" asChild><Link href={`/empresa/reservas/${c.id}`}>Cobrar</Link></Button></Td>
              </tr>
            ))}
            {!rows.length ? <tr><Td colSpan={7} className="py-8 text-center text-mist">No hay saldos pendientes por gestionar.</Td></tr> : null}
          </tbody>
        </Table>
      </Card>
    </>
  );
}