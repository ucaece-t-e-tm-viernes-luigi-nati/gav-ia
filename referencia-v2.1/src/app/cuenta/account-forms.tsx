"use client";

import { useActionState } from "react";
import { Field, Input, SubmitButton } from "@/components/ui/form";
import { forgotPasswordAction, setPasswordAction, type FormState } from "@/server/actions/cuenta";

export function SetPasswordForm() {
  const [state, action] = useActionState<FormState, FormData>(setPasswordAction, {});
  return (
    <form action={action} className="mt-8 flex flex-col gap-4">
      <Field label="Contraseña nueva" htmlFor="pw" hint="Mínimo 10 caracteres.">
        <Input id="pw" name="password" type="password" autoComplete="new-password" required minLength={10} />
      </Field>
      <Field label="Repetila" htmlFor="pw2">
        <Input id="pw2" name="confirm" type="password" autoComplete="new-password" required />
      </Field>
      {state.error ? <p role="alert" className="rounded-lg bg-st-busy-bg px-3 py-2 text-sm text-[#9b2f2c]">{state.error}</p> : null}
      <SubmitButton size="lg">Guardar contraseña</SubmitButton>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action] = useActionState<FormState, FormData>(forgotPasswordAction, {});
  if (state.ok) {
    return <p className="mt-8 rounded-lg bg-st-free-bg p-4 text-sm text-[#1f7a50]">Si el correo está registrado, vas a recibir un enlace para crear una contraseña nueva. Revisá también la carpeta de spam.</p>;
  }
  return (
    <form action={action} className="mt-8 flex flex-col gap-4">
      <Field label="Correo electrónico" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      {state.error ? <p role="alert" className="rounded-lg bg-st-busy-bg px-3 py-2 text-sm text-[#9b2f2c]">{state.error}</p> : null}
      <SubmitButton size="lg" pendingText="Enviando…">Enviar enlace</SubmitButton>
    </form>
  );
}
