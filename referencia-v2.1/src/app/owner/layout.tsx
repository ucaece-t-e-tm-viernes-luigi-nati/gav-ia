import { TenantLayout } from "@/components/shell/panel-layout";

export default function OwnerLayout({ children }: { children: React.ReactNode }) {
  return <TenantLayout role="owner">{children}</TenantLayout>;
}
