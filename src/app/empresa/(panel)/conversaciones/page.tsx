import { TenantConversationsPage } from "@/features/conversaciones/pages";
import { requirePermission } from "@/server/auth/context";

export default async function Page(props: { searchParams: Promise<{ c?: string; q?: string; estado?: string }> }) {
  const t = await requirePermission("conversaciones.manage");
  return <TenantConversationsPage role={t.role} searchParams={props.searchParams} />;
}
