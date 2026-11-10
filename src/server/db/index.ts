import "server-only";
import type { Db } from "./types";
import { postgresDriver } from "./postgres-driver";

export type { Db } from "./types";

const driver = postgresDriver();

/** Ejecuta consultas como el usuario autenticado: RLS activo. */
export async function asUser<T>(userId: string, fn: (db: Db) => Promise<T>): Promise<T> {
  return driver.transaction(userId, fn);
}

/**
 * Ejecuta consultas con privilegios de servicio (sin RLS).
 * Usar solo en flujos de sistema: webhooks validados, cron y escritura de secretos
 * tras verificar permisos con `asUser`.
 */
export async function asService<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  return driver.transaction(null, fn);
}

const PG_MESSAGES: Record<string, string> = {
  "23P01": "La unidad ya tiene una reserva activa que se superpone con esas fechas.",
  "23505": "Ya existe un registro con esos datos.",
  "23503": "La operación no es posible porque hay datos relacionados.",
  "23514": "Algún dato no cumple las reglas de validación.",
  "42501": "No tenés permisos para realizar esta acción.",
  "22P02": "Identificador inválido.",
};

/** Traduce errores de PostgreSQL a mensajes legibles, sin exponer detalles internos. */
export function dbErrorMessage(error: unknown): string {
  const e = error as { code?: string; message?: string };
  if (e?.code === "42501" && e.message && !e.message.includes("row-level security") && !e.message.includes("permission denied")) {
    return e.message;
  }
  if (e?.code && PG_MESSAGES[e.code]) return PG_MESSAGES[e.code];
  if (e?.code === "P0001" && e.message) return e.message;
  console.error("[GavIA] Error de base de datos", error);
  return "Ocurrió un error inesperado. Intentá nuevamente.";
}
