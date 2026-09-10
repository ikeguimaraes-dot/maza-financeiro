-- ============================================================
-- 202609090001_renomear_lorean_para_receita.sql
-- Renomeia o schema "lorean_*" (herança do clone do template KPH) para
-- "receita_*". As tabelas guardam receita legítima do Maza, importada por
-- planilha/PDF — não há integração Lorean neste projeto. ALTER TABLE RENAME
-- preserva 100% dos dados, índices e constraints (que são renomeados à
-- parte, pois o Postgres não os renomeia sozinho).
-- Execute via `supabase db query --linked --file`. NUNCA db push.
-- ============================================================

-- ── Tabelas ─────────────────────────────────────────────────────────────────

ALTER TABLE public.lorean_workdays              RENAME TO receita_dias;
ALTER TABLE public.lorean_pagamentos            RENAME TO receita_pagamentos;
ALTER TABLE public.lorean_ambientes             RENAME TO receita_ambientes;
ALTER TABLE public.lorean_turnos                RENAME TO receita_turnos;
ALTER TABLE public.lorean_horarios              RENAME TO receita_horarios;
ALTER TABLE public.lorean_grupos                RENAME TO receita_grupos;
ALTER TABLE public.lorean_produtos_dia          RENAME TO receita_produtos_dia;
ALTER TABLE public.lorean_caixas                RENAME TO receita_caixas;
ALTER TABLE public.lorean_descontos             RENAME TO receita_descontos;
ALTER TABLE public.lorean_descontos_detalhe     RENAME TO receita_descontos_detalhe;
ALTER TABLE public.lorean_cancelamentos         RENAME TO receita_cancelamentos;
ALTER TABLE public.lorean_cancelamentos_detalhe RENAME TO receita_cancelamentos_detalhe;
ALTER TABLE public.lorean_usuarios              RENAME TO receita_usuarios;
ALTER TABLE public.lorean_import_log            RENAME TO receita_import_log;

-- ── Constraints (PK/FK/UNIQUE) — renomear também renomeia o índice que as
-- suporta (comportamento padrão do Postgres para RENAME CONSTRAINT) ─────────

ALTER TABLE public.receita_ambientes             RENAME CONSTRAINT lorean_ambientes_pkey TO receita_ambientes_pkey;
ALTER TABLE public.receita_ambientes             RENAME CONSTRAINT lorean_ambientes_workday_id_fk_fkey TO receita_ambientes_workday_id_fk_fkey;

ALTER TABLE public.receita_caixas                RENAME CONSTRAINT lorean_caixas_pkey TO receita_caixas_pkey;
ALTER TABLE public.receita_caixas                RENAME CONSTRAINT lorean_caixas_workday_id_fk_fkey TO receita_caixas_workday_id_fk_fkey;

ALTER TABLE public.receita_cancelamentos         RENAME CONSTRAINT lorean_cancelamentos_pkey TO receita_cancelamentos_pkey;
ALTER TABLE public.receita_cancelamentos         RENAME CONSTRAINT lorean_cancelamentos_workday_id_fk_fkey TO receita_cancelamentos_workday_id_fk_fkey;

ALTER TABLE public.receita_cancelamentos_detalhe RENAME CONSTRAINT lorean_cancelamentos_detalhe_pkey TO receita_cancelamentos_detalhe_pkey;
ALTER TABLE public.receita_cancelamentos_detalhe RENAME CONSTRAINT lorean_cancelamentos_detalhe_workday_id_fk_fkey TO receita_cancelamentos_detalhe_workday_id_fk_fkey;

ALTER TABLE public.receita_descontos             RENAME CONSTRAINT lorean_descontos_pkey TO receita_descontos_pkey;
ALTER TABLE public.receita_descontos             RENAME CONSTRAINT lorean_descontos_workday_id_fk_fkey TO receita_descontos_workday_id_fk_fkey;

ALTER TABLE public.receita_descontos_detalhe     RENAME CONSTRAINT lorean_descontos_detalhe_pkey TO receita_descontos_detalhe_pkey;
ALTER TABLE public.receita_descontos_detalhe     RENAME CONSTRAINT lorean_descontos_detalhe_workday_id_fk_fkey TO receita_descontos_detalhe_workday_id_fk_fkey;

ALTER TABLE public.receita_grupos                RENAME CONSTRAINT lorean_grupos_pkey TO receita_grupos_pkey;
ALTER TABLE public.receita_grupos                RENAME CONSTRAINT lorean_grupos_workday_id_fk_fkey TO receita_grupos_workday_id_fk_fkey;

ALTER TABLE public.receita_horarios              RENAME CONSTRAINT lorean_horarios_pkey TO receita_horarios_pkey;
ALTER TABLE public.receita_horarios              RENAME CONSTRAINT lorean_horarios_workday_id_fk_fkey TO receita_horarios_workday_id_fk_fkey;

ALTER TABLE public.receita_import_log            RENAME CONSTRAINT lorean_import_log_pkey TO receita_import_log_pkey;

ALTER TABLE public.receita_pagamentos            RENAME CONSTRAINT lorean_pagamentos_pkey TO receita_pagamentos_pkey;
ALTER TABLE public.receita_pagamentos            RENAME CONSTRAINT lorean_pagamentos_workday_id_fk_fkey TO receita_pagamentos_workday_id_fk_fkey;

ALTER TABLE public.receita_produtos_dia          RENAME CONSTRAINT lorean_produtos_dia_pkey TO receita_produtos_dia_pkey;
ALTER TABLE public.receita_produtos_dia          RENAME CONSTRAINT lorean_produtos_dia_workday_id_fk_fkey TO receita_produtos_dia_workday_id_fk_fkey;

ALTER TABLE public.receita_turnos                RENAME CONSTRAINT lorean_turnos_pkey TO receita_turnos_pkey;
ALTER TABLE public.receita_turnos                RENAME CONSTRAINT lorean_turnos_workday_id_fk_fkey TO receita_turnos_workday_id_fk_fkey;

ALTER TABLE public.receita_usuarios              RENAME CONSTRAINT lorean_usuarios_pkey TO receita_usuarios_pkey;
ALTER TABLE public.receita_usuarios              RENAME CONSTRAINT lorean_usuarios_workday_id_fk_fkey TO receita_usuarios_workday_id_fk_fkey;

ALTER TABLE public.receita_dias                  RENAME CONSTRAINT lorean_workdays_pkey TO receita_dias_pkey;
ALTER TABLE public.receita_dias                  RENAME CONSTRAINT lorean_workdays_unit_id_workday_id_key TO receita_dias_unit_id_workday_id_key;
ALTER TABLE public.receita_dias                  RENAME CONSTRAINT lorean_workdays_importacao_id_fkey TO receita_dias_importacao_id_fkey;
ALTER TABLE public.receita_dias                  RENAME CONSTRAINT lorean_workdays_unit_id_fkey TO receita_dias_unit_id_fkey;

-- ── Índices avulsos (não ligados a constraint) ───────────────────────────────

ALTER INDEX public.lorean_cancelamentos_workday RENAME TO receita_cancelamentos_workday;
ALTER INDEX public.lorean_horarios_workday      RENAME TO receita_horarios_workday;
ALTER INDEX public.lorean_usuarios_workday      RENAME TO receita_usuarios_workday;

-- ── Políticas RLS — Postgres não renomeia sozinho ao renomear a tabela ───────

ALTER POLICY lorean_ambientes_unit_write             ON public.receita_ambientes             RENAME TO receita_ambientes_unit_write;
ALTER POLICY lorean_ambientes_unit_read              ON public.receita_ambientes             RENAME TO receita_ambientes_unit_read;
ALTER POLICY lorean_caixas_unit_write                ON public.receita_caixas                RENAME TO receita_caixas_unit_write;
ALTER POLICY lorean_caixas_unit_read                 ON public.receita_caixas                RENAME TO receita_caixas_unit_read;
ALTER POLICY lorean_cancelamentos_unit_write         ON public.receita_cancelamentos         RENAME TO receita_cancelamentos_unit_write;
ALTER POLICY lorean_cancelamentos_unit_read          ON public.receita_cancelamentos         RENAME TO receita_cancelamentos_unit_read;
ALTER POLICY lorean_cancelamentos_detalhe_unit_write ON public.receita_cancelamentos_detalhe RENAME TO receita_cancelamentos_detalhe_unit_write;
ALTER POLICY lorean_cancelamentos_detalhe_unit_read  ON public.receita_cancelamentos_detalhe RENAME TO receita_cancelamentos_detalhe_unit_read;
ALTER POLICY lorean_descontos_unit_write             ON public.receita_descontos             RENAME TO receita_descontos_unit_write;
ALTER POLICY lorean_descontos_unit_read              ON public.receita_descontos             RENAME TO receita_descontos_unit_read;
ALTER POLICY lorean_descontos_detalhe_unit_write     ON public.receita_descontos_detalhe     RENAME TO receita_descontos_detalhe_unit_write;
ALTER POLICY lorean_descontos_detalhe_unit_read      ON public.receita_descontos_detalhe     RENAME TO receita_descontos_detalhe_unit_read;
ALTER POLICY lorean_grupos_unit_write                ON public.receita_grupos                RENAME TO receita_grupos_unit_write;
ALTER POLICY lorean_grupos_unit_read                 ON public.receita_grupos                RENAME TO receita_grupos_unit_read;
ALTER POLICY lorean_horarios_unit_write              ON public.receita_horarios              RENAME TO receita_horarios_unit_write;
ALTER POLICY lorean_horarios_unit_read               ON public.receita_horarios              RENAME TO receita_horarios_unit_read;
ALTER POLICY lorean_pagamentos_unit_write            ON public.receita_pagamentos            RENAME TO receita_pagamentos_unit_write;
ALTER POLICY lorean_pagamentos_unit_read             ON public.receita_pagamentos            RENAME TO receita_pagamentos_unit_read;
ALTER POLICY lorean_produtos_dia_unit_write          ON public.receita_produtos_dia          RENAME TO receita_produtos_dia_unit_write;
ALTER POLICY lorean_produtos_dia_unit_read           ON public.receita_produtos_dia          RENAME TO receita_produtos_dia_unit_read;
ALTER POLICY lorean_turnos_unit_write                ON public.receita_turnos                RENAME TO receita_turnos_unit_write;
ALTER POLICY lorean_turnos_unit_read                 ON public.receita_turnos                RENAME TO receita_turnos_unit_read;
ALTER POLICY lorean_usuarios_unit_write              ON public.receita_usuarios              RENAME TO receita_usuarios_unit_write;
ALTER POLICY lorean_usuarios_unit_read               ON public.receita_usuarios              RENAME TO receita_usuarios_unit_read;
ALTER POLICY lorean_workdays_unit_write              ON public.receita_dias                  RENAME TO receita_dias_unit_write;
ALTER POLICY lorean_workdays_unit_read               ON public.receita_dias                  RENAME TO receita_dias_unit_read;

-- ── View v_lorean_canonico → v_receita_canonico ──────────────────────────────
-- Definição original capturada via pg_get_viewdef antes desta migration.
-- ALTER TABLE RENAME já atualiza a referência interna a lorean_workdays em
-- QUALQUER view existente (Postgres resolve por OID, não por nome) — o
-- DROP+CREATE aqui é só para trocar o NOME da view e o alias, que o Postgres
-- não troca sozinho.

DROP VIEW IF EXISTS public.v_lorean_canonico;

CREATE VIEW public.v_receita_canonico AS
SELECT
  data,
  unit_id,
  sum(receita_bruta) AS receita_bruta_dia,
  sum(receita_liquida) AS receita_liquida_dia,
  sum(desconto) AS desconto_dia,
  sum(gorjeta) AS gorjeta_dia,
  sum(clientes) AS clientes_dia,
  round(
    sum(ticket_medio * clientes::numeric) FILTER (WHERE ticket_medio IS NOT NULL)
    / NULLIF(sum(clientes) FILTER (WHERE ticket_medio IS NOT NULL), 0)::numeric,
    2
  ) AS ticket_medio_dia,
  CASE
    WHEN sum(clientes) > 0 THEN round(sum(receita_liquida) / sum(clientes)::numeric, 2)
    ELSE NULL::numeric
  END AS ticket_real_dia,
  count(*)::integer AS n_turnos,
  EXTRACT(dow FROM data)::integer AS dia_semana,
  to_char(data::timestamp with time zone, 'Dy'::text) AS dia_semana_label,
  sum(receita_bruta) > 0::numeric AND sum(clientes) > 0 AS fonte_ok
FROM public.receita_dias rd
GROUP BY data, unit_id;

NOTIFY pgrst, 'reload schema';
