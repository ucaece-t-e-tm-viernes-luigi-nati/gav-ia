import { OwnerReportesPage } from "@/features/owner/pages";
import { requirePermission } from "@/server/auth/context";

export default async function Page(props: { searchParams: Promise<{ desde?: string; hasta?: string }> }) {
  await requirePermission("reportes.view");
  return <OwnerReportesPage searchParams={props.searchParams} />;
}
