import { TenantCalendarPage } from "@/features/agenda/pages";
import { requirePermission } from "@/server/auth/context";

export default async function Page(props: { searchParams: Promise<{ vista?: string; fecha?: string }> }) {
  const t = await requirePermission("calendario.view");
  return <TenantCalendarPage role={t.role} searchParams={props.searchParams} />;
}
