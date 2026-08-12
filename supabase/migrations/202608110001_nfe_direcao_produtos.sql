-- Separa os itens de NF-e de entrada e saída no relatório de produtos.
ALTER TABLE public.produtos_relatorio
  ADD COLUMN IF NOT EXISTS direcao_nfe TEXT
  CHECK (direcao_nfe IN ('entrada', 'saida'));

UPDATE public.produtos_relatorio
SET direcao_nfe = 'entrada'
WHERE chave_nfe IS NOT NULL
  AND direcao_nfe IS NULL;

CREATE INDEX IF NOT EXISTS idx_produtos_relatorio_unit_direcao_periodo
  ON public.produtos_relatorio(unit_id, direcao_nfe, ano_lancamento, mes_lancamento);
