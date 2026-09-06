import { hash, verify } from "@node-rs/argon2";

export function hashPassword(password: string) {
  return hash(password);
}

export async function verifyPassword(stored: string, password: string) {
  try {
    return await verify(stored, password);
  } catch {
    // A malformed hash is a failed login, not a crash.
    return false;
  }
}
