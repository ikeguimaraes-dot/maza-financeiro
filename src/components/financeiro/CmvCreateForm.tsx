"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";

import { Button } from "@kph/ui/button";
import { Input } from "@kph/ui/input";
import { Label } from "@kph/ui/label";
import { CMV_CATEGORIA_OPTIONS } from "@/lib/financeiro/labels";
import {
  createMenuItemSchema,
  type CreateMenuItemInput,
} from "@/lib/financeiro/schema";
import { createMenuItem } from "@/app/financeiro/actions";

type Props = {
  brandId: string;
};

/** Form inline expansível pra criar item CMV. Aparece colapsado por padrão. */
export function CmvCreateForm({ brandId }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm<CreateMenuItemInput>({
    resolver: zodResolver(createMenuItemSchema),
    defaultValues: {
      brand_id: brandId,
      unit_id: null,
      nome: "",
      categoria: "prato_principal",
      preco_venda: "" as unknown as number,
      custo_total: null,
      tem_ficha_tecnica: false,
      ativo: true,
      observacoes: "",
    },
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = form;

  function onSubmit(data: CreateMenuItemInput) {
    setSubmitError(null);
    startTransition(async () => {
      const r = await createMenuItem(data);
      if (!r.ok) {
        setSubmitError(r.error);
        return;
      }
      reset({
        brand_id: brandId,
        unit_id: null,
        nome: "",
        categoria: "prato_principal",
        preco_venda: "" as unknown as number,
        custo_total: null,
        tem_ficha_tecnica: false,
        ativo: true,
        observacoes: "",
      });
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <Button type="button" size="sm" variant="default" onClick={() => setOpen(true)}>
        + Novo item
      </Button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: 16,
        display: "grid",
        gridTemplateColumns: "2fr 1fr 120px 120px 120px",
        gap: 8,
        alignItems: "end",
      }}
    >
      <Field label="Nome *" error={errors.nome?.message}>
        <Input {...register("nome")} placeholder="Ex.: Risotto de Camarão" />
      </Field>
      <Field label="Categoria">
        <select
          {...register("categoria")}
          className="h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm"
        >
          {CMV_CATEGORIA_OPTIONS.map((c) => (
            <option key={c} value={c}>
              {c.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Preço (R$) *" error={errors.preco_venda?.message}>
        <Input type="number" step="0.01" {...register("preco_venda")} />
      </Field>
      <Field label="Custo (R$)">
        <Input type="number" step="0.01" {...register("custo_total")} />
      </Field>
      <Field label="">
        <div style={{ display: "flex", gap: 6 }}>
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : null}
            Criar
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
        </div>
      </Field>
      <Field label="" span={5}>
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
          <input type="checkbox" {...register("tem_ficha_tecnica")} />
          Tem ficha técnica
        </label>
        {submitError && (
          <span style={{ fontSize: 11, color: "#EF4444", marginLeft: 16 }}>
            {submitError}
          </span>
        )}
      </Field>
    </form>
  );
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
      {label && (
        <Label style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 600 }}>
          {label}
        </Label>
      )}
      {children}
      {error && <span style={{ fontSize: 11, color: "#EF4444" }}>{error}</span>}
    </div>
  );
}
