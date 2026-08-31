drop policy if exists dre_folha_unit_write on public.dre_folha;
create policy dre_folha_unit_write on public.dre_folha
  for all to authenticated
  using (public.kph_has_role_for_unit(unit_id))
  with check (public.kph_has_role_for_unit(unit_id));

drop policy if exists folha_documentos_read on storage.objects;
create policy folha_documentos_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'folha-documentos'
    and public.kph_has_role_for_unit(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists folha_documentos_write on storage.objects;
create policy folha_documentos_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'folha-documentos'
    and public.kph_has_role_for_unit(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists folha_documentos_delete on storage.objects;
create policy folha_documentos_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'folha-documentos'
    and public.kph_has_role_for_unit(((storage.foldername(name))[1])::uuid)
  );
