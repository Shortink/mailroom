import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, readSession } from "@/lib/auth/session";

// This is an optimistic check only. Next runs proxy on prefetches too, so it
// reads the cookie and nothing else; real authorization lives in the data
// layer via requireUser.
//
// Each of these routes authenticates itself: the webhook by Svix signature,
// the inbound route by bearer token, attachments by session or signed link,
// the task endpoint by bearer token, and the auth routes by definition.
const PUBLIC = ["/api/webhooks/", "/api/inbound/", "/api/tasks/", "/api/attachments/", "/login", "/setup", "/invite/"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC.some((prefix) => pathname.startsWith(prefix))) return NextResponse.next();

  const session = await readSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (session?.stage === "full") return NextResponse.next();

  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
