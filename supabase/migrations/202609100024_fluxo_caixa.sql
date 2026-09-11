-- ============================================================
-- 202609100024_fluxo_caixa.sql
-- FASE 8: Fluxo de Caixa (DESEMBOLSO) — visão separada do DRE
-- (COMPETÊNCIA, lancamentos/dre_snapshot). Não reaproveita nenhuma
-- tabela existente; lê fontes com data de movimentação real
-- (titulos_a_pagar.d_vencimento/liquidacao_origem, receita_pagamentos,
-- e futuramente extrato bancário/adquirente de cartão).
--
-- contas_bancarias / movimentacoes_caixa: hoje ficam vazias (importador
-- de extrato é fase separada) — a tela mostra só o previsto até lá.
-- recebiveis_cartao: schema pronto pra granularidade de antecipação
-- (Ike usa hoje na operação), populado manualmente ou por integração
-- futura com adquirente — modalidade 'voucher' cobre SODEXO (vale-
-- refeição/benefício, prazo próprio, NÃO é 'app' — isso fica reservado
-- pra quando delivery entrar).
-- Execute via `supabase db query --linked --file`. NUNCA db push.
-- ============================================================

CREATE TABLE public.contas_bancarias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL REFERENCES public.units(id),
  banco text NOT NULL,
  apelido text,
  saldo_inicial numeric(16,2) NOT NULL DEFAULT 0,
  data_saldo_inicial date NOT NULL,
  ativo boolean NOT NULL DEFAULT true
);

CREATE TABLE public.movimentacoes_caixa (
  id bigserial PRIMARY KEY,
  unit_id uuid NOT NULL REFERENCES public.units(id),
  conta_id uuid REFERENCES public.contas_bancarias(id),
  data date NOT NULL,
  tipo text NOT NULL CHECK (tipo = ANY (ARRAY['entrada', 'saida'])),
  valor numeric(16,2) NOT NULL,
  descricao text,
  origem text NOT NULL CHECK (origem = ANY (ARRAY['extrato', 'titulo', 'receita', 'manual'])),
  origem_id text,
  conta_codigo text REFERENCES public.plano_contas(codigo),
  conciliado boolean NOT NULL DEFAULT false,
  criado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (origem, origem_id)
);

CREATE INDEX idx_movimentacoes_caixa_unit_data ON public.movimentacoes_caixa(unit_id, data);

CREATE TABLE public.recebiveis_cartao (
  id bigserial PRIMARY KEY,
  unit_id uuid NOT NULL REFERENCES public.units(id),
  data_venda date NOT NULL,
  bandeira text,
  modalidade text NOT NULL CHECK (modalidade = ANY (ARRAY['debito', 'credito', 'credito_parcelado', 'voucher', 'app'])),
  valor_bruto numeric(16,2) NOT NULL,
  taxa_adquirente numeric(16,2),
  data_prevista date,
  antecipado boolean NOT NULL DEFAULT false,
  data_antecipacao date,
  taxa_antecipacao numeric(16,2),
  valor_liquido numeric(16,2)
);

CREATE INDEX idx_recebiveis_cartao_unit_data ON public.recebiveis_cartao(unit_id, data_venda);

ALTER TABLE public.contas_bancarias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movimentacoes_caixa ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recebiveis_cartao ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contas_bancarias_read" ON public.contas_bancarias FOR SELECT TO authenticated USING (true);
CREATE POLICY "contas_bancarias_manage" ON public.contas_bancarias FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "movimentacoes_caixa_read" ON public.movimentacoes_caixa FOR SELECT TO authenticated USING (true);
CREATE POLICY "movimentacoes_caixa_manage" ON public.movimentacoes_caixa FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "recebiveis_cartao_read" ON public.recebiveis_cartao FOR SELECT TO authenticated USING (true);
CREATE POLICY "recebiveis_cartao_manage" ON public.recebiveis_cartao FOR ALL TO service_role USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
