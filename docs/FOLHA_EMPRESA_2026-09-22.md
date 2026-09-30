# Folha Empresa

Nova aba em `/financeiro/dre/folha`, com pagamento, bonificação e total por nome, totais do período, busca e seleção de competência. Folha Domínio mantém o painel anterior. A nova fonte ainda não alimenta DRE/CMV: somá-la ao extrato atual duplicaria despesas sem uma regra de substituição aprovada.

Importação do XLSX ocorre no servidor autenticado. Reconhece blocos PAGAMENTO e BONIFICAÇÃO e separa ADIANTAMENTO; ignora linhas de subtotal. Une apenas nomes equivalentes em acentos, caixa e espaços. Abreviações ficam separadas, com aviso no painel. Dados privados não são incorporados ao bundle ou ao repositório.

O arquivo fica no bucket privado `folha-documentos`, prefixo da unidade e hash SHA-256. `folha_empresa` tem RLS por unidade. O RPC de importação usa SECURITY INVOKER e grava o lote atomicamente. A identidade é unidade + competência + etapa + nome normalizado. Valores preenchidos substituem os anteriores; zero é válido; vazios e registros ausentes preservam os anteriores. Corrigir grafia de um nome requer revisão de identidade para evitar novo registro.

A prévia permite escolher abas e corrigir competências. Duas versões para o mesmo mês/etapa são rejeitadas, evitando somar JUNHO e JUNHO 2. Leituras usam prazo de resposta e paginação, sem recalcular razão ou folha Domínio.

## Arquivo recebido e pendências para carga inicial

`FOLHA 2026.xlsx`, nove abas. Usuário confirmou Yoshimori Restaurante. Importadas MAIO, JULHO e AGOSTO (111 registros por nome/competência), com pagamento e bonificação, totais conferidos após a gravação. Usuário escolheu JUNHO 2: importados e conferidos mais 37 registros de junho (pagamento R$ 30.555,88; bonificação R$ 65.742,00; total R$ 96.297,88), totalizando 148 registros mensais no Yoshimori. Usuário definiu Vale em coluna própria, somando ao total. Vales de junho a agosto importados (94 registros). Usuário confirmou MAIO VALE em 2026: importados e conferidos 34 registros de adiantamento em 2026-05, mantendo o arquivo original com seu cabeçalho. Vale de maio R$ 69.179,30; total do mês R$ 160.890,95. Carga das oito abas escolhidas concluída exclusivamente no Yoshimori (276 registros por nome/etapa/competência). Nenhum registro importado no IKY.

| Aba | Pagamento | Bonificação | Total |
| --- | ---: | ---: | ---: |
| MAIO | 35.510,27 | 56.201,38 | 91.711,65 |
| MAIO VALE (cabeçalho 2025) | 16.257,07 | 52.922,23 | 69.179,30 |
| JUNHO | 31.899,50 | 65.043,71 | 96.943,21 |
| JUNHO 2 | 30.555,88 | 65.742,00 | 96.297,88 |
| JUNHO VALE | 17.998,19 | 53.582,18 | 71.580,37 |
| JULHO | 27.677,40 | 63.103,06 | 90.780,46 |
| JULHO VALE | 16.215,11 | 50.557,38 | 66.772,49 |
| AGOSTO | 26.023,45 | 60.548,73 | 86.572,18 |
| AGOSTO VALE | 19.538,12 | 51.652,88 | 71.191,00 |

Totais conferidos pela soma dos detalhes, não pelas células de subtotal. Nomes e valores individuais não estão neste documento.

## Validação

- 39 testes de aplicação passaram, incluindo parse, subtotal, centavos, zero/vazio, versões e nomes ambíguos.
- PostgreSQL 16 isolado: migração, RLS, atualização incremental, preservação de vazios/ausentes, zero explícito e rollback de lote com unidade não autorizada.
- TypeScript, ESLint e build de produção passaram. Aviso preexistente de externalização do worker PDF.js permanece no módulo Domínio.
- Migração `20260922164143_folha_empresa.sql` aplicada no projeto Maza. Advisors sem ocorrência referente à nova tabela.
- Publicado em `maza-financeiro.vercel.app`, deployment `dpl_4rAbakFoMqJyRjGZudqdnzHMKg3H`. Navegador autenticado confirmou as duas abas, o carregamento do painel Domínio e o estado vazio correto da Folha Empresa.
- A extensão Chrome bloqueou `fileChooser.setFiles` (acesso a arquivos locais não permitido). O teste da prévia pelo navegador não foi concluído. A carga inicial autorizada foi executada pelo RPC e conferida no banco.
- A carga identificou restrição preexistente de MIME no bucket de folha (apenas PDF). Migração `20260922171323_folha_empresa_xlsx_storage.sql` adicionou XLSX mantendo PDFs, privacidade e limite existentes. Arquivo original arquivado no bucket privado com hash; backup anterior vazio em `/tmp/folha-yoshimori-antes-20260922.json`.

## Coluna Vale

Painel consolidado por mês e nome normalizado: Pagamento + Bonificação + Vale = Total. Vale soma os dois blocos das abas de adiantamento, contados uma única vez. Nomes só presentes no vale também entram; grafias diferentes permanecem separadas para conferência. O painel sinaliza quando não há vale importado.

Totais conferidos no banco: junho R$ 167.878,25 (vale R$ 71.580,37); julho R$ 157.552,95 (vale R$ 66.772,49); agosto R$ 157.763,18 (vale R$ 71.191,00). IKY sem registros desta planilha. 40 testes de aplicação, type-check e lint passaram.

## Regra atualizada em 23/09/2026
Por orientação do usuário, Vale é adiantamento salarial. Total da Folha Empresa = pagamento + bonificação − vale. A regra se aplica às linhas, total da busca, cards e componente da folha no card Despesa do cockpit. A consulta do cockpit agora inclui etapa para subtrair os registros de adiantamento. Dados de origem preservados; nenhuma reimportação necessária.
Agosto/2026, Restaurante: 26.023,45 + 60.548,73 − 71.191,00 = 15.381,18. Esse total representa o saldo após o adiantamento.
Folha Empresa e Folha Domínio passaram a usar tokens de cores do site em abas, cards, tabelas e modais. Sete testes passaram, incluindo ausência de vale, vale zero, centavos, saldo negativo e isolamento por unidade/competência.

## Layout compartilhado e comparação mensal
ResumoFolha padroniza cinco cards nas duas abas. Empresa usa os valores da planilha: total após vale, headcount dos nomes da folha mensal, valor por pessoa, bonificação total e por beneficiado. Bonificação não é renomeada para gorjeta sem confirmação da origem. Pagamento e Vale continuam na tabela e nos subtítulos.
Divisão por área foi removida. ComparacaoFolha mostra duas barras, valores e variação: mês selecionado contra o mês imediatamente anterior. Empresa consulta a competência anterior pela API existente, isolada por unidade; Domínio usa o histórico de gorjeta disponível, sem usar a substituição pelo último mês com dados. Ausência e denominador zero são explicitados. Testes cobrem virada de ano, ausência, valor zero e variação.


## Regra vigente — correção do usuário em 23/09/2026
Total Folha Empresa = pagamento + bonificação da etapa mensal. Vale continua visível separadamente, sem somar nem descontar. Esta regra substitui as fórmulas anteriores documentadas acima. Administrativo usa exclusivamente pagamento + bonificação mensal da Cintia. Operação e Despesa do cockpit usam o mesmo total atualizado da Folha Empresa. Em agosto/2026 Restaurante: Folha Empresa R$ 86.572,18; Cintia R$ 6.026,41. Nove testes passaram (folha, despesa e regras operacionais).
