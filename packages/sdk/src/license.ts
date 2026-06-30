// Server-only license verification (Node `crypto`). The public core ships
// VERIFICATION ONLY — never the private signing key or a key generator (those
// live in the private Team-edition repo). Exposed as the `@productmap/sdk/license`
// subpath, NOT re-exported from index.ts, so `node:crypto` never enters the web
// bundle (the sdk barrel is imported by apps/web).
import { verify } from 'node:crypto';
import type { Entitlements, Feature, LimitKey } from './entitlements';

const KNOWN_FEATURES: readonly Feature[] = [
  'ai.copilot',
  'integrations',
  'notifications.delivery',
  'analytics',
];
const LIMIT_KEYS: readonly LimitKey[] = ['projects', 'members', 'seats'];

/** Serializable form of {@link Entitlements} — the payload that gets signed. */
export interface License {
  features: Feature[];
  limits: Record<LimitKey, number>; // -1 = unlimited
  expiresAt: number | null; // epoch ms, null = never
}

function isLicenseShape(v: unknown): v is License {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  if (!Array.isArray(o.features)) return false;
  if (typeof o.limits !== 'object' || o.limits === null) return false;
  if (!(o.expiresAt === null || typeof o.expiresAt === 'number')) return false;
  const limits = o.limits as Record<string, unknown>;
  return LIMIT_KEYS.every((k) => typeof limits[k] === 'number');
}

/**
 * Verify a signed license token and return its entitlements, or `null` if the
 * token is malformed, the Ed25519 signature does not verify against
 * `publicKeyPem`, or the license has expired. Pure, stateless, never throws.
 *
 *   token        = base64url(JSON License) + "." + base64url(ed25519 signature)
 *   publicKeyPem = SPKI PEM Ed25519 public key (the edition bakes in its own)
 *   now          = injectable clock for testing (default Date.now())
 *
 * The signature is verified over the raw base64url payload SEGMENT bytes (not a
 * re-serialization), so there is no JSON-canonicalization drift between signer
 * and verifier.
 */
export function verifyLicense(
  token: string,
  publicKeyPem: string,
  now: number = Date.now(),
): Entitlements | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [payloadSeg, sigSeg] = parts;
    if (!payloadSeg || !sigSeg) return null;

    const signature = Buffer.from(sigSeg, 'base64url');
    if (!verify(null, Buffer.from(payloadSeg), publicKeyPem, signature)) return null;

    const json: unknown = JSON.parse(Buffer.from(payloadSeg, 'base64url').toString('utf8'));
    if (!isLicenseShape(json)) return null;
    const license = json as License;

    if (license.expiresAt !== null && now >= license.expiresAt) return null;

    // Defensive: keep only known features/limit keys even though the signature
    // is the real gate.
    const features = new Set<Feature>(
      license.features.filter((f): f is Feature => KNOWN_FEATURES.includes(f)),
    );
    const limits = {} as Record<LimitKey, number>;
    for (const k of LIMIT_KEYS) limits[k] = license.limits[k];

    return { features, limits, expiresAt: license.expiresAt };
  } catch {
    return null;
  }
}
