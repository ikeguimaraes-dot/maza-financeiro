"use server";
import { createFinanceiroClient } from "@/lib/financeiro/db/client";
import { revalidatePath } from "next/cache";

export async function contasParaPagamento(unitId: string) {
  const db = await createFinanceiroClient();
  const { data, error } = await db.from("contas_bancarias").select("id,apelido,banco").eq("unit_id", unitId).eq("ativo", true);
  if (error) throw new Error(error.message);
  return data as Array<{ id: string; apelido: string; banco: string }>;
}
export async function registrarPagamento(input: { titulo: string; conta: string; data: string; valor: number; comprovante: string; pedido: string }) {
  const db = await createFinanceiroClient();
  const { error } = await db.rpc("financeiro_registrar_pagamento", { p_titulo: input.titulo, p_conta: input.conta, p_data: input.data, p_valor: input.valor, p_comprovante: input.comprovante, p_pedido: input.pedido });
  if (error) throw new Error(error.message);
  revalidatePath("/financeiro/pagar"); revalidatePath("/financeiro/fluxo");
}
export async function estornarPagamento(id: string) {
  const db = await createFinanceiroClient();
  const { error } = await db.rpc("financeiro_estornar_pagamento", { p_pagamento: id });
  if (error) throw new Error(error.message);
  revalidatePath("/financeiro/pagar"); revalidatePath("/financeiro/fluxo");
}
