/**
 * Módulos que dependen del plan contratado. Plano, reservas, clientes, calendario,
 * gastos, usuarios y configuración están incluidos en todos los planes.
 */
export type Module = "whatsapp" | "ia" | "ocupacion" | "pagos" | "contabilium";

export const MODULE_INFO: Record<Module, { label: string; plan: "PRO" | "PLUS"; built: boolean }> = {
  whatsapp: { label: "WhatsApp integrado", plan: "PRO", built: true },
  ia: { label: "Inteligencia artificial", plan: "PRO", built: false },
  ocupacion: { label: "Análisis de ocupación", plan: "PRO", built: true },
  pagos: { label: "Pagos, historial y saldos pendientes", plan: "PLUS", built: true },
  contabilium: { label: "Integración con Contabilium", plan: "PLUS", built: false },
};

export function hasModule(modules: readonly string[] | undefined, m: Module) {
  return !!modules?.includes(m);
}
