import type { RemoteNavGroup, RemoteNavItem } from './types'
/** Oculta atalhos descontinuados sem remover NF-e Entrada, que compartilha URL
 * com o antigo Relatório de Produtos. */
export function visibleFinanceiroGroups(groups: RemoteNavGroup[]): RemoteNavGroup[] {
  function items(rows: RemoteNavItem[]): RemoteNavItem[] {
    return rows.filter(r => !['Budget', 'Análise de Vendas', 'Relatório de Produtos'].includes(r.label)
      && r.href !== '/financeiro/orcamento' && r.href !== '/financeiro/dre/receita/analise-vendas')
      .map(r => ({...r, children:r.children ? items(r.children) : undefined}))
  }
  const result = groups.map(g=>({...g,items:items(g.items)}));
  let receber: RemoteNavItem | undefined;
  function remove(rows: RemoteNavItem[]): RemoteNavItem[] {
    return rows.filter(row => {
      if (row.href === '/financeiro/receber') { receber ??= row; return false; }
      return true;
    }).map(row => ({ ...row, children: row.children ? remove(row.children) : undefined }));
  }
  const reordered = result.map(g => ({ ...g, items: remove(g.items) }));
  let inserted = false;
  function insert(rows: RemoteNavItem[]): RemoteNavItem[] {
    return rows.flatMap(row => {
      const next = { ...row, children: row.children ? insert(row.children) : undefined };
      if (!inserted && receber && row.href === '/financeiro/dre/receita') {
        inserted = true;
        return [receber, next];
      }
      return [next];
    });
  }
  const positioned = reordered.map(g => ({ ...g, items: insert(g.items) }));
  let navigation = (inserted ? positioned : result).map(group => {
    if (group.id !== 'financeiro') return group;
    const contratos = group.items.filter(item => item.href === '/financeiro/contratos');
    return { ...group, items: [...group.items.filter(item => item.href !== '/financeiro/contratos'), ...contratos] };
  });
  const mise = navigation.find(group => group.id === 'mise');
  if (mise && mise.habilitado !== false) {
    const miseItem: RemoteNavItem = {
      label: mise.label ?? 'MISE', icon: mise.icon ?? 'ChefHat',
      defaultOpen: mise.defaultOpen, children: mise.items,
    };
    const operacao = navigation.find(group => group.id === 'operacao');
    navigation = navigation.filter(group => group.id !== 'mise');
    if (operacao) {
      navigation = navigation.map(group => group.id !== 'operacao' ? group : {
        ...group, habilitado: true,
        // O agrupador pode abrir para MISE sem liberar atalhos de módulos desabilitados.
        items: [...(group.habilitado === false ? [] : group.items), miseItem],
      });
    } else {
      navigation.push({ id: 'operacao', label: 'Operação', icon: 'TrendingUp',
        defaultOpen: false, habilitado: true, items: [miseItem] });
    }
  }
  return navigation;
}
