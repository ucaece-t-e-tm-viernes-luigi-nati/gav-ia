'use client'

import { useState, type InputHTMLAttributes } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { inputClass } from '@/components/forms'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>

/** Campo de contraseña con botón ("ojito") para mostrar u ocultar lo tipeado. Se usa en TODOS los campos de clave. */
export function PasswordInput({ className, ...props }: Props) {
  const [visible, setVisible] = useState(false)
  return (
    <span className="relative block">
      <input {...props} type={visible ? 'text' : 'password'} className={`${className ?? inputClass} pr-11`} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        onMouseDown={(event) => event.preventDefault()}
        aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        aria-pressed={visible}
        title={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xl text-muted-foreground transition hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary"
      >
        {visible ? <EyeOff className="size-[18px]" aria-hidden /> : <Eye className="size-[18px]" aria-hidden />}
      </button>
    </span>
  )
}
