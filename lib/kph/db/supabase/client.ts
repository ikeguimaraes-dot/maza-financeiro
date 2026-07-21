"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";

/**
 * Cliente Supabase para Client Components — usa cookies do browser
 * compatíveis com a sessão SSR (lida pelo proxy.ts e Server Components).
 *
 * Cookie precisa estar com `Domain=.vercel.app` pra ser compartilhado entre
 * o shell e os sub-apps. Em localhost Domain é ignorado pelo browser.
 *
 * Sem env vars: retorna null. Hooks devem degradar com graça.
 */
export function getBrowserClient(): SupabaseClient<Database> | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  const projectRef = url.match(/\/\/([^.]+)\.supabase\.co/)?.[1] ?? "";
  const storageKey = `sb-${projectRef}-auth-token`;

  const isLocalDev =
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1");
  const sharedDomain = isLocalDev ? undefined : ".vercel.app";

  return createBrowserClient<Database>(url, anonKey, {
    cookieOptions: {
      name: storageKey,
      path: "/",
      domain: sharedDomain,
      sameSite: "lax",
      secure: !isLocalDev,
      maxAge: 60 * 60 * 24 * 400,
    },
  });
}
