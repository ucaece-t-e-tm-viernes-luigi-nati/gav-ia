// Datos de demostración de GavIA (SEED_DEMO=true). Idempotente: cada bloque se carga una sola vez.
// Todo es ficticio y queda marcado con is_demo = true. Nunca se hardcodea una contraseña:
// los usuarios demo solo se crean si llega SEED_DEMO_PASSWORD (8+ caracteres).
import { randomUUID } from 'node:crypto'

const TZ = 'America/Argentina/Buenos_Aires'
const DEMO_SLUG = 'mareas-demo'
const DEMO_USERS = [
  { key: 'owner', email: 'balneario.demo@example.com', name: 'Martina Ríos (demo)', role: 'owner' },
  { key: 'staff', email: 'staff.demo@example.com', name: 'Tomás Acosta (demo)', role: 'staff' },
]

// ---------- fechas ----------
const pad = (n) => String(n).padStart(2, '0')
function todayAR() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}
function addDays(key, days) {
  const [y, m, d] = key.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d + days))
  return date.toISOString().slice(0, 10)
}
const today = todayAR()
const offset = (days) => addDays(today, days)
const stamp = (days, hour = 10) => `${offset(days)}T${pad(hour)}:00:00-03:00`
// Temporada vigente o próxima: 15/11 al 30/04 (de mayo en adelante se toma la del verano siguiente).
const [ty, tm] = today.split('-').map(Number)
const Y0 = tm >= 5 ? ty : ty - 1
const Y1 = Y0 + 1
const season = (md, nextYear = true) => `${nextYear ? Y1 : Y0}-${md}`

// ---------- plano (misma lógica que src/server/db/layouts.ts) ----------
const SIZE = { carpa: [2, 2], sombrilla: [2, 2], cochera: [2, 4] }
const MAP_OF = { carpa: 'playa', sombrilla: 'playa', cochera: 'cocheras' }
const KIND_LABEL = { carpa: 'Carpa', sombrilla: 'Sombrilla', cochera: 'Cochera' }
const LAYOUT = {
  maps: [{ map: 'playa', width: 48, height: 32 }, { map: 'cocheras', width: 34, height: 16 }],
  sectors: [
    { map: 'playa', name: 'Segunda línea', x: 1, y: 3, w: 46, h: 5, rows: [{ label: 'C', kind: 'carpa', count: 10, x: 4, y: 4, step: 4 }] },
    { map: 'playa', name: 'Primera línea', x: 1, y: 10, w: 46, h: 10, rows: [{ label: 'B', kind: 'carpa', count: 10, x: 4, y: 11, step: 4 }, { label: 'A', kind: 'carpa', count: 10, x: 4, y: 16, step: 4 }] },
    { map: 'playa', name: 'Sombrillas', x: 1, y: 21, w: 46, h: 6, rows: [{ label: 'D', kind: 'sombrilla', count: 8, x: 5, y: 22, step: 5 }, { label: 'E', kind: 'sombrilla', count: 8, x: 5, y: 25, step: 5 }] },
    { map: 'cocheras', name: 'Playón norte', x: 1, y: 0, w: 32, h: 6, rows: [{ label: '1', kind: 'cochera', count: 6, x: 3, y: 1, step: 5 }] },
    { map: 'cocheras', name: 'Playón sur', x: 1, y: 10, w: 32, h: 6, rows: [{ label: '2', kind: 'cochera', count: 6, x: 3, y: 11, step: 5 }] },
  ],
  elements: [
    { map: 'playa', kind: 'acceso', label: 'Ingreso · Paseo costero', x: 0, y: 0, w: 48, h: 2 },
    { map: 'playa', kind: 'pasillo', label: 'Pasillo central', x: 0, y: 8, w: 48, h: 2 },
    { map: 'playa', kind: 'edificio', label: 'Parador', x: 0, y: 3, w: 1, h: 5 },
    { map: 'playa', kind: 'mar', label: 'Mar', x: 0, y: 28, w: 48, h: 4 },
    { map: 'cocheras', kind: 'pasillo', label: 'Calle interna', x: 0, y: 7, w: 34, h: 2 },
    { map: 'cocheras', kind: 'acceso', label: 'Entrada', x: 0, y: 6, w: 1, h: 4 },
  ],
}

async function createLayout(db, balnearioId, layout) {
  const units = {}
  const counters = { carpa: 0, sombrilla: 0, cochera: 0 }
  for (const m of layout.maps) {
    await db.query(`insert into site_maps (balneario_id, map, width, height) values ($1, $2, $3, $4)`, [balnearioId, m.map, m.width, m.height])
  }
  for (const e of layout.elements) {
    await db.query(`insert into map_elements (balneario_id, map, kind, label, x, y, w, h) values ($1, $2, $3, $4, $5, $6, $7, $8)`, [balnearioId, e.map, e.kind, e.label, e.x, e.y, e.w, e.h])
  }
  for (const [i, s] of layout.sectors.entries()) {
    const sector = await db.query(
      `insert into sectors (balneario_id, map, name, x, y, w, h, sort_order) values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
      [balnearioId, s.map, s.name, s.x, s.y, s.w, s.h, i],
    )
    for (const row of s.rows) {
      const [w, h] = SIZE[row.kind]
      for (let p = 0; p < row.count; p++) {
        const code = `${KIND_LABEL[row.kind]} ${pad(++counters[row.kind])}`
        const u = await db.query(
          `insert into units (balneario_id, sector_id, kind, map, code, row_label, x, y, w, h)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning id`,
          [balnearioId, sector.rows[0].id, row.kind, MAP_OF[row.kind], code, row.label ?? '', row.x + p * row.step, row.y, w, h],
        )
        units[code] = u.rows[0].id
      }
    }
  }
  return units
}

const CUSTOMERS = [
  ['Lucía', 'Fernández'], ['Diego', 'Sosa'], ['Valentina', 'Giménez'], ['Matías', 'Romero'],
  ['Florencia', 'Benítez'], ['Nicolás', 'Herrera'], ['Camila', 'Domínguez'], ['Santiago', 'Ruiz'],
  ['Agustina', 'Molina'], ['Federico', 'Castro'], ['Paula', 'Ortiz'], ['Gonzalo', 'Vera'],
]

// [cliente, unidades, desde, hasta, total ARS, estado, notas, pagos [monto, medio, días atrás]]
const RESERVATIONS = [
  [0, ['Carpa 01', 'Cochera 02'], offset(-3), offset(4), 420000, 'confirmada', 'Fin de semana extendido.', [[420000, 'transferencia', 10]]],
  [1, ['Carpa 02'], offset(1), offset(10), 380000, 'pendiente', '', [[100000, 'efectivo', 2]]],
  [2, ['Carpa 05'], offset(0), offset(2), 150000, 'confirmada', '', []],
  [3, ['Sombrilla 03'], offset(-1), offset(1), 60000, 'confirmada', '', [[60000, 'efectivo', 1]]],
  [4, ['Carpa 01'], season('01-01'), season('01-31'), 2600000, 'confirmada', 'Quincena doble, enero completo.', [[1300000, 'transferencia', 20]]],
  [5, ['Carpa 03', 'Cochera 01'], season('12-01', false), season('03-31'), 7800000, 'confirmada', 'Temporada completa.', [[3900000, 'transferencia', 25], [1500000, 'tarjeta', 4]]],
  [6, ['Carpa 07'], season('02-01'), season('02-28'), 2300000, 'pendiente', '', []],
  [7, ['Sombrilla 01'], season('01-01'), season('01-15'), 480000, 'pendiente', '', [[150000, 'efectivo', 6]]],
  [8, ['Carpa 12'], season('01-15'), season('02-15'), 2700000, 'confirmada', '', [[2700000, 'transferencia', 15]]],
  [9, ['Carpa 04'], season('01-05'), season('01-20'), 1300000, 'cancelada', '', []],
  [10, ['Carpa 21', 'Cochera 05'], season('02-01'), season('02-14'), 1450000, 'confirmada', '', [[500000, 'efectivo', 3]]],
  [11, ['Sombrilla 09'], offset(2), offset(5), 90000, 'pendiente', '', []],
]

async function ensureUsers(pool, password) {
  const ids = {}
  if (!password || password.length < 8) return ids
  const { hashPassword } = await import('better-auth/crypto')
  const hash = await hashPassword(password)
  for (const u of DEMO_USERS) {
    let id = (await pool.query(`SELECT id FROM "user" WHERE lower(email) = $1`, [u.email])).rows[0]?.id
    if (!id) {
      id = randomUUID()
      await pool.query(`INSERT INTO "user" (id, name, email, "emailVerified", role) VALUES ($1, $2, $3, true, 'member')`, [id, u.name, u.email])
      await pool.query(`INSERT INTO account (id, "accountId", "providerId", "userId", password) VALUES ($1, $2, 'credential', $2, $3)`, [randomUUID(), id, hash])
    }
    await pool.query(`UPDATE profiles SET is_demo = true WHERE id = $1 AND NOT is_demo`, [id])
    ids[u.key] = id
  }
  return ids
}

async function createBalneario(db, users) {
  const plan = (await db.query(`SELECT id, price_cents, currency FROM plans WHERE code = 'plus'`)).rows[0]
  const firstOfNext = addDays(`${today.slice(0, 7)}-01`, 40).slice(0, 7)
  const b = await db.query(
    `insert into balnearios (name, slug, city, address, phone, email, status, season_start, season_end, is_demo,
                             plan_id, monthly_price_cents, currency, billing_day, next_due_date, legal_name, tax_id, data)
     values ('Balneario Mareas [DEMO]', $1, 'Pinamar (ficticio)', 'Av. Costanera 1000 (ficticia)', '+54 9 2254 555-0001',
             'contacto@mareas-demo.test', 'active', $2, $3, true, $4, $5, $6, 10, $7, 'Mareas Playa SRL (demo)', '30711111119', $8)
     returning id`,
    [DEMO_SLUG, season('11-15', false), season('04-30'), plan.id, plan.price_cents, plan.currency, `${firstOfNext}-10`,
     JSON.stringify({ carpas: 30, sombrillas: 16, cocheras: 12, temporada_inicio: season('11-15', false), temporada_fin: season('04-30'),
                      ubicacion: 'Pinamar, frente al mar (ficticio)', servicios: ['Parador / bar', 'Duchas y vestuarios', 'Guardavidas', 'Estacionamiento'] })],
  )
  const B = b.rows[0].id
  const creator = users.owner ?? null
  const units = await createLayout(db, B, LAYOUT)
  await db.query(`update units set out_of_service = true, out_of_service_reason = 'Reparación de lona' where id = $1`, [units['Carpa 10']])
  await db.query(`update units set out_of_service = true, out_of_service_reason = 'Base dañada' where id = $1`, [units['Sombrilla 08']])

  const customers = []
  for (const [i, [first, last]] of CUSTOMERS.entries()) {
    const phone = `+54 9 2254 555-${String(100 + i).padStart(4, '0')}`
    const c = await db.query(
      `insert into customers (balneario_id, first_name, last_name, phone, whatsapp, email, document_id, notes, is_demo)
       values ($1, $2, $3, $4, $4, $5, $6, $7, true) returning id`,
      [B, first, last, phone, `${first.toLowerCase()}.${i}@ejemplo.test`, `DEMO-${30000000 + i * 7}`, i % 3 === 0 ? 'Cliente de temporadas anteriores (dato ficticio).' : ''],
    )
    customers.push(c.rows[0].id)
  }

  const reservations = []
  for (const [cust, codes, start, end, total, status, notes, payments] of RESERVATIONS) {
    const r = await db.query(
      `insert into reservations (balneario_id, customer_id, start_date, end_date, total_cents, status, notes, created_by, is_demo,
                                 cancelled_at, cancelled_by, cancel_reason)
       values ($1, $2, $3, $4, $5, $6, $7, $8, true,
               case when $6 = 'cancelada' then now() end, case when $6 = 'cancelada' then $8::uuid end,
               case when $6 = 'cancelada' then 'El cliente cambió de planes (demo)' end)
       returning id`,
      [B, customers[cust], start, end, total * 100, status, notes, creator],
    )
    const rid = r.rows[0].id
    for (const code of codes) {
      await db.query(`insert into reservation_units (reservation_id, unit_id, balneario_id, period) values ($1, $2, $3, '[2000-01-01,2000-01-02]')`, [rid, units[code], B])
    }
    for (const [amount, method, daysAgo] of payments) {
      await db.query(
        `insert into payments (balneario_id, reservation_id, amount_cents, method, paid_at, created_by, is_demo, notes)
         values ($1, $2, $3, $4, $5, $6, true, 'Pago de demostración')`,
        [B, rid, amount * 100, method, stamp(-daysAgo), creator],
      )
    }
    reservations.push(rid)
  }

  // Recordatorios y tareas del balneario.
  const assignee = users.staff ?? null
  const reminders = [
    ['reserva', 'Confirmar reserva de Carpa 02', 'Llamar para confirmar la seña y la fecha de ingreso.', 0, 11, customers[1], reservations[1]],
    ['cliente', 'Enviar datos de transferencia', 'El cliente pidió el CBU para completar el saldo.', -1, 9, customers[4], reservations[4]],
    ['tarea', 'Revisar lonas del sector A', 'Controlar estado antes del fin de semana.', 2, 8, null, null],
    ['tarea', 'Reparar Carpa 10', 'Coordinar con proveedor de lonas.', 5, 10, null, null],
    ['reserva', 'Cobrar saldo de temporada', 'Saldo pendiente de la reserva de temporada completa.', 7, 12, customers[5], reservations[5]],
  ]
  for (const [kind, title, desc, day, hour, cust, res] of reminders) {
    await db.query(
      `insert into reminders (scope, balneario_id, kind, title, description, due_at, assigned_to, customer_id, reservation_id, created_by, is_demo)
       values ('balneario', $1, $2, $3, $4, $5, $6, $7, $8, $9, true)`,
      [B, kind, title, desc, stamp(day, hour), assignee, cust, res, creator],
    )
  }
  await db.query(
    `insert into interactions (scope, balneario_id, customer_id, kind, summary, occurred_at, created_by) values
     ('balneario', $1, $2, 'llamada', 'Consultó por renovar la carpa para la próxima temporada (demo).', $3, $4)`,
    [B, customers[5], stamp(-12), assignee],
  )

  // Conversaciones de WhatsApp de demostración.
  const conv = await db.query(
    `insert into conversations (scope, balneario_id, contact_name, contact_phone, customer_id, reservation_id, status, unread_count, last_message_at, is_demo)
     values ('balneario', $1, 'Diego Sosa', '+54 9 2254 555-0101', $2, $3, 'pendiente', 1, $4, true) returning id`,
    [B, customers[1], reservations[1], stamp(0, 9)],
  )
  await db.query(
    `insert into messages (conversation_id, direction, body, status, created_at, is_demo) values
     ($1, 'entrante', 'Hola, ¿puedo pagar el resto de la carpa cuando llegue? (mensaje de demostración)', 'recibido', $2, true)`,
    [conv.rows[0].id, stamp(0, 9)],
  )
  const conv2 = await db.query(
    `insert into conversations (scope, balneario_id, contact_name, contact_phone, customer_id, status, last_message_at, is_demo)
     values ('balneario', $1, 'Lucía Fernández', '+54 9 2254 555-0100', $2, 'cerrada', $3, true) returning id`,
    [B, customers[0], stamp(-2, 18)],
  )
  await db.query(
    `insert into messages (conversation_id, direction, body, status, created_at, is_demo) values
     ($1, 'entrante', 'Gracias, ya hice la transferencia. (mensaje de demostración)', 'recibido', $2, true)`,
    [conv2.rows[0].id, stamp(-2, 18)],
  )
  await db.query(
    `insert into calendar_events (scope, balneario_id, title, description, starts_at, ends_at, created_by) values
     ('balneario', $1, 'Apertura de temporada', 'Primer día de la temporada (demo).', $2, $3, $4)`,
    [B, `${season('12-01', false)}T08:00:00-03:00`, `${season('12-01', false)}T20:00:00-03:00`, creator],
  )

  // Gastos de la temporada (la categoría "Sueldos" la crea la base al dar de alta el balneario).
  const cats = {}
  for (const name of ['Sueldos', 'Materiales', 'Construcción', 'Servicios']) {
    const c = await db.query(
      `insert into expense_categories (balneario_id, name) values ($1, $2) on conflict (balneario_id, name) do update set name = excluded.name returning id`,
      [B, name],
    )
    cats[name] = c.rows[0].id
  }
  const emp = await db.query(
    `insert into employees (balneario_id, full_name, phone, bank, account_holder, alias)
     values ($1, 'Lucía Gómez (demo)', '+54 9 2254 555-0101', 'Banco ficticio (demo)', 'Lucía Gómez', 'lucia.demo.gavia') returning id`,
    [B],
  )
  await db.query(`insert into employees (balneario_id, full_name, phone, bank, alias) values ($1, 'Diego Ferreyra (demo)', '+54 9 2254 555-0102', 'Banco ficticio (demo)', 'diego.demo.gavia')`, [B])
  const expenses = [
    ['Sueldos', -20, 180000000, 'Anticipo personal de pretemporada (demo)', 'transferencia'],
    ['Materiales', -12, 42000000, 'Lonas para carpas sector A (demo)', 'transferencia'],
    ['Construcción', -8, 95000000, 'Reparación de pasarela (demo)', 'efectivo'],
    ['Servicios', -3, 8500000, 'Luz y agua (demo)', 'transferencia'],
    ['Materiales', -1, 12500000, 'Pintura y herrajes (demo)', 'efectivo'],
  ]
  for (const [cat, day, amount, desc, method] of expenses) {
    await db.query(
      `insert into expenses (balneario_id, category_id, spent_on, amount_cents, description, payment_method, created_by, employee_id)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [B, cats[cat], offset(day), amount, desc, method, creator, cat === 'Sueldos' ? emp.rows[0].id : null],
    )
  }

  // Abono a GavIA: el mes pasado ya pagado.
  const prev = addDays(`${today.slice(0, 7)}-01`, -1).slice(0, 7)
  await db.query(
    `insert into client_payment (client_id, period, amount_cents, currency, status, method, due_date, paid_at, notes)
     values ($1, $2, $3, $4, 'paid', 'transferencia', $5, $6, 'Pago de demostración') on conflict do nothing`,
    [B, prev, plan.price_cents, plan.currency, `${prev}-10`, `${prev}-08T12:00:00-03:00`],
  )
  return B
}

async function seedPlatform(db) {
  // CRM comercial de GavIA y demos agendadas desde la landing.
  const leads = [
    ['Balneario Ficticio Norte', 'Ana Prueba', 'propuesta', 'Feria de turismo (demo)'],
    ['Parador Ejemplo Sur', 'Luis Ejemplo', 'demo', 'Recomendación (demo)'],
    ['Complejo Playa Ficticia', 'Marta Muestra', 'contactado', 'Web (demo)'],
    ['Balneario Prueba Centro', 'Raúl Test', 'prospecto', 'Llamado en frío (demo)'],
    ['Parador Inventado', 'Elena Demo', 'perdido', 'Web (demo)'],
  ]
  const ids = []
  for (const [i, [biz, contact, stage, source]] of leads.entries()) {
    const l = await db.query(
      `insert into leads (business_name, contact_name, phone, email, city, stage, source, is_demo)
       values ($1, $2, $3, $4, 'Costa Atlántica (ficticio)', $5, $6, true) returning id`,
      [biz, contact, `+54 9 223 555-${String(200 + i).padStart(4, '0')}`, `contacto${i}@lead-demo.test`, stage, source],
    )
    ids.push(l.rows[0].id)
  }
  await db.query(
    `insert into interactions (scope, lead_id, kind, summary, occurred_at) values
     ('gavia', $1, 'reunion', 'Reunión inicial: interesados en reservas por temporada (demo).', $3),
     ('gavia', $2, 'llamada', 'Se coordinó una demostración del producto (demo).', $4)`,
    [ids[0], ids[1], stamp(-9), stamp(-4)],
  )
  // Demos agendadas: próximos días hábiles a las 10:00 y 11:30 (hora argentina).
  let added = 0
  for (let d = 2; added < 2 && d < 14; d++) {
    const day = offset(d)
    const dow = new Date(`${day}T12:00:00Z`).getUTCDay()
    if (dow === 0 || dow === 6) continue
    const [lead, hour] = added === 0 ? [ids[1], '10:00'] : [ids[3], '11:30']
    const name = added === 0 ? 'Luis Ejemplo' : 'Raúl Test'
    const biz = added === 0 ? 'Parador Ejemplo Sur' : 'Balneario Prueba Centro'
    await db.query(
      `insert into demo_bookings (starts_at, name, business_name, email, phone, city, notes, lead_id)
       values ($1, $2, $3, $4, '+54 9 223 555-0300', 'Costa Atlántica (ficticio)', 'Agendada desde la landing (demo).', $5)
       on conflict do nothing`,
      [`${day}T${hour}:00-03:00`, name, biz, `${name.split(' ')[0].toLowerCase()}@lead-demo.test`, lead],
    )
    added++
  }

  // Link de campaña y una solicitud de alta pendiente de revisión (para mostrar el circuito).
  const token = 'demo-campania-temporada-gavia'
  await db.query(
    `insert into client_invite (token, kind, label, max_uses, uses, expires_at) values ($1, 'campaign', 'Campaña demo temporada', 50, 1, now() + interval '60 days')
     on conflict (token) do nothing`,
    [token],
  )
  const plan = (await db.query(`SELECT id FROM plans WHERE code = 'pro'`)).rows[0]
  await db.query(
    `insert into client_application (invite_token, resume_key, email, contact_name, phone, email_verified_at, step, data, requested_plan_id,
                                     terms_accepted_at, status, submitted_at)
     values ($1, 'demo-clave-retomar-medanos-0001', 'medanos.demo@example.com', 'Julián Paz (demo)', '+54 9 2255 555-0002', now(), 5, $2, $3,
             now(), 'pending_review', now() - interval '1 day')`,
    [token, JSON.stringify({
      name: 'Parador Los Médanos [DEMO]', legal_name: 'Los Médanos SA (demo)', tax_id: '30722222229', address: 'Paseo 140 y playa (ficticio)',
      city: 'Villa Gesell', website: '', instagram: '@medanos.demo', carpas: 16, sombrillas: 10, cocheras: 8,
      temporada_inicio: season('12-15', false), temporada_fin: season('03-15'), ubicacion: 'Villa Gesell, zona norte', servicios: ['Parador / bar', 'Guardavidas'],
      billing_day: 10,
    }), plan.id],
  )
}

export async function seedDemo(pool, password) {
  const users = await ensureUsers(pool, password)
  const done = []
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    let B = (await client.query(`SELECT id FROM balnearios WHERE slug = $1`, [DEMO_SLUG])).rows[0]?.id
    if (!B) {
      B = await createBalneario(client, users)
      done.push('balneario demo')
    }
    for (const u of DEMO_USERS) {
      if (!users[u.key]) continue
      const r = await client.query(
        `insert into memberships (user_id, balneario_id, role) values ($1, $2, $3) on conflict (user_id, balneario_id) do nothing returning id`,
        [users[u.key], B, u.role],
      )
      if (r.rowCount) done.push(`membresía ${u.role}`)
    }
    const hasLeads = (await client.query(`SELECT 1 FROM leads WHERE is_demo LIMIT 1`)).rowCount
    if (!hasLeads) {
      await seedPlatform(client)
      done.push('CRM, demos agendadas y solicitud pendiente')
    }
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
  if (Object.keys(users).length) done.push('usuarios demo listos')
  return done.length ? done.join(', ') : 'sin cambios'
}
