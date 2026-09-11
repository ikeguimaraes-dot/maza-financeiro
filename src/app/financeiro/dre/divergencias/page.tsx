import Link from "next/link"

import { requireUser } from "@maza/auth/server"
import { competenciaLabel } from "@/lib/financeiro/utils"
import { getDivergenciasContasPagarNotas } from "./actions"
import { DivergenciasPainel } from "@/components/financeiro/divergencias/DivergenciasPainel"

export const dynamic = "force-dynamic"

// Mesmas únicas duas units operacionais do grupo (ver gerar.ts) — uma
// divergência é sempre título↔NF-e de uma unidade específica.
const YOSHIMORI_UNIT_ID = "674eac8c-5a38-4a42-aa60-0a666387909c"
const IKY_UNIT_ID = "674eac8c-5a38-4a42-aa60-0a666387909b"
const UNIDADES = [
  { id: YOSHIMORI_UNIT_ID, nome: "Yoshimori Restaurante" },
  { id: IKY_UNIT_ID, nome: "IKY Delivery" },
] as const

// Período com dado real carregado nesta fase — mesmo range usado em
// scripts/regerar-razao.ts pra todas as validações da FASE 7.
const COMPETENCIAS = ["2026-05-01", "2026-06-01", "2026-07-01", "2026-08-01"] as const

type SearchParams = Promise<{ unidade?: string; competencia?: string }>

export default async function DivergenciasPage({ searchParams }: { searchParams: SearchParams }) {
  await requireUser()
  const sp = await searchParams

  const unitId = sp.unidade && UNIDADES.some((u) => u.id === sp.unidade) ? sp.unidade : UNIDADES[0].id
  const unitName = UNIDADES.find((u) => u.id === unitId)!.nome
  const competencia = sp.competencia && (COMPETENCIAS as readonly string[]).includes(sp.competencia)
    ? sp.competencia
    : COMPETENCIAS[COMPETENCIAS.length - 1]!

  const href = (unidadeVal: string, competenciaVal: string) => {
    const params = new URLSearchParams()
    params.set("unidade", unidadeVal)
    params.set("competencia", competenciaVal)
    return `/financeiro/dre/divergencias?${params.toString()}`
  }
  const linkStyle = (ativo: boolean): React.CSSProperties => ({
    padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: ativo ? 700 : 500,
    textDecoration: "none", whiteSpace: "nowrap",
    background: ativo ? "var(--brand, #C4622D)" : "var(--surface-2)",
    color: ativo ? "var(--primary-foreground)" : "var(--text-3)",
    border: "1px solid var(--border)",
  })

  const dados = await getDivergenciasContasPagarNotas(unitId, unitName, competencia)

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto" }}>
      <nav style={{ display: "flex", gap: 16, marginBottom: 14, fontSize: 13 }}>
        <Link href="/financeiro" style={{ color: "var(--text-3)", textDecoration: "none" }}>Financeiro</Link>
        <span style={{ color: "var(--text-3)" }}>/</span>
        <span style={{ color: "var(--text)", fontWeight: 600 }}>Divergências</span>
      </nav>

      <header style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: "var(--text)", letterSpacing: -0.5, margin: "0 0 4px" }}>
          Divergências · {unitName} · {competenciaLabel(competencia)}
        </h1>
        <p style={{ fontSize: 13, color: "var(--text-2)", maxWidth: 720, margin: "0 0 16px" }}>
          Não escolhemos mais um lado por heurística quando a planilha de contas a pagar e as NF-e
          discordam — esta tela mostra a divergência, não corrige ela. Só leitura; nenhum lançamento
          é alterado aqui.
        </p>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ display: "flex", gap: 6 }}>
            {UNIDADES.map((u) => (
              <Link key={u.id} href={href(u.id, competencia)} style={linkStyle(u.id === unitId)}>{u.nome}</Link>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {COMPETENCIAS.map((c) => (
              <Link key={c} href={href(unitId, c)} style={linkStyle(c === competencia)}>
                {competenciaLabel(c)}
              </Link>
            ))}
          </div>
        </div>
      </header>

      {!dados ? (
        <div style={{ padding: 48, textAlign: "center", background: "var(--surface)",
          border: "1px dashed var(--border)", borderRadius: 14, color: "var(--text-3)", fontSize: 13 }}>
          Erro ao carregar divergências — sem conexão com o banco.
        </div>
      ) : (
        <DivergenciasPainel dados={dados} />
      )}
    </div>
  )
}
