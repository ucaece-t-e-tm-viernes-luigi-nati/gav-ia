import { PlanPage } from "@/features/plan/page";

export default function Page(props: { searchParams: Promise<{ modulo?: string }> }) {
  return <PlanPage role="admin" searchParams={props.searchParams} />;
}
