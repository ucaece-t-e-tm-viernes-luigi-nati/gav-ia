import "server-only";
import pg from "pg";
import { normalizeTimestamp, type Db, type Driver } from "./types";

const TZ = "America/Argentina/Buenos_Aires";

// Parsers propios de este pool (los módulos de la v2.1 esperan bigint → number, date → 'YYYY-MM-DD'
// y timestamptz → ISO string). El pool de better-auth (src/lib/db.ts) usa los parsers por defecto.
const OID = { int8: 20, numeric: 1700, date: 1082, timestamp: 1114, timestamptz: 1184 };
const types = {
  getTypeParser(oid: number, format?: "text" | "binary") {
    if (oid === OID.int8 || oid === OID.numeric) return (v: string) => Number(v);
    if (oid === OID.date) return (v: string) => v;
    if (oid === OID.timestamp || oid === OID.timestamptz) return (v: string) => normalizeTimestamp(v);
    return pg.types.getTypeParser(oid, format);
  },
};

type Global = typeof globalThis & { __gaviaRlsPool?: pg.Pool };

function pool() {
  const g = globalThis as Global;
  g.__gaviaRlsPool ??= new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4, types: types as never });
  return g.__gaviaRlsPool;
}

/**
 * PostgreSQL (Neon). Cada transacción de usuario adopta el rol `authenticated` con los claims
 * del usuario verificado por better-auth: las políticas RLS de la v2.1 se aplican sin cambios.
 * Sin userId (asService) corre con el rol dueño de las tablas, sin RLS.
 */
export function postgresDriver(): Driver {
  return {
    async transaction(userId, fn) {
      const client = await pool().connect();
      try {
        await client.query("begin");
        await client.query(`select set_config('TimeZone', $1, true)`, [TZ]);
        if (userId) {
          await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: userId, role: "authenticated" })]);
          await client.query("set local role authenticated");
        }
        const db: Db = {
          many: async (text, params = []) => (await client.query(text, params as unknown[])).rows as never,
          one: async (text, params = []) => ((await client.query(text, params as unknown[])).rows[0] ?? null) as never,
          exec: async (text, params = []) => {
            await client.query(text, params as unknown[]);
          },
        };
        const result = await fn(db);
        await client.query("commit");
        return result;
      } catch (error) {
        await client.query("rollback").catch(() => null);
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
