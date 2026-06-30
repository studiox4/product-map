import { describe, it, expect } from 'vitest';
import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import { verifyLicense, type License } from './license';

// The public package ships NO signer — this test-only helper mints tokens the
// way the private edition's signing CLI will, so we can exercise verifyLicense.
function signLicense(license: License, privateKey: KeyObject): string {
  const payload = Buffer.from(JSON.stringify(license)).toString('base64url');
  const signature = sign(null, Buffer.from(payload), privateKey).toString('base64url');
  return `${payload}.${signature}`;
}

const keypair = () => generateKeyPairSync('ed25519');
const pem = (k: KeyObject) => k.export({ type: 'spki', format: 'pem' }).toString();

const LIC: License = {
  features: ['analytics', 'ai.copilot'],
  limits: { projects: -1, members: -1, seats: 50 },
  expiresAt: null,
};

describe('verifyLicense', () => {
  it('returns the entitlements for a validly-signed token', () => {
    const { publicKey, privateKey } = keypair();
    const ent = verifyLicense(signLicense(LIC, privateKey), pem(publicKey));
    expect(ent).not.toBeNull();
    expect([...ent!.features].sort()).toEqual(['ai.copilot', 'analytics']);
    expect(ent!.limits).toEqual({ projects: -1, members: -1, seats: 50 });
    expect(ent!.expiresAt).toBeNull();
  });

  it('returns null when the signature was made by a different key', () => {
    const { privateKey } = keypair();
    const { publicKey: otherPub } = keypair();
    expect(verifyLicense(signLicense(LIC, privateKey), pem(otherPub))).toBeNull();
  });

  it('returns null when the payload is tampered after signing', () => {
    const { publicKey, privateKey } = keypair();
    const token = signLicense(LIC, privateKey);
    const [payload, sig] = token.split('.');
    const forged = { ...LIC, limits: { ...LIC.limits, seats: 9999 } };
    const tamperedPayload = Buffer.from(JSON.stringify(forged)).toString('base64url');
    expect(verifyLicense(`${tamperedPayload}.${sig}`, pem(publicKey))).toBeNull();
    expect(payload).not.toBe(tamperedPayload);
  });

  it('returns null (never throws) for malformed tokens', () => {
    const { publicKey } = keypair();
    const p = pem(publicKey);
    expect(verifyLicense('', p)).toBeNull();
    expect(verifyLicense('no-dot-here', p)).toBeNull();
    expect(verifyLicense('!!!.@@@', p)).toBeNull();
    expect(verifyLicense('a.b.c', p)).toBeNull();
    const notJson = Buffer.from('hello').toString('base64url');
    expect(verifyLicense(`${notJson}.${notJson}`, p)).toBeNull();
  });

  it('honors expiry via the injected clock', () => {
    const { publicKey, privateKey } = keypair();
    const expiring: License = { ...LIC, expiresAt: 1_000 };
    const token = signLicense(expiring, privateKey);
    expect(verifyLicense(token, pem(publicKey), 999)).not.toBeNull(); // before expiry
    expect(verifyLicense(token, pem(publicKey), 1_000)).toBeNull(); // at expiry
    expect(verifyLicense(token, pem(publicKey), 2_000)).toBeNull(); // after expiry
  });

  it('drops unknown feature strings from the returned set', () => {
    const { publicKey, privateKey } = keypair();
    const sneaky = { ...LIC, features: ['analytics', 'totally.made.up'] } as unknown as License;
    const ent = verifyLicense(signLicense(sneaky, privateKey), pem(publicKey));
    expect(ent).not.toBeNull();
    expect([...ent!.features]).toEqual(['analytics']);
  });
});
