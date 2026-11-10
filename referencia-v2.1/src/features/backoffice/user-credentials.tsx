"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { setUserPasswordAction, updateUserEmailAction } from "@/server/actions/backoffice";

/** Edición de correo de ingreso y contraseña de un usuario (permiso "Usuarios"). */
export function UserCredentials({ userId, email, self }: { userId: string; email: string; self: boolean }) {
  const router = useRouter();
  const [mode, setMode] = React.useState<"" | "email" | "password">("");
  const [value, setValue] = React.useState("");
  const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = React.useState(false);

  const open = (m: "email" | "password") => {
    setMode(m);
    setValue(m === "email" ? email : "");
    setMsg(null);
  };

  if (!mode) {
    return (
      <span className="inline-flex flex-wrap gap-1">
        <Button size="sm" variant="ghost" onClick={() => open("email")}><Mail /> Cambiar correo</Button>
        {!self ? <Button size="sm" variant="ghost" onClick={() => open("password")}><KeyRound /> Definir contraseña</Button> : null}
        {msg ? <span className={msg.ok ? "text-xs text-st-free" : "text-xs text-st-busy"}>{msg.text}</span> : null}
      </span>
    );
  }

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (mode === "email" && !window.confirm(`¿Cambiar el correo de ingreso a ${value}? Desde ahora la persona ingresa con ese correo.`)) return;
        setBusy(true);
        const r = mode === "email" ? await updateUserEmailAction({ userId, email: value }) : await setUserPasswordAction({ userId, password: value });
        setBusy(false);
        if (!r.ok) return setMsg({ ok: false, text: r.error });
        setMsg({ ok: true, text: r.message ?? "Guardado." });
        setMode("");
        setValue("");
        router.refresh();
      }}
    >
      <Input
        aria-label={mode === "email" ? "Correo nuevo" : "Contraseña nueva"}
        type={mode === "email" ? "email" : "password"}
        autoComplete={mode === "email" ? "off" : "new-password"}
        minLength={mode === "password" ? 10 : undefined}
        placeholder={mode === "email" ? "correo@ejemplo.com" : "Mínimo 10 caracteres"}
        required
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="h-8 w-56 text-sm"
      />
      <Button size="sm" type="submit" disabled={busy}>{busy ? "Guardando…" : "Guardar"}</Button>
      <Button size="sm" type="button" variant="ghost" onClick={() => setMode("")}>Cancelar</Button>
      {msg && !msg.ok ? <span className="w-full text-xs text-st-busy">{msg.text}</span> : null}
    </form>
  );
}
