import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarRange, ChevronLeft, ChevronRight, List, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardBody, CardHeader, DemoTag, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { requireTenant, type TenantRole } from "@/server/auth/context";
import { hasModule } from "@/lib/plan";
import { asUser } from "@/server/db";
import { getReservation, listReservations } from "@/server/repos/reservas";
import { getMpConfig, isTestModeAvailable } from "@/server/payments/mercadopago";
import { formatMoney } from "@/lib/money";
import { addDays, addMonths, daysBetweenInclusive, endOfMonth, formatDate, formatDateTime, isISODate, monthLabel, startOfMonth, todayISO } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { METHOD_LABEL, paymentState, RES_STATUS } from "./labels";
import { ChangeUnitButton, CoHolders, DeleteReservationButton, PaymentForm, ReservationControls, VoidPaymentButton } from "./reservation-actions";
import { NewReservation } from "./new-reservation";
import { QrCharge } from "@/features/pagos/qr-charge";

type ListSearch = Promise<{ q?: string; estado?: string; desde?: string; hasta?: string; vista?: string; mes?: string; saldo?: string }>;

export async function ReservasListPage({ role, searchParams }: { role: TenantRole; searchParams: ListSearch }) {
  const t = await requireTenant(role);
  const pagos = hasModule(t.modules, "pagos");
  const sp = await searchParams;
  const base = `/empresa/reservas`;
  const vista = sp.vista === "calendario" ? "calendario" : "lista";

  const toggle = (
    <div className="flex rounded-lg border border-line bg-white p-0.5">
      {[{ id: "lista", label: "Lista", icon: List }, { id: "calendario", label: "Calendario", icon: CalendarRange }].map((v) => (
        <Link key={v.id} href={`${base}?vista=${v.id}`} aria-current={vista === v.id ? "page" : undefined} className={cn("flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold", vista === v.id ? "bg-navy text-white" : "text-mist hover:text-navy")}>
          <v.icon className="size-4" /> {v.label}
        </Link>
      ))}
    </div>
  );
  const header = (
    <PageHeader
      eyebrow={t.balnearioName}
      title="Reservas"
      description="Todas las reservas del balneario, con su estado y saldo."
      actions={<>{toggle}<Button asChild><Link href={`${base}/nueva`}><Plus /> Nueva reserva</Link></Button></>}
    />
  );

  if (vista === "calendario") {
    const month = sp.mes && /^\d{4}-\d{2}$/.test(sp.mes) ? `${sp.mes}-01` : startOfMonth(todayISO());
    const from = month;
    const to = endOfMonth(month);
    const { rows, units } = await asUser(t.viewer.id, async (db) => ({
      rows: await db.many<{ unit_id: string; reservation_id: string; number: number; start_date: string; end_date: string; status: string; customer: string }>(
        `select ru.unit_id, r.id as reservation_id, r.number, r.start_date, r.end_date, r.status, trim(c.first_name || ' ' || c.last_name) as customer
           from reservation_units ru join reservations r on r.id = ru.reservation_id join customers c on c.id = r.customer_id
          where ru.balneario_id = $1 and ru.active and ru.period && daterange($2::date, $3::date, '[]')`,
        [t.balnearioId, from, to],
      ),
      units: await db.many<{ id: string; code: string; map: string }>(`select id, code, map from units where balneario_id = $1 order by map desc, kind, code`, [t.balnearioId]),
    }));
    const days = daysBetweenInclusive(from, to);
    const used = units.filter((u) => rows.some((r) => r.unit_id === u.id));
    const color: Record<string, string> = { confirmada: "bg-st-busy text-white", pendiente: "bg-st-held text-white", finalizada: "bg-st-off text-white" };
    return (
      <>
        {header}
        <Card>
          <CardHeader
            title={monthLabel(month)}
            description="Ocupación por unidad. Solo se listan las unidades con reservas en el mes."
            action={
              <div className="flex gap-1">
                <Button size="icon" variant="outline" asChild><Link aria-label="Mes anterior" href={`${base}?vista=calendario&mes=${addMonths(month, -1).slice(0, 7)}`}><ChevronLeft /></Link></Button>
                <Button size="icon" variant="outline" asChild><Link aria-label="Mes siguiente" href={`${base}?vista=calendario&mes=${addMonths(month, 1).slice(0, 7)}`}><ChevronRight /></Link></Button>
              </div>
            }
          />
          {used.length ? (
            <div className="overflow-x-auto p-4">
              <div className="grid min-w-[900px] text-[11px]" style={{ gridTemplateColumns: `110px repeat(${days}, minmax(22px, 1fr))` }}>
                <div />
                {Array.from({ length: days }, (_, i) => (
                  <div key={i} className="pb-1 text-center font-semibold text-mist">{i + 1}</div>
                ))}
                {used.map((u) => (
                  <div key={u.id} className="contents">
                    <div className="truncate border-t border-line py-1.5 pr-2 font-semibold">{u.code}</div>
                    <div className="relative border-t border-line" style={{ gridColumn: `span ${days}` }}>
                      {rows.filter((r) => r.unit_id === u.id).map((r) => {
                        const s = r.start_date < from ? from : r.start_date;
                        const e = r.end_date > to ? to : r.end_date;
                        const left = ((daysBetweenInclusive(from, s) - 1) / days) * 100;
                        const width = (daysBetweenInclusive(s, e) / days) * 100;
                        return (
                          <Link
                            key={r.reservation_id}
                            href={`${base}/${r.reservation_id}`}
                            title={`#${r.number} · ${r.customer} · ${formatDate(r.start_date)} al ${formatDate(r.end_date)}`}
                            className={cn("absolute top-1 bottom-1 truncate rounded px-1.5 py-0.5 font-semibold", color[r.status] ?? "bg-sea text-white")}
                            style={{ left: `${left}%`, width: `${width}%` }}
                          >
                            {r.customer}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex gap-4 text-xs">
                <span className="flex items-center gap-1.5"><span className="size-3 rounded bg-st-busy" /> Confirmada</span>
                <span className="flex items-center gap-1.5"><span className="size-3 rounded bg-st-held" /> Pendiente</span>
                <span className="flex items-center gap-1.5"><span className="size-3 rounded bg-st-off" /> Finalizada</span>
              </div>
            </div>
          ) : (
            <EmptyState icon={CalendarRange} title="Sin reservas en este mes" description="Cambiá de mes o creá una reserva nueva." />
          )}
        </Card>
      </>
    );
  }

  const rows = await asUser(t.viewer.id, (db) =>
    listReservations(db, t.balnearioId, {
      q: sp.q, status: sp.estado, from: isISODate(sp.desde) ? sp.desde : undefined, to: isISODate(sp.hasta) ? sp.hasta : undefined, withBalance: pagos && sp.saldo === "1",
    }),
  );

  return (
    <>
      {header}
      <Card>
        <form className="flex flex-wrap items-end gap-2 border-b border-line p-4" aria-label="Filtros">
          <input type="hidden" name="vista" value="lista" />
          <label className="flex flex-col gap-1 text-xs font-semibold text-mist">Buscar
            <input name="q" defaultValue={sp.q} placeholder="Cliente, unidad o número" className="h-9 w-56 rounded-lg border border-line px-3 text-sm font-normal text-ink" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-mist">Estado
            <select name="estado" defaultValue={sp.estado ?? ""} className="h-9 rounded-lg border border-line px-2 text-sm font-normal text-ink">
              <option value="">Todos</option>
              {Object.entries(RES_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-mist">Desde<input type="date" name="desde" defaultValue={sp.desde} className="h-9 rounded-lg border border-line px-2 text-sm text-ink" /></label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-mist">Hasta<input type="date" name="hasta" defaultValue={sp.hasta} className="h-9 rounded-lg border border-line px-2 text-sm text-ink" /></label>
          {pagos ? <label className="flex h-9 items-center gap-2 text-sm"><input type="checkbox" name="saldo" value="1" defaultChecked={sp.saldo === "1"} className="accent-navy" /> Con saldo pendiente</label> : null}
          <Button type="submit" size="sm" variant="secondary">Filtrar</Button>
          {sp.q || sp.estado || sp.desde || sp.hasta || sp.saldo ? <Button size="sm" variant="ghost" asChild><Link href={base}>Limpiar</Link></Button> : null}
        </form>
        {rows.length ? (
          <Table>
            <thead>
              <tr><Th>#</Th><Th>Cliente</Th><Th>Unidades</Th><Th>Fechas</Th><Th>Estado</Th><Th className="text-right">Total</Th>{pagos ? <><Th className="text-right">Saldo</Th><Th>Pago</Th></> : null}</tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const ps = paymentState(r.total_cents, r.paid_cents);
                return (
                  <tr key={r.id} className="hover:bg-sand/30">
                    <Td><Link href={`${base}/${r.id}`} className="font-bold text-sea hover:underline">#{r.number}</Link></Td>
                    <Td className="font-medium">{r.customer_name} {r.is_demo ? <DemoTag /> : null}</Td>
                    <Td className="max-w-48 truncate text-mist">{r.units}</Td>
                    <Td className="whitespace-nowrap">{formatDate(r.start_date)} – {formatDate(r.end_date)}</Td>
                    <Td><Badge tone={RES_STATUS[r.status].tone}>{RES_STATUS[r.status].label}</Badge></Td>
                    <Td className="text-right tabular-nums">{formatMoney(r.total_cents)}</Td>
                    {pagos ? (
                      <>
                        <Td className={cn("text-right font-semibold tabular-nums", r.balance_cents > 0 && r.status !== "cancelada" ? "text-st-busy" : "")}>{formatMoney(r.balance_cents)}</Td>
                        <Td>{r.status !== "cancelada" ? <Badge tone={ps.tone}>{ps.label}</Badge> : null}</Td>
                      </>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </Table>
        ) : (
          <EmptyState icon={CalendarRange} title="No hay reservas para estos filtros" description="Probá con otro criterio o creá una reserva desde el plano." />
        )}
        {role === "staff" ? <p className="border-t border-line px-4 py-2 text-xs text-mist">Se muestran reservas vigentes, futuras y finalizadas en los últimos 30 días.</p> : null}
      </Card>
    </>
  );
}

export async function NuevaReservaPage({ role }: { role: TenantRole }) {
  const t = await requireTenant(role);
  const today = todayISO();
  return (
    <>
      <PageHeader eyebrow={t.balnearioName} title="Nueva reserva" description="También podés reservar directamente haciendo clic en una unidad disponible del plano." />
      <Card className="max-w-2xl"><CardBody><NewReservation base={`/empresa/reservas`} from={today} to={addDays(today, 6)} allowPayment={hasModule(t.modules, "pagos")} /></CardBody></Card>
    </>
  );
}

export async function ReservaDetailPage({ role, id }: { role: TenantRole; id: string }) {
  const t = await requireTenant(role);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const r = await asUser(t.viewer.id, (db) => getReservation(db, t.balnearioId, id));
  if (!r) notFound();
  const pagos = hasModule(t.modules, "pagos");
  const mpReady = pagos && !!(await getMpConfig(t.balnearioId));
  const ps = paymentState(r.total_cents, r.paid_cents);
  const isOwner = role === "owner";

  return (
    <>
      <PageHeader
        eyebrow={`Reserva #${r.number}`}
        title={r.customer_name}
        description={`${r.unitList.map((u) => u.code).join(" + ")} · del ${formatDate(r.start_date)} al ${formatDate(r.end_date)} (${daysBetweenInclusive(r.start_date, r.end_date)} días)`}
        actions={<><Badge tone={RES_STATUS[r.status].tone}>{RES_STATUS[r.status].label}</Badge>{r.is_demo ? <DemoTag /> : null}</>}
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <Card>
            <CardHeader title="Importes de la reserva" description={isOwner ? undefined : "Información necesaria para gestionar el cobro de esta reserva."} />
            <CardBody>
              <dl className={cn("grid gap-3 text-center", pagos ? "grid-cols-3" : "grid-cols-1")}>
                <div className="rounded-lg bg-sand/50 p-3"><dt className="text-xs text-mist">Total</dt><dd className="text-xl font-extrabold tabular-nums">{formatMoney(r.total_cents)}</dd></div>
                {pagos ? (
                  <>
                    <div className="rounded-lg bg-st-free-bg p-3"><dt className="text-xs text-mist">Pagado</dt><dd className="text-xl font-extrabold tabular-nums text-[#1f7a50]">{formatMoney(r.paid_cents)}</dd></div>
                    <div className={cn("rounded-lg p-3", r.balance_cents > 0 ? "bg-st-busy-bg" : "bg-sand/50")}><dt className="text-xs text-mist">Saldo pendiente</dt><dd className="text-xl font-extrabold tabular-nums">{formatMoney(r.balance_cents)}</dd></div>
                  </>
                ) : null}
              </dl>
              {pagos ? <p className="mt-3 text-sm">Estado del pago: <Badge tone={ps.tone}>{ps.label}</Badge></p> : <p className="mt-3 text-xs text-mist">El registro de cobros, saldos e historial de pagos está incluido en el plan PLUS.</p>}
            </CardBody>
          </Card>

          {r.status !== "cancelada" && pagos ? (
            <>
              <Card>
                <CardHeader title="Registrar cobro" description="Efectivo, transferencia o posnet." />
                <CardBody><PaymentForm reservationId={r.id} balanceCents={r.balance_cents} /></CardBody>
              </Card>
              <Card id="cobro-qr">
                <CardHeader title="Cobrar con QR de Mercado Pago" description="Se genera un QR dinámico por el saldo pendiente." />
                <CardBody><QrCharge reservationId={r.id} balanceCents={r.balance_cents} available={mpReady || isTestModeAvailable()} testMode={!mpReady && isTestModeAvailable()} /></CardBody>
              </Card>
            </>
          ) : r.status === "cancelada" ? (
            <Card><CardBody className="text-sm">Reserva cancelada el {formatDateTime(r.cancelled_at)}. Motivo: {r.cancel_reason}</CardBody></Card>
          ) : null}

          {pagos ? (
          <Card>
            <CardHeader title="Historial de pagos" />
            {r.payments.length ? (
              <Table>
                <thead><tr><Th>Fecha</Th><Th>Medio</Th><Th className="text-right">Importe</Th><Th>Estado</Th><Th>Registrado por</Th>{isOwner ? <Th /> : null}</tr></thead>
                <tbody>
                  {r.payments.map((p) => (
                    <tr key={p.id}>
                      <Td className="whitespace-nowrap">{formatDateTime(p.paid_at)}</Td>
                      <Td>{METHOD_LABEL[p.method] ?? p.method}{p.notes ? <p className="text-xs text-mist">{p.notes}</p> : null}</Td>
                      <Td className={cn("text-right tabular-nums", p.status === "anulado" && "line-through text-mist")}>{formatMoney(p.amount_cents)}</Td>
                      <Td>{p.status === "anulado" ? <Badge tone="muted" title={p.void_reason ?? ""}>Anulado</Badge> : <Badge tone="success">Aprobado</Badge>}</Td>
                      <Td className="text-mist">{p.created_by_name ?? "—"}</Td>
                      {isOwner ? <Td>{p.status === "aprobado" ? <VoidPaymentButton paymentId={p.id} /> : null}</Td> : null}
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : (
              <CardBody className="text-sm text-mist">Todavía no hay pagos registrados.</CardBody>
            )}
          </Card>
          ) : null}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Gestión" />
            <CardBody className="space-y-3 text-sm">
              <ReservationControls reservation={{ id: r.id, startDate: r.start_date, endDate: r.end_date, totalCents: r.total_cents, status: r.status, notes: r.notes }} />
              {r.status !== "cancelada" ? <ChangeUnitButton reservationId={r.id} units={r.unitList} startDate={r.start_date} endDate={r.end_date} /> : null}
              <DeleteReservationButton reservationId={r.id} number={r.number} base={`/empresa/reservas`} hasPayments={r.payments.length > 0} />
              <dl className="space-y-2 border-t border-line pt-3">
                <div><dt className="text-xs text-mist">{r.coHolders.length ? "Cliente titular" : "Cliente"}</dt><dd><Link href={`/empresa/clientes/${r.customer_id}`} className="font-semibold text-sea hover:underline">{r.titular_name}</Link><br /><span className="text-xs">{r.customer_phone} {r.customer_email ? `· ${r.customer_email}` : ""}</span></dd></div>
                <div><dt className="text-xs text-mist">Comparten la carpa</dt><dd><CoHolders reservationId={r.id} holderId={r.customer_id} coHolders={r.coHolders} clientsBase={`/empresa/clientes`} editable={r.status !== "cancelada"} /></dd></div>
                <div><dt className="text-xs text-mist">Unidades</dt><dd className="flex flex-wrap gap-1">{r.unitList.map((u) => <Badge key={u.id} tone="info">{u.code}</Badge>)}</dd></div>
                <div><dt className="text-xs text-mist">Notas</dt><dd className="whitespace-pre-wrap">{r.notes || "—"}</dd></div>
                <div><dt className="text-xs text-mist">Creada</dt><dd>{formatDateTime(r.created_at)} por {r.created_by_name ?? "—"}</dd></div>
              </dl>
            </CardBody>
          </Card>
          {isOwner && r.audit.length ? (
            <Card>
              <CardHeader title="Auditoría" description="Cambios registrados automáticamente." />
              <ul className="max-h-80 divide-y divide-line overflow-y-auto text-xs">
                {r.audit.map((a) => (
                  <li key={a.id} className="px-4 py-2">
                    <p className="font-semibold">{a.action}</p>
                    <p className="text-mist">{formatDateTime(a.created_at)} · {a.actor ?? "Sistema"}</p>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
