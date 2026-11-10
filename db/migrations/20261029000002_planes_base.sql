-- Planes comerciales base. Precio en 0 hasta que GAVIA defina su lista de precios
-- (editable desde /backoffice/planes).
insert into public.plans (code, name, description, price_cents, billing_period, max_units, features, sort_order) values
  ('inicial', 'Inicial', 'Plano interactivo, reservas y clientes para establecimientos chicos.', 0, 'temporada', 60,
   '["Plano interactivo", "Reservas y disponibilidad", "CRM de clientes", "Registro de cobros"]'::jsonb, 0),
  ('profesional', 'Profesional', 'Operación completa con roles, calendario y conversaciones.', 0, 'temporada', 200,
   '["Todo lo de Inicial", "Roles dueño y administrador", "Calendario y recordatorios", "Conversaciones de WhatsApp", "Cobros con QR de Mercado Pago"]'::jsonb, 1),
  ('integral', 'Integral', 'Para complejos con varios sectores y necesidades a medida.', 0, 'temporada', null,
   '["Todo lo de Profesional", "Reportes financieros avanzados", "Acompañamiento en la puesta en marcha", "Configuración a medida del plano"]'::jsonb, 2)
on conflict (code) do nothing;
