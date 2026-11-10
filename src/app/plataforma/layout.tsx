import type { Metadata } from 'next'

// Superficie del EQUIPO de GavIA (superadmin y admins). Sin links desde la parte pública; no se indexa.
export const metadata: Metadata = {
  title: { default: 'Plataforma', template: '%s · Plataforma | GavIA' },
  robots: { index: false, follow: false, nocache: true },
}

export default function PlataformaLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-svh bg-background text-foreground">{children}</div>
}
