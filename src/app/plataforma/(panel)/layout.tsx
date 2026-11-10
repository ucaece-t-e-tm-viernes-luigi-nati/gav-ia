import { PlatformLayout } from '@/components/shell/panel-layout'

// Guard en el servidor ANTES de responder: sin sesión o sin rol de equipo → 404.
export default function PlatformPanelLayout({ children }: { children: React.ReactNode }) {
  return <PlatformLayout>{children}</PlatformLayout>
}
