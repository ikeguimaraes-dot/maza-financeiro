import "server-only"
import { createSupabaseServerClient } from "@kph/db/supabase/server"
import type { FolhaImportDocument } from "./types"
import type { BufferedImportFile } from "../core/types"

export interface FolhaImportRepository {
  replace(document: FolhaImportDocument, files: BufferedImportFile[]): Promise<number>
}

export class SupabaseFolhaImportRepository implements FolhaImportRepository {
  async replace(document: FolhaImportDocument, files: BufferedImportFile[]): Promise<number> {
    const supabase: any = await createSupabaseServerClient()
    if (!supabase) throw new Error("Banco da Folha nao configurado.")
    const { unitId, competence, payload } = document

    const documentPaths = new Map<string, string>()
    for (const file of files.filter((item) => item.format === "pdf")) {
      const safeName = file.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "-")
      const path = `${unitId}/${competence}/${Date.now()}-${safeName}`
      const { error: uploadError } = await supabase.storage.from("folha-documentos").upload(path, file.bytes, { contentType: file.mimeType, upsert: false })
      if (uploadError) throw new Error(`PDF ${file.name}: ${uploadError.message}`)
      documentPaths.set(file.name, path)
    }

    const rows = payload.rows.map((row) => ({
      ...row,
      documento_path: row.documento_nome ? documentPaths.get(row.documento_nome) ?? null : null,
    }))

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
      .insert(rows)
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
