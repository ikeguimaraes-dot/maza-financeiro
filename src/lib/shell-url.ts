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
 * Monta a URL completa de login do shell, com ?redirect=<returnTo>.
 *
 * @param returnTo URL absoluta pra onde o user deve voltar após logar.
 *                 Em geral é a URL atual da request (request.url).
 *
 * @example
 *   getShellLoginUrl("http://localhost:3001/financeiro")
 *   // → http://localhost:3000/login?redirect=http%3A%2F%2Flocalhost%3A3001%2Ffinanceiro
 *
 *   getShellLoginUrl("https://kph-os-financeiro.vercel.app/financeiro")
 *   // → https://kph-os.vercel.app/login?redirect=https%3A%2F%2Fkph-os-financeiro.vercel.app%2Ffinanceiro
 */
export function getShellLoginUrl(returnTo: string): URL {
  const base = getShellBaseUrl();
  const url = new URL("/login", base);
  url.searchParams.set("redirect", returnTo);
  return url;
}

/**
 * Retorna só a base do shell (sem path). Útil pra montar redirects absolutos
 * em outros lugares (ex: links no header, deep-links).
 */
export function getShellBase(): string {
  return getShellBaseUrl();
}
