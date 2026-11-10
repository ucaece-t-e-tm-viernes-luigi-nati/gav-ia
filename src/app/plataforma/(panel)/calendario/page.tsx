import type { Metadata } from 'next'
import { GaviaCalendarPage } from '@/features/agenda/pages'

export const metadata: Metadata = { title: 'Calendario comercial' }

export default function Page(props: { searchParams: Promise<{ vista?: string; fecha?: string }> }) {
  return <GaviaCalendarPage searchParams={props.searchParams} />
}
