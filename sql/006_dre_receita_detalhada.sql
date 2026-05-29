-- ============================================================
-- 006_dre_receita_detalhada.sql
-- Receita por meio de pagamento — Jan–Abr 2026
-- Execute no Supabase Dashboard > SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS public.dre_receita_detalhada (
  id             serial PRIMARY KEY,
  mes_ano        varchar(7)   NOT NULL,
  bandeira       varchar(50)  NOT NULL,
  classificacao  varchar(60)  NOT NULL,
  grupo          varchar(40)  NOT NULL,
  valor          numeric      NOT NULL,
  criado_em      timestamptz  DEFAULT now(),
  UNIQUE (mes_ano, bandeira)
);

ALTER TABLE public.dre_receita_detalhada ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dre_receita_read" ON public.dre_receita_detalhada;
CREATE POLICY "dre_receita_read" ON public.dre_receita_detalhada FOR SELECT TO authenticated, anon USING (true);
DROP POLICY IF EXISTS "dre_receita_manage" ON public.dre_receita_detalhada;
CREATE POLICY "dre_receita_manage" ON public.dre_receita_detalhada FOR ALL TO service_role USING (true) WITH CHECK (true);

INSERT INTO public.dre_receita_detalhada (mes_ano, bandeira, classificacao, grupo, valor)
VALUES
('2026-1','DINHEIRO','Dinheiro/Pix','FATURAMENTO',68893.83),
('2026-1','PIX','Dinheiro/Pix','FATURAMENTO',122326.1),
('2026-1','Cartão de Débito','Cartão de Débito','FATURAMENTO',213780.01),
('2026-1','Cartão de Crédito','Cartão de Crédito','FATURAMENTO',963659.96),
('2026-1','Voucher','Voucher','FATURAMENTO',10889.07),
('2026-1','Evento Faturado','Evento Faturado','FATURAMENTO',10800.0),
('2026-2','DINHEIRO','Dinheiro/Pix','FATURAMENTO',77572.05),
('2026-2','PIX','Dinheiro/Pix','FATURAMENTO',155396.9),
('2026-2','Cartão de Débito','Cartão de Débito','FATURAMENTO',988071.98),
('2026-2','Cartão de Crédito','Cartão de Crédito','FATURAMENTO',223553.48),
('2026-2','Voucher','Voucher','FATURAMENTO',10589.65),
('2026-2','Evento Faturado','Evento Faturado','FATURAMENTO',73370.0),
('2026-3','DINHEIRO','Dinheiro/Pix','FATURAMENTO',127739.35),
('2026-3','PIX','Dinheiro/Pix','FATURAMENTO',212154.08),
('2026-3','Cartão de Débito','Cartão de Débito','FATURAMENTO',289846.25),
('2026-3','Cartão de Crédito','Cartão de Crédito','FATURAMENTO',1455192.07),
('2026-3','Voucher','Voucher','FATURAMENTO',5812.74),
('2026-3','Evento Faturado','Evento Faturado','FATURAMENTO',352792.26),
('2026-4','DINHEIRO','Dinheiro/Pix','FATURAMENTO',93092.55),
('2026-4','PIX','Dinheiro/Pix','FATURAMENTO',206002.15),
('2026-4','Cartão de Débito','Cartão de Débito','FATURAMENTO',313558.29),
('2026-4','Cartão de Crédito','Cartão de Crédito','FATURAMENTO',1524543.3),
('2026-4','Voucher','Voucher','FATURAMENTO',8423.97),
('2026-4','Evento Faturado','Evento Faturado','FATURAMENTO',159089.31)
ON CONFLICT (mes_ano, bandeira) DO UPDATE SET valor = EXCLUDED.valor;
