-- ============================================================
-- 010_dre_faturamento_historico.sql
-- Histórico de faturamento 2022–2026 (restaurante + eventos)
-- Execute no Supabase Dashboard > SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS public.dre_faturamento_historico (
  id         serial PRIMARY KEY,
  mes_num    smallint    NOT NULL CHECK (mes_num BETWEEN 1 AND 12),
  categoria  varchar(20) NOT NULL CHECK (categoria IN ('restaurante','eventos','total')),
  rec_2022   numeric,
  rec_2023   numeric,
  rec_2024   numeric,
  rec_2025   numeric,
  rec_2026_bd numeric,
  clientes_bd integer,
  ticket_bd  numeric,
  criado_em  timestamptz DEFAULT now(),
  UNIQUE (mes_num, categoria)
);

ALTER TABLE public.dre_faturamento_historico ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dre_fat_read" ON public.dre_faturamento_historico;
CREATE POLICY "dre_fat_read" ON public.dre_faturamento_historico FOR SELECT TO authenticated, anon USING (true);
DROP POLICY IF EXISTS "dre_fat_manage" ON public.dre_faturamento_historico;
CREATE POLICY "dre_fat_manage" ON public.dre_faturamento_historico FOR ALL TO service_role USING (true) WITH CHECK (true);

INSERT INTO public.dre_faturamento_historico
  (mes_num, categoria, rec_2022, rec_2023, rec_2024, rec_2025, rec_2026_bd, clientes_bd, ticket_bd)
VALUES
(1,'restaurante',NULL,1322282.86,1120264.41,1653269.09,1735932.54,5786.44,300.0),
(2,'restaurante',NULL,918921.51,1270528.62,1965042.1,2358050.52,7860.17,300.0),
(3,'restaurante',NULL,1464783.48,2640318.41,1980362.59,2376435.11,7921.45,300.0),
(4,'restaurante',NULL,1227283.65,2240216.28,2031856.07,2438227.28,8127.42,300.0),
(5,'restaurante',NULL,1404645.74,2334035.34,2283718.99,2740462.79,9134.88,300.0),
(6,'restaurante',NULL,1381876.95,2132518.51,1936400.61,2323680.73,7745.6,300.0),
(7,'restaurante',NULL,2087776.5,1418791.13,1868608.13,2242329.76,7474.43,300.0),
(8,'restaurante',977236.42,1929018.8,1580067.78,1911386.52,2293663.82,7645.55,300.0),
(9,'restaurante',1414841.48,1983126.53,1474543.16,1887857.76,2265429.31,7551.43,300.0),
(10,'restaurante',1489723.8,1517413.09,2041858.27,1834056.45,2200867.74,7336.23,300.0),
(11,'restaurante',1372618.68,1468264.3,2096203.83,2168059.23,2601671.08,8672.24,300.0),
(12,'restaurante',1346340.91,1565698.26,1660180.66,1542994.15,1851592.98,6171.98,300.0),
(1,'eventos',NULL,NULL,NULL,78595.0,82524.75,NULL,NULL),
(2,'eventos',NULL,NULL,NULL,315825.0,347407.5,NULL,NULL),
(3,'eventos',NULL,NULL,NULL,75515.0,90618.0,NULL,NULL),
(4,'eventos',NULL,NULL,NULL,106513.55,117164.9,NULL,NULL),
(5,'eventos',NULL,NULL,NULL,133779.97,147157.97,NULL,NULL),
(6,'eventos',NULL,NULL,NULL,171415.0,188556.5,NULL,NULL),
(7,'eventos',NULL,NULL,NULL,144690.72,159159.79,NULL,NULL),
(8,'eventos',NULL,NULL,NULL,189695.0,208664.5,NULL,NULL),
(9,'eventos',NULL,NULL,NULL,330117.22,396140.66,NULL,NULL),
(10,'eventos',NULL,NULL,NULL,182325.0,218790.0,NULL,NULL),
(11,'eventos',NULL,NULL,NULL,179365.0,215238.0,NULL,NULL),
(12,'eventos',NULL,NULL,NULL,330970.0,364067.0,NULL,NULL),
(1,'total',NULL,NULL,NULL,1731864.09,1818457.29,NULL,NULL),
(2,'total',NULL,NULL,NULL,2280867.1,2705458.02,NULL,NULL),
(3,'total',NULL,NULL,NULL,2055877.59,2467053.11,NULL,NULL),
(4,'total',NULL,NULL,NULL,2138369.62,2555392.19,NULL,NULL),
(5,'total',NULL,NULL,NULL,2417498.96,2887620.76,NULL,NULL),
(6,'total',NULL,NULL,NULL,2107815.61,2512237.23,NULL,NULL),
(7,'total',NULL,NULL,NULL,2013298.85,2401489.55,NULL,NULL),
(8,'total',NULL,NULL,NULL,2101081.52,2502328.32,NULL,NULL),
(9,'total',NULL,NULL,NULL,2217974.98,2661569.98,NULL,NULL),
(10,'total',NULL,NULL,NULL,2016381.45,2419657.74,NULL,NULL),
(11,'total',NULL,NULL,NULL,2347424.23,2816909.08,NULL,NULL),
(12,'total',NULL,NULL,NULL,1873964.15,2215659.98,NULL,NULL)
ON CONFLICT (mes_num, categoria) DO UPDATE SET
  rec_2022    = EXCLUDED.rec_2022,
  rec_2023    = EXCLUDED.rec_2023,
  rec_2024    = EXCLUDED.rec_2024,
  rec_2025    = EXCLUDED.rec_2025,
  rec_2026_bd = EXCLUDED.rec_2026_bd,
  clientes_bd = EXCLUDED.clientes_bd,
  ticket_bd   = EXCLUDED.ticket_bd;
