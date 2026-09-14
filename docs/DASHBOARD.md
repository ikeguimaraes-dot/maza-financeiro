# Dashboard e Cockpit — mesma implementação

Correção de 14/09/2026 após revisão da interface publicada.

## Problema e comportamento corrigido

O facelift estava em `/financeiro`, enquanto o item Dashboard do menu abria `/dashboard`, uma página executiva independente no Shell. Ela continuava mostrando os indicadores de eventos e pessoas, com composição diferente da referência visual aprovada.

Agora a aplicação Financeiro atende `/dashboard` e `/financeiro` com o mesmo componente de servidor `CockpitDashboard`, os mesmos loaders e os mesmos componentes visuais. O Shell encaminha `/dashboard` à origem configurada por `FINANCEIRO_APP_URL`. A URL permanece `/dashboard`, inclusive após mudar competência ou consolidado. A página antiga do Shell foi removida para não interceptar o rewrite `afterFiles`.

Os assets continuam sob `/financeiro/_next`. As páginas reais mantêm os layouts autenticados existentes; a demonstração continua separada, identificada e indisponível em produção. Valores reais variam por unidade e competência.

## Seleção da unidade

O Shell salvava a preferência em `maza_unit_id`; o Financeiro inicializava o menu a partir da chave antiga `kph_unit_id`. Uma preferência legada podia trocar o menu após a renderização e deixar o cabeçalho/indicadores descrevendo outra unidade.

O layout financeiro agora entrega ao provider a unidade já resolvida no servidor. Ela tem prioridade sobre preferências antigas do navegador, limitada às unidades acessíveis. A chave atual é sincronizada com a legada para compatibilidade. A leitura da unidade no servidor é memoizada por renderização para que layout e painel compartilhem a mesma resolução.

## Verificação e publicação

- Financeiro: build, lint dos arquivos alterados e 12 testes de apresentação/seleção passaram.
- Shell: build, lint dos arquivos alterados e quatro testes de roteamento passaram.
- Publicar o Financeiro e aguardar seu deploy antes de publicar o Shell, que passará a encaminhar `/dashboard` à nova rota.
- Conferir em produção: Dashboard ativo no menu, cards e gráficos da referência, consulta mensal mantendo `/dashboard`, unidade do menu igual à do cabeçalho, links da DRE, tema e navegação móvel.

Não recriar `apps/maza/src/app/(dashboard)/dashboard/page.tsx` no Shell: uma página local nessa rota passa à frente do rewrite e reintroduz o problema.
