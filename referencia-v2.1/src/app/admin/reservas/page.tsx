import { ReservasListPage } from "@/features/reservas/pages";

export default function Page(props: { searchParams: Promise<Record<string, string | undefined>> }) {
  return <ReservasListPage role="admin" searchParams={props.searchParams} />;
}
