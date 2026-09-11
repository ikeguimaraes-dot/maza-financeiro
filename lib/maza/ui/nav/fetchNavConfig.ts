import { convertRemoteGroups, type NavConfigResponse, type NavGroup, type RemoteNavGroup } from "./types"

// Config mínimo local — só as rotas de /financeiro que esta zona conhece e
// pode garantir que existem. Usado exclusivamente quando o shell está
// inacessível; a zona nunca fica sem menu, mas também nunca inventa link pra
// outra zona que não pode confirmar.
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
      { href: "/financeiro/aprovacoes", label: "Aprovações", icon: "CheckSquare" },
      { href: "/financeiro/conciliacao", label: "Conciliação", icon: "RefreshCw" },
      { href: "/financeiro/orcamento", label: "Orçamento", icon: "PiggyBank" },
    ],
  },
]

const SHELL_URL_FALLBACK = "https://maza-maza.vercel.app"

function shellBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SHELL_URL?.replace(/\/$/, "")
  if (process.env.NODE_ENV !== "production") return configured || SHELL_URL_FALLBACK
  // Em produção, nunca confiar num shellUrl que aponte pra localhost — nem o
  // configurado no ambiente, nem o que o próprio /api/nav eventualmente
  // devolver (aconteceu em produção: shellUrl vinha "http://localhost:3000").
  if (!configured || /localhost|127\.0\.0\.1/.test(configured)) return SHELL_URL_FALLBACK
  return configured
}

function sanitizeShellUrl(candidate: string | undefined, base: string): string {
  if (!candidate) return base
  // shellUrl vindo do /api/nav é dado de outro ambiente — "localhost" ali
  // nunca é válido pra nós, seja lá em que NODE_ENV estamos rodando (já
  // aconteceu em produção: a resposta trouxe "http://localhost:3000").
  if (/localhost|127\.0\.0\.1/.test(candidate)) return base
  return candidate.replace(/\/$/, "")
}

export type NavConfig = {
  groups: NavGroup[]
  shellUrl: string
  offline: boolean
}

// Server-only — chamado do layout, nunca do client. Cache de 60s via
// `next.revalidate`; se o shell estiver fora do ar, cai no config local sem
// nunca deixar a zona sem menu algum.
export async function fetchNavConfig(): Promise<NavConfig> {
  const base = shellBaseUrl()
  try {
    const res = await fetch(`${base}/api/nav`, { next: { revalidate: 60 } })
    if (!res.ok) throw new Error(`/api/nav respondeu ${res.status}`)
    const data = (await res.json()) as Partial<NavConfigResponse>
    if (!data.groups?.length) throw new Error("/api/nav respondeu sem groups")
    return {
      groups: convertRemoteGroups(data.groups),
      shellUrl: sanitizeShellUrl(data.shellUrl, base),
      offline: false,
    }
  } catch (error) {
    console.error("[nav] Falha ao buscar /api/nav do shell — usando menu local mínimo.", error)
    return {
      groups: convertRemoteGroups(FALLBACK_GROUPS),
      shellUrl: base,
      offline: true,
    }
  }
}
