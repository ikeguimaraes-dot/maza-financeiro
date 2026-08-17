-- ============================================================
-- 026_protestos.sql
-- Módulo Protestos (Contas a Pagar): certidões de protesto (PDF de
-- tabelião) e os protestos individuais extraídos delas.
-- Projeto Supabase vinculado ao repositório maza-financeiro.
-- unit_id é resolvido no servidor a partir do CNPJ do devedor lido no PDF
-- (contra units.cnpj) — null quando nenhuma unidade bate com o CNPJ (fica
-- visível só na visão "todas as unidades", mesmo padrão de unit_id null
-- usado no resto do módulo financeiro).
-- Execute no Supabase Dashboard > SQL Editor.
-- ============================================================

-- ── Tabelas ───────────────────────────────────────────────────────────────────
create table if not exists public.protestos_certidoes (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid,                          -- null = CNPJ do devedor não bateu com nenhuma unidade
  data_certidao date,
  nome_devedor text,
  cnpj_devedor text,
  protestos_declarados int not null,     -- "00NN PROTESTO(S)" do cabeçalho — checksum já validado no parser
  storage_path text not null,
  nome_arquivo text not null,
  tamanho_bytes bigint,
  created_at timestamptz default now()
);

create table if not exists public.protestos_registros (
  id uuid primary key default gen_random_uuid(),
  certidao_id uuid not null references public.protestos_certidoes(id) on delete cascade,
  numero_registro int not null,          -- "REGISTRO Nº N" dentro da certidão
  apresentante text,
  cnpj_apresentante text,
  especie text,
  protocolo_e_data text,
  motivo text,
  data_protesto date,
  emissao date,
  vencimento text,                       -- pode ser data ou texto (ex.: "A Vista")
  valor_titulo numeric(14,2),
  valor_protestado numeric(14,2),
  valor_para_cancelar numeric(14,2),
  numero_titulo text,
  tipo_notificacao text,                 -- ausente em espécies que não são CDA (duplicatas)
  livro_folha text,
  situacao text not null check (situacao in ('em_aberto', 'cancelado')),
  created_at timestamptz default now()
);

-- Idempotência: reimportar a mesma certidão faz upsert em vez de duplicar.
create unique index if not exists uq_protestos_certidoes_devedor_data
  on public.protestos_certidoes (cnpj_devedor, data_certidao)
  nulls not distinct;

create unique index if not exists uq_protestos_registros_certidao_numero
  on public.protestos_registros (certidao_id, numero_registro);

create index if not exists idx_protestos_certidoes_unit on public.protestos_certidoes(unit_id);
create index if not exists idx_protestos_registros_certidao on public.protestos_registros(certidao_id);
create index if not exists idx_protestos_registros_situacao on public.protestos_registros(situacao);

-- ── Storage: bucket privado para os PDFs das certidões ─────────────────────────
insert into storage.buckets (id, name, public)
values ('protestos', 'protestos', false)
on conflict (id) do nothing;

-- ── RLS (leitura anon/authenticated, escrita service_role) ────────────────────
-- As rotas de API usam service_role (bypassa RLS); estas policies só liberam
-- leitura caso algum acesso anônimo seja usado no futuro.
alter table public.protestos_certidoes enable row level security;
alter table public.protestos_registros enable row level security;

drop policy if exists "protestos_certidoes_read" on public.protestos_certidoes;
create policy "protestos_certidoes_read" on public.protestos_certidoes for select to authenticated, anon using (true);
drop policy if exists "protestos_certidoes_manage" on public.protestos_certidoes;
create policy "protestos_certidoes_manage" on public.protestos_certidoes for all to service_role using (true) with check (true);

drop policy if exists "protestos_registros_read" on public.protestos_registros;
create policy "protestos_registros_read" on public.protestos_registros for select to authenticated, anon using (true);
drop policy if exists "protestos_registros_manage" on public.protestos_registros;
create policy "protestos_registros_manage" on public.protestos_registros for all to service_role using (true) with check (true);
