"use client"

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Cell,
} from "recharts"

export type DreChartPoint = {
  mes: string
  cmv_re: number | null
  cmv_bd: number | null
  pessoal_re: number | null
  pessoal_bd: number | null
  ebitda_re: number | null
  ebitda_bd: number | null
}

export function DreBarChart({ data }: { data: DreChartPoint[] }) {
  const avg = (vals: (number | null)[]) => {
    const nums = vals.filter((v): v is number => v !== null)
    return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
        gap: 14,
      }}
    >
      <MiniChart
        title="CMV % da Receita"
        data={data.map((d) => ({ mes: d.mes, value: d.cmv_re, meta: d.cmv_bd }))}
        avgMeta={avg(data.map((d) => d.cmv_bd))}
        goodColor="#22C55E"
        badColor="#EF4444"
        lowerIsBetter
      />
      <MiniChart
        title="Pessoal % da Receita"
        data={data.map((d) => ({ mes: d.mes, value: d.pessoal_re, meta: d.pessoal_bd }))}
        avgMeta={avg(data.map((d) => d.pessoal_bd))}
        goodColor="#22C55E"
        badColor="#F59E0B"
        lowerIsBetter
      />
      <MiniChart
        title="EBITDA % da Receita"
        data={data.map((d) => ({ mes: d.mes, value: d.ebitda_re, meta: d.ebitda_bd }))}
        avgMeta={avg(data.map((d) => d.ebitda_bd))}
        goodColor="#22C55E"
        badColor="#EF4444"
        lowerIsBetter={false}
      />
    </div>
  )
}

type MiniPoint = { mes: string; value: number | null; meta: number | null }

function MiniChart({
  title,
  data,
  avgMeta,
  goodColor,
  badColor,
  lowerIsBetter,
}: {
  title: string
  data: MiniPoint[]
  avgMeta: number | null
  goodColor: string
  badColor: string
  lowerIsBetter: boolean
}) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: "14px 12px 10px",
      }}
    >
      <p
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: 1,
          textTransform: "uppercase",
          color: "var(--text-3)",
          margin: "0 0 12px",
        }}
      >
        {title}
      </p>
      <ResponsiveContainer width="100%" height={148}>
        <BarChart
          data={data}
          barSize={28}
          margin={{ top: 8, right: 4, left: -16, bottom: 0 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="#27272A"
            vertical={false}
          />
          <XAxis
            dataKey="mes"
            tick={{ fontSize: 10, fill: "#71717A" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 9, fill: "#71717A" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => `${v.toFixed(0)}%`}
          />
          <Tooltip
            formatter={(value: unknown) => {
              const n = typeof value === "number" ? value : null
              return [
                n !== null ? `${n.toFixed(1).replace(".", ",")}%` : "—",
                title,
              ]
            }}
            contentStyle={{
              background: "#1A1A1E",
              border: "1px solid #27272A",
              borderRadius: 8,
              fontSize: 11,
              color: "#E5E5E7",
            }}
            cursor={{ fill: "rgba(255,255,255,0.04)" }}
          />
          <Bar dataKey="value" radius={[4, 4, 0, 0]}>
            {data.map((entry, idx) => {
              const v = entry.value
              const ref = entry.meta ?? avgMeta
              if (v === null) return <Cell key={idx} fill="#3F3F46" />
              if (ref === null) return <Cell key={idx} fill={goodColor} fillOpacity={0.7} />
              const isGood = lowerIsBetter ? v <= ref : v >= ref
              return (
                <Cell
                  key={idx}
                  fill={isGood ? goodColor : badColor}
                  fillOpacity={0.85}
                />
              )
            })}
          </Bar>
          {avgMeta !== null && (
            <ReferenceLine
              y={avgMeta}
              stroke="#D4A574"
              strokeDasharray="5 3"
              strokeWidth={1.5}
              label={{
                value: `Meta ${avgMeta.toFixed(1)}%`,
                fill: "#D4A574",
                fontSize: 9,
                position: "insideTopRight",
              }}
            />
          )}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
