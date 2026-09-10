// CLI pra rodar gerarRazao() sem depender de sessão autenticada no app —
// as Server Actions em src/app/financeiro/razao/actions.ts são gated por
// requireUser() (cookie de sessão via next/headers), que não existe fora do
// runtime do Next. Aqui chamamos direto a lógica pura em
// src/lib/financeiro/razao/gerar.ts com um client de service-role.
//
// Uso: npx tsx scripts/regerar-razao.ts --unit all --de 2026-05 --ate 2026-08
//      npx tsx scripts/regerar-razao.ts --unit 674eac8c-5a38-4a42-aa60-0a666387909c --de 2026-06 --ate 2026-06
import { createServiceClient } from "@maza/db/supabase/server"
import { gerarRazao, YOSHIMORI_UNIT_ID, IKY_UNIT_ID } from "@/lib/financeiro/razao/gerar"

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {}
  for (let i = 0; i < argv.length; i++) {
    const item = argv[i]
    if (item?.startsWith("--")) {
      args[item.slice(2)] = argv[i + 1] ?? ""
      i++
    }
  }
  return args
}

function competenciasEntre(de: string, ate: string): string[] {
  const [anoDe, mesDe] = de.split("-").map(Number)
  const [anoAte, mesAte] = ate.split("-").map(Number)
  const competencias: string[] = []
  let ano = anoDe!, mes = mesDe!
  while (ano < anoAte! || (ano === anoAte && mes <= mesAte!)) {
    competencias.push(`${ano}-${String(mes).padStart(2, "0")}-01`)
    mes++
    if (mes > 12) { mes = 1; ano++ }
  }
  return competencias
}

const KPI_CAMPOS = [
  "receita_liquida", "cmv_compras_pct", "mo_pct", "prime_cost_pct", "ebitda_pct", "tem_nfe", "confianca_pct",
] as const

async function main() {
  try {
    // Node 20.6+/22+: no-op silencioso se o arquivo não existir (produção/CI
    // já injeta as env vars por outro meio).
    process.loadEnvFile(".env.local")
  } catch {
    // sem .env.local local — segue com o que já estiver no ambiente
  }

  const args = parseArgs(process.argv.slice(2))
  if (!args.unit || !args.de || !args.ate) {
    console.error("Uso: npx tsx scripts/regerar-razao.ts --unit <id|all> --de 2026-05 --ate 2026-08")
    process.exit(1)
  }

  const db = createServiceClient()
  if (!db) {
    console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ausentes. Configure .env.local.")
    process.exit(1)
  }

  const unitIds = args.unit === "all" ? [YOSHIMORI_UNIT_ID, IKY_UNIT_ID] : [args.unit]
  const competencias = competenciasEntre(args.de, args.ate)

  for (const unitId of unitIds) {
    for (const competencia of competencias) {
      console.log(`\n=== unidade ${unitId} — competência ${competencia.slice(0, 7)} ===`)
      const resultado = await gerarRazao(db, unitId, competencia)
      console.log("  nfeEntrada:", resultado.nfeEntrada)
      console.log("  titulos:  ", resultado.titulos)
      console.log("  folha:    ", resultado.folha)
      console.log("  receita:  ", resultado.receita)
      console.log("  snapshot: ", resultado.snapshot)

      const { data: kpi, error } = await db
        .from("kpi_snapshot")
        .select(KPI_CAMPOS.join(","))
        .eq("unit_id", unitId)
        .eq("competencia", competencia)
        .maybeSingle()
      if (error) console.error("  kpi_snapshot: erro ao ler —", error.message)
      else console.log("  kpi_snapshot:", kpi)
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
