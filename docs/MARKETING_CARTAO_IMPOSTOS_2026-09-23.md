# Marketing, cartão e impostos

Regra solicitada pelo usuário em 23/09/2026:
- Marketing: Influencers = descontos de receita_dias, por unidade e mês. Não adiciona nova despesa às outras bases nem desconta novamente da receita.
- Taxas Cartão: estimativa gerencial de 3% do total recebido da unidade/mês (receita_pagamentos vinculado aos dias originais). Aplica sobre todos os recebimentos, não apenas cartão; taxa calculada após agregar o mês e arredondada em centavos.
- Impostos: base gerencial será o recebido. ICMS, PIS e Cofins aguardam alíquotas/enquadramento informados pelo usuário/contador. Até lá, valores e total indisponíveis (—), não zero. Lucro real sozinho não informa o regime estadual, créditos ou segregações. Não alterado o desconto fixo de 10% do indicador CMV.

Agosto Restaurante validado: descontos R$ 50.905,66; recebido R$ 605.115,53; taxa de cartão R$ 18.153,47.

Fontes primárias consultadas: Receita Federal, PIS/Cofins não cumulativos e jurisprudência vinculante sobre exclusão do ICMS; SEFAZ-SP SIPET, serviço 302 (diferencia regimes especiais). Nenhuma alíquota foi presumida para uma unidade.

Validação: testes de agrupamento mensal, filtragem de pagamentos de dias fora do escopo, centavos, taxa mensal versus arredondamento por pagamento, ausência e zero; ESLint e TypeScript.

## Correção vigente: valores da planilha de gastos
A pedido do usuário, Impostos passa a usar os lançamentos cujo descritivo começa por IMPOSTO/IMPOSTOS em contas_pagar, sem estimativa de alíquotas. Despesas Financeiras usa exclusivamente CONTABILIDADE. Cada aba preserva a unidade, competência e descrição original. Status de quitação é separado do valor informado; marcas desconhecidas não são interpretadas como pago. Esta regra substitui a pendência de alíquotas acima.

Usuário confirmou explicitamente todas as mensalidades da contabilidade como pagas. Atualizados somente os 10 títulos CONTABILIDADE de junho/julho 2026 das duas unidades, anteriormente **, para liquidacao_origem 'OK - confirmado pelo usuário em 23/09/2026'. Não foram inventadas datas de liquidação. Backup antes da alteração: outputs/contabilidade-paga-20260923.json. Restaurante R$ 5.400 em junho e R$ 5.400 em julho; Delivery R$ 800 em cada mês. Nenhuma mensalidade de agosto encontrada; não é replicada automaticamente.

Menu e busca financeira: retirados Budget/Orçamento (mesma URL), Análise de Vendas e Relatório de Produtos. NF-e Entrada preservada, mesmo compartilhando URL com Relatório de Produtos. Dados e rotas históricas não apagados.
