# Carregamento do dashboard e cockpit — 30/09/2026

As duas rotas usam `CockpitDashboard`. A leitura de competências agora começa junto da autenticação e da resolução de unidade, mantendo o cliente autenticado e RLS. O cabeçalho tem uma fronteira Suspense separada dos indicadores.

A consulta `v_fonte_saude` saiu da abertura da página e passa a ocorrer quando o usuário expande “Consultar fontes de dados”. A action exige autenticação, preserva RLS e não usa cache compartilhado. O detalhe mostra carregamento, erro com nova tentativa e ausência de fontes explicitamente. Os indicadores de confiança continuam vindo do snapshot, sem mudar os cálculos.

O prazo de 15 segundos das consultas paginadas agora rejeita a espera mesmo se o cliente não responder ao AbortSignal. O prazo continua único para todas as páginas.

## Evidências

- `pg_stat_statements` em produção: consulta ordenada de fontes com 81 chamadas, média de 745,91 ms e máximo de 1.207,47 ms; outra variante chegou a 2.168,07 ms. Esses tempos são do banco, não da página inteira.
- EXPLAIN com conexão administrativa: 2,086 ms. Não representa o custo sob RLS do usuário; por isso não foi usado para descartar o gargalo observado nas chamadas reais.
- Navegador autenticado: reproduzido o estado de carregamento prolongado. A página finalmente apresentou dados. A versão publicada tem diferenças em relação ao trabalho local preexistente.
- Logs da Vercel indisponíveis pelo conector (403). Não há medição controlada de antes/depois em produção e nenhuma promessa de percentual de ganho.

## Validação

TypeScript, ESLint dos arquivos alterados e 18 testes direcionados aprovados (carregamento, cálculo de despesas, apresentação e autenticação do detalhe de fontes). Nenhuma alteração de schema, permissões ou dados financeiros. Build de produção com Turbopack aprovado fora do sandbox; permanece um aviso preexistente sobre o worker do PDF.js. A tentativa alternativa com Webpack falhou na integração preexistente do PDF.js. Alterações ainda locais, sem publicação.

Referências: https://nextjs.org/docs/app/api-reference/file-conventions/loading e https://supabase.com/docs/guides/database/query-optimization.
