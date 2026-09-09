-- ============================================================
-- 027_catalogo_produtos.sql
-- Catálogo de produtos e de-para de fornecedor (FASE 2 do CMV)
-- Execute via `supabase db query --linked --file sql/027_catalogo_produtos.sql`
-- ============================================================

CREATE TABLE IF NOT EXISTS public.produtos_catalogo (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo          TEXT NOT NULL UNIQUE,
  nome            TEXT NOT NULL,
  ncm             TEXT,
  unidade_padrao  TEXT,
  categoria       TEXT,
  ativo           BOOLEAN NOT NULL DEFAULT true,
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.produtos_depara (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id        UUID REFERENCES public.produtos_catalogo(id),
  fornecedor_cnpj   TEXT NOT NULL,
  fornecedor_nome   TEXT,
  item_codigo       TEXT NOT NULL,
  item_descricao    TEXT,
  ncm               TEXT,
  criado_em         TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT produtos_depara_fornecedor_item_key UNIQUE (fornecedor_cnpj, item_codigo)
);

CREATE INDEX IF NOT EXISTS idx_produtos_depara_produto_id
  ON public.produtos_depara(produto_id);

ALTER TABLE public.produtos_relatorio ADD COLUMN IF NOT EXISTS produto_id UUID;

CREATE INDEX IF NOT EXISTS idx_produtos_relatorio_produto_id
  ON public.produtos_relatorio(produto_id);

ALTER TABLE public.produtos_catalogo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produtos_depara ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "produtos_catalogo_read"   ON public.produtos_catalogo;
DROP POLICY IF EXISTS "produtos_catalogo_manage" ON public.produtos_catalogo;
DROP POLICY IF EXISTS "produtos_depara_read"     ON public.produtos_depara;
DROP POLICY IF EXISTS "produtos_depara_manage"   ON public.produtos_depara;

CREATE POLICY "produtos_catalogo_read"
  ON public.produtos_catalogo FOR SELECT
  TO authenticated, anon USING (true);

CREATE POLICY "produtos_catalogo_manage"
  ON public.produtos_catalogo FOR ALL
  TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "produtos_depara_read"
  ON public.produtos_depara FOR SELECT
  TO authenticated, anon USING (true);

CREATE POLICY "produtos_depara_manage"
  ON public.produtos_depara FOR ALL
  TO service_role USING (true) WITH CHECK (true);
