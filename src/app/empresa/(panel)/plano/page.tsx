import { PlanoPage } from "@/features/plano/pages";
import { requirePermission } from "@/server/auth/context";

export default async function Page(props: { searchParams: Promise<{ vista?: string; desde?: string; hasta?: string }> }) {
  const t = await requirePermission("plano.view");
  return <PlanoPage role={t.role} searchParams={props.searchParams} />;
}
