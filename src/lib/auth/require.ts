import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { currentVersion } from "./revoke";
import { SESSION_COOKIE, readSession } from "./session";

// The proxy redirect is optimistic. This is the check that actually guards
// data, so everything that reads mail calls it: pages, actions, and the list
// components, which render in slots a layout does not gate.
export async function requireUser() {
  const session = await readSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (session?.stage !== "full") redirect("/login");

  // A token signed against an older version was issued before a logout, a
  // password change, or a TOTP re-enrolment.
  const version = await currentVersion(session.sub);
  if (version === null || version !== session.version) redirect("/login");

  return session.sub;
}

// Same checks without the redirect, for endpoints that should answer with a
// status rather than send a browser to the login page.
export async function currentUser() {
  const session = await readSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (session?.stage !== "full") return null;

  const version = await currentVersion(session.sub);
  if (version === null || version !== session.version) return null;

  return session.sub;
}
