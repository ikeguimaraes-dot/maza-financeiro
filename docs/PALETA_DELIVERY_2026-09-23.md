# Paleta por unidade

Delivery (UUID terminado em 909b) usa paleta inspirada na foto da embalagem: laranja vivo #FF702F, azul-marinho #182D45 e papel claro #FFF8F2. Botões/textos sobre fundo claro usam laranja escurecido #B83E10 para legibilidade. Seleção no menu usa #FF9458. Restaurante conserva os tokens anteriores.

AuthProvider sincroniza `data-unit-theme` no elemento raiz com a unidade resolvida. Seleção de dados, cookies, autenticação e regras financeiras permanecem iguais. O tema é aplicado após hidratação do contexto; não foi adicionada consulta no servidor para obter cores. Atributo atualizado ao trocar de unidade ou restaurar a seleção.

Tokens incluem superfícies, textos, bordas, botões, gráficos e sidebar, além dos cards de destaque do cockpit e MISE. Modos claro e escuro tratados separadamente. Cores semânticas de sucesso/erro/alerta preservadas.

Alterações compartilhadas com maza-mise-visao-facelift. TypeScript e ESLint aprovados.

## Revisão solicitada pelo usuário

Sidebar do Delivery invertido: superfície laranja vivo #FF701F, textos/ícones e logo azul-marinho #152C46; item selecionado em azul-marinho com texto claro. Aplicado nos modos expandido e compacto, claro e escuro. Restaurante inalterado.
