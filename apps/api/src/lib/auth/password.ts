import { hash, verify } from '@node-rs/argon2';

// argon2id with library defaults (sane memory/time cost). Tune only with evidence.
export function hashPassword(plain: string): Promise<string> {
  return hash(plain);
}

export async function verifyPassword(storedHash: string, plain: string): Promise<boolean> {
  try {
    return await verify(storedHash, plain);
  } catch {
    // Malformed/empty hash (e.g. OAuth-only or never-set accounts) → not a match.
    return false;
  }
}
