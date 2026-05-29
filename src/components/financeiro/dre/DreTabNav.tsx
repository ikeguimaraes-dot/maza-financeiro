import Link from "next/link"

const TABS = [
  { key: "dre",         label: "DRE" },
  { key: "indicadores", label: "Indicadores" },
  { key: "receita",     label: "Receita" },
  { key: "despesas",    label: "Despesas" },
  { key: "folha",       label: "Folha" },
  { key: "gorjeta",     label: "Gorjeta" },
  { key: "historico",   label: "Histórico" },
  { key: "auditoria",   label: "Auditoria" },
]

export function DreTabNav({ aba }: { aba: string }) {
  return (
    <nav
      style={{
        display: "flex",
        gap: 2,
        borderBottom: "1px solid var(--border)",
        marginBottom: 24,
        overflowX: "auto",
      }}
    >
      {TABS.map((tab) => {
        const active = aba === tab.key
        return (
          <Link
            key={tab.key}
            href={`/financeiro/dre?aba=${tab.key}`}
            style={{
              padding: "8px 16px",
              fontSize: 13,
              fontWeight: active ? 700 : 500,
              color: active ? "var(--text)" : "var(--text-3)",
              borderBottom: active
                ? "2px solid var(--brand, #D4A574)"
                : "2px solid transparent",
              textDecoration: "none",
              whiteSpace: "nowrap",
              marginBottom: -1,
              transition: "color 0.1s",
            }}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
