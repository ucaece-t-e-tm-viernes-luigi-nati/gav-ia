"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Alert, Badge } from "@/components/ui/primitives";
import { addMemberOwnerAction, setPaymentInvoicedAction, saveMercadoPagoAction, saveWhatsAppAction, updateBalnearioAction, updateMemberAction } from "@/server/actions/owner";

function useResult() {
  const [r, setR] = React.useState<{ tone: "success" | "danger"; text: string } | null>(null);
  return [r, setR] as const;
}

export function AddMemberForm() {
  const router = useRouter();
  const empty = { email: "", fullName: "", phone: "", role: "staff" };
  const [f, setF] = React.useState(empty);
  const [res, setRes] = useResult();
  const [temp, setTemp] = React.useState<string | null>(null);
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await addMemberOwnerAction(f);
        if (!r.ok) return setRes({ tone: "danger", text: r.error });
        setTemp(r.data?.tempPassword ?? null);
        setRes({ tone: "success", text: r.message ?? "Listo." });
        setF(empty);
        router.refresh();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nombre y apellido" htmlFor="adm-name"><Input id="adm-name" required value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} /></Field>
        <Field label="Correo" htmlFor="adm-email"><Input id="adm-email" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Teléfono" htmlFor="adm-phone"><Input id="adm-phone" required autoComplete="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <Field label="Rol" htmlFor="adm-role">
          <select id="adm-role" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm">
            <option value="staff">Staff</option>
            <option value="owner">Dueño</option>
          </select>
        </Field>
      </div>
      {res ? <Alert tone={res.tone}>{res.text}</Alert> : null}
      {temp ? (
        <Alert tone="warning" title="Contraseña temporal (se muestra una sola vez)">
          <code className="rounded bg-white px-1.5 py-0.5 text-sm">{temp}</code> — compartila por un medio seguro. Al ingresar, la persona puede cambiarla desde “Cambiar contraseña”.
        </Alert>
      ) : null}
      <Button type="submit"><UserPlus /> Agregar usuario</Button>
      <p className="text-xs text-mist">Un dueño ve toda la información del balneario, incluida la financiera. El staff solo la operativa.</p>
    </form>
  );
}

export function MemberToggles({ membershipId, active, canEditPlano, role, self }: { membershipId: string; active: boolean; canEditPlano: boolean; role: string; self: boolean }) {
  const router = useRouter();
  const [err, setErr] = React.useState("");
  const update = async (patch: { active?: boolean; canEditPlano?: boolean; role?: string }) => {
    setErr("");
    const r = await updateMemberAction({ membershipId, ...patch });
    if (!r.ok) setErr(r.error);
    router.refresh();
  };
  return (
    <div className="flex flex-wrap items-center gap-4 text-sm">
      <label className="flex items-center gap-2">
        Rol
        <select
          aria-label="Rol"
          value={role}
          disabled={self}
          onChange={(e) => {
            const next = e.target.value;
            if (next === "owner" && !window.confirm("¿Dar acceso de dueño? Va a ver toda la información, incluida la financiera.")) return;
            update({ role: next });
          }}
          className="h-8 rounded-lg border border-line bg-white px-2 text-sm disabled:opacity-60"
        >
          <option value="staff">Staff</option>
          <option value="owner">Dueño</option>
        </select>
      </label>
      {role === "staff" ? (
        <label className="flex items-center gap-2">
          <input type="checkbox" className="size-4 accent-navy" checked={canEditPlano} onChange={(e) => update({ canEditPlano: e.target.checked })} />
          Puede editar el plano
        </label>
      ) : null}
      {!self ? (
        <label className="flex items-center gap-2">
          <input type="checkbox" className="size-4 accent-navy" checked={active} onChange={(e) => update({ active: e.target.checked })} />
          Acceso activo
        </label>
      ) : null}
      {err ? <span className="text-xs text-st-busy">{err}</span> : null}
    </div>
  );
}
export function BalnearioForm({ initial }: { initial: { name: string; city: string; address: string; phone: string; email: string; seasonStart: string; seasonEnd: string } }) {
  const router = useRouter();
  const [f, setF] = React.useState(initial);
  const [res, setRes] = useResult();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await updateBalnearioAction(f);
        setRes(r.ok ? { tone: "success", text: r.message! } : { tone: "danger", text: r.error });
        if (r.ok) router.refresh();
      }}
    >
      <Field label="Nombre" htmlFor="b-name"><Input id="b-name" value={f.name} onChange={set("name")} required /></Field>
      <Field label="Localidad" htmlFor="b-city"><Input id="b-city" value={f.city} onChange={set("city")} /></Field>
      <Field label="Dirección" htmlFor="b-addr"><Input id="b-addr" value={f.address} onChange={set("address")} /></Field>
      <Field label="Teléfono" htmlFor="b-phone"><Input id="b-phone" value={f.phone} onChange={set("phone")} /></Field>
      <Field label="Correo" htmlFor="b-email"><Input id="b-email" type="email" value={f.email} onChange={set("email")} /></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Inicio de temporada" htmlFor="b-ss"><Input id="b-ss" type="date" value={f.seasonStart} onChange={set("seasonStart")} /></Field>
        <Field label="Fin de temporada" htmlFor="b-se"><Input id="b-se" type="date" value={f.seasonEnd} onChange={set("seasonEnd")} /></Field>
      </div>
      {res ? <Alert tone={res.tone} className="sm:col-span-2">{res.text}</Alert> : null}
      <div className="sm:col-span-2"><Button type="submit">Guardar datos</Button></div>
    </form>
  );
}

export function MercadoPagoForm({ status, externalPosId, hasSecret, balnearioId, appUrl }: { status: string; externalPosId: string; hasSecret: boolean; balnearioId: string; appUrl: string }) {
  const router = useRouter();
  const [f, setF] = React.useState({ enabled: status === "activa", externalPosId, accessToken: "", webhookSecret: "" });
  const [res, setRes] = useResult();
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await saveMercadoPagoAction(f);
        setRes(r.ok ? { tone: "success", text: r.message! } : { tone: "danger", text: r.error });
        if (r.ok) {
          setF({ ...f, accessToken: "", webhookSecret: "" });
          router.refresh();
        }
      }}
    >
      <div className="flex items-center gap-2 text-sm">
        Estado: <Badge tone={status === "activa" ? "success" : "warning"}>{status === "activa" ? "Activa" : "Pendiente"}</Badge>
        {hasSecret ? <Badge tone="info">Credenciales cargadas (cifradas)</Badge> : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="ID externo de la caja (external_pos_id)" htmlFor="mp-pos"><Input id="mp-pos" value={f.externalPosId} onChange={(e) => setF({ ...f, externalPosId: e.target.value })} placeholder="Ej.: MAREAS01POS01" /></Field>
        <Field label="Access Token de producción" htmlFor="mp-token" hint={hasSecret ? "Dejalo vacío para conservar el actual." : "Comienza con APP_USR-"}>
          <Input id="mp-token" type="password" autoComplete="off" value={f.accessToken} onChange={(e) => setF({ ...f, accessToken: e.target.value })} />
        </Field>
        <Field label="Clave secreta de notificaciones" htmlFor="mp-secret" hint="Se obtiene en Tus integraciones → Webhooks.">
          <Input id="mp-secret" type="password" autoComplete="off" value={f.webhookSecret} onChange={(e) => setF({ ...f, webhookSecret: e.target.value })} />
        </Field>
        <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" className="size-4 accent-navy" checked={f.enabled} onChange={(e) => setF({ ...f, enabled: e.target.checked })} /> Activar cobros con QR</label>
      </div>
      <p className="text-xs text-mist">
        URL de notificaciones (tópico “Order”): <code className="break-all rounded bg-sand px-1">{appUrl}/api/webhooks/mercadopago?b={balnearioId}</code>
      </p>
      {res ? <Alert tone={res.tone}>{res.text}</Alert> : null}
      <Button type="submit">Guardar Mercado Pago</Button>
    </form>
  );
}

export function WhatsAppForm({ status, phoneNumberId, hasSecret, balnearioId, appUrl }: { status: string; phoneNumberId: string; hasSecret: boolean; balnearioId: string; appUrl: string }) {
  const router = useRouter();
  const [f, setF] = React.useState({ enabled: status === "activa", phoneNumberId, accessToken: "", appSecret: "" });
  const [res, setRes] = useResult();
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await saveWhatsAppAction(f);
        setRes(r.ok ? { tone: "success", text: r.message! } : { tone: "danger", text: r.error });
        if (r.ok) router.refresh();
      }}
    >
      <div className="flex items-center gap-2 text-sm">
        Estado: <Badge tone={status === "activa" ? "success" : "warning"}>{status === "activa" ? "Activa" : "Pendiente"}</Badge>
        {hasSecret ? <Badge tone="info">Credenciales cargadas (cifradas)</Badge> : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Phone Number ID" htmlFor="wa-id"><Input id="wa-id" value={f.phoneNumberId} onChange={(e) => setF({ ...f, phoneNumberId: e.target.value })} /></Field>
        <Field label="Token de acceso" htmlFor="wa-token" hint={hasSecret ? "Dejalo vacío para conservar el actual." : undefined}><Input id="wa-token" type="password" autoComplete="off" value={f.accessToken} onChange={(e) => setF({ ...f, accessToken: e.target.value })} /></Field>
        <Field label="App Secret" htmlFor="wa-secret"><Input id="wa-secret" type="password" autoComplete="off" value={f.appSecret} onChange={(e) => setF({ ...f, appSecret: e.target.value })} /></Field>
        <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" className="size-4 accent-navy" checked={f.enabled} onChange={(e) => setF({ ...f, enabled: e.target.checked })} /> Activar WhatsApp</label>
      </div>
      <p className="text-xs text-mist">Webhook: <code className="break-all rounded bg-sand px-1">{appUrl}/api/webhooks/whatsapp?b={balnearioId}</code></p>
      {res ? <Alert tone={res.tone}>{res.text}</Alert> : null}
      <Button type="submit">Guardar WhatsApp</Button>
    </form>
  );
}

/** Marca de facturado por cobro, con número de comprobante opcional. */
export function InvoicedToggle({ paymentId, invoiced, invoiceRef, disabled }: { paymentId: string; invoiced: boolean; invoiceRef: string; disabled?: boolean }) {
  const router = useRouter();
  const [ref, setRef] = React.useState(invoiceRef);
  const [err, setErr] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const save = async (next: boolean, nextRef = ref) => {
    setBusy(true);
    setErr("");
    const r = await setPaymentInvoicedAction({ paymentId, invoiced: next, invoiceRef: nextRef });
    setBusy(false);
    if (!r.ok) setErr(r.error);
    router.refresh();
  };
  if (disabled) return <span className="text-xs text-mist">—</span>;
  return (
    <span className="flex flex-col gap-1">
      <label className="flex items-center gap-1.5 text-xs font-semibold">
        <input type="checkbox" className="size-4 accent-navy" checked={invoiced} disabled={busy} onChange={(e) => save(e.target.checked)} />
        {invoiced ? "Facturado" : "Sin facturar"}
      </label>
      {invoiced ? (
        <input
          aria-label="N.º de comprobante"
          placeholder="N.º comprobante"
          value={ref}
          maxLength={60}
          onChange={(e) => setRef(e.target.value)}
          onBlur={() => ref !== invoiceRef && save(true, ref)}
          className="h-7 w-32 rounded border border-line px-1.5 text-xs"
        />
      ) : null}
      {err ? <span className="text-[11px] text-st-busy">{err}</span> : null}
    </span>
  );
}