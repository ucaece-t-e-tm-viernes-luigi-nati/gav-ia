import { BackofficeLayout } from "@/components/shell/panel-layout";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <BackofficeLayout>{children}</BackofficeLayout>;
}
