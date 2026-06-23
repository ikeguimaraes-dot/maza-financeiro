# MANUAL.md — KPH OS · Módulo Financeiro (DRE Gerencial)

Contexto completo do projeto para orientar todas as sessões de desenvolvimento.
Leia este arquivo inteiro antes de escrever qualquer código.

---

## 1. O QUE É ESTE PROJETO

Sistema operacional de hospitalidade chamado **KPH OS**, desenvolvido para gestão de restaurantes do grupo KPH Participações. O módulo ativo neste repositório é o **Financeiro**, com foco no submenu **DRE Gerencial** — um dashboard de Orçado vs Realizado (2026).

**⭐ ATUALIZAÇÃO IMPORTANTE (jun/2026): o sistema agora é MULTI-UNIDADE.**
Deixou de ser exclusivo do Meet & Eat. Cada unidade (restaurante) tem seus próprios dados, isolados por `unit_id`. A importação é feita pela interface (modal de import), não mais por SQL manual.

O projeto é separado do dashboard operacional principal (`meetandeat-dashboard`), que roda em outro repositório com Supabase próprio.

---

## 2. TECH STACK

| Camada | Tecnologia | Versão |
|---|---|---|
| Framework | Next.js App Router | 16.2.4 (Turbopack) |
| UI | React + TypeScript | — |
| Estilo | Tailwind CSS + CSS vars (dark theme) | — |
| Gráficos | Recharts | — |
| Banco | Supabase (PostgreSQL) | @supabase/supabase-js |
| Auth | Supabase Auth (usuário: bypass@kph.os, role: founder) | — |
| Deploy | Vercel (auto-deploy via push para main) | — |

**Arquitetura:** Frontend Next.js conecta diretamente ao Supabase via cliente JS. Não há backend intermediário nem route handlers `/api`. Componentes de gráfico são Client Components separados; o restante é Server Component.

**Repo ativo:** `kph-os-financeiro` — GitHub `ikeguimaraes-dot/kph-os-financeiro`
**Deploy:** Vercel auto-deploy via push para `main`. URLs de produção: `kph-os.vercel.app` e `kph-os-financeiro.vercel.app`.

**⚠️ FLUXO DE TRABALHO:** o código é editado via Claude Code e versionado no GitHub. Mudanças só chegam à produção via `git push` → deploy automático na Vercel. Se um fix "não aparece" no browser, **primeiro confirmar que o commit foi pushed e o deploy subiu** (erro comum: commits presos localmente sem push).

---

## 3. ESTRUTURA DE PASTAS

```
kph-os-financeiro/
├── src/
│   ├── app/
│   │   └── financeiro/
│   │       └── dre/
│   │           └── page.tsx              # Server component principal da DRE
│   └── components/
│       └── financeiro/
│           └── dre/
│               ├── DreTabNav.tsx         # Navegação horizontal das 8 sub-abas
│               ├── DreImportModal.tsx    # ⭐ Modal de import Excel + TODOS os parsers
│               ├── DreDrillTable.tsx     # Tabela DRE com drill-down por grupo
│               ├── IndicadoresTab.tsx    # Heatmap de indicadores % BD vs RE
│               ├── ReceitaTab.tsx        # Receita por forma de pagamento
│               ├── DespesasTab.tsx       # Despesas com filtros e drill-down
│               ├── FolhaTab.tsx          # Headcount e folha salarial
│               ├── GorjetaTab.tsx        # Gorjeta recebida, paga e encargos
│               ├── HistoricoTab.tsx      # Faturamento histórico 2022–2026
│               ├── AuditTab.tsx          # 8 verificações automáticas de auditoria
│               └── DreBarChart.tsx       # Gráficos de barras (Client Component)
├── sql/                                  # Migrations (ver seção 11)
├── planilhas/
│   ├── BASE_BD_X_REAL_Abril_04__1_.xlsx  # Fonte Meet & Eat (template padrão)
│   └── BASE_BD_X_REAL_MAR_03_MDNA.xlsx   # Fonte Madonna SP Itaim (perfil próprio)
└── .env.local                            # NEXT_PUBLIC_SUPABASE_URL + ANON_KEY + SERVICE_ROLE
```

---

## 4. NAVEGAÇÃO DA DRE

URL base: `/financeiro/dre?aba=:slug`

| Slug | Label | Descrição |
|---|---|---|
| `dre` (default) | DRE | Tabela comparativa BD vs RE com drill-down por grupo |
| `indicadores` | Indicadores | Heatmap % de cada linha da DRE por mês |
| `receita` | Receita | Stacked bar por forma de pagamento |
| `despesas` | Despesas | Orçado vs Realizado por grupo + Despesas por grupo + Prestadores PJ |
| `folha` | Folha | Headcount por divisão, vagas em aberto, custo total |
| `gorjeta` | Gorjeta | Gorjeta recebida/paga, encargos (INSS/FGTS/férias/13º) |
| `historico` | Histórico | Faturamento 2022–2026, crescimento YoY |
| `auditoria` | Auditoria | Verificações automáticas com semáforo e observações |

A unidade ativa é selecionada no seletor de unidade do app (canto superior esquerdo). Todas as queries e o import usam o `unit_id` da unidade selecionada.

---

## 5. MULTI-UNIDADE — ARQUITETURA ⭐ NOVO

### 5.1 Tabela `units`

| id (uuid) | name |
|---|---|
| `00000000-0000-0000-0000-000000000010` | HOS |
| `f9c6c7fc-2ecc-4f79-98ce-c3118b670182` | **Madonna SP Itaim** (MDNA) |
| `970db6d9-9ff9-4284-9f76-9fbeb494ea04` | Match Point |
| `674eac8c-5a38-4a42-aa60-0a666387909b` | **Meet & Eat** (template padrão) |
| `00000000-0000-0000-0000-000000000099` | TESTE DRE |

> Coluna é `name`, não `nome`.

### 5.2 Isolamento por `unit_id`

**TODAS as 14 tabelas DRE têm coluna `unit_id` (uuid).** Cada query no `page.tsx` filtra por `unit_id` da unidade ativa (via helper `uq` que aplica `.eq("unit_id", unitId)`). O import faz `DELETE WHERE unit_id = X` antes de inserir, isolando cada unidade.

### 5.3 ⚠️ CONSTRAINTS UNIQUE precisam incluir unit_id

Erro recorrente quando se adiciona uma segunda unidade: as constraints UNIQUE antigas eram só por `mes_ano` (ou `mes_ano + outra coluna`), **sem `unit_id`**. Isso faz a segunda unidade colidir com a primeira. Todas já foram corrigidas para incluir `unit_id`:

| Tabela | Constraint corrigida |
|---|---|
| dre_mensal | UNIQUE (mes_ano, tipo, unit_id) |
| dre_gorjeta_mensal | UNIQUE (mes_ano, unit_id) |
| dre_pessoal_detalhado | UNIQUE (mes_ano, categoria, unit_id) |
| dre_prestadores | UNIQUE (mes_ano, nome, grupo, unit_id) |
| dre_receita_detalhada | UNIQUE (mes_ano, bandeira, unit_id) |
| dre_faturamento_historico | UNIQUE (mes_num, categoria, unit_id) |

**Regra para tabelas novas:** qualquer constraint UNIQUE numa tabela DRE DEVE incluir `unit_id`. Query para auditar:
```sql
SELECT t.relname, pg_get_constraintdef(c.oid)
FROM pg_constraint c
JOIN pg_class t ON c.conrelid = t.oid
JOIN pg_namespace n ON t.relnamespace = n.oid
WHERE n.nspname='public' AND c.contype='u'
  AND t.relname LIKE 'dre_%'
  AND pg_get_constraintdef(c.oid) NOT LIKE '%unit_id%';
-- Deve retornar VAZIO. Se retornar algo, corrigir antes de importar nova unidade.
```

### 5.4 Sistema de perfis de importação

O import (`DreImportModal.tsx`, função `handleImport`) seleciona os parsers por `unit_id`:

```
const isMdna = unitId === MDNA_UNIT_ID   // "f9c6c7fc-2ecc-4f79-98ce-c3118b670182"
```

- **Perfil PADRÃO** (Meet & Eat e qualquer unidade nova): parsers originais que leem abas `Base Realizado`, `04 -Base Orçado 2026`, `Planilha2` (pessoal), `Planilha4`/`Planilha5` (prestadores), etc.
- **Perfil MDNA** (Madonna SP Itaim): parsers próprios (`parseRealizadoMDNA`, `parseOrcadoMDNA`, `parseGorjetaMDNA`, `parsePrestadoresMDNA`, `parseReceitaMDNA`) — ver seção 6.2.

**Decisão de design:** unidades novas devem seguir o template do Meet & Eat (mesmo layout de planilha). Só units com layout estruturalmente diferente ganham perfil próprio. A Madonna é a exceção atual.

---

## 6. FONTES DE DADOS E PARSERS

### 6.1 Template PADRÃO — Meet & Eat

Planilha: `BASE_BD_X_REAL_Abril_04__1_.xlsx` (18 abas).

| Aba | Conteúdo | Tabela destino |
|---|---|---|
| `Base Realizado` | Realizado linha a linha, Jan–Abr | dre_linhas_detalhadas |
| `04 -Base Orçado 2026` | Orçado linha a linha, Jan–Dez | dre_linhas_detalhadas |
| `B.Receita` | Receita por bandeira | dre_receita_detalhada |
| `B. Despesa` | 3.239 lançamentos | dre_despesa_detalhada |
| `Base Folha` | 84 colaboradores | dre_folha |
| `Base Gorjeta` | Gorjeta Jan–Dez | dre_gorjeta_mensal |
| `Base Faturamento` | Histórico 2022–2026 | dre_faturamento_historico |
| `Planilha2` | Pessoal detalhado | dre_pessoal_detalhado |
| `Planilha3` | Manutenção por fornecedor | dre_manutencao_detalhada |
| `Planilha4` | PJ Operação | dre_prestadores |
| `Planilha5` | PJ Administrativo | dre_prestadores |
| `Serv` | 48 contratos fixos | dre_contratos_fixos |

### 6.2 Perfil MDNA — Madonna SP Itaim

Planilha: `BASE_BD_X_REAL_MAR_03_MDNA.xlsx` (25 abas, maioria oculta). **Estruturalmente diferente** do template padrão. A planilha "MAR 03" só tem dados até **Março** (Abril vem zerado — isso é correto, não é bug; o mês mais recente da conferência é Março).

**Diferenças estruturais e como o perfil MDNA resolve:**

| Dado | Padrão (Meet & Eat) | MDNA |
|---|---|---|
| Realizado | aba `Base Realizado` | aba `01 Base Realizado` |
| Pessoal | aba `Planilha2` dedicada | **embutido** no grupo PESSOAL da `01 Base Realizado` |
| Manutenção | aba `Planilha3` | embutido na base realizado |
| Prestadores | `Planilha4` (OP) + `Planilha5` (ADM) | aba única `Prestadores de Serviço PJ` (só Jan/Fev/Mar) |
| Gorjeta | `Base Gorjeta` formato A | `Base Gorjeta` formato linhas-rótulo (RECEBIDA/PAGA/RETENÇÃO) |
| Receita | `B.Receita` | mesma aba, mas grupo da planilha é "FATURAMENTO" → mapear p/ "RECEITA" |
| Despesa/Faturamento/Folha/Serv | iguais | iguais — reusa parsers padrão |

**⚠️ LIÇÃO CRÍTICA — DETECÇÃO POR NOME, NUNCA POR ÍNDICE FIXO:**
Cada aba da MDNA tem um **offset de coluna vazia diferente**. A `01 Base Realizado` tem uma coluna A vazia que a lib do browser (`XLSX.utils.sheet_to_json`) remove (deslocando índices -1), mas a `B.Receita` não tem. Índice fixo funciona numa aba e quebra em outra. **Os parsers MDNA detectam colunas pelo NOME do header** (`findHeaderRow` + `colMapByName` + `resolveMesCols`), tornando-os imunes ao offset.

**Tratamento de grupos no parseMdnaLinhas:**
- `MDNA_GRUPOS` = whitelist texto-da-planilha → grupo canônico (ex: "CUSTOS DOS PRODUTOS VENDIDOS" não está aqui de propósito; "CMV" sim).
- `MDNA_IGNORAR` = linhas em maiúsculas que são subtotais/cálculo a pular ("RECEITA LÍQUIDA", "ÍNDICE", "CHECK", "(-) ICMS", "GRATIFICAÇÃO ...", etc.).
- `MDNA_IGNORAR_GRUPO` = sub-grupos com filhas próprias que, ao serem encontrados, fazem `grupoAtual = null` (evita vazamento de filhas para o grupo anterior): "CUSTOS DOS PRODUTOS VENDIDOS", "ROYALTIES", "DEPRECIAÇÃO", "DESPESAS PRÉ-OPERACIONAIS", "CÁLCULO DO IR ADICIONAL".
- `MDNA_IGNORAR_DESC` = descrições específicas a excluir ("Gorjetas Recebidas" — não entra em RECEITA pois é contabilizada via gorjeta).
- `CMV_SEM_FILHAS` = grupos cujas filhas não existem ou são problemáticas; gera uma linha sintética com o total declarado e zera `grupoAtual`: "CMV", "DESP. FINANCEIRAS", "IMPOSTOS".

**Mapa de grupos MDNA → canônico:**
```
FATURAMENTO → RECEITA          CUSTOS DOS PRODUTOS VENDIDOS → (ignorar; usar linha "CMV")
CMV → CMV                      UTILIDADES/ CONSUMO → UTILIDADES
PESSOAL → PESSOAL              TAXAS CARTÃO DE CRÉDITO → TAXAS CARTÃO
OCUPAÇÃO → OCUPAÇÃO            DESPESAS FINANCEIRAS → DESP. FINANCEIRAS
MANUTENÇÃO → MANUTENÇÃO        IMPOSTOS → IMPOSTOS
OPERAÇÃO → OPERAÇÃO            MARKETING → MARKETING
ADMINISTRATIVA → ADMINISTRATIVA
```

**⚠️ CMV tem sinal duplo na MDNA:** existem duas linhas — "CUSTOS DOS PRODUTOS VENDIDOS" (+, subtotal de cálculo) e "CMV" (−, valor do DRE). Usar a linha "CMV"; ignorar a outra.

**Pessoal e Manutenção na MDNA:** `pessoalRows` e `manutencaoRows` retornam `[]` no perfil MDNA (dados embutidos no realizado, sem aba dedicada).

---

## 7. MÉTODO DE TRABALHO PARA NOVAS UNIDADES ⭐ LIÇÃO APRENDIDA

A implementação do perfil MDNA demorou muito mais que o necessário porque os bugs foram caçados **em produção, um por vez** (editar → commit → deploy → testar no browser → ler log → repetir). Cada volta custava minutos.

**O jeito certo, daqui pra frente:**

1. **Validar a planilha LOCALMENTE primeiro.** Abrir o `.xlsx` com Python/openpyxl, mapear todas as abas, colunas e offsets ANTES de escrever qualquer parser. Confirmar onde está cada dado.
2. **Escrever e testar o parser contra os dados reais offline.** Rodar a lógica do parser em Python/script contra a planilha até os números baterem (conferência, totais por grupo, receita, gorjeta).
3. **Só então entregar o código final** para o Claude Code, validado, de uma vez. Um deploy, não dez.
4. **Detecção por nome de header, sempre.** Nunca índice fixo de coluna — offsets variam entre abas e entre unidades.

Se a nova unidade seguir o template do Meet & Eat (recomendado), nada disso é necessário — importa direto no perfil padrão.

---

## 8. BANCO DE DADOS — SUPABASE POSTGRESQL

**Projeto produção:** `iqgrvptrtphvbmvrqntm.supabase.co`
> (Atualizado — o projeto antigo `laodipuodgrpqykrupms` referido em versões anteriores deste manual está desatualizado.)

> RLS habilitado em algumas tabelas (ex: dre_mensal tem policies read p/ authenticated+anon e manage p/ service_role).

**Acesso ao SQL:** o CLI do Supabase aponta para banco local (porta 54322) e **não acessa produção**. Para rodar SQL em produção, usar sempre **Supabase Dashboard → SQL Editor**.

### Tabelas (14 no total, todas com `unit_id`)

| Tabela | Conteúdo |
|---|---|
| `dre_linhas_detalhadas` ⭐ | Espinha dorsal: cada linha da DRE × mês × tipo (realizado/orcado) |
| `dre_mensal` | 1 linha por mês × tipo (totais consolidados) |
| `dre_receita_detalhada` | Receita por bandeira/forma de pagamento |
| `dre_despesa_detalhada` | Lançamentos de despesa individuais |
| `dre_folha` | Colaboradores CLT por divisão |
| `dre_gorjeta_mensal` | Gorjeta recebida/paga/retenção/encargos por mês |
| `dre_faturamento_historico` | Série anual 2022–2026 por mês/categoria |
| `dre_prestadores` | Prestadores PJ por nome e mês |
| `dre_contratos_fixos` | Contratos mensais recorrentes |
| `dre_pessoal_detalhado` | Breakdown de PESSOAL por categoria/mês |
| `dre_manutencao_detalhada` | Manutenção por fornecedor |
| `dre_kpis_mensais` | Clientes, ticket, gorjetas, impostos por mês |
| `dre_indicadores` | Indicadores % por mês (real e orçado) |
| `v_aprovacoes_pendentes` | VIEW (criada para o módulo Aprovações; placeholder vazio por enquanto) |

### Esquema de `dre_linhas_detalhadas` (colunas reais em produção)
```
id bigint PK | mes_ano varchar | tipo varchar | grupo varchar | descricao varchar
conta varchar | custo_tipo varchar | valor numeric | av_percentual numeric
criado_em timestamp | unit_id uuid
```

### ⚠️ Formato de `mes_ano`: SEM zero à esquerda
Formato no banco é `"2026-1"`, `"2026-2"` ... `"2026-12"` (não `"2026-01"`). Qualquer comparação no front precisa normalizar. Helper usado no `DespesasTab.tsx`:
```ts
const normalizeMes = (m: string) => { const [a,mm]=m.split("-"); return `${a}-${parseInt(mm)}` }
```

---

## 9. PADRÕES DE QUERY E BUGS RESOLVIDOS NESTA SESSÃO

Vários bugs vieram do mesmo padrão: **os helpers procuravam uma linha de "subtotal" que não existe no banco** (ex: `descricao === "Pessoal Total"` ou `descricao.endsWith("Total")`). O banco só tem as linhas componentes. **Solução padrão: somar as linhas do grupo com `reduce`, não procurar uma linha-total.**

Resolvidos:
- **Orçado vs Realizado por Grupo (DespesasTab)** — tabela vazia. Causa raiz: helpers `orcForMes`/`reForMes` buscavam `endsWith("Total")` inexistente. Fix: somar por grupo. Também havia mismatch de `mes_ano` (zero à esquerda) → `normalizeMes`.
- **% RL (BD) e % RL (RE)** — não existia linha "Receita Líquida" no banco; somar o grupo RECEITA.
- **Cards de total na aba Folha** — `getTotalPessoal` buscava "Pessoal Total"; fix: somar grupo PESSOAL.
- **IRRF/INSS** — estava classificado em grupo errado; movido para PESSOAL e reimportado.
- Regra geral: ao exibir total de um grupo, **somar as linhas**, nunca depender de uma linha-subtotal no banco.

---

## 10. FÓRMULAS DE NEGÓCIO

```
Receita Líquida = Faturamento Bruto − Impostos
CMV %        = CMV / Receita Líquida × 100
Pessoal %    = Pessoal Total / Receita Líquida × 100
EBITDA       = RL − CMV − Pessoal Total − Ocupação − Utilidades − Manutenção
               − Operação − Administrativa − Marketing − Taxa Cartão
Margem EBITDA % = EBITDA / Receita Líquida × 100
```
**Denominador sempre Receita Líquida (pós-impostos), nunca Receita Bruta.**

### Ponto de Equilíbrio
```
Break-even = Custos Fixos / (1 − CV / RL)
Custos Fixos = linhas com custo_tipo='F' AND tipo='orcado'
Custos Variáveis = CMV + Taxas Cartão + linhas com custo_tipo='V'
```
**⚠️ CMV não tem tag custo_tipo — incluir manualmente no CV, senão o break-even fica artificialmente baixo.**

---

## 11. PROBLEMAS DE QUALIDADE DE DADOS CONHECIDOS ⚠️ (Meet & Eat)

- **P1 — CRÍTICO: Sinal de estoque invertido no CMV.** Planilha calcula CMV com sinal trocado; CMV mensal não confiável. Usar CMV de consumo acumulado. Acumulado Jan–Abr: planilha 35,5% RL vs correto 29,7% RL.
- **P2 — CRÍTICO: Carga tributária realizada anômala.** Imposto realizado muito abaixo do orçado (RE/BD 18–48%). EBITDA superestimado ~R$ 276k. Verificar regime tributário com contador.
- **P3 — Gorjetas deprimindo EBITDA.** Gorjeta paga (~R$90k/mês) lançada como Pessoal sem contrapartida da recebida. Por isso há dois subtotais: "Pessoal Operacional" (sem gorjeta) e "Pessoal Total" (com).
- **P4 — Concentração PJ/Honorários** acima de 10% da receita.
- **P5 — Estrutura ~70% custo fixo** — alta alavancagem operacional.
- **P6 — Ticket orçado fixo em R$300** o ano todo.
- **P7 — "Receita Líquida" do orçado > Receita Bruta** (nomenclatura errada; soma gorjetas+delivery).

---

## 12. ABA AUDITORIA — VERIFICAÇÕES AUTOMÁTICAS

Cards recalculam ao vivo do Supabase; problemas flutuam ao topo e ficam expandidos.

| ID | Severidade | Verificação | Threshold |
|---|---|---|---|
| V1 | 🔴 Crítico | Carga tributária anômala | RE/BD < 80% |
| V4 | 🔴 Crítico | CMV Planilha vs CMV Consumo | Divergência > 25% |
| V2 | 🟡 Atenção | Concentração PJ/Honorários | > 7% Receita Bruta |
| V3 | 🟡 Atenção | Gorjetas Pagas vs orçado | Desvio > 20% |
| V5 | 🟡 Atenção | Receita Líquida > Receita Bruta | Sempre ≤ |
| V6 | 🟡 Atenção | Ponto de equilíbrio | Meses abaixo do BE |
| V7 | 🔵 Info | Lançamentos sem classificação DRE | Qualquer |
| V8 | 🔵 Info | Reconciliação de receita | Divergência > R$1.000 |

---

## 13. PADRÃO VISUAL

- **Tema:** Dark, fundo quase preto, texto off-white.
- **Cores:** Verde = melhor que orçado/positivo; Vermelho/âmbar = pior/alerta; Azul = informativo.
- **Auditoria:** borda esquerda colorida por severidade.
- **Valores monetários:** formatar com `toLocaleString("pt-BR", {style:"currency", currency:"BRL", maximumFractionDigits:0})`.
- **Drill-down:** seta ▸ expande subcategorias; badges F (azul) / V (âmbar) para custo_tipo.

---

## 14. PENDÊNCIAS CONHECIDAS

### Resolvidas nesta sessão (jun/2026)
- ✅ Multi-unidade (unit_id em todas as tabelas + constraints corrigidas)
- ✅ Perfil de import MDNA (Madonna SP Itaim importada e validada)
- ✅ Orçado vs Realizado por Grupo (estava vazio)
- ✅ % RL (BD) e % RL (RE)
- ✅ Cards de total da aba Folha
- ✅ IRRF/INSS reclassificado para PESSOAL
- ✅ `v_aprovacoes_pendentes` criada (some o erro no console)

### Abertas
1. **404 de prefetch da sidebar** — vêm do `Sidebar.tsx` em `lib/kph/ui/` (rotas `/pessoas/*`, `/operacao/*`, `/compras/*` sem `prefetch={false}` ou sem página). É do **repo do shell**, não do kph-os-financeiro. Resolver em sprint do shell.
2. **api/nav centralizada** — sidebar propagada manualmente nos 8 repos. Sprint do shell.
3. **Taggear custo_tipo (F/V) no realizado** — só o orçado tem tags; break-even real exige no realizado.
4. **Contagem física de estoque mensal** — valores atuais parecem estimativas.
5. **Resolver sinal de estoque no CMV** — verificar fórmula com contador.
6. **Investigar carga tributária** — confirmar regime e alíquota com contador.
7. **Abril sem clientes/ticket** em `dre_kpis_mensais` (Meet & Eat).
8. **Orçamento de receita usa TM fixo R$300** — reconstruir com TM variável.
9. **Parser de receita padrão pode falhar com BANDEIRA nula** — a tabela tem `bandeira` NOT NULL. O perfil MDNA já usa fallback "Outros"; o padrão (Meet & Eat) ainda usa `toStr` que pode retornar null. Aplicar fallback no padrão se aparecer o erro.

---

## 15. CHECKLIST — IMPORTAR UMA NOVA UNIDADE

1. Confirmar que a unidade existe na tabela `units` e pegar o `unit_id`.
2. **Se a planilha seguir o template Meet & Eat:** selecionar a unidade no app, Importar Excel, conferir review, confirmar. Pronto.
3. **Se a planilha tiver layout diferente:** seguir o MÉTODO da seção 7 (validar offline primeiro). Criar perfil próprio no `DreImportModal.tsx` com seletor por `unit_id` e parsers por nome de header.
4. **Antes do primeiro import de qualquer unidade nova:** rodar a query de auditoria de constraints (seção 5.3) e garantir que nenhuma constraint UNIQUE em tabela `dre_*` está sem `unit_id`.
5. Validar no review: Conferência DRE (todos grupos ✅), Gorjeta (meses), Receita (DRE = planilha), Pessoal e Detalhes (números razoáveis).

---

*Última atualização: 02/06/2026 — sessão de multi-unidade: import via UI, perfil MDNA, constraints por unit_id, correções de Orçado vs Realizado / Folha / % RL.*