import { describe, it, expect, vi } from 'vitest';
import { createMailer, type MailTransport } from './mailer';

describe('mailer', () => {
  it('unconfigured (smtp=null) → no-op; never attempts to send', async () => {
    const send = vi.fn();
    const mailer = createMailer(null, () => ({ sendMail: send }));
    const sent = await mailer.send({ to: 'a@b.co', subject: 'Hi', text: 'body' });
    expect(sent).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it('configured → calls the injected transport with from/to/subject/text', async () => {
    const send = vi.fn().mockResolvedValue({ messageId: 'x' });
    const transport: MailTransport = { sendMail: send };
    const mailer = createMailer(
      { host: 'h', port: 587, from: 'ProductMap <no-reply@x>' },
      () => transport,
    );
    const sent = await mailer.send({ to: 'a@b.co', subject: 'Invite', text: 'link' });
    expect(sent).toBe(true);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'a@b.co', subject: 'Invite', from: 'ProductMap <no-reply@x>' }),
    );
  });
});
