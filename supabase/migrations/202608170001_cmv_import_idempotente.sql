ALTER TABLE public.produtos_relatorio
  ADD COLUMN IF NOT EXISTS cfop text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_produtos_relatorio_nota_item
  ON public.produtos_relatorio (unit_id, nr_danfe, item_codigo)
  NULLS NOT DISTINCT;

ALTER TABLE public.produtos_relatorio
  DROP CONSTRAINT IF EXISTS produtos_relatorio_upsert_key;
