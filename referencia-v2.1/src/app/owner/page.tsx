import { OwnerDashboard } from "@/features/dashboard/pages";

export default function Page(props: { searchParams: Promise<{ desde?: string; hasta?: string }> }) {
  return <OwnerDashboard searchParams={props.searchParams} />;
}
