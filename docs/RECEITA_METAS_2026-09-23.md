# Metas semanais em Receita

## Apresentação por período

A tela segue a referência enviada em 23/09: cartão escuro de performance, tabela com período/meta diária/quantidade/meta do período/realizado/projeção/atingimento, totais e Salvar no Banco. O realizado reaproveita os grupos diários da Receita já deduplicados por workday original. Meta acumulada considera datas até hoje no fuso America/Sao_Paulo. Projeção soma o realizado até hoje às metas de datas futuras do mês; em meses passados equivale ao realizado. Dias com exceções usam o valor específico. Não se apresentam realizado e projeção como zero quando não há receita carregada. O atingimento numérico pode superar 100%; apenas a barra é limitada a 100%.

A aba Metas permite cadastrar os sete valores de faturamento bruto por unidade. Segunda a domingo se repetem em todos os meses. Zero é permitido; campo vazio não é convertido em zero. O cadastro não possui vigência: alterações mudam o padrão usado também na consulta de meses anteriores. Exceções por data têm prioridade.

As tabelas existentes metas_dia_semana e metas_dia_override estavam com RLS ativo e sem políticas. A migração adiciona políticas com financeiro_can_read/write, remove privilégios de anon e privilégios administrativos de authenticated, preservando os dados. O endpoint semanal usa o JWT do usuário e salva os sete dias em um único upsert atômico. Não há chave privilegiada no fluxo.

Na página Receita, metas diárias e gráfico usam o padrão existente; o total mensal passa a somar cada data do calendário com a exceção correspondente. Sem os sete dias cadastrados, mantém a meta mensal legada. Não altera metas do Cockpit ou orçamento da DRE.

Validação: lint e TypeScript; testes de dias únicos, vazio, zero, negativos, centavos, número de segundas no mês, exceção zero e fevereiro bissexto. No banco, insert/upsert/read como authenticated com fundador e bloqueio de leitura/escrita para usuário sem associação, dentro de transação com rollback. Nenhum valor de meta de produção foi criado pelo teste.

Advisors executados: as tabelas de metas agora têm políticas. O projeto ainda possui apontamentos anteriores fora deste escopo, incluindo RLS desabilitado em profiles; esta alteração não modifica profiles.

### Totais durante o preenchimento
- A tabela e o painel mostram totais parciais com os dias válidos já preenchidos, sem exigir sete dias para a prévia. O salvamento continua exigindo os sete dias (zero explícito permitido).
- Atingimento agregado = realizado total / meta total; a tela sinaliza quando a meta é parcial.
- Sem metas, a tela pede o preenchimento, sem inventar valores. Em mês encerrado, a projeção equivale ao realizado mesmo sem metas.
- Cores usam os tokens globais do site. Testes de totais parciais, domingo zero e mês encerrado incluídos.
