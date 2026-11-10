import { OwnerAuditPage } from "@/features/owner/pages";
import { requirePermission } from "@/server/auth/context";

export default async function Page() {
  await requirePermission("auditoria.view");
  return <OwnerAuditPage />;
}
