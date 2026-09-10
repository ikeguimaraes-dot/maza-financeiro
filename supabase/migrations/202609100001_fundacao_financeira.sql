-- ============================================================
-- 202609100001_fundacao_financeira.sql
-- Fundação do razão financeiro: plano de contas, lançamentos (projeção
-- idempotente a partir das fontes), regras de classificação, metas e
-- snapshots (DRE e KPIs). Ninguém digita direto no razão — ele é
-- delete+insert por (origem, unidade, competência), gerado por função.
-- RLS segue o padrão de produtos_relatorio: SELECT para authenticated,
-- ALL para service_role (sql/025 só criou SELECT e quebrou a importação —
-- aqui as duas policies vêm juntas, sempre).
-- Execute via `supabase db query --linked --file`. NUNCA db push.
-- ============================================================

CREATE TABLE public.plano_contas (
  codigo text PRIMARY KEY,
  nome text NOT NULL,
  grupo text NOT NULL CHECK (grupo IN (
    'receita', 'deducao', 'cmv', 'mao_de_obra',
    'despesa_operacional', 'financeiro', 'investimento'
  )),
  ordem int NOT NULL,
  ncm_capitulos text[],
  ativo boolean NOT NULL DEFAULT true
);

CREATE TABLE public.lancamentos (
  id bigserial PRIMARY KEY,
  unit_id uuid NOT NULL,
  data date NOT NULL,
  competencia date NOT NULL,
  conta_codigo text NOT NULL REFERENCES public.plano_contas(codigo),
  valor numeric(16,2) NOT NULL,
  origem text NOT NULL CHECK (origem IN (
    'nfe_entrada', 'titulo', 'folha', 'receita', 'inventario', 'manual'
  )),
  origem_id text NOT NULL,
  descricao text,
  fornecedor_cnpj text,
  fornecedor_nome text,
  produto_id uuid,
  reconciliado boolean NOT NULL DEFAULT false,
  criado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (origem, origem_id, conta_codigo)
);

CREATE INDEX lancamentos_unit_competencia_idx ON public.lancamentos(unit_id, competencia);
CREATE INDEX lancamentos_conta_codigo_idx ON public.lancamentos(conta_codigo);
CREATE INDEX lancamentos_origem_idx ON public.lancamentos(origem, origem_id);

CREATE TABLE public.regras_classificacao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid,
  tipo text NOT NULL CHECK (tipo IN ('fornecedor_cnpj', 'fornecedor_nome', 'descricao_contem')),
  padrao text NOT NULL,
  conta_codigo text NOT NULL REFERENCES public.plano_contas(codigo),
  prioridade int NOT NULL DEFAULT 100,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.metas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL,
  competencia date NOT NULL,
  chave text NOT NULL,
  valor numeric(16,4) NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('absoluto', 'pct_receita_liquida')),
  origem text NOT NULL DEFAULT 'baseline' CHECK (origem IN ('baseline', 'manual')),
  criado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (unit_id, competencia, chave)
);

CREATE TABLE public.dre_snapshot (
  unit_id uuid NOT NULL,
  competencia date NOT NULL,
  conta_codigo text NOT NULL REFERENCES public.plano_contas(codigo),
  valor numeric(16,2) NOT NULL,
  qtd_lancamentos int NOT NULL,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (unit_id, competencia, conta_codigo)
);

CREATE TABLE public.kpi_snapshot (
  unit_id uuid NOT NULL,
  competencia date NOT NULL,
  receita_bruta numeric(16,2),
  receita_liquida numeric(16,2),
  cmv_compras numeric(16,2),
  mao_de_obra numeric(16,2),
  despesas_operacionais numeric(16,2),
  ebitda numeric(16,2),
  cmv_compras_pct numeric(8,4),
  mo_pct numeric(8,4),
  prime_cost_pct numeric(8,4),
  ebitda_pct numeric(8,4),
  clientes int,
  ticket_medio numeric(12,2),
  cmv_por_cliente numeric(12,2),
  tem_nfe boolean NOT NULL DEFAULT false,
  pct_classificado numeric(8,4),
  fontes_ok int,
  fontes_total int,
  confianca_pct numeric(8,4),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (unit_id, competencia)
);

-- ── Seed do plano de contas — exatamente as 36 contas especificadas ──────────

INSERT INTO public.plano_contas (codigo, nome, grupo, ordem, ncm_capitulos) VALUES
  ('1.01', 'Receita — salão',                       'receita',              10,  NULL),
  ('1.02', 'Receita — delivery/apps',                'receita',              20,  NULL),
  ('1.03', 'Receita — eventos',                      'receita',              30,  NULL),
  ('1.04', 'Outras receitas',                        'receita',              40,  NULL),
  ('2.01', 'Cancelamentos e descontos',               'deducao',             110, NULL),
  ('2.02', 'Taxas de cartão',                         'deducao',             120, NULL),
  ('2.03', 'Comissões de delivery',                   'deducao',             130, NULL),
  ('2.04', 'Impostos sobre vendas',                   'deducao',             140, NULL),
  ('3.01', 'CMV — carnes',                            'cmv',                 210, ARRAY['02']),
  ('3.02', 'CMV — pescados',                          'cmv',                 220, ARRAY['03']),
  ('3.03', 'CMV — laticínios e ovos',                 'cmv',                 230, ARRAY['04']),
  ('3.04', 'CMV — hortifrúti',                        'cmv',                 240, ARRAY['07','08']),
  ('3.05', 'CMV — secos e mercearia',                 'cmv',                 250, ARRAY['09','10','11','12','15','16','17','18','19','20','21']),
  ('3.06', 'CMV — bebidas',                           'cmv',                 260, ARRAY['22']),
  ('3.07', 'CMV — variação de estoque',                'cmv',                 270, NULL),
  ('4.01', 'Salários',                                'mao_de_obra',         310, NULL),
  ('4.02', 'Encargos',                                'mao_de_obra',         320, NULL),
  ('4.03', 'Benefícios',                              'mao_de_obra',         330, NULL),
  ('4.04', 'Extras e freelancers',                    'mao_de_obra',         340, NULL),
  ('4.05', 'Rescisões',                               'mao_de_obra',         350, NULL),
  ('5.01', 'Ocupação',                                'despesa_operacional', 410, NULL),
  ('5.02', 'Utilidades',                              'despesa_operacional', 420, NULL),
  ('5.03', 'Marketing',                               'despesa_operacional', 430, NULL),
  ('5.04', 'Manutenção',                              'despesa_operacional', 440, NULL),
  ('5.05', 'Administrativo',                          'despesa_operacional', 450, NULL),
  ('5.06', 'Descartáveis, embalagens e limpeza',      'despesa_operacional', 460, ARRAY['34','39','48','56']),
  ('5.07', 'Logística e motoboy',                     'despesa_operacional', 470, NULL),
  ('5.08', 'Outras despesas',                         'despesa_operacional', 480, NULL),
  ('6.01', 'Juros e multas',                          'financeiro',          510, NULL),
  ('6.02', 'Tarifas bancárias',                       'financeiro',          520, NULL),
  ('6.03', 'Antecipação de recebíveis',                'financeiro',          530, NULL),
  ('7.01', 'Equipamentos',                            'investimento',        610, ARRAY['84','85','94']),
  ('7.02', 'Reformas e obras',                        'investimento',        620, NULL),
  ('9.99', 'A classificar',                           'despesa_operacional', 999, NULL);

-- ── RLS: SELECT authenticated, ALL service_role — em todas as 6 tabelas ─────

ALTER TABLE public.plano_contas         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lancamentos          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.regras_classificacao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metas                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dre_snapshot         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kpi_snapshot         ENABLE ROW LEVEL SECURITY;

CREATE POLICY plano_contas_read   ON public.plano_contas         FOR SELECT TO authenticated USING (true);
CREATE POLICY plano_contas_manage ON public.plano_contas         FOR ALL    TO service_role   USING (true) WITH CHECK (true);

CREATE POLICY lancamentos_read    ON public.lancamentos          FOR SELECT TO authenticated USING (true);
CREATE POLICY lancamentos_manage  ON public.lancamentos          FOR ALL    TO service_role   USING (true) WITH CHECK (true);

CREATE POLICY regras_classificacao_read   ON public.regras_classificacao FOR SELECT TO authenticated USING (true);
CREATE POLICY regras_classificacao_manage ON public.regras_classificacao FOR ALL    TO service_role   USING (true) WITH CHECK (true);

CREATE POLICY metas_read           ON public.metas                FOR SELECT TO authenticated USING (true);
CREATE POLICY metas_manage         ON public.metas                FOR ALL    TO service_role   USING (true) WITH CHECK (true);

CREATE POLICY dre_snapshot_read    ON public.dre_snapshot         FOR SELECT TO authenticated USING (true);
CREATE POLICY dre_snapshot_manage  ON public.dre_snapshot         FOR ALL    TO service_role   USING (true) WITH CHECK (true);

CREATE POLICY kpi_snapshot_read    ON public.kpi_snapshot         FOR SELECT TO authenticated USING (true);
CREATE POLICY kpi_snapshot_manage  ON public.kpi_snapshot         FOR ALL    TO service_role   USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
