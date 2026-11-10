# GavIA ERP

**Tu balneario, bajo control. Todo en un solo lugar.**

GavIA es un SaaS B2B de gestión integral para balnearios de la Costa Atlántica: plano interactivo y personalizable, reservas y disponibilidad por fecha, clientes, cobros (incluido QR de Mercado Pago), gastos y empleados, calendario, conversaciones de WhatsApp, reportes y auditoría.

MVP del Taller Emprendedor — Universidad CAECE, Mar del Plata (comisión viernes, 2.º cuatrimestre 2026). Versión **2.2**.

- **App publicada:** https://gav-ia.vercel.app
- **Landing del curso:** https://ucaece-t-e-tm-viernes-luigi-nati.github.io/landing/
- **Docentes:** Luis Miguel Orviz y Natalia Tonon García
- La entrega original del equipo (v2.1, sobre Supabase) está en [`referencia-v2.1/`](referencia-v2.1/).

## Modelo (B2B) y roles

| Quién | Qué hace | Paga |
|---|---|---|
| **Balnearios** (clientes) | Dueño y staff operan el balneario: plano, reservas, clientes, cobros, gastos, calendario y WhatsApp. | Abono mensual en USD (planes Start / Pro / Plus, con 15 días de prueba). |
| **Equipo de GavIA** (superadmin y admins) | Invita y aprueba balnearios, registra pagos, cambia planes y estados, supervisa (sin ver importes), lleva el CRM comercial y las demos. | — |

GavIA no tiene usuarios finales con cuenta: los bañistas son *clientes* que carga cada balneario.

- `user.role`: `superadmin` (email en `SUPERADMIN_EMAILS`, no se puede quitar) · `admin` (equipo, se suma desde Plataforma → Equipo) · `member`.
- `memberships.role`: `owner` (dueño) · `staff`. Un usuario puede pertenecer a varios balnearios.
- La matriz de permisos está en `src/lib/permissions.ts` y se chequea siempre en el servidor. Además, la base de datos aplica **RLS** (las políticas de la v2.1) en todo el panel del balneario.

## Superficies

Las dos superficies internas **no se muestran juntas ni se linkean desde la landing**, cada una tiene su propio login, no se indexan (`robots.txt`, `noindex`, `X-Robots-Tag`) y responden **404** a quien no tenga sesión con el rol correspondiente (`src/proxy.ts` como primera barrera y guards en cada página, layout y server action).

- **Pública** — `/` (landing) y `/agendar-demo` (turnos de 30 minutos que crean el prospecto en el CRM).
- **Panel del balneario** — `/empresa/...`. Se llega con el link del mail de aprobación. Resumen, plano y editor, reservas, clientes, cobros y pagos, gastos, calendario, conversaciones, reportes, usuarios, configuración, plan y actividad. El menú se filtra por rol y por los módulos del plan; con la cuenta pausada o dada de baja queda en solo lectura.
- **Plataforma del equipo** — `/plataforma/...`. Resumen, solicitudes, balnearios (ficha, pagos, plan, estado y supervisión sin importes), invitaciones, CRM y demos, calendario, conversaciones, reportes, planes, mails, equipo y auditoría.

## Alta de balnearios (por link + aprobación)

1. El equipo crea en **Plataforma → Invitaciones** una invitación personal (un solo uso, 14 días, se manda por mail) o un link de campaña (reutilizable, con vigencia y cupo).
2. El balneario completa el wizard de 5 pasos en `/empresa/alta/<token>`: cuenta → datos de la empresa → características (carpas, sombrillas, cocheras, temporada, servicios) → plan y día de pago → revisión y envío. Se guarda en cada paso.
3. Al enviar llegan dos mails: "Recibimos tu solicitud" al balneario y "Nueva solicitud" al equipo.
4. El equipo **aprueba** (confirma plan, abono, días de prueba y día de pago), **pide cambios** o **rechaza** con motivo. Al aprobar se crea el balneario con un **plano inicial armado con las cantidades declaradas**, el usuario dueño con contraseña temporal (vence en 72 h, se cambia en el primer ingreso) y sale el mail con usuario, contraseña, link, costo, fin de la prueba y día de pago.
5. Un cron diario (`/api/cron/vencimientos`) avisa 5 días antes del vencimiento, pasa a "pago vencido" y, después de `PAUSE_AFTER_DAYS`, pausa la cuenta. Al registrar el pago se reactiva.

## Stack

Next.js 16 (App Router) · React 19 · Tailwind 4 · better-auth (email + contraseña) · Neon Postgres (`pg`) · Vercel (con cron) · nodemailer (SMTP de Google Workspace).

La v2.1 corría sobre Supabase. En la v2.2 se migró a Neon conservando el esquema y las políticas RLS: `db/auth_compat.sql` emula `auth.uid()`, `auth.users` y el rol `authenticated`, y el servidor fija el usuario de la sesión en cada transacción (`src/server/db/postgres-driver.ts`).

## Correr en tu PC

```bash
npm install
cp .env.example .env.local   # completar DATABASE_URL (Neon) y BETTER_AUTH_SECRET
npm run db:migrate           # crea el esquema y, con SEED_DEMO=true, los datos de demo
npm run dev
```

- **Demo del balneario:** con `SEED_DEMO_PASSWORD` cargada, `balneario.demo@example.com` (dueño) y `staff.demo@example.com` (staff) entran por `/empresa/ingresar`.
- **Equipo:** el email de `SUPERADMIN_EMAILS` entra por `/plataforma/ingresar` → "Primer ingreso u olvidé mi contraseña" (sin SMTP, el link queda en la consola del servidor y en Plataforma → Mails).
- Las migraciones (`scripts/migrate.mjs`) son idempotentes y corren solas antes de cada build en Vercel.

Todas las variables están explicadas en [`.env.example`](.env.example).
