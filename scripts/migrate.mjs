// Crea/actualiza el esquema de GavIA en Neon. Corre antes de cada build (ver "build" en package.json).
// Es idempotente: se puede correr muchas veces sin romper ni duplicar nada.
//   - Sin DATABASE_URL: se saltea (build local sin base).
//   - db/auth_compat.sql: emulación de auth.uid() / auth.users / rol authenticated (corre siempre).
//   - db/migrations/*.sql: migraciones de la v2.1 + la de la v2.2. Cada una corre UNA vez
//     (quedan registradas en gavia_meta.migrations).
//   - Tablas de better-auth: CREATE TABLE IF NOT EXISTS.
//   - SUPERADMIN_EMAILS: sincroniza el rol 'superadmin' (solo cuentas ya verificadas).
//   - SEED_DEMO=true: balneario demo aprobado con plano, reservas, clientes, cobros, gastos, CRM y una
//     solicitud de alta pendiente. SEED_DEMO_PASSWORD (8+): crea balneario.demo@example.com (dueño)
//     y staff.demo@example.com (staff) con esa contraseña.
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

if (!process.env.DATABASE_URL) {
  console.log('[migrate] Sin DATABASE_URL: se saltea la migración.')
  process.exit(0)
}

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel) => readFileSync(path.join(root, rel), 'utf8')
const V22 = '20261110000007_v22_neon.sql'

const betterAuth = [
  `CREATE TABLE IF NOT EXISTS "user" (
    "id" text PRIMARY KEY,
    "name" text NOT NULL,
    "email" text NOT NULL UNIQUE,
    "emailVerified" boolean NOT NULL DEFAULT false,
    "image" text,
    "createdAt" timestamp NOT NULL DEFAULT now(),
    "updatedAt" timestamp NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS "session" (
    "id" text PRIMARY KEY,
    "expiresAt" timestamp NOT NULL,
    "token" text NOT NULL UNIQUE,
    "createdAt" timestamp NOT NULL DEFAULT now(),
    "updatedAt" timestamp NOT NULL DEFAULT now(),
    "ipAddress" text,
    "userAgent" text,
    "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "account" (
    "id" text PRIMARY KEY,
    "accountId" text NOT NULL,
    "providerId" text NOT NULL,
    "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
    "accessToken" text,
    "refreshToken" text,
    "idToken" text,
    "accessTokenExpiresAt" timestamp,
    "refreshTokenExpiresAt" timestamp,
    "scope" text,
    "password" text,
    "createdAt" timestamp NOT NULL DEFAULT now(),
    "updatedAt" timestamp NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS "verification" (
    "id" text PRIMARY KEY,
    "identifier" text NOT NULL,
    "value" text NOT NULL,
    "expiresAt" timestamp NOT NULL,
    "createdAt" timestamp DEFAULT now(),
    "updatedAt" timestamp DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS session_user_idx ON "session"("userId")`,
  `CREATE INDEX IF NOT EXISTS account_user_idx ON "account"("userId")`,
  `CREATE INDEX IF NOT EXISTS verification_identifier_idx ON "verification"("identifier")`,
  // Roles (skill): superadmin | admin (equipo) | member.
  `ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "role" text NOT NULL DEFAULT 'member'`,
  `ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "mustChangePassword" boolean NOT NULL DEFAULT false`,
  `ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "tempPasswordExpiresAt" timestamp`,
]

// Tablas que solo usa el servidor (pool dueño): el rol `authenticated` de las RLS no las ve.
const SERVER_ONLY = ['"user"', 'session', 'account', 'verification', 'client_invite', 'client_application', 'client_payment', 'email_outbox']

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 })

async function applyOnce(client, file) {
  const done = await client.query(`SELECT 1 FROM gavia_meta.migrations WHERE name = $1`, [file])
  if (done.rowCount) return false
  await client.query('BEGIN')
  try {
    await client.query(read(`db/migrations/${file}`))
    await client.query(`INSERT INTO gavia_meta.migrations (name) VALUES ($1)`, [file])
    await client.query('COMMIT')
    return true
  } catch (error) {
    await client.query('ROLLBACK')
    throw new Error(`[migrate] Falló ${file}: ${error.message}`)
  }
}

try {
  const client = await pool.connect()
  let applied = 0
  try {
    await client.query(read('db/auth_compat.sql'))
    await client.query(`CREATE SCHEMA IF NOT EXISTS gavia_meta`)
    await client.query(`CREATE TABLE IF NOT EXISTS gavia_meta.migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`)

    const files = readdirSync(path.join(root, 'db/migrations')).filter((f) => f.endsWith('.sql')).sort()
    for (const file of files.filter((f) => f < V22)) if (await applyOnce(client, file)) applied++
    for (const sql of betterAuth) await client.query(sql)
    for (const file of files.filter((f) => f >= V22)) if (await applyOnce(client, file)) applied++

    for (const table of SERVER_ONLY) await client.query(`REVOKE ALL ON ${table} FROM authenticated, anon`)
  } finally {
    client.release()
  }

  // Superadmin principal: solo cuentas ya verificadas (creadas por el "primer ingreso" de la plataforma)
  // cuyo email está en SUPERADMIN_EMAILS. Nadie más puede tener el rol 'superadmin'.
  const superadmins = (process.env.SUPERADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
  if (superadmins.length) {
    await pool.query(`UPDATE "user" SET role = 'superadmin' WHERE lower(email) = ANY($1) AND "emailVerified" = true AND role <> 'superadmin'`, [superadmins])
  }
  await pool.query(`UPDATE "user" SET role = 'member' WHERE role = 'superadmin' AND NOT (lower(email) = ANY($1))`, [superadmins])

  if (process.env.SEED_DEMO === 'true') {
    const { seedDemo } = await import('./seed-demo.mjs')
    const result = await seedDemo(pool, process.env.SEED_DEMO_PASSWORD)
    console.log(`[migrate] Datos de demo (SEED_DEMO=true): ${result}.`)
  }

  console.log(`[migrate] OK (${applied} migraciones nuevas aplicadas).`)
} finally {
  await pool.end()
}
