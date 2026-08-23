// Minimal, provider-neutral outbound-email seam for password-reset/email-verification links.
// This project has no email/SMTP provider wired up yet (a real operator prerequisite - see
// docs/auth/IMPLEMENTATION_STATUS.md) so this module intentionally does the smallest useful
// thing rather than hand-rolling an SMTP client: if EMAIL_WEBHOOK_URL is set, it POSTs the
// message to that URL (any transactional-email provider with an inbound webhook, or an internal
// mail-relay service, can sit behind it - this file never assumes a specific vendor). If unset:
// - non-production: logs the message content locally so a developer can copy the link by hand.
// - production: logs a loud warning and does NOT expose the message content anywhere the caller
//   could relay to an untrusted response body - see routes.auth.mjs's own explicit gate on only
//   ever including a raw reset/verification link in a JSON response outside production.
export async function sendMail({ to, subject, text }) {
  const webhookUrl = process.env.EMAIL_WEBHOOK_URL;
  if (webhookUrl) {
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (process.env.EMAIL_WEBHOOK_SECRET) headers['x-webhook-secret'] = process.env.EMAIL_WEBHOOK_SECRET;
      const response = await fetch(webhookUrl, { method: 'POST', headers, body: JSON.stringify({ to, subject, text }) });
      if (!response.ok) throw new Error(`EMAIL_WEBHOOK_FAILED_${response.status}`);
      return { sent: true, via: 'webhook' };
    } catch (error) {
      console.error('[mailer] EMAIL_WEBHOOK_URL delivery failed:', error.message); // eslint-disable-line no-console
      return { sent: false, via: 'webhook', error: error.message };
    }
  }
  if (process.env.NODE_ENV === 'production') {
    console.warn(`[mailer] No EMAIL_WEBHOOK_URL configured in production - an email to ${to.replace(/(?<=.).(?=[^@]*@)/g, '*')} ("${subject}") was NOT sent. Configure EMAIL_WEBHOOK_URL (see .env.production.example).`); // eslint-disable-line no-console
    return { sent: false, via: 'none' };
  }
  console.log(`[mailer:dev] To: ${to}\nSubject: ${subject}\n${text}`); // eslint-disable-line no-console
  return { sent: true, via: 'console' };
}
