# Card Despesa

Regra solicitada: Folha Empresa (pagamento + bonificação + vale) + valor total dos títulos de Contas a Pagar. Inclui títulos pagos e em aberto; não usa saldo pendente. Compras de `nf_pedidos` não entram. Filtro por unidade e competência, com a mesma precedência de datas da tela Contas a Pagar: competência, lançamento, vencimento.

Consultas autenticadas sob RLS, paginadas e com prazo de 15 segundos. Duas leituras adicionais em paralelo, limitadas ao mês selecionado, sem recálculo de razão. O consolidado soma as unidades e sinaliza fontes ausentes; não substitui Folha Empresa por Domínio. O card mostra os componentes para conferência. DRE e outros KPIs mantêm suas fontes.

Conferência de agosto/2026, Yoshimori: folha R$ 157.763,18 + contas R$ 350.116,93 = despesa R$ 507.880,11. O valor reproduz os títulos cadastrados, inclusive possíveis duplicidades já sinalizadas no cockpit; não representa fechamento conciliado.

Validação: TypeScript, ESLint e 42 testes passaram, incluindo soma de folha/vale, competência com fallback, exclusão de NF pedidos, isolamento de unidades e sinalização de fonte ausente no consolidado. Consulta real de agosto conferida.


## Regra vigente — correção do usuário em 23/09/2026
Total Folha Empresa = pagamento + bonificação da etapa mensal. Vale continua visível separadamente, sem somar nem descontar. Esta regra substitui as fórmulas anteriores documentadas acima. Administrativo usa exclusivamente pagamento + bonificação mensal da Cintia. Operação e Despesa do cockpit usam o mesmo total atualizado da Folha Empresa. Em agosto/2026 Restaurante: Folha Empresa R$ 86.572,18; Cintia R$ 6.026,41. Nove testes passaram (folha, despesa e regras operacionais).
