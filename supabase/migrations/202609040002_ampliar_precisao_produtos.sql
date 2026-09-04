-- Padroniza a precisão do relatório de produtos no banco remoto. Algumas
-- instalações antigas mantiveram precisões menores e rejeitam notas acima
-- de R$ 9.999,9999 com "numeric field overflow".
alter table public.produtos_relatorio
  alter column v_total_danfe type numeric(18,4) using v_total_danfe::numeric,
  alter column q_embalagem type numeric(18,4) using q_embalagem::numeric,
  alter column q_estoque type numeric(18,4) using q_estoque::numeric,
  alter column v_embalagem type numeric(18,4) using v_embalagem::numeric,
  alter column v_total_embalagem type numeric(18,4) using v_total_embalagem::numeric,
  alter column v_custo_medio type numeric(18,4) using v_custo_medio::numeric,
  alter column v_custo_compra type numeric(18,4) using v_custo_compra::numeric,
  alter column v_custo_total type numeric(18,4) using v_custo_total::numeric,
  alter column perc_variacao type numeric(18,4) using perc_variacao::numeric;
