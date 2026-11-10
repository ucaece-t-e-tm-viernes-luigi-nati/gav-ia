import type { Tone } from "@/components/ui/primitives";

export const RES_STATUS: Record<string, { label: string; tone: Tone }> = {
  pendiente: { label: "Pendiente", tone: "warning" },
  confirmada: { label: "Confirmada", tone: "info" },
  finalizada: { label: "Finalizada", tone: "muted" },
  cancelada: { label: "Cancelada", tone: "danger" },
};

export function paymentState(total: number, paid: number): { label: string; tone: Tone } {
  if (total === 0) return { label: "Sin cargo", tone: "muted" };
  if (paid <= 0) return { label: "Sin pagos", tone: "danger" };
  if (paid < total) return { label: "Pago parcial", tone: "warning" };
  return { label: "Pagada", tone: "success" };
}

export const METHOD_LABEL: Record<string, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  tarjeta: "Tarjeta (posnet)",
  mercadopago_qr: "Mercado Pago QR",
  otro: "Otro",
};
