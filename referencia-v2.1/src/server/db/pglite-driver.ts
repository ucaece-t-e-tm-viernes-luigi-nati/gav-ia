import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { PGlite, types } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { env } from "@/server/env";
import { normalizeTimestamp, type Db, type Driver } from "./types";
import { seedDemoData } from "./seed";

const TZ = "America/Argentina/Buenos_Aires";

const parsers = {
  [types.INT8]: (v: string) => Number(v),
  [types.NUMERIC]: (v: string) => Number(v),
  [types.DATE]: (v: string) => v,
  [types.TIMESTAMPTZ]: (v: string) => normalizeTimestamp(v),
};

type Global = typeof globalThis & { __gaviaPglite?: Promise<PGlite> };

async function runSqlFile(db: PGlite, file: string) {
  await db.exec(await readFile(file, "utf8"));
}

async function open(): Promise<PGlite> {
  // En la demo desplegada (serverless) la base vive en memoria y se recrea en cada arranque.
  const dataDir = env.previewDemo ? "memory://" : path.resolve(/* turbopackIgnore: true */ process.cwd(), env.devDbDir);
  const db = await PGlite.create({ dataDir, extensions: { btree_gist }, parsers });
  // Los archivos SQL se incluyen en el despliegue mediante outputFileTracingIncludes.
  const root = /* turbopackIgnore: true */ process.cwd();
  const migDir = path.join(root, "supabase", "migrations");
  const files = (await readdir(migDir)).filter((f) => f.endsWith(".sql")).sort();
  const ready = await db.query<{ ok: string | null }>(`select to_regclass('public.profiles')::text as ok`);
  const fresh = !ready.rows[0]?.ok;
  if (fresh) await runSqlFile(db, path.join(root, "db", "dev", "auth_stub.sql"));

  // Registro de migraciones aplicadas (mismo esquema que scripts/supabase-setup.mjs).
  const tracked = await db.query<{ ok: string | null }>(`select to_regclass('gavia_meta.migrations')::text as ok`);
  await db.exec(`create schema if not exists gavia_meta; create table if not exists gavia_meta.migrations (name text primary key, applied_at timestamptz not null default now());`);
  if (!fresh && !tracked.rows[0]?.ok) {
    // Bases locales creadas antes del registro: ya tenían las dos primeras migraciones.
    await db.query(`insert into gavia_meta.migrations (name) select unnest($1::text[]) on conflict do nothing`, [files.filter((f) => f < "20261030")]);
  }
  const applied = new Set((await db.query<{ name: string }>(`select name from gavia_meta.migrations`)).rows.map((r) => r.name));
  for (const f of files.filter((f) => !applied.has(f))) {
    await db.transaction(async (tx) => {
      await tx.exec(await readFile(path.join(migDir, f), "utf8"));
      await tx.query(`insert into gavia_meta.migrations (name) values ($1)`, [f]);
    });
    if (!fresh) console.info("[GAVIA] Migración aplicada a la base local:", f);
  }

  if (fresh) {
    await db.transaction(async (tx) => seedDemoData(wrap(tx), env.demoPassword));
    console.info("[GAVIA] Base local de desarrollo creada con datos de demostración en", dataDir);
  }
  return db;
}

type Queryable = Pick<PGlite, "query">;

function wrap(tx: Queryable): Db {
  return {
    async many<T>(text: string, params: unknown[] = []) {
      return (await tx.query(text, params)).rows as T[];
    },
    async one<T>(text: string, params: unknown[] = []) {
      return ((await tx.query(text, params)).rows[0] as T) ?? null;
    },
    async exec(text: string, params: unknown[] = []) {
      await tx.query(text, params);
    },
  };
}

export function pgliteDriver(): Driver {
  const g = globalThis as Global;
  g.__gaviaPglite ??= open().catch((e) => {
    g.__gaviaPglite = undefined;
    throw e;
  });
  return {
    async transaction(userId, fn) {
      // PGlite tiene una única conexión: una transacción anidada quedaría bloqueada para siempre.
      if (inTransaction.getStore()) throw new Error("Transacción anidada detectada: ejecutá asUser/asService en secuencia, no uno dentro de otro.");
      const db = await g.__gaviaPglite!;
      return inTransaction.run(true, () => db.transaction(async (tx) => {
        await tx.query(`select set_config('TimeZone', $1, true)`, [TZ]);
        if (userId) {
          await tx.query(`select set_config('request.jwt.claims', $1, true)`, [
            JSON.stringify({ sub: userId, role: "authenticated" }),
          ]);
          await tx.exec(`set local role authenticated`);
        }
        return fn(wrap(tx));
      }));
    },
  };
}

const inTransaction = new AsyncLocalStorage<boolean>();
