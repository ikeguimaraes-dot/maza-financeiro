-- ============================================================
-- 024_titulo_override.sql
-- Reclassificação PONTUAL de um título: move um título específico da
-- titulos_a_pagar para outra linha da DRE (precedência sobre mapa_conta_dre).
-- Correção do mês corrente — o usuário corrige no Everest em paralelo, então no
-- próximo import a fonte já vem certa. Projeto: iqgrvptrtphvbmvrqntm.
-- Execute no Supabase Dashboard > SQL Editor.
-- ============================================================

create table if not exists public.titulo_override (
  id                  uuid primary key default gen_random_uuid(),
  titulo_id           text not null unique,   -- titulos_a_pagar.id
  linha_dre_corrigida text,
  observacao          text,
  criado_em           timestamptz default now()
);

create index if not exists idx_titulo_override_titulo on public.titulo_override(titulo_id);

alter table public.titulo_override enable row level security;
drop policy if exists "titulo_override_read" on public.titulo_override;
create policy "titulo_override_read" on public.titulo_override for select to authenticated, anon using (true);
drop policy if exists "titulo_override_manage" on public.titulo_override;
create policy "titulo_override_manage" on public.titulo_override for all to service_role using (true) with check (true);
