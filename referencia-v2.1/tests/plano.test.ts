/**
 * Pruebas del guardado de planos (criterios de aceptación del editor):
 * crear desde cero, agregar/mover/renombrar/eliminar unidades, persistencia,
 * separación Playa/Cocheras, aislamiento entre balnearios y permisos.
 * Ejecutar con: npm test  (usa la condición react-server para `server-only`).
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite, types } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { seedDemoData } from "../src/server/db/seed.ts";
import { getSiteMap, saveSiteMap, PlanoError, type MapDraft } from "../src/server/repos/plano.ts";
import type { Db } from "../src/server/db/types.ts";
import { createLayout, DEFAULT_LAYOUT } from "../src/server/db/layouts.ts";

let pg: PGlite;
const ids: Record<string, string> = {};

function wrap(tx: Pick<PGlite, "query">): Db {
  return {
    many: async (t, p = []) => (await tx.query(t, p)).rows as never,
    one: async (t, p = []) => ((await tx.query(t, p)).rows[0] ?? null) as never,
    exec: async (t, p = []) => void (await tx.query(t, p)),
  };
}
async function as<T>(user: string, fn: (db: Db) => Promise<T>): Promise<T> {
  return pg.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: ids[user] })]);
    await tx.exec("set local role authenticated");
    return fn(wrap(tx));
  });
}
const unit = (id: string, kind: string, code: string, x: number, y: number) => ({
  id, kind, code, rowLabel: "", sectorId: null as string | null, x, y, w: kind === "cochera" ? 2 : 3, h: kind === "cochera" ? 4 : 3, outOfService: false, outOfServiceReason: "",
});

before(async () => {
  pg = await PGlite.create({ extensions: { btree_gist }, parsers: { [types.INT8]: Number, [types.NUMERIC]: Number, [types.DATE]: (v: string) => v } });
  await pg.exec(readFileSync("db/dev/auth_stub.sql", "utf8"));
  for (const f of readdirSync("supabase/migrations").sort()) await pg.exec(readFileSync(`supabase/migrations/${f}`, "utf8"));
  await pg.transaction((tx) => seedDemoData(wrap(tx), "clave-de-prueba-123"));
  for (const r of (await pg.query<{ id: string; email: string }>("select id, email from auth.users")).rows) ids[r.email.split("@")[0]] = r.id;
  for (const r of (await pg.query<{ id: string; slug: string }>("select id, slug from balnearios")).rows) ids[r.slug] = r.id;
  // Balneario nuevo, sin plano, con su dueño.
  const b = await pg.query<{ id: string }>(`insert into balnearios (name, slug) values ('Nuevo', 'nuevo') returning id`);
  ids.nuevo = b.rows[0].id;
  await pg.query(`insert into memberships (user_id, balneario_id, role) values ($1, $2, 'owner')`, [ids["dueno.medanos"], ids.nuevo]);
});

test("se crea un plano desde cero y se recupera al volver a entrar", async () => {
  const empty = await as("dueno.medanos", (db) => getSiteMap(db, ids.nuevo, "playa"));
  assert.equal(empty.version, 0);
  assert.equal(empty.units.length, 0);

  const draft: MapDraft = {
    map: "playa", width: 30, height: 20, version: 0,
    sectors: [{ id: "tmp-s1", name: "Primera fila", x: 1, y: 1, w: 20, h: 5 }],
    elements: [{ id: "tmp-e1", kind: "mar", label: "Mar", x: 0, y: 17, w: 30, h: 3 }],
    units: [{ ...unit("tmp-u1", "carpa", "Carpa 01", 2, 2), sectorId: "tmp-s1" }, unit("tmp-u2", "sombrilla", "Sombrilla 01", 10, 10)],
  };
  const v1 = await as("dueno.medanos", (db) => saveSiteMap(db, ids.nuevo, draft));
  assert.equal(v1, 1);

  const saved = await as("dueno.medanos", (db) => getSiteMap(db, ids.nuevo, "playa"));
  assert.equal(saved.units.length, 2);
  assert.equal(saved.sectors[0].name, "Primera fila");
  assert.equal(saved.units.find((u) => u.code === "Carpa 01")!.sectorId, saved.sectors[0].id);
  assert.equal(saved.elements[0].kind, "mar");
});

test("mover, renombrar (incluso intercambiar códigos) y eliminar unidades", async () => {
  const cur = await as("dueno.medanos", (db) => getSiteMap(db, ids.nuevo, "playa"));
  const carpa = cur.units.find((u) => u.code === "Carpa 01")!;
  const sombrilla = cur.units.find((u) => u.code === "Sombrilla 01")!;
  const v2 = await as("dueno.medanos", (db) =>
    saveSiteMap(db, ids.nuevo, { ...cur, map: "playa", units: [{ ...carpa, x: 15, code: "Carpa 10" }, unit("tmp-u3", "carpa", "Carpa 11", 20, 2)] }),
  );
  const after = await as("dueno.medanos", (db) => getSiteMap(db, ids.nuevo, "playa"));
  assert.equal(after.version, v2);
  assert.deepEqual(after.units.map((u) => u.code).sort(), ["Carpa 10", "Carpa 11"]);
  assert.equal(after.units.find((u) => u.code === "Carpa 10")!.x, 15);
  assert.ok(!after.units.some((u) => u.id === sombrilla.id));

  // Intercambio de identificadores en un mismo guardado
  const [a, b] = after.units;
  await as("dueno.medanos", (db) => saveSiteMap(db, ids.nuevo, { ...after, map: "playa", units: [{ ...a, code: b.code }, { ...b, code: a.code }] }));
  const swapped = await as("dueno.medanos", (db) => getSiteMap(db, ids.nuevo, "playa"));
  assert.equal(swapped.units.find((u) => u.id === a.id)!.code, b.code);
});

test("Playa y Cocheras son planos independientes", async () => {
  const playaBefore = await as("dueno.medanos", (db) => getSiteMap(db, ids.nuevo, "playa"));
  await as("dueno.medanos", (db) =>
    saveSiteMap(db, ids.nuevo, { map: "cocheras", width: 20, height: 10, version: 0, sectors: [], elements: [], units: [unit("tmp-c1", "cochera", "Cochera 01", 1, 1)] }),
  );
  const playa = await as("dueno.medanos", (db) => getSiteMap(db, ids.nuevo, "playa"));
  const cocheras = await as("dueno.medanos", (db) => getSiteMap(db, ids.nuevo, "cocheras"));
  assert.deepEqual(playa, playaBefore);
  assert.deepEqual(cocheras.units.map((u) => u.kind), ["cochera"]);
  assert.ok(playa.units.every((u) => u.kind !== "cochera"));
});

test("no se puede eliminar una unidad con reservas ni guardar sobre una versión vieja", async () => {
  const site = await as("dueno.mareas", (db) => getSiteMap(db, ids["mareas-demo"], "playa"));
  await assert.rejects(
    as("dueno.mareas", (db) => saveSiteMap(db, ids["mareas-demo"], { ...site, map: "playa", units: site.units.filter((u) => u.code !== "Carpa 01") })),
    (e) => e instanceof PlanoError && /reservas/.test(e.message),
  );
  await assert.rejects(
    as("dueno.mareas", (db) => saveSiteMap(db, ids["mareas-demo"], { ...site, map: "playa", version: site.version - 1 })),
    (e) => e instanceof PlanoError && /Otra persona/.test(e.message),
  );
});

test("aislamiento: un dueño no lee ni modifica el plano de otro balneario", async () => {
  const foreign = await as("dueno.mareas", (db) => getSiteMap(db, ids.nuevo, "playa"));
  assert.equal(foreign.units.length, 0);
  await assert.rejects(as("dueno.mareas", (db) =>
    saveSiteMap(db, ids.nuevo, { map: "playa", width: 30, height: 20, version: 0, sectors: [], elements: [], units: [unit("tmp-x", "carpa", "Intrusa", 1, 1)] })));
  const intact = await as("dueno.medanos", (db) => getSiteMap(db, ids.nuevo, "playa"));
  assert.ok(intact.units.length === 2 && !intact.units.some((u) => u.code === "Intrusa"));
});

test("un balneario nuevo recibe el plano predeterminado (playa y cocheras)", async () => {
  const b = await pg.query<{ id: string }>(`insert into balnearios (name, slug) values ('Con plantilla', 'con-plantilla') returning id`);
  const bid = b.rows[0].id;
  await as("superadmin", (db) => createLayout(db, bid, DEFAULT_LAYOUT));
  const counts = await pg.query<{ kind: string; n: number }>(`select kind, count(*)::int as n from units where balneario_id = $1 group by kind order by kind`, [bid]);
  assert.deepEqual(counts.rows.map((r) => [r.kind, r.n]), [["carpa", 92], ["cochera", 20], ["sombrilla", 19]]);
  const kinds = await pg.query<{ code: string; default_w: number; default_h: number }>(`select code, default_w, default_h from unit_kinds where code = 'carpa'`);
  assert.deepEqual([kinds.rows[0].default_w, kinds.rows[0].default_h], [2, 2]);
});

test("el administrador sin permiso no puede guardar el plano", async () => {
  const site = await as("admin.mareas", (db) => getSiteMap(db, ids["mareas-demo"], "cocheras"));
  assert.ok(site.units.length > 0, "el administrador sí puede consultar el plano");
  await assert.rejects(as("admin.mareas", (db) => saveSiteMap(db, ids["mareas-demo"], { ...site, map: "cocheras", units: site.units.map((u) => ({ ...u, x: u.x })) })));
});
