import type { NavConfigResponse, RemoteNavGroup, RemoteNavItem } from "./types"

// Config mínimo local — só as rotas de /financeiro que esta zona conhece e
// pode garantir que existem. Usado exclusivamente quando o shell está
// inacessível; a zona nunca fica sem menu, mas também nunca inventa link pra
// outra zona que não pode confirmar. 100% dado serializável (ícone é string)
// — quem resolve string→componente Lucide é o client (Sidebar), nunca aqui.
const FALLBACK_GROUPS: RemoteNavGroup[] = [
  {
    id: "financeiro",
    label: "Financeiro",
    icon: "Wallet",
    defaultOpen: false,
    habilitado: true,
    items: [
      { href: "/financeiro", label: "Cockpit", icon: "Gauge" },
      { href: "/financeiro/fluxo", label: "Fluxo de Caixa", icon: "ArrowLeftRight" },
      { href: "/financeiro/dre", label: "DRE", icon: "Sheet" },
      { href: "/financeiro/pagar", label: "Contas a Pagar", icon: "CreditCard" },
      { href: "/financeiro/receber", label: "Contas a Receber", icon: "Banknote" },
      { href: "/financeiro/aprovacoes", label: "Conferência", icon: "CheckSquare" },
      { href: "/financeiro/conciliacao", label: "Conciliação", icon: "RefreshCw" },
      { href: "/financeiro/orcamento", label: "Orçamento", icon: "PiggyBank" },
    ],
  },
]

const SHELL_URL_FALLBACK = "https://maza-maza.vercel.app"
const FETCH_TIMEOUT_MS = 3000

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value)
    return u.protocol === "http:" || u.protocol === "https:"
  } catch {
    return false
  }
}

function shellBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SHELL_URL
  const configured = typeof raw === "string" ? raw.trim().replace(/\/$/, "") : ""
  if (!configured) return SHELL_URL_FALLBACK
  if (/localhost|127\.0\.0\.1/.test(configured)) {
    // Localhost configurado só faz sentido em dev local; em produção nunca
    // confiamos nisso (variável mal configurada no ambiente da Vercel).
    return process.env.NODE_ENV === "production" ? SHELL_URL_FALLBACK : configured
  }
  return isHttpUrl(configured) ? configured : SHELL_URL_FALLBACK
}

function sanitizeShellUrl(candidate: unknown, base: string): string {
  // shellUrl vindo do /api/nav é dado de outro ambiente — nunca confiamos
  // cegamente: já aconteceu em produção a resposta trazer
  // "http://localhost:3000". Qualquer formato inesperado cai no base.
  if (typeof candidate !== "string" || !candidate) return base
  if (/localhost|127\.0\.0\.1/.test(candidate)) return base
  const trimmed = candidate.replace(/\/$/, "")
  return isHttpUrl(trimmed) ? trimmed : base
}

// ── Validação de shape — payload inesperado do /api/nav nunca deve chegar
// a JSON.parse-com-fé; se não bater no formato esperado, cai no fallback. ──

function isValidRemoteItem(value: unknown): value is RemoteNavItem {
  if (!value || typeof value !== "object") return false
  const item = value as Record<string, unknown>
  if (typeof item.label !== "string") return false
  if (item.icon !== undefined && typeof item.icon !== "string") return false
  if (item.href !== undefined && typeof item.href !== "string") return false
  if (item.children !== undefined) {
    if (!Array.isArray(item.children)) return false
    return item.children.every(isValidRemoteItem)
  }
  return true
}

function isValidRemoteGroup(value: unknown): value is RemoteNavGroup {
  if (!value || typeof value !== "object") return false
  const group = value as Record<string, unknown>
  if (typeof group.id !== "string") return false
  if (!Array.isArray(group.items)) return false
  return group.items.every(isValidRemoteItem)
}

function isValidNavConfigResponse(data: unknown): data is NavConfigResponse {
  if (!data || typeof data !== "object") return false
  const groups = (data as Record<string, unknown>).groups
  return Array.isArray(groups) && groups.length > 0 && groups.every(isValidRemoteGroup)
}

export type NavConfig = {
  groups: RemoteNavGroup[]
  shellUrl: string
  offline: boolean
}

async function fetchFromShell(base: string): Promise<NavConfig> {
  const res = await fetch(`${base}/api/nav`, {
    next: { revalidate: 60 },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`/api/nav respondeu ${res.status}`)
  const data: unknown = await res.json()
  if (!isValidNavConfigResponse(data)) throw new Error("/api/nav respondeu payload em formato inesperado")
  return {
    groups: data.groups,
    shellUrl: sanitizeShellUrl(data.shellUrl, base),
    offline: false,
  }
}

// Server-only — chamado do layout, nunca do client. Retorna só dado
// serializável (ícone como string) — resolver pra componente Lucide é
// tarefa do client (Sidebar), nunca daqui, senão vira função cruzando a
// fronteira Server→Client Component e o Next quebra com "Functions cannot
// be passed directly to Client Components". Cache de 60s via
// `next.revalidate`; timeout de 3s pra nunca travar o render; qualquer
// falha (rede, timeout, HTTP não-2xx, JSON inválido, shape inesperado) cai
// no config local mínimo — a zona nunca fica sem menu, e essa função nunca
// lança.
export async function fetchNavConfig(): Promise<NavConfig> {
  let base = SHELL_URL_FALLBACK
  try {
    base = shellBaseUrl()
    return await fetchFromShell(base)
  } catch (error) {
    console.error("[nav] Falha ao buscar /api/nav do shell — usando menu local mínimo.", error)
    return { groups: FALLBACK_GROUPS, shellUrl: base, offline: true }
  }
}
