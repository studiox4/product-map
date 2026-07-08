import type { MailConfig, SmtpMailConfig } from '../config';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/** Minimal transport contract — nodemailer's Transporter satisfies this structurally. */
export interface MailTransport {
  sendMail(msg: { from: string; to: string; subject: string; text: string; html?: string }): Promise<{ accepted?: unknown[]; rejected?: unknown[] }>;
}

export interface Mailer {
  /** Sends if mail is configured; returns true when a send was attempted and accepted, false (no-op or failed send) otherwise. */
  send(msg: MailMessage): Promise<boolean>;
  readonly enabled: boolean;
}

/** Builds a real nodemailer transport — imported lazily so nodemailer stays an OPTIONAL dependency. */
async function defaultTransportFactory(smtp: SmtpMailConfig): Promise<MailTransport> {
  const nodemailer = await import('nodemailer');
  return nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.port === 465,
    auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
  }) as unknown as MailTransport;
}

async function sendViaSmtp(
  smtp: SmtpMailConfig,
  msg: MailMessage,
  transportFactory: (smtp: SmtpMailConfig) => MailTransport | Promise<MailTransport>,
): Promise<boolean> {
  const transport = await transportFactory(smtp);
  const info = await transport.sendMail({ from: smtp.from, to: msg.to, subject: msg.subject, text: msg.text, html: msg.html });
  if (info.rejected?.length) {
    console.error('[mailer] smtp send rejected recipients:', info.rejected);
    return false;
  }
  return true;
}

async function sendViaResend(
  apiKey: string,
  from: string,
  msg: MailMessage,
  resendFetch: typeof fetch,
): Promise<boolean> {
  const res = await resendFetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to: msg.to, subject: msg.subject, text: msg.text, html: msg.html }),
  });
  if (!res.ok) {
    console.error('[mailer] resend send failed:', res.status, await res.json().catch(() => undefined));
    return false;
  }
  return true;
}

/**
 * Create a Mailer. `mail=null` → a no-op mailer (air-gapped/offline installs:
 * invites are link-only, no send attempted). `transportFactory` is injectable
 * for SMTP tests (and so nodemailer is only imported when actually used);
 * `resendFetch` is injectable for Resend tests (defaults to global `fetch`).
 */
export function createMailer(
  mail: MailConfig | null,
  transportFactory: (smtp: SmtpMailConfig) => MailTransport | Promise<MailTransport> = defaultTransportFactory,
  resendFetch: typeof fetch = fetch,
): Mailer {
  if (!mail) {
    return { enabled: false, async send() { return false; } };
  }
  return {
    enabled: true,
    async send(msg) {
      if (mail.kind === 'resend') {
        return sendViaResend(mail.apiKey, mail.from, msg, resendFetch);
      }
      return sendViaSmtp(mail, msg, transportFactory);
    },
  };
}

/** Build the invite email body. Pure — unit-testable. */
export function inviteEmail(opts: { projectName: string; role: string; url: string }): { subject: string; text: string } {
  return {
    subject: `You're invited to ${opts.projectName} on ProductMap`,
    text: `You've been invited to join "${opts.projectName}" as ${opts.role}.\n\nAccept your invite:\n${opts.url}\n\nThis link expires in 7 days.`,
  };
}
