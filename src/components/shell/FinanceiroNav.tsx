"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/financeiro", label: "Visão Geral", exact: true },
  { href: "/financeiro/fluxo", label: "Fluxo de Caixa" },
  { href: "/financeiro/dre", label: "DRE" },
  { href: "/financeiro/pagar", label: "A Pagar" },
  { href: "/financeiro/receber", label: "A Receber" },
  { href: "/financeiro/aprovacoes", label: "Aprovações" },
  { href: "/financeiro/conciliacao", label: "Conciliação" },
  { href: "/financeiro/orcamento", label: "Orçamento" },
];

export function FinanceiroNav() {
  const pathname = usePathname();

  return (
    <nav
      style={{
        background: "var(--surface)",
        borderBottom: "1px solid var(--border)",
        padding: "0 24px",
        display: "flex",
        gap: 4,
        alignItems: "center",
        height: 48,
        overflowX: "auto",
      }}
    >
      <span
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: "var(--text)",
          letterSpacing: 0.4,
          marginRight: 16,
          whiteSpace: "nowrap",
        }}
      >
        KPH Financeiro
      </span>
      {LINKS.map(({ href, label, exact }) => {
        const active = exact ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            style={{
              fontSize: 13,
              fontWeight: active ? 600 : 400,
              color: active ? "var(--text)" : "var(--text-3)",
              padding: "0 10px",
              height: "100%",
              display: "flex",
              alignItems: "center",
              borderBottom: active ? "2px solid var(--brand, currentColor)" : "2px solid transparent",
              textDecoration: "none",
              whiteSpace: "nowrap",
            }}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
