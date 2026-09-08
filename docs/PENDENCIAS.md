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

- **Guarda de gasto** (estimativa + teto + confirmação) — `scripts/lib/cost.ts`.
- **CI** (GitHub Actions, 3 SOs) — `.github/workflows/ci.yml`.
- **Cancelar run em andamento** (best-effort, mata processo + tenta parar containers) —
  `POST /api/compare/cancel`, `scripts/lib/exec.ts` (`stopContainersForJob`).
- **Export/import de config** (bundle idempotente por id, nunca inclui secret) —
  `scripts/lib/bundle.ts`, aba "Config" na GUI.
- **Filtro em listas de checkbox grandes** (Judge Rubrics, Skill Sets, etc.) —
  `checkboxGroup()` em `gui/app/core.js`, aparece acima de 8 itens.
- **Layout de duas colunas no Compare** — `.compare-layout` em `gui/styles.css`, config à
  esquerda (420px), resultado à direita; colapsa pra uma coluna abaixo de 1100px de viewport.
  Tabela de resultado envolta em `.table-wrap` (scroll horizontal próprio, nunca a página).
- **Modo compacto** — checkbox no cabeçalho (`#compact-toggle`), persiste em `localStorage`,
  esconde `.hint` exceto os marcados `.status-line` (que carregam estado, não texto didático).
- **Navegação agrupada** — Jornada, Catálogo e Ambiente e ajuda; Começar orienta o primeiro uso
  e Novo experimento separa objetivo, candidatos, task/volume e execução.
- **Acessibilidade** — 60 pares `<label for>`/`id` associados (dos ~67 campos reais; o resto
  são labels de **grupo** — "Rubrics", "Skills incluídas" etc. — que descrevem um
  `checkbox-group` inteiro, não um único campo, então `for` apontaria pra um membro arbitrário
  do grupo de forma enganosa; ficaram como texto descritivo mesmo, decisão deliberada, não
  esquecimento). `aria-live="polite"` em `#compare-output`, `#config-bundle-status`,
  `#logs-status`. Verificado clicando no texto do label de verdade e confirmando que o foco vai
  pro campo certo (não só contando atributos).
- **Tema claro** — `@media (prefers-color-scheme: light)` em `gui/styles.css`, sem toggle (seguia
  a preferência do SO/navegador). Achado testando de verdade: os inputs tinham fundo
  `#0d0f13` **fixo**, não uma variável — no tema claro ficavam caixas pretas dentro de painéis
  brancos. Virou `--input-bg`, com valor próprio por tema.

## 🔲 Próximas melhorias de avaliação

- Intervalos de confiança e comparações pareadas por task, com dispersão entre tentativas.
  Definir os denominadores e tratar falhas de infraestrutura antes de apresentar rankings.
- Calibração empírica dos juízes com exemplos de veredito conhecido. A lista curada atual é
  uma política operacional; não demonstra concordância com avaliação humana.
- Histórico de custo condicionado à task/workload: a guarda já conta todas as tasks, mas
  custo médio por agent/model pode não representar uma task muito maior.
- Retomada explícita de experimento interrompido, com validação de inputs e ownership.
  A persistência permite consulta; não equivale a reiniciar processos automaticamente.

O escopo mais recente está em [Plano da plataforma](PLANO_PLATAFORMA_2026-09-07.md), com
[prompt de continuidade](PROMPT_CLAUDE_PLATAFORMA.md). A auditoria anterior em
`PLANO_CORRECOES_2026-09-07.md` está concluída.

O runtime gerenciado atual aceita tasks Linux de serviço único e rede pública. Suporte a
Compose customizado/multisserviço e políticas de rede restrita precisa preservar ownership e
equivalência; atualmente esses casos são recusados. Smoke real em macOS/Linux ainda é pendente.

## 🔲 Licença (decisão do dono do repo, não técnica)

Ainda sem `LICENSE`. Ficou deliberadamente fora de escopo até agora ("uso corporativo interno,
sem expor a terceiros"). Se isso mudar (repo for aberto a terceiros, ou distribuído fora da
empresa), decidir entre MIT/Apache-2.0/proprietária e adicionar o arquivo — 5 minutos de
trabalho, mas é uma decisão de negócio, não algo pra um agente decidir sozinho.

## 🔲 Busca em listas simples (fora do checkboxGroup) — deliberadamente não implementado

O filtro de `checkboxGroup()` (já feito) cobre as listas de **seleção múltipla**. As listas
**simples** de cadastro (Models, Agents, Judges, etc. — renderizadas por `makeRow()` em
`gui/app/core.js`) não têm busca. **Decisão consciente de não fazer isso agora**: hoje há 9
models e 4 agents cadastrados nesta máquina — construir busca pra esse volume seria otimizar
pra um problema que não existe ainda, o que `AGENTS.md` pede pra evitar explicitamente
("no hypothetical future requirements"). Reabrir quando um time de verdade tiver 40-50+ items
cadastrados e sentir falta — não antes.

## Como verificar (se algo aqui for revisitado)

- Layout: `document.querySelector('#tab-compare .compare-layout')` deve existir e ter
  `getComputedStyle` com `display: grid`.
- Modo compacto: `localStorage.getItem('hek-compact-mode')`, e `document.body.classList` deve
  ter `compact` quando marcado.
- Acessibilidade: `document.querySelectorAll('input,select,textarea:not([type=hidden])').length`
  vs. `document.querySelectorAll('label[for]').length` — não precisam bater exatamente (grupos
  ficam sem `for` de propósito), mas o segundo número não deve cair.
- Tema claro: forçar via DevTools (Rendering → Emulate CSS media feature
  `prefers-color-scheme` → `light`) e conferir que nenhum elemento fica com fundo escuro
  "preso" (sinal de um `#0d0f13`/cor fixa nova que escapou de virar variável).
