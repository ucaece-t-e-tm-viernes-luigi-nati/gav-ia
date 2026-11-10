import { TenantLayout } from "@/components/shell/panel-layout";

// Guard en el servidor ANTES de responder: sin sesión o sin membresía → 404 (no revela que existe).
export default function EmpresaPanelLayout({ children }: { children: React.ReactNode }) {
  return <TenantLayout>{children}</TenantLayout>;
}
