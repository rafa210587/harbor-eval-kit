# Pendências — próximos passos

Este arquivo não depende de contexto de nenhuma conversa anterior. Qualquer agente de coding
(Claude Code, Codex, ou humano) deve conseguir pegar um item daqui, implementar e marcar como
feito, só lendo este arquivo + `docs/ENGENHARIA.md` (padrões e o porquê de cada um) +
`AGENTS.md` (regras sempre-válidas).

**Antes de implementar qualquer item**: rode `bash scripts/test.sh` (ou `.ps1`) pra confirmar
a baseline, siga a skill `ship-change` (`.claude/skills/ship-change/SKILL.md` — vale como
checklist mesmo fora do Claude Code) e documente a mudança no mesmo commit, no arquivo que ela
afeta (ver mapa em `README.md`/`DOCUMENTACAO.md` §14).

---

## ✅ Já implementado (não reabrir sem motivo novo)

Para contexto de quem só vai ler este arquivo — a auditoria original tinha mais itens do que os
que seguem abaixo; estes já foram resolvidos e testados de ponta a ponta:

- **Guarda de gasto** (estimativa + teto + confirmação) — `scripts/lib/cost.ts`.
- **CI** (GitHub Actions, 3 SOs) — `.github/workflows/ci.yml`.
- **Cancelar run em andamento** (best-effort, mata processo + tenta parar containers) —
  `POST /api/compare/cancel`, `scripts/lib/exec.ts` (`stopContainersForJob`).
- **Export/import de config** (bundle idempotente por id, nunca inclui secret) —
  `scripts/lib/bundle.ts`, aba "Config" na GUI.
- **Filtro em listas de checkbox grandes** (Judge Rubrics, Skill Sets, etc.) —
  `checkboxGroup()` em `gui/app/core.js`, aparece acima de 8 itens.

## 🔲 Licença (decisão do dono do repo, não técnica)

Ainda sem `LICENSE`. Ficou deliberadamente fora de escopo até agora ("uso corporativo interno,
sem expor a terceiros"). Se isso mudar (repo for aberto a terceiros, ou distribuído fora da
empresa), decidir entre MIT/Apache-2.0/proprietária e adicionar o arquivo — 5 minutos de
trabalho, mas é uma decisão de negócio, não algo pra um agente decidir sozinho.

## 🔲 Layout — usar melhor o espaço da tela

**Medido** (viewport 1707×791, 2026-09-06): o painel de conteúdo ocupa **1000px** de 1707
(59%) — 707px vazios nas laterais. A tabela de resultado do Compare nasce em `y≈1128px` numa
página de 1181px de altura total, ou seja, **abaixo da dobra** — quem roda uma comparação
precisa rolar pra ver o resultado toda vez.

**O que fazer**: layout de duas colunas na aba Compare (e possivelmente Agents/Judges, que têm
formulário + lista lado a lado hoje empilhados) — formulário à esquerda com largura fixa
(~480px), resultado/lista à direita ocupando o resto. CSS puro (`gui/styles.css`), sem lib:
`display:grid; grid-template-columns: 480px 1fr; gap: 20px;` no container da aba, envolvendo o
form num `<div>` e o restante (tabela + painel de análise) noutro. Testar em pelo menos duas
larguras (laptop 1366px e monitor 1920px) — abaixo de ~1100px de viewport, cair pra uma coluna
só (`@media (max-width: 1100px)`), porque forçar duas colunas apertadas é pior que uma.

**Não fazer**: redesenhar as outras 13 abas juntas. Comece pelo Compare (é o payoff, é onde a
dobra dói mais) e generalize só se funcionar bem lá.

## 🔲 Modo compacto para os hints

**Medido**: 63 elementos `.hint`, 15.633 caracteres (~2.600 palavras) na página. Ótimo na
primeira vez, ruído na vigésima.

**O que fazer**: um toggle "Modo compacto" na barra de status (`#statusBar`, topo da página)
que adiciona uma classe `compact` em `<body>`; CSS: `.compact .hint { display: none; }`
(ou `max-height:0;overflow:hidden` se quiser transição). Persistir a escolha em
`localStorage` (é preferência só daquele navegador, não precisa ir pro servidor — mesmo
princípio de "conveniência por viewer" já usado neste tipo de decisão no projeto). Não esconder
hints que também funcionam como mensagem de erro/aviso (`#cost-estimate`,
`#config-bundle-status`, `#logs-status` etc. usam `.hint` pra estilo mas carregam estado, não
texto educativo — dar uma classe diferente a esses, tipo `.status-line`, antes de aplicar o
toggle, senão o modo compacto esconde informação viva).

## 🔲 Navegação — agrupar as 14 abas

**Medido**: 14 botões cabem numa linha em 1707px (45px de altura, sem quebrar), mas quebram em
telas de laptop comuns (1366px e abaixo) — confirmar e, se quebrar, agrupar em três blocos
visuais: **Configurar** (Secrets, Models, Skills, Skill Sets, Agents, Criteria, Judge Rubrics,
Judges) → **Rodar** (Tasks, Compare) → **Analisar/Apoio** (Datasets, Config, Logs,
Trajectories, Analyze). Pode ser só um separador visual (`<span class="nav-divider">`) entre
grupos dentro do mesmo `<nav>`, não precisa virar sub-menu.

## 🔲 Acessibilidade

**Medido**: 71 de 77 `<label>` sem associação (`for`/`id`) ao input — funcionam visualmente,
não funcionam com leitor de tela (clicar no texto do label não foca o campo, e o leitor não
anuncia qual campo é qual). Zero `aria-live` na página — o cronômetro "Rodando há Xm Ys…" e os
status de import/export não são anunciados a quem usa leitor de tela. Contraste do texto
`.hint` (`rgb(154,163,175)` sobre `rgb(15,17,21)`) passa AAA (7.4:1) — não mexer nisso.

**O que fazer**:
1. Cada `<input>`/`<select>`/`<textarea>` ganha um `id` único e o `<label>` correspondente
   ganha `for="esse-id"` — mecânico, mas são ~70 pares pra revisar um por um (não dá pra
   regex-substituir com segurança porque vários labels envolvem múltiplos inputs num
   `row-inline`; nesses casos, um label por input, não um label pra dois campos).
2. `aria-live="polite"` em `#compare-output`, `#config-bundle-status`, `#logs-status` — só
   nesses três, não em toda `.hint` (isso faria o leitor de tela narrar 2.600 palavras de texto
   didático estático a cada re-render).

**Como verificar que funcionou**: no DevTools do Chrome, aba Accessibility, ou rodando
`document.querySelectorAll('input,select,textarea').length` vs.
`document.querySelectorAll('label[for]').length` no console — os dois números devem bater
(descontando os `type=hidden`, que não precisam de label).

## 🔲 Busca em listas simples (fora do checkboxGroup)

O filtro de `checkboxGroup()` (já feito) cobre as listas de **seleção múltipla**. As listas
**simples** de cadastro (Models, Agents, Judges, etc. — o `<div id="models-list">` e afins,
renderizados por `makeRow()` em `gui/app/core.js`) não têm busca e hoje têm poucos itens (9
models, 4 agents), mas um time com 50+ models cadastrados sentiria falta. Baixa prioridade —
só vale se um usuário real reclamar do volume.

## 🔲 Tema claro

A GUI só tem tema escuro (`gui/styles.css`, variáveis fixas em `:root`). Se algum usuário
corporativo precisar de tema claro (política de acessibilidade da empresa, por exemplo): CSS
puro, `prefers-color-scheme` — redefinir as mesmas variáveis dentro de
`@media (prefers-color-scheme: light) { :root { ... } }`. Baixa prioridade até alguém pedir.
