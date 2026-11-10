import { GaviaUsuariosPage } from "@/features/backoffice/pages";

export default function Page({ searchParams }: { searchParams: Promise<{ balneario?: string; q?: string }> }) {
  return <GaviaUsuariosPage searchParams={searchParams} />;
}
