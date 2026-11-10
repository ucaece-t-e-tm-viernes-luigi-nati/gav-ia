import type { Metadata } from 'next'
import { GaviaConversationsPage } from '@/features/conversaciones/pages'

export const metadata: Metadata = { title: 'Conversaciones' }

export default function Page(props: { searchParams: Promise<{ c?: string; q?: string; estado?: string }> }) {
  return <GaviaConversationsPage searchParams={props.searchParams} />
}
