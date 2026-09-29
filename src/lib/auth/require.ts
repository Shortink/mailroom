import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { normalizeAddress } from "../mail/identity";
import { reachesAddress } from "../mail/reach";
import { currentVersion } from "./revoke";
import { SESSION_COOKIE, readSession } from "./session";
import { VIEW_COOKIE, loadViewer } from "./viewer";

// Without the redirect, for endpoints that should answer with a status rather
// than send a browser to the login page. Uncached, for the one action that
// changes the view cookie and must not leave a stale viewer for the render.
export async function readViewer() {
  const jar = await cookies();
  const session = await readSession(jar.get(SESSION_COOKIE)?.value);
  if (session?.stage !== "full") return null;

  // A token signed against an older version was issued before a logout, a
  // password change, or a TOTP re-enrolment. A removed user has no version.
  const version = await currentVersion(session.sub);
  if (version === null || version !== session.version) return null;

  return loadViewer(session.sub, jar.get(VIEW_COOKIE)?.value);
}

// The layout and every parallel slot ask, so one lookup serves the request.
export const currentViewer = cache(readViewer);

// The proxy redirect is optimistic. This is the check that actually guards
// data, so everything that reads mail calls it: pages, actions, and the list
// components, which render in slots a layout does not gate.
export const requireViewer = cache(async () => (await currentViewer()) ?? redirect("/login"));

export async function requireOwner() {
  const viewer = await requireViewer();
  if (viewer.role !== "owner") notFound();
  return viewer;
}

// An address taken from a URL. Lowercased before the check, so a change of
// case cannot reach a row the check never looked at.
export async function requireAddress(raw: string, within: "allowed" | "view") {
  const viewer = await requireViewer();
  const address = normalizeAddress(decodeURIComponent(raw));
  if (!(await reachesAddress(viewer[within], address))) notFound();
  return { viewer, address };
}
