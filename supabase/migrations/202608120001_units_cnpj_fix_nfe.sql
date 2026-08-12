-- Vincula cada unidade ao CNPJ fiscal e corrige o pacote Yoshimori que foi
-- importado enquanto a unidade IKY estava selecionada.
ALTER TABLE public.units ADD COLUMN IF NOT EXISTS cnpj TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS units_cnpj_key
  ON public.units(cnpj) WHERE cnpj IS NOT NULL;

UPDATE public.units SET cnpj = '63092631000106'
WHERE id = '674eac8c-5a38-4a42-aa60-0a666387909b';

UPDATE public.units SET cnpj = '36332164000163'
WHERE id = '674eac8c-5a38-4a42-aa60-0a666387909c';

-- Primeiro move os itens usando as chaves fiscais ainda identificadas no lote.
UPDATE public.produtos_relatorio p
SET unit_id = '674eac8c-5a38-4a42-aa60-0a666387909c'
WHERE p.unit_id = '674eac8c-5a38-4a42-aa60-0a666387909b'
  AND p.chave_nfe IN (
    SELECT d.chave FROM public.nfe_documentos d
    WHERE d.unit_id = '674eac8c-5a38-4a42-aa60-0a666387909b'
      AND d.direcao = 'saida'
      AND d.emitente_cnpj = '36332164000163'
  );

UPDATE public.nfe_documentos
SET unit_id = '674eac8c-5a38-4a42-aa60-0a666387909c'
WHERE unit_id = '674eac8c-5a38-4a42-aa60-0a666387909b'
  AND direcao = 'saida'
  AND emitente_cnpj = '36332164000163';

UPDATE public.nfe_importacoes
SET unit_id = '674eac8c-5a38-4a42-aa60-0a666387909c'
WHERE unit_id = '674eac8c-5a38-4a42-aa60-0a666387909b'
  AND arquivo = 'pFtRh4Zw.zip'
  AND direcao = 'saida';
