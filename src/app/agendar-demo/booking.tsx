"use client";

import * as React from "react";
import Link from "next/link";
import { CalendarCheck2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form";
import { Alert } from "@/components/ui/primitives";
import { bookDemoAction } from "@/server/actions/demos";
import { formatDate, formatTime } from "@/lib/dates";
import { cn } from "@/lib/utils";

type Day = { date: string; slots: string[] };

export function DemoBooking({ days }: { days: Day[] }) {
  const [day, setDay] = React.useState(days[0]?.date ?? "");
  const [slot, setSlot] = React.useState("");
  const [f, setF] = React.useState({ name: "", business: "", email: "", phone: "", city: "", notes: "", website: "" });
  const [error, setError] = React.useState("");
  const [done, setDone] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const current = days.find((d) => d.date === day);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  if (done) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl bg-white p-10 text-center shadow-sm">
        <CheckCircle2 className="size-12 text-st-free" />
        <p className="text-xl font-extrabold text-navy">¡Demo agendada!</p>
        <p className="text-sm text-mist">Te esperamos el <strong>{done}</strong> (hora argentina). Te vamos a contactar para confirmar el medio de la reunión.</p>
        <Button asChild variant="outline"><Link href="/">Volver al inicio</Link></Button>
      </div>
    );
  }

  if (!days.length) return <Alert tone="warning">No hay turnos disponibles en este momento. Escribinos desde el formulario de contacto.</Alert>;

  return (
    <form
      className="grid gap-6 rounded-2xl bg-white p-6 shadow-sm lg:grid-cols-[1.1fr_1fr] lg:p-8"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!slot) return setError("Elegí un día y un horario.");
        setBusy(true);
        setError("");
        const r = await bookDemoAction({ ...f, slot });
        setBusy(false);
        if (r.ok) setDone(r.data?.when ?? "");
        else setError(r.error);
      }}
    >
      <div>
        <p className="text-sm font-bold text-navy">1. Elegí el día</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {days.map((d) => (
            <button
              key={d.date}
              type="button"
              onClick={() => { setDay(d.date); setSlot(""); }}
              aria-pressed={d.date === day}
              className={cn("rounded-xl border px-3 py-2 text-left text-xs font-semibold capitalize", d.date === day ? "border-navy bg-navy text-white" : "border-line bg-white hover:border-sea")}
            >
              {formatDate(d.date, { weekday: "short", day: "numeric", month: "short" })}
            </button>
          ))}
        </div>
        <p className="mt-6 text-sm font-bold text-navy">2. Elegí el horario <span className="font-normal text-mist">(hora argentina, 30 minutos)</span></p>
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {current?.slots.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSlot(s)}
              aria-pressed={s === slot}
              className={cn("rounded-lg border py-2 text-sm font-semibold tabular-nums", s === slot ? "border-sea bg-sea text-white" : "border-line hover:border-sea")}
            >
              {formatTime(s)}
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs text-mist">Turnos de lunes a viernes de 09:00 a 17:00, con al menos 24 horas de anticipación.</p>
      </div>
      <div className="space-y-3">
        <p className="text-sm font-bold text-navy">3. Tus datos</p>
        <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden value={f.website} onChange={set("website")} />
        <Field label="Nombre y apellido" htmlFor="d-name"><Input id="d-name" required autoComplete="name" value={f.name} onChange={set("name")} /></Field>
        <Field label="Balneario" htmlFor="d-biz"><Input id="d-biz" required value={f.business} onChange={set("business")} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Correo" htmlFor="d-email"><Input id="d-email" type="email" required autoComplete="email" value={f.email} onChange={set("email")} /></Field>
          <Field label="Teléfono / WhatsApp" htmlFor="d-phone"><Input id="d-phone" required autoComplete="tel" value={f.phone} onChange={set("phone")} /></Field>
        </div>
        <Field label="Localidad" htmlFor="d-city"><Input id="d-city" value={f.city} onChange={set("city")} /></Field>
        <Field label="¿Algo que quieras contarnos?" htmlFor="d-notes"><Textarea id="d-notes" rows={3} value={f.notes} onChange={set("notes")} /></Field>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          <CalendarCheck2 /> {busy ? "Agendando…" : slot ? `Agendar demo · ${formatDate(slot, { weekday: "long", day: "numeric", month: "long" })} ${formatTime(slot)}` : "Agendar demo gratuita"}
        </Button>
      </div>
    </form>
  );
}
