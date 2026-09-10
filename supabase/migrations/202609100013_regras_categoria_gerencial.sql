-- ============================================================
-- 202609100013_regras_categoria_gerencial.sql
-- FASE 7 PASSO 2: regras_classificacao só suportava tipo baseado em
-- fornecedor ou texto livre "contém" — matches fuzzy pensados pra
-- titulos_a_pagar antigo (sem categoria real, só nome de fornecedor).
-- Agora c_gerencial traz uma categoria normalizada de verdade (das
-- planilhas de compras), então adiciona 'categoria_gerencial' — match
-- EXATO contra c_gerencial, não "contém". gerarLancamentosTitulos()
-- (PASSO 5) prioriza esse tipo antes de cair nos fuzzy matches antigos.
--
-- unit_id NULL = regra global (as categorias de despesa não são
-- unit-specific — a unidade já vem do próprio título importado).
-- Execute via `supabase db query --linked --file`. NUNCA db push.
-- ============================================================

ALTER TABLE public.regras_classificacao DROP CONSTRAINT regras_classificacao_tipo_check;
ALTER TABLE public.regras_classificacao ADD CONSTRAINT regras_classificacao_tipo_check
  CHECK (tipo = ANY (ARRAY['fornecedor_cnpj', 'fornecedor_nome', 'descricao_contem', 'categoria_gerencial']));

INSERT INTO public.regras_classificacao (unit_id, tipo, padrao, conta_codigo, prioridade) VALUES
  (NULL, 'categoria_gerencial', 'ALIMENTOS', '3.99', 0),
  (NULL, 'categoria_gerencial', 'BEBIDAS', '3.06', 0),
  (NULL, 'categoria_gerencial', 'ALUGUEL', '5.01', 0),
  (NULL, 'categoria_gerencial', 'GALPAO', '5.01', 0),
  (NULL, 'categoria_gerencial', 'ENERGIA', '5.02', 0),
  (NULL, 'categoria_gerencial', 'CONSUMO AGUA', '5.02', 0),
  (NULL, 'categoria_gerencial', 'CONSUMO GAS', '5.02', 0),
  (NULL, 'categoria_gerencial', 'INTERNET', '5.02', 0),
  (NULL, 'categoria_gerencial', 'MARKETING', '5.03', 0),
  (NULL, 'categoria_gerencial', 'MANUTENCAO', '5.04', 0),
  (NULL, 'categoria_gerencial', 'MAQ LAVAR', '5.04', 0),
  (NULL, 'categoria_gerencial', 'ALARME', '5.04', 0),
  (NULL, 'categoria_gerencial', 'CAMERAS', '5.04', 0),
  (NULL, 'categoria_gerencial', 'AROMATIZACAO', '5.04', 0),
  (NULL, 'categoria_gerencial', 'LIMPEZA', '5.06', 0),
  (NULL, 'categoria_gerencial', 'DESCARTAVEIS', '5.06', 0),
  (NULL, 'categoria_gerencial', 'UTENSILIOS', '5.06', 0),
  (NULL, 'categoria_gerencial', 'PAPELARIA', '5.06', 0),
  (NULL, 'categoria_gerencial', 'MOTOBOY', '5.07', 0),
  (NULL, 'categoria_gerencial', 'ADVOGADO', '5.05', 0),
  (NULL, 'categoria_gerencial', 'CONTABILIDADE', '5.05', 0),
  (NULL, 'categoria_gerencial', 'SISTEMA', '5.05', 0),
  (NULL, 'categoria_gerencial', 'SEGURANCA', '5.05', 0),
  (NULL, 'categoria_gerencial', 'LAVANDERIA', '5.05', 0),
  (NULL, 'categoria_gerencial', 'EXAMES', '5.05', 0),
  (NULL, 'categoria_gerencial', 'AMOSTRAS', '5.05', 0),
  (NULL, 'categoria_gerencial', 'LOCACAO', '5.05', 0),
  (NULL, 'categoria_gerencial', 'ACORDO', '5.05', 0),
  (NULL, 'categoria_gerencial', 'EXTRA', '5.05', 0),
  (NULL, 'categoria_gerencial', 'SERVICO', '5.05', 0),
  (NULL, 'categoria_gerencial', 'IMPOSTOS', '2.04', 0),
  (NULL, 'categoria_gerencial', 'RESCISAO', '4.05', 0),
  (NULL, 'categoria_gerencial', 'FERIAS', '4.06', 0),
  (NULL, 'categoria_gerencial', 'PREPARACAO', '3.05', 0);

NOTIFY pgrst, 'reload schema';
