import Link from "next/link"

import { requireUser } from "@maza/auth/server"
import { getFluxoCaixa, getContasBancarias } from "./actions"
import { FluxoPainel } from "@/components/financeiro/fluxo/FluxoPainel"
import { ContasBancariasPainel } from "@/components/financeiro/fluxo/ContasBancariasPainel"

export const dynamic = "force-dynamic"

// Mesmas duas units operacionais do grupo usadas em dre/divergencias.
const YOSHIMORI_UNIT_ID = "674eac8c-5a38-4a42-aa60-0a666387909c"
const IKY_UNIT_ID = "674eac8c-5a38-4a42-aa60-0a666387909b"
const UNIDADES = [
  { id: YOSHIMORI_UNIT_ID, nome: "Yoshimori Restaurante" },
  { id: IKY_UNIT_ID, nome: "IKY Delivery" },
] as const

const PERIODOS = [30, 60, 90] as const

function hojeIso(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date()).reduce<Record<string, string>>((acc, p) => {
    if (p.type !== "literal") acc[p.type] = p.value
    return acc
  }, {})
  return `${parts.year}-${parts.month}-${parts.day}`
}

function somarDias(dataIso: string, dias: number): string {
  const d = new Date(`${dataIso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

type SearchParams = Promise<{ unidade?: string; conta?: string; dias?: string }>

export default async function FluxoCaixaPage({ searchParams }: { searchParams: SearchParams }) {
  await requireUser()
  const sp = await searchParams

  const unitId = sp.unidade && UNIDADES.some((u) => u.id === sp.unidade) ? sp.unidade : UNIDADES[0].id
  const unitName = UNIDADES.find((u) => u.id === unitId)!.nome

  const periodoDias = sp.dias && (PERIODOS as readonly number[]).includes(Number(sp.dias)) ? Number(sp.dias) : 90
  const dataInicio = hojeIso()
  const dataFim = somarDias(dataInicio, periodoDias)

  const contas = await getContasBancarias(unitId)
  const contaId = sp.conta && contas.some((c) => c.id === sp.conta) ? sp.conta : null

  const dados = await getFluxoCaixa(unitId, contaId, dataInicio, dataFim)

  const href = (unidadeVal: string, contaVal: string | null, diasVal: number) => {
    const params = new URLSearchParams()
    params.set("unidade", unidadeVal)
    if (contaVal) params.set("conta", contaVal)
    params.set("dias", String(diasVal))
    return `/financeiro/fluxo?${params.toString()}`
  }
  const linkStyle = (ativo: boolean): React.CSSProperties => ({
    padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: ativo ? 700 : 500,
    textDecoration: "none", whiteSpace: "nowrap",
    background: ativo ? "var(--brand, #C4622D)" : "var(--surface-2)",
    color: ativo ? "var(--primary-foreground)" : "var(--text-3)",
    border: "1px solid var(--border)",
  })

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto" }}>
      <nav style={{ display: "flex", gap: 16, marginBottom: 14, fontSize: 13 }}>
        <Link href="/financeiro" style={{ color: "var(--text-3)", textDecoration: "none" }}>Financeiro</Link>
        <span style={{ color: "var(--text-3)" }}>/</span>
        <span style={{ color: "var(--text)", fontWeight: 600 }}>Fluxo de Caixa</span>
      </nav>

      <header style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: "var(--text)", letterSpacing: -0.5, margin: "0 0 4px" }}>
          Fluxo de Caixa · {unitName}
        </h1>
        <p style={{ fontSize: 13, color: "var(--text-2)", maxWidth: 720, margin: "0 0 16px" }}>
          Desembolso, não competência — lê vencimento de título, prazo de recebimento por forma de
          pagamento e extrato bancário (quando importado). Não reaproveita lançamentos do razão.
        </p>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ display: "flex", gap: 6 }}>
            {UNIDADES.map((u) => (
              <Link key={u.id} href={href(u.id, contaId, periodoDias)} style={linkStyle(u.id === unitId)}>{u.nome}</Link>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <Link href={href(unitId, null, periodoDias)} style={linkStyle(contaId === null)}>Todas as contas</Link>
            {contas.map((c) => (
              <Link key={c.id} href={href(unitId, c.id, periodoDias)} style={linkStyle(c.id === contaId)}>
                {c.apelido ?? c.banco}
              </Link>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {PERIODOS.map((d) => (
              <Link key={d} href={href(unitId, contaId, d)} style={linkStyle(d === periodoDias)}>{d} dias</Link>
            ))}
          </div>
        </div>
      </header>

      <ContasBancariasPainel unitId={unitId} contas={contas} />

      {!dados ? (
        <div style={{ padding: 48, textAlign: "center", background: "var(--surface)",
          border: "1px dashed var(--border)", borderRadius: 14, color: "var(--text-3)", fontSize: 13 }}>
          Erro ao carregar fluxo de caixa — sem conexão com o banco.
        </div>
      ) : (
        <FluxoPainel dados={dados} temContaCadastrada={contas.length > 0} />
      )}
    </div>
  )
}
