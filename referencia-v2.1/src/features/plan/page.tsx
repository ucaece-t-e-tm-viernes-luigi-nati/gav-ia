import { Check, Lock } from "lucide-react";
import { Alert, Badge, Card, CardBody, CardHeader, PageHeader } from "@/components/ui/primitives";
import { requireTenant, type TenantRole } from "@/server/auth/context";
import { asUser } from "@/server/db";
import { formatDate } from "@/lib/dates";
import { hasModule, MODULE_INFO, type Module } from "@/lib/plan";

export async function PlanPage({ role, searchParams }: { role: TenantRole; searchParams: Promise<{ modulo?: string }> }) {
  const t = await requireTenant(role);
  const { modulo } = await searchParams;
  const plan = await asUser(t.viewer.id, (db) =>
    // El administrador no lee suscripciones (RLS): solo ve los módulos de su balneario.
    role === "owner"
      ? db.one<{ name: string; description: string; features: string[]; status: string; current_period_end: string }>(
          `select p.name, p.description, p.features, s.status, s.current_period_end from subscriptions s join plans p on p.id = s.plan_id
            where s.balneario_id = $1 order by s.created_at desc limit 1`,
          [t.balnearioId],
        )
      : Promise.resolve(null),
  );
  const blocked = modulo && modulo in MODULE_INFO ? MODULE_INFO[modulo as Module] : null;

  return (
    <>
      <PageHeader eyebrow={t.balnearioName} title="Plan del balneario" description="Las funciones disponibles dependen del plan contratado con GAVIA." />
      {blocked ? (
        <Alert tone="warning" title={`${blocked.label} no está incluido en el plan actual`} className="mb-4">
          Está disponible desde el plan {blocked.plan}. {role === "owner" ? "Contactá a GAVIA para cambiar de plan." : "Consultalo con el dueño del balneario."}
        </Alert>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-2">
        {plan ? (
          <Card>
            <CardHeader title={`Plan ${plan.name}`} description={plan.description} action={<Badge tone={plan.status === "activa" ? "success" : "warning"}>{plan.status}</Badge>} />
            <CardBody className="space-y-3 text-sm">
              <ul className="space-y-1.5">
                {plan.features.map((f) => <li key={f} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-st-free" aria-hidden /> {f}</li>)}
              </ul>
              <p className="text-xs text-mist">Vigente hasta el {formatDate(plan.current_period_end)}.</p>
            </CardBody>
          </Card>
        ) : null}
        <Card>
          <CardHeader title="Módulos" description="Incluidos en todos los planes: plano, reservas, clientes, calendario, gastos y usuarios." />
          <ul className="divide-y divide-line text-sm">
            {(Object.keys(MODULE_INFO) as Module[]).map((m) => {
              const on = hasModule(t.modules, m);
              const info = MODULE_INFO[m];
              return (
                <li key={m} className="flex items-center justify-between gap-3 px-5 py-3">
                  <span className="flex items-center gap-2">
                    {on ? <Check className="size-4 text-st-free" aria-hidden /> : <Lock className="size-4 text-mist" aria-hidden />}
                    {info.label}
                  </span>
                  <span className="flex gap-1">
                    {on ? <Badge tone="success">Incluido</Badge> : <Badge tone="muted">Plan {info.plan}</Badge>}
                    {on && !info.built ? <Badge tone="warning">En desarrollo</Badge> : null}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </>
  );
}
