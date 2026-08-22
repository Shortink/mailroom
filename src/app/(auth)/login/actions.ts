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
import { confirmEnrolment, startEnrolment, verifyCode } from "@/lib/auth/totp";
import { issueRecoveryCodes } from "@/lib/auth/recovery";

// Verifying a throwaway hash keeps the timing of an unknown email the same as
// a wrong password, so the form cannot be used to enumerate accounts.
const DECOY = hashPassword("decoy");

async function clientIp() {
  const headers = await nextHeaders();
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

function totpRequired() {
  return process.env.REQUIRE_TOTP !== "false";
}

export async function signIn(_: unknown, formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const ip = await clientIp();

  if (await tooManyAttempts(email, ip)) {
    return { error: "Too many attempts. Wait a few minutes and try again." };
  }

  const [user] = await db.select().from(users).where(eq(users.email, email));
  const ok = user
    ? await verifyPassword(user.passwordHash, password)
    : (await verifyPassword(await DECOY, password), false);

  await recordAttempt(email, ip, ok);
  if (!ok || !user) return { error: "Those details did not match." };

  const enrolled = Boolean(user.totpConfirmedAt);
  const stage = enrolled || totpRequired() ? "totp" : "full";

  (await cookies()).set(SESSION_COOKIE, await signSession(user.id, stage), cookieOptions(stage));

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

  const ok =
    (await verifyCode(session.sub, code)) || (await consumeRecoveryCode(session.sub, code));
  await recordAttempt(session.sub, ip, ok);
  if (!ok) return { error: "That code did not match." };

  (await cookies()).set(SESSION_COOKIE, await signSession(session.sub, "full"), cookieOptions("full"));
  redirect("/");
}

export async function beginEnrolment() {
  const session = await readSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) redirect("/login");
  return startEnrolment(session.sub);
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
  (await cookies()).set(SESSION_COOKIE, await signSession(session.sub, "full"), cookieOptions("full"));

  return { codes };
}
