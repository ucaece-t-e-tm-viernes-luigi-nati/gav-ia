"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Alert } from "@/components/ui/primitives";
import { Dialog, DialogContent } from "@/components/ui/overlay";
import { createAgendaItemAction, setReminderStatusAction } from "@/server/actions/agenda";

type Opt = { id: string; label: string };

export function NewAgendaItem({ area, date, members, related, currentUserId }: { area: "tenant" | "gavia"; date: string; members: Opt[]; related: Record<string, Opt[]>; currentUserId: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const kinds = area === "gavia" ? [["comercial", "Seguimiento comercial"], ["tarea", "Tarea interna"]] : [["tarea", "Tarea operativa"], ["cliente", "Cliente"], ["reserva", "Reserva"]];
  const [f, setF] = React.useState({ type: "recordatorio" as "recordatorio" | "evento", title: "", description: "", date, time: "10:00", kind: kinds[0][0], assignedTo: currentUserId, relatedId: "" });
  const [error, setError] = React.useState("");
  const rel = related[f.kind] ?? [];
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button onClick={() => setOpen(true)}><Plus /> Nuevo</Button>
      <DialogContent title="Nuevo recordatorio o evento">
        <form
          className="grid grid-cols-2 gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await createAgendaItemAction({ area, ...f, kind: f.kind as "tarea", assignedTo: f.assignedTo || null, relatedId: f.relatedId || null });
            if (!r.ok) return setError(r.error);
            setOpen(false);
            setF({ ...f, title: "", description: "", relatedId: "", assignedTo: currentUserId });
            router.refresh();
          }}
        >
          <Field label="Tipo" htmlFor="a-type">
            <Select id="a-type" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as typeof f.type })}>
              <option value="recordatorio">Recordatorio / tarea</option>
              <option value="evento">Evento</option>
            </Select>
          </Field>
          {f.type === "recordatorio" ? (
            <Field label="Asociado a" htmlFor="a-kind">
              <Select id="a-kind" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value, relatedId: "" })}>
                {kinds.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </Select>
            </Field>
          ) : <div />}
          <Field label="Título" htmlFor="a-title" className="col-span-2"><Input id="a-title" required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
          <Field label="Descripción" htmlFor="a-desc" className="col-span-2"><Textarea id="a-desc" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
          <Field label="Fecha" htmlFor="a-date"><Input id="a-date" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
          <Field label="Hora" htmlFor="a-time"><Input id="a-time" type="time" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} /></Field>
          {f.type === "recordatorio" ? (
            <>
              <Field label="Responsable" htmlFor="a-assignee">
                <Select id="a-assignee" value={f.assignedTo} onChange={(e) => setF({ ...f, assignedTo: e.target.value })}>
                  {members.map((m) => <option key={m.id} value={m.id}>{m.label}{m.id === currentUserId ? " (vos)" : ""}</option>)}
                </Select>
              </Field>
              {rel.length ? (
                <Field label="Relacionado con" htmlFor="a-rel">
                  <Select id="a-rel" value={f.relatedId} onChange={(e) => setF({ ...f, relatedId: e.target.value })}>
                    <option value="">Ninguno</option>
                    {rel.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                  </Select>
                </Field>
              ) : null}
            </>
          ) : null}
          {error ? <Alert tone="danger" className="col-span-2">{error}</Alert> : null}
          <div className="col-span-2 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit">Guardar</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CompleteReminder({ area, id, done }: { area: "tenant" | "gavia"; id: string; done: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      aria-label={done ? "Marcar como pendiente" : "Marcar como completado"}
      title={done ? "Marcar como pendiente" : "Marcar como completado"}
      onClick={async () => {
        setBusy(true);
        await setReminderStatusAction({ area, id, status: done ? "pendiente" : "completado" });
        setBusy(false);
        router.refresh();
      }}
      className={`grid size-5 shrink-0 place-items-center rounded-full border ${done ? "border-st-free bg-st-free text-white" : "border-line bg-white hover:border-st-free"}`}
    >
      {done ? <Check className="size-3" /> : null}
    </button>
  );
}
