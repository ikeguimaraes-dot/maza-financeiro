// Parser puro (browser-safe, sem "use client"/"use server") das duas
// planilhas de compras — SheetJS roda no navegador, sem depender de libs
// nativas que falham no runtime da Vercel (mesma razão do NfeImportModal
// com jszip). Só o resultado estruturado sai daqui; quem grava no banco
// são as Server Actions em src/app/financeiro/pagar/compras-actions.ts.
import * as XLSX from "xlsx";
import { normalizarCategoria, CATEGORIAS_MAPEADAS } from "./normalizarCategoria";

const MES_DA_ABA: Record<string, string> = {
  MAIO: "05", JUNHO: "06", JULHO: "07", AGOSTO: "08",
};

export type LinhaCompraParseada = {
  fornecedorNome: string | null;
  dLancamento: string | null; // ISO YYYY-MM-DD
  nNotaFiscal: string | null;
  produtoOriginal: string;
  categoriaNormalizada: string;
  valorTotalNfOrigem: number | null;
  parcela: string | null;
  dVencimento: string | null;
  vTitulo: number;
  liquidacaoOrigem: string | null;
  dCompetencia: string; // ISO, primeiro dia do mês
  ehIkyDelivery: boolean;
};

// Célula Excel com erro (#VALUE! etc.) sobre uma coluna de data: o Python
// (openpyxl, usado na validação do PASSO 1) trata como erro e ignora a
// linha; o SheetJS (usado aqui) não recusa — gera uma data absurda (ano
// 20226, 20260...) a partir do serial corrompido. !isNaN() sozinho não
// pega isso, então limita a uma faixa de ano plausível pro período real
// das planilhas (2026 ± folga).
function isValidDate(v: unknown): v is Date {
  if (!(v instanceof Date) || Number.isNaN(v.getTime())) return false;
  const ano = v.getUTCFullYear();
  return ano >= 2020 && ano <= 2030;
}

function toIsoDate(v: unknown): string | null {
  return isValidDate(v) ? v.toISOString().slice(0, 10) : null;
}

function toNumeroOuNull(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function toTextoOuNull(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") {
    // N.F. NUMERO às vezes vem como float (12345.0) — sem ".0" à toa.
    return Number.isInteger(v) ? String(v) : String(v);
  }
  return String(v).trim() || null;
}

// "IMPOSTOS - IRPJ **IKY DELIVERY**" / "***IKY DELIVERY***" → true.
// "IKY" sozinho (sem DELIVERY) é a IKY RESTAURANTES — a própria Yoshimori,
// não roteia. Ver correção do Ike na FASE 7.
export function contemIkyDelivery(textoOriginal: string): boolean {
  const limpo = textoOriginal.toUpperCase().replace(/\*/g, " ").replace(/\s+/g, " ");
  return limpo.includes("IKY DELIVERY");
}

function abaParaCompetencia(nomeAba: string): string | null {
  const mes = MES_DA_ABA[nomeAba.toUpperCase().trim()];
  return mes ? `2026-${mes}-01` : null;
}

export function parseContasAPagarWorkbook(arrayBuffer: ArrayBuffer): LinhaCompraParseada[] {
  const wb = XLSX.read(arrayBuffer, { type: "array", cellDates: true });
  const linhas: LinhaCompraParseada[] = [];

  for (const nomeAba of wb.SheetNames) {
    const competencia = abaParaCompetencia(nomeAba);
    if (!competencia) continue;
    const ws = wb.Sheets[nomeAba]!;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null });

    for (let i = 1; i < rows.length; i++) {
      const r = rows[i]!;
      const fornecedor = toTextoOuNull(r[0]);
      const vTitulo = toNumeroOuNull(r[7]);
      if (!fornecedor || vTitulo == null) continue; // linha válida = FORNECEDOR + VALOR numérico

      const produtoOriginal = toTextoOuNull(r[3]) ?? "";
      linhas.push({
        fornecedorNome: fornecedor,
        dLancamento: toIsoDate(r[1]), // serial inválido (ex. MAIO!B154) vira null, não quebra
        nNotaFiscal: toTextoOuNull(r[2]),
        produtoOriginal,
        categoriaNormalizada: normalizarCategoria(produtoOriginal, "contas_pagar"),
        valorTotalNfOrigem: toNumeroOuNull(r[4]),
        parcela: toTextoOuNull(r[5]),
        dVencimento: toIsoDate(r[6]),
        vTitulo,
        liquidacaoOrigem: toTextoOuNull(r[8]),
        dCompetencia: competencia,
        ehIkyDelivery: contemIkyDelivery(produtoOriginal),
      });
    }
  }
  return linhas;
}

export function parseNfPedidosWorkbook(arrayBuffer: ArrayBuffer): LinhaCompraParseada[] {
  const wb = XLSX.read(arrayBuffer, { type: "array", cellDates: true });
  const linhas: LinhaCompraParseada[] = [];

  for (const nomeAba of wb.SheetNames) {
    const competencia = abaParaCompetencia(nomeAba);
    if (!competencia) continue;
    const ws = wb.Sheets[nomeAba]!;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null });

    // Seção vigente ("ALIMENTOS - 1ª SEMANA...", "BEBIDAS - 3ª SEMANA...")
    // — usada como fallback quando a categoria da própria linha não bate
    // com nada mapeado (typo, prefixo faltando, abreviação tipo "PROD").
    // Reseta a cada aba; só atualiza quando o texto da linha de seção
    // resolve pra uma categoria conhecida — filtra o cabeçalho repetido
    // ("FORNECEDOR | DATA ENTRADA | ..."), que também tem A preenchida e B
    // não-data mas não é uma seção de verdade.
    let categoriaSecaoAtual: string | undefined;

    for (const r of rows) {
      const colA = r[0];
      const colB = r[1];
      if (colA == null || colA === "") continue;

      if (!isValidDate(colB)) {
        const textoLinha = toTextoOuNull(colA);
        if (textoLinha) {
          const possivelSecao = normalizarCategoria(textoLinha, "nf_pedidos");
          if (CATEGORIAS_MAPEADAS.has(possivelSecao)) categoriaSecaoAtual = possivelSecao;
        }
        continue;
      }

      const fornecedor = toTextoOuNull(colA);
      const valorTotalNf = toNumeroOuNull(r[4]);
      if (!fornecedor || valorTotalNf == null) continue;

      const produtoOriginal = toTextoOuNull(r[3]) ?? "";
      linhas.push({
        fornecedorNome: fornecedor,
        dLancamento: toIsoDate(colB),
        nNotaFiscal: toTextoOuNull(r[2]),
        produtoOriginal,
        categoriaNormalizada: normalizarCategoria(produtoOriginal, "nf_pedidos", categoriaSecaoAtual),
        valorTotalNfOrigem: valorTotalNf,
        parcela: null,
        dVencimento: null,
        // NF_PEDIDOS não tem coluna VALOR separada — só VALOR TOTAL N.F.,
        // que serve como o próprio desembolso.
        vTitulo: valorTotalNf,
        liquidacaoOrigem: null,
        dCompetencia: competencia,
        ehIkyDelivery: contemIkyDelivery(produtoOriginal),
      });
    }
  }
  return linhas;
}
