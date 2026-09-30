# Raio X de desempenho — 23/09/2026

## Achados e correções

- Fluxo de caixa: oito fontes independentes eram aguardadas em sequência. Agora iniciam em paralelo, mantendo paginação, filtros por unidade e cálculos.
- NF de entrada: o redirecionamento ao último mês disponível ocorria depois de consultar itens, mês anterior, receita e documentos. Agora ocorre antes dessas leituras. Para um mês válido, cinco fontes independentes iniciam em paralelo; pagamentos continuam dependendo dos IDs dos dias.
- Contas a pagar: pagamentos agora são consultados junto com títulos, eliminando uma espera serial. O histórico de títulos permanece completo para preservar a detecção de duplicidades e o aviso de registros sem competência.
- Conferência: links de competência não iniciam pré-carregamentos automáticos.
- Logo: caminhos públicos de marca deixam de executar renovação/verificação de sessão. Páginas e APIs financeiras continuam autenticadas.

## Evidências e limites

Consulta de competências distintas de produtos no banco: EXPLAIN ANALYZE de 1,630 ms, com uso do índice existente. Isso não mede latência de rede, RLS do usuário, renderização nem tempo total da página. Não houve justificativa para criar índices adicionais com essa evidência.

NF de entrada ainda lê o histórico de competências; contas a pagar mantém histórico para conferência de duplicidades. São candidatos a futuras consultas agregadas, com testes específicos para não perder informação.

Não foi estabelecida uma comparação controlada de tempo antes/depois no navegador; não há percentual de aceleração comprovado.

## Validação

TypeScript e ESLint dos arquivos alterados aprovados. 21 testes de integridade, fluxo, CMV e carregamento do cockpit aprovados; acrescentado teste que exige o início simultâneo das oito fontes do fluxo (14 testes da suíte de integridade aprovados após a inclusão).

Referência técnica: https://supabase.com/docs/guides/database/query-optimization

## Publicação e conferência

Deploy READY: dpl_G5LJjZDX7HPJpEpD1tghjycQrq2C, alias maza-financeiro.vercel.app.
Verificação pelo endereço canônico maza-maza.vercel.app: Fluxo de agosto abriu com entradas previstas R$ 583.505,18 e saídas previstas R$ 275.570,43, preservadas; NF-e Entrada e Contas a Pagar carregaram dados sem mensagem de erro. A navegação em NF-e sem parâmetros encontrou dados de setembro, portanto o ramo de redirecionamento antecipado não foi exercitado nessa verificação visual.
