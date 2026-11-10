"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Pencil, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Alert, Badge } from "@/components/ui/primitives";
import { saveEmployeeAction, setEmployeeActiveAction } from "@/server/actions/gastos";

export type Employee = { id: string; full_name: string; phone: string; bank: string; account_holder: string; cbu: string; alias: string; active: boolean; paid_cents: number };

const EMPTY = { fullName: "", phone: "", bank: "", accountHolder: "", cbu: "", alias: "" };

function EmployeeForm({ initial, id, onDone }: { initial: typeof EMPTY; id?: string; onDone: () => void }) {
  const router = useRouter();
  const [f, setF] = React.useState(initial);
  const [err, setErr] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const p = id ?? "new";
  return (
    <form
      className="grid gap-2 sm:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const r = await saveEmployeeAction({ ...f, id });
        setBusy(false);
        if (!r.ok) return setErr(r.error);
        setErr("");
        if (!id) setF(EMPTY);
        router.refresh();
        onDone();
      }}
    >
      <Field label="Nombre y apellido" htmlFor={`emp-name-${p}`}><Input id={`emp-name-${p}`} required value={f.fullName} onChange={set("fullName")} /></Field>
      <Field label="Teléfono" htmlFor={`emp-phone-${p}`}><Input id={`emp-phone-${p}`} type="tel" value={f.phone} onChange={set("phone")} /></Field>
      <Field label="Banco" htmlFor={`emp-bank-${p}`}><Input id={`emp-bank-${p}`} value={f.bank} onChange={set("bank")} placeholder="Ej.: Banco Provincia" /></Field>
      <Field label="Titular de la cuenta" htmlFor={`emp-holder-${p}`}><Input id={`emp-holder-${p}`} value={f.accountHolder} onChange={set("accountHolder")} /></Field>
      <Field label="CBU / CVU" htmlFor={`emp-cbu-${p}`} hint="22 números"><Input id={`emp-cbu-${p}`} inputMode="numeric" value={f.cbu} onChange={set("cbu")} /></Field>
      <Field label="Alias" htmlFor={`emp-alias-${p}`}><Input id={`emp-alias-${p}`} value={f.alias} onChange={set("alias")} /></Field>
      {err ? <Alert tone="danger" className="sm:col-span-2">{err}</Alert> : null}
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" size="sm" disabled={busy}>{busy ? "Guardando…" : id ? "Guardar" : <><UserPlus /> Agregar empleado</>}</Button>
        {id ? <Button type="button" size="sm" variant="ghost" onClick={onDone}>Cancelar</Button> : null}
      </div>
    </form>
  );
}

/** Empleados del balneario: datos de contacto y cuenta donde se deposita el sueldo. */
export function EmployeesCard({ employees, format }: { employees: Employee[]; format: Record<string, string> }) {
  const router = useRouter();
  const [editing, setEditing] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(employees.length === 0);
  return (
    <div className="space-y-3">
      <ul className="divide-y divide-line">
        {employees.map((e) => (
          <li key={e.id} className="py-3 text-sm">
            {editing === e.id ? (
              <EmployeeForm id={e.id} initial={{ fullName: e.full_name, phone: e.phone, bank: e.bank, accountHolder: e.account_holder, cbu: e.cbu, alias: e.alias }} onDone={() => setEditing(null)} />
            ) : (
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{e.full_name} {!e.active ? <Badge tone="muted">Baja</Badge> : null}</p>
                  {e.phone ? <p className="text-xs text-mist">Tel. {e.phone}</p> : null}
                  <p className="text-xs text-mist">
                    {[e.bank, e.account_holder && `Titular: ${e.account_holder}`, e.cbu && `CBU ${e.cbu}`, e.alias && `Alias ${e.alias}`].filter(Boolean).join(" · ") || "Sin cuenta bancaria cargada"}
                  </p>
                  <p className="text-xs">Sueldos en el período: <strong>{format[e.id]}</strong></p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button size="icon" variant="ghost" aria-label={`Editar ${e.full_name}`} onClick={() => setEditing(e.id)}><Pencil /></Button>
                  <Button size="sm" variant="ghost" onClick={async () => { await setEmployeeActiveAction({ id: e.id, active: !e.active }); router.refresh(); }}>{e.active ? "Dar de baja" : "Reactivar"}</Button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
      {adding ? <EmployeeForm initial={EMPTY} onDone={() => undefined} /> : <Button size="sm" variant="outline" onClick={() => setAdding(true)}><UserPlus /> Agregar empleado</Button>}
    </div>
  );
}
