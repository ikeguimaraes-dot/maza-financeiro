-- ============================================================
-- 202609110001_conferencias.sql
-- Tela de Conferência (/financeiro/aprovacoes) — alertas são sempre
-- CALCULADOS na leitura a partir do dado que já existe (titulos_a_pagar,
-- fornecedores_depara, produtos_catalogo, etc.). Nenhuma tabela de alerta,
-- nenhum job, nenhum cache — só a decisão humana persiste.
--
-- assinatura = hash do valor do alerta no momento da conferência. Se o
-- valor recalculado divergir, o alerta reaparece na lista de ativos com a
-- marca "valor mudou desde a conferência" — nunca fica escondido um
-- problema que voltou.
-- Execute via `supabase db query --linked --file`. NUNCA db push.
-- ============================================================

CREATE TABLE public.conferencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL REFERENCES public.units(id),
  competencia date NOT NULL,
  alerta_chave text NOT NULL,
  assinatura text NOT NULL,
  status text NOT NULL CHECK (status = ANY (ARRAY['conferido', 'ignorado'])),
  observacao text,
  conferido_por text,
  conferido_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (alerta_chave, unit_id, competencia)
);

CREATE INDEX idx_conferencias_unit_competencia ON public.conferencias(unit_id, competencia);

ALTER TABLE public.conferencias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "conferencias_read" ON public.conferencias FOR SELECT TO authenticated USING (true);
CREATE POLICY "conferencias_manage" ON public.conferencias FOR ALL TO service_role USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
