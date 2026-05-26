"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { Button } from "@kph/ui/button";
import { responderAprovacao } from "@/app/financeiro/actions";

type Props = {
  approvalId: string;
  /** Habilita os botões só se o user for founder/cfo. */
  canRespond: boolean;
};

/** Botões inline Aprovar / Rejeitar pra uma approval_request pendente. */
export function AprovacaoActions({ approvalId, canRespond }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(decisao: "aprovado" | "rejeitado", motivo?: string | null) {
    setError(null);
    startTransition(async () => {
      const r = await responderAprovacao(approvalId, decisao, motivo);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  if (!canRespond) {
    return (
      <span
        style={{
          fontSize: 11,
          color: "var(--text-3)",
          fontStyle: "italic",
        }}
      >
        Aguardando aprovação
      </span>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
      <div style={{ display: "flex", gap: 6 }}>
        <Button
          size="sm"
          variant="default"
          disabled={pending}
          onClick={() => run("aprovado")}
        >
          {pending ? <Loader2 className="animate-spin" /> : null}
          Aprovar
        </Button>
        <Button
          size="sm"
          variant="destructive"
          disabled={pending}
          onClick={() => {
            const motivo = window.prompt("Motivo da rejeição (opcional):");
            if (motivo === null) return;
            run("rejeitado", motivo || null);
          }}
        >
          Rejeitar
        </Button>
      </div>
      {error && <span style={{ fontSize: 11, color: "#EF4444" }}>{error}</span>}
    </div>
  );
}
