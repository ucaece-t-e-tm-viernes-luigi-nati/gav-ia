"use client";

import * as React from "react";
import { Check, Plus, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Alert, Badge } from "@/components/ui/primitives";
import { PeriodSelect } from "@/components/ui/period-select";
import { createReservationAction, freeUnitsAction } from "@/server/actions/reservas";
import { choiceReady, CustomerPicker, emptyChoice, type CustomerChoice } from "./customer-picker";
import { formatMoney, parseMoney } from "@/lib/money";
import { daysBetweenInclusive, formatDate } from "@/lib/dates";
import { cn } from "@/lib/utils";

type UnitRef = { id: string; code: string };

function Step({ n, title, children, done }: { n: number; title: string; children: React.ReactNode; done?: boolean }) {
  return (
    <section className="relative border-l border-line pb-5 pl-6 last:pb-0">
      <span className={cn("absolute -left-3 top-0 grid size-6 place-items-center rounded-full text-[11px] font-bold", done ? "bg-st-free text-white" : "bg-navy text-white")}>
        {done ? <Check className="size-3.5" /> : n}
      </span>
      <h3 className="mb-2 text-sm font-bold text-navy">{title}</h3>
      {children}
    </section>
  );
}

export function ReservationWizard({
  initialUnit,
  from,
  to,
  onDone,
  onCancel,
  allowPayment = true,
}: {
  /** Sin el módulo de pagos (plan PLUS) no se registran cobros al crear la reserva. */
  allowPayment?: boolean;
  initialUnit?: UnitRef;
  from: string;
  to: string;
  onDone: (r: { id: string; number: number }) => void;
  onCancel?: () => void;
}) {
  const [start, setStart] = React.useState(from);
  const [end, setEnd] = React.useState(to);
  const [units, setUnits] = React.useState<UnitRef[]>(initialUnit ? [initialUnit] : []);
  const [free, setFree] = React.useState<{ id: string; code: string; map: string }[]>([]);
  const [holder, setHolder] = React.useState<CustomerChoice>(emptyChoice);
  const [shared, setShared] = React.useState(false);
  const [coHolder, setCoHolder] = React.useState<CustomerChoice>(emptyChoice);
  const [total, setTotal] = React.useState("");
  const [paymentMode, setPaymentMode] = React.useState<"ninguno" | "parcial" | "total">("ninguno");
  const [paymentAmount, setPaymentAmount] = React.useState("");
  const [paymentMethod, setPaymentMethod] = React.useState<"efectivo" | "transferencia" | "tarjeta" | "otro">("efectivo");
  const [status, setStatus] = React.useState<"pendiente" | "confirmada">("pendiente");
  const [notes, setNotes] = React.useState("");
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!start || !end || end < start) return;
    let alive = true;
    freeUnitsAction(start, end).then((r) => alive && setFree(r));
    return () => {
      alive = false;
    };
  }, [start, end]);

  const unitsUnavailable = units.filter((u) => free.length && !free.some((f) => f.id === u.id));
  const totalCents = parseMoney(total);
  const nights = start && end && end >= start ? daysBetweenInclusive(start, end) : 0;

  const submit = async () => {
    setError("");
    setBusy(true);
    const res = await createReservationAction({
      unitIds: units.map((u) => u.id),
      startDate: start,
      endDate: end,
      customerId: holder.creating ? null : (holder.customer?.id ?? null),
      newCustomer: holder.creating ? holder.nc : null,
      coCustomerId: shared && !coHolder.creating ? (coHolder.customer?.id ?? null) : null,
      coNewCustomer: shared && coHolder.creating ? coHolder.nc : null,
      total,
      status,
      paymentMode,
      paymentAmount,
      paymentMethod,
      notes,
    });
    setBusy(false);
    if (res.ok) onDone(res.data!);
    else setError(res.error);
  };

  return (
    <div className="space-y-1">
      <Step n={1} title="Fechas" done={!!start && !!end && end >= start}>
        <Field label="Período" htmlFor="w-period" className="mb-2">
          <PeriodSelect id="w-period" from={start} to={end} onChange={(f, t) => { setStart(f); setEnd(t); }} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Desde" htmlFor="w-start"><Input id="w-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
          <Field label="Hasta" htmlFor="w-end"><Input id="w-end" type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} /></Field>
        </div>
        {nights ? <p className="mt-1 text-xs text-mist">{nights} {nights === 1 ? "día" : "días"} · del {formatDate(start)} al {formatDate(end)}</p> : null}
      </Step>

      <Step n={2} title="Cliente" done={choiceReady(holder)}>
        <CustomerPicker idPrefix="nc" value={holder} onChange={setHolder} />
        {shared ? (
          <div className="mt-3 rounded-lg border border-dashed border-line p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wide text-mist">Segundo cliente (carpa compartida)</p>
              <Button size="sm" variant="ghost" onClick={() => { setShared(false); setCoHolder(emptyChoice()); }}><X /> Quitar</Button>
            </div>
            <CustomerPicker idPrefix="co" value={coHolder} onChange={setCoHolder} exclude={holder.customer ? [holder.customer.id] : undefined} />
          </div>
        ) : (
          <Button size="sm" variant="link" className="mt-2 px-0" onClick={() => setShared(true)}><Users /> Carpa compartida: agregar otro cliente</Button>
        )}
      </Step>
      <Step n={3} title="Unidades" done={units.length > 0 && !unitsUnavailable.length}>
        <div className="flex flex-wrap gap-1.5">
          {units.map((u) => (
            <span key={u.id} className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold", unitsUnavailable.includes(u) ? "border-st-busy bg-st-busy-bg text-[#9b2f2c]" : "border-[#c4e2f4] bg-foam text-navy")}>
              {u.code}
              <button type="button" aria-label={`Quitar ${u.code}`} onClick={() => setUnits(units.filter((x) => x.id !== u.id))}><X className="size-3" /></button>
            </span>
          ))}
        </div>
        {unitsUnavailable.length ? <p className="mt-1 text-xs text-st-busy">{unitsUnavailable.map((u) => u.code).join(", ")} no está disponible en esas fechas.</p> : null}
        <div className="mt-2 flex items-center gap-2">
          <Plus className="size-4 text-mist" aria-hidden />
          <Select
            aria-label="Agregar unidad"
            value=""
            onChange={(e) => {
              const f = free.find((x) => x.id === e.target.value);
              if (f && !units.some((u) => u.id === f.id)) setUnits([...units, { id: f.id, code: f.code }]);
            }}
          >
            <option value="">Agregar otra unidad disponible (ej. una cochera)…</option>
            {free.filter((f) => !units.some((u) => u.id === f.id)).map((f) => (
              <option key={f.id} value={f.id}>{f.code} · {f.map === "playa" ? "Playa" : "Cocheras"}</option>
            ))}
          </Select>
        </div>
      </Step>

      <Step n={4} title={allowPayment ? "Importe y pago" : "Importe"} done={totalCents !== null}>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Importe total ($)" htmlFor="w-total" hint={totalCents !== null ? formatMoney(totalCents) : "Ej.: 250.000"}>
            <Input id="w-total" inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} />
          </Field>
          {allowPayment ? (
          <Field label="Pago recibido" htmlFor="w-pay">
            <Select id="w-pay" value={paymentMode} onChange={(e) => setPaymentMode(e.target.value as typeof paymentMode)}>
              <option value="ninguno">Sin pago por ahora</option>
              <option value="parcial">Seña / pago parcial</option>
              <option value="total">Pago total</option>
            </Select>
          </Field>
          ) : null}
          {allowPayment && paymentMode !== "ninguno" ? (
            <>
              {paymentMode === "parcial" ? (
                <Field label="Importe pagado ($)" htmlFor="w-amount"><Input id="w-amount" inputMode="decimal" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} /></Field>
              ) : null}
              <Field label="Medio de pago" htmlFor="w-method">
                <Select id="w-method" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)}>
                  <option value="efectivo">Efectivo</option>
                  <option value="transferencia">Transferencia</option>
                  <option value="tarjeta">Tarjeta (posnet)</option>
                  <option value="otro">Otro</option>
                </Select>
              </Field>
            </>
          ) : null}
        </div>
        {allowPayment ? <p className="mt-1 text-xs text-mist">Los cobros con QR de Mercado Pago se inician desde la ficha de la reserva, una vez creada.</p> : null}
      </Step>

      <Step n={5} title="Confirmación">
        <div className="space-y-2">
          <Field label="Estado de la reserva" htmlFor="w-status">
            <Select id="w-status" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
              <option value="pendiente">Pendiente de confirmación</option>
              <option value="confirmada">Confirmada</option>
            </Select>
          </Field>
          <Field label="Notas" htmlFor="w-notes"><Textarea id="w-notes" value={notes} maxLength={1000} onChange={(e) => setNotes(e.target.value)} /></Field>
          {totalCents !== null && units.length ? (
            <div className="rounded-lg bg-sand/50 p-3 text-xs">
              <p><strong>{units.map((u) => u.code).join(" + ")}</strong> · {formatDate(start)} al {formatDate(end)}</p>
              <p className="mt-1">
                Total {formatMoney(totalCents)}{allowPayment ? " · " : " "}
                {!allowPayment ? null : paymentMode === "total" ? "pagado en su totalidad" : paymentMode === "parcial" ? `pago parcial ${formatMoney(parseMoney(paymentAmount) ?? 0)}` : "sin pagos"}{" "}
                <Badge tone={status === "confirmada" ? "info" : "warning"} className="ml-1">{status === "confirmada" ? "Confirmada" : "Pendiente"}</Badge>
              </p>
            </div>
          ) : null}
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <div className="flex justify-end gap-2 pt-1">
            {onCancel ? <Button variant="outline" onClick={onCancel}>Cancelar</Button> : null}
            <Button onClick={submit} disabled={busy || !units.length}>{busy ? "Guardando…" : "Confirmar reserva"}</Button>
          </div>
        </div>
      </Step>
    </div>
  );
}
