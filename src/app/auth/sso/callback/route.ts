import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@kph/db/types/database";

function safeFinancePath(value: string | null): string {
  return value?.startsWith("/financeiro") && !value.startsWith("//")
    ? value
    : "/financeiro";
}

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const next = safeFinancePath(request.nextUrl.searchParams.get("next"));
  const shellUrl =
    process.env.NEXT_PUBLIC_SHELL_URL?.trim() || "https://maza.vercel.app";

  if (!tokenHash) {
    return NextResponse.redirect(new URL("/login?error=missing_code", shellUrl));
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return NextResponse.redirect(
      new URL("/login?error=supabase_unavailable", shellUrl),
    );
  }

  const response = NextResponse.redirect(new URL(next, request.nextUrl.origin));
  const supabase = createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: "magiclink",
  });
  if (error) {
    console.error("[sso callback] token inválido:", error.message);
    return NextResponse.redirect(new URL("/login?error=sso_invalid", shellUrl));
  }

  return response;
}
