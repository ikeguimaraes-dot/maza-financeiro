import "server-only"
import { createClient } from "@supabase/supabase-js"
import type { FolhaImportDocument } from "./types"

export interface FolhaImportRepository {
  replace(document: FolhaImportDocument): Promise<number>
}

export class SupabaseFolhaImportRepository implements FolhaImportRepository {
  async replace(document: FolhaImportDocument): Promise<number> {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !serviceRoleKey) throw new Error("Banco da Folha nao configurado.")

    const supabase = createClient(url, serviceRoleKey)
    const { unitId, competence, payload } = document

    // Mantem a semantica atual. A troca atomica sera feita por RPC em uma
    // migration separada para nao introduzir risco de banco nesta etapa.
    const { error: deleteError } = await supabase
      .from("dre_folha")
      .delete()
      .eq("unit_id", unitId)
      .eq("competencia", competence)
    if (deleteError) throw new Error(deleteError.message)

    const { data: inserted, error: insertError } = await supabase
      .from("dre_folha")
      .insert(payload.rows)
      .select("id")
    if (insertError) throw new Error(insertError.message)
    if ((inserted?.length ?? 0) !== payload.rows.length) {
      throw new Error(
        `A folha nao foi confirmada no banco (${inserted?.length ?? 0} de ${payload.rows.length} registros).`,
      )
    }

    const { count, error: verifyError } = await supabase
      .from("dre_folha")
      .select("id", { count: "exact", head: true })
      .eq("unit_id", unitId)
      .eq("competencia", competence)
    if (verifyError) throw new Error(verifyError.message)
    if ((count ?? 0) !== payload.rows.length) {
      throw new Error(
        `A verificacao da folha no banco encontrou ${count ?? 0} de ${payload.rows.length} registros.`,
      )
    }

    return count ?? 0
  }
}
