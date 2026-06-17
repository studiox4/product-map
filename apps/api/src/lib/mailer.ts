import type { SmtpConfig } from '../config';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/** Minimal transport contract — nodemailer's Transporter satisfies this structurally. */
export interface MailTransport {
  sendMail(msg: { from: string; to: string; subject: string; text: string; html?: string }): Promise<unknown>;
}

export interface Mailer {
  /** Sends if SMTP is configured; returns true when a send was attempted, false (no-op) otherwise. */
  send(msg: MailMessage): Promise<boolean>;
  readonly enabled: boolean;
}

/** Builds a real nodemailer transport — imported lazily so nodemailer stays an OPTIONAL dependency. */
async function defaultTransportFactory(smtp: SmtpConfig): Promise<MailTransport> {
  const nodemailer = await import('nodemailer');
  return nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.port === 465,
    auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
  }) as unknown as MailTransport;
}

/**
 * Create a Mailer. `smtp=null` → a no-op mailer (air-gapped/offline installs:
 * invites are link-only, no send attempted). `transportFactory` is injectable
 * for tests (and so nodemailer is only imported when actually configured).
 */
export function createMailer(
  smtp: SmtpConfig | null,
  transportFactory: (smtp: SmtpConfig) => MailTransport | Promise<MailTransport> = defaultTransportFactory,
): Mailer {
  if (!smtp) {
    return { enabled: false, async send() { return false; } };
  }
  return {
    enabled: true,
    async send(msg) {
      const transport = await transportFactory(smtp);
      await transport.sendMail({ from: smtp.from, to: msg.to, subject: msg.subject, text: msg.text, html: msg.html });
      return true;
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
