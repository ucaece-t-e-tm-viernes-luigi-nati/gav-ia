"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeftRight, Ban, Pencil, Trash2, UserPlus, Wallet, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Alert } from "@/components/ui/primitives";
import { ConfirmButton, Dialog, DialogContent } from "@/components/ui/overlay";
import { addCoHolderAction, cancelReservationAction, changeReservationUnitAction, deleteReservationAction, removeCoHolderAction, freeUnitsAction, registerPaymentAction, updateReservationAction, voidPaymentAction } from "@/server/actions/reservas";
import { centsToInput, formatMoney } from "@/lib/money";
import { METHOD_LABEL } from "./labels";
import { choiceReady, CustomerPicker, emptyChoice } from "./customer-picker";

export function useFlash() {
  const [msg, setMsg] = React.useState<{ tone: "success" | "danger"; text: string } | null>(null);
  return { msg, ok: (text: string) => setMsg({ tone: "success", text }), fail: (text: string) => setMsg({ tone: "danger", text }) };
}

export function ReservationControls({
  reservation,
}: {
  reservation: { id: string; startDate: string; endDate: string; totalCents: number; status: string; notes: string };
}) {
  const router = useRouter();
  const flash = useFlash();
  const [edit, setEdit] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [form, setForm] = React.useState({
    startDate: reservation.startDate,
    endDate: reservation.endDate,
    total: centsToInput(reservation.totalCents),
    status: reservation.status === "cancelada" ? "pendiente" : reservation.status,
    notes: reservation.notes,
  });
  const [busy, setBusy] = React.useState(false);
  const cancelled = reservation.status === "cancelada";

  return (
    <div className="space-y-3">
      {flash.msg ? <Alert tone={flash.msg.tone}>{flash.msg.text}</Alert> : null}
      {!cancelled ? (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setEdit(true)}><Pencil /> Modificar</Button>
          <ConfirmButton
            trigger={<Button variant="ghost" size="sm" className="text-st-busy"><Ban /> Cancelar reserva</Button>}
            title="¿Cancelar esta reserva?"
            description="Las unidades quedan liberadas para esas fechas. La cancelación queda registrada en la auditoría y no se puede deshacer."
            confirmLabel="Cancelar reserva"
            onConfirm={async () => {
              const r = await cancelReservationAction({ id: reservation.id, reason });
              if (!r.ok) {
                flash.fail(r.error);
                return false;
              }
              flash.ok(r.message!);
              router.refresh();
            }}
          >
            <Field label="Motivo (obligatorio)" htmlFor="cancel-reason">
              <Textarea id="cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
            {flash.msg?.tone === "danger" ? <p className="mt-2 text-xs text-st-busy">{flash.msg.text}</p> : null}
          </ConfirmButton>
        </div>
      ) : null}
      <Dialog open={edit} onOpenChange={setEdit}>
        <DialogContent title="Modificar reserva" description="Si cambiás las fechas, el sistema verifica que las unidades sigan disponibles.">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Desde" htmlFor="e-start"><Input id="e-start" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></Field>
            <Field label="Hasta" htmlFor="e-end"><Input id="e-end" type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></Field>
            <Field label="Importe total ($)" htmlFor="e-total"><Input id="e-total" inputMode="decimal" value={form.total} onChange={(e) => setForm({ ...form, total: e.target.value })} /></Field>
            <Field label="Estado" htmlFor="e-status">
              <Select id="e-status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="pendiente">Pendiente</option>
                <option value="confirmada">Confirmada</option>
                <option value="finalizada">Finalizada</option>
              </Select>
            </Field>
            <Field label="Notas" htmlFor="e-notes" className="col-span-2"><Textarea id="e-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          </div>
          {flash.msg?.tone === "danger" ? <Alert tone="danger" className="mt-3">{flash.msg.text}</Alert> : null}
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEdit(false)}>Volver</Button>
            <Button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const r = await updateReservationAction({ id: reservation.id, ...form, status: form.status as "pendiente" | "confirmada" | "finalizada" });
                setBusy(false);
                if (!r.ok) return flash.fail(r.error);
                flash.ok(r.message!);
                setEdit(false);
                router.refresh();
              }}
            >
              {busy ? "Guardando…" : "Guardar cambios"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Cambio de unidad (por ejemplo, de carpa) conservando importe, pagos y fechas. */
export function ChangeUnitButton({ reservationId, units, startDate, endDate }: { reservationId: string; units: { id: string; code: string; map: string }[]; startDate: string; endDate: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [from, setFrom] = React.useState(units[0]?.id ?? "");
  const [to, setTo] = React.useState("");
  const [free, setFree] = React.useState<{ id: string; code: string; map: string }[]>([]);
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    if (open) freeUnitsAction(startDate, endDate).then(setFree);
  }, [open, startDate, endDate]);
  const fromMap = units.find((u) => u.id === from)?.map;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}><ArrowLeftRight /> Cambiar unidad</Button>
      <DialogContent title="Cambiar unidad" description="Solo cambia la unidad. El importe, los pagos y las fechas se mantienen (podés modificarlos aparte).">
        <div className="space-y-3">
          <Field label="Unidad actual" htmlFor="cu-from">
            <Select id="cu-from" value={from} onChange={(e) => { setFrom(e.target.value); setTo(""); }}>
              {units.map((u) => <option key={u.id} value={u.id}>{u.code}</option>)}
            </Select>
          </Field>
          <Field label="Nueva unidad (libre en las fechas de la reserva)" htmlFor="cu-to">
            <Select id="cu-to" value={to} onChange={(e) => setTo(e.target.value)}>
              <option value="">Elegir…</option>
              {free.filter((f) => f.map === fromMap).map((f) => <option key={f.id} value={f.id}>{f.code}</option>)}
            </Select>
          </Field>
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Volver</Button>
            <Button
              disabled={!to || busy}
              onClick={async () => {
                setBusy(true);
                const r = await changeReservationUnitAction({ reservationId, fromUnitId: from, toUnitId: to });
                setBusy(false);
                if (!r.ok) return setError(r.error);
                setOpen(false);
                router.refresh();
              }}
            >
              {busy ? "Cambiando…" : "Confirmar cambio"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function PaymentForm({ reservationId, balanceCents }: { reservationId: string; balanceCents: number }) {
  const router = useRouter();
  const flash = useFlash();
  const [amount, setAmount] = React.useState(centsToInput(balanceCents));
  const [method, setMethod] = React.useState("efectivo");
  const [notes, setNotes] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  if (balanceCents <= 0) return <Alert tone="success">La reserva no tiene saldo pendiente.</Alert>;
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const r = await registerPaymentAction({ reservationId, amount, method, notes });
        setBusy(false);
        if (!r.ok) return flash.fail(r.error);
        flash.ok(r.message!);
        router.refresh();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Importe ($)" htmlFor="p-amount" hint={`Saldo pendiente: ${formatMoney(balanceCents)}`}><Input id="p-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required /></Field>
        <Field label="Medio" htmlFor="p-method">
          <Select id="p-method" value={method} onChange={(e) => setMethod(e.target.value)}>
            {["efectivo", "transferencia", "tarjeta", "otro"].map((m) => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}
          </Select>
        </Field>
        <Field label="Referencia / nota" htmlFor="p-notes"><Input id="p-notes" value={notes} maxLength={300} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" /></Field>
      </div>
      {flash.msg ? <Alert tone={flash.msg.tone}>{flash.msg.text}</Alert> : null}
      <Button type="submit" disabled={busy}><Wallet /> {busy ? "Registrando…" : "Registrar cobro"}</Button>
      <p className="text-xs text-mist">Los cobros en efectivo, transferencia o posnet se registran como movimientos internos. Quedan asociados a tu usuario.</p>
    </form>
  );
}

export function VoidPaymentButton({ paymentId }: { paymentId: string }) {
  const router = useRouter();
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState("");
  return (
    <ConfirmButton
      trigger={<Button variant="link" size="sm" className="h-auto text-st-busy">Anular</Button>}
      title="¿Anular este cobro?"
      description="El importe vuelve a quedar como saldo pendiente. La corrección queda auditada con tu usuario."
      confirmLabel="Anular cobro"
      onConfirm={async () => {
        const r = await voidPaymentAction({ paymentId, reason });
        if (!r.ok) {
          setError(r.error);
          return false;
        }
        router.refresh();
      }}
    >
      <Field label="Motivo" htmlFor={`void-${paymentId}`}><Textarea id={`void-${paymentId}`} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      {error ? <p className="mt-2 text-xs text-st-busy">{error}</p> : null}
    </ConfirmButton>
  );
}

/** Elimina la reserva (solo si no tiene cobros). El cliente se conserva. */
export function DeleteReservationButton({ reservationId, number, base, hasPayments }: { reservationId: string; number: number; base: string; hasPayments: boolean }) {
  const router = useRouter();
  const [err, setErr] = React.useState("");
  if (hasPayments) return <p className="text-xs text-mist">Esta reserva tiene cobros registrados: para conservar el historial no se puede eliminar, solo cancelar.</p>;
  return (
    <div>
      <ConfirmButton
        trigger={<Button variant="ghost" size="sm" className="text-st-busy"><Trash2 /> Eliminar reserva</Button>}
        title={`¿Eliminar la reserva #${number}?`}
        description="La reserva se borra y las unidades quedan libres. El cliente sigue en el listado de clientes. Queda registrado en la auditoría."
        confirmLabel="Eliminar"
        onConfirm={async () => {
          const r = await deleteReservationAction({ id: reservationId });
          if (!r.ok) {
            setErr(r.error);
            return false;
          }
          router.push(base);
          router.refresh();
        }}
      >
        {err ? <p className="text-xs text-st-busy">{err}</p> : null}
      </ConfirmButton>
    </div>
  );
}

/** Carpa compartida: clientes adicionales al titular. */
export function CoHolders({ reservationId, holderId, coHolders, clientsBase, editable }: { reservationId: string; holderId: string; coHolders: { id: string; name: string; phone: string }[]; clientsBase: string; editable: boolean }) {
  const router = useRouter();
  const [adding, setAdding] = React.useState(false);
  const [choice, setChoice] = React.useState(emptyChoice);
  const [err, setErr] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  return (
    <div className="space-y-2">
      {coHolders.map((c) => (
        <div key={c.id} className="flex items-center justify-between gap-2">
          <span><Link href={`${clientsBase}/${c.id}`} className="font-semibold text-sea hover:underline">{c.name}</Link>{c.phone ? <span className="block text-xs">{c.phone}</span> : null}</span>
          {editable ? (
            <Button size="icon" variant="ghost" aria-label={`Quitar a ${c.name} de la reserva`} onClick={async () => {
              if (!window.confirm(`¿Quitar a ${c.name} de esta reserva? Sigue en el listado de clientes.`)) return;
              const r = await removeCoHolderAction({ reservationId, customerId: c.id });
              if (!r.ok) setErr(r.error);
              router.refresh();
            }}><X /></Button>
          ) : null}
        </div>
      ))}
      {editable && !adding ? <Button size="sm" variant="outline" onClick={() => setAdding(true)}><UserPlus /> {coHolders.length ? "Agregar otro cliente" : "Carpa compartida: agregar cliente"}</Button> : null}
      {adding ? (
        <div className="space-y-2 rounded-lg border border-dashed border-line p-3">
          <CustomerPicker idPrefix="coh" value={choice} onChange={setChoice} exclude={[holderId, ...coHolders.map((c) => c.id)]} />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setChoice(emptyChoice()); }}>Cancelar</Button>
            <Button size="sm" disabled={busy || !choiceReady(choice)} onClick={async () => {
              setBusy(true);
              setErr("");
              const r = await addCoHolderAction({ reservationId, customerId: choice.creating ? null : choice.customer?.id, newCustomer: choice.creating ? choice.nc : null });
              setBusy(false);
              if (!r.ok) return setErr(r.error);
              setAdding(false);
              setChoice(emptyChoice());
              router.refresh();
            }}>{busy ? "Guardando…" : "Agregar"}</Button>
          </div>
        </div>
      ) : null}
      {err ? <p className="text-xs text-st-busy">{err}</p> : null}
    </div>
  );
}