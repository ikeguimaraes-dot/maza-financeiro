import { getCurrentUnit } from "@kph/auth/unit"
import { ImportError, importErrorMessage } from "@/lib/financeiro/importacao/core/errors"
import { SupabaseFolhaImportRepository } from "@/lib/financeiro/importacao/folha/repository"
import { ImportFolhaService } from "@/lib/financeiro/importacao/folha/service"

export const runtime = "nodejs"
export const maxDuration = 300

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const files = formData.getAll("files").filter((value): value is File => value instanceof File)
    const legacy = formData.get("file")
    if (files.length === 0 && legacy instanceof File) files.push(legacy)

    const currentUnit = await getCurrentUnit()
    const service = new ImportFolhaService(new SupabaseFolhaImportRepository())
    const result = await service.execute({
      files,
      unitId: currentUnit?.id ?? "",
      month: Number(formData.get("mes")),
      year: Number(formData.get("ano")),
    })

    return Response.json(result)
  } catch (error) {
    console.error("[folha/import]", error)
    const status = error instanceof ImportError ? error.status : 500
    return Response.json({ error: importErrorMessage(error) }, { status })
  }
}
