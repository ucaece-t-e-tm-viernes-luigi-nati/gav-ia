import type { Metadata } from 'next'
import { ActionForm, inputClass, labelClass } from '@/components/forms'
import { Card, PageTitle } from '@/components/panel/ui'
import { q } from '@/lib/db'
import { requireSuperadmin } from '@/lib/guards'
import { MODULE_INFO } from '@/lib/plan'
import { savePlan } from '../actions'

export const metadata: Metadata = { title: 'Planes' }

type PlanRow = { id: string; code: string; name: string; description: string; features: string[]; price_cents: string; currency: string; trial_days: number; sort_order: number; active: boolean; modules: string[]; clients: number }

export default async function PlansPage() {
  await requireSuperadmin()
  const plans = await q<PlanRow>(
    `SELECT p.id, p.code, p.name, p.description, p.features, p.price_cents::text, p.currency, p.trial_days, p.sort_order, p.active, p.modules,
            (SELECT count(*)::int FROM balnearios b WHERE b.plan_id = p.id) AS clients
       FROM plans p ORDER BY p.sort_order, p.price_cents`,
  )
  return (
    <>
      <PageTitle eyebrow="Plataforma GavIA" title="Planes" description="Abono mensual con período de prueba. Cambiar un precio no modifica el abono de los balnearios existentes (se ajusta en cada balneario)." />
      <div className="grid gap-5 lg:grid-cols-2">
        {plans.map((p) => (
          <Card key={p.id} title={`${p.name} · ${p.clients} balnearios`}>
            <PlanForm plan={p} />
          </Card>
        ))}
        <Card title="Nuevo plan">
          <PlanForm />
        </Card>
      </div>
    </>
  )
}

function PlanForm({ plan }: { plan?: PlanRow }) {
  return (
    <ActionForm action={savePlan} submitLabel={plan ? 'Guardar' : 'Crear plan'}>
      <input type="hidden" name="id" value={plan?.id ?? ''} />
      <div className="grid grid-cols-2 gap-3">
        <label className={labelClass}>
          Código
          <input name="code" required defaultValue={plan?.code} readOnly={!!plan} className={inputClass} placeholder="ej. pro" />
        </label>
        <label className={labelClass}>
          Nombre
          <input name="name" required defaultValue={plan?.name} className={inputClass} />
        </label>
        <label className={labelClass}>
          Precio / mes
          <input name="price" inputMode="decimal" required defaultValue={plan ? String(Number(plan.price_cents) / 100) : ''} className={inputClass} />
        </label>
        <label className={labelClass}>
          Moneda
          <select name="currency" defaultValue={plan?.currency ?? 'USD'} className={inputClass}>
            <option value="USD">USD</option>
            <option value="ARS">ARS</option>
          </select>
        </label>
        <label className={labelClass}>
          Días de prueba
          <input name="trial_days" type="number" min={0} max={365} required defaultValue={plan?.trial_days ?? 15} className={inputClass} />
        </label>
        <label className={labelClass}>
          Orden
          <input name="sort" type="number" defaultValue={plan?.sort_order ?? 10} className={inputClass} />
        </label>
      </div>
      <label className={labelClass}>
        Descripción
        <input name="description" maxLength={200} defaultValue={plan?.description ?? ''} className={inputClass} />
      </label>
      <label className={labelClass}>
        Beneficios (uno por línea)
        <textarea name="features" rows={3} defaultValue={plan?.features?.join('\n') ?? ''} className={inputClass} />
      </label>
      <fieldset className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
        <legend className="mb-1 text-sm font-medium">Módulos incluidos</legend>
        {Object.entries(MODULE_INFO).map(([code, info]) => (
          <label key={code} className="flex items-center gap-2">
            <input type="checkbox" name="modules" value={code} defaultChecked={plan?.modules?.includes(code)} /> {info.label}
          </label>
        ))}
      </fieldset>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="active" defaultChecked={plan?.active ?? true} /> Activo (se ofrece en el alta)
      </label>
    </ActionForm>
  )
}
