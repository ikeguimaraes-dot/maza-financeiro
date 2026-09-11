import type { ResultadoFluxo } from "@/lib/financeiro/fluxo/calcularFluxo"
import { CardsResumo } from "./CardsResumo"
import { FluxoCalendario } from "./FluxoCalendario"
import { APagarPorFaixa } from "./APagarPorFaixa"
import { AReceberPorForma } from "./AReceberPorForma"
import { ConfiancaIndex } from "./ConfiancaIndex"

export function FluxoPainel({ dados }: { dados: ResultadoFluxo }) {
  return (
    <div>
      <CardsResumo resumo={dados.resumo} confianca={dados.confianca} />
      <FluxoCalendario dias={dados.dias} hoje={dados.hoje} diaCruzaZero={dados.resumo.diaCruzaZero} />
      <APagarPorFaixa aPagarPorFaixa={dados.aPagarPorFaixa} aPagarSemData={dados.aPagarSemData} />
      <AReceberPorForma aReceberPorForma={dados.aReceberPorForma} antecipacaoRegistrada={dados.antecipacaoRegistrada} />
      <ConfiancaIndex confianca={dados.confianca} />
    </div>
  )
}
