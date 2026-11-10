import "server-only";
import postgres from "postgres";
import { env } from "@/server/env";
import { normalizeTimestamp, type Db, type Driver } from "./types";

const TZ = "America/Argentina/Buenos_Aires";

type Global = typeof globalThis & { __gaviaPg?: postgres.Sql };

function client() {
  const g = globalThis as Global;
  g.__gaviaPg ??= postgres(env.databaseUrl, {
    max: 5,
    prepare: false,
    types: {
      int8: { to: 20, from: [20, 1700], serialize: (x: number) => String(x), parse: (x: string) => Number(x) },
      date: { to: 1082, from: [1082], serialize: (x: string) => x, parse: (x: string) => x },
      tstz: {
        to: 1184,
        from: [1184, 1114],
        serialize: (x: string | Date) => (x instanceof Date ? x.toISOString() : x),
        parse: (x: string) => normalizeTimestamp(x),
      },
    },
  });
  return g.__gaviaPg;
}

/**
 * Conexión directa a PostgreSQL de Supabase. Cada transacción de usuario
 * adopta el rol `authenticated` con los claims del usuario verificado por
 * Supabase Auth, de modo que las políticas RLS se aplican igual que en PostgREST.
 */
export function postgresDriver(): Driver {
  return {
    async transaction(userId, fn) {
      const sql = client();
      return (await sql.begin(async (tx) => {
        await tx.unsafe(`select set_config('TimeZone', $1, true)`, [TZ]);
        if (userId) {
          await tx.unsafe(`select set_config('request.jwt.claims', $1, true)`, [
            JSON.stringify({ sub: userId, role: "authenticated" }),
          ]);
          await tx.unsafe(`set local role authenticated`);
        }
        const db: Db = {
          many: async (text, params = []) => (await tx.unsafe(text, params as never[])) as never,
          one: async (text, params = []) => ((await tx.unsafe(text, params as never[]))[0] ?? null) as never,
          exec: async (text, params = []) => {
            await tx.unsafe(text, params as never[]);
          },
        };
        return fn(db);
      })) as Awaited<ReturnType<typeof fn>>;
    },
  };
}
