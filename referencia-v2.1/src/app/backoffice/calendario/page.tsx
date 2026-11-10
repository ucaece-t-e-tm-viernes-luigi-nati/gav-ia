import { GaviaCalendarPage } from "@/features/agenda/pages";

export default function Page(props: { searchParams: Promise<{ vista?: string; fecha?: string }> }) {
  return <GaviaCalendarPage searchParams={props.searchParams} />;
}
