"use client";

import { useActionState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Field, Input, SubmitButton, Textarea } from "@/components/ui/form";
import { contactAction, type ContactState } from "@/server/actions/contacto";

export function ContactForm() {
  const [state, action] = useActionState<ContactState, FormData>(contactAction, {});
  if (state.ok) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl bg-white p-10 text-center">
        <CheckCircle2 className="size-10 text-st-free" />
        <p className="text-lg font-bold text-navy">¡Gracias! Recibimos tu consulta.</p>
        <p className="text-sm text-mist">Te vamos a contactar para coordinar una demostración.</p>
      </div>
    );
  }
  return (
    <form action={action} className="grid gap-4 rounded-2xl bg-white p-6 shadow-sm sm:grid-cols-2 sm:p-8">
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      <Field label="Nombre y apellido" htmlFor="ct-name"><Input id="ct-name" name="name" required autoComplete="name" /></Field>
      <Field label="Balneario" htmlFor="ct-biz"><Input id="ct-biz" name="business" required /></Field>
      <Field label="Correo" htmlFor="ct-email"><Input id="ct-email" name="email" type="email" required autoComplete="email" /></Field>
      <Field label="Teléfono / WhatsApp" htmlFor="ct-phone"><Input id="ct-phone" name="phone" autoComplete="tel" /></Field>
      <Field label="Localidad" htmlFor="ct-city" className="sm:col-span-2"><Input id="ct-city" name="city" placeholder="Ej.: Pinamar, Villa Gesell, Mar del Plata" /></Field>
      <Field label="¿Qué te gustaría resolver?" htmlFor="ct-msg" className="sm:col-span-2"><Textarea id="ct-msg" name="message" rows={4} /></Field>
      {state.error ? <p role="alert" className="text-sm text-st-busy sm:col-span-2">{state.error}</p> : null}
      <div className="sm:col-span-2">
        <SubmitButton size="lg" pendingText="Enviando…">Solicitar una demo</SubmitButton>
        <p className="mt-2 text-xs text-mist">Usamos tus datos solo para responder tu consulta.</p>
      </div>
    </form>
  );
}
