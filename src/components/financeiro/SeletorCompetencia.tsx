"use client";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { competenciaLabel } from "@/lib/financeiro/utils";
export function SeletorCompetencia({ valor, opcoes }: { valor: string; opcoes: string[] }) {
  const router = useRouter(); const pathname = usePathname(); const search = useSearchParams();
  const [pending, startTransition] = useTransition();
  return <label style={{ display: 'flex', gap: 10, alignItems: 'center', color: 'var(--text-2)', fontSize: 13 }}>Mês
    <select aria-label="Mês de referência" disabled={pending} value={valor} onChange={event => {
      const params = new URLSearchParams(search.toString()); params.set('competencia', event.target.value);
      startTransition(() => router.push(`${pathname}?${params.toString()}`));
    }} style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px' }}>
      {[...new Set([...opcoes, valor])].sort().map(c => <option key={c} value={c}>{competenciaLabel(c)}</option>)}
    </select>{pending && <span role="status">Carregando…</span>}
  </label>;
}
