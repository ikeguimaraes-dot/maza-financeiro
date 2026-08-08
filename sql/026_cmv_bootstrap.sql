-- Bootstrap mínimo e idempotente para habilitar Financeiro > DRE > CMV.
-- Projeto alvo: dncqjezvndoxeqpklefy

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  color TEXT DEFAULT '#D4A574',
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID REFERENCES public.brands(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT,
  whatsapp_number TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  description TEXT
);

CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role_id UUID REFERENCES public.roles(id) NOT NULL,
  unit_id UUID REFERENCES public.units(id) ON DELETE CASCADE,
  brand_id UUID REFERENCES public.brands(id) ON DELETE CASCADE,
  group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  CHECK (unit_id IS NOT NULL OR brand_id IS NOT NULL OR group_id IS NOT NULL)
);

-- Instalações antigas podem conter o mesmo vínculo mais de uma vez. Mantém o
-- registro mais antigo e remove somente duplicatas de escopo rigorosamente iguais.
WITH duplicate_roles AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY user_id, role_id,
             COALESCE(unit_id, '00000000-0000-0000-0000-000000000000'::uuid),
             COALESCE(brand_id, '00000000-0000-0000-0000-000000000000'::uuid),
             COALESCE(group_id, '00000000-0000-0000-0000-000000000000'::uuid)
           ORDER BY created_at NULLS LAST, id
         ) AS occurrence
  FROM public.user_roles
)
DELETE FROM public.user_roles ur
USING duplicate_roles duplicates
WHERE ur.id = duplicates.id AND duplicates.occurrence > 1;

CREATE UNIQUE INDEX IF NOT EXISTS user_roles_scope_key
  ON public.user_roles(user_id, role_id, COALESCE(unit_id, '00000000-0000-0000-0000-000000000000'), COALESCE(brand_id, '00000000-0000-0000-0000-000000000000'), COALESCE(group_id, '00000000-0000-0000-0000-000000000000'));

INSERT INTO public.roles(name, description) VALUES
  ('founder', 'Fundador — acesso total'),
  ('cfo', 'CFO — financeiro e relatórios')
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.groups(id, name, slug) VALUES
  ('10000000-0000-4000-8000-000000000001', 'MAZA', 'maza')
ON CONFLICT (slug) DO UPDATE SET name = excluded.name;

INSERT INTO public.brands(id, group_id, name, slug, color)
SELECT seed.id::uuid, g.id, seed.name, seed.slug, seed.color
FROM public.groups g
CROSS JOIN (VALUES
  ('20000000-0000-4000-8000-000000000001', 'IKY Delivery', 'iky-delivery', '#D4A574'),
  ('20000000-0000-4000-8000-000000000002', 'Yoshimori Restaurante', 'yoshimori-restaurante', '#A89368')
) AS seed(id, name, slug, color)
WHERE g.slug='maza'
ON CONFLICT (slug) DO UPDATE SET name = excluded.name;

INSERT INTO public.units(id, brand_id, name, active)
SELECT seed.id::uuid, b.id, seed.name, true
FROM public.brands b
JOIN (VALUES
  ('674eac8c-5a38-4a42-aa60-0a666387909b', 'iky-delivery', 'IKY Delivery'),
  ('674eac8c-5a38-4a42-aa60-0a666387909c', 'yoshimori-restaurante', 'Yoshimori Restaurante')
) AS seed(id, brand_slug, name) ON seed.brand_slug=b.slug
ON CONFLICT (id) DO UPDATE SET name = excluded.name, brand_id = excluded.brand_id, active = true;

-- Concede founder aos administradores já existentes no Auth.
INSERT INTO public.user_roles(user_id, role_id, group_id)
SELECT u.id, r.id, g.id
FROM auth.users u CROSS JOIN public.roles r CROSS JOIN public.groups g
WHERE lower(u.email) IN ('admin@maza.com.br', 'grupomeeteat@gmail.com', 'ikeguimaraes@gmail.com')
  AND r.name = 'founder'
  AND g.slug = 'maza'
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.maza_is_founder()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id=ur.role_id
    WHERE ur.user_id=auth.uid() AND r.name='founder'
  );
$$;

ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS groups_read ON public.groups;
DROP POLICY IF EXISTS brands_read ON public.brands;
DROP POLICY IF EXISTS units_read ON public.units;
DROP POLICY IF EXISTS roles_read ON public.roles;
DROP POLICY IF EXISTS user_roles_own ON public.user_roles;
CREATE POLICY groups_read ON public.groups FOR SELECT TO authenticated USING (true);
CREATE POLICY brands_read ON public.brands FOR SELECT TO authenticated USING (true);
CREATE POLICY units_read ON public.units FOR SELECT TO authenticated USING (true);
CREATE POLICY roles_read ON public.roles FOR SELECT TO authenticated USING (true);
CREATE POLICY user_roles_own ON public.user_roles FOR SELECT TO authenticated USING (user_id=auth.uid());

CREATE TABLE IF NOT EXISTS public.produtos_relatorio (
  id BIGSERIAL PRIMARY KEY,
  unit_id UUID NOT NULL REFERENCES public.units(id),
  fornecedor_nome TEXT, nr_danfe TEXT, v_total_danfe NUMERIC(14,4), dt_emissao TEXT,
  item_codigo TEXT, item_descricao TEXT, unidade_medida TEXT, tipo_item TEXT,
  q_embalagem NUMERIC(14,4), q_estoque NUMERIC(14,4), v_embalagem NUMERIC(14,4),
  v_total_embalagem NUMERIC(14,4), v_custo_medio NUMERIC(14,4), v_custo_compra NUMERIC(14,4),
  v_custo_total NUMERIC(14,4), perc_variacao NUMERIC(10,4), calcula_cmv BOOLEAN,
  fornecedor_codigo TEXT, codigo_gerencial TEXT, desc_gerencial TEXT,
  mes_lancamento INTEGER NOT NULL, ano_lancamento INTEGER NOT NULL,
  chave_nfe TEXT, criado_em TIMESTAMPTZ DEFAULT now()
);

-- Compatibilidade com a versão anterior da tabela, criada antes do importador NF-e.
ALTER TABLE public.produtos_relatorio
  ADD COLUMN IF NOT EXISTS chave_nfe TEXT;

CREATE INDEX IF NOT EXISTS idx_produtos_relatorio_unit_mes
  ON public.produtos_relatorio(unit_id, ano_lancamento, mes_lancamento);
CREATE UNIQUE INDEX IF NOT EXISTS produtos_relatorio_nfe_item_key
  ON public.produtos_relatorio(unit_id, chave_nfe, item_codigo) WHERE chave_nfe IS NOT NULL;

ALTER TABLE public.produtos_relatorio ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS produtos_read ON public.produtos_relatorio;
CREATE POLICY produtos_read ON public.produtos_relatorio FOR SELECT TO authenticated USING (true);

-- get_produto_meses(uuid) já existe nas instalações anteriores e pode retornar
-- colunas adicionais (ex.: total). Não a redefinimos para preservar consumidores.

CREATE TABLE IF NOT EXISTS public.nfe_importacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), unit_id UUID NOT NULL REFERENCES public.units(id),
  arquivo TEXT NOT NULL, direcao TEXT NOT NULL CHECK(direcao IN ('entrada','saida')),
  total_xml INTEGER NOT NULL DEFAULT 0, importadas INTEGER NOT NULL DEFAULT 0,
  duplicadas INTEGER NOT NULL DEFAULT 0, canceladas INTEGER NOT NULL DEFAULT 0,
  rejeitadas INTEGER NOT NULL DEFAULT 0, valor_total NUMERIC(16,2) NOT NULL DEFAULT 0,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.nfe_documentos (
  id BIGSERIAL PRIMARY KEY, unit_id UUID NOT NULL REFERENCES public.units(id),
  importacao_id UUID REFERENCES public.nfe_importacoes(id) ON DELETE SET NULL,
  chave TEXT NOT NULL, direcao TEXT NOT NULL CHECK(direcao IN ('entrada','saida')),
  numero TEXT, serie TEXT, emissao TIMESTAMPTZ NOT NULL,
  emitente_cnpj TEXT, emitente_nome TEXT, destinatario_cnpj TEXT, destinatario_nome TEXT,
  valor_total NUMERIC(16,2) NOT NULL DEFAULT 0, status_sefaz TEXT,
  cancelada BOOLEAN NOT NULL DEFAULT false, criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(unit_id, chave)
);

ALTER TABLE public.nfe_importacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nfe_documentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS nfe_importacoes_read ON public.nfe_importacoes;
DROP POLICY IF EXISTS nfe_documentos_read ON public.nfe_documentos;
CREATE POLICY nfe_importacoes_read ON public.nfe_importacoes FOR SELECT TO authenticated USING (true);
CREATE POLICY nfe_documentos_read ON public.nfe_documentos FOR SELECT TO authenticated USING (true);

NOTIFY pgrst, 'reload schema';
