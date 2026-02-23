function isResendConfigured() {
  return Boolean(process.env.RESEND_API_KEY);
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function sendEmail({ to, subject, html, text }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { sent: false, reason: 'missing-resend-api-key' };
  }

  const from = process.env.RESEND_FROM_EMAIL || 'Nite <bookings@nite.local>';
  const replyTo = process.env.RESEND_REPLY_TO || undefined;
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      text,
      reply_to: replyTo
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const reason = payload?.message || `resend-http-${response.status}`;
    throw new Error(reason);
  }
  return { sent: true, id: payload?.id || null };
}

function buildClientEmailTemplate({
  businessName,
  clientName,
  serviceName,
  appointmentDate,
  appointmentTime,
  notes
}) {
  const subject = `${businessName}: booking confirmed`;
  const lines = [
    `Hi ${clientName || 'there'},`,
    '',
    `Your appointment with ${businessName} is confirmed.`,
    '',
    `Service: ${serviceName || 'Selected service'}`,
    `Date: ${appointmentDate || 'TBD'}`,
    `Time: ${appointmentTime || 'TBD'}`,
    notes ? `Notes: ${notes}` : null,
    '',
    'Reply to this email if you need to make a change.'
  ].filter(Boolean);
  const text = lines.join('\n');
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#1f2937;">
      <h2 style="margin:0 0 12px;">Booking Confirmed</h2>
      <p>Hi ${escapeHtml(clientName || 'there')},</p>
      <p>Your appointment with <strong>${escapeHtml(businessName)}</strong> is confirmed.</p>
      <table cellpadding="6" cellspacing="0" style="border-collapse:collapse;">
        <tr><td><strong>Service</strong></td><td>${escapeHtml(serviceName || 'Selected service')}</td></tr>
        <tr><td><strong>Date</strong></td><td>${escapeHtml(appointmentDate || 'TBD')}</td></tr>
        <tr><td><strong>Time</strong></td><td>${escapeHtml(appointmentTime || 'TBD')}</td></tr>
        ${notes ? `<tr><td><strong>Notes</strong></td><td>${escapeHtml(notes)}</td></tr>` : ''}
      </table>
      <p style="margin-top:16px;">Reply to this email if you need to make a change.</p>
    </div>
  `;
  return { subject, text, html };
}

function buildOwnerEmailTemplate({
  businessName,
  clientName,
  clientEmail,
  clientPhone,
  serviceName,
  appointmentDate,
  appointmentTime,
  notes
}) {
  const subject = `${businessName}: new booking from ${clientName || 'customer'}`;
  const lines = [
    `New booking received for ${businessName}.`,
    '',
    `Client: ${clientName || 'Unknown'}`,
    clientEmail ? `Email: ${clientEmail}` : null,
    clientPhone ? `Phone: ${clientPhone}` : null,
    `Service: ${serviceName || 'Selected service'}`,
    `Date: ${appointmentDate || 'TBD'}`,
    `Time: ${appointmentTime || 'TBD'}`,
    notes ? `Notes: ${notes}` : null
  ].filter(Boolean);
  const text = lines.join('\n');
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#1f2937;">
      <h2 style="margin:0 0 12px;">New Booking Received</h2>
      <p>A new booking was submitted for <strong>${escapeHtml(businessName)}</strong>.</p>
      <table cellpadding="6" cellspacing="0" style="border-collapse:collapse;">
        <tr><td><strong>Client</strong></td><td>${escapeHtml(clientName || 'Unknown')}</td></tr>
        ${clientEmail ? `<tr><td><strong>Email</strong></td><td>${escapeHtml(clientEmail)}</td></tr>` : ''}
        ${clientPhone ? `<tr><td><strong>Phone</strong></td><td>${escapeHtml(clientPhone)}</td></tr>` : ''}
        <tr><td><strong>Service</strong></td><td>${escapeHtml(serviceName || 'Selected service')}</td></tr>
        <tr><td><strong>Date</strong></td><td>${escapeHtml(appointmentDate || 'TBD')}</td></tr>
        <tr><td><strong>Time</strong></td><td>${escapeHtml(appointmentTime || 'TBD')}</td></tr>
        ${notes ? `<tr><td><strong>Notes</strong></td><td>${escapeHtml(notes)}</td></tr>` : ''}
      </table>
    </div>
  `;
  return { subject, text, html };
}

async function sendBookingEmails({
  businessName,
  clientName,
  clientEmail,
  clientPhone,
  ownerEmail,
  serviceName,
  appointmentDate,
  appointmentTime,
  notes
}) {
  const jobs = [];

  if (clientEmail) {
    const clientTemplate = buildClientEmailTemplate({
      businessName,
      clientName,
      serviceName,
      appointmentDate,
      appointmentTime,
      notes
    });
    jobs.push(sendEmail({ to: clientEmail, ...clientTemplate }));
  }

  if (ownerEmail) {
    const ownerTemplate = buildOwnerEmailTemplate({
      businessName,
      clientName,
      clientEmail,
      clientPhone,
      serviceName,
      appointmentDate,
      appointmentTime,
      notes
    });
    jobs.push(sendEmail({ to: ownerEmail, ...ownerTemplate }));
  }

  if (jobs.length === 0) {
    return { sent: false, reason: 'no-recipient' };
  }

  const results = await Promise.allSettled(jobs);
  const successCount = results.filter((r) => r.status === 'fulfilled' && r.value?.sent).length;
  const failures = results
    .filter((r) => r.status === 'rejected')
    .map((r) => r.reason?.message || 'unknown-send-error');

  return {
    sent: successCount > 0,
    successCount,
    failures
  };
}

module.exports = {
  isResendConfigured,
  sendBookingEmails
};
