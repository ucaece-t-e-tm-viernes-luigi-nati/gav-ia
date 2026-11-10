import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { SupervisionPage } from '@/features/backoffice/supervision'

export const metadata: Metadata = { title: 'Supervisión' }

type Search = Promise<{ tab?: string; vista?: string; fecha?: string; desde?: string; hasta?: string; periodo?: string; q?: string }>

export default async function Page(props: { params: Promise<{ id: string }>; searchParams: Search }) {
  const { id } = await props.params
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  return <SupervisionPage id={id} searchParams={props.searchParams} />
}
