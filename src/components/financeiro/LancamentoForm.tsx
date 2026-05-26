"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";

import { Button } from "@kph/ui/button";
import { Input } from "@kph/ui/input";
import { Label } from "@kph/ui/label";
import { Textarea } from "@kph/ui/textarea";
import {
  CATEGORIA_DESPESA_GRUPOS,
  CATEGORIA_DESPESA_LABELS,
  CATEGORIA_RECEITA_LABELS,
} from "@/lib/financeiro/labels";
import {
  CATEGORIA_RECEITA_VALUES,
  createEntrySchema,
  type CreateEntryInput,
  type CreateEntryOutput,
} from "@/lib/financeiro/schema";
import { formatBRL } from "@/lib/financeiro/utils";
import { createCashFlowEntry } from "@/app/financeiro/actions";
import type { LancamentoNatureza } from "@kph/db/types/database";

type EventOption = { id: string; nome: string; data_inicio: string };

type Props = {
  brandSlug: string;
  periodId: string;
  threshold: number;
  events: EventOption[];
  competenciaLabel: string;
};

const NATUREZAS: ReadonlyArray<{ value: LancamentoNatureza; label: string }> = [
  { value: "receita", label: "Receita" },
  { value: "despesa", label: "Despesa" },
];

export function LancamentoForm({
  brandSlug,
  periodId,
  threshold,
  events,
  competenciaLabel: compLabel,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const form = useForm<CreateEntryInput, undefined, CreateEntryOutput>({
    resolver: zodResolver(createEntrySchema),
    defaultValues: {
      period_id: periodId,
      natureza: "despesa",
      categoria_receita: null,
      categoria_despesa: null,
      descricao: "",
      valor: "" as unknown as number,
      data_lancamento: today,
      data_vencimento: "",
      regime: "caixa",
      fornecedor: "",
      numero_documento: "",
      centro_custo: "",
      event_id: null,
      justificativa: "",
      threshold,
    },
  });

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors },
  } = form;

  // useWatch é memoizável; watch() direto não é.
  const natureza = useWatch({ control, name: "natureza" });
  const valorWatched = useWatch({ control, name: "valor" });
  const valorNumeric = Number(valorWatched ?? 0);
  const aboveThreshold =
    Number.isFinite(valorNumeric) && valorNumeric > threshold;

  function onSubmit(data: CreateEntryOutput) {
    setSubmitError(null);
    startTransition(async () => {
      const r = await createCashFlowEntry(data as unknown as CreateEntryInput);
      if (!r.ok) {
        setSubmitError(r.error);
        return;
      }
      router.push(`/financeiro/${brandSlug}`);
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      style={{ display: "flex", flexDirection: "column", gap: 16 }}
    >
      {/* Natureza toggle */}
      <div style={{ display: "flex", gap: 8 }}>
        {NATUREZAS.map((n) => {
          const selected = natureza === n.value;
          return (
            <button
              key={n.value}
              type="button"
              onClick={() => {
                setValue("natureza", n.value, { shouldValidate: true });
                // Limpa categoria quando muda natureza (validação cruzada).
                setValue("categoria_receita", null);
                setValue("categoria_despesa", null);
              }}
              style={{
                padding: "8px 18px",
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: 0.4,
                textTransform: "uppercase",
                background: selected
                  ? n.value === "receita"
                    ? "rgba(34,197,94,0.10)"
                    : "rgba(239,68,68,0.10)"
                  : "var(--surface)",
                border: `1px solid ${
                  selected
                    ? n.value === "receita"
                      ? "rgba(34,197,94,0.40)"
                      : "rgba(239,68,68,0.40)"
                    : "var(--border)"
                }`,
                color: selected
                  ? n.value === "receita"
                    ? "#22C55E"
                    : "#EF4444"
                  : "var(--text-2)",
                borderRadius: 8,
                cursor: "pointer",
                transition: "background var(--t)",
              }}
            >
              {n.label}
            </button>
          );
        })}
      </div>

      {/* Card principal do form */}
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 14,
          padding: "20px 22px",
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: 14,
        }}
      >
        <Field label="Categoria *" error={extractMsg(errors.categoria_receita) || extractMsg(errors.categoria_despesa)} span={2}>
          {natureza === "receita" ? (
            <select
              {...register("categoria_receita")}
              className="h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm"
            >
              <option value="">Selecione…</option>
              {CATEGORIA_RECEITA_VALUES.map((v) => (
                <option key={v} value={v}>
                  {CATEGORIA_RECEITA_LABELS[v]}
                </option>
              ))}
            </select>
          ) : (
            <select
              {...register("categoria_despesa")}
              className="h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm"
            >
              <option value="">Selecione…</option>
              {Object.entries(CATEGORIA_DESPESA_GRUPOS).map(([grupo, cats]) => (
                <optgroup key={grupo} label={grupo}>
                  {cats.map((c) => (
                    <option key={c} value={c}>
                      {CATEGORIA_DESPESA_LABELS[c]}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          )}
        </Field>

        <Field label="Descrição *" error={extractMsg(errors.descricao)} span={2}>
          <Input {...register("descricao")} placeholder="Ex.: NF #2034 — Salumeria Bertolli" />
        </Field>

        <Field label="Valor (R$) *" error={extractMsg(errors.valor)}>
          <Input
            type="number"
            step="0.01"
            inputMode="decimal"
            {...register("valor")}
            placeholder="0,00"
          />
        </Field>

        <Field label="Data lançamento *" error={extractMsg(errors.data_lancamento)}>
          <Input type="date" {...register("data_lancamento")} />
        </Field>

        <Field label="Data vencimento" error={extractMsg(errors.data_vencimento)}>
          <Input type="date" {...register("data_vencimento")} />
        </Field>

        <Field label="Regime *">
          <div style={{ display: "flex", gap: 12, paddingTop: 4 }}>
            <RadioOpt value="caixa" label="Caixa" {...register("regime")} />
            <RadioOpt value="competencia" label="Competência" {...register("regime")} />
          </div>
        </Field>

        <Field label="Fornecedor" error={extractMsg(errors.fornecedor)}>
          <Input {...register("fornecedor")} placeholder="Nome do fornecedor" />
        </Field>

        <Field label="Nº documento" error={extractMsg(errors.numero_documento)}>
          <Input {...register("numero_documento")} placeholder="NF / Recibo" />
        </Field>

        <Field label="Centro de custo" error={extractMsg(errors.centro_custo)}>
          <Input {...register("centro_custo")} placeholder="Opcional" />
        </Field>

        <Field label="Vinculado a O.S." error={extractMsg(errors.event_id)}>
          <select
            {...register("event_id")}
            className="h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm"
            disabled={events.length === 0}
          >
            <option value="">Nenhum</option>
            {events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nome}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label={`Justificativa ${aboveThreshold ? "(obrigatória)" : "(opcional)"}`}
          error={extractMsg(errors.justificativa)}
          span={2}
        >
          <Textarea
            {...register("justificativa")}
            rows={3}
            placeholder={
              aboveThreshold
                ? `Acima do limite ${formatBRL(threshold)} — explique o gasto.`
                : "Comentário opcional"
            }
          />
        </Field>
      </div>

      {/* Aviso de threshold */}
      {aboveThreshold && (
        <div
          role="alert"
          style={{
            padding: "12px 14px",
            background: "rgba(234,179,8,0.10)",
            border: "1px solid rgba(234,179,8,0.40)",
            borderRadius: 10,
            color: "#EAB308",
            fontSize: 12,
            lineHeight: 1.55,
          }}
        >
          <strong>Este lançamento requer aprovação.</strong> Acima de{" "}
          {formatBRL(threshold)} — uma solicitação será enviada automaticamente
          ao aprovador (founder/CFO). Período: {compLabel}.
        </div>
      )}

      {submitError && (
        <div
          style={{
            padding: 12,
            borderRadius: 8,
            background: "rgba(239,68,68,0.10)",
            border: "1px solid rgba(239,68,68,0.40)",
            color: "#EF4444",
            fontSize: 13,
          }}
        >
          {submitError}
        </div>
      )}

      <footer style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push(`/financeiro/${brandSlug}`)}
          disabled={pending}
        >
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          Criar lançamento
        </Button>
      </footer>
    </form>
  );
}

// ── helpers ────────────────────────────────────────────────────

type FieldErrLike = { message?: string } | undefined;
function extractMsg(err: FieldErrLike): string | undefined {
  return err?.message;
}

function Field({
  label,
  children,
  error,
  span = 1,
}: {
  label: string;
  children: React.ReactNode;
  error?: string;
  span?: number;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        gridColumn: `span ${span}`,
      }}
    >
      <Label style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 600 }}>
        {label}
      </Label>
      {children}
      {error && <span style={{ fontSize: 11, color: "#EF4444" }}>{error}</span>}
    </div>
  );
}

function RadioOpt({
  value,
  label,
  ...rest
}: { value: string; label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 12,
        color: "var(--text-2)",
        cursor: "pointer",
      }}
    >
      <input type="radio" value={value} {...rest} />
      {label}
    </label>
  );
}
