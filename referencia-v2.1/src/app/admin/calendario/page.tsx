import { TenantCalendarPage } from "@/features/agenda/pages";

export default function Page(props: { searchParams: Promise<{ vista?: string; fecha?: string }> }) {
  return <TenantCalendarPage role="admin" searchParams={props.searchParams} />;
}
