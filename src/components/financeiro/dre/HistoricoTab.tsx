"use client"

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts"

export type HistoricoRow = {
  mes_num: number
  categoria: string
  rec_2022: number | null
  rec_2023: number | null
  rec_2024: number | null
  rec_2025: number | null
  rec_2026_bd: number | null
  clientes_bd: number | null
  ticket_bd: number | null
}

const MESES_SHORT = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"]

const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL",
    notation: "compact", maximumFractionDigits: 1 }).format(v)

const fmtFull = (v: number | null) =>
  v == null ? "—" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL",
    notation: "compact", maximumFractionDigits: 1 }).format(v)

const ANOS_CORES: Record<string, string> = {
  "2022": "#64748B",
  "2023": "#3B82F6",
  "2024": "#8B5CF6",
  "2025": "#D4A574",
  "2026 BD": "#22C55E",
}

type Props = { data: HistoricoRow[] }

export function HistoricoTab({ data }: Props) {
  const restaurante = data.filter((d) => d.categoria === "restaurante").sort((a, b) => a.mes_num - b.mes_num)
  const total = data.filter((d) => d.categoria === "total").sort((a, b) => a.mes_num - b.mes_num)

  const chartData = restaurante.map((r) => ({
    mes: MESES_SHORT[(r.mes_num - 1) % 12],
    "2023": r.rec_2023,
    "2024": r.rec_2024,
    "2025": r.rec_2025,
    "2026 BD": r.rec_2026_bd,
  }))

  const anos = ["2023", "2024", "2025", "2026 BD"] as const

  // Annual totals from restaurante rows
  const anoTotals = {
    "2022": restaurante.reduce((s, r) => s + (r.rec_2022 ?? 0), 0),
    "2023": restaurante.reduce((s, r) => s + (r.rec_2023 ?? 0), 0),
    "2024": restaurante.reduce((s, r) => s + (r.rec_2024 ?? 0), 0),
    "2025": restaurante.reduce((s, r) => s + (r.rec_2025 ?? 0), 0),
    "2026 BD": restaurante.reduce((s, r) => s + (r.rec_2026_bd ?? 0), 0),
  }

  const growth = (cur: number, prev: number) =>
    prev > 0 ? ((cur - prev) / prev) * 100 : null

  return (
    <div style={{ display: "grid", gap: 24 }}>
      {/* Annual growth cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: 12,
        }}
      >
        {(["2022", "2023", "2024", "2025", "2026 BD"] as const).map((ano) => {
          const prev = ano === "2022" ? null : ano === "2023" ? anoTotals["2022"] : ano === "2024" ? anoTotals["2023"] : ano === "2025" ? anoTotals["2024"] : anoTotals["2025"]
          const cur = anoTotals[ano]
          const g = prev != null && prev > 0 ? growth(cur, prev) : null
          return (
            <div
              key={ano}
              style={{
                background: "var(--surface)",
                border: `1px solid ${ano === "2026 BD" ? "var(--brand, #D4A574)" : "var(--border)"}`,
                borderRadius: 10,
                padding: "12px 14px",
              }}
            >
              <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase", color: ANOS_CORES[ano] ?? "var(--text-3)", margin: 0 }}>
                {ano}
              </p>
              <p style={{ fontSize: 18, fontWeight: 700, color: "var(--text)", margin: "4px 0 0", lineHeight: 1.2 }}>
                {cur > 0 ? fmtBRL(cur) : "—"}
              </p>
              {g != null && (
                <p style={{ fontSize: 11, color: g >= 0 ? "#22C55E" : "#EF4444", margin: 0, fontWeight: 600 }}>
                  {g >= 0 ? "+" : ""}{g.toFixed(1)}% vs ant.
                </p>
              )}
            </div>
          )
        })}
      </div>

      {/* Line chart */}
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: "16px 16px 8px",
        }}
      >
        <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "var(--text-3)", margin: "0 0 4px" }}>
          Faturamento Mensal — Restaurante (2023–2026 BD)
        </p>
        <p style={{ fontSize: 11, color: "var(--text-3)", margin: "0 0 16px" }}>
          2022 parcial (Ago–Dez) · excluí da visualização
        </p>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={chartData} margin={{ top: 4, right: 16, left: 4, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272A" />
            <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "#71717A" }} axisLine={false} tickLine={false} />
            <YAxis
              tick={{ fontSize: 10, fill: "#71717A" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => fmtBRL(v)}
            />
            <Tooltip
              contentStyle={{ background: "#1A1A1E", border: "1px solid #27272A", borderRadius: 8, fontSize: 11, color: "#E5E5E7" }}
              formatter={(v: unknown, name: unknown) => [fmtBRL(typeof v === "number" ? v : 0), String(name ?? "")]}
              cursor={{ stroke: "rgba(255,255,255,0.08)" }}
            />
            <Legend wrapperStyle={{ fontSize: 11, color: "#71717A" }} />
            {anos.map((ano) => (
              <Line
                key={ano}
                type="monotone"
                dataKey={ano}
                stroke={ANOS_CORES[ano]}
                strokeWidth={ano === "2026 BD" ? 2.5 : 1.5}
                strokeDasharray={ano === "2026 BD" ? "6 3" : undefined}
                dot={false}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Monthly table */}
      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 12,
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 10,
          }}
        >
          <thead>
            <tr style={{ background: "var(--surface-2)" }}>
              {["Mês", "2022", "2023", "2024", "2025", "2026 BD", "Var 26×25"].map((h, i) => (
                <th
                  key={h}
                  style={{
                    padding: "8px 12px",
                    textAlign: i === 0 ? "left" : "right",
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: 0.4,
                    textTransform: "uppercase",
                    color: i === 5 ? "#22C55E" : "var(--text-3)",
                    borderBottom: "1px solid var(--border)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {restaurante.map((r) => {
              const g = r.rec_2025 && r.rec_2026_bd
                ? growth(r.rec_2026_bd, r.rec_2025)
                : null
              return (
                <tr key={r.mes_num} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: "8px 12px", fontWeight: 500, color: "var(--text)" }}>
                    {MESES_SHORT[(r.mes_num - 1) % 12]}
                  </td>
                  <td style={{ padding: "8px 12px", textAlign: "right", color: "var(--text-3)" }}>{fmtFull(r.rec_2022)}</td>
                  <td style={{ padding: "8px 12px", textAlign: "right", color: "var(--text-3)" }}>{fmtFull(r.rec_2023)}</td>
                  <td style={{ padding: "8px 12px", textAlign: "right", color: "var(--text-3)" }}>{fmtFull(r.rec_2024)}</td>
                  <td style={{ padding: "8px 12px", textAlign: "right", color: "var(--text)" }}>{fmtFull(r.rec_2025)}</td>
                  <td style={{ padding: "8px 12px", textAlign: "right", color: "#22C55E", fontWeight: 600 }}>
                    {fmtFull(r.rec_2026_bd)}
                  </td>
                  <td style={{ padding: "8px 12px", textAlign: "right", color: g == null ? "var(--text-3)" : g >= 0 ? "#22C55E" : "#EF4444", fontWeight: 600 }}>
                    {g == null ? "—" : `${g >= 0 ? "+" : ""}${g.toFixed(1)}%`}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
