-- ============================================================
-- 004_dre_orcado_mai_dez.sql
-- Orçado Maio–Dezembro 2026 extraído de 03-BD x RE 2026
-- Execute no Supabase Dashboard > SQL Editor
-- ============================================================

INSERT INTO public.dre_mensal
  (mes_ano, tipo, receita_bruta, impostos, cmv, pessoal, ocupacao,
   utilidades, operacao, manutencao, administrativa, marketing,
   taxa_cartao, ebitda, resultado_liquido, clientes, ticket_medio)
VALUES
('2026-5','orcado',3096722.95,-236899.31,-915143.57,-722936.34,-71735.66,-68332.07,-200424.74,-25308.17,-194358.97,-57196.47,-104617.17,499770.49,478093.43,9134.88,300.0),
('2026-6','orcado',2625759.23,-200870.58,-775964.37,-673578.38,-71735.66,-57939.82,-194857.57,-21459.19,-186878.08,-48497.77,-88706.51,305271.29,286890.97,7745.6,300.0),
('2026-7','orcado',2533832.62,-193838.2,-748798.22,-681736.13,-71735.66,-55911.37,-193770.93,-20707.92,-185417.9,-46799.89,-85600.94,249515.47,231778.64,7474.43,300.0),
('2026-8','orcado',2591840.12,-198275.77,-765940.59,-687815.44,-71735.66,-57191.36,-194456.62,-21181.99,-186339.31,-47871.29,-87560.62,273471.48,255328.6,7645.55,300.0),
('2026-9','orcado',2559935.12,-195835.04,-756512.03,-684471.73,-71735.66,-56487.35,-194079.48,-20921.24,-185832.52,-47282.0,-86482.76,260295.32,242375.77,7551.43,300.0),
('2026-10','orcado',2486980.55,-190254.01,-734952.49,-676825.94,-71735.66,-54877.54,-193217.1,-20325.01,-184673.7,-45934.53,-84018.13,230166.44,212757.58,7336.23,300.0),
('2026-11','orcado',2939888.32,-224901.46,-868795.8,-724291.6,-71735.66,-64871.37,-198570.83,-24026.43,-191867.77,-54299.74,-99318.79,417208.87,396629.65,8672.24,300.0),
('2026-12','orcado',2092300.07,-160060.96,-618316.52,-635462.62,-63668.0,-46168.55,-188551.66,-17099.46,-178404.51,-38644.78,-70684.56,75238.45,60592.35,9134.88,300.0)

ON CONFLICT (mes_ano, tipo) DO UPDATE SET
  receita_bruta     = EXCLUDED.receita_bruta,
  impostos          = EXCLUDED.impostos,
  cmv               = EXCLUDED.cmv,
  pessoal           = EXCLUDED.pessoal,
  ocupacao          = EXCLUDED.ocupacao,
  utilidades        = EXCLUDED.utilidades,
  operacao          = EXCLUDED.operacao,
  manutencao        = EXCLUDED.manutencao,
  administrativa    = EXCLUDED.administrativa,
  marketing         = EXCLUDED.marketing,
  taxa_cartao       = EXCLUDED.taxa_cartao,
  ebitda            = EXCLUDED.ebitda,
  resultado_liquido = EXCLUDED.resultado_liquido,
  clientes          = EXCLUDED.clientes,
  ticket_medio      = EXCLUDED.ticket_medio;
