import { hashPassword } from "../auth/password.ts";
import type { Db } from "./types.ts";
import { createLayout, type Layout } from "./layouts.ts";

/**
 * DATOS DE DEMOSTRACIÓN. Todo lo que se inserta acá es ficticio y queda
 * marcado con is_demo = true. Solo se ejecuta en el modo demo local.
 */

export const DEMO_USERS = [
  { key: "super", email: "superadmin@gavia-demo.test", name: "Equipo GAVIA (demo)", superadmin: true },
  { key: "owner1", email: "dueno.mareas@gavia-demo.test", name: "Martina Ríos (demo)" },
  { key: "admin1", email: "admin.mareas@gavia-demo.test", name: "Tomás Acosta (demo)" },
  { key: "owner2", email: "dueno.medanos@gavia-demo.test", name: "Julián Paz (demo)" },
  { key: "admin2", email: "admin.medanos@gavia-demo.test", name: "Carla Ledesma (demo)" },
] as const;

const pad = (n: number) => String(n).padStart(2, "0");
function isoDay(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function offset(days: number) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return isoDay(d);
}
function stamp(days: number, hour = 10) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

const LAYOUT_1: Layout = {
  maps: [{ map: "playa", width: 48, height: 32 }, { map: "cocheras", width: 34, height: 16 }],
  sectors: [
    { map: "playa", name: "Segunda línea", x: 1, y: 3, w: 46, h: 5, rows: [{ label: "C", kind: "carpa", count: 10, x: 4, y: 4, step: 4 }] },
    { map: "playa", name: "Primera línea", x: 1, y: 10, w: 46, h: 10, rows: [{ label: "B", kind: "carpa", count: 10, x: 4, y: 11, step: 4 }, { label: "A", kind: "carpa", count: 10, x: 4, y: 16, step: 4 }] },
    { map: "playa", name: "Sombrillas", x: 1, y: 21, w: 46, h: 6, rows: [{ label: "D", kind: "sombrilla", count: 8, x: 5, y: 22, step: 5 }, { label: "E", kind: "sombrilla", count: 8, x: 5, y: 25, step: 5 }] },
    { map: "cocheras", name: "Playón norte", x: 1, y: 0, w: 32, h: 6, rows: [{ label: "1", kind: "cochera", count: 6, x: 3, y: 1, step: 5 }] },
    { map: "cocheras", name: "Playón sur", x: 1, y: 10, w: 32, h: 6, rows: [{ label: "2", kind: "cochera", count: 6, x: 3, y: 11, step: 5 }] },
  ],
  elements: [
    { map: "playa", kind: "acceso", label: "Ingreso · Paseo costero", x: 0, y: 0, w: 48, h: 2 },
    { map: "playa", kind: "pasillo", label: "Pasillo central", x: 0, y: 8, w: 48, h: 2 },
    { map: "playa", kind: "edificio", label: "Parador", x: 0, y: 3, w: 1, h: 5 },
    { map: "playa", kind: "mar", label: "Mar", x: 0, y: 28, w: 48, h: 4 },
    { map: "cocheras", kind: "pasillo", label: "Calle interna", x: 0, y: 7, w: 34, h: 2 },
    { map: "cocheras", kind: "acceso", label: "Entrada", x: 0, y: 6, w: 1, h: 4 },
  ],
};
const LAYOUT_2: Layout = {
  maps: [{ map: "playa", width: 40, height: 26 }, { map: "cocheras", width: 28, height: 10 }],
  sectors: [
    { map: "playa", name: "Carpas", x: 1, y: 1, w: 38, h: 10, rows: [{ label: "A", kind: "carpa", count: 8, x: 3, y: 2, step: 4 }, { label: "B", kind: "carpa", count: 8, x: 3, y: 7, step: 4 }] },
    { map: "playa", name: "Sombrillas", x: 1, y: 14, w: 38, h: 5, rows: [{ label: "C", kind: "sombrilla", count: 10, x: 3, y: 15, step: 3 }] },
    { map: "cocheras", name: "Estacionamiento", x: 1, y: 0, w: 26, h: 6, rows: [{ label: "1", kind: "cochera", count: 8, x: 2, y: 1, step: 3 }] },
  ],
  elements: [
    { map: "playa", kind: "pasillo", label: "Pasarela", x: 0, y: 11, w: 40, h: 2 },
    { map: "playa", kind: "mar", label: "Mar", x: 0, y: 22, w: 40, h: 4 },
    { map: "cocheras", kind: "pasillo", label: "Acceso vehicular", x: 0, y: 7, w: 28, h: 2 },
  ],
};


const CUSTOMERS_1 = [
  ["Lucía", "Fernández"], ["Diego", "Sosa"], ["Valentina", "Giménez"], ["Matías", "Romero"],
  ["Florencia", "Benítez"], ["Nicolás", "Herrera"], ["Camila", "Domínguez"], ["Santiago", "Ruiz"],
  ["Agustina", "Molina"], ["Federico", "Castro"], ["Paula", "Ortiz"], ["Gonzalo", "Vera"],
];
const CUSTOMERS_2 = [["Rocío", "Medina"], ["Ezequiel", "Suárez"], ["Milagros", "Aguirre"], ["Bruno", "Ponce"], ["Sofía", "Quiroga"], ["Ignacio", "Rey"]];

async function createCustomers(db: Db, balnearioId: string, names: string[][], area: string) {
  const ids: string[] = [];
  for (const [i, [first, last]] of names.entries()) {
    const phone = `+54 9 ${area} 555-${String(100 + i).padStart(4, "0")}`;
    const c = await db.one<{ id: string }>(
      `insert into customers (balneario_id, first_name, last_name, phone, whatsapp, email, document_id, notes, is_demo)
       values ($1, $2, $3, $4, $4, $5, $6, $7, true) returning id`,
      [balnearioId, first, last, phone, `${first.toLowerCase()}.${i}@ejemplo.test`, `DEMO-${30000000 + i * 7}`,
       i % 3 === 0 ? "Cliente de temporadas anteriores (dato ficticio)." : ""],
    );
    ids.push(c!.id);
  }
  return ids;
}

type ResSeed = {
  customer: number; units: string[]; start: string; end: string; total: number;
  status: "pendiente" | "confirmada" | "cancelada"; notes?: string;
  payments?: { amount: number; method: string; daysAgo: number }[];
};

async function createReservations(db: Db, balnearioId: string, createdBy: string, customers: string[], units: Record<string, string>, list: ResSeed[]) {
  const ids: string[] = [];
  for (const r of list) {
    const row = await db.one<{ id: string }>(
      `insert into reservations (balneario_id, customer_id, start_date, end_date, total_cents, status, notes, created_by, is_demo,
         cancelled_at, cancelled_by, cancel_reason)
       values ($1, $2, $3, $4, $5, $6, $7, $8, true,
         case when $6 = 'cancelada' then now() end, case when $6 = 'cancelada' then $8::uuid end,
         case when $6 = 'cancelada' then 'El cliente cambió de planes (demo)' end)
       returning id`,
      [balnearioId, customers[r.customer], r.start, r.end, r.total * 100, r.status, r.notes ?? "", createdBy],
    );
    for (const code of r.units) {
      await db.exec(`insert into reservation_units (reservation_id, unit_id, balneario_id, period) values ($1, $2, $3, '[2000-01-01,2000-01-02]')`, [
        row!.id, units[code], balnearioId,
      ]);
    }
    for (const p of r.payments ?? []) {
      await db.exec(
        `insert into payments (balneario_id, reservation_id, amount_cents, method, paid_at, created_by, is_demo, notes)
         values ($1, $2, $3, $4, $5, $6, true, 'Pago de demostración')`,
        [balnearioId, row!.id, p.amount * 100, p.method, stamp(-p.daysAgo), createdBy],
      );
    }
    ids.push(row!.id);
  }
  return ids;
}

export async function seedDemoData(db: Db, demoPassword: string) {
  if (!demoPassword || demoPassword.length < 10) throw new Error("GAVIA_DEMO_PASSWORD es obligatoria para crear los datos demo");
  const hash = await hashPassword(demoPassword);
  const users: Record<string, string> = {};
  for (const u of DEMO_USERS) {
    const row = await db.one<{ id: string }>(
      `insert into auth.users (email, encrypted_password, raw_user_meta_data) values ($1, $2, $3) returning id`,
      [u.email, hash, JSON.stringify({ full_name: u.name })],
    );
    users[u.key] = row!.id;
    await db.exec(`update profiles set is_demo = true, platform_role = $2,
        platform_permissions = case when $2::text is not null then array['dashboard', 'balnearios', 'crm', 'calendario', 'conversaciones', 'suscripciones', 'facturacion', 'reportes', 'usuarios', 'planes', 'auditoria'] else '{}'::text[] end
      where id = $1`, [
      row!.id, "superadmin" in u && u.superadmin ? "superadmin" : null,
    ]);
  }

  // Los planes (START, PRO, PLUS) y sus precios en USD los crean las migraciones.
  const plans: Record<string, string> = {};
  for (const code of ["start", "pro", "plus"] as const) {
    const row = await db.one<{ id: string }>(`select id from plans where code = $1`, [code]);
    plans[code] = row!.id;
  }

  const b1 = await db.one<{ id: string }>(
    `insert into balnearios (name, slug, city, address, phone, email, status, season_start, season_end, is_demo)
     values ('Balneario Mareas [DEMO]', 'mareas-demo', 'Pinamar (ficticio)', 'Av. Costanera 1000 (ficticia)', '+54 9 2254 555-0001', 'contacto@mareas-demo.test', 'activo', '2026-12-01', '2027-03-31', true)
     returning id`,
  );
  const b2 = await db.one<{ id: string }>(
    `insert into balnearios (name, slug, city, address, phone, email, status, season_start, season_end, is_demo)
     values ('Parador Los Médanos [DEMO]', 'medanos-demo', 'Villa Gesell (ficticio)', 'Paseo 140 y playa (ficticio)', '+54 9 2255 555-0002', 'hola@medanos-demo.test', 'prueba', '2026-12-15', '2027-03-15', true)
     returning id`,
  );
  const B1 = b1!.id;
  const B2 = b2!.id;

  for (const [user, b, role] of [
    [users.owner1, B1, "owner"], [users.admin1, B1, "admin"], [users.owner2, B2, "owner"], [users.admin2, B2, "admin"],
  ]) {
    await db.exec(`insert into memberships (user_id, balneario_id, role) values ($1, $2, $3)`, [user, b, role]);
  }

  const u1 = await createLayout(db, B1, LAYOUT_1);
  const u2 = await createLayout(db, B2, LAYOUT_2);
  await db.exec(`update units set out_of_service = true, out_of_service_reason = 'Reparación de lona' where id = $1`, [u1["Carpa 10"]]);
  await db.exec(`update units set out_of_service = true, out_of_service_reason = 'Base dañada' where id = $1`, [u1["Sombrilla 08"]]);
  await db.exec(`update units set out_of_service = true, out_of_service_reason = 'Sector en obra' where id = $1`, [u2["Cochera 08"]]);

  const c1 = await createCustomers(db, B1, CUSTOMERS_1, "2254");
  const c2 = await createCustomers(db, B2, CUSTOMERS_2, "2255");

  const r1 = await createReservations(db, B1, users.owner1, c1, u1, [
    { customer: 0, units: ["Carpa 01", "Cochera 02"], start: offset(-3), end: offset(4), total: 420000, status: "confirmada", notes: "Fin de semana extendido.", payments: [{ amount: 420000, method: "transferencia", daysAgo: 10 }] },
    { customer: 1, units: ["Carpa 02"], start: offset(1), end: offset(10), total: 380000, status: "pendiente", payments: [{ amount: 100000, method: "efectivo", daysAgo: 2 }] },
    { customer: 2, units: ["Carpa 05"], start: offset(0), end: offset(2), total: 150000, status: "confirmada" },
    { customer: 3, units: ["Sombrilla 03"], start: offset(-1), end: offset(1), total: 60000, status: "confirmada", payments: [{ amount: 60000, method: "efectivo", daysAgo: 1 }] },
    { customer: 4, units: ["Carpa 01"], start: "2027-01-01", end: "2027-01-31", total: 2600000, status: "confirmada", notes: "Quincena doble, enero completo.", payments: [{ amount: 1300000, method: "transferencia", daysAgo: 20 }] },
    { customer: 5, units: ["Carpa 03", "Cochera 01"], start: "2026-12-01", end: "2027-03-31", total: 7800000, status: "confirmada", notes: "Temporada completa.", payments: [{ amount: 3900000, method: "transferencia", daysAgo: 25 }, { amount: 1500000, method: "tarjeta", daysAgo: 4 }] },
    { customer: 6, units: ["Carpa 07"], start: "2027-02-01", end: "2027-02-28", total: 2300000, status: "pendiente" },
    { customer: 7, units: ["Sombrilla 01"], start: "2027-01-01", end: "2027-01-15", total: 480000, status: "pendiente", payments: [{ amount: 150000, method: "efectivo", daysAgo: 6 }] },
    { customer: 8, units: ["Carpa 12"], start: "2027-01-15", end: "2027-02-15", total: 2700000, status: "confirmada", payments: [{ amount: 2700000, method: "transferencia", daysAgo: 15 }] },
    { customer: 9, units: ["Carpa 04"], start: "2027-01-05", end: "2027-01-20", total: 1300000, status: "cancelada" },
    { customer: 10, units: ["Carpa 21", "Cochera 05"], start: "2027-02-01", end: "2027-02-14", total: 1450000, status: "confirmada", payments: [{ amount: 500000, method: "efectivo", daysAgo: 3 }] },
    { customer: 11, units: ["Sombrilla 09"], start: offset(2), end: offset(5), total: 90000, status: "pendiente" },
  ]);
  const r2 = await createReservations(db, B2, users.owner2, c2, u2, [
    { customer: 0, units: ["Carpa 01"], start: "2027-01-02", end: "2027-01-16", total: 1100000, status: "confirmada", payments: [{ amount: 550000, method: "transferencia", daysAgo: 8 }] },
    { customer: 1, units: ["Carpa 05", "Cochera 01"], start: "2027-01-10", end: "2027-01-31", total: 1900000, status: "confirmada", payments: [{ amount: 1900000, method: "transferencia", daysAgo: 12 }] },
    { customer: 2, units: ["Sombrilla 02"], start: offset(0), end: offset(3), total: 70000, status: "pendiente" },
    { customer: 3, units: ["Carpa 09"], start: "2027-02-01", end: "2027-02-20", total: 1500000, status: "pendiente", payments: [{ amount: 300000, method: "efectivo", daysAgo: 5 }] },
  ]);

  // Recordatorios y tareas
  const reminders: [string, string | null, string, string, string, number, number, string | null, string | null][] = [
    // scope, balneario, kind, title, description, dayOffset, hour, customer, reservation
    ["balneario", B1, "reserva", "Confirmar reserva de Carpa 02", "Llamar para confirmar la seña y la fecha de ingreso.", 0, 11, c1[1], r1[1]],
    ["balneario", B1, "cliente", "Enviar datos de transferencia", "El cliente pidió el CBU para completar el saldo.", -1, 9, c1[4], r1[4]],
    ["balneario", B1, "tarea", "Revisar lonas del sector A", "Controlar estado antes del fin de semana.", 2, 8, null, null],
    ["balneario", B1, "tarea", "Reparar Carpa 10", "Coordinar con proveedor de lonas.", 5, 10, null, null],
    ["balneario", B1, "reserva", "Cobrar saldo de temporada", "Saldo pendiente de la reserva de temporada completa.", 7, 12, c1[5], r1[5]],
    ["balneario", B2, "tarea", "Pintar sector de cocheras", "Antes de la apertura de temporada.", 3, 9, null, null],
    ["balneario", B2, "reserva", "Confirmar Sombrilla 02", "Reserva pendiente de confirmación.", 0, 16, c2[2], r2[2]],
  ];
  for (const [scope, b, kind, title, desc, day, hour, cust, res] of reminders) {
    const assignee = b === B1 ? users.admin1 : users.admin2;
    await db.exec(
      `insert into reminders (scope, balneario_id, kind, title, description, due_at, assigned_to, customer_id, reservation_id, created_by, is_demo)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $7, true)`,
      [scope, b, kind, title, desc, stamp(day, hour), assignee, cust, res],
    );
  }

  // CRM comercial de GAVIA
  const leads = [
    ["Balneario Ficticio Norte", "Ana Prueba", "propuesta", "Feria de turismo (demo)"],
    ["Parador Ejemplo Sur", "Luis Ejemplo", "demo", "Recomendación (demo)"],
    ["Complejo Playa Ficticia", "Marta Muestra", "contactado", "Web (demo)"],
    ["Balneario Prueba Centro", "Raúl Test", "prospecto", "Llamado en frío (demo)"],
    ["Parador Inventado", "Elena Demo", "perdido", "Web (demo)"],
  ];
  const leadIds: string[] = [];
  for (const [i, [biz, contact, stage, source]] of leads.entries()) {
    const l = await db.one<{ id: string }>(
      `insert into leads (business_name, contact_name, phone, email, city, stage, source, assigned_to, is_demo)
       values ($1, $2, $3, $4, $5, $6, $7, $8, true) returning id`,
      [biz, contact, `+54 9 223 555-${String(200 + i).padStart(4, "0")}`, `contacto${i}@lead-demo.test`, "Costa Atlántica (ficticio)", stage, source, users.super],
    );
    leadIds.push(l!.id);
  }
  await db.exec(
    `insert into reminders (scope, kind, title, description, due_at, assigned_to, lead_id, created_by, is_demo) values
     ('gavia', 'comercial', 'Enviar propuesta comercial', 'Propuesta plan Profesional.', $1, $3, $4, $3, true),
     ('gavia', 'comercial', 'Agendar demo del plano', 'Mostrar configuración de sectores.', $2, $3, $5, $3, true)`,
    [stamp(1, 15), stamp(-2, 10), users.super, leadIds[0], leadIds[1]],
  );
  await db.exec(
    `insert into interactions (scope, lead_id, kind, summary, occurred_at, created_by) values
     ('gavia', $1, 'reunion', 'Reunión inicial: interesados en reservas por temporada (demo).', $3, $4),
     ('gavia', $2, 'llamada', 'Se coordinó una demostración del producto (demo).', $5, $4)`,
    [leadIds[0], leadIds[1], stamp(-9), users.super, stamp(-4)],
  );
  await db.exec(
    `insert into interactions (scope, balneario_id, customer_id, kind, summary, occurred_at, created_by) values
     ('balneario', $1, $2, 'llamada', 'Consultó por renovar la carpa para la próxima temporada (demo).', $3, $4)`,
    [B1, c1[5], stamp(-12), users.admin1],
  );

  // Suscripciones y facturación GAVIA
  const s1 = await db.one<{ id: string }>(
    `insert into subscriptions (balneario_id, plan_id, status, price_cents, current_period_start, current_period_end)
     values ($1, $2, 'activa', 129900, $3, $4) returning id`,
    // Plan anual vigente (relativo a hoy, para que la demo nunca quede "sin renovar").
    [B1, plans.plus, offset(-28), offset(337)],
  );
  await db.exec(
    `insert into subscriptions (balneario_id, plan_id, status, price_cents, current_period_start, current_period_end)
     values ($1, $2, 'prueba', 39900, $3, $4)`,
    [B2, plans.start, offset(-10), offset(20)],
  );
  const inv1 = await db.one<{ id: string }>(
    `insert into gavia_invoices (balneario_id, subscription_id, concept, amount_cents, issued_at, due_date, status, paid_at)
     values ($1, $2, 'Temporada 2026/27 — cuota 1 de 2 (demo)', 64950, $3, $4, 'pagada', $5) returning id`,
    [B1, s1!.id, offset(-28), offset(-18), stamp(-20)],
  );
  await db.exec(
    `insert into gavia_payments (invoice_id, balneario_id, amount_cents, method, reference, paid_at, created_by)
     values ($1, $2, 64950, 'transferencia', 'DEMO-TRF-0001', $3, $4)`,
    [inv1!.id, B1, stamp(-20), users.super],
  );
  await db.exec(
    `insert into gavia_invoices (balneario_id, subscription_id, concept, amount_cents, issued_at, due_date, status)
     values ($1, $2, 'Temporada 2026/27 — cuota 2 de 2 (demo)', 64950, $3, $4, 'emitida')`,
    [B1, s1!.id, offset(-3), offset(27)],
  );

  // Conversaciones de demostración (marcadas como tales en la interfaz)
  const conv = await db.one<{ id: string }>(
    `insert into conversations (scope, balneario_id, contact_name, contact_phone, customer_id, reservation_id, status, unread_count, last_message_at, is_demo)
     values ('balneario', $1, 'Diego Sosa', '+54 9 2254 555-0101', $2, $3, 'pendiente', 1, $4, true) returning id`,
    [B1, c1[1], r1[1], stamp(0, 9)],
  );
  await db.exec(
    `insert into messages (conversation_id, direction, body, status, created_at, is_demo) values
     ($1, 'entrante', 'Hola, ¿puedo pagar el resto de la carpa cuando llegue? (mensaje de demostración)', 'recibido', $2, true)`,
    [conv!.id, stamp(0, 9)],
  );
  const conv2 = await db.one<{ id: string }>(
    `insert into conversations (scope, balneario_id, contact_name, contact_phone, customer_id, status, last_message_at, is_demo)
     values ('balneario', $1, 'Lucía Fernández', '+54 9 2254 555-0100', $2, 'cerrada', $3, true) returning id`,
    [B1, c1[0], stamp(-2, 18)],
  );
  await db.exec(
    `insert into messages (conversation_id, direction, body, status, created_at, is_demo) values
     ($1, 'entrante', 'Gracias, ya hice la transferencia. (mensaje de demostración)', 'recibido', $2, true)`,
    [conv2!.id, stamp(-2, 18)],
  );
  const conv3 = await db.one<{ id: string }>(
    `insert into conversations (scope, contact_name, contact_phone, lead_id, status, unread_count, last_message_at, is_demo)
     values ('gavia', 'Ana Prueba', '+54 9 223 555-0200', $1, 'abierta', 1, $2, true) returning id`,
    [leadIds[0], stamp(-1, 11)],
  );
  await db.exec(
    `insert into messages (conversation_id, direction, body, status, created_at, is_demo) values
     ($1, 'entrante', '¿La propuesta incluye la configuración del plano? (mensaje de demostración)', 'recibido', $2, true)`,
    [conv3!.id, stamp(-1, 11)],
  );

  await db.exec(
    `insert into calendar_events (scope, balneario_id, title, description, starts_at, ends_at, created_by) values
     ('balneario', $1, 'Apertura de temporada', 'Primer día de temporada 2026/27.', '2026-12-01T08:00:00-03:00', '2026-12-01T20:00:00-03:00', $2),
     ('gavia', null, 'Capacitación de nuevos balnearios', 'Sesión de onboarding (demo).', $3, $4, $5)`,
    [B1, users.owner1, stamp(6, 15), stamp(6, 17), users.super],
  );

  // Gastos de demostración del dueño
  const cats: Record<string, string> = {};
  for (const name of ["Sueldos", "Materiales", "Construcción", "Servicios"]) {
    // "Sueldos" ya existe: la crea automáticamente la base al dar de alta el balneario.
    const c = await db.one<{ id: string }>(
      `insert into expense_categories (balneario_id, name) values ($1, $2) on conflict (balneario_id, name) do update set name = excluded.name returning id`,
      [B1, name],
    );
    cats[name] = c!.id;
  }
  const expenses: [string, number, number, string, string][] = [
    ["Sueldos", -20, 180000000, "Anticipo personal de pretemporada (demo)", "transferencia"],
    ["Materiales", -12, 42000000, "Lonas para carpas sector A (demo)", "transferencia"],
    ["Construcción", -8, 95000000, "Reparación de pasarela (demo)", "efectivo"],
    ["Servicios", -3, 8500000, "Luz y agua (demo)", "transferencia"],
    ["Materiales", -1, 12500000, "Pintura y herrajes (demo)", "efectivo"],
  ];
  // Empleados ficticios (datos bancarios inventados, sin CBU real).
  const emp = await db.one<{ id: string }>(
    `insert into employees (balneario_id, full_name, phone, bank, account_holder, alias) values ($1, 'Lucía Gómez (demo)', '+54 9 2254 555-0101', 'Banco ficticio (demo)', 'Lucía Gómez', 'lucia.demo.gavia') returning id`,
    [B1],
  );
  await db.exec(`insert into employees (balneario_id, full_name, phone, bank, alias) values ($1, 'Diego Ferreyra (demo)', '+54 9 2254 555-0102', 'Banco ficticio (demo)', 'diego.demo.gavia')`, [B1]);
  for (const [cat, day, amount, desc, method] of expenses) {
    await db.exec(
      `insert into expenses (balneario_id, category_id, spent_on, amount_cents, description, payment_method, created_by, employee_id) values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [B1, cats[cat], offset(day), amount, desc, method, users.owner1, cat === "Sueldos" ? emp!.id : null],
    );
  }
}
