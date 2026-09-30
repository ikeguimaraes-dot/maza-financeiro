# Raio x operacional — 22/09/2026

## Escopo e conclusão

Inspeção do código local, consultas somente leitura ao banco Maza
(`dncqjezvndoxeqpklefy`), confirmação do deploy ativo e testes locais.
Deploy ativo: `dpl_FWzycJBtxR5t83GC2SpS3bLpreLD`, publicado em 18/09.
Não foram alterados dados, regras, schema ou deploy nesta auditoria.
Não foi realizado um ciclo real de compra, pagamento ou importação em produção.

O sistema já tem infraestrutura utilizável, mas ainda não fecha o ciclo operacional
documento → obrigação → pagamento → banco → resultado. Há falhas técnicas, decisões
de negócio pendentes e ausência de alimentação do período corrente. A prioridade é
concluir NF de entrada e contas a pagar, validar um mês/unidade e só então usar os
indicadores como referência de gestão diária.

## Evidências atuais do banco

| Evidência | Resultado | Interpretação |
| --- | --- | --- |
| Contas a pagar Yoshimori | 1.139 títulos; R$ 1.195.036,21 | Competências maio–agosto/2026 |
| Contas a pagar IKY | 846 títulos; R$ 1.350.597,08 | Competências maio–agosto/2026 |
| NF_PEDIDOS Yoshimori | 889 registros; R$ 697.683,79 | Não somar ao contas a pagar: são fontes potencialmente sobrepostas |
| CNPJ nos títulos | Ausente nos 2.874 registros | Prejudica identidade e conciliação |
| Pagamento indefinido em contas_pagar | 244 títulos; R$ 331.264,77 | Não significa dívida confirmada |
| Vencimento em NF_PEDIDOS | Ausente nos 889 registros | Fonte de compras não constitui agenda de pagamentos |
| Vencimento em contas_pagar | Ausente em 6 registros | Precisa saneamento |
| Valor pago, data de baixa e saldo atual em contas_pagar | Nenhum registro preenchido nos campos consultados | Status textual não equivale a pagamento comprovado |
| NF-e entrada | 920 documentos, incluindo 12 cancelados | Nenhum documento cancelado ainda tem itens vinculados |
| Reconciliações | 521 confirmadas; 666 sem_xml | Confirmada pode ser automática; sem_xml significa sem correspondência pela regra, não prova de XML inexistente |
| Valor dos registros sem_xml | R$ 643.076,25 | Inclui universos de compras/títulos; não interpretar como passivo adicional |
| Diferença total da NF × soma do custo dos itens | 240 notas ativas; diferença líquida agregada R$ 21.488,11 | Investigar desconto, frete, encargos, tributos e integridade; não é perda comprovada |
| Contas bancárias / movimentos / recebíveis de cartão | 0 / 0 / 0 | Caixa sem base bancária conciliada |
| Último dia de receita | 31/08/2026 | Sem alimentação de setembro encontrada nessa fonte |
| Última competência da folha | Agosto/2026, nas duas unidades | Período atual não alimentado |
| Última importação dos títulos | 10/09/2026 | Arquivo recente pode conter apenas história antiga |
| Última inclusão de NF-e entrada | 14/09/2026 | Confirmar rotina de atualização e cobertura |
| Snapshots | 12; todos na revisão registrada atual | Coerência de revisão não comprova completude das fontes |
| Lançamentos em 9.99 | 50; R$ 64.452,24 em valores absolutos | Ainda aguardam classificação |
| DRE histórica, tabela dre_mensal | 0 registros | Camada distinta dos snapshots; não confundir tela vazia com ausência de toda DRE |

## Achados priorizados

### P0 — período atual inacessível nas telas principais de controle

Contas a pagar, conferência e divergências aceitam apenas maio–agosto/2026,
fixados no código. Uma consulta a setembro volta para agosto.
Fontes: `src/app/financeiro/pagar/page.tsx:15`,
`src/app/financeiro/aprovacoes/page.tsx:15`,
`src/app/financeiro/dre/divergencias/page.tsx:14`.

Solução: seletor de período dinâmico, incluindo mês atual e futuro; separar agenda
por vencimento de análise por competência. Mostrar ausência de dados explicitamente.

### P0 — entrada de NF pode ser recusada por uma inferência incorreta

`inferDirection` verifica primeiro se o emitente se repete. Um pacote com duas
compras do mesmo fornecedor para a mesma unidade retorna `saida`, e a tela de
entrada o rejeita. Reproduzido localmente com XMLs sintéticos.
Fontes: `src/lib/nfe/parser.ts:102`;
`src/components/financeiro/produtos/NfeImportModal.tsx`.

Solução: identificar cada nota pelos CNPJs próprios cadastrados; não inferir a
direção pela frequência do fornecedor. Tratar transferências entre unidades e
pacotes mistos explicitamente.

### P0 — conciliação usa identidades diferentes em telas diferentes

`getConciliacao` agrupa apenas pelo número da nota, não filtra entrada/saída nem
separa origens dos títulos. Pode combinar NF_PEDIDOS e contas_pagar e associar
fornecedores diferentes. O banco tem um número de NF de entrada reutilizado por
fornecedores diferentes na mesma unidade ao longo do histórico, embora não no mesmo
mês. O razão tem outra regra: fornecedor do catálogo + número + competência +
tolerância de 2%. Portanto, uma tela dizer conciliado não garante equivalência
com o vínculo usado pelo razão.
Fonte: `src/app/financeiro/actions-operations.ts:432`.

Solução: vínculo persistente por chave fiscal, unidade, fornecedor identificado e
parcelas; uma única regra compartilhada pelas telas e pelo razão. Correspondência
ambígua precisa de revisão humana. Não tratar casamento automático como aprovação.

### P0 — proteção contra duplicidade pode excluir despesa sem comprovação individual

O razão ignora TODOS os títulos ALIMENTOS/BEBIDAS de contas_pagar quando existe
NF_PEDIDOS na unidade/competência. A existência de parte da planilha não comprova
que todas as compras estejam cobertas. Falha de desenho confirmada no código;
valor efetivamente omitido ainda depende da conferência dos documentos.
Fonte: `src/lib/financeiro/razao/gerar.ts:456`.

Solução: excluir duplicidade apenas por obrigação/documento efetivamente vinculado,
com diferença de valor explicada; preservar exceções numa fila de conferência.

### P0 — contas a pagar funciona sobretudo como relatório de importação

Situação deriva de `liquidacao_origem`: prefixo OK ou OIK significa pago; vazio
significa indefinido; qualquer outro texto vira não pago. O banco contém *, **,
*** e textos como TOTAL, cujo significado precisa ser confirmado. O cálculo usa
valor integral do título, sem uma rotina completa de baixa parcial, juros,
desconto, estorno e saldo restante. Não identifiquei nessa tela uma ação de baixa
operacional que feche o ciclo com o banco.
Fontes: `src/lib/financeiro/pagar/calcularPagar.ts`,
`src/lib/financeiro/fluxo/liquidacao.ts`.

Solução: obrigação com saldo e pagamentos separados (data, valor, conta, comprovante,
responsável). Suportar baixa parcial e estorno; definir estados de aprovação e
pagamento. Os 244 casos indefinidos devem ser reconciliados com a fonte oficial.

### P1 — importação pode substituir dados e perder continuidade dos vínculos

O importador de compras substitui a origem/unidade de importação/competência e
gera novos UUIDs para os títulos. Um arquivo parcial pode remover linhas omitidas;
IDs novos comprometem vínculos e ajustes por título. A atomicidade protege contra
gravação pela metade, mas não torna um arquivo parcial um retrato completo.
O importador ERP e o importador de compras também escrevem em contas_pagar.
Não foram encontradas reconciliações órfãs ou overrides atuais; este é um risco
de reimportação, não evidência de perda já ocorrida.
Fonte: `src/lib/financeiro/importacao/compras/importarCompras.ts:40`.

Solução: identidade estável por obrigação/parcela, origem de arquivo rastreável,
modo explícito de carga completa versus incremental e preview de inclusões,
alterações e exclusões. Preservar baixas e decisões humanas em estruturas próprias.

### P1 — importação de NF ainda pode ser lenta e deixar resultado parcial do pacote

ZIPs são enviados em blocos de 75 notas. Cada bloco grava e aguarda `refreshUnits`,
que pode recalcular todos os meses da unidade, antes do catálogo. O catálogo vem
depois do cálculo e alterações nele também invalidam revisões. Uma falha posterior
não desfaz os blocos anteriores. Depois da correção do Dashboard, a leitura do
painel já não dispara a tentativa de recálculo.
Fontes: `NfeImportModal.tsx:51`, `cmv/actions.ts:229`, `cmv/actions.ts:237`,
`src/lib/financeiro/db/atomic.ts:25`, `src/lib/financeiro/razao/refresh.ts`.

Solução: trabalho persistente em fila, progresso por arquivo, retomada segura,
catálogo antes do cálculo e recálculo dos meses afetados ao fim do lote. Separar
status de importação, classificação e atualização dos indicadores.

### P1 — ciclo fiscal/documental incompleto

O parser aceita NFe/nfeProc, mas rejeita eventos isolados (reproduzido localmente).
Não extrai duplicatas/vencimentos; importar XML não cria uma obrigação a pagar.
O fluxo examinado envia os dados extraídos e o nome do ZIP, sem arquivar o XML
original nesse caminho. Usa vProd para custo, sem explicar todos os componentes
que diferenciam a soma dos itens do total da NF. O razão usa NCM e desconsidera
CFOP nessa classificação; exclui bonificação por total zero/R$ 0,01, o que não
resolve todas as naturezas de operação.

Solução: arquivo original e hash, eventos por chave, reconciliação dos componentes
do total, tratamento explícito de compra, devolução, bonificação, transferência e
imobilizado. Duplicatas podem propor parcelas, mas não comprovam dívida/pagamento
automaticamente. Validar as regras gerenciais com o responsável pelo fechamento.

### P1 — caixa e fechamento ainda não podem ser tratados como posição realizada

Sem contas, saldos de abertura, movimentos e recebíveis, as estimativas de caixa
não têm base para representar a posição bancária. Contas a receber está em
preparação. As camadas DRE histórica, títulos e snapshots coexistem. O CMV do
cockpit é por compras; consumo de estoque exige inventário e regra própria.
O índice de confiança usa saúde de fontes globais, inclusive módulos sem dados,
e snapshots podem estar na revisão atual com fontes antigas.

Solução: escolher a DRE oficial, cadastrar saldos por data-base, importar extratos,
conciliar pagamentos/recebimentos e explicitar previsto versus realizado. Medir
completude por unidade/período/fonte, com responsável e prazo de alimentação.

## Decisões que dependem do usuário

1. O Maza será o controle oficial de pagamentos ou acompanhará um ERP/planilha?
   Qual fonte vale quando divergem? Recomendo uma única fonte oficial durante a transição.
2. De onde vêm os XMLs e os títulos? Quem os disponibiliza e com que frequência?
   NF_PEDIDOS é lista de compras, pedidos ainda não recebidos ou registro de dívidas?
3. Os arquivos são retratos completos do mês ou lotes parciais? Podem conter as duas
   unidades? Um registro ausente deve ser removido ou preservado?
4. O que significam *, **, ***, OK e vazio? Existem pagamentos parciais,
   agrupados, antecipações, renegociações, juros e descontos?
5. Quais CNPJs pertencem a cada unidade? Uma empresa compra ou paga por outra?
   Como devem aparecer transferências e rateios?
6. Quem cadastra, confere, aprova e paga? Quais limites e comprovantes são obrigatórios?
7. Qual mês fechado e validado servirá de referência? Recomendo agosto/2026 se
   existir fechamento confiável. Qual unidade deve ser o piloto?
8. A prioridade inicial é agenda de pagamentos/caixa ou DRE/CMV? Há contagem de
   estoque confiável? Compras e consumo devem ser apresentados separadamente?
9. Quais bancos e adquirentes entram no caixa e quem fornecerá saldos/extratos?
10. Quem será o responsável diário pela alimentação e resolução das pendências?

## Sequência proposta e critérios de aceite

1. **Destravar:** meses dinâmicos, direção de NF por CNPJ, erros por arquivo e
   preservação de identidade. Aceite: importar entrada do mesmo fornecedor, acessar
   setembro e repetir o arquivo sem duplicar ou perder vínculos.
2. **Unificar documentos e obrigações:** cadastro de fornecedores, vínculo de nota
   a parcelas e remoção da exclusão por categoria/mês. Aceite: nota parcelada,
   compra sem XML, mesmo número em fornecedores distintos, cancelamento e arquivo
   parcial geram resultados explicáveis; nenhum custo duplicado/omitido silenciosamente.
3. **Operar pagamentos:** agenda por vencimento, aprovação, baixa parcial/total,
   estorno, conta e comprovante. Aceite: saldo do título corresponde aos pagamentos;
   reimportação não desfaz uma baixa.
4. **Fechar uma unidade/mês:** conferir compras, títulos, pagamentos e extrato com
   o fechamento escolhido. Aceite: toda diferença possui explicação ou pendência
   atribuída; aprovação do responsável. Não estabelecer tolerância financeira sem acordo.
5. **Manter vivo:** atualização diária, importações em fila, acompanhamento de
   falhas e atraso, segunda unidade e recebíveis. Aceite: falha pode ser retomada,
   atraso é visível e ninguém precisa recalcular o histórico ao abrir uma página.

## Verificação técnica

Checagem de tipos e 30 testes existentes passaram em 22/09/2026. Esses testes não
cobrem todo o ciclo operacional e não invalidam os achados acima. Dois problemas
do parser foram reproduzidos com entradas sintéticas, sem gravação no banco.
O diagnóstico não afirma perda financeira, dívida vencida real ou ausência fiscal
com base apenas em marcadores internos do sistema.
