import type { ReactNode } from "react";

type Props = { label: string; value: ReactNode; sub?: ReactNode; trailing?: ReactNode; children?: ReactNode; accent?: string };

export function KpiCard({ label, value, sub, trailing, children, accent }: Props) {
  return <article className="maza-panel maza-kpi maza-enter">
    <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}><span className="maza-kpi-label" style={{ color: accent }}>{label}</span>{trailing}</header>
    <div className="maza-kpi-value">{value}</div>
    {sub && <div className="maza-kpi-sub">{sub}</div>}
    {children && <div>{children}</div>}
  </article>;
}
