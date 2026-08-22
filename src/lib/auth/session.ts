import { SignJWT, jwtVerify } from "jose";
import { requireEnv } from "../env";

// "totp" means the password was accepted but the second factor is outstanding.
export type Stage = "totp" | "full";

export const SESSION_COOKIE = "session";

const FULL_TTL = "7d";
const PENDING_TTL = "5m";

function key() {
  return new TextEncoder().encode(requireEnv("SESSION_SECRET"));
}

export function signSession(userId: string, stage: Stage) {
  return new SignJWT({ stage })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(stage === "full" ? FULL_TTL : PENDING_TTL)
    .sign(key());
}

export async function readSession(token: string | undefined) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    if (!payload.sub) return null;
    return { sub: payload.sub, stage: (payload.stage as Stage) ?? "full" };
  } catch {
    return null;
  }
}

export function cookieOptions(stage: Stage) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: stage === "full" ? 60 * 60 * 24 * 7 : 60 * 5,
  };
}
