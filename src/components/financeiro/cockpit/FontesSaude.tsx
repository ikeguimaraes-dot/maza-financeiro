"use client";

import { useState } from "react";
import { useResource } from "@/lib/hooks/use-resource";
import { carregarFontesSaude } from "./fontes-actions";
import type { FonteSaudeRow } from "./types";
import styles from "./cockpit.module.css";

const SOURCE_STATUS: Record<string, { label: string; color: string }> = {
  viva: { label: "Atualizada", color: "var(--color-success)" },
  atrasada: { label: "Atrasada", color: "var(--color-warning)" },
  morta: { label: "Sem atualização", color: "var(--color-danger)" },
};

export function FontesSaude({ fontes }: { fontes?: FonteSaudeRow[] }) {
  const [opened, setOpened] = useState(false);
  return <details className={styles.sources} onToggle={event => {
    if (event.currentTarget.open) setOpened(true);
  }}>
    <summary>Consultar fontes de dados{fontes ? ` (${fontes.length})` : ""}</summary>
    {fontes ? <SourceRows fontes={fontes} /> : opened ? <RemoteSources /> : null}
  </details>;
}

function RemoteSources() {
  const { data, loading, error, reload } = useResource("fontes-saude", carregarFontesSaude, []);
  if (loading) return <p role="status">Carregando fontes…</p>;
  if (error) return <div role="alert">Não foi possível carregar as fontes. <button type="button" onClick={reload}>Tentar novamente</button></div>;
  if (!data.length) return <p>Nenhuma fonte disponível.</p>;
  return <SourceRows fontes={data} />;
}

function SourceRows({ fontes }: { fontes: FonteSaudeRow[] }) {
  return fontes.map(source => <div key={source.fonte}><span>{source.fonte.replace(/_/g, " ")}</span><span style={{ color: SOURCE_STATUS[source.status_fonte]?.color ?? "var(--text-3)" }}>{SOURCE_STATUS[source.status_fonte]?.label ?? source.status_fonte}{source.dias_sem_atualizacao != null ? ` · ${source.dias_sem_atualizacao}d` : ""}</span></div>);
}
