import { describe, it, expect, vi } from 'vitest';
import { createMailer, type MailTransport } from './mailer';

describe('mailer', () => {
  it('unconfigured (mail=null) → no-op; never attempts to send', async () => {
    const send = vi.fn();
    const mailer = createMailer(null, () => ({ sendMail: send }));
    const sent = await mailer.send({ to: 'a@b.co', subject: 'Hi', text: 'body' });
    expect(sent).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it('smtp configured → calls the injected transport with from/to/subject/text', async () => {
    const send = vi.fn().mockResolvedValue({ messageId: 'x' });
    const transport: MailTransport = { sendMail: send };
    const mailer = createMailer(
      { kind: 'smtp', host: 'h', port: 587, from: 'ProductMap <no-reply@x>' },
      () => transport,
    );
    const sent = await mailer.send({ to: 'a@b.co', subject: 'Invite', text: 'link' });
    expect(sent).toBe(true);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'a@b.co', subject: 'Invite', from: 'ProductMap <no-reply@x>' }),
    );
  });

  it('smtp transport resolves with rejected recipients → send() returns false', async () => {
    const send = vi.fn().mockResolvedValue({ rejected: ['x@y.co'], accepted: [] });
    const transport: MailTransport = { sendMail: send };
    const mailer = createMailer(
      { kind: 'smtp', host: 'h', port: 587, from: 'ProductMap <no-reply@x>' },
      () => transport,
    );
    const sent = await mailer.send({ to: 'x@y.co', subject: 'Invite', text: 'link' });
    expect(sent).toBe(false);
  });

  it('resend configured → POSTs to the Resend API with the right payload and auth header', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: 'abc' }) });
    const mailer = createMailer(
      { kind: 'resend', apiKey: 're_test', from: 'ProductMap <no-reply@x>' },
      undefined,
      fetchMock as unknown as typeof fetch,
    );
    const sent = await mailer.send({ to: 'a@b.co', subject: 'Invite', text: 'link', html: '<p>link</p>' });
    expect(sent).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer re_test',
          'Content-Type': 'application/json',
        }),
      }),
    );
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toEqual({
      from: 'ProductMap <no-reply@x>',
      to: 'a@b.co',
      subject: 'Invite',
      text: 'link',
      html: '<p>link</p>',
    });
  });

  it('resend API returns a non-2xx status → send() returns false', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 422, json: async () => ({ message: 'bad' }) });
    const mailer = createMailer(
      { kind: 'resend', apiKey: 're_test', from: 'ProductMap <no-reply@x>' },
      undefined,
      fetchMock as unknown as typeof fetch,
    );
    const sent = await mailer.send({ to: 'a@b.co', subject: 'Invite', text: 'link' });
    expect(sent).toBe(false);
  });
});
