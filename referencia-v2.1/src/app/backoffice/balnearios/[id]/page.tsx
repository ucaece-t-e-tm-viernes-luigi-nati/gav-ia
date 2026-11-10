import { BalnearioDetailPage } from "@/features/backoffice/pages";

export default async function Page(props: { params: Promise<{ id: string }> }) {
  return <BalnearioDetailPage id={(await props.params).id} />;
}
