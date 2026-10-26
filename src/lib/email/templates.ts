/** Plantillas de email con la marca del negocio (es-CL, CLP, hora de Chile). */

export interface BookingEmailData {
  tenantName: string
  brandColor: string
  customerName: string
  serviceName: string
  professionalName: string
  startAtLocal: string // ya formateado: "martes 27 de octubre, 10:30"
  priceClp: number
  manageUrl: string
  /** Ej: "Puedes cancelar hasta 24 h antes." o "Reserva sujeta a política de sin reembolso." */
  cancellationPolicyText: string
}

function layout(title: string, body: string, tenantName: string, brandColor: string): string {
  return `<!doctype html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#f6f6f7;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f6f7;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
        <tr><td style="padding:28px 32px 0;">
          <span style="display:inline-block;background:${brandColor};color:#ffffff;font-weight:700;font-size:13px;padding:6px 12px;border-radius:8px;">${tenantName}</span>
        </td></tr>
        <tr><td style="padding:16px 32px 8px;">
          <h1 style="margin:0;font-size:20px;color:#111113;">${title}</h1>
        </td></tr>
        <tr><td style="padding:0 32px 28px;font-size:15px;line-height:1.6;color:#3f3f46;">
          ${body}
        </td></tr>
      </table>
      <p style="margin:16px 0 0;font-size:12px;color:#a1a1aa;">Enviado con cital · Agenda online</p>
    </td></tr>
  </table>
</body></html>`
}

function row(label: string, value: string): string {
  return `<tr><td style="padding:6px 0;color:#71717a;font-size:14px;">${label}</td><td align="right" style="padding:6px 0;color:#18181b;font-size:14px;font-weight:600;">${value}</td></tr>`
}

export function bookingConfirmationEmail(d: BookingEmailData): { html: string; text: string; subject: string } {
  const fmtClp = `$${d.priceClp.toLocaleString('es-CL')}`
  const manageBtn = `<a href="${d.manageUrl}" style="display:inline-block;background:${d.brandColor};color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 24px;border-radius:10px;margin-top:16px;">Ver o cambiar mi reserva</a>`

  const table = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fafafa;border:1px solid #e4e4e7;border-radius:12px;padding:8px 16px;margin:12px 0;">
    ${row('Servicio', d.serviceName)}
    ${row('Profesional', d.professionalName)}
    ${row('Fecha', d.startAtLocal)}
    ${row('Precio', fmtClp)}
  </table>`

  return {
    subject: `Reserva confirmada · ${d.tenantName}`,
    html: layout(
      '¡Tu hora está agendada!',
      `<p>Hola ${d.customerName}, confirmamos tu reserva.</p>${table}<p style="font-size:13px;color:#71717a;">Si necesitas cambiarla o cancelarla, hazlo desde el botón. ${d.cancellationPolicyText}</p>${manageBtn}`,
      d.tenantName,
      d.brandColor,
    ),
    text: `Hola ${d.customerName}! Tu reserva en ${d.tenantName} está confirmada.\n\nServicio: ${d.serviceName}\nProfesional: ${d.professionalName}\nFecha: ${d.startAtLocal}\nPrecio: ${fmtClp}\n\nGestiona tu reserva aquí: ${d.manageUrl}\n\n${d.cancellationPolicyText}`,
  }
}

export function bookingReminderEmail(d: BookingEmailData): { html: string; text: string; subject: string } {
  const fmtClp = `$${d.priceClp.toLocaleString('es-CL')}`
  const manageBtn = `<a href="${d.manageUrl}" style="display:inline-block;background:${d.brandColor};color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 24px;border-radius:10px;margin-top:16px;">Ver mi reserva</a>`
  const table = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fafafa;border:1px solid #e4e4e7;border-radius:12px;padding:8px 16px;margin:12px 0;">
    ${row('Servicio', d.serviceName)}
    ${row('Profesional', d.professionalName)}
    ${row('Fecha', d.startAtLocal)}
    ${row('Precio', fmtClp)}
  </table>`
  return {
    subject: `Recordatorio: tu hora en ${d.tenantName} se acerca`,
    html: layout(
      'Tu hora es mañana',
      `<p>Hola ${d.customerName}, te recordamos tu cita.</p>${table}<p style="font-size:13px;color:#71717a;">${d.cancellationPolicyText}</p>${manageBtn}`,
      d.tenantName,
      d.brandColor,
    ),
    text: `Hola ${d.customerName}! Recordatorio de tu cita en ${d.tenantName}.\n\nServicio: ${d.serviceName}\nProfesional: ${d.professionalName}\nFecha: ${d.startAtLocal}\nPrecio: ${fmtClp}\n\n${d.cancellationPolicyText}\n\nGestiona tu reserva: ${d.manageUrl}`,
  }
}
