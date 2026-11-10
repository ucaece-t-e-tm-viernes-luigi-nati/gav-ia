import { PasswordInput } from '@/components/password-input'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ActionForm, inputClass, labelClass } from '@/components/forms'
import { BrandLink as Brand } from '@/components/brand/logo'
import { completeSuperadminSetup } from '../../auth-actions'

export const metadata: Metadata = { title: 'Definir contraseña' }

export default async function SetupPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string | string[] }> }) {
  const { token } = await searchParams
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{20,80}$/.test(token)) notFound()

  return (
    <main className="flex min-h-svh flex-col items-center justify-center px-5 py-16">
      <div className="w-full max-w-sm">
        <div className="flex justify-center">
          <Brand href="/plataforma/ingresar" suffix="equipo" />
        </div>
        <div className="mt-6 rounded-2xl border border-border bg-card p-6">
          <h1 className="text-2xl font-semibold">Definí tu contraseña</h1>
          <p className="mt-1 text-sm text-muted-foreground">Mínimo 10 caracteres.</p>
          <ActionForm action={completeSuperadminSetup.bind(null, token)} submitLabel="Guardar e ingresar" className="mt-5 flex flex-col gap-4">
            <label className={labelClass}>
              Nueva contraseña
              <PasswordInput name="password" required minLength={10} autoComplete="new-password" className={inputClass} />
            </label>
            <label className={labelClass}>
              Repetila
              <PasswordInput name="confirm" required minLength={10} autoComplete="new-password" className={inputClass} />
            </label>
          </ActionForm>
        </div>
      </div>
    </main>
  )
}
