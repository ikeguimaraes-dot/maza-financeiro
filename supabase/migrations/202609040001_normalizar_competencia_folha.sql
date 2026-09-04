-- A folha usa competência mensal no formato YYYY-MM em todas as APIs.
update public.dre_folha
set competencia = left(competencia, 7)
where competencia ~ '^20[0-9]{2}-(0[1-9]|1[0-2])-01$';
