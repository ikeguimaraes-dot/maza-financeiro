# Maza — facelift v1

Implementado em 14/09/2026. A referência visual desta versão é o cockpit financeiro, acompanhado pela visão geral do MISE e pela moldura de navegação do Shell. Este documento descreve a entrega versionada do facelift v1.

## Repositórios corretos

| Aplicação | Checkout usado | Origem | HEAD anterior ao facelift |
| --- | --- | --- | --- |
| Financeiro | `/Users/henriqueguimaraes/maza-financeiro` | `ikeguimaraes-dot/maza-financeiro` | `9c7ff80` |
| Shell | `/Users/henriqueguimaraes/maza` | `ikeguimaraes-dot/maza` | `eb6e4ac` |
| MISE Visão Geral | `/Users/henriqueguimaraes/maza-mise-visao-facelift` | `ikeguimaraes-dot/maza-mise-visao` | `83e674e` |

O MISE foi clonado do repositório indicado pelo usuário e guardado em uma pasta nova. As pastas existentes `maza-mise-visao` e `maza-MISE` pertencem a outros projetos e ficam excluídas deste trabalho. Não usá-las como referência nem destino. O processo já existente na porta 3000 também fica excluído.

## O que foi entregue

- Identidade comum com Fraunces e Instrument Sans, superfícies marfim, navegação verde escura, destaques tangerina e lima, cores semânticas e tema escuro. Transições breves respeitam a preferência por movimento reduzido.
- Cockpit financeiro com hierarquia de indicadores, minigráficos, evolução mensal interativa, composição de custos, DRE expansível, qualidade das fontes e pendências. Competência e consolidado preservam os filtros existentes.
- Navegação móvel com acionador visível, painel sobreposto, fundo inerte, foco contido, Escape e retorno ao acionador. Busca de páginas por nome com Ctrl/Cmd K; seletor de tema persistido.
- Base visual aplicada ao Fluxo de Caixa, DRE, Contas a Pagar e estados de carregamento/erro. Grades de formulários, análises e painéis selecionados passaram a se adaptar à largura. Contas a Receber continua indicando honestamente a funcionalidade ainda não implementada.
- Shell com sidebar, topbar, componentes de indicadores e temas alinhados. Rotas, seleção de unidade, permissões, notificações e command palette preservados. Contraste dos botões de autenticação ajustado aos dois temas.
- MISE com indicadores de validade, busca e filtros de etiquetas, tabela no desktop e detalhes expansíveis no celular, ranking de impressão em barras e checklists em cartões.

Os dados, consultas, permissões e integrações existentes continuam nos seus adaptadores locais. O trabalho não criou alterações de banco, migrações ou novas dependências de gráficos. O MISE recebeu `next-themes@0.4.6`, já usado pelos outros módulos.

## Contrato visual

Fonte de referência: `src/styles/maza-system.css` neste repositório. Cópias idênticas em `maza/apps/maza/src/styles/maza-system.css` e `maza-mise-visao-facelift/src/styles/maza-system.css`. Os hashes da entrega estão em `facelift-manifest.json`.

| Uso | Tema claro |
| --- | --- |
| Fundo | `#f6f5f0` |
| Superfície | `#ffffff` |
| Texto | `#252922` |
| Navegação | `#222a23` |
| Ação / texto de marca | `#c24123` |
| Tangerina de destaque | `#ff7148` |
| Lima | `#d8ef86` |
| Séries complementares | `#1b7881`, `#7961b5` |

Usar os tokens semânticos em botões e texto; as cores de destaque não substituem os pares de texto e fundo. A sidebar mantém um escopo próprio de tokens para permanecer escura no tema claro. Preferir as classes `maza-page-heading`, `maza-panel`, `maza-button`, `maza-table`, `maza-kpi` e suas variantes a novos estilos duplicados.

`ThemeProvider`, `ThemeToggle` e `useMobileNavigation` são cópias comuns. O Financeiro e o MISE também compartilham `WorkspaceTopbar`; o Shell usa seu `TopBar` para preservar a command palette e as notificações existentes. A chave do tema é `maza-theme`. Na mesma origem, os módulos compartilham a preferência; portas locais diferentes possuem armazenamentos separados.

O Shell publica a árvore de navegação por `/api/nav`. Cada módulo renderiza sua própria sidebar: editar apenas `packages/ui` do Shell não modifica o Financeiro, que usa aliases para a cópia em `lib/maza/ui`. Atualizar as cópias conscientemente e conferir o manifesto até que um pacote compartilhado seja adotado.

## Regras preservadas nos indicadores

- Ausência de dados, zero e valores inválidos são estados distintos.
- Indicadores dependentes de compras ou folha ausentes ficam indisponíveis; resultado e EBITDA parciais recebem rótulo explícito.
- Comparações percentuais exigem base válida e diferente de zero; margens usam pontos percentuais.
- Aumento de custo percentual é sinal de atenção; aumento de receita é favorável.
- Meses ausentes interrompem as curvas. A tabela de valores torna o gráfico consultável sem hover.
- No MISE, a busca e os filtros abrangem somente as etiquetas carregadas pelo loader existente. A interface informa esse limite quando a contagem total é maior.

## Revisão local

As prévias têm dados fictícios explicitamente identificados e só existem em desenvolvimento; em produção retornam 404. Não abrem acesso às páginas protegidas.

| Aplicação | Comando, executado no diretório da aplicação | Endereço |
| --- | --- | --- |
| Financeiro | `npm run dev` | `http://localhost:3001/design-preview.html` |
| MISE correto | `npm run dev -- --port 3008` | `http://localhost:3008/design-preview.html` |
| Shell, em `maza/apps/maza` | `npm run dev -- --port 3010` | `http://localhost:3010/login` |

Financeiro: `?state=partial` e `?state=empty` apresentam outros estados. MISE: `?empty=1` apresenta o estado vazio. Os links das prévias que apontam para páginas reais continuam sujeitos à autenticação normal.

Para a futura revisão integrada com login, iniciar Financeiro e MISE com `NEXT_PUBLIC_SHELL_URL=http://localhost:3010` no ambiente do processo. Iniciar o Shell com `FINANCEIRO_APP_URL=http://localhost:3001` e `MISE_APP_URL=http://localhost:3008`, evitando eventuais destinos de produção configurados localmente. O checkout novo do MISE precisa das configurações legítimas do seu projeto para consultar dados reais. As prévias isoladas não precisam dessas credenciais. Os arquivos de ambiente existentes não foram alterados.

## Verificações

- Builds de produção concluídos nos três projetos; TypeScript verificado.
- Oito testes de apresentação financeira passaram: `npm run test:ui`.
- Prévia do Financeiro e do MISE inspecionada em 360, 390, 768, 1024 e 1440 px, sem extravasamento horizontal da página ou do conteúdo principal.
- Temas claro/escuro, estados preenchidos/vazios e Financeiro parcial inspecionados visualmente. Verificados seleção de competência, alternância do gráfico, expansão da DRE, busca de páginas, filtros de etiquetas, detalhes móveis e navegação por teclado.
- Página de login do Shell inspecionada sem envio de credenciais.
- Lint dos componentes novos e do núcleo redesenhado passou. A verificação ampliada dos arquivos financeiros alterados encontrou 14 erros e 16 avisos já presentes nos arquivos originais de receita, análises, produtos e DRE; comparar com `git show HEAD:caminho` confirma a origem. O facelift não refatora essas regras de negócio para satisfazer o lint.
- No MISE, a sidebar mantém dois erros e um aviso de lint anteriores; os demais arquivos alterados passaram. No Shell, os arquivos do aplicativo alterados não têm erros; seis avisos anteriores permanecem no formulário de login e na sidebar.
- O build financeiro mantém avisos anteriores sobre a convenção `middleware` do Next e externalização de `pdfjs-dist`.

## Limites desta validação

A inspeção visual usou fixtures isoladas. A integração autenticada dos três módulos pelo Shell, com unidade real, permissões e dados de produção, ainda precisa ser percorrida em uma sessão de revisão. As telas secundárias que herdaram o tema não tiveram todos os seus fluxos operacionais inspecionados individualmente. Zoom real de 200%, leitores de tela e aparelhos físicos não foram testados.

A entrega do Financeiro também inclui a alteração preexistente de `next-env.d.ts`, que aponta para os tipos de rotas gerados pelo build. Ela foi incluída no pedido de commit de todas as alterações.

Os prompts `PROMPT_SHELL.md` e `PROMPT_MISE.md` permitem continuar em outras sessões sem recomeçar ou perder a identidade implementada. O manifesto identifica os arquivos comuns desta versão pelos seus hashes.
