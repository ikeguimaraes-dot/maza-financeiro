# Continuidade do facelift — MISE Visão Geral

Continue o facelift Maza v1 no repositório `https://github.com/ikeguimaraes-dot/maza-mise-visao.git`, clonado especificamente para esta tarefa em `/Users/henriqueguimaraes/maza-mise-visao-facelift`. Confira a origem antes de qualquer edição. As pastas `maza-mise-visao` e `maza-MISE` existentes são OUTROS projetos: não usá-las nem alterá-las. O HEAD anterior ao facelift era `83e674e`; consulte os commits do facelift e preserve eventuais alterações locais adicionais.

Leia `/Users/henriqueguimaraes/maza-financeiro/docs/FACELIFT.md` e `facelift-manifest.json`. A implementação já existe; não recrie a interface do zero. O cockpit financeiro define a identidade comum. `src/styles/maza-system.css`, `ThemeProvider`, `ThemeToggle`, `WorkspaceTopbar` e `useMobileNavigation` devem permanecer sincronizados conforme o manifesto. `src/styles/mise.css` concentra a composição específica da operação.

A visão geral usa `src/components/mise/MiseOverview.tsx`, `LabelsTable`, `KpiCard`, `PrinterRanking` e `ChecklistsTable`. A página `src/app/mise/page.tsx` mantém seus loaders existentes e entrega os dados a esses componentes. A navegação recursiva e a resolução de links entre zonas continuam em `src/components/Sidebar.tsx`.

Inicie `npm run dev -- --port 3008`. Revise `http://localhost:3008/design-preview.html` e `?empty=1`: os dados são fictícios, identificados e indisponíveis fora de desenvolvimento. As páginas reais continuam protegidas normalmente.

Priorize a validação com uma sessão legítima pelo Shell: unidade selecionada, leituras das fontes reais, menu remoto, links e consistência dos estados. A busca e os filtros atuais abrangem as etiquetas carregadas, não toda a base; preserve a indicação desse limite. Não interprete zero como prova de integração saudável: os loaders atuais ainda podem retornar zero quando não há dados disponíveis.

Mantenha o foco da interface em vencimentos, rastreabilidade e execução de rotinas. Desktop usa tabela, celular usa detalhes expansíveis; estado, prazo e unidade devem estar legíveis sem depender de cor. Preserve horários em São Paulo e o instante de referência comum da renderização. Não invente categorias ou mapeamentos de status sem conferir os dados reais.

Valide 360, 390, 768, 1024 e 1440 px, os dois temas, filtros combinados com busca, teclado/Escape, estados vazios, tipos, lint dos arquivos alterados e build. Não altere banco, RLS, credenciais ou regras de autorização para testar aparência. Documente o que foi observado em dados reais e o que só foi verificado na prévia.
