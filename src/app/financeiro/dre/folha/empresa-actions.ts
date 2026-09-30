"use server"

import { createHash } from "node:crypto"
import { z } from "zod"
import { createFinanceiroClient } from "@/lib/financeiro/db/client"
import { lerFolhaEmpresa, selecionarAbas } from "@/lib/folha/empresa/planilha"

async function lerArquivo(form: FormData) {
  const arquivo = form.get("arquivo")
  if (!(arquivo instanceof File) || !/\.xlsx$/i.test(arquivo.name) || arquivo.size > 5 * 1024 * 1024) {
    throw new Error("Selecione uma planilha .xlsx de até 5 MB.")
  }
  const buffer = Buffer.from(await arquivo.arrayBuffer())
  return { arquivo, buffer, abas: lerFolhaEmpresa(buffer) }
}

export async function analisarFolhaEmpresa(form: FormData) {
  await createFinanceiroClient()
  return (await lerArquivo(form)).abas
}

export async function importarFolhaEmpresa(form: FormData) {
  const db = await createFinanceiroClient()
  const unitId = z.string().uuid().parse(form.get("unit_id"))
  const selecao = z.array(z.object({ aba: z.string().min(1), competencia: z.string() })).min(1).max(100)
    .parse(JSON.parse(String(form.get("selecao"))))
  const { arquivo, buffer, abas } = await lerArquivo(form)
  const escolhidas = selecionarAbas(abas, selecao)
  const path = `${unitId}/empresa/${createHash("sha256").update(buffer).digest("hex")}.xlsx`
  const { error: uploadError } = await db.storage.from("folha-documentos").upload(path, buffer, {
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", upsert: true,
  })
  if (uploadError) throw new Error(`Não foi possível guardar a planilha: ${uploadError.message}`)
  const linhas = escolhidas.flatMap(aba => aba.linhas.map(linha => ({
    ...linha, unit_id: unitId, competencia: aba.competencia, etapa: aba.etapa,
    // A blank imported cell must not replace the provenance of a retained value.
    fontes: Object.fromEntries(Object.entries(linha.fontes).filter(([campo]) => linha[campo as "pagamento" | "bonificacao"] !== null)),
    arquivo: arquivo.name, documento_path: path,
  })))
  const { data, error } = await db.rpc("importar_folha_empresa", { p_linhas: linhas })
  if (error) throw new Error(`Não foi possível importar: ${error.message}`)
  return { quantidade: data as number }
}
