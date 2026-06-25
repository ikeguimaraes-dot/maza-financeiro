-- ============================================================
-- 023_mapa_conta_dre.sql
-- Fundação da DRE automática de despesas: tabela DE-PARA que classifica cada
-- conta gerencial do Everest (titulos_a_pagar.descricao_c_gerencial) numa
-- linha da DRE. Regime de CAIXA (v_titulo do mês entra no mês).
-- Projeto: iqgrvptrtphvbmvrqntm (mesmo de titulos_a_pagar).
-- Execute no Supabase Dashboard > SQL Editor.
-- ============================================================

create table if not exists public.mapa_conta_dre (
  id                    uuid primary key default gen_random_uuid(),
  descricao_c_gerencial text not null unique,   -- a conta do Everest (valor exato)
  linha_dre             text,                    -- Ocupação | Utilidades | Operação | Manutenção | Administrativo | CMV | Pessoal | Impostos | Despesas Financeiras | Marketing | Taxas Cartão
  esperada_mensal       boolean default false,   -- deve aparecer todo mês
  criado_em             timestamptz default now(),
  atualizado_em         timestamptz default now()
);

alter table public.mapa_conta_dre enable row level security;
drop policy if exists "mapa_conta_dre_read" on public.mapa_conta_dre;
create policy "mapa_conta_dre_read" on public.mapa_conta_dre for select to authenticated, anon using (true);
drop policy if exists "mapa_conta_dre_manage" on public.mapa_conta_dre;
create policy "mapa_conta_dre_manage" on public.mapa_conta_dre for all to service_role using (true) with check (true);

-- ── Seed inicial (nomes EXATOS de descricao_c_gerencial no banco) ─────────────
-- ON CONFLICT DO NOTHING: re-rodar não sobrescreve reclassificações manuais.
insert into public.mapa_conta_dre (descricao_c_gerencial, linha_dre, esperada_mensal) values
  -- CMV
  ('BOVINOS',                          'CMV', false),
  ('VINHOS',                           'CMV', false),
  ('DESTILADOS',                       'CMV', false),
  ('PESCADOS E FRUTOS DO MAR',         'CMV', false),
  ('QUEIJOS  E LATICINIOS',            'CMV', false),   -- dois espaços (valor real)
  ('FRUTAS',                           'CMV', false),
  ('SECOS E CONSERVAS',                'CMV', false),
  ('PAES, MASSAS E SALGADOS',          'CMV', false),
  ('CHOPP E CERVEJAS',                 'CMV', false),
  ('EMBUTIDOS',                        'CMV', false),
  ('AGUA, SUCO, CAFE E REFRIGERANTE',  'CMV', false),
  ('OUTRAS DEBIDAS NAO ALCOOLICAS',    'CMV', false),   -- "DEBIDAS" é o valor real (typo do Everest)
  ('OUTRAS BEBIDAS ALCOOLICAS',        'CMV', false),
  ('ALIMENTACAO DE FUNCIONARIOS',      'CMV', false),
  -- Ocupação
  ('ALUGUEIS',                         'Ocupação', true),
  -- Utilidades
  ('GAS NATURAL',                      'Utilidades', true),
  -- Operação
  ('MATERIAIS DE LIMPEZA',             'Operação', false),
  ('PRODUTOS DE HIGIENE CLIENTES',     'Operação', false),
  ('DESCARTAVEIS',                     'Operação', false),
  ('OUTROS MATERIAIS DE CONSUMO',      'Operação', false),
  -- Manutenção
  ('OUTROS SERVICOS/MATERIAIS DE MANUTENCAO', 'Manutenção', false),
  -- Administrativo
  ('MATERIAIS DE ESCRITORIO',          'Administrativo', false),
  ('SISTEMAS E SOFTWARE',              'Administrativo', false),
  ('PAGAMENTO M.O PJ',                 'Administrativo', false),
  ('COMBUSTIVEL',                      'Administrativo', false)
on conflict (descricao_c_gerencial) do nothing;
