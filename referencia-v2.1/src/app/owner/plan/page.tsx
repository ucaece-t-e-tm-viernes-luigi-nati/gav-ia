import { PlanPage } from "@/features/plan/page";

export default function Page(props: { searchParams: Promise<{ modulo?: string }> }) {
  return <PlanPage role="owner" searchParams={props.searchParams} />;
}
