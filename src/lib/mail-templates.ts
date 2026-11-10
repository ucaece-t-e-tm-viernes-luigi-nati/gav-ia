// Plantillas de mails transaccionales de GavIA (castellano rioplatense, HTML simple + texto plano).
import { site } from './site'

const STARTUP = site.name

export function esc(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

type Mail = { subject: string; html: string; text: string; template: string }

// Bloques: string = párrafo; ['list', [label, value][]]; ['quote', text]; ['link', label, url]; ['title', text]
type Block = string | ['list', Array<[string, string]>] | ['quote', string] | ['link', string, string] | ['title', string]

function render(template: string, subject: string, blocks: Block[]): Mail {
  const html: string[] = []
  const text: string[] = []
  for (const block of blocks) {
    if (typeof block === 'string') {
      html.push(`<p style="margin:0 0 14px;line-height:1.5">${block}</p>`)
      text.push(block.replace(/<[^>]+>/g, ''))
    } else if (block[0] === 'title') {
      html.push(`<h3 style="margin:18px 0 8px;font-size:16px">${esc(block[1])}</h3>`)
      text.push(`\n${block[1]}`)
    } else if (block[0] === 'list') {
      html.push(
        `<ul style="margin:0 0 14px;padding-left:18px;line-height:1.6">${block[1]
          .map(([label, value]) => `<li><strong>${esc(label)}:</strong> ${esc(value)}</li>`)
          .join('')}</ul>`,
      )
      text.push(block[1].map(([label, value]) => `- ${label}: ${value}`).join('\n'))
    } else if (block[0] === 'quote') {
      html.push(`<blockquote style="margin:0 0 14px;padding:10px 14px;border-left:3px solid #2878a8;background:#dceffa">${esc(block[1])}</blockquote>`)
      text.push(`> ${block[1]}`)
    } else if (block[0] === 'link') {
      html.push(
        `<p style="margin:0 0 14px"><a href="${esc(block[2])}" style="display:inline-block;background:#123b5d;color:#fff;padding:10px 16px;border-radius:10px;text-decoration:none;font-weight:bold">${esc(block[1])}</a><br><span style="font-size:12px;color:#666">${esc(block[2])}</span></p>`,
      )
      text.push(`${block[1]}: ${block[2]}`)
    }
  }
  const body = `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#263238;background:#f5f0e7;padding:24px">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;padding:24px;border:1px solid #e4e8eb">
<p style="font-weight:900;font-size:20px;margin:0 0 18px;color:#123b5d">GavIA</p>
${html.join('\n')}
<p style="margin:24px 0 0;color:#666;font-size:13px">— El equipo de ${STARTUP} · Costa Atlántica</p>
</div></body></html>`
  return { subject, html: body, text: `${text.join('\n\n')}\n\n— El equipo de ${STARTUP}`, template }
}

const b = (value: string) => `<strong>${esc(value)}</strong>`

export const mails = {
  invite(p: { link: string; expires: string; name?: string | null }) {
    return render('invite', `Te invitamos a sumar tu balneario a ${STARTUP}`, [
      `Hola${p.name ? ` ${esc(p.name)}` : ''}, te invitamos a sumar tu balneario a ${STARTUP}, el sistema de gestión para balnearios: plano interactivo de carpas y sombrillas, reservas, clientes, cobros, gastos y reportes en un solo lugar.`,
      'Completá el alta en unos minutos desde este link personal. Podés guardar y seguir después desde el mismo link.',
      ['link', 'Completar el alta', p.link],
      `El link vence el ${b(p.expires)}.`,
    ])
  },

  emailCode(p: { code: string }) {
    return render('email_code', `Tu código de verificación de ${STARTUP}: ${p.code}`, [
      'Usá este código para verificar tu correo en el formulario de alta:',
      `<span style="font-size:24px;letter-spacing:4px">${b(p.code)}</span>`,
      'Vence en 30 minutos. Si no fuiste vos, ignorá este mail.',
    ])
  },

  adminNewApplication(p: { empresa: string; ciudad: string; nombre: string; email: string; whatsapp: string; plan: string; fecha: string; link: string }) {
    return render('admin_new_application', `Nueva solicitud de alta: ${p.empresa}`, [
      'Hay una nueva solicitud de alta para revisar.',
      ['list', [
        ['Balneario', `${p.empresa} (${p.ciudad})`],
        ['Responsable', `${p.nombre} · ${p.email} · ${p.whatsapp}`],
        ['Plan pedido', p.plan],
        ['Enviada', p.fecha],
      ]],
      ['link', 'Revisar solicitud', p.link],
    ])
  },

  applicationReceived(p: { nombre: string; empresa: string; resumen: Array<[string, string]>; plazo: number }) {
    return render('application_received', `Recibimos tu solicitud en ${STARTUP}`, [
      `Hola ${esc(p.nombre)}, ¡gracias por sumarte a ${STARTUP}!`,
      `Recibimos la solicitud de alta de ${b(p.empresa)}. Nuestro equipo la va a revisar y te respondemos por este medio en un plazo de ${p.plazo} días hábiles.`,
      ['title', 'Resumen de lo que enviaste'],
      ['list', p.resumen],
      'Si necesitás cambiar algo, respondé este mail.',
    ])
  },

  approved(p: {
    nombre: string
    empresa: string
    link: string
    email: string
    password: string | null
    venceClave: string
    plan: string
    monto: string | null
    finPrueba: string | null
    diaPago: number | null
    mediosPago: string
  }) {
    const blocks: Block[] = [
      `Hola ${esc(p.nombre)}, ¡buenas noticias! Aprobamos el alta de ${b(p.empresa)}.`,
      ['title', 'Tus datos de ingreso'],
      ['list', [
        ['Link', p.link],
        ['Usuario', p.email],
        ['Contraseña temporal', p.password ?? '(usá la contraseña que ya tenés en GavIA)'],
      ]],
      ['link', 'Ingresar al panel de tu balneario', p.link],
    ]
    if (p.password) {
      blocks.push(`Al ingresar por primera vez te vamos a pedir que la cambies. Es obligatorio y la contraseña temporal vence el ${b(p.venceClave)}.`)
    }
    if (p.monto) {
      blocks.push(['title', `Tu plan: ${p.plan}`])
      blocks.push(['list', [
        ['Abono mensual', p.monto],
        ...(p.finPrueba ? ([['Período de prueba gratis hasta el', `${p.finPrueba} (fecha límite de tu primer pago)`]] as Array<[string, string]>) : []),
        ['Después, el pago vence', `el día ${p.diaPago} de cada mes`],
        ['Medios de pago', p.mediosPago],
      ]])
    }
    blocks.push('Cualquier duda, respondé este mail.')
    return render('approved', `¡Tu cuenta en ${STARTUP} fue aprobada!`, blocks)
  },

  changesRequested(p: { nombre: string; empresa: string; motivo: string; link: string }) {
    return render('changes_requested', `Tu solicitud en ${STARTUP} necesita algunos cambios`, [
      `Hola ${esc(p.nombre)}, revisamos la solicitud de ${b(p.empresa)} y antes de aprobarla necesitamos que corrijas lo siguiente:`,
      ['quote', p.motivo],
      'Podés corregirlo acá, tus datos ya están cargados:',
      ['link', 'Corregir mi solicitud', p.link],
      'Cuando la reenvíes, la volvemos a revisar.',
    ])
  },

  rejected(p: { nombre: string; empresa: string; motivo: string }) {
    return render('rejected', `Sobre tu solicitud en ${STARTUP}`, [
      `Hola ${esc(p.nombre)}, gracias por tu interés en ${STARTUP}.`,
      `Revisamos la solicitud de ${b(p.empresa)} y en esta oportunidad no podemos aprobarla por el siguiente motivo:`,
      ['quote', p.motivo],
      'Gracias por el tiempo que le dedicaste.',
    ])
  },

  billingReminder(p: { empresa: string; monto: string; fecha: string }) {
    return render('billing_reminder', `Tu abono de ${STARTUP} vence el ${p.fecha}`, [
      `Hola, te recordamos que el abono de ${b(p.empresa)} (${esc(p.monto)}) vence el ${b(p.fecha)}.`,
      'Si ya lo pagaste, ignorá este mensaje.',
    ])
  },

  billingOverdue(p: { empresa: string; monto: string; fecha: string; fechaPausa: string }) {
    return render('billing_overdue', `Tu abono de ${STARTUP} está vencido`, [
      `El abono de ${b(p.empresa)} (${esc(p.monto)}) venció el ${b(p.fecha)}.`,
      `Regularizalo para evitar la pausa del servicio el ${b(p.fechaPausa)}.`,
    ])
  },

  billingPaused(p: { empresa: string }) {
    return render('billing_paused', `Pausamos tu cuenta de ${STARTUP}`, [
      `Pausamos la cuenta de ${b(p.empresa)} por falta de pago. Mientras tanto el panel queda en modo solo lectura.`,
      'Tus datos están a salvo: al registrar el pago se reactiva.',
    ])
  },

  paymentRegistered(p: { empresa: string; monto: string; periodo: string; proximo: string }) {
    return render('payment_registered', `Registramos tu pago en ${STARTUP}`, [
      `Registramos tu pago de ${b(p.monto)} del período ${b(p.periodo)} para ${b(p.empresa)}. ¡Gracias!`,
      `Tu próximo vencimiento es el ${b(p.proximo)}.`,
    ])
  },

  statusChanged(p: { empresa: string; estado: string }) {
    return render('status_changed', `Cambió el estado de tu cuenta en ${STARTUP}`, [
      `El estado de la cuenta de ${b(p.empresa)} ahora es: ${b(p.estado)}.`,
      'Cualquier duda, respondé este mail.',
    ])
  },

  staffAccess(p: { empresa: string; link: string; email: string; password: string | null; venceClave: string; nuevo: boolean }) {
    const blocks: Block[] = [
      p.nuevo ? `Te sumaron al equipo de ${b(p.empresa)} en ${STARTUP}.` : `Te enviamos un nuevo acceso para el panel de ${b(p.empresa)} en ${STARTUP}.`,
      ['list', [
        ['Link', p.link],
        ['Usuario', p.email],
        ['Contraseña', p.password ? `${p.password} (temporal)` : '(usá la contraseña que ya tenés en GavIA)'],
      ]],
      ['link', 'Ingresar al panel', p.link],
    ]
    if (p.password) blocks.push(`Al ingresar te vamos a pedir que la cambies. La contraseña temporal vence el ${b(p.venceClave)}.`)
    return render('staff_access', p.nuevo ? `Te sumaron a ${p.empresa} en ${STARTUP}` : `Tu acceso a ${STARTUP}`, blocks)
  },

  superadminSetup(p: { link: string }) {
    return render('superadmin_setup', `Acceso a la plataforma ${STARTUP}`, [
      'Pediste crear o restablecer tu contraseña de la plataforma. Usá este link (vence en 30 minutos, un solo uso):',
      ['link', 'Definir mi contraseña', p.link],
      'Si no fuiste vos, ignorá este mail.',
    ])
  },
  adminInvite(p: { name: string; invitedBy: string; email: string; link: string; hours: number }) {
    return render('admin_invite', `Te sumaron al equipo de ${STARTUP}`, [
      `Hola ${esc(p.name)}, ${esc(p.invitedBy)} te dio acceso de administrador a la plataforma de ${STARTUP}: vas a poder revisar solicitudes de balnearios, aprobarlas y gestionar planes, pagos, supervisión, CRM y reportes.`,
      ['list', [['Usuario', p.email]]],
      `Para entrar, definí tu contraseña con este link (vence en ${p.hours} horas, un solo uso):`,
      ['link', 'Definir mi contraseña', p.link],
      'Después vas a entrar siempre desde la misma dirección de la plataforma con tu email y tu contraseña. Si el link vence, usá "Primer ingreso / olvidé mi contraseña" en la pantalla de login.',
    ])
  },
}
