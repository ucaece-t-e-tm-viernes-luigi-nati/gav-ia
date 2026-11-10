import { ReservasListPage } from "@/features/reservas/pages";
import { requirePermission } from "@/server/auth/context";

export default async function Page(props: { searchParams: Promise<Record<string, string | undefined>> }) {
  const t = await requirePermission("reservas.manage");
  return <ReservasListPage role={t.role} searchParams={props.searchParams} />;
}
