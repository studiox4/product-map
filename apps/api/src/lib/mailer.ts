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
  /** Sends if mail is configured; resolves true when a send was attempted and accepted, false otherwise (no-op, rejected recipients, non-2xx response, timeout, or any thrown transport error — send() never rejects). */
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
  try {
    const transport = await transportFactory(smtp);
    const info = await transport.sendMail({ from: smtp.from, to: msg.to, subject: msg.subject, text: msg.text, html: msg.html });
    if (info.rejected?.length) {
      console.error('[mailer] smtp send rejected recipients:', info.rejected);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[mailer] smtp send threw:', err);
    return false;
  }
}

async function sendViaResend(
  apiKey: string,
  from: string,
  msg: MailMessage,
  resendFetch: typeof fetch,
): Promise<boolean> {
  try {
    const res = await resendFetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to: msg.to, subject: msg.subject, text: msg.text, html: msg.html }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.error('[mailer] resend send failed:', res.status, await res.json().catch(() => undefined));
      return false;
    }
    return true;
  } catch (err) {
    console.error('[mailer] resend send threw:', err);
    return false;
  }
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
      switch (mail.kind) {
        case 'resend':
          return sendViaResend(mail.apiKey, mail.from, msg, resendFetch);
        case 'smtp':
          return sendViaSmtp(mail, msg, transportFactory);
        default: {
          const _exhaustive: never = mail;
          throw new Error(`Unhandled mail kind: ${(_exhaustive as MailConfig).kind}`);
        }
      }
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
