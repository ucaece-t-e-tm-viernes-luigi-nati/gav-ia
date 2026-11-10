import { GastosPage } from "@/features/gastos/page";
import { requirePermission } from "@/server/auth/context";

export default async function Page(props: { searchParams: Promise<{ desde?: string; hasta?: string; categoria?: string }> }) {
  await requirePermission("gastos.manage");
  return <GastosPage searchParams={props.searchParams} />;
}
