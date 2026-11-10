import type { ReactNode } from 'react'

// Piezas visuales de las pantallas de la skill (alta, logins y /plataforma), sobre los tokens de GavIA (globals.css).

export function PageTitle({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        {eyebrow && (
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-primary">
            <span className="size-1.5 rounded-full bg-primary" /> {eyebrow}
          </div>
        )}
        <h1 className="mt-2 text-2xl font-semibold md:text-3xl">{title}</h1>
        {description && <div className="mt-1 text-sm text-muted-foreground">{description}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function Card({ title, description, children, className = '' }: { title?: string; description?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-border bg-card p-5 sm:p-6 ${className}`}>
      {title && <h2 className="text-lg font-semibold">{title}</h2>}
      {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      <div className={title ? 'mt-4' : ''}>{children}</div>
    </section>
  )
}

export function Metric({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <article className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="mt-3 font-display text-[28px] font-semibold leading-none tabular-nums">{value}</div>
      {hint && <p className="mt-2 text-[11px] text-muted-foreground">{hint}</p>}
    </article>
  )
}

/** Tarjeta de métrica con variación (dashboard de la v2.1). delta null = sin base de comparación. */
export function StatCard({ label, value, delta, hint }: { label: string; value: string | number; delta?: number | null; hint?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 font-display text-3xl font-semibold tabular-nums">{value}</p>
      {typeof delta === 'number' ? (
        <p className={delta >= 0 ? 'mt-1 text-xs text-success' : 'mt-1 text-xs text-destructive'}>
          {delta >= 0 ? '+' : ''}
          {delta}% {hint}
        </p>
      ) : (
        hint && <p className="mt-1 text-xs text-muted-foreground">{delta === null ? `sin datos ${hint}` : hint}</p>
      )}
    </div>
  )
}

const GREEN = 'bg-success/15 text-success'
const BLUE = 'bg-info/15 text-info'
const YELLOW = 'bg-warning/15 text-warning'
const RED = 'bg-destructive/15 text-destructive'
const GREY = 'bg-muted text-muted-foreground'

const STATUS_STYLES: Record<string, string> = {
  trial: BLUE,
  active: GREEN,
  past_due: YELLOW,
  paused: RED,
  cancelled: GREY,
  open: GREEN,
  closed: GREY,
  draft: YELLOW,
  pending_review: BLUE,
  changes_requested: YELLOW,
  approved: GREEN,
  rejected: RED,
  sent: GREEN,
  outbox_only: GREY,
  failed: RED,
  queued: BLUE,
  paid: GREEN,
  pending: BLUE,
  overdue: RED,
  void: GREY,
}

export const STATUS_LABELS: Record<string, string> = {
  trial: 'En prueba',
  active: 'Activo',
  past_due: 'Pago vencido',
  paused: 'Pausado',
  cancelled: 'Dado de baja',
  open: 'Abierta',
  closed: 'Cerrada',
  draft: 'Borrador',
  pending_review: 'Pendiente de revisión',
  changes_requested: 'Con cambios pedidos',
  approved: 'Aprobada',
  rejected: 'Rechazada',
  sent: 'Enviado',
  outbox_only: 'Solo outbox',
  failed: 'Falló',
  queued: 'En cola',
  paid: 'Pagado',
  pending: 'Pendiente',
  overdue: 'Vencido',
  void: 'Anulado',
}

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return (
    <span className={`inline-flex w-fit rounded-full px-2.5 py-1 text-[11px] font-semibold ${STATUS_STYLES[status] ?? GREY}`}>
      {label ?? STATUS_LABELS[status] ?? status}
    </span>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">{children}</p>
}

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead>
          <tr className="border-b border-border text-[10px] font-bold uppercase tracking-[0.13em] text-muted-foreground">
            {head.map((h, i) => (
              <th key={`${h}-${i}`} scope="col" className="px-3 py-2.5 font-bold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">{children}</tbody>
      </table>
    </div>
  )
}

export function Td({ children, className = '' }: { children?: ReactNode; className?: string }) {
  return <td className={`px-3 py-3 align-top ${className}`}>{children}</td>
}

/** Encabezado común de los paneles internos. */
export function PanelHeader({ brand, right, nav }: { brand: ReactNode; right: ReactNode; nav: ReactNode }) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur-lg">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 lg:px-6">
        {brand}
        <div className="flex flex-wrap items-center gap-3 text-sm">{right}</div>
      </div>
      <div className="mx-auto max-w-7xl px-4 pb-3 lg:px-6">{nav}</div>
    </header>
  )
}
