alter table public.dre_folha
  add column if not exists total_proventos numeric not null default 0,
  add column if not exists total_descontos numeric not null default 0,
  add column if not exists valor_liquido numeric not null default 0,
  add column if not exists base_inss numeric not null default 0,
  add column if not exists base_fgts numeric not null default 0,
  add column if not exists fgts_mes numeric not null default 0,
  add column if not exists base_irrf numeric not null default 0,
  add column if not exists gorjeta numeric not null default 0,
  add column if not exists verbas jsonb not null default '[]'::jsonb,
  add column if not exists documento_path text,
  add column if not exists documento_nome text,
  add column if not exists documento_pagina integer,
  add column if not exists texto_origem text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('folha-documentos', 'folha-documentos', false, 20971520, array['application/pdf'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create index if not exists idx_dre_folha_documento on public.dre_folha (unit_id, competencia, documento_path);
