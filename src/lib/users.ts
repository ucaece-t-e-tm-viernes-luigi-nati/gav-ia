import 'server-only'
import { randomBytes, randomInt, randomUUID, createHash } from 'node:crypto'
import { hashPassword } from 'better-auth/crypto'
import type { PoolClient } from 'pg'
import { pool } from './db'

type Db = Pick<PoolClient, 'query'>

export const TEMP_PASSWORD_HOURS = 72

/** Contraseña temporal legible (sin caracteres ambiguos), 12 caracteres. */
export function generateTempPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  let out = ''
  for (let i = 0; i < 12; i++) out += alphabet[randomInt(alphabet.length)]
  return out
}

export function randomToken(bytes = 24) {
  return randomBytes(bytes).toString('base64url')
}

export function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

export function normalizeEmail(email: unknown) {
  return String(email ?? '').trim().toLowerCase()
}

export function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254
}

export async function findUserByEmail(email: string, db: Db = pool) {
  const { rows } = await db.query<{ id: string; name: string; email: string; role: string; emailVerified: boolean }>(
    `SELECT id, name, email, role, "emailVerified" FROM "user" WHERE lower(email) = $1`,
    [normalizeEmail(email)],
  )
  return rows[0] ?? null
}

/**
 * Crea un usuario con contraseña (cuenta "credential" de better-auth) directamente en la base.
 * Se usa para: aprobación de balnearios, staff sumado por el dueño y primer ingreso del equipo.
 * No inicia sesión (a diferencia de signUpEmail).
 */
export async function createCredentialUser(
  db: Db,
  opts: { email: string; name: string; password: string; role?: 'member' | 'admin' | 'superadmin'; temporary?: boolean; emailVerified?: boolean },
) {
  const id = randomUUID()
  const hash = await hashPassword(opts.password)
  await db.query(
    `INSERT INTO "user" (id, name, email, "emailVerified", role, "mustChangePassword", "tempPasswordExpiresAt")
     VALUES ($1, $2, $3, $4, $5, $6, CASE WHEN $6 THEN now() + make_interval(hours => $7::int) ELSE NULL END)`,
    [id, opts.name, normalizeEmail(opts.email), opts.emailVerified ?? false, opts.role ?? 'member', !!opts.temporary, TEMP_PASSWORD_HOURS],
  )
  await db.query(
    `INSERT INTO account (id, "accountId", "providerId", "userId", password) VALUES ($1, $2, 'credential', $2, $3)`,
    [randomUUID(), id, hash],
  )
  return id
}

/** Cambia la contraseña de un usuario (crea la cuenta credential si no existía). */
export async function setUserPassword(db: Db, userId: string, password: string, opts: { temporary?: boolean } = {}) {
  const hash = await hashPassword(password)
  const updated = await db.query(`UPDATE account SET password = $2, "updatedAt" = now() WHERE "userId" = $1 AND "providerId" = 'credential'`, [userId, hash])
  if (!updated.rowCount) {
    await db.query(`INSERT INTO account (id, "accountId", "providerId", "userId", password) VALUES ($1, $2, 'credential', $2, $3)`, [randomUUID(), userId, hash])
  }
  await db.query(
    `UPDATE "user" SET "mustChangePassword" = $2,
            "tempPasswordExpiresAt" = CASE WHEN $2 THEN now() + make_interval(hours => $3::int) ELSE NULL END,
            "updatedAt" = now()
      WHERE id = $1`,
    [userId, !!opts.temporary, TEMP_PASSWORD_HOURS],
  )
}
