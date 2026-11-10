import type { Metadata } from "next";

// Superficie de los BALNEARIOS (clientes B2B). No se linkea desde la parte pública; no se indexa.
export const metadata: Metadata = {
  title: { default: "Panel del balneario", template: "%s · Panel del balneario | GavIA" },
  robots: { index: false, follow: false, nocache: true },
};

export default function EmpresaLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-svh bg-background text-foreground">{children}</div>;
}
