"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarPlus, ExternalLink, Phone, Search, Wallet, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { Alert, Badge, Card } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/overlay";
import { ReservationWizard } from "@/features/reservas/reservation-wizard";
import { PeriodSelect } from "@/components/ui/period-select";
import { METHOD_LABEL, paymentState, RES_STATUS } from "@/features/reservas/labels";
import { registerPaymentAction } from "@/server/actions/reservas";
import { formatMoney } from "@/lib/money";
import { addDays, formatDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { MapCanvas, PlanoLegend, type Selection } from "./map-canvas";
import { ZoomFrame } from "./zoom-frame";
import { MAPS, STATUS_META, type SiteMap, type UnitOccupancy, type UnitStatus } from "./types";

type Props = {
  basePath: string;
  map: SiteMap;
  occupancy: Record<string, UnitOccupancy>;
  from: string;
  to: string;
  today: string;
  season: { start: string | null; end: string | null };
  kindLabels: Record<string, string>;
  sectorNames: Record<string, string>;
  /** Plan con módulo de pagos: muestra saldos y acciones de cobro. */
  showPayments: boolean;
};

const STATUS_TONE: Record<UnitStatus, "success" | "danger" | "warning" | "muted"> = { disponible: "success", ocupada: "danger", reservada: "warning", fuera: "muted" };

export function PlanoView({ basePath, map, occupancy, from, to, today, season, kindLabels, sectorNames, showPayments }: Props) {
  const router = useRouter();
  const [selected, setSelected] = React.useState<Selection | null>(null);
  const [query, setQuery] = React.useState("");
  const [flash, setFlash] = React.useState("");

  const unit = selected?.type === "unit" ? map.units.find((u) => u.id === selected.id) : undefined;
  const occ = unit ? occupancy[unit.id] : undefined;

  const counts = React.useMemo(() => {
    const c: Record<UnitStatus, number> = { disponible: 0, ocupada: 0, reservada: 0, fuera: 0 };
    for (const u of map.units) c[occupancy[u.id]?.status ?? "disponible"]++;
    return c;
  }, [map.units, occupancy]);

  const highlight = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return undefined;
    return new Set(
      map.units
        .filter((u) => u.code.toLowerCase().includes(q) || occupancy[u.id]?.bookings.some((b) => b.customerName.toLowerCase().includes(q)))
        .map((u) => u.id),
    );
  }, [query, map.units, occupancy]);

  const href = (params: Record<string, string>) => `${basePath}?${new URLSearchParams({ vista: map.map, desde: from, hasta: to, ...params })}`;
  const presets = [
    { label: "Hoy", desde: today, hasta: today },
    { label: "Próximos 7 días", desde: today, hasta: addDays(today, 6) },
    ...(season.start && season.end ? [{ label: "Temporada", desde: season.start, hasta: season.end }] : []),
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <nav className="flex w-fit rounded-xl border border-line bg-white p-1" aria-label="Planos del balneario">
          {MAPS.map((m) => (
            <Link
              key={m.id}
              href={`${basePath}?${new URLSearchParams({ vista: m.id, desde: from, hasta: to })}`}
              aria-current={m.id === map.map ? "page" : undefined}
              className={cn("rounded-lg px-4 py-2 text-sm font-semibold transition-colors", m.id === map.map ? "bg-navy text-white shadow-sm" : "text-mist hover:text-navy")}
            >
              {m.label}
              <span className={cn("ml-2 hidden text-xs font-medium sm:inline", m.id === map.map ? "text-foam/70" : "text-mist/70")}>{m.description}</span>
            </Link>
          ))}
        </nav>
        <form action={basePath} className="flex flex-wrap items-end gap-2" aria-label="Período a consultar">
          <input type="hidden" name="vista" value={map.map} />
          <Field label="Período" htmlFor="plano-periodo"><PeriodSelect id="plano-periodo" today={today} from={from} to={to} className="w-64" onChange={(f, t) => router.push(href({ desde: f, hasta: t }))} /></Field>
          <Field label="Desde" htmlFor="desde"><Input id="desde" name="desde" type="date" defaultValue={from} required className="w-40" /></Field>
          <Field label="Hasta" htmlFor="hasta"><Input id="hasta" name="hasta" type="date" defaultValue={to} min={from} required className="w-40" /></Field>
          <Button type="submit" variant="secondary">Ver disponibilidad</Button>
        </form>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-mist">Atajos:</span>
        {presets.map((p) => (
          <Link key={p.label} href={href({ desde: p.desde, hasta: p.hasta })} className={cn("rounded-full border px-3 py-1 font-semibold", p.desde === from && p.hasta === to ? "border-navy bg-navy text-white" : "border-line bg-white hover:border-sea")}>
            {p.label}
          </Link>
        ))}
        <span className="ml-auto text-mist">
          Período: <strong className="text-ink">{from === to ? formatDate(from) : `${formatDate(from)} al ${formatDate(to)}`}</strong>
        </span>
      </div>

      {flash ? <Alert tone="success">{flash}</Alert> : null}

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-line px-4 py-3 md:flex-row md:items-center md:justify-between">
          <PlanoLegend showPayment={showPayments} />
          <div className="relative w-full md:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-mist" aria-hidden />
            <Input aria-label="Buscar unidad o cliente en el plano" placeholder="Buscar unidad o cliente" className="h-9 pl-9" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
        </div>
        {map.units.length || map.elements.length ? (
          <ZoomFrame width={map.width} height={map.height}>
            {(cellPx) => (
            <MapCanvas
              cellPx={cellPx}
              ariaLabel={`Plano de ${map.map}. Seleccioná una unidad para ver su ficha.`}
              width={map.width}
              height={map.height}
              sectors={map.sectors}
              elements={map.elements}
              units={map.units}
              occupancy={occupancy}
              selected={selected}
              highlight={highlight}
              onSelect={(s) => setSelected(s?.type === "unit" ? s : null)}
            />
            )}
          </ZoomFrame>
        ) : (
          <div className="p-10 text-center text-sm text-mist">Este plano todavía no tiene unidades. El dueño o un administrador autorizado puede diseñarlo desde el editor.</div>
        )}
        <dl className="grid grid-cols-2 border-t border-line text-center sm:grid-cols-4">
          {(Object.keys(counts) as UnitStatus[]).map((s) => (
            <div key={s} className="border-line px-3 py-3 [&:not(:last-child)]:border-r">
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-mist">{STATUS_META[s].label}</dt>
              <dd className="text-xl font-extrabold text-navy tabular-nums">{counts[s]}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Sheet
        open={!!unit}
        onOpenChange={(o) => !o && setSelected(null)}
        title={unit?.code ?? ""}
        description={
          unit ? (
            <span className="flex flex-wrap items-center gap-1.5">
              <Badge tone="info">{kindLabels[unit.kind] ?? unit.kind}</Badge>
              {occ ? <Badge tone={STATUS_TONE[occ.status]}>{STATUS_META[occ.status].label}</Badge> : null}
              {unit.sectorId && sectorNames[unit.sectorId] ? <span>· {sectorNames[unit.sectorId]}</span> : null}
              {unit.rowLabel ? <span>· Fila {unit.rowLabel}</span> : null}
            </span>
          ) : null
        }
      >
        {unit && occ ? (
          <UnitDetail
            key={unit.id}
            basePath={basePath}
            unit={{ id: unit.id, code: unit.code, outOfService: unit.outOfService, reason: unit.outOfServiceReason }}
            occ={occ}
            showPayments={showPayments}
            from={from}
            to={to}
            onChanged={(msg) => {
              setFlash(msg);
              setSelected(null);
              router.refresh();
            }}
          />
        ) : null}
      </Sheet>
    </div>
  );
}

function UnitDetail({
  basePath, unit, occ, from, to, onChanged, showPayments,
}: {
  showPayments: boolean;
  basePath: string;
  unit: { id: string; code: string; outOfService: boolean; reason: string };
  occ: UnitOccupancy;
  from: string;
  to: string;
  onChanged: (msg: string) => void;
}) {
  const [booking, setBooking] = React.useState(false);
  const [payingId, setPayingId] = React.useState<string | null>(null);

  if (booking) {
    return (
      <ReservationWizard
        initialUnit={{ id: unit.id, code: unit.code }}
        allowPayment={showPayments}
        from={from}
        to={to}
        onCancel={() => setBooking(false)}
        onDone={(r) => onChanged(`Reserva #${r.number} creada para ${unit.code}.`)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-mist">
        Período consultado: {from === to ? formatDate(from) : `${formatDate(from)} al ${formatDate(to)}`}
      </p>
      {unit.outOfService ? (
        <Alert tone="warning" title="Fuera de servicio">{unit.reason || "Sin motivo indicado."} No se pueden crear reservas nuevas.</Alert>
      ) : null}

      {occ.bookings.length ? (
        <div className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-wide text-mist">Reservas en el período</p>
          {occ.bookings.map((b) => {
            const ps = paymentState(b.totalCents, b.paidCents);
            return (
              <div key={b.reservationId} className="rounded-xl border border-line p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold text-navy">Reserva #{b.number}</p>
                    <p className="text-xs text-mist">{formatDate(b.startDate)} al {formatDate(b.endDate)}</p>
                  </div>
                  <Badge tone={RES_STATUS[b.status].tone}>{RES_STATUS[b.status].label}</Badge>
                </div>
                <div className="mt-3 rounded-lg bg-sand/50 p-2.5 text-sm">
                  <Link href={`${basePath.replace("/plano", "")}/clientes/${b.customerId}`} className="font-semibold text-navy hover:underline">{b.customerName}</Link>
                  {b.customerPhone ? (
                    <a href={`tel:${b.customerPhone.replace(/[^\d+]/g, "")}`} className="mt-0.5 flex items-center gap-1 text-xs text-sea"><Phone className="size-3" /> {b.customerPhone}</a>
                  ) : null}
                </div>
                <dl className={cn("mt-3 grid gap-2 text-center text-xs", showPayments ? "grid-cols-3" : "grid-cols-1")}>
                  <div><dt className="text-mist">Total</dt><dd className="font-bold tabular-nums">{formatMoney(b.totalCents)}</dd></div>
                  {showPayments ? (
                    <>
                      <div><dt className="text-mist">Pagado</dt><dd className="font-bold tabular-nums text-st-free">{formatMoney(b.paidCents)}</dd></div>
                      <div><dt className="text-mist">Saldo</dt><dd className={cn("font-bold tabular-nums", b.balanceCents > 0 ? "text-st-busy" : "")}>{formatMoney(b.balanceCents)}</dd></div>
                    </>
                  ) : null}
                </dl>
                {showPayments ? (
                  <div className="mt-2 flex items-center justify-between">
                    <Badge tone={ps.tone}>{ps.label}</Badge>
                  </div>
                ) : null}
                {payingId === b.reservationId ? (
                  <QuickPayment reservationId={b.reservationId} balance={b.balanceCents} onCancel={() => setPayingId(null)} onDone={() => onChanged(`Cobro registrado en la reserva #${b.number}.`)} />
                ) : (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" asChild>
                      <Link href={`${basePath.replace("/plano", "")}/reservas/${b.reservationId}`}><ExternalLink /> Ver reserva</Link>
                    </Button>
                    {showPayments && b.balanceCents > 0 ? (
                      <>
                        <Button size="sm" variant="secondary" onClick={() => setPayingId(b.reservationId)}><Wallet /> Registrar cobro</Button>
                        <Button size="sm" variant="ghost" asChild>
                          <Link href={`${basePath.replace("/plano", "")}/reservas/${b.reservationId}#cobro-qr`}>Cobrar con QR</Link>
                        </Button>
                      </>
                    ) : null}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : !unit.outOfService ? (
        <div className="rounded-xl border border-dashed border-st-free/40 bg-st-free-bg/50 p-4 text-sm">
          <p className="font-semibold text-[#1f7a50]">Disponible en todo el período</p>
          <p className="mt-1 text-xs text-mist">Podés reservarla ahora. Si hay otras reservas fuera de este período, no se ven afectadas.</p>
        </div>
      ) : null}

      {!unit.outOfService ? (
        <Button className="w-full" onClick={() => setBooking(true)}>
          <CalendarPlus /> {occ.bookings.length ? "Reservar otras fechas" : "Nueva reserva"}
        </Button>
      ) : (
        <p className="flex items-center gap-2 text-xs text-mist"><Wrench className="size-3.5" /> Para habilitarla, el dueño debe cambiar su estado en el editor del plano.</p>
      )}
    </div>
  );
}

function QuickPayment({ reservationId, balance, onCancel, onDone }: { reservationId: string; balance: number; onCancel: () => void; onDone: () => void }) {
  const [amount, setAmount] = React.useState(String(balance / 100).replace(".", ","));
  const [method, setMethod] = React.useState("efectivo");
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  return (
    <div className="mt-3 space-y-2 rounded-lg border border-line bg-white p-3">
      <div className="grid grid-cols-2 gap-2">
        <Field label="Importe ($)" htmlFor={`qp-a-${reservationId}`} hint={`Saldo: ${formatMoney(balance)}`}><Input id={`qp-a-${reservationId}`} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="Medio" htmlFor={`qp-m-${reservationId}`}>
          <Select id={`qp-m-${reservationId}`} value={method} onChange={(e) => setMethod(e.target.value)}>
            {["efectivo", "transferencia", "tarjeta", "otro"].map((m) => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}
          </Select>
        </Field>
      </div>
      {error ? <p className="text-xs text-st-busy" role="alert">{error}</p> : null}
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancelar</Button>
        <Button
          size="sm"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const r = await registerPaymentAction({ reservationId, amount, method, notes: "" });
            setBusy(false);
            if (r.ok) onDone();
            else setError(r.error);
          }}
        >
          {busy ? "Registrando…" : "Registrar cobro"}
        </Button>
      </div>
    </div>
  );
}
