import { OwnerConfigPage } from "@/features/owner/pages";
import { requirePermission } from "@/server/auth/context";

export default async function Page() {
  await requirePermission("config.manage");
  return <OwnerConfigPage />;
}
