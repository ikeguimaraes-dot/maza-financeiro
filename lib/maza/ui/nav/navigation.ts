/** Only routes owned by this Next app may use its client-side router. */
export function isFinanceiroRoute(href: string): boolean {
  const pathname = href.split(/[?#]/, 1)[0];
  return pathname === "/dashboard" || pathname === "/financeiro" || !!pathname?.startsWith("/financeiro/");
}

export function shouldUseFinanceiroRouter(href: string | undefined, pathname: string): boolean {
  return !!href && isFinanceiroRoute(href) && isFinanceiroRoute(pathname);
}
