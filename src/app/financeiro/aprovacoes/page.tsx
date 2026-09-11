import Link from "next/link"

import { requireUser } from "@maza/auth/server"
import { competenciaLabel } from "@/lib/financeiro/utils"
import { YOSHIMORI_UNIT_ID, IKY_UNIT_ID } from "@/lib/financeiro/razao/gerar"
import type { UnidadeTag } from "@/lib/financeiro/conferencia/calcularAlertas"
import { getConferencia } from "./actions"
import { ConferenciaPainel } from "@/components/financeiro/conferencia/ConferenciaPainel"

export const dynamic = "force-dynamic"

// Mesmas únicas duas units operacionais do grupo (ver gerar.ts).
const UNIDADES = [
  { id: YOSHIMORI_UNIT_ID, nome: "Yoshimori Restaurante", tag: "yoshimori" as UnidadeTag },
  { id: IKY_UNIT_ID, nome: "IKY Delivery", tag: "iky_delivery" as UnidadeTag },
] as const

// Mesmo range com dado real carregado nesta fase — ver dre/divergencias/page.tsx.
const COMPETENCIAS = ["2026-05-01", "2026-06-01", "2026-07-01", "2026-08-01"] as const

type SearchParams = Promise<{ unidade?: string; competencia?: string }>

export default async function AprovacoesPage({ searchParams }: { searchParams: SearchParams }) {
  await requireUser()
  const sp = await searchParams

  const unidade = sp.unidade && UNIDADES.some((u) => u.id === sp.unidade)
    ? UNIDADES.find((u) => u.id === sp.unidade)!
    : UNIDADES[0]
  const competencia = sp.competencia && (COMPETENCIAS as readonly string[]).includes(sp.competencia)
    ? sp.competencia
    : COMPETENCIAS[COMPETENCIAS.length - 1]!

  const href = (unidadeVal: string, competenciaVal: string) => {
    const params = new URLSearchParams()
    params.set("unidade", unidadeVal)
    params.set("competencia", competenciaVal)
    return `/financeiro/aprovacoes?${params.toString()}`
  }
  const linkStyle = (ativo: boolean): React.CSSProperties => ({
    padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: ativo ? 700 : 500,
    textDecoration: "none", whiteSpace: "nowrap",
    background: ativo ? "var(--brand, #C4622D)" : "var(--surface-2)",
    color: ativo ? "var(--primary-foreground)" : "var(--text-3)",
    border: "1px solid var(--border)",
  })

  const dados = await getConferencia(unidade.id, unidade.nome, unidade.tag, competencia)

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto" }}>
      <nav style={{ display: "flex", gap: 16, marginBottom: 14, fontSize: 13 }}>
        <Link href="/financeiro" style={{ color: "var(--text-3)", textDecoration: "none" }}>Financeiro</Link>
        <span style={{ color: "var(--text-3)" }}>/</span>
        <span style={{ color: "var(--text)", fontWeight: 600 }}>Conferência</span>
      </nav>

      <header style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: "var(--text)", letterSpacing: -0.5, margin: "0 0 4px" }}>
          Conferência · {unidade.nome} · {competenciaLabel(competencia)}
        </h1>
        <p style={{ fontSize: 13, color: "var(--text-2)", maxWidth: 720, margin: "0 0 8px" }}>
          Todo alerta abaixo é calculado na hora a partir do dado que já existe — nenhum afirma que
          algo está errado, só que merece conferência. A decisão de conferir ou ignorar é sua; se o
          valor do alerta mudar depois, ele volta a aparecer.
        </p>
        <p style={{ fontSize: 12, color: "var(--text-3)", maxWidth: 720, margin: "0 0 16px" }}>
          Grupos ativos: 1 (Identidade) e 2 (Cobertura). Grupos 3 (Valor fora de faixa) e 4
          (Anomalia) chegam nas próximas entregas.
        </p>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ display: "flex", gap: 6 }}>
            {UNIDADES.map((u) => (
              <Link key={u.id} href={href(u.id, competencia)} style={linkStyle(u.id === unidade.id)}>{u.nome}</Link>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {COMPETENCIAS.map((c) => (
              <Link key={c} href={href(unidade.id, c)} style={linkStyle(c === competencia)}>
                {competenciaLabel(c)}
              </Link>
            ))}
          </div>
        </div>
      </header>

      {!dados ? (
        <div style={{ padding: 48, textAlign: "center", background: "var(--surface)",
          border: "1px dashed var(--border)", borderRadius: 14, color: "var(--text-3)", fontSize: 13 }}>
          Erro ao carregar conferência — sem conexão com o banco.
        </div>
      ) : (
        <ConferenciaPainel unitId={unidade.id} competencia={competencia} ativos={dados.ativos} conferidos={dados.conferidos} />
      )}
    </div>
  )
}
