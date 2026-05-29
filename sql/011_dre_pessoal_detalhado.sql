-- dre_pessoal_detalhado: breakdown de pessoal por categoria/mês (Base Realizado)
CREATE TABLE IF NOT EXISTS public.dre_pessoal_detalhado (
  id          BIGSERIAL PRIMARY KEY,
  mes_ano     TEXT      NOT NULL,
  categoria   TEXT      NOT NULL,
  valor       NUMERIC,
  UNIQUE (mes_ano, categoria)
);

ALTER TABLE public.dre_pessoal_detalhado ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all" ON public.dre_pessoal_detalhado FOR ALL USING (true) WITH CHECK (true);

INSERT INTO public.dre_pessoal_detalhado (mes_ano, categoria, valor) VALUES
('2026-1','Salários e Ordenados',-116300.64),
('2026-1','Férias',-16319.58),
('2026-1','IR/INSS',-14863.34),
('2026-1','FGTS',-46511.41),
('2026-1','Rescisões Trabalhistas',-7373.08),
('2026-1','Assistência Médica e Social',-16819.08),
('2026-1','Vale Transporte',-17289.25),
('2026-1','Contribuição Sindical',-4013.16),
('2026-1','Seguro de Vida',-771.93),
('2026-1','Beneficios',-26135.41),
('2026-1','Uniforme',-378.00),
('2026-1','Colaborador Extra',-14621.20),
('2026-1','Gratificações',-450.00),
('2026-1','Retenção de Gorjetas',13519.95),
('2026-1','Gorjetas Pagas',-90333.56),

('2026-2','Salários e Ordenados',-120558.98),
('2026-2','Férias',-18791.33),
('2026-2','IR/INSS',-130738.87),
('2026-2','FGTS',-41287.92),
('2026-2','Rescisões Trabalhistas',-6655.90),
('2026-2','Assistência Médica e Social',-16406.98),
('2026-2','Vale Transporte',-20371.37),
('2026-2','Contribuição Sindical',-4013.16),
('2026-2','Seguro de Vida',-771.93),
('2026-2','Beneficios',-21680.65),
('2026-2','Uniforme',-378.00),
('2026-2','Colaborador Extra',-26200.00),
('2026-2','Gratificações',-450.00),
('2026-2','Retenção de Gorjetas',22113.35),
('2026-2','Gorjetas Pagas',-120558.98),

('2026-3','Salários e Ordenados',-126223.22),
('2026-3','Férias',-8689.49),
('2026-3','IR/INSS',-139703.75),
('2026-3','FGTS',-45949.69),
('2026-3','Rescisões Trabalhistas',-38202.63),
('2026-3','Assistência Médica e Social',-14030.09),
('2026-3','Vale Transporte',-27246.38),
('2026-3','Contribuição Sindical',-3703.46),
('2026-3','Seguro de Vida',-771.93),
('2026-3','Beneficios',-22027.81),
('2026-3','Uniforme',-22464.00),
('2026-3','Colaborador Extra',-25999.00),
('2026-3','Retenção de Gorjetas',25620.56),
('2026-3','Gorjetas Pagas',-161984.87),

('2026-4','Salários e Ordenados',-257302.51),
('2026-4','Férias',-7638.44),
('2026-4','IR/INSS',-173498.94),
('2026-4','FGTS',-51012.05),
('2026-4','Rescisões Trabalhistas',-8580.26),
('2026-4','Assistência Médica e Social',-16825.94),
('2026-4','Vale Transporte',-31024.47),
('2026-4','Contribuição Sindical',-3703.46),
('2026-4','Seguro de Vida',-773.46),
('2026-4','Beneficios',-17400.00),
('2026-4','Uniforme',-3871.63),
('2026-4','Colaborador Extra',-18070.00)
ON CONFLICT (mes_ano, categoria) DO UPDATE SET valor = EXCLUDED.valor;
