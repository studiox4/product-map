// @node-rs/argon2 is a native node addon — loaded lazily so importing the Hono
// `app` graph stays browser-safe. Only register/login/change-password call these.

// argon2id with library defaults (sane memory/time cost). Tune only with evidence.
export async function hashPassword(plain: string): Promise<string> {
  const { hash } = await import('@node-rs/argon2');
  return hash(plain);
}

export async function verifyPassword(storedHash: string, plain: string): Promise<boolean> {
  try {
    const { verify } = await import('@node-rs/argon2');
    return await verify(storedHash, plain);
  } catch {
    // Malformed/empty hash (e.g. OAuth-only or never-set accounts) → not a match.
    return false;
  }
}
