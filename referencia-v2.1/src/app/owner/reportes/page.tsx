import { OwnerReportesPage } from "@/features/owner/pages";

export default function Page(props: { searchParams: Promise<{ desde?: string; hasta?: string }> }) {
  return <OwnerReportesPage searchParams={props.searchParams} />;
}
