"use client"

import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts"
import { formatBRL } from "@/lib/financeiro/utils"
import type { DiaFluxo } from "@/lib/financeiro/fluxo/calcularFluxo"

type Props = {
  dias: DiaFluxo[]
  hoje: string
  diaCruzaZero: string | null
}

function formatDiaCurto(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
}

export function FluxoCalendario({ dias, hoje, diaCruzaZero }: Props) {
  const data = dias.map((d) => ({
    data: d.data,
    label: formatDiaCurto(d.data),
    entradaRealizada: d.entradasRealizadas,
    entradaPrevista: d.entradasPrevistas,
    saidaRealizada: -d.saidasRealizadas,
    saidaPrevista: -d.saidasPrevistas,
    saldoFinal: d.saldoFinal,
  }))

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: "16px 12px 10px",
        marginBottom: 28,
      }}
    >
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272A" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 9, fill: "#71717A" }}
            axisLine={false}
            tickLine={false}
            interval={Math.max(0, Math.floor(data.length / 12) - 1)}
          />
          <YAxis
            yAxisId="fluxo"
            tick={{ fontSize: 9, fill: "#71717A" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => formatBRL(v).replace("R$", "").trim()}
          />
          <YAxis
            yAxisId="saldo"
            orientation="right"
            tick={{ fontSize: 9, fill: "#71717A" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => formatBRL(v).replace("R$", "").trim()}
          />
          <Tooltip
            formatter={(value: unknown, name: unknown) => {
              const n = typeof value === "number" ? value : 0
              const key = typeof name === "string" ? name : String(name)
              const nomes: Record<string, string> = {
                entradaRealizada: "Entrada realizada",
                entradaPrevista: "Entrada prevista",
                saidaRealizada: "Saída realizada",
                saidaPrevista: "Saída prevista",
                saldoFinal: "Saldo acumulado",
              }
              return [formatBRL(Math.abs(n)), nomes[key] ?? key]
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
          <ReferenceLine yAxisId="fluxo" y={0} stroke="#3F3F46" />
          <ReferenceLine
            yAxisId="fluxo"
            x={formatDiaCurto(hoje)}
            stroke="#71717A"
            strokeDasharray="4 3"
            label={{ value: "Hoje", fill: "#71717A", fontSize: 9, position: "top" }}
          />
          {diaCruzaZero && (
            <ReferenceLine
              yAxisId="fluxo"
              x={formatDiaCurto(diaCruzaZero)}
              stroke="#EF4444"
              strokeDasharray="4 3"
              label={{ value: "Falta caixa", fill: "#EF4444", fontSize: 9, position: "top" }}
            />
          )}
          <Bar yAxisId="fluxo" dataKey="entradaRealizada" stackId="entrada" fill="#22C55E" fillOpacity={0.85} />
          <Bar yAxisId="fluxo" dataKey="entradaPrevista" stackId="entrada" fill="#22C55E" fillOpacity={0.35} />
          <Bar yAxisId="fluxo" dataKey="saidaRealizada" stackId="saida" fill="#EF4444" fillOpacity={0.85} />
          <Bar yAxisId="fluxo" dataKey="saidaPrevista" stackId="saida" fill="#EF4444" fillOpacity={0.35} />
          <Line
            yAxisId="saldo"
            type="monotone"
            dataKey="saldoFinal"
            stroke="#D4A574"
            strokeWidth={1.5}
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
