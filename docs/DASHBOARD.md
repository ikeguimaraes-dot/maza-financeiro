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

## Diagnóstico de carregamento — 18/09/2026

As duas rotas aguardavam `refreshUnits` antes de renderizar. Mesmo com snapshots
atuais, essa rotina lia as fontes e o razão de todo o histórico das duas unidades,
em páginas de mil registros; revisões antigas também disparavam recálculos na
própria abertura. Depois disso, as cinco consultas do painel rodavam em sequência.

Na inspeção do banco Maza, os 12 snapshots estavam na revisão atual. As fontes
percorridas tinham aproximadamente 27.700 registros, segundo `pg_stat_user_tables`.
As seis relações necessárias ao painel responderam às consultas de diagnóstico.
No navegador de produção, o Dashboard estava aberto e o Cockpit passou pelo estado
de carregamento, mas terminou de abrir. Não foi comprovado um travamento permanente.

A abertura agora apenas lê os resumos. O recálculo permanece no fluxo de gravação
via `applyBatch` e nas ações do razão. As consultas independentes do painel rodam
em paralelo; cada leitura paginada tem prazo total de 15 segundos e cancelamento.
Falhas chegam ao tratamento de erro da rota, com opção de tentar novamente.
Revisões diferentes geram um aviso de que os valores exibidos aguardam recálculo.
Esses prazos não incluem autenticação e carregamento do layout compartilhado.

Os testes cobrem paginação, cancelamento, propagação de erro e identificação de
resultados antigos. A mudança precisa ser publicada no Financeiro para afetar
as duas rotas em produção; não exige alteração de schema ou do Shell.

### Publicação e aceitação — 18/09/2026

Correção publicada no deployment `dpl_FWzycJBtxR5t83GC2SpS3bLpreLD`, promovido
para `maza-financeiro.vercel.app`. Build remoto concluído. Pela sessão autenticada
do Shell (`maza-maza.vercel.app`), o Dashboard foi recarregado e exibiu os indicadores;
a navegação para Cockpit também concluiu com cards, gráfico e DRE. Os logs do novo
deployment registraram acessos às duas rotas. A verificação do Dashboard após reload
levou 3,6 segundos incluindo a chamada de inspeção do navegador; não é uma medição
isolada de tempo do servidor nem uma garantia de latência.
