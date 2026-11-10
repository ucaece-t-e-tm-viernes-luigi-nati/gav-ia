'use client'

import { useActionState, useEffect, useRef, type ReactNode } from 'react'
import { useFormStatus } from 'react-dom'

export type FormState = { ok?: boolean; error?: string; message?: string } | null
type Action = (state: FormState, formData: FormData) => Promise<FormState>

export const inputClass =
  'w-full rounded-xl border border-border bg-input/30 px-3.5 py-2.5 text-sm outline-none transition focus:border-primary disabled:opacity-60'
export const labelClass = 'flex flex-col gap-1.5 text-sm font-medium'

/**
 * Formulario que llama a una server action con useActionState y muestra error / éxito.
 * La action siempre valida permisos en el servidor: esto es solo la UI.
 */
export function ActionForm({
  action,
  children,
  submitLabel = 'Guardar',
  pendingLabel = 'Guardando…',
  className = 'flex flex-col gap-4',
  resetOnSuccess = false,
  submitClassName,
  confirm,
  disabled,
}: {
  action: Action
  children?: ReactNode
  submitLabel?: ReactNode
  pendingLabel?: string
  className?: string
  resetOnSuccess?: boolean
  submitClassName?: string
  confirm?: string
  disabled?: boolean
}) {
  const [state, formAction] = useActionState(action, null)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (state?.ok && resetOnSuccess) formRef.current?.reset()
  }, [state, resetOnSuccess])

  return (
    <form
      ref={formRef}
      action={formAction}
      className={className}
      onSubmit={(event) => {
        if (confirm && !window.confirm(confirm)) event.preventDefault()
      }}
    >
      {children}
      {state?.error && (
        <p role="alert" className="rounded-xl bg-destructive/12 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      )}
      {state?.ok && state.message && (
        <p role="status" className="rounded-xl bg-success/12 px-3 py-2 text-sm text-success">
          {state.message}
        </p>
      )}
      <SubmitButton label={submitLabel} pendingLabel={pendingLabel} className={submitClassName} disabled={disabled} />
    </form>
  )
}

export function SubmitButton({
  label,
  pendingLabel = 'Un momento…',
  className,
  disabled,
}: {
  label: ReactNode
  pendingLabel?: string
  className?: string
  disabled?: boolean
}) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className={
        className ??
        'inline-flex w-fit items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-95 disabled:opacity-60'
      }
    >
      {pending ? pendingLabel : label}
    </button>
  )
}
