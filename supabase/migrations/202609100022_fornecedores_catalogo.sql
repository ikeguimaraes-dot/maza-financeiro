-- ============================================================
-- 202609100022_fornecedores_catalogo.sql
-- FASE 7: match título↔NF-e dependia de nome de fornecedor (similaridade de
-- bigrama), acertando só ~26% -- nomes divergem entre as fontes ("TREZE DE
-- MAIO" vs "TREZE DE MAIO COMERCIO DE HORTIFRUTIGRANJEIROS LTDA", "MAC" vs
-- "MAC ORIENTAL", "IMCOPESC " com espaço vs "IMCOPESC"). Mesmo princípio do
-- catálogo de produtos (produtos_catalogo/produtos_depara, sql/027): um
-- fornecedor canônico com um de-para de nomes de origem. Match passa a ser
-- por fornecedor_id, exato -- sem similaridade de texto no caminho crítico.
-- Execute via `supabase db query --linked --file`. NUNCA db push.
-- ============================================================

CREATE TABLE public.fornecedores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text UNIQUE NOT NULL,
  nome text NOT NULL,
  cnpj text,
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.fornecedores_depara (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fornecedor_id uuid NOT NULL REFERENCES public.fornecedores(id),
  nome_origem text NOT NULL,
  origem text NOT NULL CHECK (origem = ANY (ARRAY['nfe', 'titulo'])),
  criado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (nome_origem, origem)
);

CREATE INDEX idx_fornecedores_depara_fornecedor_id ON public.fornecedores_depara(fornecedor_id);

ALTER TABLE public.fornecedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fornecedores_depara ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fornecedores_read" ON public.fornecedores;
DROP POLICY IF EXISTS "fornecedores_manage" ON public.fornecedores;
DROP POLICY IF EXISTS "fornecedores_depara_read" ON public.fornecedores_depara;
DROP POLICY IF EXISTS "fornecedores_depara_manage" ON public.fornecedores_depara;

CREATE POLICY "fornecedores_read"
  ON public.fornecedores FOR SELECT
  TO authenticated, anon USING (true);

CREATE POLICY "fornecedores_manage"
  ON public.fornecedores FOR ALL
  TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "fornecedores_depara_read"
  ON public.fornecedores_depara FOR SELECT
  TO authenticated, anon USING (true);

CREATE POLICY "fornecedores_depara_manage"
  ON public.fornecedores_depara FOR ALL
  TO service_role USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
