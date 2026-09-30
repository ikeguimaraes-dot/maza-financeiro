# Navegação, Contas a Pagar e Fluxo — 23/09/2026

- MISE executa em projeto Vercel separado. A versão publicada em 14/09 correspondia ao checkout maza-mise-visao-facelift, usado como base para evitar regredir a interface.
- Sidebar, autenticação por sessão, unidades e transformações do menu do Financeiro reutilizados no MISE. Logo Phi, tema, pesquisa de páginas, seletor global e Operação > MISE preservados ao navegar. Código salvo em /Users/henriqueguimaraes/maza-mise-visao-facelift; cópia de publicação em /tmp/phi-mise-sidebar.
- Contas a Pagar: seletor de competência substitui a lista de botões dos meses, preservando fonte e visão. Cores de status seguem tokens do tema.
- Fluxo: seleção de mês com início e fim reais, cards das entradas e saídas realizadas e previstas do mês, tabela por dia ou semana. Semanas de segunda a domingo são limitadas ao mês; saldos de abertura e fechamento não são somados.
- Para períodos anteriores à data-base bancária, as movimentações podem ser consultadas. Não se exibe saldo sem base: saldoBaseDisponivel=false oculta saldos da tabela e do gráfico e mostra aviso. Nenhum saldo foi retroativamente criado.
- Verificação: TypeScript de ambos projetos, ESLint dos componentes alterados, 14 testes de integridade e agrupamento semanal. Inspeção do MISE em produção confirmou logo Phi e unidade Restaurante.
