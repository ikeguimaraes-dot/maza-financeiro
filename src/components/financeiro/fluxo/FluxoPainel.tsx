import { FluxoPeriodos } from "./FluxoPeriodos";
import type { ResultadoFluxo } from "@/lib/financeiro/fluxo/calcularFluxo"
import { formatBRL } from "@/lib/financeiro/utils"
import { FluxoCalendario } from "./FluxoCalendario"
import { APagarPorFaixa } from "./APagarPorFaixa"
import { AReceberPorForma } from "./AReceberPorForma"
import { ConfiancaIndex } from "./ConfiancaIndex"

type Props = {
  dados: ResultadoFluxo
  temContaCadastrada: boolean
}

export function FluxoPainel({ dados, temContaCadastrada }: Props) {
  return (
    <div>
      {dados.contaId && <p className="maza-panel">Esta visão considera o saldo e os movimentos da conta selecionada. Para ver previsões ainda sem conta bancária definida, selecione todas as contas.</p>}
      <section style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:12,marginBottom:24}}>
        {([
          ['Entradas realizadas', dados.dias.reduce((s,d)=>s+d.entradasRealizadas,0)],
          ['Entradas previstas', dados.dias.reduce((s,d)=>s+d.entradasPrevistas,0)],
          ['Saídas realizadas', dados.dias.reduce((s,d)=>s+d.saidasRealizadas,0)],
          ['Saídas previstas', dados.dias.reduce((s,d)=>s+d.saidasPrevistas,0)],
        ] as const).map(([label,valor])=><div className="maza-panel" style={{padding:20}} key={label}><div style={{color:'var(--text-3)',fontSize:12}}>{label} · mês</div><strong style={{display:'block',fontSize:24,marginTop:8}}>{formatBRL(valor)}</strong></div>)}
      </section>
      {!dados.saldoBaseDisponivel && <p style={{color:'var(--color-warning)'}}>{temContaCadastrada ? "Saldo de abertura indisponível: o período começa antes da data do saldo bancário cadastrado." : "Saldo bancário não cadastrado."} Entradas e saídas estão disponíveis; o saldo inicial é exibido como —. O saldo final projetado da tabela considera apenas entradas previstas menos saídas previstas.</p>}
      <FluxoCalendario dias={dados.dias} hoje={dados.hoje} diaCruzaZero={dados.saldoBaseDisponivel ? dados.resumo.diaCruzaZero : null} saldoDisponivel={dados.saldoBaseDisponivel} />
      <FluxoPeriodos dias={dados.dias} saldoDisponivel={dados.saldoBaseDisponivel} />
      <APagarPorFaixa aPagarPorFaixa={dados.aPagarPorFaixa} aPagarSemData={dados.aPagarSemData} />
      <AReceberPorForma
        aReceberPorForma={dados.aReceberPorForma}
        antecipacaoRegistrada={dados.antecipacaoRegistrada}
        ultimaReceitaImportada={dados.ultimaReceitaImportada}
      />
      <ConfiancaIndex confianca={dados.confianca} />
    </div>
  )
}
