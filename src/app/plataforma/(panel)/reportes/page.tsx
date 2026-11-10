import type { Metadata } from 'next'
import { GaviaReportesPage } from '@/features/backoffice/pages'

export const metadata: Metadata = { title: 'Reportes' }

export default function Page() {
  return <GaviaReportesPage />
}
