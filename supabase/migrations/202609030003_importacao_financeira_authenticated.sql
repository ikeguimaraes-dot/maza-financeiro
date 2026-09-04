-- A importação pelo site usa a sessão do usuário e só pode operar nas
-- unidades às quais ele já possui acesso.

drop policy if exists financeiro_importacoes_manage on public.financeiro_importacoes;
create policy financeiro_importacoes_manage on public.financeiro_importacoes
  for all to authenticated
  using (public.kph_has_role_for_unit(unit_id))
  with check (public.kph_has_role_for_unit(unit_id));

alter table public.titulos_a_pagar enable row level security;
drop policy if exists titulos_a_pagar_unit_manage on public.titulos_a_pagar;
create policy titulos_a_pagar_unit_manage on public.titulos_a_pagar
  for all to authenticated
  using (public.kph_has_role_for_unit(unit_id))
  with check (public.kph_has_role_for_unit(unit_id));

alter table public.produtos_relatorio enable row level security;
drop policy if exists produtos_relatorio_unit_manage on public.produtos_relatorio;
create policy produtos_relatorio_unit_manage on public.produtos_relatorio
  for all to authenticated
  using (public.kph_has_role_for_unit(unit_id))
  with check (public.kph_has_role_for_unit(unit_id));

drop policy if exists financeiro_importacoes_storage_insert on storage.objects;
create policy financeiro_importacoes_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'financeiro-importacoes'
    and public.kph_has_role_for_unit(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists financeiro_importacoes_storage_update on storage.objects;
create policy financeiro_importacoes_storage_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'financeiro-importacoes'
    and public.kph_has_role_for_unit(((storage.foldername(name))[1])::uuid)
  )
  with check (
    bucket_id = 'financeiro-importacoes'
    and public.kph_has_role_for_unit(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists financeiro_importacoes_storage_delete on storage.objects;
create policy financeiro_importacoes_storage_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'financeiro-importacoes'
    and public.kph_has_role_for_unit(((storage.foldername(name))[1])::uuid)
  );
