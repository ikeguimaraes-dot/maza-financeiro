/** Nome de exibição; não altera razões sociais ou regras de importação. */
export function unitDisplayName(unit: { id: string; name: string }): string {
  if (unit.id === "674eac8c-5a38-4a42-aa60-0a666387909c") return "Restaurante";
  if (unit.id === "674eac8c-5a38-4a42-aa60-0a666387909b") return "Delivery";
  return unit.name;
}
