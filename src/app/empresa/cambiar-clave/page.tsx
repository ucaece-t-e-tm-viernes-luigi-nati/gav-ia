import { PasswordInput } from '@/components/password-input'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ActionForm, inputClass, labelClass } from '@/components/forms'
import { BrandLink } from '@/components/brand/logo'
import { getCurrentUser } from '@/lib/auth'
import { formatDateTime } from '@/lib/dates'
import { getMemberships } from '@/lib/guards'
import { changeEmpresaPassword } from '../auth-actions'

export const metadata: Metadata = { title: 'Cambiar contraseña' }

export default async function ChangePasswordPage() {
  const user = await getCurrentUser()
  if (!user) notFound()
  const memberships = await getMemberships(user.id)
  if (!memberships.length) notFound()
  const expired = user.mustChangePassword && user.tempPasswordExpiresAt && user.tempPasswordExpiresAt < new Date()

  return (
    <main className="flex min-h-svh flex-col items-center justify-center px-5 py-16">
      <div className="w-full max-w-sm">
        <div className="flex justify-center">
          <BrandLink href="/empresa" suffix="balnearios" />
        </div>
        <div className="mt-6 rounded-2xl border border-border bg-card p-6">
          <h1 className="text-2xl font-semibold">{user.mustChangePassword ? 'Elegí tu contraseña' : 'Cambiar contraseña'}</h1>
          {user.mustChangePassword && (
            <p className="mt-1 text-sm text-muted-foreground">
              Estás usando una contraseña temporal. Para seguir, elegí una nueva.
              {user.tempPasswordExpiresAt && ` La temporal vence el ${formatDateTime(user.tempPasswordExpiresAt)}.`}
            </p>
          )}
          {expired ? (
            <p role="alert" className="mt-4 rounded-xl bg-destructive/12 px-3 py-2 text-sm text-destructive">
              Tu contraseña temporal venció. Respondé el mail de bienvenida y te enviamos una nueva.
            </p>
          ) : (
            <ActionForm action={changeEmpresaPassword} submitLabel="Guardar contraseña" className="mt-5 flex flex-col gap-4">
              {!user.mustChangePassword && (
                <label className={labelClass}>
                  Contraseña actual
                  <PasswordInput name="current" required autoComplete="current-password" className={inputClass} />
                </label>
              )}
              <label className={labelClass}>
                Nueva contraseña
                <PasswordInput name="password" required minLength={8} autoComplete="new-password" className={inputClass} />
              </label>
              <label className={labelClass}>
                Repetila
                <PasswordInput name="confirm" required minLength={8} autoComplete="new-password" className={inputClass} />
              </label>
            </ActionForm>
          )}
        </div>
        {!user.mustChangePassword && (
          <Link href="/empresa" className="mt-4 block text-center text-sm text-muted-foreground hover:text-foreground">
            ← Volver al panel
          </Link>
        )}
      </div>
    </main>
  )
}
