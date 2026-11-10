"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "./button";
import { Field, Input, Select, Textarea } from "./form";
import { Alert } from "./primitives";
import { cn, type ActionResult } from "@/lib/utils";

export type QuickField = {
  name: string;
  label: string;
  type?: "text" | "email" | "tel" | "password" | "date" | "select" | "textarea" | "checkbox" | "money";
  options?: { value: string; label: string }[];
  defaultValue?: string | boolean;
  required?: boolean;
  placeholder?: string;
  hint?: string;
  wide?: boolean;
  /** Muestra el campo solo cuando otro campo tiene ese valor (p. ej. cuotas solo si la forma de pago es "cuotas"). */
  showIf?: { field: string; equals: string };
};

/**
 * Formulario genérico que invoca una Server Action (la validación real ocurre en el servidor).
 */
export function QuickForm({
  action,
  fields,
  submitLabel,
  hidden,
  columns = 2,
  resetOnSuccess = true,
}: {
  action: (input: never) => Promise<ActionResult<{ tempPassword?: string } | undefined | unknown>>;
  fields: QuickField[];
  submitLabel: string;
  hidden?: Record<string, string>;
  columns?: 1 | 2 | 3;
  resetOnSuccess?: boolean;
}) {
  const router = useRouter();
  const initial = React.useMemo(() => Object.fromEntries(fields.map((f) => [f.name, f.defaultValue ?? (f.type === "checkbox" ? false : "")])), [fields]);
  const [values, setValues] = React.useState<Record<string, string | boolean>>(initial);
  const [res, setRes] = React.useState<{ tone: "success" | "danger"; text: string; temp?: string } | null>(null);
  const [busy, setBusy] = React.useState(false);
  // Un select obligatorio cuyas opciones cambiaron (por ejemplo, se agregó la primera opción) toma la primera válida.
  const valueOf = (f: QuickField) => {
    const v = values[f.name];
    if (f.type === "select" && f.required && f.options?.length && !f.options.some((o) => o.value === String(v))) return f.options[0].value;
    return v;
  };

  return (
    <form
      className={cn("grid gap-3", columns === 2 && "sm:grid-cols-2", columns === 3 && "sm:grid-cols-3")}
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const visible = Object.fromEntries(Object.entries({ ...values, ...Object.fromEntries(fields.map((x) => [x.name, valueOf(x)])) }).filter(([k]) => { const sf = fields.find((x) => x.name === k)?.showIf; return !sf || String(values[sf.field]) === sf.equals; }));
        const r = await action({ ...hidden, ...visible } as never);
        setBusy(false);
        if (!r.ok) return setRes({ tone: "danger", text: r.error });
        const temp = (r.data as { tempPassword?: string } | undefined)?.tempPassword;
        setRes({ tone: "success", text: r.message ?? "Guardado.", temp });
        if (resetOnSuccess) setValues(initial);
        router.refresh();
      }}
    >
      {fields.map((f) => {
        if (f.showIf && String(values[f.showIf.field]) !== f.showIf.equals) return null;
        const id = `qf-${f.name}`;
        const common = { id, required: f.required, placeholder: f.placeholder };
        const v = valueOf(f);
        if (f.type === "checkbox") {
          return (
            <label key={f.name} className={cn("flex items-center gap-2 self-end pb-2 text-sm", f.wide && "sm:col-span-full")}>
              <input type="checkbox" className="size-4 accent-navy" checked={!!v} onChange={(e) => setValues({ ...values, [f.name]: e.target.checked })} /> {f.label}
            </label>
          );
        }
        return (
          <Field key={f.name} label={f.label} htmlFor={id} hint={f.hint} className={cn(f.wide && "sm:col-span-full")}>
            {f.type === "select" ? (
              <Select {...common} value={String(v)} onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}>
                {!f.required ? <option value="">—</option> : null}
                {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            ) : f.type === "textarea" ? (
              <Textarea {...common} value={String(v)} onChange={(e) => setValues({ ...values, [f.name]: e.target.value })} />
            ) : (
              <Input {...common} autoComplete={f.type === "password" ? "new-password" : undefined} type={f.type === "money" ? "text" : (f.type ?? "text")} inputMode={f.type === "money" ? "decimal" : undefined} value={String(v)} onChange={(e) => setValues({ ...values, [f.name]: e.target.value })} />
            )}
          </Field>
        );
      })}
      {res ? (
        <Alert tone={res.tone} className="sm:col-span-full">
          {res.text}
          {res.temp ? <> Contraseña temporal (se muestra una sola vez): <code className="rounded bg-white px-1">{res.temp}</code></> : null}
        </Alert>
      ) : null}
      <div className="sm:col-span-full">
        <Button type="submit" disabled={busy}>{busy ? "Guardando…" : submitLabel}</Button>
      </div>
    </form>
  );
}

/** Select que ejecuta una acción al cambiar (por ejemplo, cambiar un estado). */
export function ActionSelect({ action, payload, field, value, options, label, confirmText }: { action: (input: never) => Promise<ActionResult>; payload: Record<string, string>; field: string; value: string; options: { value: string; label: string }[]; label: string; confirmText?: Record<string, string> }) {
  const router = useRouter();
  const [err, setErr] = React.useState("");
  return (
    <span className="inline-flex flex-col">
      <select
        aria-label={label}
        defaultValue={value}
        className="h-8 rounded-lg border border-line bg-white px-2 text-xs"
        onChange={async (e) => {
          const msg = confirmText?.[e.target.value];
          if (msg && !window.confirm(msg)) {
            e.target.value = value;
            return;
          }
          const r = await action({ ...payload, [field]: e.target.value } as never);
          if (!r.ok) setErr(r.error);
          router.refresh();
        }}
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {err ? <span className="text-[11px] text-st-busy">{err}</span> : null}
    </span>
  );
}

/** Genera una contraseña temporal (blanqueo) y la muestra una única vez. */
export function TempPasswordButton({ action, payload, label = "Blanquear contraseña" }: { action: (input: never) => Promise<ActionResult<{ tempPassword?: string }>>; payload: Record<string, string>; label?: string }) {
  const [result, setResult] = React.useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = React.useState(false);
  if (result?.ok) {
    return (
      <span className="inline-flex flex-col text-xs">
        <span>Temporal (se muestra una sola vez):</span>
        <code className="select-all rounded bg-st-held-bg px-1.5 py-0.5 text-[13px]">{result.text}</code>
      </span>
    );
  }
  return (
    <span className="inline-flex flex-col">
      <Button
        size="sm"
        variant="ghost"
        disabled={busy}
        onClick={async () => {
          if (!window.confirm("Se generará una contraseña temporal nueva y la actual dejará de funcionar. ¿Continuar?")) return;
          setBusy(true);
          const r = await action(payload as never);
          setBusy(false);
          setResult(r.ok ? { ok: true, text: r.data?.tempPassword ?? "" } : { ok: false, text: r.error });
        }}
      >
        {busy ? "Generando…" : label}
      </Button>
      {result && !result.ok ? <span className="text-[11px] text-st-busy">{result.text}</span> : null}
    </span>
  );
}

export function ActionButton({ action, payload, label, variant = "outline", confirmText }: { action: (input: never) => Promise<ActionResult>; payload: Record<string, unknown>; label: string; variant?: "outline" | "secondary" | "danger" | "ghost"; confirmText?: string }) {
  const router = useRouter();
  const [err, setErr] = React.useState("");
  return (
    <span className="inline-flex flex-col">
      <Button
        size="sm"
        variant={variant}
        onClick={async () => {
          if (confirmText && !window.confirm(confirmText)) return;
          const r = await action(payload as never);
          if (!r.ok) setErr(r.error);
          router.refresh();
        }}
      >
        {label}
      </Button>
      {err ? <span className="text-[11px] text-st-busy">{err}</span> : null}
    </span>
  );
}
