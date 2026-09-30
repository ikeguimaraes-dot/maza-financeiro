export function mesAnterior(competencia: string) {
  const ano = Number(competencia.slice(0, 4))
  const mes = Number(competencia.slice(5, 7))
  return new Date(Date.UTC(ano, mes - 2, 1)).toISOString().slice(0, 7)
}
export function variacaoMensal(atual: number | null, anterior: number | null) {
  if (atual === null || anterior === null || anterior === 0) return null
  return (atual / anterior - 1) * 100
}
