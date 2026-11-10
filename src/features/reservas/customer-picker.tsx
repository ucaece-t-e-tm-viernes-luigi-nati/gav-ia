"use client";

import * as React from "react";
import { Search, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { searchCustomersAction } from "@/server/actions/reservas";

export type CustomerOpt = { id: string; name: string; phone: string; email: string };
export type NewCustomer = { firstName: string; lastName: string; phone: string; email: string };
export type CustomerChoice = { customer: CustomerOpt | null; creating: boolean; nc: NewCustomer };

export const emptyChoice = (): CustomerChoice => ({ customer: null, creating: false, nc: { firstName: "", lastName: "", phone: "", email: "" } });
export const choiceReady = (c: CustomerChoice) => (c.creating ? !!c.nc.firstName.trim() : !!c.customer);

/** Buscar un cliente existente o cargar uno nuevo. */
export function CustomerPicker({ value, onChange, idPrefix, exclude }: { value: CustomerChoice; onChange: (v: CustomerChoice) => void; idPrefix: string; exclude?: string[] }) {
  const [q, setQ] = React.useState("");
  const [results, setResults] = React.useState<CustomerOpt[]>([]);
  const excluded = (exclude ?? []).join(",");

  React.useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    const h = setTimeout(() => searchCustomersAction(q).then((r) => setResults(r.filter((c) => !excluded.split(",").includes(c.id)))), 250);
    return () => clearTimeout(h);
  }, [q, excluded]);

  const { customer, creating, nc } = value;
  if (customer && !creating) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-line bg-sand/40 px-3 py-2 text-sm">
        <div>
          <p className="font-semibold">{customer.name}</p>
          <p className="text-xs text-mist">{customer.phone || customer.email || "Sin contacto"}</p>
        </div>
        <Button size="sm" variant="ghost" onClick={() => onChange({ ...value, customer: null })}>Cambiar</Button>
      </div>
    );
  }
  if (creating) {
    const set = (k: keyof NewCustomer) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...value, nc: { ...nc, [k]: e.target.value } });
    return (
      <div className="grid grid-cols-2 gap-2">
        <Field label="Nombre" htmlFor={`${idPrefix}-first`}><Input id={`${idPrefix}-first`} value={nc.firstName} onChange={set("firstName")} /></Field>
        <Field label="Apellido" htmlFor={`${idPrefix}-last`}><Input id={`${idPrefix}-last`} value={nc.lastName} onChange={set("lastName")} /></Field>
        <Field label="Teléfono / WhatsApp" htmlFor={`${idPrefix}-phone`}><Input id={`${idPrefix}-phone`} value={nc.phone} onChange={set("phone")} placeholder="+54 9 ..." /></Field>
        <Field label="Correo" htmlFor={`${idPrefix}-email`}><Input id={`${idPrefix}-email`} type="email" value={nc.email} onChange={set("email")} /></Field>
        <Button size="sm" variant="link" className="col-span-2 justify-start" onClick={() => onChange({ ...value, creating: false })}>Buscar un cliente existente</Button>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-mist" aria-hidden />
        <Input aria-label="Buscar cliente" className="pl-9" placeholder="Nombre, teléfono o correo" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {results.length ? (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {results.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => onChange({ ...value, customer: c })} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-foam/40">
                <span className="font-medium">{c.name}</span>
                <span className="text-xs text-mist">{c.phone}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : q.trim().length >= 2 ? (
        <p className="text-xs text-mist">Sin resultados para “{q}”.</p>
      ) : null}
      <Button
        size="sm"
        variant="outline"
        onClick={() => onChange({ ...value, creating: true, nc: { ...nc, firstName: q.split(" ")[0] ?? "", lastName: q.split(" ").slice(1).join(" ") } })}
      >
        <UserPlus /> Nuevo cliente
      </Button>
    </div>
  );
}
