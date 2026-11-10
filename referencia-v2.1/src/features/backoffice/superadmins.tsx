"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ShieldPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Alert } from "@/components/ui/primitives";
import { createSuperadminAction, updateSuperadminAction } from "@/server/actions/backoffice";
import { PLATFORM_PERMISSIONS } from "@/lib/platform";

function PermissionChecks({ value, onChange, idPrefix }: { value: string[]; onChange: (v: string[]) => void; idPrefix: string }) {
  return (
    <fieldset className="grid gap-1.5 sm:grid-cols-2">
      <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-mist">Secciones habilitadas</legend>
      {PLATFORM_PERMISSIONS.map((p) => (
        <label key={p.code} htmlFor={`${idPrefix}-${p.code}`} className="flex items-start gap-2 text-sm">
          <input
            id={`${idPrefix}-${p.code}`}
            type="checkbox"
            className="mt-0.5 size-4 accent-navy"
            checked={value.includes(p.code)}
            onChange={(e) => onChange(e.target.checked ? [...value, p.code] : value.filter((x) => x !== p.code))}
          />
          {p.label}
        </label>
      ))}
    </fieldset>
  );
}

/** Alta de superadmin: ninguna sección viene marcada; se habilita cada una a mano. */
export function NewSuperadminForm() {
  const router = useRouter();
  const [f, setF] = React.useState({ email: "", fullName: "" });
  const [perms, setPerms] = React.useState<string[]>([]);
  const [res, setRes] = React.useState<{ tone: "success" | "danger"; text: string; temp?: string } | null>(null);
  const [busy, setBusy] = React.useState(false);
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const r = await createSuperadminAction({ ...f, permissions: perms });
        setBusy(false);
        if (!r.ok) return setRes({ tone: "danger", text: r.error });
        setRes({ tone: "success", text: r.message ?? "Listo.", temp: r.data?.tempPassword });
        setF({ email: "", fullName: "" });
        setPerms([]);
        router.refresh();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nombre y apellido" htmlFor="sa-name"><Input id="sa-name" required value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} /></Field>
        <Field label="Correo" htmlFor="sa-email"><Input id="sa-email" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
      </div>
      <PermissionChecks value={perms} onChange={setPerms} idPrefix="new" />
      {res ? (
        <Alert tone={res.tone}>
          {res.text}
          {res.temp ? <> Contraseña temporal (se muestra una sola vez): <code className="rounded bg-white px-1">{res.temp}</code></> : null}
        </Alert>
      ) : null}
      <Button type="submit" disabled={busy || !perms.length}><ShieldPlus /> {busy ? "Creando…" : "Crear superadmin"}</Button>
      {!perms.length ? <p className="text-xs text-mist">Marcá al menos una sección para habilitar el botón.</p> : null}
    </form>
  );
}

export function SuperadminPermissions({ userId, initial, self }: { userId: string; initial: string[]; self: boolean }) {
  const router = useRouter();
  const [perms, setPerms] = React.useState<string[]>(initial);
  const [msg, setMsg] = React.useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const dirty = [...perms].sort().join() !== [...initial].sort().join();
  return (
    <div className="space-y-3">
      <PermissionChecks value={perms} onChange={setPerms} idPrefix={userId} />
      {msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={!dirty}
          onClick={async () => {
            const r = await updateSuperadminAction({ userId, permissions: perms });
            setMsg(r.ok ? { tone: "success", text: r.message! } : { tone: "danger", text: r.error });
            if (r.ok) router.refresh();
          }}
        >
          Guardar permisos
        </Button>
        {!self ? (
          <Button
            size="sm"
            variant="ghost"
            className="text-st-busy"
            onClick={async () => {
              if (!window.confirm("¿Quitar el acceso al backoffice de GAVIA a este usuario?")) return;
              const r = await updateSuperadminAction({ userId, permissions: [], revoke: true });
              setMsg(r.ok ? { tone: "success", text: r.message! } : { tone: "danger", text: r.error });
              if (r.ok) router.refresh();
            }}
          >
            Revocar acceso
          </Button>
        ) : null}
      </div>
    </div>
  );
}
