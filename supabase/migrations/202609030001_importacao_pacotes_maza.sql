create extension if not exists pgcrypto;

create table if not exists public.financeiro_importacoes (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.units(id),
  tipo text not null check (tipo in ('nf_entrada', 'contas_pagar', 'receita', 'folha')),
  arquivo text not null,
  checksum_sha256 text not null,
  storage_path text,
  registros integer not null default 0,
  totais jsonb not null default '{}'::jsonb,
  avisos jsonb not null default '[]'::jsonb,
  status text not null default 'processando' check (status in ('processando', 'concluido', 'erro')),
  erro text,
  criado_por uuid references auth.users(id),
  criado_em timestamptz not null default now(),
  concluido_em timestamptz,
  unique (unit_id, checksum_sha256)
);

alter table public.produtos_relatorio
  add column if not exists importacao_id uuid references public.financeiro_importacoes(id),
  add column if not exists observacao_origem text,
  add column if not exists desconto_origem numeric(14,2),
  add column if not exists pedido_origem text;

alter table public.titulos_a_pagar
  add column if not exists importacao_id uuid references public.financeiro_importacoes(id),
  add column if not exists valor_total_nf_origem numeric(14,2),
  add column if not exists liquidacao_origem text;

alter table public.lorean_workdays
  add column if not exists importacao_id uuid references public.financeiro_importacoes(id),
  add column if not exists gorjeta_colaborador numeric(14,2),
  add column if not exists gorjeta_casa numeric(14,2),
  add column if not exists gorjeta_terceiro numeric(14,2);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('financeiro-importacoes', 'financeiro-importacoes', false, 52428800, array['application/zip'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

alter table public.financeiro_importacoes enable row level security;
drop policy if exists financeiro_importacoes_read on public.financeiro_importacoes;
create policy financeiro_importacoes_read on public.financeiro_importacoes for select to authenticated
using (public.kph_has_role_for_unit(unit_id));

drop policy if exists financeiro_importacoes_storage_read on storage.objects;
create policy financeiro_importacoes_storage_read on storage.objects for select to authenticated
using (bucket_id = 'financeiro-importacoes' and public.kph_has_role_for_unit(((storage.foldername(name))[1])::uuid));
