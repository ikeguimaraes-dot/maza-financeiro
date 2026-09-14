// Aviso discreto pra quando não há cookie de unidade do shell ainda — a
// tela cai pra primeira unidade ativa em vez de travar. Compartilhado por
// todas as telas que pararam de ter seletor de unidade próprio (a unidade
// é contexto global, definido no seletor do shell).
export function AvisoUnidadeFallback({ cookiePresente }: { cookiePresente: boolean }) {
  if (cookiePresente) return null
  return (
    <p style={{ fontSize: 11, color: "#F59E0B", margin: "0 0 10px" }}>
      Nenhuma unidade selecionada no shell ainda — mostrando a primeira unidade ativa.
    </p>
  )
}
