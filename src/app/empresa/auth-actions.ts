'use server'

import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import type { FormState } from '@/components/forms'
import { audit } from '@/lib/audit'
import { auth, getCurrentUser } from '@/lib/auth'
import { verifyPassword } from 'better-auth/crypto'
import { pool, q1 } from '@/lib/db'
import { normalizeEmail, setUserPassword } from '@/lib/users'

const GENERIC = 'Correo o contraseña incorrectos.'

/** Login del panel del balneario: solo usuarios con membresía activa en algún balneario. Mensaje genérico ante cualquier fallo. */
export async function empresaSignIn(_: FormState, formData: FormData): Promise<FormState> {
  const email = normalizeEmail(formData.get('email'))
  const password = String(formData.get('password') ?? '')
  if (!email || !password) return { error: GENERIC }

  const user = await q1<{ id: string; mustChangePassword: boolean; expired: boolean }>(
    `SELECT u.id, u."mustChangePassword",
            (u."mustChangePassword" AND u."tempPasswordExpiresAt" IS NOT NULL AND u."tempPasswordExpiresAt" < now()) AS expired
       FROM "user" u
      WHERE lower(u.email) = $1 AND EXISTS (SELECT 1 FROM memberships m WHERE m.user_id::text = u.id AND m.active)`,
    [email],
  )
  if (!user) return { error: GENERIC }

  try {
    await auth.api.signInEmail({ body: { email, password }, headers: await headers() })
  } catch {
    return { error: GENERIC }
  }

  if (user.expired) {
    await auth.api.signOut({ headers: await headers() }).catch(() => null)
    return { error: 'Tu contraseña temporal venció (72 h). Respondé el mail de bienvenida y te enviamos una nueva.' }
  }
  redirect(user.mustChangePassword ? '/empresa/cambiar-clave' : '/empresa')
}

/** Cambio de contraseña (obligatorio en el primer ingreso con contraseña temporal). */
export async function changeEmpresaPassword(_: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser()
  if (!user) notFound()
  const member = await q1(`SELECT 1 FROM memberships WHERE user_id = $1::uuid AND active`, [user.id])
  if (!member) notFound()
  if (user.mustChangePassword && user.tempPasswordExpiresAt && user.tempPasswordExpiresAt < new Date()) {
    return { error: 'Tu contraseña temporal venció. Pedinos una nueva respondiendo el mail de bienvenida.' }
  }

  const password = String(formData.get('password') ?? '')
  const confirm = String(formData.get('confirm') ?? '')
  // Si no es el cambio obligatorio de la temporal, se pide la contraseña actual.
  if (!user.mustChangePassword) {
    const current = String(formData.get('current') ?? '')
    const account = await q1<{ password: string | null }>(`SELECT password FROM account WHERE "userId" = $1 AND "providerId" = 'credential'`, [user.id])
    const valid = !!account?.password && !!current && (await verifyPassword({ hash: account.password, password: current }).catch(() => false))
    if (!valid) return { error: 'La contraseña actual no es correcta.' }
  }
  if (password.length < 8) return { error: 'La contraseña tiene que tener al menos 8 caracteres.' }
  if (password !== confirm) return { error: 'Las contraseñas no coinciden.' }

  await setUserPassword(pool, user.id, password)
  await audit({ id: user.id, role: 'member' }, 'user.password_change', { entity: 'user', entityId: user.id })
  redirect('/empresa')
}
