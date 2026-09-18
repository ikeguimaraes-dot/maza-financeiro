# Correções e validação — 17/09/2026

As alterações foram feitas neste repositório. A migration foi aplicada ao banco de produção em 17/09/2026, após autorização do usuário. Os registros financeiros existentes foram preservados. A clonagem e a preparação para white-label ficam para uma etapa posterior.

## Comportamento corrigido

- **Sessão e acesso:** proxy valida o usuário no Supabase; APIs sem sessão retornam 401. Clientes usados pelas requisições utilizam o JWT do usuário, com políticas por unidade. Sócio de leitura não pode gravar. Cookies seguem o host do shell e permitem limpeza no logout. Views financeiras respeitam as políticas das tabelas.
- **Imports:** substituição por fonte e escopo informado, em transação. Se a gravação falha, a versão anterior permanece. Não se apagam meses que não constam do arquivo. Arquivos vazios ou inválidos não provocam exclusão automática. Arquivos originais de auditoria podem continuar armazenados.
- **Compras direcionadas:** a unidade de origem do import fica registrada. Reimportar Yoshimori pode remover itens antes direcionados a IKY sem apagar a carga independente de IKY. O importador Maza usa as origens reconhecidas pelos cálculos.
- **NF-e:** notas existentes recebem correções; itens removidos e cancelamentos são refletidos. A identidade considera a chave fiscal e a posição do item, permitindo códigos repetidos na mesma nota e números iguais entre fornecedores. Planilhas de produtos substituem seu período sem apagar os XMLs.
- **Receita, folha e protestos:** reposição transacional dos respectivos registros e detalhes. Seções de PDF malformadas são rejeitadas. Reimportar uma certidão remove registros que deixaram de constar nela.
- **Razão e indicadores:** regeneração substitui toda a origem/unidade/mês, inclusive quando a fonte ou uma dedução desaparece. Razão e snapshots são publicados juntos, somente se todas as fontes forem calculadas. Uma revisão impede publicar cálculos sobre fontes alteradas durante o processamento. Imports acionam recálculo; indicadores desatualizados são identificados e não exibidos silenciosamente como atuais.
- **Competência:** prioridade para competência explícita, depois lançamento e vencimento. Razão, contas a pagar e divergências usam a mesma função. Não se escolhe a competência por um número de nota sem identidade de fornecedor.
- **Caixa:** saldo considera a data-base de cada conta e os movimentos anteriores à janela. Filtro por conta não atribui previsões sem conta bancária definida. Título pago sem vencimento continua pago. Campo vazio não confirma pagamento. Saldo de hoje fora do intervalo aparece como indisponível.
- **Telas:** carregamentos por unidade descartam respostas antigas; fontes tipográficas locais eliminam a necessidade de baixar Google Fonts durante o build. Removidos erros de lint e código sem uso.

## Aplicação da mudança

A migration `supabase/migrations/20260917235835_financeiro_integridade_acesso.sql` **já foi aplicada** ao projeto `dncqjezvndoxeqpklefy` pelo MCP do Supabase, com versão registrada `20260917235835`. Ela adiciona a função transacional, revisões, identidades de importação e políticas de acesso. O código depende desses objetos.

O banco consultado para conferir o schema foi o projeto `dncqjezvndoxeqpklefy`. Na auditoria inicial, as consultas foram somente leitura; a aplicação foi autorizada depois. Comentários antigos do repositório mencionavam outro projeto. Conferir o destino do Supabase CLI antes de aplicar qualquer migration. Não executar `db reset` em produção.

Após a migration, o primeiro acesso com permissão de edição pode recalcular o histórico; esse acesso será mais lento. Depois, somente revisões pendentes são recalculadas. Caso uma fonte seja salva e o recálculo falhe, a mensagem distingue essa situação de um rollback do import. Reabrir o cockpit com permissão de edição tenta novamente.

Dados legados não registravam a unidade que enviou uma compra posteriormente direcionada. A migration atribui a unidade atual como origem inicial. Não é possível reconstruir com segurança a procedência antiga sem os arquivos originais. Antes de substituir cargas históricas cruzadas, conferir os respectivos arquivos. Nenhum valor foi corrigido por suposição.

## Verificação

- `npm run test:ui`: **24 testes passaram**, cobrindo apresentação, sessão, substituição, falha transacional, escopo entre unidades, competência, caixa e publicação dos indicadores.
- `npm run type-check`: passou. `npm run lint`: passou, sem erros ou avisos.
- `npm run build`: passou; compilação de produção com fontes locais. O ambiente de execução pode precisar permitir o subprocesso/porta local usado pelo Turbopack.
- `npm run test:db`: passou; requer Docker. Sobe PostgreSQL 16 sem publicar portas, carrega um fixture **sem dados reais**, aplica a migration e testa rollback, substituição, revisão concorrente, isolamento, leitura sem escrita e identidade de itens fiscais. O container é removido ao finalizar.

Teste HTTP do build local: contratos e receita retornaram **401** tanto sem sessão quanto com cookie inválido; a página financeira redirecionou ao login. Servidor temporário e containers de teste foram encerrados.

O fixture reproduz as colunas e índices relevantes, com usuários de teste e stubs de autenticação. Não substitui um teste de aceitação conectado ao shell e ao banco de homologação com seus demais triggers, políticas e arquivos reais. Nenhum import real foi executado no ambiente publicado.

O build ainda pode emitir avisos do runtime Node e da externalização do worker PDF.js. A compilação não depende desses avisos; a leitura de PDFs reais deve fazer parte da aceitação em homologação.

## Decisões de negócio preservadas

Prazos estimados de recebimento, data estimada de pagamento da folha, critérios de classificação, percentuais de confiança e cálculo de CMV por compras continuam seguindo as regras existentes. A saúde das fontes ainda é agregada entre as unidades às quais o usuário tem acesso. Definir consumo de estoque, taxas/antecipações e fechamento oficial exige as informações que ainda serão recebidas.

Módulos identificados como “em construção” continuam assim; esta etapa não implementa novas funcionalidades nem transforma os fluxos legados por marca no cockpit atual. White-label e novas regras são etapas separadas.

## Validação após aplicação em produção

- Migration registrada no histórico remoto. O arquivo local foi alinhado à versão atribuída pelo Supabase.
- Na aplicação da migration, contagens preservadas: 2.874 títulos, 18.112 itens de produtos, 288 dias de receita, 6.119 lançamentos e 8 snapshots.
- Nenhum título das origens canônicas ficou sem unidade de importação; nenhum item XML ficou sem posição.
- RPC executa como invoker e não permite execução anônima.
- Verificação transacional com perfil founder leu as fontes e executou lote vazio. Identidade sem vínculo não leu receitas nem conseguiu substituir dados de outra unidade. As verificações terminaram em rollback.
- Há divergências históricas entre migrations locais e remotas, anteriores a esta revisão; por isso não foi utilizado um push geral ou reparo destrutivo do histórico.
- Aplicativo publicado e promovido na Vercel em 17/09/2026 (horário de Brasília), deployment `dpl_6QFjKR3cQXbWuwwe6FSVbAaZN9Pp`, código `9fd24b1`.
- Histórico recalculado com o código corrigido: 12 períodos/unidades, 6.420 lançamentos e 12 snapshots. Nenhum snapshot ficou com revisão divergente da fonte. Títulos, produtos e dias de receita mantiveram as contagens anteriores.
- Backup dos dados derivados anterior ao recálculo salvo localmente em `/private/tmp/maza-derived-before-release.json`, com acesso restrito; não integra o repositório.
- Existe competência de maio/2022 nas fontes de Yoshimori. A data foi preservada; sua confirmação depende dos documentos de origem.
- Build da Vercel concluído. API publicada sem autenticação retorna 401; página financeira redireciona ao login correto em `maza-maza.vercel.app`. A navegação pelo shell também chegou ao login. A sessão disponível não permitiu concluir a aceitação das telas autenticadas; nenhum import real foi usado como teste de produção.
- Testes de interface (24), lint e verificação de tipos executados novamente antes da publicação.

## Correção da configuração de autenticação após publicação

A investigação do HTTP 401 na folha inicialmente interpretou valores ocultos pela Vercel como variáveis vazias. Essa hipótese foi descartada: variáveis sensíveis são omitidas nas consultas. Os valores foram sincronizados com a configuração local do mesmo projeto, sem registrar credenciais no Git. A verificação anterior de redirecionamento ao login não comprovava uma sessão funcional.

O build agora rejeita configuração Supabase ausente ou vazia em produção na Vercel. Um teste de regressão confirma a rejeição e a aceitação de configuração preenchida. Nenhuma proteção de autenticação ou RLS foi removida.

Causa confirmada do 401: o menu financeiro usava `next/link` para `/auth/sign-out`, uma rota GET com efeito de logout. Os logs do shell registraram essa chamada automática imediatamente antes das falhas nas APIs, e a sessão foi revogada no Auth. O link foi substituído por uma âncora HTML, sem prefetch. Diagnósticos temporários de cookies foram removidos.
