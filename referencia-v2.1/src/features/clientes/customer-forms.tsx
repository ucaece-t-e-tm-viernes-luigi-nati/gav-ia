"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Pencil, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Alert } from "@/components/ui/primitives";
import { Dialog, DialogContent } from "@/components/ui/overlay";
import { addInteractionAction, saveCustomerAction } from "@/server/actions/clientes";

type CustomerData = { id: string | null; firstName: string; lastName: string; phone: string; whatsapp: string; email: string; documentId: string; address: string; notes: string };
const EMPTY: CustomerData = { id: null, firstName: "", lastName: "", phone: "", whatsapp: "", email: "", documentId: "", address: "", notes: "" };

export function CustomerDialog({ initial, sensitive, base }: { initial?: CustomerData; sensitive: boolean; base: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [f, setF] = React.useState<CustomerData>(initial ?? EMPTY);
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const set = (k: keyof CustomerData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant={initial ? "outline" : "primary"} size={initial ? "sm" : "md"} onClick={() => setOpen(true)}>
        {initial ? <><Pencil /> Editar ficha</> : <><UserPlus /> Nuevo cliente</>}
      </Button>
      <DialogContent title={initial ? "Editar cliente" : "Nuevo cliente"}>
        <form
          className="grid grid-cols-2 gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const r = await saveCustomerAction(f);
            setBusy(false);
            if (!r.ok) return setError(r.error);
            setOpen(false);
            if (!initial && r.data) router.push(`${base}/${r.data.id}`);
            else router.refresh();
          }}
        >
          <Field label="Nombre" htmlFor="c-first"><Input id="c-first" required value={f.firstName} onChange={set("firstName")} /></Field>
          <Field label="Apellido" htmlFor="c-last"><Input id="c-last" value={f.lastName} onChange={set("lastName")} /></Field>
          <Field label="Teléfono" htmlFor="c-phone"><Input id="c-phone" value={f.phone} onChange={set("phone")} /></Field>
          <Field label="WhatsApp" htmlFor="c-wa"><Input id="c-wa" value={f.whatsapp} onChange={set("whatsapp")} /></Field>
          <Field label="Correo" htmlFor="c-email" className="col-span-2"><Input id="c-email" type="email" value={f.email} onChange={set("email")} /></Field>
          {sensitive ? (
            <>
              <Field label="DNI / documento" htmlFor="c-doc"><Input id="c-doc" value={f.documentId} onChange={set("documentId")} /></Field>
              <Field label="Domicilio" htmlFor="c-addr"><Input id="c-addr" value={f.address} onChange={set("address")} /></Field>
            </>
          ) : null}
          <Field label="Notas" htmlFor="c-notes" className="col-span-2"><Textarea id="c-notes" value={f.notes} onChange={set("notes")} /></Field>
          {error ? <Alert tone="danger" className="col-span-2">{error}</Alert> : null}
          <div className="col-span-2 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={busy}>{busy ? "Guardando…" : "Guardar"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function InteractionForm({ customerId }: { customerId: string }) {
  const router = useRouter();
  const [kind, setKind] = React.useState("llamada");
  const [summary, setSummary] = React.useState("");
  const [error, setError] = React.useState("");
  return (
    <form
      className="space-y-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await addInteractionAction({ customerId, kind, summary });
        if (!r.ok) return setError(r.error);
        setSummary("");
        setError("");
        router.refresh();
      }}
    >
      <div className="flex gap-2">
        <Select aria-label="Tipo de interacción" value={kind} onChange={(e) => setKind(e.target.value)} className="w-36">
          <option value="llamada">Llamada</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="email">Correo</option>
          <option value="reunion">Reunión</option>
          <option value="nota">Nota</option>
        </Select>
        <Input aria-label="Resumen" placeholder="Resumen de la interacción" value={summary} onChange={(e) => setSummary(e.target.value)} />
        <Button type="submit" size="md" variant="secondary">Agregar</Button>
      </div>
      {error ? <p className="text-xs text-st-busy">{error}</p> : null}
    </form>
  );
}
