# Abas operacionais e NF-e saída — 23/09/2026

- NF-e saída agora consulta documentos, sem serializar os 12.534 itens históricos para o navegador. Exibe 50 notas por página, busca por número/emitente/destinatário, total fiscal e quantidade integrais dos resultados, detalhes sob demanda e importação ZIP. Datas históricas e valores são paginados; não há limite silencioso de 1.000 registros. Usa cliente autenticado e unidade atual.
- Ocupação: categoria ALUGUEL de contas_pagar da unidade, por d_competencia (fallback ref_mes, lançamento, vencimento).
- Utilidades: energia elétrica, água/esgoto, telefone/internet. Correspondência por descrições normalizadas, sem confundir água de revenda/limpeza.
- Administrativo: apenas CINTIA OLIVEIRA DE CARVALHO, mesma unidade e competência, Folha Empresa mensal (pagamento + bonificação) menos adiantamento. Agosto Restaurante: R$ 3.176,45.
- Manutenção: zerada por definição, sem apagar registros originais.
- Operação: visão por fonte de receitas, recebido, compras XML e todas as despesas de contas_pagar + Folha Empresa. Não soma compras com títulos que podem representar as mesmas compras; não apresenta lucro enquanto faltar conciliação. Cintia já incluída na folha e não adicionada novamente.
- Corrigido filtro legado por empresa/ref_mes vazio para unit_id/d_competencia nas quatro abas solicitadas. Outras rotas legadas permanecem fora desta mudança.

## Correção ENEL autorizada
Usuário confirmou explicitamente que ENERGIA e CONSUMO DE ENERGIA, R$ 8.494,18, 31/08/2026, Restaurante, eram a mesma conta.
Backup em outputs/enel-duplicidade-20260923.json (fora do deploy). Excluído somente 3fa99ebb-b40a-406c-ab39-28094c97fed4, sem pagamentos ou overrides vinculados. Preservado 4eb4b6dc-542a-4060-a28e-37c30cfd8531, com liquidacao_origem OK. Exclusão condicionada à identidade/valor e existência do preservado. Nenhuma baixa financeira criada.

Agosto Restaurante esperado após correção: aluguel 43.217,64; energia 8.494,18; água 6.167,82; internet 667,12; utilidades 15.329,12; Cintia 3.176,45.

Validação: testes de classificação sem falsos positivos, soma por categoria, manutenção zero, folha individual com vale descontado, ESLint e TypeScript.

Conferência em produção: Ocupação, Utilidades, Administrativo e Manutenção exibiram os valores esperados de agosto. Operação exibiu receita bruta R$ 656.021,19, recebido R$ 605.115,53, compras XML R$ 119.984,55 e contas + folha R$ 357.003,93. NF-e saída: junho 696 documentos / R$ 552.290,08; página 2 funcional; nota 15587 abriu itens e busca retornou 1 nota / R$ 897,22. Datas fiscais mostram também 10 documentos em julho, que anteriormente estavam no lote de itens de junho.


## Regra vigente — correção do usuário em 23/09/2026
Total Folha Empresa = pagamento + bonificação da etapa mensal. Vale continua visível separadamente, sem somar nem descontar. Esta regra substitui as fórmulas anteriores documentadas acima. Administrativo usa exclusivamente pagamento + bonificação mensal da Cintia. Operação e Despesa do cockpit usam o mesmo total atualizado da Folha Empresa. Em agosto/2026 Restaurante: Folha Empresa R$ 86.572,18; Cintia R$ 6.026,41. Nove testes passaram (folha, despesa e regras operacionais).
