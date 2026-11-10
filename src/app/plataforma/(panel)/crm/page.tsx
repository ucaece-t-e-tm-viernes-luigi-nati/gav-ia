import type { Metadata } from 'next'
import { CrmPage } from '@/features/backoffice/pages'

export const metadata: Metadata = { title: 'CRM y demos' }

export default function Page(props: { searchParams: Promise<{ lead?: string }> }) {
  return <CrmPage searchParams={props.searchParams} />
}
