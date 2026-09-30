# Correções e operação do financeiro — 22/09/2026

## O que foi alterado

- Dashboard/cockpit consultam indicadores prontos em paralelo, com prazo de 15 segundos por consulta paginada, sem recalcular o histórico durante a abertura. Erros e dados antigos ficam visíveis.
- Importação de títulos e de itens de planilha agora atualiza registros identificados e inclui os novos. Linhas ausentes não são apagadas. Campos vazios não apagam informação existente; zero informado continua sendo atualização.
- A identidade do título é preservada. Identidades ambíguas interrompem o lote inteiro com explicação, sem escolher um registro arbitrariamente. Valores já pagos e a unidade do pagamento são protegidos na reimportação.
- NF-e é roteada pelo CNPJ próprio cadastrado. A repetição de um fornecedor no ZIP não determina entrada/saída. O XML original e eventos aceitos de cancelamento passam a ser preservados nas novas importações. Reenviar a nota original não desfaz seu cancelamento.
- Catálogo é processado antes dos indicadores. O recálculo ocorre no final do pacote, não a cada bloco de 75 notas. Se um bloco posterior falhar, os anteriores permanecem gravados e o arquivo pode ser reenviado; ainda não há fila persistente em segundo plano.
- Conciliação usa a chave fiscal dos vínculos persistidos, filtra entradas não canceladas e somente obrigações de contas a pagar. Compras da planilha não são somadas como novas dívidas no fluxo de caixa.
- Removida a exclusão geral de alimentos/bebidas baseada apenas na existência de outra planilha no mês. O cruzamento exige fornecedor identificado, nota e valor. Compras e parcelas em meses distintos podem ser cruzadas quando há correspondência documental.
- Contas a pagar permite consultar competência ou vencimento. Meses futuros ficam disponíveis, e a abertura usa a última competência importada.
- Pagamento realizado registra conta, data, valor, comprovante/referência e usuário. Pagamentos parciais preservam saldo; estornos preservam histórico. Gravação e movimento de caixa ocorrem juntos. Repetir uma requisição não duplica a baixa. Não há execução de transferência bancária.
- `*`, `**`, `***` e textos desconhecidos significam **pagamento não confirmado**. `OK` continua sendo informação da planilha, sem criar comprovante ou movimento bancário fictício.
- Títulos potencialmente repetidos aparecem em Contas a Pagar e ficam bloqueados para novo pagamento até conferência. O cockpit sinaliza fechamento pendente quando há despesas sem correspondência documental.

## Resultado da conferência histórica

Reprocessados maio, junho, julho e agosto/2026 nas duas unidades. Isso atualiza cálculos; **não equivale a aprovar o fechamento**. Fontes originais, títulos e notas não foram apagados.

- 55 grupos com possível duplicidade no Yoshimori, envolvendo 110 linhas. O valor somado dessas linhas é R$ 83.054,04; não é valor confirmado de duplicidade ou prejuízo. Há marcações conflitantes no mesmo lote de origem, impossibilitando escolher automaticamente a versão correta.
- 1.044 títulos sem confirmação de pagamento: 552 Yoshimori e 492 IKY. Os asteriscos explicam 799 desses casos. Não são 1.044 dívidas confirmadas.
- Receita Yoshimori vai de 01/05 a 31/08. Receita IKY disponível vai de 01/06 a **19/08**: maio e o restante de agosto precisam ser conferidos na fonte.
- Não há contas bancárias, saldos iniciais, movimentos ou recebíveis de cartão cadastrados no levantamento. A posição bancária não pode ser fechada sem extratos e saldos.
- Folha disponível em junho–agosto; maio precisa ser conferido.
- `nf_pedidos` identifica a origem da planilha arquivada **NF PEDIDOS MAZA.xlsx**. A tela passa a chamá-la “Compras da planilha”. Não representa obrigação adicional às mesmas compras em contas a pagar.
- 240 NF-e têm diferença entre total do documento e soma do custo dos itens. Frete, descontos, impostos e natureza fiscal precisam ser conferidos; não foi inventado rateio para zerar diferenças.
- CNPJ de compras IKY existente e presente nos 421 XMLs: **63.092.631/0001-06**. O número informado na conversa foi **63.192.361/0001-06**. Cadastro preservado até confirmação. Os outros três CNPJs já correspondem ao cadastro.

## Rotina da funcionária

1. Selecionar a unidade e importar o arquivo mais recente de contas a pagar. Reenvio atualiza as linhas identificadas; o que não consta no arquivo permanece.
2. Se houver erro de identidade repetida, conferir nota, fornecedor, parcela e datas na planilha. Não contornar criando um registro manual duplicado. As duplicidades históricas precisam de definição documental antes da consolidação dos registros.
3. Importar XMLs de entrada e respectivos cancelamentos. Conferir CNPJs rejeitados e quantidade de XMLs inválidos exibida no resumo.
4. Conferir “Contas a pagar → Conciliação” e “Divergências”. Ausência de vínculo não comprova ausência do XML: pode haver divergência de identidade, valor ou data.
5. Cadastrar as contas bancárias e seus saldos na data-base, com dados do extrato. No título, registrar apenas pagamentos efetivamente realizados, com valor, data, conta e referência.
6. Antes de fechar agosto, conferir as 55 possíveis duplicidades, os pagamentos desconhecidos, receitas faltantes, folha e extratos. Manter divergências abertas até haver evidência.

## Validação e recuperação

Migração `financeiro_operacao_incremental` aplicada ao Supabase. Testes de aplicação, banco isolado, permissões, rollback, importação incremental, pagamento parcial, repetição de pagamento e estorno passaram. Compilação de produção aprovada. Existe aviso preexistente de empacotamento do worker PDF.js; não foi demonstrada falha nesse fluxo de folha.

Backup restrito local antes das alterações: `/private/tmp/maza-before-operacao-20260922.json`. Comparações por mês em `/private/tmp/maza-reprocessamento-previa-20260922.json` e `/private/tmp/maza-reprocessamento-aplicado-20260922.json`. Esses arquivos contêm dados internos e não devem ser publicados. O script `scripts/auditar-reprocessamento.mjs` é somente leitura por padrão; `--aplicar` recalcula os oito meses/unidades explicitamente listados.

A verificação de segurança também encontrou avisos preexistentes em módulos compartilhados, incluindo `profiles` com RLS desativado e views com privilégios do proprietário. Não foram alteradas permissões de módulos externos ao financeiro sem mapear seus consumidores. Referência: https://supabase.com/docs/guides/database/database-linter?lint=0007_policy_exists_rls_disabled . A tabela nova de pagamentos usa RLS; gravações diretas pelo navegador são proibidas e as funções verificam o usuário e a unidade.

## Limites ainda abertos

O sistema tem correções operacionais, mas o fechamento depende das evidências acima. Ainda não foram implementados: fila persistente para importação, conciliação automática de extratos/recebíveis, rateio fiscal completo, juros/descontos/renegociações no pagamento e saneamento automático das linhas contraditórias. Nenhum saldo bancário, pagamento, CNPJ divergente ou fechamento aprovado foi presumido.

## Publicação e verificação visual

Produção publicada em 22/09/2026: `dpl_4J6qkGcSAs2rfxpBpDcBJX1mZsKX`, alias `maza-financeiro.vercel.app`, consumido pelo shell `maza-maza.vercel.app`.
No navegador autenticado, Dashboard e Cockpit concluíram o carregamento. Agosto mostrou o aviso de fechamento pendente e os novos resultados. Contas a Pagar abriu com 110 linhas sinalizadas, filtros de competência/vencimento e pagamentos desconhecidos separados. O detalhe de um título mostrou o saldo e a necessidade de cadastrar conta bancária; nenhum pagamento de teste foi lançado em produção.
Consulta pós-reprocessamento confirmou preservação dos 2.874 títulos, 3.545 documentos fiscais e 18.112 itens, com zero pagamentos inventados. Os oito snapshots de maio–agosto estão na revisão atual.
