update storage.buckets
set allowed_mime_types = array['application/zip', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
where id = 'financeiro-importacoes';
