"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import QRCode from "qrcode";
import { z } from "zod";
import { asService, asUser, dbErrorMessage } from "@/server/db";
import { tenantWithModule } from "@/server/auth/context";
import { applyOrderResult, cancelMpOrder, createMpQrOrder, fetchMpOrder, getMpConfig, isTestModeAvailable } from "@/server/payments/mercadopago";
import type { ActionResult } from "@/lib/utils";

export type QrCharge = {
  requestId: string;
  mode: "prueba" | "produccion";
  amountCents: number;
  qrImage: string;
  status: string;
  expiresAt: string | null;
};

const NO_SESSION = { ok: false as const, error: "Tu sesión expiró. Volvé a ingresar." };
const NO_MODULE = { ok: false as const, error: "Esta función no está incluida en el plan del balneario." };

async function pagosTenant() {
  const t = await tenantWithModule(["owner", "admin"], "pagos");
  return t === "sin-modulo" ? NO_MODULE : t ?? NO_SESSION;
}

/**
 * Inicia un cobro con QR por el saldo pendiente de la reserva.
 * El administrador puede iniciarlo sin acceder nunca a las credenciales del dueño:
 * el backend las descifra solo para hablar con Mercado Pago.
 */
export async function startQrChargeAction(reservationId: string): Promise<ActionResult<QrCharge>> {
  const t = await pagosTenant();
  if ("ok" in t) return t;
  if (!z.uuid().safeParse(reservationId).success) return { ok: false, error: "Reserva inválida." };

  const cfg = await getMpConfig(t.balnearioId);
  const mode = cfg ? "produccion" : isTestModeAvailable() ? "prueba" : null;
  if (!mode) {
    return { ok: false, error: "El cobro con QR no está disponible: el dueño todavía no configuró la integración de Mercado Pago en modo producción." };
  }

  try {
    const externalReference = `gavia-${randomUUID()}`;
    const req = await asUser(t.viewer.id, async (db) => {
      const r = await db.one<{ number: number; balance_cents: number; status: string }>(
        `select number, balance_cents, status from reservations where id = $1 and balneario_id = $2`,
        [reservationId, t.balnearioId],
      );
      if (!r) throw Object.assign(new Error(), { code: "P0001", message: "La reserva no existe o no tenés acceso." });
      if (r.status === "cancelada") throw Object.assign(new Error(), { code: "P0001", message: "La reserva está cancelada." });
      if (r.balance_cents <= 0) throw Object.assign(new Error(), { code: "P0001", message: "La reserva no tiene saldo pendiente." });
      const created = await db.one<{ id: string }>(
        `insert into payment_requests (balneario_id, reservation_id, amount_cents, mode, external_reference, created_by, expires_at)
         values ($1, $2, $3, $4, $5, auth.uid(), now() + interval '15 minutes') returning id`,
        [t.balnearioId, reservationId, r.balance_cents, mode, externalReference],
      );
      return { id: created!.id, amount: r.balance_cents, number: r.number };
    });

    let qrData: string;
    if (mode === "produccion" && cfg) {
      try {
        const order = await createMpQrOrder(cfg, {
          externalReference,
          amountCents: req.amount,
          description: `Reserva #${req.number} — ${t.balnearioName}`,
          idempotencyKey: req.id,
        });
        qrData = order.qrData;
        await asService((db) => db.exec(`update payment_requests set provider_order_id = $2, qr_data = $3 where id = $1`, [req.id, order.orderId, qrData]));
      } catch (e) {
        await asService((db) => db.exec(`update payment_requests set status = 'error', status_detail = $2, resolved_at = now() where id = $1`, [req.id, String((e as Error).message).slice(0, 300)]));
        return { ok: false, error: (e as Error).message };
      }
    } else {
      // Modo prueba local: el QR no es válido para pagar y lo indica explícitamente.
      qrData = `GAVIA-PRUEBA|NO-VALIDO-PARA-PAGAR|${externalReference}`;
      await asService((db) => db.exec(`update payment_requests set provider_order_id = $2, qr_data = $3 where id = $1`, [req.id, `PRUEBA-${req.id}`, qrData]));
    }

    const qrImage = await QRCode.toDataURL(qrData, { margin: 1, width: 280, color: { dark: "#123B5D", light: "#FFFFFF" } });
    return { ok: true, data: { requestId: req.id, mode, amountCents: req.amount, qrImage, status: "creado", expiresAt: new Date(Date.now() + 15 * 60_000).toISOString() } };
  } catch (e) {
    return { ok: false, error: dbErrorMessage(e) };
  }
}

/** Consulta el estado. En modo real, reconcilia contra Mercado Pago por si la notificación aún no llegó. */
export async function checkQrChargeAction(requestId: string): Promise<ActionResult<{ status: string; detail: string }>> {
  const t = await pagosTenant();
  if ("ok" in t) return t;
  if (!z.uuid().safeParse(requestId).success) return { ok: false, error: "Solicitud inválida." };
  const req = await asUser(t.viewer.id, (db) =>
    db.one<{ status: string; status_detail: string; mode: string; provider_order_id: string | null; expires_at: string | null }>(
      `select status, status_detail, mode, provider_order_id, expires_at from payment_requests where id = $1 and balneario_id = $2`,
      [requestId, t.balnearioId],
    ),
  );
  if (!req) return { ok: false, error: "La solicitud de cobro no existe." };
  if (req.status === "creado" && req.mode === "produccion" && req.provider_order_id) {
    const cfg = await getMpConfig(t.balnearioId);
    if (cfg) {
      try {
        await applyOrderResult(await fetchMpOrder(cfg, req.provider_order_id), "mercadopago");
      } catch (e) {
        console.error("[GAVIA] No se pudo consultar Mercado Pago", e);
      }
    }
  } else if (req.status === "creado" && req.expires_at && new Date(req.expires_at) < new Date()) {
    await asService((db) => db.exec(`update payment_requests set status = 'expirado', status_detail = 'Venció sin pago', resolved_at = now() where id = $1 and status = 'creado'`, [requestId]));
  }
  const fresh = await asUser(t.viewer.id, (db) => db.one<{ status: string; status_detail: string }>(`select status, status_detail from payment_requests where id = $1`, [requestId]));
  if (fresh?.status === "aprobado") revalidatePath(`/${t.role}`, "layout");
  return { ok: true, data: { status: fresh?.status ?? "error", detail: fresh?.status_detail ?? "" } };
}

/**
 * SOLO MODO DEMO LOCAL. Simula la notificación de aprobación del proveedor y la
 * procesa por el mismo camino que una notificación real validada.
 */
export async function simulateQrApprovalAction(requestId: string): Promise<ActionResult> {
  if (!isTestModeAvailable()) return { ok: false, error: "La simulación de pagos no está disponible en este entorno." };
  const t = await pagosTenant();
  if ("ok" in t) return t;
  const req = await asUser(t.viewer.id, (db) =>
    db.one<{ id: string; mode: string; provider_order_id: string; external_reference: string; amount_cents: number }>(
      `select id, mode, provider_order_id, external_reference, amount_cents from payment_requests where id = $1 and balneario_id = $2 and status = 'creado'`,
      [requestId, t.balnearioId],
    ),
  );
  if (!req || req.mode !== "prueba") return { ok: false, error: "Solo se pueden simular cobros creados en modo prueba." };
  const amount = `${Math.trunc(req.amount_cents / 100)}.${String(req.amount_cents % 100).padStart(2, "0")}`;
  const result = await applyOrderResult(
    { id: req.provider_order_id, status: "processed", status_detail: "accredited (simulado)", external_reference: req.external_reference, transactions: { payments: [{ id: `PRUEBA-PAY-${req.id}`, amount, status: "processed" }] } },
    "mercadopago_prueba",
  );
  revalidatePath(`/${t.role}`, "layout");
  return result === "aprobado" ? { ok: true, message: "Pago de prueba aplicado." } : { ok: false, error: `No se aplicó: ${result}` };
}

export async function cancelQrChargeAction(requestId: string): Promise<ActionResult> {
  const t = await pagosTenant();
  if ("ok" in t) return t;
  const req = await asUser(t.viewer.id, (db) =>
    db.one<{ mode: string; provider_order_id: string | null }>(`select mode, provider_order_id from payment_requests where id = $1 and balneario_id = $2 and status = 'creado'`, [requestId, t.balnearioId]),
  );
  if (!req) return { ok: false, error: "La solicitud ya no está pendiente." };
  if (req.mode === "produccion" && req.provider_order_id) {
    const cfg = await getMpConfig(t.balnearioId);
    if (cfg) await cancelMpOrder(cfg, req.provider_order_id).catch(() => undefined);
  }
  await asService((db) => db.exec(`update payment_requests set status = 'cancelado', status_detail = 'Cancelado por el usuario', resolved_at = now() where id = $1 and status = 'creado'`, [requestId]));
  return { ok: true };
}
