import { createClient } from "@supabase/supabase-js"
import { PDFParse } from "pdf-parse"
import * as XLSX from "xlsx"
import { getCurrentUnit } from "@kph/auth/unit"

export const runtime = "nodejs"
export const maxDuration = 300

type Holerite = {
  nome?: string
  funcao?: string
  divisao?: string
  admissao?: string | null
  salario_base?: number
  total_proventos?: number
}

type FolhaRow = {
  nome?: string
  funcao?: string
  divisao?: string
  admissao?: string | null
  salario_base?: number
  total_proventos?: number
  tipo?: string
  is_vaga?: boolean
}

function divisionFromRole(role: string) {
  const value = role.toUpperCase()
  if (/COZIN|SUSHI|CONFEIT|PARRIL|PADEIR|AUXILIAR DE COZINHA/.test(value)) return "COZINHA"
  if (/GAR[CÇ]OM|CUMIN|MAITRE|CHEFE DE FILA/.test(value)) return "SALAO"
  if (/BARMAN|BARTENDER|BARBACK|BAR /.test(value)) return "BAR"
  if (/FAXIN|LIMPEZA|SERVI[CÇ]OS GERAIS/.test(value)) return "LIMPEZA"
  if (/ADMIN|ESTOQUI|COMPR|FINANCEIR|CAIXA/.test(value)) return "ADM"
  return "NAO INFORMADO"
}

function moneyFromMatch(value?: string) {
  return number(value)
}

async function extract(file: File): Promise<Holerite[]> {
  const parser = new PDFParse({ data: new Uint8Array(await file.arrayBuffer()) })
  try {
    const result = await parser.getText()
    const pages = result.text.split(/\n-- \d+ of \d+ --\n/)
    const holerites: Holerite[] = []
    for (const page of pages) {
      const name = page.match(/\n([A-ZÀ-Ü][A-ZÀ-Ü '.-]{3,})\nNome do Funcionário CBO/i)?.[1]?.trim()
      const admission = page.match(/Admissão:\s*(\d{2}\/\d{2}\/\d{4})[ \t]+([^\r\n]+)/i)
      const salary = page.match(/([\d.]+,\d{2})\s*\nSalário Base/i)?.[1]
      const earnings = page.match(/([\d.]+,\d{2})\s*\nSal\. Contr\. INSS/i)?.[1]
      if (!name || !salary || !earnings) continue
      const role = admission?.[2]?.trim() || "NAO INFORMADO"
      const [day, month, year] = (admission?.[1] ?? "").split("/")
      holerites.push({
        nome: name,
        funcao: role,
        divisao: divisionFromRole(role),
        admissao: day && month && year ? `${year}-${month}-${day}` : null,
        salario_base: moneyFromMatch(salary),
        total_proventos: moneyFromMatch(earnings),
      })
    }
    return holerites
  } finally {
    await parser.destroy()
  }
}

function text(value: unknown) {
  const result = String(value ?? "").trim()
  return result || undefined
}

function number(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value
  const raw = String(value ?? "").trim()
  if (!raw) return 0
  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw
  const result = Number(normalized)
  return Number.isFinite(result) ? result : 0
}

function date(value: unknown): string | null {
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value)
    if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`
  }
  const raw = text(value)
  if (!raw) return null
  const br = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (br) return `${br[3]}-${br[2]!.padStart(2, "0")}-${br[1]!.padStart(2, "0")}`
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null
}

async function extractSpreadsheet(file: File): Promise<FolhaRow[]> {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false })
  const sheet = workbook.Sheets["Base Folha"] ?? workbook.Sheets[workbook.SheetNames[0]!]
  if (!sheet) return []
  const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: true })
  const result: FolhaRow[] = []
  // Formato oficial: dados a partir da linha 5; tipo, nome, função, divisão,
  // admissão, ..., salário na coluna 7 e custo total na coluna 26.
  for (let index = 4; index < raw.length; index++) {
    const row = raw[index] ?? []
    const nome = text(row[1])
    const salario = number(row[6])
    if (!nome || salario <= 0) continue
    result.push({
      tipo: text(row[0]) || "CLT",
      nome,
      funcao: text(row[2]),
      divisao: text(row[3]),
      admissao: date(row[4]),
      salario_base: salario,
      total_proventos: number(row[25]) || salario,
      is_vaga: nome.toLowerCase().includes("vaga"),
    })
  }
  return result
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const files = formData.getAll("files").filter((value): value is File => value instanceof File)
    const legacy = formData.get("file")
    if (files.length === 0 && legacy instanceof File) files.push(legacy)

    const currentUnit = await getCurrentUnit()
    const unitId = currentUnit?.id ?? ""
    const mes = Number(formData.get("mes"))
    const ano = Number(formData.get("ano"))
    if (!unitId || !Number.isInteger(mes) || mes < 1 || mes > 12 || !Number.isInteger(ano)) {
      return Response.json({ error: "Unidade e competencia sao obrigatorias." }, { status: 400 })
    }
    if (files.length === 0) return Response.json({ error: "Selecione ao menos um arquivo." }, { status: 400 })
    const pdfImport = files.every((file) => file.name.toLowerCase().endsWith(".pdf"))
    const spreadsheetImport = files.length === 1 && /\.(xlsx|xls|csv)$/i.test(files[0]!.name)
    if (!pdfImport && !spreadsheetImport) return Response.json(
      { error: "Envie PDFs ou uma única planilha XLSX, XLS ou CSV por vez." },
      { status: 400 }
    )
    if (files.reduce((sum, file) => sum + file.size, 0) > 50 * 1024 * 1024) {
      return Response.json({ error: "O total dos arquivos nao pode ultrapassar 50 MB." }, { status: 413 })
    }

    const extracted: FolhaRow[] = pdfImport
      ? (await Promise.all(files.map(extract))).flat()
      : await extractSpreadsheet(files[0]!)
    if (extracted.length === 0) {
      return Response.json({ error: "Nenhum recibo de pagamento foi reconhecido nos PDFs." }, { status: 422 })
    }

    const competencia = `${ano}-${String(mes).padStart(2, "0")}`
    const rows = extracted.map((item) => ({
      unit_id: unitId,
      competencia,
      tipo: item.tipo || "CLT",
      nome: item.nome?.trim() || "NAO INFORMADO",
      funcao: item.funcao?.trim() || "NAO INFORMADO",
      divisao: item.divisao?.trim().toUpperCase() || "NAO INFORMADO",
      admissao: item.admissao || null,
      salario: Number(item.salario_base) || 0,
      custo_total: Number(item.total_proventos) || Number(item.salario_base) || 0,
      is_vaga: item.is_vaga ?? false,
    }))

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    const { error: deleteError } = await supabase.from("dre_folha").delete()
      .eq("unit_id", unitId).eq("competencia", competencia)
    if (deleteError) throw new Error(deleteError.message)
    const { data: inserted, error: insertError } = await supabase
      .from("dre_folha")
      .insert(rows)
      .select("id")
    if (insertError) throw new Error(insertError.message)
    if ((inserted?.length ?? 0) !== rows.length) {
      throw new Error(`A folha nao foi confirmada no banco (${inserted?.length ?? 0} de ${rows.length} registros).`)
    }

    const { count, error: verifyError } = await supabase
      .from("dre_folha")
      .select("id", { count: "exact", head: true })
      .eq("unit_id", unitId)
      .eq("competencia", competencia)
    if (verifyError) throw new Error(verifyError.message)
    if ((count ?? 0) !== rows.length) {
      throw new Error(`A verificacao da folha no banco encontrou ${count ?? 0} de ${rows.length} registros.`)
    }

    return Response.json({
      ok: true,
      arquivos: files.length,
      importados: count,
      colaboradores: rows.filter((row) => !row.is_vaga).length,
      competencia,
    })
  } catch (error) {
    console.error("[folha/import]", error)
    const message = error instanceof Error ? error.message : "Erro ao importar PDFs."
    return Response.json({ error: message }, { status: 500 })
  }
}
