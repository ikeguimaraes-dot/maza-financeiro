export const runtime = "nodejs"

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const res = await fetch(
    "https://iqgrvptrtphvbmvrqntm.supabase.co/functions/v1/process-lorean-emails?limit=5",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json"
      }
    }
  )

  const result = await res.json()
  return Response.json(result)
}
