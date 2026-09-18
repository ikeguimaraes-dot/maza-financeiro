import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@maza/db/supabase/proxy";
import { getShellLoginUrl } from "./lib/shell-url";

export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === "/auth/sso/callback" || request.method === "OPTIONS") return NextResponse.next();
  const { response, user } = await updateSession(request);
  if (user) return response;
  const denied = request.nextUrl.pathname.startsWith("/api/")
    ? NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    : NextResponse.redirect(getShellLoginUrl(`${request.nextUrl.pathname}${request.nextUrl.search}`));
  response.cookies.getAll().forEach(cookie => denied.cookies.set(cookie));
  denied.headers.set("Cache-Control", "private, no-store");
  return denied;
}

export const config = {
  matcher: ["/((?!_next/|financeiro/_next/|favicon.ico).*)"],
};
