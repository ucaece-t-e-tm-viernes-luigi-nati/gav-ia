import { PlanoEditorPage } from "@/features/plano/pages";
import { requirePermission } from "@/server/auth/context";

// El dueño edita; el staff solo si el dueño le habilitó "puede editar el plano" (lo valida la base con can_edit_plano).
export default async function Page(props: { searchParams: Promise<{ vista?: string }> }) {
  const t = await requirePermission("plano.view");
  return <PlanoEditorPage role={t.role} searchParams={props.searchParams} />;
}
