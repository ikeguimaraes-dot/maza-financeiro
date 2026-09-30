"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { contasParaPagamento, registrarPagamento, estornarPagamento } from "@/app/financeiro/pagar/pagamentos-actions";
import type { TituloPagar } from "@/lib/financeiro/pagar/calcularPagar";
import { hojeSaoPaulo } from "@/lib/financeiro/dates";
import { formatBRL } from "@/lib/financeiro/utils";

export function PagamentosTitulo({ titulo }: { titulo: TituloPagar }) {
  const router = useRouter();
  const [contas, setContas] = useState<Array<{ id: string; apelido: string; banco: string }>>([]);
  const [erro, setErro] = useState(""); const [busy, setBusy] = useState(false); const [done, setDone] = useState(false);
  const [pedido] = useState(() => crypto.randomUUID());
  useEffect(() => { let active = true; contasParaPagamento(titulo.unitId).then(data => { if (active) setContas(data); }, error => { if (active) setErro(error.message); }); return () => { active = false; }; }, [titulo.unitId]);
  if (titulo.origem !== "contas_pagar") return <p>Esta linha registra uma compra da planilha. O pagamento deve ser registrado no título de contas a pagar correspondente.</p>;
  if (titulo.duplicidade) return <p role="alert">Há mais de um registro para esta nota, fornecedor e vencimento. Confira as linhas da planilha antes de registrar o pagamento. Os totais podem conter duplicidade.</p>;
  return <section style={{ marginTop: 20 }}><h3>Pagamentos</h3><p>Saldo do título: <strong>{formatBRL(titulo.saldo)}</strong></p>
    {!titulo.pagamentos.length && titulo.situacao === "pago" && <p>Quitação informada pela planilha. Não há comprovante bancário registrado.</p>}
    {titulo.pagamentos.map(p => <div key={p.id} style={{ margin: "12px 0" }}>{p.data} · {formatBRL(Number(p.valor))} · {p.comprovante} {p.estornado_em ? " · Estornado" : <button type="button" disabled={busy || done} onClick={async () => { if (!window.confirm("Estornar este registro de pagamento? O histórico será preservado.")) return; setBusy(true); try { await estornarPagamento(p.id); setDone(true); router.refresh(); } catch (e) { setErro(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); } }}>Estornar registro</button>}</div>)}
    {!contas.length && <p>Cadastre a conta e o saldo de abertura em <Link href="/financeiro/fluxo">Fluxo de caixa</Link> para registrar pagamentos.</p>}
    {contas.length > 0 && titulo.saldo > 0 && !done && <form onSubmit={async event => { event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setErro(""); try { await registrarPagamento({ titulo: titulo.id, conta: String(form.get("conta")), data: String(form.get("data")), valor: Number(form.get("valor")), comprovante: String(form.get("comprovante")), pedido }); setDone(true); router.refresh(); } catch (e) { setErro(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); } }} style={{ display: "grid", gap: 12 }}>
      <label>Conta bancária <select name="conta" required>{contas.map(c => <option value={c.id} key={c.id}>{c.apelido || c.banco}</option>)}</select></label>
      <label>Data do pagamento <input name="data" type="date" required defaultValue={hojeSaoPaulo()} max={hojeSaoPaulo()} /></label>
      <label>Valor pago <input name="valor" type="number" min="0.01" step="0.01" max={titulo.saldo} defaultValue={titulo.saldo} required /></label>
      <label>Referência do comprovante <input name="comprovante" required placeholder="Identificador da transação ou do comprovante" /></label>
      <button className="maza-button maza-button-primary" disabled={busy}>{busy ? "Registrando…" : "Registrar pagamento realizado"}</button>
      <small>Este registro não faz transferência bancária. Juros, descontos ou renegociações precisam ser conferidos antes de alterar o título.</small>
    </form>}
    {done && <p role="status">Registro salvo. Feche e abra o título para consultar o saldo atualizado.</p>}
    {erro && <p role="alert">{erro}</p>}
  </section>;
}
