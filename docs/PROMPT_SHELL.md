# Continuidade do facelift — Shell

Continue o facelift Maza v1 já implementado. O repositório correto é `https://github.com/ikeguimaraes-dot/maza.git`, na pasta `/Users/henriqueguimaraes/maza`. Confira `git remote get-url origin`, o estado local e o `AGENTS.md` antes de editar. Consulte os commits do facelift e preserve eventuais alterações locais adicionais.

Leia `/Users/henriqueguimaraes/maza-financeiro/docs/FACELIFT.md` e `facelift-manifest.json`. A referência do cockpit está em `http://localhost:3001/design-preview.html`, quando o servidor financeiro estiver ativo. O HEAD anterior à entrega do Shell era `eb6e4ac`; isso é a base, não um commit que contenha o facelift.

A identidade já está em `apps/maza/src/styles/maza-system.css`; copie mudanças de tokens para as outras duas aplicações conforme o manifesto. Preserve Fraunces e Instrument Sans, superfícies marfim, sidebar verde escura, tangerina/lima, tema escuro e `prefers-reduced-motion`.

Arquivos centrais já alterados: `apps/maza/src/app/globals.css`, `src/app/layout.tsx`, `src/app/(dashboard)/layout.tsx`, `src/components/shell/Sidebar.tsx`, `TopBar.tsx`, `ZoneLink.tsx`, os novos componentes de tema/menu em `src/components/ui` e `packages/ui/src/ui/kpi-card.tsx`.

Priorize agora a revisão autenticada da moldura com os três módulos: menu móvel, busca, notificações, unidade ativa, permissões, sessão e rotas entre zonas. O Financeiro e o MISE desenham suas próprias sidebars; `packages/ui` não é automaticamente distribuído a eles. O Financeiro tem cópia em `lib/maza/ui`.

Use a porta 3010 para o Shell local (`npm run dev -- --port 3010` em `apps/maza`). O processo da porta 3000 pertence a outro projeto e não deve ser alterado. Não use nem modifique as pastas locais `maza-MISE` ou `maza-mise-visao`. O MISE correto está em `maza-mise-visao-facelift` e usa a porta 3008.

Não altere regras financeiras, banco ou autenticação como parte da aparência. Valide as mudanças em 360, 390, 768, 1024 e 1440 px e pelos dois temas. Menu fechado não deve participar da ordem de foco; menu aberto deve conter o foco e fechar por Escape, devolvendo-o ao acionador. Execute o build e a verificação de tipos do app, e lint dos arquivos alterados. Documente resultados e limites sem afirmar que uma prévia fictícia valida os dados reais.
