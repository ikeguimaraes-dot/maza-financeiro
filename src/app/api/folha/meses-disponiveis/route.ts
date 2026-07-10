import { createClient } from "@supabase/supabase-js"

export const runtime = "nodejs"

const CORS = {
  "Access-Control-Allow-Origin": "https://kph-os.vercel.app",
  "Access-Control-Allow-Methods": "GET, POST",
  "Access-Control-Allow-Headers": "Content-Type",
}

export async function OPTIONS() {
  return new Response(null, { headers: CORS })
}

// GET /api/folha/meses-disponiveis?unit_id=<uuid>
// Competências (YYYY-MM) que têm colaboradores para a unidade, ordenadas DESC.
// A página usa a primeira (mais recente COM dados) como default dos seletores,
// em vez de assumir o mês corrente — que pode não ter folha importada ainda.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const unit_id = searchParams.get("unit_id")

  if (!unit_id) {
    return Response.json({ error: "unit_id obrigatório" }, { status: 400, headers: CORS })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // is_vaga=false: só meses com colaboradores reais contam como "com dados"
  // (um mês só com vagas abertas renderiza vazio na página).
  const { data, error } = await supabase
    .from("dre_folha")
    .select("competencia")
    .eq("unit_id", unit_id)
    .eq("is_vaga", false)
    .not("competencia", "is", null)
    .order("competencia", { ascending: false })

  if (error) {
    return Response.json({ error: error.message }, { status: 500, headers: CORS })
  }

  const competencias = [...new Set((data ?? []).map((r) => r.competencia as string))]

  return Response.json({ competencias }, { headers: CORS })
}
