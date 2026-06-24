-- ============================================================
-- 022_contratos.sql
-- Módulo Contratos: gestão de contratos (PDF) do grupo KPH.
-- Projeto Supabase: iqgrvptrtphvbmvrqntm.
-- unit_id NULL = contrato da holding KPH (vale para o grupo todo).
-- Execute no Supabase Dashboard > SQL Editor.
-- ============================================================

-- ── Tabelas ───────────────────────────────────────────────────────────────────
create table if not exists public.contratos (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid,                          -- null = KPH Holding (grupo)
  titulo text not null,
  categoria text not null,               -- locacao | seguro | software | servico | consultoria | fornecimento | manutencao | marketing | sociedade | financiamento | licenca | outro
  contraparte text not null,
  contraparte_doc text,                  -- CNPJ ou CPF
  responsavel text,
  valor numeric(14,2) default 0,
  recorrencia text,                      -- mensal | anual | trimestral | unico | consignacao | nenhuma
  data_inicio date,
  data_fim date,                         -- null = vigência indeterminada
  vigencia_indeterminada boolean default false,
  renovacao_automatica boolean default false,
  aviso_previo_dias int default 0,       -- prazo de aviso para encerrar/não renovar
  indice_reajuste text,                  -- IGP-M | IPCA | INPC | fixo | nenhum
  data_proximo_reajuste date,
  multa_rescisoria text,
  status_manual text,                    -- null = derivado por data | em_negociacao | encerrado | rascunho
  tags text[],
  observacoes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.contratos_arquivos (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid not null references public.contratos(id) on delete cascade,
  tipo text not null default 'principal',  -- principal | aditivo | anexo
  nome text not null,
  storage_path text not null,
  tamanho_bytes bigint,
  content_type text default 'application/pdf',
  uploaded_at timestamptz default now()
);

create index if not exists idx_contratos_unit on public.contratos(unit_id);
create index if not exists idx_contratos_fim on public.contratos(data_fim);
create index if not exists idx_arquivos_contrato on public.contratos_arquivos(contrato_id);

-- ── Storage: bucket privado para os PDFs ──────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('contratos', 'contratos', false)
on conflict (id) do nothing;

-- ── RLS (leitura anon/authenticated, escrita service_role) ────────────────────
-- As rotas de API usam service_role (bypassa RLS); estas policies só liberam
-- leitura caso algum acesso anônimo seja usado no futuro.
alter table public.contratos          enable row level security;
alter table public.contratos_arquivos enable row level security;

drop policy if exists "contratos_read" on public.contratos;
create policy "contratos_read" on public.contratos for select to authenticated, anon using (true);
drop policy if exists "contratos_manage" on public.contratos;
create policy "contratos_manage" on public.contratos for all to service_role using (true) with check (true);

drop policy if exists "contratos_arq_read" on public.contratos_arquivos;
create policy "contratos_arq_read" on public.contratos_arquivos for select to authenticated, anon using (true);
drop policy if exists "contratos_arq_manage" on public.contratos_arquivos;
create policy "contratos_arq_manage" on public.contratos_arquivos for all to service_role using (true) with check (true);
