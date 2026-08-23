"use server";

import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createFirstUser, setupAvailable } from "@/lib/auth/setup";
import { SESSION_COOKIE, cookieOptions, signSession } from "@/lib/auth/session";
import { setupToken } from "@/lib/auth/setupToken";

// Compared by value rather than with ===, matching the reconcile endpoint.
function tokenMatches(supplied: string) {
  const a = Buffer.from(supplied);
  const b = Buffer.from(setupToken);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function completeSetup(_: unknown, formData: FormData) {
  if (!(await setupAvailable())) return { error: "Setup has already been completed." };

  if (!tokenMatches(String(formData.get("token") ?? "").trim())) {
    return { error: "That setup token does not match the one in the server logs." };
  }

  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  let userId: string;
  try {
    userId = await createFirstUser(email, password);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not create the account." };
  }

  (await cookies()).set(SESSION_COOKIE, await signSession(userId, "totp"), cookieOptions("totp"));
  redirect("/login/enrol");
}
