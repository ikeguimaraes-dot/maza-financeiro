import { type NextRequest, NextResponse } from "next/server";
import { getShellLoginUrl } from "./lib/shell-url";

/**
 * Middleware do sub-app financeiro — gate paralelo ao shell.
 *
 * Por que existe: o rewrite do shell (`/financeiro/*` →
 * `https://kph-os-financeiro.vercel.app/financeiro/*`) é server-side.
 * Se o user digita `kph-os-financeiro.vercel.app/financeiro` DIRETO na barra
 * de endereço, o shell nunca vê essa request. Este middleware cobre esse caso.
 *
 * Fluxo:
 *   1. User acessa kph-os-financeiro.vercel.app sem cookie
 *   2. Middleware detecta ausência de sb-*-auth-token
 *   3. 302 → <SHELL_URL>/login?next=/financeiro/...
 *   4. Shell autentica e volta para a rota canônica no próprio shell
 *
 * Quando o shell for o portão (acesso via kph-os.vercel.app/financeiro), o
 * rewrite preserva o cookie do shell automaticamente — middleware do sub-app
 * só roda de fato no acesso direto.
 *
 * IMPORTANTE: este middleware deve ficar IDÊNTICO em todos os 8 sub-apps.
 * Mudanças aqui precisam ser replicadas (ou extraídas pra packages/middleware).
 *
 * ENV: NEXT_PUBLIC_SHELL_URL controla pra onde redirecionamos. Em dev use
 *      http://localhost:3000; em prod use https://kph-os.vercel.app. Veja
 *      .env.example.
 */

export function middleware(request: NextRequest) {
  // O callback precisa rodar antes de existir um cookie neste sub-app.
  if (request.nextUrl.pathname === "/auth/sso/callback") {
    return NextResponse.next();
  }

  // Verifica se tem cookie de auth do Supabase
  const hasSession = request.cookies
    .getAll()
    .some((c) => c.name.includes("auth-token") && c.value.length > 0);

  if (process.env.NEXT_PUBLIC_SHELL_URL?.includes("localhost")) {
    console.info("[finance-auth-boundary]", {
      pathname: request.nextUrl.pathname,
      cookieNames: request.cookies.getAll().map((cookie) => cookie.name),
      hasSession,
      forwardedHost: request.headers.get("x-forwarded-host"),
      host: request.headers.get("host"),
    });
  }

  if (hasSession) {
    return NextResponse.next();
  }

  // Sem sessão → redirect pro login central
  // Sempre retorna pela URL canônica do shell. Cookies de projetos distintos
  // em *.vercel.app não podem ser compartilhados entre si.
  const returnTo = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  const url = getShellLoginUrl(returnTo);
  return NextResponse.redirect(url, 302);
}

export const config = {
  // Aplica em todas as rotas EXCETO:
  // - _next/* (assets internos do Next)
  // - api/auth/* (rotas de auth que precisam rodar sem cookie, ex: callback)
  // - arquivos com extensão (imagens, fonts, etc)
  matcher: ["/((?!_next/|api/auth/|.*\\..*).*)"],
};
