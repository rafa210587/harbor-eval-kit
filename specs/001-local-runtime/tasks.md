# Tarefas de reconstrução — runtime local

Baseline retrospectiva **2026-09-08**. Todas as caixas começam vazias para reconstruir em outra instalação; não significam que o código atual está ausente. IDs são locais à feature.

## Fase 1 — Fundação

- [ ] T001 Ler AGENTS.md, constituição e spec/plan desta pasta; registrar SO e versões.
- [ ] T002 Modelar manifesto e snapshot exclusivo em `scripts/lib/installation.ts` (US1, FR-001).

## Fase 2 — Stories

- [ ] T003 Implementar instalação isolada e resolução de executáveis nos dois `scripts/harbor-eval.{sh,ps1}` (US1, FR-002/008).
- [ ] T004 Implementar conexão e gates em `scripts/lib/podman.ts` e `scripts/installation.ts` (US2, FR-003).
- [ ] T005 Implementar ownership no adapter Python e smoke em `scripts/lib/podman-smoke.ts` (US2, FR-004/006).
- [ ] T006 Exigir Oracle real e gates completos antes de READY nos wrappers e skill bootstrap (US2, FR-005).
- [ ] T007 Implementar plano/verificação de cleanup em `scripts/lib/cleanup.ts` (US3, FR-007).

## Fase 3 — Validação

- [ ] T008 Recriar casos adversariais em `installation.test.ts`, `podman.test.ts`, `managed-runtime.test.ts`, `cleanup.test.ts` e `portability.test.ts`, sob `scripts/lib` (US1–US3, FR-001–008).
- [ ] T009 Executar `scripts/test.ps1` ou `scripts/test.sh`, sem chamadas pagas ou containers na suíte offline.
- [ ] T010 Executar gates, smoke e Oracle no host alvo; registrar efeitos e recursos preservados (SC-001–003).

## Fase 4 — Entrega

- [ ] T011 Atualizar README, DOCUMENTACAO e skill bootstrap com comandos efetivamente validados.
- [ ] T012 Revisar diff e scanner de credenciais antes de publicar.

Ordem: T001 → T002 → T003/T004 → T005/T006/T007 → validação → entrega. T007 depende da propriedade definida em T005. Evidência atual e limitações estão no plano; caixas só devem ser marcadas após reconstrução e teste no novo ambiente. Nenhuma tarefa executa AWS.
