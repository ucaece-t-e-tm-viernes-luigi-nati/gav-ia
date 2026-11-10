import { ReservaDetailPage } from "@/features/reservas/pages";

export default async function Page(props: { params: Promise<{ id: string }> }) {
  return <ReservaDetailPage role="admin" id={(await props.params).id} />;
}
