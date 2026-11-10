"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, FlaskConical, Loader2, QrCode, RefreshCw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, Badge } from "@/components/ui/primitives";
import { cancelQrChargeAction, checkQrChargeAction, simulateQrApprovalAction, startQrChargeAction, type QrCharge as Charge } from "@/server/actions/pagos";
import { formatMoney } from "@/lib/money";

const STATUS_TEXT: Record<string, string> = {
  creado: "Esperando el pago…",
  aprobado: "Pago confirmado por el proveedor",
  rechazado: "Pago rechazado",
  expirado: "El QR venció sin pago",
  cancelado: "Cobro cancelado",
  error: "Error en el cobro",
};

export function QrCharge({ reservationId, balanceCents, available, testMode }: { reservationId: string; balanceCents: number; available: boolean; testMode: boolean }) {
  const router = useRouter();
  const [charge, setCharge] = React.useState<Charge | null>(null);
  const [status, setStatus] = React.useState("creado");
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  // Consulta periódica del estado mientras el QR está vigente (la confirmación la hace el backend).
  React.useEffect(() => {
    if (!charge || status !== "creado") return;
    const h = setInterval(async () => {
      const r = await checkQrChargeAction(charge.requestId);
      if (r.ok && r.data) {
        setStatus(r.data.status);
        if (r.data.status === "aprobado") router.refresh();
      }
    }, 4000);
    return () => clearInterval(h);
  }, [charge, status, router]);

  if (!available) {
    return (
      <Alert tone="info" title="Cobro con QR pendiente de configuración">
        El dueño del balneario debe cargar las credenciales de Mercado Pago (modo producción) en Configuración → Integraciones. Mientras tanto, registrá los cobros en efectivo o transferencia.
      </Alert>
    );
  }
  if (balanceCents <= 0 && !charge) return <p className="text-sm text-mist">Sin saldo pendiente para cobrar.</p>;

  if (!charge) {
    return (
      <div className="space-y-3">
        {testMode ? (
          <Alert tone="warning" title="Modo prueba">
            Mercado Pago no está configurado. Se genera un QR de prueba que no sirve para pagar; podés simular la aprobación para probar el circuito completo.
          </Alert>
        ) : null}
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <Button
          variant="accent"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            const r = await startQrChargeAction(reservationId);
            setBusy(false);
            if (r.ok && r.data) {
              setCharge(r.data);
              setStatus("creado");
            } else if (!r.ok) setError(r.error);
          }}
        >
          {busy ? <Loader2 className="animate-spin" /> : <QrCode />} Generar QR por {formatMoney(balanceCents)}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
      <div className="relative w-fit rounded-xl border border-line bg-white p-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={charge.qrImage} alt="Código QR para pagar con Mercado Pago" width={220} height={220} className={status !== "creado" ? "opacity-20" : ""} />
        {charge.mode === "prueba" ? (
          <span className="absolute inset-x-3 top-1/2 -translate-y-1/2 rotate-[-12deg] rounded bg-st-held px-2 py-1 text-center text-xs font-extrabold uppercase tracking-wide text-white">QR de prueba · no válido</span>
        ) : null}
      </div>
      <div className="space-y-3 text-sm">
        <div className="flex items-center gap-2">
          {charge.mode === "prueba" ? <Badge tone="warning">Modo prueba</Badge> : <Badge tone="info">Mercado Pago</Badge>}
          <span className="font-bold tabular-nums">{formatMoney(charge.amountCents)}</span>
        </div>
        <p className="flex items-center gap-2 font-semibold">
          {status === "creado" ? <Loader2 className="size-4 animate-spin text-sea" /> : status === "aprobado" ? <CheckCircle2 className="size-4 text-st-free" /> : <XCircle className="size-4 text-st-busy" />}
          {STATUS_TEXT[status] ?? status}
        </p>
        {status === "creado" ? (
          <>
            <p className="text-xs text-mist">El cliente escanea el código desde la app de Mercado Pago. El pago se acredita solo cuando el proveedor lo confirma; esta pantalla se actualiza sola.</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={async () => { const r = await checkQrChargeAction(charge.requestId); if (r.ok && r.data) setStatus(r.data.status); }}>
                <RefreshCw /> Verificar ahora
              </Button>
              {charge.mode === "prueba" && testMode ? (
                <Button size="sm" variant="secondary" onClick={async () => { const r = await simulateQrApprovalAction(charge.requestId); if (r.ok) { setStatus("aprobado"); router.refresh(); } else setError(r.error); }}>
                  <FlaskConical /> Simular aprobación (prueba)
                </Button>
              ) : null}
              <Button size="sm" variant="ghost" onClick={async () => { await cancelQrChargeAction(charge.requestId); setStatus("cancelado"); }}>Cancelar cobro</Button>
            </div>
          </>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setCharge(null)}>Nuevo cobro</Button>
        )}
        {error ? <p className="text-xs text-st-busy">{error}</p> : null}
      </div>
    </div>
  );
}
