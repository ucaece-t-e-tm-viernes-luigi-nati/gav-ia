'use server'

import { randomUUID } from 'node:crypto'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import type { FormState } from '@/components/forms'
import { audit } from '@/lib/audit'
import { auth } from '@/lib/auth'
import { q, q1, tx } from '@/lib/db'
import { appUrl, isSuperadminEmail } from '@/lib/env'
import { mailProviderLabel, sendMail } from '@/lib/mail'
import { mails } from '@/lib/mail-templates'
import { createCredentialUser, findUserByEmail, normalizeEmail, randomToken, setUserPassword, sha256 } from '@/lib/users'

const GENERIC = 'Correo o contraseña incorrectos.'

/** Admin del equipo creado desde /plataforma/equipo (rol 'admin'). */
async function isTeamAdminEmail(email: string) {
  const user = await findUserByEmail(email)
  return !!user && user.role === 'admin'
}

/** Login de la plataforma: superadmin principal (SUPERADMIN_EMAILS) o admin del equipo, con cuenta verificada. */
export async function superadminSignIn(_: FormState, formData: FormData): Promise<FormState> {
  const email = normalizeEmail(formData.get('email'))
  const password = String(formData.get('password') ?? '')
  if (!password) return { error: GENERIC }
  const root = isSuperadminEmail(email)
  const user = await findUserByEmail(email)
  if (!user || !user.emailVerified) return { error: GENERIC }
  if (!root && user.role !== 'admin') return { error: GENERIC }
  try {
    await auth.api.signInEmail({ body: { email, password }, headers: await headers() })
  } catch {
    return { error: GENERIC }
  }
  // Bootstrap: si el email está en SUPERADMIN_EMAILS y la cuenta está verificada, tiene rol superadmin.
  if (root && user.role !== 'superadmin') {
    await q(`UPDATE "user" SET role = 'superadmin' WHERE id = $1`, [user.id])
    await audit({ id: user.id, role: 'superadmin' }, 'superadmin.bootstrap', { entity: 'user', entityId: user.id })
  }
  redirect('/plataforma')
}

/**
 * "Primer ingreso / olvidé mi contraseña": manda un link de un solo uso (30 min) SOLO si el email
 * está en SUPERADMIN_EMAILS. Siempre responde lo mismo, para no revelar qué emails están habilitados.
 */
export async function requestSuperadminSetup(_: FormState, formData: FormData): Promise<FormState> {
  const email = normalizeEmail(formData.get('email'))
  const answer = { ok: true, message: 'Si el correo está habilitado, te enviamos un link para definir tu contraseña. Revisá tu bandeja (y spam).' }
  if (!isSuperadminEmail(email) && !(await isTeamAdminEmail(email))) return answer

  const identifier = `superadmin-setup:${email}`
  const recent = await q1(`SELECT 1 FROM verification WHERE identifier = $1 AND "createdAt" > now() - interval '2 minutes'`, [identifier])
  if (recent) return answer

  const token = randomToken(24)
  await q(`DELETE FROM verification WHERE identifier = $1`, [identifier])
  await q(`INSERT INTO verification (id, identifier, value, "expiresAt") VALUES ($1, $2, $3, now() + interval '30 minutes')`, [randomUUID(), identifier, sha256(token)])
  const link = `${appUrl()}/plataforma/ingresar/clave?token=${token}`
  await sendMail({ to: email, ...mails.superadminSetup({ link }), secrets: [token] })
  if (mailProviderLabel() !== 'SMTP') {
    // Sin SMTP configurado no hay forma de que el link llegue: queda en los logs del servidor (solo visibles para el equipo).
    console.warn(`[plataforma] MAIL_PROVIDER sin SMTP. Link de primer ingreso para ${email}: ${link}`)
  }
  await audit(null, 'superadmin.setup_requested', { actorRole: 'anon', entity: 'user', detail: { email } })
  return answer
}

/** Define la contraseña con el link del mail (crea la cuenta superadmin si no existía) e inicia sesión. */
export async function completeSuperadminSetup(token: string, _: FormState, formData: FormData): Promise<FormState> {
  const password = String(formData.get('password') ?? '')
  const confirm = String(formData.get('confirm') ?? '')
  if (password.length < 10) return { error: 'Usá al menos 10 caracteres.' }
  if (password !== confirm) return { error: 'Las contraseñas no coinciden.' }

  const row = await q1<{ identifier: string }>(
    `SELECT identifier FROM verification WHERE identifier LIKE 'superadmin-setup:%' AND value = $1 AND "expiresAt" > now()`,
    [sha256(String(token ?? ''))],
  )
  const email = row?.identifier.slice('superadmin-setup:'.length) ?? ''
  const root = isSuperadminEmail(email)
  if (!row || (!root && !(await isTeamAdminEmail(email)))) return { error: 'El link venció o ya se usó. Pedí uno nuevo.' }

  const userId = await tx(async (db) => {
    await db.query(`DELETE FROM verification WHERE identifier = $1`, [row.identifier])
    const existing = await findUserByEmail(email, db)
    if (existing && !root) {
      // Admin del equipo: define su contraseña y queda verificado; el rol no cambia.
      await setUserPassword(db, existing.id, password)
      await db.query(`UPDATE "user" SET "emailVerified" = true WHERE id = $1`, [existing.id])
      return existing.id
    }
    if (existing) {
      await setUserPassword(db, existing.id, password)
      await db.query(`UPDATE "user" SET role = 'superadmin', "emailVerified" = true WHERE id = $1`, [existing.id])
      return existing.id
    }
    return createCredentialUser(db, { email, name: 'Equipo GavIA', password, role: 'superadmin', emailVerified: true })
  })
  await audit({ id: userId, role: root ? 'superadmin' : 'admin' }, 'superadmin.password_set', { entity: 'user', entityId: userId })

  try {
    await auth.api.signInEmail({ body: { email, password }, headers: await headers() })
  } catch {
    redirect('/plataforma/ingresar')
  }
  redirect('/plataforma')
}
