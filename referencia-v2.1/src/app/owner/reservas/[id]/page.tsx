import { ReservaDetailPage } from "@/features/reservas/pages";

export default async function Page(props: { params: Promise<{ id: string }> }) {
  return <ReservaDetailPage role="owner" id={(await props.params).id} />;
}
