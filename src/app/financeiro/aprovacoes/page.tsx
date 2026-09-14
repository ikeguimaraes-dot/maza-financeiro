import Link from "next/link"

import { requireUser } from "@maza/auth/server"
import { getCurrentUnitComOrigem } from "@maza/auth/unit"
import { competenciaLabel } from "@/lib/financeiro/utils"
import { YOSHIMORI_UNIT_ID } from "@/lib/financeiro/razao/gerar"
import type { UnidadeTag } from "@/lib/financeiro/conferencia/calcularAlertas"
import { getConferencia } from "./actions"
import { ConferenciaPainel } from "@/components/financeiro/conferencia/ConferenciaPainel"
import { AvisoUnidadeFallback } from "@/components/financeiro/AvisoUnidadeFallback"

export const dynamic = "force-dynamic"

// Mesmo range com dado real carregado nesta fase — ver dre/divergencias/page.tsx.
const COMPETENCIAS = ["2026-05-01", "2026-06-01", "2026-07-01", "2026-08-01"] as const

type SearchParams = Promise<{ competencia?: string }>

export default async function AprovacoesPage({ searchParams }: { searchParams: SearchParams }) {
  await requireUser()
  const sp = await searchParams

  // Unidade é contexto global (cookie do shell) — não um seletor local.
  const { unit, cookiePresente } = await getCurrentUnitComOrigem()
  const unitId = unit?.id ?? null
  const unitNome = unit?.name ?? "—"
  const unitTag: UnidadeTag = unitId === YOSHIMORI_UNIT_ID ? "yoshimori" : "iky_delivery"
  const competencia = sp.competencia && (COMPETENCIAS as readonly string[]).includes(sp.competencia)
    ? sp.competencia
    : COMPETENCIAS[COMPETENCIAS.length - 1]!

  const href = (competenciaVal: string) => {
    const params = new URLSearchParams()
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

  const dados = unitId ? await getConferencia(unitId, unitNome, unitTag, competencia) : null

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto" }}>
      <nav style={{ display: "flex", gap: 16, marginBottom: 14, fontSize: 13 }}>
        <Link href="/financeiro" style={{ color: "var(--text-3)", textDecoration: "none" }}>Financeiro</Link>
        <span style={{ color: "var(--text-3)" }}>/</span>
        <span style={{ color: "var(--text)", fontWeight: 600 }}>Conferência</span>
      </nav>

      <header style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: "var(--text)", letterSpacing: -0.5, margin: "0 0 4px" }}>
          Conferência · {unitNome} · {competenciaLabel(competencia)}
        </h1>
        <p style={{ fontSize: 13, color: "var(--text-2)", maxWidth: 720, margin: "0 0 8px" }}>
          Todo alerta abaixo é calculado na hora a partir do dado que já existe — nenhum afirma que
          algo está errado, só que merece conferência. A decisão de conferir ou ignorar é sua; se o
          valor do alerta mudar depois, ele volta a aparecer.
        </p>
        <AvisoUnidadeFallback cookiePresente={cookiePresente} />
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {COMPETENCIAS.map((c) => (
              <Link key={c} href={href(c)} style={linkStyle(c === competencia)}>
                {competenciaLabel(c)}
              </Link>
            ))}
          </div>
        </div>
      </header>

      {!dados || !unitId ? (
        <div style={{ padding: 48, textAlign: "center", background: "var(--surface)",
          border: "1px dashed var(--border)", borderRadius: 14, color: "var(--text-3)", fontSize: 13 }}>
          Erro ao carregar conferência — sem conexão com o banco.
        </div>
      ) : (
        <ConferenciaPainel unitId={unitId} competencia={competencia} ativos={dados.ativos} conferidos={dados.conferidos} />
      )}
    </div>
  )
}
