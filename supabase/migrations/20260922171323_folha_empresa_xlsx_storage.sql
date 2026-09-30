UPDATE storage.buckets
SET allowed_mime_types = array_append(allowed_mime_types, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
WHERE id = 'folha-documentos'
  AND allowed_mime_types IS NOT NULL
  AND NOT ('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' = ANY(allowed_mime_types));
