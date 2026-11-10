export type Row = Record<string, unknown>;

/** Ejecutor de consultas parametrizadas dentro de una transacción. */
export interface Db {
  many<T = Row>(text: string, params?: unknown[]): Promise<T[]>;
  one<T = Row>(text: string, params?: unknown[]): Promise<T | null>;
  exec(text: string, params?: unknown[]): Promise<void>;
}

export interface Driver {
  /** Ejecuta `fn` en una transacción. Con `userId`, bajo rol `authenticated` y RLS. */
  transaction<T>(userId: string | null, fn: (db: Db) => Promise<T>): Promise<T>;
}

/** Normaliza el texto de timestamptz de PostgreSQL a ISO 8601. */
export function normalizeTimestamp(value: string): string {
  let v = value.replace(" ", "T");
  if (/[+-]\d{2}$/.test(v)) v += ":00";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? value : d.toISOString();
}
