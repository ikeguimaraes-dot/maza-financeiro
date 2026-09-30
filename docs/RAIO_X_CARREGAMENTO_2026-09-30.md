# Raio X do carregamento — 30/09/2026

## Conclusão

A versão publicada executa trabalho de atualização do histórico durante a leitura do dashboard/cockpit. Esse trabalho envolve paginação sequencial de tabelas com RLS por registro, atravessando a rede entre o servidor nos EUA e o banco em São Paulo. A navegação por recarga completa repete o custo de inicialização. As otimizações locais não estão no commit publicado.

## Versão realmente em produção

- Financeiro: `dpl_GY6s8qbTzPKBBn79uRc3mWaJSGiL`, publicado em 28/09/2026 10:42 UTC pelo GitHub, commit `e6d1456e105ba45cf81aa40bc8ec59ef3b5fc739`.
- Dashboard e financeiro executam em `iad1` (EUA), confirmado no inventário de funções do deployment. Banco Supabase `maza`: `sa-east-1` (São Paulo).
- Shell: `dpl_Aw7auH1H9uqRuo4UPL5nQKNQR4rA`; `/api/nav` também está em `iad1`.
- `vercel.json` local já contém `regions: ["gru1"]`, mas essa configuração não está ativa no deployment financeiro inspecionado.
- O conector Vercel retornou 403 na investigação anterior; a CLI autenticada permitiu consultar os logs e metadados nesta investigação.

## Achados por prioridade

| Prioridade | Evidência | Consequência | Correção |
|---|---|---|---|
| P0 | O arquivo CockpitDashboard.tsx do commit publicado chama `await refreshUnits(db, unitIdsTodos)` antes de consultar indicadores. | Cada abertura varre fontes das duas unidades, mesmo que o usuário tenha selecionado apenas uma. Se necessário, também recalcula os resultados. | Publicar a renderização somente de leitura já existente localmente. Recalcular ao importar/alterar dados; indicar snapshots antigos. |
| P0 | Consultas históricas paginadas; `produtos_relatorio` tem aproximadamente 18.112 registros e `lancamentos`, 6.419. | Cada página com OFFSET volta a processar registros anteriores, e cada página espera a anterior. | Retirar o histórico da abertura. Nas telas que precisam listar meses, consultar períodos distintos no banco, preservando RLS, em vez de baixar todos os itens. |
| P1 | Funções financeiras publicadas em `iad1`; banco em São Paulo. | Cada chamada de autenticação e de dados paga latência entre regiões; chamadas sequenciais acumulam essa espera. | Publicar com `gru1` e verificar o inventário do deployment após READY. |
| P1 | O painel publicado aguarda KPI, metas, DRE, plano de contas e saúde das fontes em sequência. | A espera é somada, inclusive para um detalhe normalmente fechado. | Publicar consultas paralelas, Suspense e consulta de fontes apenas ao expandir. Implementados localmente. |
| P1 | Sidebar local usa links nativos para todas as páginas; layout publicado faz consultas adicionais de unidades. | A troca de tela refaz documento, layout e inicialização de sessão. | Navegação Next Link apenas dentro da zona financeira, sem prefetch indiscriminado; outras zonas e logout mantêm navegação nativa. Implementado nesta investigação. O layout local já compartilha a consulta de unidades por request. |
| P2 | Fallback do menu/login aponta para `maza.vercel.app`; `/api/nav` nesse host respondeu 500. | Instalações sem configuração válida do shell podem esperar erro/timeout antes do menu alternativo. | Fallback alterado para `maza-maza.vercel.app`. Não há confirmação de que o deployment atual usa o fallback, portanto este achado não explica sozinho a lentidão atual. |
| P2 | Política `financeiro_can_read(unit_id)` aplicada por registro. | Autorização repetida amplifica o custo de leituras extensas. | Depois de retirar leituras desnecessárias, estudar permissão calculada uma vez por consulta/unidade. Validar founder, usuário de uma unidade, leitura e ausência de acesso antes de qualquer mudança de RLS. Não desativar RLS. |

## Medições e limites

Estatísticas reais de `pg_stat_statements`, acumuladas desde 03/08/2026; não representam exclusivamente a última hora nem uma versão específica:

| Consulta | Chamadas na coleta inicial | Média no banco | Máximo no banco |
|---|---:|---:|---:|
| Produtos: mês/ano por unidade, paginação do refresh | 523 | 2.097,17 ms | 7.497,05 ms |
| Lançamentos: competência por unidade | 199 | 1.358,11 ms | 5.084,67 ms |
| Títulos: datas por unidade/origem | 118 | 1.082,27 ms | 3.266,36 ms |
| Saúde das fontes, ordenada | 81 | 745,91 ms | 1.207,47 ms |

Uma execução de EXPLAIN ANALYZE sob o papel `authenticated`, com contexto de founder, levou 222,353 ms para retornar os primeiros mil pares mês/ano. O plano usa o índice `idx_produtos_relatorio_unit_mes` e aplica `financeiro_can_read(unit_id)` como filtro; não é simplesmente ausência de índice. Não foram alteradas políticas nem dados.

Sondagens HTTP públicas, uma amostra por URL, feitas da máquina local:

- `https://maza.vercel.app/api/nav`: HTTP 500, total 2,296 s.
- `https://maza-maza.vercel.app/api/nav`: HTTP 200, total 0,263 s.
- `https://maza-maza.vercel.app/login`: HTTP 200, total 0,517 s.

No navegador autenticado, cockpit e contas a pagar apresentaram shell e depois o estado “Carregando dados financeiros”. O cockpit permaneceu em espera na janela de observação e finalmente exibiu os dados. Não se usa o intervalo entre chamadas da automação como tempo exato de carregamento. Não há comparação controlada antes/depois em produção nem percentual de aceleração comprovado.

## Trabalho local e validação

- Correções anteriores: cockpit sem refresh na leitura, consultas paralelas, limite real de espera, detalhe de fontes sob demanda, cabeçalho progressivo, layout com consultas compartilhadas por request e região `gru1` na configuração.
- Nesta investigação: navegação interna do menu sem recarregar o documento; filtros e dashboard reconhecidos como rotas da mesma zona; logout e outras zonas preservados; fallback do shell corrigido.
- Build de produção aprovado, TypeScript aprovado, ESLint dos arquivos alterados aprovado, suíte completa com 66 testes aprovada.
- Permanece um aviso preexistente do build relativo ao worker do PDF.js, fora do caminho principal diagnosticado.
- Nenhuma publicação, migração ou alteração de dados executada nesta investigação.

## Ordem para colocar a correção no ar

1. Integrar as alterações de desempenho ao estado atual do repositório remoto, preservando as mudanças de autenticação e dependências do commit publicado. Há bastante trabalho local anterior ainda não commitado; um deploy isolado sem atualizar o GitHub pode ser substituído novamente pelo próximo push.
2. Publicar o financeiro com `gru1`, leitura de snapshots e navegação interna. Conferir região real, não somente o arquivo local.
3. Validar dashboard, cockpit, DRE, fluxo, pagar, troca de unidade e login no domínio canônico. Confirmar que abrir cockpit não dispara leituras históricas nem escrita no banco.
4. Medir novamente sob a mesma unidade/competência. Priorizar consultas de períodos distintos e RLS apenas onde restar custo relevante.

Referências técnicas: [RLS e recomendações de desempenho](https://supabase.com/docs/guides/database/postgres/row-level-security), [carregamento progressivo do Next.js](https://nextjs.org/docs/app/api-reference/file-conventions/loading).
