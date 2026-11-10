/**
 * Pruebas de seguridad y consistencia de la base de datos.
 * Ejecutan las migraciones reales sobre PostgreSQL embebido (PGlite) y
 * verifican el aislamiento RLS entre balnearios y las reglas por rol.
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite, types } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { seedDemoData } from "../src/server/db/seed.ts";
import type { Db } from "../src/server/db/types.ts";

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

async function rejects(p: Promise<unknown>, code?: string) {
  try {
    await p;
  } catch (e) {
    if (code) assert.equal((e as { code?: string }).code, code, String(e));
    return;
  }
  assert.fail("Se esperaba un error");
}

before(async () => {
  pg = await PGlite.create({ extensions: { btree_gist }, parsers: { [types.INT8]: Number, [types.NUMERIC]: Number, [types.DATE]: (v: string) => v } });
  await pg.exec(readFileSync("db/dev/auth_stub.sql", "utf8"));
  for (const f of readdirSync("supabase/migrations").sort()) await pg.exec(readFileSync(`supabase/migrations/${f}`, "utf8"));
  await pg.transaction((tx) => seedDemoData(wrap(tx), "clave-de-prueba-123"));
  for (const r of (await pg.query<{ id: string; email: string }>("select id, email from auth.users")).rows) {
    ids[r.email.split("@")[0]] = r.id;
  }
  for (const r of (await pg.query<{ id: string; slug: string }>("select id, slug from balnearios")).rows) ids[r.slug] = r.id;
});

test("un administrador solo ve los datos de su balneario", async () => {
  const rows = await as("admin.mareas", (db) => db.many<{ balneario_id: string }>("select distinct balneario_id from customers"));
  assert.deepEqual(rows.map((r) => r.balneario_id), [ids["mareas-demo"]]);
  const other = await as("admin.mareas", (db) => db.many("select id from reservations where balneario_id = $1", [ids["medanos-demo"]]));
  assert.equal(other.length, 0);
});

test("un dueño no puede leer ni escribir en otro balneario", async () => {
  const b = await as("dueno.mareas", (db) => db.many("select id from balnearios"));
  assert.equal(b.length, 1);
  await rejects(as("dueno.mareas", (db) =>
    db.exec("insert into customers (balneario_id, first_name) values ($1, 'Intruso')", [ids["medanos-demo"]])), "42501");
});

test("el administrador no puede consultar el resumen financiero", async () => {
  await rejects(as("admin.mareas", (db) => db.one("select finance_summary($1, '2026-01-01', '2027-12-31')", [ids["mareas-demo"]])), "42501");
  const ok = await as("dueno.mareas", (db) =>
    db.one<{ s: { cobros: number } }>("select finance_summary($1, '2026-01-01', '2027-12-31') as s", [ids["mareas-demo"]]));
  assert.ok(ok!.s.cobros > 0);
});

test("no se permiten reservas superpuestas para la misma unidad", async () => {
  await rejects(as("admin.mareas", async (db) => {
    const unit = await db.one<{ id: string }>("select id from units where code = 'Carpa 01' and balneario_id = $1", [ids["mareas-demo"]]);
    const cust = await db.one<{ id: string }>("select id from customers where balneario_id = $1 limit 1", [ids["mareas-demo"]]);
    const r = await db.one<{ id: string }>(
      "insert into reservations (balneario_id, customer_id, start_date, end_date, total_cents, created_by) values ($1, $2, '2027-01-10', '2027-01-12', 1000, auth.uid()) returning id",
      [ids["mareas-demo"], cust!.id]);
    await db.exec("insert into reservation_units (reservation_id, unit_id, balneario_id, period) values ($1, $2, $3, 'empty')", [r!.id, unit!.id, ids["mareas-demo"]]);
  }), "23P01");
});

test("una reserva cancelada libera la unidad", async () => {
  const free = await as("dueno.mareas", async (db) => {
    const unit = await db.one<{ id: string }>("select id from units where code = 'Carpa 04' and balneario_id = $1", [ids["mareas-demo"]]);
    return db.many("select 1 from reservation_units where unit_id = $1 and active and period && daterange('2027-01-05','2027-01-20','[]')", [unit!.id]);
  });
  assert.equal(free.length, 0);
});

test("el administrador no puede anular pagos ni registrar cobros de Mercado Pago", async () => {
  const updated = await as("admin.mareas", (db) =>
    db.many("update payments set status = 'anulado', voided_at = now() where balneario_id = $1 returning id", [ids["mareas-demo"]]));
  assert.equal(updated.length, 0);
  await rejects(as("admin.mareas", async (db) => {
    const r = await db.one<{ id: string }>("select id from reservations where balneario_id = $1 and status <> 'cancelada' limit 1", [ids["mareas-demo"]]);
    await db.exec("insert into payments (balneario_id, reservation_id, amount_cents, method, created_by) values ($1, $2, 100, 'mercadopago_qr', auth.uid())", [ids["mareas-demo"], r!.id]);
  }), "42501");
});

test("el saldo de la reserva se recalcula con cada pago y anulación", async () => {
  await as("dueno.mareas", async (db) => {
    const r = await db.one<{ id: string; paid_cents: number }>("select id, paid_cents from reservations where balneario_id = $1 and status = 'pendiente' and paid_cents = 0 limit 1", [ids["mareas-demo"]]);
    const p = await db.one<{ id: string }>("insert into payments (balneario_id, reservation_id, amount_cents, method, created_by) values ($1, $2, 12345, 'efectivo', auth.uid()) returning id", [ids["mareas-demo"], r!.id]);
    let after = await db.one<{ paid_cents: number }>("select paid_cents from reservations where id = $1", [r!.id]);
    assert.equal(after!.paid_cents, 12345);
    await db.exec("update payments set status = 'anulado', voided_at = now(), voided_by = auth.uid(), void_reason = 'test' where id = $1", [p!.id]);
    after = await db.one<{ paid_cents: number }>("select paid_cents from reservations where id = $1", [r!.id]);
    assert.equal(after!.paid_cents, 0);
    const audit = await db.many("select 1 from audit_log where action = 'payments.void' and entity_id = $1", [p!.id]);
    assert.equal(audit.length, 1);
  });
});

test("el dueño suma dueños solo en su balneario y no puede escalar a superadmin", async () => {
  await rejects(as("dueno.mareas", (db) =>
    db.exec("insert into memberships (user_id, balneario_id, role) values ($1, $2, 'owner')", [ids["admin.mareas"], ids["medanos-demo"]])), "42501");
  // En su propio balneario sí puede dar acceso de dueño (varios dueños).
  await as("dueno.mareas", (db) =>
    db.exec("insert into memberships (user_id, balneario_id, role) values ($1, $2, 'owner')", [ids["admin.medanos"], ids["mareas-demo"]]));
  await as("dueno.mareas", (db) => db.exec("delete from memberships where user_id = $1 and balneario_id = $2", [ids["admin.medanos"], ids["mareas-demo"]]));
  await rejects(as("dueno.mareas", (db) => db.exec("update profiles set platform_role = 'superadmin' where id = auth.uid()")), "42501");
});

test("el administrador no ve conversaciones comerciales de GAVIA ni prospectos", async () => {
  const conv = await as("admin.mareas", (db) => db.many("select id from conversations where scope = 'gavia'"));
  const leads = await as("admin.mareas", (db) => db.many("select id from leads"));
  assert.equal(conv.length + leads.length, 0);
  const all = await as("superadmin", (db) => db.many("select id from leads"));
  assert.ok(all.length > 0);
});

test("el administrador no edita el plano salvo permiso explícito del dueño", async () => {
  const moved = await as("admin.mareas", (db) =>
    db.many("update units set x = x + 1 where balneario_id = $1 returning id", [ids["mareas-demo"]]));
  assert.equal(moved.length, 0);
  await rejects(as("admin.mareas", (db) =>
    db.exec("insert into units (balneario_id, kind, map, code) values ($1, 'carpa', 'playa', 'Carpa 99')", [ids["mareas-demo"]])), "42501");
  // El dueño otorga el permiso
  await as("dueno.mareas", (db) =>
    db.exec("update memberships set can_edit_plano = true where user_id = $1 and balneario_id = $2", [ids["admin.mareas"], ids["mareas-demo"]]));
  const ok = await as("admin.mareas", (db) =>
    db.many("insert into units (balneario_id, kind, map, code, x, y) values ($1, 'carpa', 'playa', 'Carpa 99', 40, 1) returning id", [ids["mareas-demo"]]));
  assert.equal(ok.length, 1);
  // Un admin no puede otorgarse permisos a sí mismo en otro balneario ni editar planos ajenos
  await rejects(as("admin.mareas", (db) =>
    db.exec("insert into units (balneario_id, kind, map, code) values ($1, 'carpa', 'playa', 'Intrusa')", [ids["medanos-demo"]])), "42501");
  await as("dueno.mareas", (db) =>
    db.exec("update memberships set can_edit_plano = false where user_id = $1 and balneario_id = $2", [ids["admin.mareas"], ids["mareas-demo"]]));
});

test("cada tipo de unidad vive en su plano (playa / cocheras)", async () => {
  await rejects(as("dueno.mareas", (db) =>
    db.exec("insert into units (balneario_id, kind, map, code) values ($1, 'cochera', 'playa', 'Cochera X')", [ids["mareas-demo"]])), "23514");
  const maps = await as("dueno.medanos", (db) => db.many<{ map: string }>("select map from site_maps order by map"));
  assert.deepEqual(maps.map((m) => m.map), ["cocheras", "playa"]);
});

test("plan START: sin módulo de pagos ni WhatsApp, también en la base de datos", async () => {
  const mods = await as("dueno.medanos", (db) => db.one<{ m: string[] }>("select balneario_modules($1) as m", [ids["medanos-demo"]]));
  assert.deepEqual(mods!.m, []);
  await rejects(as("dueno.medanos", async (db) => {
    const r = await db.one<{ id: string }>("select id from reservations where balneario_id = $1 and status <> 'cancelada' limit 1", [ids["medanos-demo"]]);
    await db.exec("insert into payments (balneario_id, reservation_id, amount_cents, method, created_by) values ($1, $2, 100, 'efectivo', auth.uid())", [ids["medanos-demo"], r!.id]);
  }), "42501");
  await rejects(as("dueno.medanos", (db) =>
    db.exec("insert into conversations (scope, balneario_id, contact_phone) values ('balneario', $1, '+5400000')", [ids["medanos-demo"]])), "42501");
  const plus = await as("dueno.mareas", (db) => db.one<{ m: string[] }>("select balneario_modules($1) as m", [ids["mareas-demo"]]));
  assert.ok(plus!.m.includes("pagos") && plus!.m.includes("whatsapp"));
});

test("cambiar de plan habilita los módulos al instante", async () => {
  await pg.query(`update subscriptions set plan_id = (select id from plans where code = 'pro') where balneario_id = $1`, [ids["medanos-demo"]]);
  const r = await as("admin.medanos", (db) => db.one<{ w: boolean; p: boolean }>("select has_module($1, 'whatsapp') as w, has_module($1, 'pagos') as p", [ids["medanos-demo"]]));
  assert.deepEqual(r, { w: true, p: false });
  await pg.query(`update subscriptions set plan_id = (select id from plans where code = 'start') where balneario_id = $1`, [ids["medanos-demo"]]);
});

test("los gastos solo los ve y carga el dueño de su balneario", async () => {
  const own = await as("dueno.mareas", (db) => db.many("select id from expenses"));
  assert.ok(own.length > 0);
  const admin = await as("admin.mareas", (db) => db.many("select id from expenses"));
  assert.equal(admin.length, 0);
  const other = await as("dueno.medanos", (db) => db.many("select id from expenses"));
  assert.equal(other.length, 0);
  await rejects(as("admin.mareas", async (db) => {
    await db.exec("insert into expense_categories (balneario_id, name) values ($1, 'Intento')", [ids["mareas-demo"]]);
  }), "42501");
});

test("confidencialidad: GAVIA no ve cobros, resumen financiero ni gastos de un balneario", async () => {
  const pays = await as("superadmin", (db) => db.many("select id from payments"));
  assert.equal(pays.length, 0);
  await rejects(as("superadmin", (db) => db.one("select finance_summary($1, '2026-01-01', '2027-12-31')", [ids["mareas-demo"]])), "42501");
  const exp = await as("superadmin", (db) => db.many("select id from expenses"));
  assert.equal(exp.length, 0);
  // Pero sí puede supervisar la operación (reservas y plano) para dar soporte.
  const res = await as("superadmin", (db) => db.many("select id from reservations where balneario_id = $1", [ids["mareas-demo"]]));
  assert.ok(res.length > 0);
});

test("permisos por sección: un superadmin sin Facturación no ve facturas ni puede gestionar usuarios", async () => {
  await pg.query(`insert into auth.users (email, encrypted_password) values ('limitado@gavia-demo.test', 'x')`);
  const u = await pg.query<{ id: string }>(`select id from profiles where email = 'limitado@gavia-demo.test'`);
  ids.limitado = u.rows[0].id;
  await pg.query(`update profiles set platform_role = 'superadmin', platform_permissions = '{crm}' where id = $1`, [ids.limitado]);
  const inv = await as("limitado", (db) => db.many("select id from gavia_invoices"));
  assert.equal(inv.length, 0);
  const leads = await as("limitado", (db) => db.many("select id from leads"));
  assert.ok(leads.length > 0);
  const tenant = await as("limitado", (db) => db.many("select id from customers"));
  assert.equal(tenant.length, 0, "sin permiso de Balnearios no supervisa establecimientos");
  await rejects(as("limitado", (db) => db.exec("update profiles set platform_permissions = '{crm,usuarios}' where id = auth.uid()")), "42501");
});

test("agenda de demos: un turno no puede reservarse dos veces", async () => {
  await pg.query(`insert into demo_bookings (starts_at, name, email) values ('2027-01-05T12:00:00Z', 'Prueba', 'a@b.test')`);
  await rejects(pg.query(`insert into demo_bookings (starts_at, name, email) values ('2027-01-05T12:00:00Z', 'Otra', 'c@d.test')`), "23505");
  await pg.query(`update demo_bookings set status = 'cancelada' where email = 'a@b.test'`);
  await pg.query(`insert into demo_bookings (starts_at, name, email) values ('2027-01-05T12:00:00Z', 'Otra', 'c@d.test')`);
});

test("TESTING: al vencer los 15 días de prueba el acceso queda bloqueado", async () => {
  const before = await as("dueno.medanos", (db) => db.one<{ a: { estado: string } }>("select balneario_access($1) as a", [ids["medanos-demo"]]));
  assert.equal(before!.a.estado, "prueba");
  await pg.query(`update subscriptions set current_period_end = current_date - 1 where balneario_id = $1`, [ids["medanos-demo"]]);
  const after = await as("dueno.medanos", (db) => db.one<{ a: { estado: string } }>("select balneario_access($1) as a", [ids["medanos-demo"]]));
  assert.equal(after!.a.estado, "prueba_vencida");
  await pg.query(`update subscriptions set current_period_end = current_date + 10 where balneario_id = $1`, [ids["medanos-demo"]]);
});

test("cambiar la unidad de una reserva conserva importe y pagos", async () => {
  await as("dueno.mareas", async (db) => {
    const r = await db.one<{ id: string; total_cents: number; paid_cents: number }>(
      `select r.id, r.total_cents, r.paid_cents from reservations r join reservation_units ru on ru.reservation_id = r.id join units u on u.id = ru.unit_id
        where r.balneario_id = $1 and u.code = 'Carpa 12'`, [ids["mareas-demo"]]);
    const to = await db.one<{ id: string }>(`select id from units where balneario_id = $1 and code = 'Carpa 15'`, [ids["mareas-demo"]]);
    await db.exec(`delete from reservation_units where reservation_id = $1`, [r!.id]);
    await db.exec(`insert into reservation_units (reservation_id, unit_id, balneario_id, period) values ($1, $2, $3, 'empty')`, [r!.id, to!.id, ids["mareas-demo"]]);
    const after = await db.one<{ total_cents: number; paid_cents: number }>(`select total_cents, paid_cents from reservations where id = $1`, [r!.id]);
    assert.deepEqual(after, { total_cents: r!.total_cents, paid_cents: r!.paid_cents });
  });
});

test("los secretos de integraciones no son legibles por usuarios", async () => {
  await rejects(as("dueno.mareas", (db) => db.many("select * from integration_secrets")), "42501");
});

test("el dueño puede pasar un administrador a dueño; el administrador no puede cambiar roles", async () => {
  const m = await pg.query<{ id: string }>("select id from memberships where user_id = $1 and balneario_id = $2", [ids["admin.mareas"], ids["mareas-demo"]]);
  const mid = m.rows[0].id;
  const denied = await as("admin.mareas", (db) => db.many("update memberships set role = 'owner' where id = $1 returning id", [mid]));
  assert.equal(denied.length, 0);
  const ok = await as("dueno.mareas", (db) => db.many("update memberships set role = 'owner' where id = $1 returning id", [mid]));
  assert.equal(ok.length, 1);
  // Con dos dueños, el nuevo dueño ya ve el resumen financiero.
  const fin = await as("admin.mareas", (db) => db.one<{ s: { cobros: number } }>("select finance_summary($1, '2026-01-01', '2027-12-31') as s", [ids["mareas-demo"]]));
  assert.ok(fin!.s.cobros > 0);
  await as("dueno.mareas", (db) => db.exec("update memberships set role = 'admin' where id = $1", [mid]));
});

test("un balneario no puede quedarse sin dueño activo", async () => {
  await rejects(as("dueno.mareas", (db) =>
    db.exec("update memberships set role = 'admin' where user_id = auth.uid() and balneario_id = $1", [ids["mareas-demo"]])), "23514");
  await rejects(as("dueno.mareas", (db) =>
    db.exec("update memberships set active = false where user_id = auth.uid() and balneario_id = $1", [ids["mareas-demo"]])), "23514");
});

test("solo el dueño marca un cobro como facturado y el importe sigue inmutable", async () => {
  const p = await pg.query<{ id: string }>("select id from payments where balneario_id = $1 and status = 'aprobado' limit 1", [ids["mareas-demo"]]);
  const pid = p.rows[0].id;
  const byAdmin = await as("admin.mareas", (db) => db.many("update payments set invoiced = true where id = $1 returning id", [pid]));
  assert.equal(byAdmin.length, 0);
  const byOwner = await as("dueno.mareas", (db) => db.many("update payments set invoiced = true, invoice_ref = 'B-0001-00000123', invoiced_at = now() where id = $1 returning id", [pid]));
  assert.equal(byOwner.length, 1);
  await rejects(as("dueno.mareas", (db) => db.exec("update payments set amount_cents = amount_cents + 1 where id = $1", [pid])), "42501");
});

test("un balneario activo que no renovó el plan anual queda sin acceso y se suspende", async () => {
  const b = ids["mareas-demo"];
  const sub = await pg.query<{ id: string; current_period_end: string }>("select id, current_period_end from subscriptions where balneario_id = $1 order by created_at desc limit 1", [b]);
  await pg.query("update subscriptions set current_period_end = current_date - 1 where id = $1", [sub.rows[0].id]);
  const access = await as("dueno.mareas", (db) => db.one<{ a: { estado: string } }>("select balneario_access($1) as a", [b]));
  assert.equal(access!.a.estado, "sin_renovar");
  await rejects(as("dueno.mareas", (db) => db.one("select suspend_unrenewed_balnearios()")), "42501");
  const n = await pg.query<{ n: number }>("select suspend_unrenewed_balnearios() as n");
  assert.ok(n.rows[0].n >= 1);
  const st = await pg.query<{ status: string }>("select status from balnearios where id = $1", [b]);
  assert.equal(st.rows[0].status, "suspendido");
  // Restaura el estado para no afectar otras pruebas.
  await pg.query("update subscriptions set current_period_end = $2, status = 'activa' where id = $1", [sub.rows[0].id, sub.rows[0].current_period_end]);
  await pg.query("update balnearios set status = 'activo' where id = $1", [b]);
});

test("eliminar una reserva sin cobros conserva al cliente; con cobros no se puede", async () => {
  const b = ids["mareas-demo"];
  const res = await as("admin.mareas", async (db) => {
    const cust = await db.one<{ id: string }>("insert into customers (balneario_id, first_name, last_name) values ($1, 'Para', 'Borrar') returning id", [b]);
    const unit = await db.one<{ id: string }>("select id from units where code = 'Carpa 04' and balneario_id = $1", [b]);
    const r = await db.one<{ id: string }>(
      "insert into reservations (balneario_id, customer_id, start_date, end_date, total_cents, created_by) values ($1, $2, '2028-02-01', '2028-02-05', 1000, auth.uid()) returning id",
      [b, cust!.id]);
    await db.exec("insert into reservation_units (reservation_id, unit_id, balneario_id, period) values ($1, $2, $3, 'empty')", [r!.id, unit!.id, b]);
    return { customerId: cust!.id, reservationId: r!.id };
  });
  const deleted = await as("admin.mareas", (db) => db.many("delete from reservations where id = $1 returning id", [res.reservationId]));
  assert.equal(deleted.length, 1);
  const still = await as("admin.mareas", (db) => db.many("select id from customers where id = $1", [res.customerId]));
  assert.equal(still.length, 1);
  const withPayment = await pg.query<{ reservation_id: string }>("select reservation_id from payments where balneario_id = $1 limit 1", [b]);
  await rejects(as("dueno.mareas", (db) => db.exec("delete from reservations where id = $1", [withPayment.rows[0].reservation_id])), "23001");
  // Un balneario no borra reservas de otro.
  const other = await pg.query<{ id: string }>("select id from reservations where balneario_id = $1 limit 1", [ids["medanos-demo"]]);
  const none = await as("dueno.mareas", (db) => db.many("delete from reservations where id = $1 returning id", [other.rows[0].id]));
  assert.equal(none.length, 0);
});

test("carpa compartida: dos clientes en la misma reserva, sin cruzar balnearios", async () => {
  const b = ids["mareas-demo"];
  const r = await pg.query<{ id: string; customer_id: string }>("select id, customer_id from reservations where balneario_id = $1 and status <> 'cancelada' limit 1", [b]);
  const { id, customer_id } = r.rows[0];
  const second = await pg.query<{ id: string }>("select id from customers where balneario_id = $1 and id <> $2 limit 1", [b, customer_id]);
  await as("admin.mareas", (db) => db.exec("insert into reservation_customers (reservation_id, balneario_id, customer_id) values ($1, $2, $3)", [id, b, second.rows[0].id]));
  const names = await as("admin.mareas", (db) => db.one<{ n: string }>("select reservation_holders($1) as n", [id]));
  assert.match(names!.n, / y /);
  await rejects(as("admin.mareas", (db) => db.exec("insert into reservation_customers (reservation_id, balneario_id, customer_id) values ($1, $2, $3)", [id, b, customer_id])), "23514");
  const foreign = await pg.query<{ id: string }>("select id from customers where balneario_id = $1 limit 1", [ids["medanos-demo"]]);
  await rejects(as("admin.mareas", (db) => db.exec("insert into reservation_customers (reservation_id, balneario_id, customer_id) values ($1, $2, $3)", [id, b, foreign.rows[0].id])));
  await as("admin.mareas", (db) => db.exec("delete from reservation_customers where reservation_id = $1", [id]));
});

test("Sueldos es predeterminada, no se borra y solo ella lleva empleado; empleados solo para el dueño", async () => {
  const b = ids["mareas-demo"];
  const nuevo = await pg.query<{ n: number }>("select count(*)::int as n from expense_categories where balneario_id = $1 and kind = 'sueldos'", [ids["medanos-demo"]]);
  assert.equal(nuevo.rows[0].n, 1);
  const s = await pg.query<{ id: string }>("select id from expense_categories where balneario_id = $1 and kind = 'sueldos'", [b]);
  await rejects(as("dueno.mareas", (db) => db.exec("delete from expense_categories where id = $1", [s.rows[0].id])), "23514");
  const adminSees = await as("admin.mareas", (db) => db.many("select id from employees"));
  assert.equal(adminSees.length, 0);
  const emp = await as("dueno.mareas", (db) => db.one<{ id: string }>("select id from employees where balneario_id = $1 limit 1", [b]));
  assert.ok(emp);
  const other = await pg.query<{ id: string }>("select id from expense_categories where balneario_id = $1 and kind = 'general' limit 1", [b]);
  await rejects(as("dueno.mareas", (db) =>
    db.exec("insert into expenses (balneario_id, category_id, spent_on, amount_cents, employee_id) values ($1, $2, current_date, 100, $3)", [b, other.rows[0].id, emp!.id])), "23514");
  await as("dueno.mareas", (db) =>
    db.exec("insert into expenses (balneario_id, category_id, spent_on, amount_cents, employee_id) values ($1, $2, current_date, 100, $3)", [b, s.rows[0].id, emp!.id]));
  await rejects(as("dueno.mareas", (db) => db.exec("insert into employees (balneario_id, full_name, cbu) values ($1, 'CBU corto', '123')", [b])), "23514");
});
