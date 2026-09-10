-- ============================================================
-- 202609100002_reconciliacoes_sugeridas.sql
-- Título que pode corresponder a uma NF-e de entrada já lançada não é
-- deduplicado automaticamente (nome livre em titulos_a_pagar casa mal, e o
-- erro de um dedup automático é assimétrico: falso positivo apaga uma
-- despesa real sem ninguém perceber). Em vez disso, o par é registrado aqui
-- como sugestão; um humano confirma na tela da Fase 7. Só quando
-- status='confirmada' o lançamento do título deixa de contar no razão.
-- Execute via `supabase db query --linked --file`. NUNCA db push.
-- ============================================================

CREATE TABLE public.reconciliacoes_sugeridas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL,
  titulo_id text NOT NULL,
  chave_nfe text NOT NULL,
  score numeric(5,2) NOT NULL,
  valor_titulo numeric(16,2) NOT NULL,
  valor_nfe numeric(16,2) NOT NULL,
  dias_diferenca int NOT NULL,
  status text NOT NULL DEFAULT 'sugerida' CHECK (status IN ('sugerida', 'confirmada', 'rejeitada')),
  criado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (titulo_id, chave_nfe)
);

ALTER TABLE public.reconciliacoes_sugeridas ENABLE ROW LEVEL SECURITY;

CREATE POLICY reconciliacoes_sugeridas_read   ON public.reconciliacoes_sugeridas FOR SELECT TO authenticated USING (true);
CREATE POLICY reconciliacoes_sugeridas_manage ON public.reconciliacoes_sugeridas FOR ALL    TO service_role   USING (true) WITH CHECK (true);

-- Σ valor de títulos com sugestão em status='sugerida' — enquanto não
-- resolvida, o EBITDA no kpi_snapshot está subestimado (compra contada
-- duas vezes: uma no lançamento de NF-e, outra no lançamento de título).
ALTER TABLE public.kpi_snapshot ADD COLUMN possivel_dupla_contagem numeric(16,2);

NOTIFY pgrst, 'reload schema';
