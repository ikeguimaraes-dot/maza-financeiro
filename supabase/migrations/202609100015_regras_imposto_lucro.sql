-- ============================================================
-- 202609100015_regras_imposto_lucro.sql
-- normalizarCategoria() não emite mais a categoria "IMPOSTOS" genérica —
-- agora detecta a sigla (ICMS/IRPJ/CSLL/FGTS/etc.) e separa em
-- IMPOSTOS VENDA, IMPOSTO LUCRO ou ENCARGO FOLHA. A regra antiga fica
-- morta (nenhum dado normaliza mais pra "IMPOSTOS" puro) — removida pra
-- não confundir leitura futura da tabela.
-- Execute via `supabase db query --linked --file`. NUNCA db push.
-- ============================================================

DELETE FROM public.regras_classificacao
  WHERE tipo = 'categoria_gerencial' AND padrao = 'IMPOSTOS';

INSERT INTO public.regras_classificacao (unit_id, tipo, padrao, conta_codigo, prioridade) VALUES
  (NULL, 'categoria_gerencial', 'IMPOSTOS VENDA', '2.04', 0),
  (NULL, 'categoria_gerencial', 'IMPOSTO LUCRO', '8.01', 0),
  (NULL, 'categoria_gerencial', 'ENCARGO FOLHA', '4.02', 0);

NOTIFY pgrst, 'reload schema';
