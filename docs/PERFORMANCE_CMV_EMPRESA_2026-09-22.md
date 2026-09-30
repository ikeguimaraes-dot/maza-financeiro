# Velocidade e CMV empresa — 22/09/2026

Pedido confirmado: um novo card **CMV empresa** = (mercadorias compradas + mão de obra) / faturamento **bruto** × 100. O Prime cost existente continua com a base líquida; não foi renomeado silenciosamente. O card novo explicita sua fórmula e não exibe percentual com faturamento zero, custos ausentes ou fontes de compras/folha ausentes. O consolidado calcula a proporção sobre as somas, não uma média simples de percentuais. Comparações mensais usam pontos percentuais.

## Velocidade

- Produção anterior executava as funções em `iad1`; Supabase está em `sa-east-1`. Nova configuração `regions: ["gru1"]` aproxima aplicação e banco em São Paulo.
- Layout, seleção de unidade e página compartilham uma consulta de unidades por renderização. Removidas a contagem redundante e a busca individual da mesma unidade.
- Autenticação, unidades e menu iniciam em paralelo. O cliente financeiro reutiliza a identidade validada na mesma requisição, evitando outro `getUser()` no mesmo render.
- A memoização usa `React.cache`, limitada à requisição. Não há cache global de sessão ou dados financeiros entre usuários, nem uso de service role nas páginas. O proxy e a camada de acesso continuam validando a identidade.
- `EXPLAIN ANALYZE` da consulta de saúde das fontes: execução de aproximadamente 2,1 ms sob a conexão administrativa. Isso não mede a experiência completa nem o custo de políticas sob todas as funções de usuário.

## Medição

Mesmo navegador autenticado, Yoshimori, agosto/2026, abertura até o título “Confiança nos números” ficar visível. Antes: 6.448 ms, 2.923 ms, 2.408 ms. Amostra pequena; inclui navegação e automação, não é garantia de tempo em toda conexão.

## Verificação

36 testes passaram; tipos, lint e build de produção aprovados. Sem migração de dados para este pedido. O build ainda registra o aviso preexistente de PDF.js, fora do caminho de carregamento do cockpit.

Referências: [React cache](https://react.dev/reference/react/cache), [Next.js: autenticação e DAL](https://nextjs.org/docs/app/guides/authentication), [Vercel: regiões](https://vercel.com/docs/project-configuration/vercel-json#regions).

## Resultado publicado

Deploy `dpl_AnEpYcJfAyLQbCq8KS1ntHZyQF7f`, alias `maza-financeiro.vercel.app`. Depois da publicação, no mesmo navegador/competência: 3.531 ms, 1.103 ms, 1.310 ms. Mediana caiu de 2.923 ms para 1.310 ms (cerca de 55% nesta amostra). Dashboard também verificado: 1.578 ms até o novo card aparecer. Esses tempos variam com conexão, aquecimento e carga.

Conferência no banco e no navegador: Yoshimori agosto, (263.584,82 + 77.302,89) / 656.021,19 = 51,96%, exibido como **52,0%**. Avisos de fechamento pendente continuam visíveis. Nenhum dado financeiro foi alterado neste pedido.
