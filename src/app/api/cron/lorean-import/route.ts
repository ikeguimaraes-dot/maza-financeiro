export const runtime = "nodejs"
export const maxDuration = 300

const EDGE_FN_URL =
  "https://iqgrvptrtphvbmvrqntm.supabase.co/functions/v1/process-lorean-emails?limit=1"
const MAX_ITERATIONS = 6

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization")
  console.log("[cron] auth header present:", !!authHeader)
  console.log("[cron] CRON_SECRET present:", !!process.env.CRON_SECRET)

  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  console.log("[cron] iniciando loop de processamento")

  const detail: object[] = []
  let iterations = 0
  let total_processed = 0

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    iterations++

    const res = await fetch(EDGE_FN_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json"
      }
    })

    const result = await res.json()
    detail.push(result)

    const processed = result?.processed ?? 0
    const unprocessed = result?.unprocessed ?? 0
    total_processed += processed

    if (processed === 0 || unprocessed === 0) break

    if (i < MAX_ITERATIONS - 1) {
      await new Promise(resolve => setTimeout(resolve, 2000))
    }
  }

  console.log("[cron] concluído:", { iterations, total_processed })
  return Response.json({ iterations, total_processed, detail })
}
