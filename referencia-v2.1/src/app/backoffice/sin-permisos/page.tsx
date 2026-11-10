import { Alert, PageHeader } from "@/components/ui/primitives";
import { requireSuperadmin } from "@/server/auth/context";

export default async function Page() {
  await requireSuperadmin();
  return (
    <>
      <PageHeader eyebrow="Backoffice GAVIA" title="Sin secciones habilitadas" />
      <Alert tone="warning">Tu usuario todavía no tiene secciones habilitadas. Pedile a un superadmin con permiso de Usuarios que te las asigne.</Alert>
    </>
  );
}