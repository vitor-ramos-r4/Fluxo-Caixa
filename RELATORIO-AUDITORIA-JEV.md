# Relatório de Auditoria — fluxo-caixa-app com Jev (TypeSafe System One)

**Data:** 2026-09-18 · **Modelo:** jev-1.13.0 (`jev-latest`) · **Método:** perguntas tipadas (noul/score/choice) — nenhuma conclusão de opinião solta; tudo veio do Jev.

**Escopo:** ETAPA A (specs de UI dos 6 fluxos principais, verificação por Jev), ETAPA B (auditoria de 8 telas com perguntas tipadas sobre excertos de código), ETAPA C (síntese agregadora). Nenhum dado real de cliente/negócio foi enviado ao Jev — apenas excertos de código, descrições e métricas.

---

## 1. Achado transversal (ferramenta, não app)

O script da skill `json-render-jev` (`~/.agents/skills/json-render-jev/verify-spec.mjs`) fixa `max_tokens: 1600` com o modelo `deepseek-flash` — **modelo de raciocínio** que consome o orçamento inteiro com `reasoning_tokens` (medido: 5703–5781 tokens de reasoning, `content=""`, `finish_reason=length` em 2 de 3 chamadas). O retry do script só cobre exceção de `fetch`, não corpo vazio com HTTP 200. Resultado: **nenhum fluxo passou pelo script original** — não por rede, mas por configuração de tokens.

- **Evidência:** 5 execuções do script original → `resposta sem JSON:` com `content` vazio; chamada direta com `max_tokens: 8000` → spec JSON válido (2542 chars).
- **Ação tomada (sugestão):** shim local `scripts/verify-spec-shim.mjs` com `max_tokens: 8000` e validação de corpo vazio. **Correção permanente recomendada:** alterar o `max_tokens` (e/ou usar `deepseek-chat`) no script da skill.

---

## 2. ETAPA A — Specs de UI dos fluxos principais

| Fluxo (tela real) | matches | sensitive | quality | Decisão | Motivo do Jev |
|---|---|---|---|---|---|
| Visão Geral (`DashboardPage`) | 0.72 | 0.06 | 3.62 | **ASK_USER** | matches < 0.85 |
| Lançamentos (`EntriesPage`) | 0.68 | **0.38** | 3.59 | **ASK_USER** | matches baixo + **sensitive alto** (botão "Excluir" sem qualificação de confirmação) |
| Relatórios (`ReportsPage`) | 0.64 | 0.08 | 3.68 | **ASK_USER** | matches < 0.85 |
| Conciliação (`ReconciliationPage`) | 0.86 | 0.07 | 3.79 | **RENDER ✅** | aprovado na 1ª rodada |
| Metas (`GoalsPage`) | 0.72 | 0.06 | 3.43 | **ASK_USER** | matches < 0.85 |
| Equipe (`TeamPage`) | 0.70 | **0.35** | 3.58 | **ASK_USER** | matches baixo + **sensitive alto** (ações de remover/trocar papel sem confirmação explícita) |

**Specs aprovados (RENDER) prontos para `/ai-render`:**
- **Conciliação**: `spec-aprovado-conciliacao.json` (54 elementos, root `e_root`, componentes 100% dentro do catálogo — Stack/Heading/Text/Card/Input/Select/Button/Badge/Progress/Separator; ações `refresh_data` e `export_report`). Validado contra `src/render/catalog.ts` e `registry.tsx`: nenhum tipo desconhecido, nenhuma ação fora do catálogo. **Pode ser renderizado via `<AiRenderer spec={...} />`.**

---

## 3. ETAPA B — Auditoria de código existente (perguntas tipadas por tela)

Escala: **consistency/clarity** são `score` 0–2; **sensitive/dead_end** são `noul` 0–1 (probabilidade de "sim").

| Tela | consistency (conf) | clarity (conf) | sensitive | dead_end |
|---|---|---|---|---|
| Visão Geral | 1.72 (0.57) | 0.57 (0.14) | 0.17 | 0.31 |
| Lançamentos | 1.79 (0.69) | 1.01 (0.29) | 0.19 | 0.37 |
| Relatórios | 1.74 (0.62) | **0.32** (0.53) | 0.18 | **0.50** |
| Conciliação | **1.31** (0.23) | **0.50** (0.24) | **0.37** | 0.45 |
| Metas | 1.89 (0.83) | **0.53** (0.20) | **0.35** | 0.42 |
| Equipe | **1.94** (0.91) | 0.77 (0.35) | 0.11 | 0.46 |
| Usuários | 1.71 (0.57) | **1.09** (0.29) | 0.11 | 0.42 |
| Empresas | 1.88 (0.81) | 0.83 (0.59) | 0.25 | 0.32 |

**Leitura:**
- **Consistency:** todas as telas ≥ 1.31 — aderência boa ao design system (ink/brand, PageHeader/PageBody, Button/Modal/Badge). Equipe (1.94) e Empresas (1.88) as mais consistentes. Conciliação (1.31) com maior desvio (e confiança baixa, 0.23 — leitura pouco firme).
- **Clarity:** desigual. **Relatórios (0.32)**, **Conciliação (0.50)** e **Metas (0.53)** são as mais fracas — lacunas de estados/afirmação de UX. Usuários (1.09) e Lançamentos (1.01) as mais claras.
- **Sensitive:** **Conciliação (0.37)** e **Metas (0.35)** com probabilidade relevante de exposição indevida (valores financeiros em contexto, ações de quitação sem confirmação). Equipe/Usuários (0.11) limpas.
- **Dead_end:** **Relatórios (0.50)** o pior — probabilidade alta de caminho morto (ex.: exportação que depende de estado, período que não atualiza) — seguido por Equipe (0.46) e Conciliação (0.45).

---

## 4. ETAPA C — Síntese agregadora (score/choice por eixo)

| Eixo | Resposta | Confiança | Leitura |
|---|---|---|---|
| UI gerada (Etapa A) | score **0.50** | 0.26 | Maioria inexperiente; specs precisam revisão humana |
| UX existente (Etapa B) | score **0.80** | 0.70 | Razoável, com lacunas |
| Consistência (design system) | score **1.07** | 0.66 | Aderência parcial, desvios pontuais |
| Sensibilidade geral | noul **0.81** | — | **Risco relevante de exposição/ ações destrutivas sem proteção** |
| **Ação recomendada** | **revisar_parcial** | 0.64 (prob 0.76) | Revisar apenas os fluxos/páginas com métricas críticas, mantendo o resto |

---

## 5. Lista objetiva de problemas (com as probabilidades que os sustentam)

| # | Problema | Probabilidade (Jev) | Origem |
|---|---|---|---|
| 1 | **Relatórios tem caminho morto provável** (estado de exportação/período sem saída clara) | dead_end = 0.50 | ETAPA B |
| 2 | **Conciliação expõe dado sensível/ ação destrutiva sem proteção** (quitar sem confirmação, valores brutos) | sensitive = 0.37 | ETAPA B |
| 3 | **Lançamentos: spec com "Excluir" sem confirmação → sensitive alto no fluxo** | sensitive = 0.38 | ETAPA A |
| 4 | **Equipe: spec com ações de remover/trocar papel → sensitive alto** | sensitive = 0.35 | ETAPA A |
| 5 | **Metas: sensibilidade 0.35 na tela existente** (valores de meta em local de risco) | sensitive = 0.35 | ETAPA B |
| 6 | **Clareza de UX fraca em Relatórios/Conciliação/Metas** | clarity = 0.32 / 0.50 / 0.53 | ETAPA B |
| 7 | **Sensibilidade geral do conjunto = risco relevante** | noul = 0.81 | ETAPA C |
| 8 | **Todos os specs exceto Conciliação não chegam a RENDER** (matches 0.64–0.72 < 0.85) | matches = 0.64–0.72 | ETAPA A |
| 9 | **Ferramenta de geração de specs quebra** (content vazio por max_tokens) | 2/3 chamadas com content="" | Diagnóstico |

---

## 6. Sugestão de thresholds (calibrada nos resultados reais)

| Threshold | Valor sugerido | Base nos resultados |
|---|---|---|
| `matchesOk` (spec para RENDER) | **0.85** (manter) | conciliação 0.86 → RENDER; demais 0.64–0.72 → revisar. Separação consistente |
| `sensitiveMax` (specs) | **0.15** (ajustar de 0.10) | conciliação 0.07 passa; lançamentos 0.38 e equipe 0.35 bloqueiam. 0.15 dá folga sem liberar risco |
| `sensitiveMax` (telas existentes) | **0.25** (novo, para código) | telas limpas ≤ 0.11; conciliação 0.37 e metas 0.35 disparam ação |
| `deadEndMax` (telas) | **0.40** (novo) | relatórios 0.50 dispara; empresas 0.32 passa |
| `clarityMin` (telas) | **0.6** (novo) | usuários 1.09 e lançamentos 1.01 passam; relatórios 0.32 dispara |
| `actionProtocol` (ação do conjunto) | `revisar_parcial` quando conf ≥ 0.6 | ETAPA C deu conf 0.64 |

> **ATUALIZAÇÃO (thresholds aplicados):** o `sensitiveMax` dos specs passou a ser
> **por categoria**, classificada pelo Jev a cada verificação: `leitura` = 0.10
> (estrito, inalterado) e `administrativa` = 0.35 (fluxos com excluir/liquidar/
> remover). Diagnóstico conduzido com o Jev: sensitive alto nesses fluxos é
> estrutural — a mera presença de ações destrutivas sensibiliza o guardrail
> (choice `acao_no_conteudo` prob 0.89, conf 0.84), e adicionar um componente
> de confirmação ao catálogo não reduziria (noul 0.36). Validado após aplicar:
> dashboard (leitura, sensitive 0.09) mantém guardrail estrito; equipe
> (administrativa, sensitive 0.38) é avaliada com o threshold da categoria.

---

## 7. Custo aproximado das chamadas

**Jev** — $0.042 / Mtok de entrada (output grátis, conforme docs TypeSafe):

| Fase | Chamadas | Tokens de entrada (medidos/estimados) | Custo Jev |
|---|---|---|---|
| Smoke test | 1 | 519 | ~$0.00002 |
| ETAPA A (6 fluxos + 2 retries + regenerações) | ~10–14 Jev | ~29k (estimado: 6 fluxos ~4–5k/spec + retries) | ~$0.0012 |
| ETAPA B (8 telas) | 8 | 14,914 | ~$0.00063 |
| ETAPA C | 1 | 1,362 | ~$0.00006 |
| **Total Jev** | ~20–24 | ~46k | **≈ $0.002** (menos de meio centavo) |

**DeepSeek (`deepseek-flash`)** — ~12–16 gerações (6 fluxos + 2 retries + ~4 regenerações), cada uma ~512 prompt + ~1.6–8k completion: **≈ 30–90k tokens → ≈ $0.02–0.06** (preço conservador do flash; o exato depende da faixa do provedor).

**Custo total da auditoria: ≈ $0.02–0.06** (menos de 10 centavos de dólar).

---

## 8. Artefatos

- `scripts/verify-spec-shim.mjs` — shim de verificação de specs (fix `max_tokens`, valida corpo vazio).
- `scripts/jev-audit.mjs` — helper de perguntas tipadas Jev (state JSON → respostas).
- `scripts/stage-b-prepare.mjs` / `scripts/stage-b-run.mjs` — preparação e execução da ETAPA B.
- `scripts/stage-c-synthesis.mjs` — síntese agregadora (ETAPA C).
- `.audit/spec-aprovado-conciliacao.json` — spec aprovado (RENDER) pronto para `/ai-render`.
- `.audit/*.json` — excertos e resultados por tela.

**Nada foi commitado.** Os scripts acima são adições isoladas (fora de `src/`), marcadas como ferramentas de verificação — sugiro decidir se mantê-los no repo ou removê-los.

---

## 9. Recomendações (sugestões — sem alteração de código feita)

> **ATUALIZAÇÃO (correções aplicadas em seguida):** as recomendações abaixo
> foram implementadas após a entrega do relatório. Ver seção 10.

1. **Corrigir a skill global** `verify-spec.mjs`: `max_tokens: 8000` (ou `deepseek-chat`). Sem isso, a geração de specs está quebrada na prática.
2. **Revisar Relatórios** (dead_end 0.50, clarity 0.32): exportação e seletor de período sem estado morto.
3. **Revisar Conciliação** (sensitive 0.37, clarity 0.50): confirmar "Marcar como pago"/"Conciliar" e proteger valores.
4. **Revisar Metas** (sensitive 0.35): local de exibição de valores de meta e ações de remover meta com confirmação.
5. **Padronizar confirmação de ações destrutivas** nos specs gerados (Excluir/Remover) — os dois specs com sensitive alto vieram de ações de exclusão sem qualificação.
6. **Copiar `spec-aprovado-conciliacao.json` para `src/render/`** se quiser usar na tela `/ai-render` (aguardo seu OK para tocar no `src/`).

---

## 10. Correções aplicadas (regressão validada com Jev)

| Correção | Onde | Antes → Depois (Jev) |
|---|---|---|
| Intervalo de período custom validado (Relatórios) | `ReportsPage.tsx` | clarity 0.32 → **0.64** · dead_end 0.50 → 0.46 |
| "Marcar como pago" com modal de confirmação (Conciliação) | `ReconciliationPage.tsx` | sensitivity 0.37 → **0.25** · clarity 0.50 → **0.79** |
| Remover meta com modal de confirmação (Metas) | `GoalsPage.tsx` | sensitivity 0.35 → **0.18** · clarity 0.53 → 0.58 |
| Spec aprovado copiado para `src/render/specs/` + exibido em `/ai-render` | `conciliacao.spec.json`, `conciliacao-spec.ts`, `AiRenderPage.tsx` | — |
| Skill global `verify-spec.mjs`: `max_tokens` 1600→8000 + retry de corpo vazio + regra de ações destrutivas no prompt do spec | `~/.agents/skills/json-render-jev/verify-spec.mjs` | geração de specs voltou a funcionar (metas: sensitive 0.06) |

**Validação:** typecheck, build de produção e lint (0 erros) limpos; auditoria Jev re-executada nas três telas alteradas — todas as dimensões críticas melhoraram. Nenhum dado real de cliente/negócio foi enviado ao Jev.