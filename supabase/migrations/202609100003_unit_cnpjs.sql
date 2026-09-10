-- ============================================================
-- 202609100003_unit_cnpjs.sql
-- Cada unidade tem N CNPJs (a entidade que paga a folha é diferente da que
-- compra). Esta tabela mapeia CNPJ → unidade por papel, sem exigir mudança
-- de código quando novos CNPJs forem confirmados.
-- Seed: SOMENTE os dois CNPJs de folha confirmados pelo Ike a partir dos
-- extratos reais. CNPJ de compras chega depois, separadamente — não inferir.
-- units.cnpj e importNfe() não são tocados nesta fase.
-- Execute via `supabase db query --linked --file`. NUNCA db push.
-- ============================================================

CREATE TABLE public.unit_cnpjs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL REFERENCES public.units(id),
  cnpj text NOT NULL,
  razao_social text,
  papel text NOT NULL CHECK (papel IN ('folha', 'compras', 'faturamento')),
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cnpj)
);

CREATE INDEX unit_cnpjs_unit_id_idx ON public.unit_cnpjs(unit_id);

ALTER TABLE public.unit_cnpjs ENABLE ROW LEVEL SECURITY;

CREATE POLICY unit_cnpjs_read   ON public.unit_cnpjs FOR SELECT TO authenticated USING (true);
CREATE POLICY unit_cnpjs_manage ON public.unit_cnpjs FOR ALL    TO service_role   USING (true) WITH CHECK (true);

-- ── Seed: apenas os dois CNPJs de folha confirmados pelos extratos reais ────
-- Atenção: a razão social NÃO corresponde ao nome da unidade operacional.

INSERT INTO public.unit_cnpjs (unit_id, cnpj, razao_social, papel) VALUES
  ('674eac8c-5a38-4a42-aa60-0a666387909c', '39268770000155', 'IKY RESTAURANTES LTDA', 'folha'),
  ('674eac8c-5a38-4a42-aa60-0a666387909b', '63116533000153', 'MZ DELIVERY LTDA', 'folha');

NOTIFY pgrst, 'reload schema';
