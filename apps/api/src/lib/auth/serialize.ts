import type { UserRow } from '../../middleware/current-user';

export interface PublicUser {
  id: string;
  name: string;
  color: string;
  role: 'admin' | 'member';
}

/** Strip secrets (email, password_hash, token_version) from a user row before it leaves the API. */
export function publicUser(u: UserRow): PublicUser {
  return { id: u.id, name: u.name, color: u.color, role: u.role };
}
