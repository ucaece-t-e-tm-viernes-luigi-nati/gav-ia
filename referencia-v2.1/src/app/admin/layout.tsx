import { TenantLayout } from "@/components/shell/panel-layout";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <TenantLayout role="admin">{children}</TenantLayout>;
}
