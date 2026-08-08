-- Importação auditável de NF-e para o módulo Financeiro / CMV.
CREATE TABLE IF NOT EXISTS public.nfe_importacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID NOT NULL,
  arquivo TEXT NOT NULL,
  direcao TEXT NOT NULL CHECK (direcao IN ('entrada', 'saida')),
  total_xml INTEGER NOT NULL DEFAULT 0,
  importadas INTEGER NOT NULL DEFAULT 0,
  duplicadas INTEGER NOT NULL DEFAULT 0,
  canceladas INTEGER NOT NULL DEFAULT 0,
  rejeitadas INTEGER NOT NULL DEFAULT 0,
  valor_total NUMERIC(16,2) NOT NULL DEFAULT 0,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.nfe_documentos (
  id BIGSERIAL PRIMARY KEY,
  unit_id UUID NOT NULL,
  importacao_id UUID REFERENCES public.nfe_importacoes(id) ON DELETE SET NULL,
  chave TEXT NOT NULL,
  direcao TEXT NOT NULL CHECK (direcao IN ('entrada', 'saida')),
  numero TEXT,
  serie TEXT,
  emissao TIMESTAMPTZ NOT NULL,
  emitente_cnpj TEXT,
  emitente_nome TEXT,
  destinatario_cnpj TEXT,
  destinatario_nome TEXT,
  valor_total NUMERIC(16,2) NOT NULL DEFAULT 0,
  status_sefaz TEXT,
  cancelada BOOLEAN NOT NULL DEFAULT false,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (unit_id, chave)
);

CREATE INDEX IF NOT EXISTS idx_nfe_documentos_unit_emissao
  ON public.nfe_documentos(unit_id, emissao DESC);

ALTER TABLE public.nfe_importacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nfe_documentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "nfe_importacoes_read" ON public.nfe_importacoes;
DROP POLICY IF EXISTS "nfe_documentos_read" ON public.nfe_documentos;
CREATE POLICY "nfe_importacoes_read" ON public.nfe_importacoes FOR SELECT TO authenticated USING (true);
CREATE POLICY "nfe_documentos_read" ON public.nfe_documentos FOR SELECT TO authenticated USING (true);

-- O vínculo com a NF-e torna o reenvio idempotente também no relatório do CMV.
ALTER TABLE public.produtos_relatorio ADD COLUMN IF NOT EXISTS chave_nfe TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS produtos_relatorio_nfe_item_key
  ON public.produtos_relatorio(unit_id, chave_nfe, item_codigo)
  WHERE chave_nfe IS NOT NULL;
