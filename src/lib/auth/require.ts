import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { currentVersion } from "./revoke";
import { SESSION_COOKIE, readSession } from "./session";

// The proxy redirect is optimistic. This is the check that actually guards
// data, so every page and action that touches mail calls it.
export async function requireUser() {
  const session = await readSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (session?.stage !== "full") redirect("/login");

  // A token signed against an older version was issued before a logout, a
  // password change, or a TOTP re-enrolment.
  const version = await currentVersion(session.sub);
  if (version === null || version !== session.version) redirect("/login");

  return session.sub;
}
