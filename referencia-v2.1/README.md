# GAVIA ERP

**Tu balneario, bajo control. Todo en un solo lugar.**

Plataforma SaaS de gestión integral para balnearios de la Costa Atlántica: plano interactivo y personalizable, reservas, disponibilidad por fecha, CRM, calendario, conversaciones de WhatsApp, cobros (incluido QR de Mercado Pago), dashboards por rol, backoffice de GAVIA y auditoría.

---

## Índice

1. [Stack y arquitectura](#stack-y-arquitectura)
2. [Puesta en marcha local (modo demo)](#puesta-en-marcha-local-modo-demo)
3. [Variables de entorno](#variables-de-entorno)
4. [Configuración de Supabase (producción)](#configuración-de-supabase-producción)
5. [Despliegue](#despliegue)
6. [Seguridad, roles y permisos](#seguridad-roles-y-permisos)
7. [Planos personalizables](#planos-personalizables)
8. [Mercado Pago (cobros con QR)](#mercado-pago-cobros-con-qr)
9. [WhatsApp Business](#whatsapp-business)
10. [Pruebas y comprobaciones](#pruebas-y-comprobaciones)
11. [Estado actual y pendientes](#estado-actual-y-pendientes)

---

## Stack y arquitectura

| Capa | Tecnología |
|---|---|
| Framework | Next.js 16 (App Router, Server Components, Server Actions), React 19, TypeScript |
| UI | Tailwind CSS 4, componentes propios estilo shadcn/ui sobre Radix, Lucide Icons |
| Datos | PostgreSQL (Supabase) con **Row Level Security**; PGlite (PostgreSQL embebido) para desarrollo local |
| Auth | Supabase Auth (producción) · sesión firmada local (solo modo demo) |
| Validación | Zod en todas las Server Actions |

```
src/
  app/                 Rutas (finas): landing, login, /backoffice, /owner, /admin, webhooks
  features/            Módulos por funcionalidad (plano, reservas, clientes, agenda, conversaciones, pagos, dashboard, owner, backoffice)
  components/          UI reutilizable (ui/), shell del panel, landing, marca
  server/
    db/                Drivers (PGlite / postgres), transacciones asUser/asService, datos demo
    auth/              Sesión, contexto del usuario y roles (desde la base, nunca desde el navegador)
    repos/             Acceso a datos por módulo
    actions/           Server Actions (validación + autorización + RLS)
    payments/          Integración Mercado Pago
  lib/                 Utilidades puras (dinero en centavos, fechas en hora argentina)
supabase/migrations/   Esquema, funciones, triggers y políticas RLS (fuente única de verdad)
db/dev/auth_stub.sql   Emulación del esquema auth de Supabase (solo local)
tests/                 Pruebas de seguridad, planos e importes
```

**Decisión clave de acceso a datos.** Toda consulta de usuario corre dentro de una transacción con `set local role authenticated` y los *claims* del usuario verificado (`request.jwt.claims`), exactamente como lo hace Supabase. Así las **mismas políticas RLS** se aplican en local (PGlite) y en producción (conexión directa a PostgreSQL de Supabase). Las operaciones de sistema (login local, webhooks validados, escritura de secretos cifrados) usan `asService` de forma explícita y acotada.

**Importes:** siempre enteros en centavos (`bigint`), nunca punto flotante. El saldo de cada reserva lo mantiene un trigger a partir de los pagos aprobados.

---

## Puesta en marcha local (modo demo)

Requisitos: **Node.js 20.9+** (probado con Node 26).

```bash
npm install
```

```bash
cp .env.example .env.local
```

Completá en `.env.local` (para modo demo):

- `GAVIA_DATA_MODE=demo`
- `GAVIA_SESSION_SECRET`: 32+ caracteres aleatorios.
- `GAVIA_ENCRYPTION_KEY`: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
- `GAVIA_DEMO_PASSWORD`: contraseña de las cuentas demo (10+ caracteres).

```bash
npm run dev
```

Abrí http://localhost:3000. La primera carga crea la base local (PGlite) en una carpeta temporal del sistema (`gavia-dev-db-*`), aplica las migraciones y carga los datos de demostración.

### Cuentas de demostración

Todas usan la contraseña definida en `GAVIA_DEMO_PASSWORD`:

| Rol | Correo |
|---|---|
| Superadmin GAVIA | `superadmin@gavia-demo.test` |
| Dueño — Balneario Mareas | `dueno.mareas@gavia-demo.test` |
| Administrador — Balneario Mareas | `admin.mareas@gavia-demo.test` |
| Dueño — Parador Los Médanos | `dueno.medanos@gavia-demo.test` |
| Administrador — Parador Los Médanos | `admin.medanos@gavia-demo.test` |

Los datos demo son ficticios, están marcados con `is_demo = true` y se muestran con la etiqueta “Demostración”. **El modo demo se niega a arrancar con `NODE_ENV=production`**, por lo que estas cuentas no existen en producción.

Para reiniciar la base local, detené el servidor y borrá la carpeta `gavia-dev-db-*` del directorio temporal del sistema (o definí otra con `GAVIA_DEV_DB_DIR`).

---

## Variables de entorno

Ver [.env.example](.env.example). Resumen:

| Variable | Uso |
|---|---|
| `GAVIA_DATA_MODE` | `demo` (local) o `supabase` |
| `APP_URL` | URL pública (para URLs de webhooks) |
| `GAVIA_ENCRYPTION_KEY` | Clave AES-256-GCM para credenciales de integraciones |
| `GAVIA_SESSION_SECRET`, `GAVIA_DEMO_PASSWORD` | Solo modo demo |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Auth |
| `SUPABASE_SERVICE_ROLE_KEY` | Solo servidor: invitar usuarios nuevos |
| `DATABASE_URL` | Conexión directa a PostgreSQL de Supabase |
| `WHATSAPP_*` | Línea de WhatsApp comercial de GAVIA |
| `CRON_SECRET` | Protege `/api/cron/vencimientos` (Vercel Cron lo envía como `Authorization: Bearer …`) |

Nunca se exponen secretos al navegador: solo las dos variables `NEXT_PUBLIC_*` (públicas por diseño en Supabase).

---

## Configuración de Supabase (producción)

1. Crear un proyecto en Supabase (región São Paulo recomendada).
2. Aplicar la migración `supabase/migrations/20261029000001_init.sql`:
   - con Supabase CLI: `supabase link` y luego `supabase db push`, o
   - pegando el archivo en el SQL Editor.
   > No ejecutar `db/dev/auth_stub.sql` en Supabase (es solo para local).
3. En **Authentication → Providers** dejar habilitado Email y **deshabilitar el registro público**. Los usuarios los crea GAVIA (o el dueño, para sus administradores) con una **contraseña temporal** que se muestra una sola vez; no hace falta SMTP. Cada usuario la cambia desde “Cambiar contraseña” (ícono de llave en el panel) y, si la olvida, el dueño o el superadmin la blanquean desde Usuarios.
   - Opcional, con SMTP propio configurado: plantillas *Invite* y *Reset Password* con el enlace `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite` (o `type=recovery`) para habilitar la recuperación por correo.
4. Completar `.env` con `GAVIA_DATA_MODE=supabase`, las claves del proyecto y `DATABASE_URL` (Settings → Database → *Connection string*, modo *Session* o conexión directa).
5. Crear el primer superadmin: invitá al usuario desde Authentication → Users y luego ejecutá en el SQL Editor:
   ```sql
   update public.profiles set platform_role = 'superadmin' where email = 'tu-correo@dominio.com';
   ```
6. Ingresá a `/login` con ese usuario: desde `/backoffice` podés registrar balnearios (se invita al dueño por correo) y planes.

---

## Despliegue

### Demo de revisión en Vercel (actual)

Proyecto Vercel `gavia-erp`, desplegado con la CLI (`npx vercel deploy --target preview`).

- Variables (solo entorno **Preview**, marcadas como secretas): `GAVIA_DATA_MODE=demo`, `GAVIA_ALLOW_PREVIEW_DEMO=true`, `GAVIA_SESSION_SECRET`, `GAVIA_ENCRYPTION_KEY`, `GAVIA_DEMO_PASSWORD` (generadas nuevas, distintas de las locales). La contraseña demo de la preview está en `.env.vercel-preview.local`, que no se sube.
- `GAVIA_ALLOW_PREVIEW_DEMO=true` habilita explícitamente el modo demo con `NODE_ENV=production`: base PostgreSQL **en memoria** con datos ficticios, que se recrea en cada arranque de instancia (los cambios no persisten ni se comparten entre instancias).
- La preview está protegida con **Vercel Authentication**: solo la ven usuarios con acceso al equipo de Vercel.
- El entorno **Production** (`https://gavia-erp.vercel.app`) usa Supabase (ver abajo).

### Producción actual (Supabase)

- Esquema aplicado con `node --env-file=.env.supabase.local scripts/supabase-setup.mjs` (registra las migraciones aplicadas en `gavia_meta.migrations`; volver a ejecutarlo solo aplica las nuevas y asigna el superadmin de `GAVIA_SUPERADMIN_EMAIL`).
- Variables de Vercel (Production) cargadas con `scripts/vercel-production-env.mjs`. `GAVIA_ENCRYPTION_KEY` se generó una vez y quedó en `.env.supabase.local`: no cambiarla o las credenciales de integraciones guardadas dejarán de poder descifrarse.
- Si en un entorno local la resolución DNS de Node falla, anteponé `--require ./scripts/dns-fallback.cjs` (solo para scripts).

### Producción con Supabase

Recomendado: **Vercel** (o cualquier hosting Node.js).

1. Importar el repositorio y definir las variables de entorno de producción (`GAVIA_DATA_MODE=supabase`, etc.).
2. `npm run build` y `npm start` (Vercel lo hace automáticamente).
3. Configurar `APP_URL` con el dominio final; las URLs de webhooks se derivan de ella.
4. Recomendado: activar protección contra abuso (rate limiting / WAF) del hosting para `/login` y `/api/webhooks/*`. La app incluye un limitador básico por proceso.

---

## Seguridad, roles y permisos

- **Roles:** `superadmin` (GAVIA, en `profiles.platform_role`), `owner` y `admin` (por balneario, en `memberships`). El rol **siempre se lee de la base**; el navegador no puede elegirlo.
- **RLS en todas las tablas.** Funciones `is_member`, `is_owner`, `is_superadmin`, `can_edit_plano` (security definer, sin recursión).
- **Aislamiento entre balnearios:** cualquier id manipulado en una URL o petición devuelve “no existe” por RLS. Claves foráneas compuestas `(id, balneario_id)` impiden cruzar datos entre establecimientos.
- **Administrador:** ve reservas vigentes, futuras y finalizadas hace menos de 30 días, con el importe y saldo de cada una (para cobrar), pero **no** puede ejecutar `finance_summary` (facturación, cobros totales, saldos agregados), ni anular pagos, ni gestionar usuarios, ni leer credenciales, ni editar el plano sin permiso del dueño.
- **Dueño:** gestiona su balneario y puede sumar **dueños o administradores** y cambiar el rol de cualquiera (por ejemplo, pasar un administrador a dueño). Un trigger (`guard_last_owner`) impide dejar el balneario sin al menos un dueño activo, y nadie puede quitarse a sí mismo el acceso de dueño. No puede crear superadmins.
- **Pagos:** inmutables salvo anulación (solo dueño, con motivo). Los cobros de Mercado Pago solo los inserta el backend tras confirmar la order con el proveedor.
- **Reservas superpuestas:** imposibles por la restricción `EXCLUDE USING gist (unit_id WITH =, period WITH &&) WHERE (active)`.
- **Auditoría automática** (triggers) de reservas, cancelaciones, pagos, anulaciones, membresías y roles, sectores, unidades, elementos del plano, integraciones, planes, suscripciones y facturas. La tabla `audit_log` no admite escritura directa.
- **Secretos de integraciones** cifrados (AES-256-GCM) en `integration_secrets`, tabla sin políticas RLS (inaccesible para usuarios).

---

## Planos personalizables

Cada balneario diseña **sus propios planos**, independientes entre sí y de otros balnearios:

- **Dos planos separados:** *Playa* (carpas y sombrillas) y *Cocheras* (estacionamiento). Un trigger impide ubicar una unidad en el plano que no corresponde a su tipo.
- **Editor visual** (`/owner/plano/editor`): barra de herramientas para agregar carpas, sombrillas, cocheras, filas numeradas automáticas, sectores y elementos (pasillo, mar, acceso, edificio, etiqueta, otro). Seleccionar, arrastrar con ajuste a grilla, mover con flechas, editar identificador, fila, sector, tamaño, fuera de servicio, duplicar, eliminar, deshacer y “empezar de cero”.
- **Persistencia real:** “Guardar cambios” guarda todo en una transacción con **control de versión** (si otra persona guardó antes, se avisa en vez de pisar cambios). No se pueden eliminar unidades con reservas.
- **Catálogo extensible:** nuevos tipos de unidad se agregan en la tabla `unit_kinds` sin cambiar el código.
- **Permisos:** el dueño edita; el administrador solo usa el plano, salvo que el dueño active “Puede editar el plano” en Usuarios (validado por RLS con `can_edit_plano`).
- **Vista operativa** (`/owner/plano`, `/admin/plano`): selector de período, leyenda permanente con estados por color **y** símbolo (disponible ✓, reservada reloj, ocupada ●, fuera de servicio ✕) más indicador de saldo pendiente ($). Clic en una unidad abre la ficha con reservas del período, cliente, importes, cobro rápido, cobro con QR y alta de reserva.

Criterios de aceptación cubiertos por `tests/plano.test.ts` y verificados en el navegador: crear un plano desde cero en un balneario nuevo, agregar/mover/renombrar/eliminar, persistencia al recargar, separación Playa/Cocheras, disponibilidad por período, aislamiento entre balnearios y permisos en base de datos.

---

## Planes, etapas y equipo de GAVIA

- **Planes** (`plans.modules`, precios en USD): START (U$D 399: plano, carpas/sombrillas/cocheras, disponibilidad, fichas de clientes) · PRO (U$D 899: + WhatsApp, IA, atención 24/7, análisis de ocupación) · PLUS (U$D 1299: + pagos, historial y saldos, Contabilium). Los módulos se aplican en el menú, en las páginas, en las Server Actions y en la base (`has_module`). IA, atención 24/7 y Contabilium figuran en los planes pero **todavía no están desarrollados**.
- **Etapas del balneario:** TESTING (`prueba`, 15 días gratis; al vencer, el panel muestra “prueba finalizada”), ACTIVO (se activa al registrar el primer pago, total con 5 % de descuento o primera cuota) y SUSPENDIDO (sin acceso al panel, datos conservados).
- **Superadmins con permisos por sección** (`profiles.platform_permissions`): se crean desde Backoffice → Usuarios marcando cada sección. Las políticas RLS usan `platform_can()`.
- **Confidencialidad:** ningún usuario de GAVIA puede leer cobros, `finance_summary` ni gastos de un balneario. La supervisión (`/backoffice/balnearios/[id]/supervision`) muestra plano, reservas, clientes, agenda y usuarios sin importes.
- **Agenda de demos** (`/agendar-demo`): turnos de 30 min, 09:00–17:00, lunes a viernes, con 24 h de anticipación; crea el evento en el calendario de GAVIA y el prospecto en el CRM. Un índice único impide reservar dos veces el mismo turno.
- **Gastos del dueño** (`/owner/gastos`): categorías propias y vistas por semana, mes, temporada o rango.
- **Planes anuales:** el pago total (5 % de descuento) o la primera cuota abre un año de plan; si se renueva antes de vencer, el año nuevo empieza al terminar el vigente. Si el plan de un balneario ACTIVO vence sin renovarse, el acceso queda bloqueado al instante (`balneario_access` = `sin_renovar`, pantalla con el contacto gaviaerp@gmail.com) y la tarea diaria `/api/cron/vencimientos` (Vercel Cron, `vercel.json`) lo pasa a SUSPENDIDO.
- **Cobros facturados:** el dueño marca cada cobro como facturado (con N.º de comprobante opcional), filtra facturados / sin facturar y ve, por cliente, cuánto pagó y cuánto está facturado. Es una marca interna: la facturación electrónica (AFIP/ARCA) no está integrada.
- **Reservas:** períodos predeterminados al reservar, en el plano y en la supervisión (temporada 15/11 al 30/04, diciembre a marzo completos o por quincena) además del rango libre (`src/lib/periods.ts`). Una reserva sin cobros se puede **eliminar** (el cliente queda en Clientes; con cobros solo se cancela, y la FK `on delete restrict` lo garantiza). **Carpa compartida:** `reservation_customers` suma clientes a la reserva del titular; `reservation_holders()` muestra “Ana y Juan” en plano, listados y exportaciones.
- **Sueldos y empleados:** cada balneario tiene la categoría **Sueldos** (`expense_categories.kind = 'sueldos'`, creada por trigger, no se puede borrar). Al elegirla se indica el empleado; `employees` guarda teléfono, banco, titular, CBU/CVU (22 dígitos) y alias, solo visible para el dueño.
- **Ingresos y gastos:** gráfico en el resumen del dueño con filtro de fechas (cobros aprobados con el módulo de pagos, o reservas sin él) y exportación conjunta `/owner/balance/exportar` (Excel con hojas Resumen, Ingresos y Gastos; PDF con las tres secciones).
- **Exportación:** cobros (`/owner/pagos/exportar`) y gastos (`/owner/gastos/exportar`) a Excel (importes numéricos) y PDF, con el rango de fechas y los filtros de la pantalla. Solo el dueño.
- **Backoffice:** alta de balneario con nombre, teléfono y dirección del balneario, nombre, teléfono y correo del dueño (el identificador interno se genera solo); edición de datos y cambio de estado desde la ficha o el listado; usuarios filtrables por balneario, con cambio de correo y definición de contraseña (permiso Usuarios, auditado sin guardar la contraseña).

## Mercado Pago (cobros con QR)

Implementado con la **API de Orders** (QR dinámico): `POST /v1/orders` con `type: "qr"`, `config.qr.mode: "dynamic"` y el `external_pos_id` de una caja.

Flujo: reserva → saldo pendiente → solicitud de cobro (`payment_requests`) → order en Mercado Pago → QR → notificación (`/api/webhooks/mercadopago?b={balneario}`) con validación de firma `x-signature` → **consulta de la order al proveedor** → pago confirmado solo si `status = processed` y el importe coincide → saldo actualizado. También se reconcilia consultando la order mientras el QR está abierto.

**Para activar cobros reales, cada dueño necesita** (Configuración → Mercado Pago):
1. Una aplicación en Mercado Pago Developers con **Access Token de producción** (`APP_USR-...`).
2. Una **sucursal y una caja** creadas en su cuenta; el `external_id` de la caja es el `external_pos_id`.
3. Webhook configurado con la URL que muestra el panel, tópico **Order**, y su **clave secreta**.

**Modo prueba:** solo en el entorno local (modo demo) se genera un QR marcado “QR de prueba · no válido” y un botón “Simular aprobación”, que procesa el resultado por el mismo camino que una notificación real y registra el pago como “PAGO DE PRUEBA SIMULADO”. En producción sin credenciales, el cobro con QR aparece como **pendiente de configuración** y no simula nada.

> Pendiente de verificar con credenciales reales: el esquema exacto de respuesta de la order (`type_response.qr_data`) y los estados finales en la cuenta del balneario. El código contempla ambas ubicaciones del `qr_data`.

---

## WhatsApp Business

Módulo de conversaciones con lista, búsqueda, filtros por estado, historial, asociación a cliente y reserva, y redacción. Conversaciones de cada balneario y conversaciones comerciales de GAVIA están **separadas** (`scope`).

- Webhook: `/api/webhooks/whatsapp` (`?b={balneario}` para la línea de un balneario) con verificación `hub.verify_token` y firma `X-Hub-Signature-256`.
- Envío vía Cloud API de Meta. **Sin credenciales el envío queda deshabilitado** y se indica en pantalla; no se simulan envíos. Los mensajes del modo demo están marcados como demostración.

Pendiente: alta de la cuenta de WhatsApp Business / número verificado en Meta y plantillas de mensajes para iniciar conversaciones fuera de la ventana de 24 h.

---

## Pruebas y comprobaciones

```bash
npm test
```

```bash
npm run typecheck
```

```bash
npm run build
```

`npm test` ejecuta, sobre PostgreSQL embebido con las migraciones reales:
- `tests/db.test.ts`: aislamiento RLS entre balnearios, restricciones del administrador (finanzas, anulaciones, cobros MP), reservas superpuestas, cancelación que libera unidades, recálculo de saldo y auditoría, escalada de privilegios, separación del CRM de GAVIA, secretos inaccesibles, permiso de edición de planos, separación Playa/Cocheras.
- `tests/plano.test.ts`: criterios de aceptación del editor de planos.
- `tests/money.test.ts`: manejo de importes.

---

## Estado actual y pendientes

**Implementado:** landing, login con redirección por rol, backoffice (dashboard, balnearios, ficha, CRM comercial, calendario, conversaciones, suscripciones, facturación GAVIA, reportes, usuarios, planes, auditoría), panel del dueño (resumen financiero con definiciones consistentes, plano y editor, reservas lista/calendario, clientes, cobros, calendario, conversaciones, reportes, usuarios y permisos, configuración e integraciones, auditoría), panel del administrador (operación del día, plano, reservas, clientes, cobros, calendario, conversaciones), integración Mercado Pago (Orders API, webhook firmado, reconciliación) y WhatsApp Cloud API.

**Requiere intervención externa:**
- Proyecto de Supabase y variables de producción (no se inventaron credenciales).
- Credenciales de Mercado Pago de cada balneario (Access Token, caja/POS, clave de webhook) y prueba end‑to‑end con cuenta real.
- Cuenta de WhatsApp Business (Meta) y variables `WHATSAPP_*`.
- Facturación electrónica de GAVIA (AFIP/ARCA): hoy las facturas son registros internos.
- Precios comerciales definitivos de los planes (los cargados son de demostración).
- Envío de correos transaccionales (recordatorios por mail): no implementado.
- Recuperación de contraseña autoservicio: en producción la provee Supabase Auth; falta la pantalla propia.
