import 'server-only'
import pg, { Pool, type PoolClient, type QueryResultRow } from 'pg'

// DATABASE_URL viene de Neon (en Vercel: Settings → Environment Variables; en tu PC: .env.local).
// Este pool lo usan better-auth y los módulos de la skill (alta, plataforma, mails, cobros): corre con el rol
// dueño de las tablas (sin RLS), así que TODA consulta de empresa filtra por el balneario resuelto en el servidor.
// Las columnas date llegan como 'YYYY-MM-DD' (sin corrimientos de zona horaria).
// Los módulos operativos de la v2.1 usan src/server/db (asUser → RLS).
const globalForPool = globalThis as unknown as { gaviaPool?: Pool }
export const pool = globalForPool.gaviaPool ?? new Pool({ connectionString: process.env.DATABASE_URL, max: 4, types: { getTypeParser: (oid: number, format?: 'text' | 'binary') => (oid === 1082 ? (v: string) => v : pg.types.getTypeParser(oid, format)) } as never })
if (process.env.NODE_ENV !== 'production') globalForPool.gaviaPool = pool

/** Consulta SQL parametrizada. Devuelve las filas tipadas. */
export async function q<T extends QueryResultRow = QueryResultRow>(sql: string, params: unknown[] = []) {
  const result = await pool.query<T>(sql, params)
  return result.rows
}

export async function q1<T extends QueryResultRow = QueryResultRow>(sql: string, params: unknown[] = []) {
  const rows = await q<T>(sql, params)
  return rows[0] ?? null
}

/** Ejecuta varias sentencias en una transacción. */
export async function tx<T>(fn: (client: PoolClient) => Promise<T>) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
