-- ============================================================
-- 202609090002_corrigir_rotulo_fonte_saude.sql
-- v_fonte_saude alimenta o índice de confiança do Cockpit. O FROM já foi
-- corrigido automaticamente pela migration anterior (Postgres resolve views
-- por OID, não por nome), mas o rótulo textual 'lorean_workdays' que aparece
-- na tela ficou desatualizado. Definição capturada via pg_get_viewdef
-- imediatamente antes desta migration — única mudança é o rótulo.
-- Execute via `supabase db query --linked --file`. NUNCA db push.
-- ============================================================

CREATE OR REPLACE VIEW public.v_fonte_saude AS
WITH fontes AS (
  SELECT 'dre_mensal'::text AS fonte,
    max(to_date(dre_mensal.mes_ano::text, 'YYYY-MM'::text)) AS ultima_escrita,
    count(*)::integer AS volume_total,
    'mensal'::text AS periodicidade_esperada,
    45 AS limite_dias,
    ARRAY['dre-auditor-me'::text] AS auditores_afetados
   FROM dre_mensal
  WHERE dre_mensal.tipo::text = 'realizado'::text
  UNION ALL
  SELECT 'dre_despesa_detalhada'::text AS fonte,
    max(to_date(dre_despesa_detalhada.mes_ano::text, 'YYYY-MM'::text)) AS ultima_escrita,
    count(*)::integer AS volume_total,
    'mensal'::text AS periodicidade_esperada,
    45 AS limite_dias,
    ARRAY['despesa-caixa-auditor'::text] AS auditores_afetados
   FROM dre_despesa_detalhada
  UNION ALL
  SELECT 'menu_items'::text AS fonte,
    max(menu_items.updated_at)::date AS ultima_escrita,
    count(*)::integer AS volume_total,
    'eventual'::text AS periodicidade_esperada,
    90 AS limite_dias,
    ARRAY['cmv-produto-auditor'::text, 'cadastro-auditor-me'::text] AS auditores_afetados
   FROM menu_items
  WHERE menu_items.ativo = true
  UNION ALL
  SELECT 'ingredients'::text AS fonte,
    max(ingredients.updated_at)::date AS ultima_escrita,
    count(*)::integer AS volume_total,
    'eventual'::text AS periodicidade_esperada,
    90 AS limite_dias,
    ARRAY['cmv-produto-auditor'::text, 'cadastro-auditor-me'::text] AS auditores_afetados
   FROM ingredients
  WHERE ingredients.ativo = true
  UNION ALL
  SELECT 'recipe_items'::text AS fonte,
    max(recipe_items.updated_at)::date AS ultima_escrita,
    count(*)::integer AS volume_total,
    'eventual'::text AS periodicidade_esperada,
    90 AS limite_dias,
    ARRAY['cmv-produto-auditor'::text, 'cadastro-auditor-me'::text] AS auditores_afetados
   FROM recipe_items
  UNION ALL
  SELECT 'gorjeta_distribuicao'::text AS fonte,
    max(make_date(gorjeta_distribuicao.ano::integer, gorjeta_distribuicao.mes::integer, 1)) AS ultima_escrita,
    count(*)::integer AS volume_total,
    'mensal'::text AS periodicidade_esperada,
    45 AS limite_dias,
    ARRAY['gorjetas-auditor-me'::text] AS auditores_afetados
   FROM gorjeta_distribuicao
  UNION ALL
  SELECT 'gorjeta_periodos'::text AS fonte,
    max(gorjeta_periodos.data) AS ultima_escrita,
    count(*)::integer AS volume_total,
    'mensal'::text AS periodicidade_esperada,
    45 AS limite_dias,
    ARRAY['gorjetas-auditor-me'::text] AS auditores_afetados
   FROM gorjeta_periodos
  UNION ALL
  SELECT 'receita_dias'::text AS fonte,
    max(receita_dias.data) AS ultima_escrita,
    count(*)::integer AS volume_total,
    'diaria'::text AS periodicidade_esperada,
    3 AS limite_dias,
    ARRAY['receita-viva-auditor-me'::text] AS auditores_afetados
   FROM receita_dias
  UNION ALL
  SELECT 'job_openings'::text AS fonte,
    max(job_openings.created_at)::date AS ultima_escrita,
    count(*)::integer AS volume_total,
    'eventual'::text AS periodicidade_esperada,
    90 AS limite_dias,
    ARRAY['recrutamento-auditor-me'::text] AS auditores_afetados
   FROM job_openings
  UNION ALL
  SELECT 'candidates'::text AS fonte,
    max(candidates.created_at)::date AS ultima_escrita,
    count(*)::integer AS volume_total,
    'eventual'::text AS periodicidade_esperada,
    90 AS limite_dias,
    ARRAY['recrutamento-auditor-me'::text] AS auditores_afetados
   FROM candidates
  UNION ALL
  SELECT 'titulos_a_pagar'::text AS fonte,
    max(titulos_a_pagar.importado_em::date) AS ultima_escrita,
    count(*)::integer AS volume_total,
    'mensal'::text AS periodicidade_esperada,
    45 AS limite_dias,
    ARRAY[]::text[] AS auditores_afetados
   FROM titulos_a_pagar
  UNION ALL
  SELECT 'ponto_mensal'::text AS fonte,
    max(ponto_mensal.importado_em::date) AS ultima_escrita,
    count(*)::integer AS volume_total,
    'mensal'::text AS periodicidade_esperada,
    45 AS limite_dias,
    ARRAY[]::text[] AS auditores_afetados
   FROM ponto_mensal
  UNION ALL
  SELECT 'purchase_orders'::text AS fonte,
    max(purchase_orders.data_pedido) AS ultima_escrita,
    count(*)::integer AS volume_total,
    'semanal'::text AS periodicidade_esperada,
    10 AS limite_dias,
    ARRAY[]::text[] AS auditores_afetados
   FROM purchase_orders
  UNION ALL
  SELECT 'employees'::text AS fonte,
    max(employees.updated_at)::date AS ultima_escrita,
    count(*)::integer AS volume_total,
    'eventual'::text AS periodicidade_esperada,
    90 AS limite_dias,
    ARRAY[]::text[] AS auditores_afetados
   FROM employees
  WHERE employees.ativo = true
  UNION ALL
  SELECT 'payslips'::text AS fonte,
    max(payslips.competencia) AS ultima_escrita,
    count(*)::integer AS volume_total,
    'mensal'::text AS periodicidade_esperada,
    45 AS limite_dias,
    ARRAY[]::text[] AS auditores_afetados
   FROM payslips
)
SELECT fonte,
  ultima_escrita,
  CURRENT_DATE - ultima_escrita AS dias_sem_atualizacao,
  volume_total,
  periodicidade_esperada,
  limite_dias,
  CASE
    WHEN (CURRENT_DATE - ultima_escrita) <= limite_dias THEN 'viva'::text
    WHEN (CURRENT_DATE - ultima_escrita) <= (limite_dias * 2) THEN 'atrasada'::text
    ELSE 'morta'::text
  END AS status_fonte,
  auditores_afetados
 FROM fontes
ORDER BY
  CASE
    WHEN (CURRENT_DATE - ultima_escrita) > (limite_dias * 2) THEN 1
    WHEN (CURRENT_DATE - ultima_escrita) > limite_dias THEN 2
    ELSE 3
  END,
  (array_length(auditores_afetados, 1)) DESC NULLS LAST,
  (CURRENT_DATE - ultima_escrita) DESC;

NOTIFY pgrst, 'reload schema';
