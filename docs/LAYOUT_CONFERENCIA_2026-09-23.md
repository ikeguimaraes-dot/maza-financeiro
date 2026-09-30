# Layout e Conferência — 23/09/2026

- Contratos usa os tokens globais de fundo, superfícies, texto, marca e estados; acompanha tema claro e escuro. Seletores corrigidos para Restaurante e Delivery com os UUIDs atuais.
- Nomes de exibição centralizados em unit-display.ts e aplicados ao contexto, cabeçalhos, importação de NF-e, listagens de títulos e unidades da DRE. Cadastro fiscal e reconhecimento de nomes nas planilhas preservados.
- Contas a Receber movido para imediatamente antes de Receita no menu, inclusive quando a origem está em outro nível. Sem duplicação; se Receita não estiver disponível, mantém posição original. Interpretação de posição comunicada ao usuário; cálculos não alterados.
- Conferência: deduplicação por requisição de KPI, existência de lançamentos, custo/deduções/receita e cruzamento NF/títulos. Sem cache entre usuários ou requisições. Busca histórica de anomalias não executa sem equivalências cadastradas. Autenticação/contexto em paralelo, carregamento progressivo da página e painel.
- Verificações: TypeScript, ESLint dos arquivos alterados, dois testes de navegação, build de produção. Inspeção visual de Contratos e menu em produção.
