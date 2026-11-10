import { PasswordInput } from '@/components/password-input'
import type { Metadata } from 'next'
import { ActionForm, inputClass, labelClass } from '@/components/forms'
import { BrandLink as Brand } from '@/components/brand/logo'
import { requestSuperadminSetup, superadminSignIn } from '../auth-actions'

export const metadata: Metadata = { title: 'Ingresar' }

// Login del equipo de GavIA. No hay registro público de superadmins:
// el primer ingreso se hace con un link de un solo uso enviado al email habilitado.
export default function PlatformLoginPage() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center px-5 py-16">
      <div className="w-full max-w-sm">
        <div className="flex justify-center">
          <Brand href="/plataforma/ingresar" suffix="equipo" />
        </div>
        <div className="mt-6 rounded-2xl border border-border bg-card p-6">
          <h1 className="text-2xl font-semibold">Plataforma</h1>
          <ActionForm action={superadminSignIn} submitLabel="Ingresar" pendingLabel="Ingresando…" className="mt-5 flex flex-col gap-4" submitClassName="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60">
            <label className={labelClass}>
              Correo electrónico
              <input name="email" type="email" required autoComplete="email" className={inputClass} />
            </label>
            <label className={labelClass}>
              Contraseña
              <PasswordInput name="password" required autoComplete="current-password" className={inputClass} />
            </label>
          </ActionForm>
        </div>
        <details className="mt-4 rounded-2xl border border-border bg-card p-5 text-sm">
          <summary className="cursor-pointer font-semibold">Primer ingreso u olvidé mi contraseña</summary>
          <p className="mt-2 text-xs text-muted-foreground">Te mandamos un link de un solo uso (vence en 30 minutos) para definir tu contraseña.</p>
          <ActionForm action={requestSuperadminSetup} submitLabel="Enviarme el link" pendingLabel="Enviando…" className="mt-3 flex flex-col gap-3">
            <label className={labelClass}>
              Correo electrónico
              <input name="email" type="email" required autoComplete="email" className={inputClass} />
            </label>
          </ActionForm>
        </details>
      </div>
    </main>
  )
}
