"use server";

import { headers as nextHeaders, cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { recordAttempt, tooManyAttempts } from "@/lib/auth/rateLimit";
import { consumeRecoveryCode } from "@/lib/auth/recovery";
import { SESSION_COOKIE, cookieOptions, readSession, signSession } from "@/lib/auth/session";
import { AlreadyEnrolled, confirmEnrolment, startEnrolment, verifyCode } from "@/lib/auth/totp";
import { record } from "@/lib/auth/audit";
import { currentVersion, revokeSessions } from "@/lib/auth/revoke";
import { issueRecoveryCodes } from "@/lib/auth/recovery";

// Verifying a throwaway hash keeps the timing of an unknown email the same as
// a wrong password, so the form cannot be used to enumerate accounts.
const DECOY = hashPassword("decoy");

// x-forwarded-for is attacker-controlled unless a proxy in front rewrites it,
// and one client rotating the header defeats the IP half of the rate limit.
// Operators opt in once they have that proxy.
async function clientIp() {
  if (process.env.TRUST_PROXY !== "true") return "direct";
  const headers = await nextHeaders();
  return headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() ?? "unknown";
}

function totpRequired() {
  return process.env.REQUIRE_TOTP !== "false";
}

export async function signIn(_: unknown, formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const ip = await clientIp();

  if (await tooManyAttempts(email, ip)) {
    await record("login.blocked", { actor: email, ip });
    return { error: "Too many attempts. Wait a few minutes and try again." };
  }

  const [user] = await db.select().from(users).where(eq(users.email, email));
  const ok = user
    ? await verifyPassword(user.passwordHash, password)
    : (await verifyPassword(await DECOY, password), false);

  await recordAttempt(email, ip, ok);
  if (!ok || !user) {
    await record("login.failure", { actor: email, ip });
    return { error: "Those details did not match." };
  }
  await record("login.success", { actor: email, ip });

  const enrolled = Boolean(user.totpConfirmedAt);
  const stage = enrolled || totpRequired() ? "totp" : "full";

  const version = (await currentVersion(user.id)) ?? 0;
  (await cookies()).set(
    SESSION_COOKIE,
    await signSession(user.id, stage, version),
    cookieOptions(stage),
  );

  if (!enrolled && totpRequired()) redirect("/login/enrol");
  if (!enrolled) redirect("/");
  redirect("/login/code");
}

export async function submitCode(_: unknown, formData: FormData) {
  const session = await readSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) redirect("/login");

  const code = String(formData.get("code") ?? "").trim();
  const ip = await clientIp();

  if (await tooManyAttempts(session.sub, ip)) {
    return { error: "Too many attempts. Wait a few minutes and try again." };
  }

  const byCode = await verifyCode(session.sub, code);
  const byRecovery = byCode ? false : await consumeRecoveryCode(session.sub, code);
  const ok = byCode || byRecovery;

  await recordAttempt(session.sub, ip, ok);
  if (!ok) {
    await record("login.failure", { actor: session.sub, ip, detail: { stage: "totp" } });
    return { error: "That code did not match." };
  }
  await record(byRecovery ? "recovery.used" : "totp.verified", { actor: session.sub, ip });

  (await cookies()).set(
    SESSION_COOKIE,
    await signSession(session.sub, "full", session.version),
    cookieOptions("full"),
  );
  redirect("/");
}

export async function beginEnrolment() {
  const session = await readSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) redirect("/login");

  try {
    return await startEnrolment(session.sub);
  } catch (error) {
    // Someone holding only the password reached the enrolment screen for an
    // account that already has a second factor. Send them back to the code.
    if (error instanceof AlreadyEnrolled) redirect("/login/code");
    throw error;
  }
}

export async function completeEnrolment(_: unknown, formData: FormData) {
  const session = await readSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) redirect("/login");

  const code = String(formData.get("code") ?? "").trim();
  const ip = await clientIp();

  // Guessing a six digit code is guessing a six digit code, whether it is
  // being confirmed for the first time or checked at login.
  if (await tooManyAttempts(session.sub, ip)) {
    return { error: "Too many attempts. Wait a few minutes and try again." };
  }

  const ok = await confirmEnrolment(session.sub, code);
  await recordAttempt(session.sub, ip, ok);
  if (!ok) {
    return { error: "That code did not match. Check your authenticator and try again." };
  }

  const codes = await issueRecoveryCodes(session.sub);
  await record("totp.enrolled", { actor: session.sub });

  // Enrolling a factor ends every session issued before it.
  const version = await revokeSessions(session.sub);
  (await cookies()).set(
    SESSION_COOKIE,
    await signSession(session.sub, "full", version),
    cookieOptions("full"),
  );

  return { codes };
}
