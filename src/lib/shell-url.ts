import "server-only";

/**
 * Resolve a URL do shell baseado em variáveis de ambiente.
 *
 * Comportamento:
 *   - Se NEXT_PUBLIC_SHELL_URL estiver setada (dev/preview), usa ela.
 *   - Caso contrário, fallback pra produção (https://kph-os.vercel.app).
 *
 * Em Edge runtime (middleware), `process.env` está disponível mas NÃO use
 * `node:*` APIs. Este helper usa apenas `process.env` (Web API compatível).
 *
 * IMPORTANTE: este helper existe em todos os 8 sub-apps com a mesma lógica.
 *             Quando estabilizar, extrair pra packages/core/src/shell-url.ts
 *             e reexportar daqui. Por ora, duplicação consciente.
 */

const PRODUCTION_SHELL_URL = "https://kph-os.vercel.app";

function getShellBaseUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SHELL_URL?.trim();
  if (fromEnv && fromEnv.length > 0) return fromEnv;
  return PRODUCTION_SHELL_URL;
}

/**
 * Monta a URL completa de login do shell, com ?next=<returnTo>.
 *
 * @param returnTo Path do shell para onde o user deve voltar após logar.
 *
 * @example
 *   getShellLoginUrl("/financeiro")
 *   // → http://localhost:3000/login?next=%2Ffinanceiro
 *
 *   getShellLoginUrl("/financeiro/fluxo")
 *   // → https://kph-os.vercel.app/login?next=%2Ffinanceiro%2Ffluxo
 */
export function getShellLoginUrl(returnTo: string): URL {
  const base = getShellBaseUrl();
  const url = new URL("/login", base);
  const safeReturnTo =
    returnTo.startsWith("/") && !returnTo.startsWith("//")
      ? returnTo
      : "/financeiro";
  url.searchParams.set("next", safeReturnTo);
  return url;
}

/**
 * Retorna só a base do shell (sem path). Útil pra montar redirects absolutos
 * em outros lugares (ex: links no header, deep-links).
 */
export function getShellBase(): string {
  return getShellBaseUrl();
}
