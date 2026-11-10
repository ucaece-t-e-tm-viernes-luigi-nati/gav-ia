"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Field, Input, SubmitButton } from "@/components/ui/form";
import { loginAction, type LoginState } from "@/server/actions/auth";

export function LoginForm() {
  const [state, action] = useActionState<LoginState, FormData>(loginAction, {});
  return (
    <form action={action} className="mt-8 flex flex-col gap-4" noValidate>
      <Field label="Correo electrónico" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required defaultValue={state.email} />
      </Field>
      <Field label="Contraseña" htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      {state.error ? (
        <p role="alert" className="rounded-lg bg-st-busy-bg px-3 py-2 text-sm text-[#9b2f2c]">
          {state.error}
        </p>
      ) : null}
      <SubmitButton size="lg" pendingText="Ingresando…">Ingresar</SubmitButton>
      <Link href="/cuenta/recuperar" className="text-center text-xs font-semibold text-sea hover:underline">¿Olvidaste tu contraseña?</Link>
    </form>
  );
}
