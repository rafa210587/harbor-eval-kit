# Tarefas — julgamento e observabilidade

Baseline retrospectiva **2026-09-08**. Checklist vazio para reconstrução; evidência atual não marca tarefas automaticamente.

## Fundação

- [ ] T001 Concluir dependências 002/003 e ler spec/plan/constituição.
- [ ] T002 Implementar entidades, defaults e pins em `scripts/lib/types.ts`, `paths.ts` e `gui/app/judging.js` (US1, FR-001).

## Stories

- [ ] T003 Implementar critérios/TOML e sessão congelada em `scripts/lib/materialize.ts` e `analysis-session.ts` (US2, FR-002/003).
- [ ] T004 Implementar política e validationMode em `scripts/lib/catalog.ts` e `scripts/gui-server.ts` (US2, FR-004).
- [ ] T005 Implementar normalização conservadora em `scripts/lib/results.ts` (US3, FR-005/006).
- [ ] T006 Implementar estado/log redigido em `scripts/lib/operations.ts` e `gui/app/operation-live.js` (US3, FR-007).
- [ ] T007 Integrar destinos reais em `scripts/lib/joblogs.ts` e `viewer-process.ts` (US3, FR-008).

## Validação

- [ ] T008 Testar sessão imutável/defaults/política em `analysis-session.test.ts` e `ui-compare.test.ts` (SC-001).
- [ ] T009 Testar incompletude, custos parciais, redaction e reinício nas suítes results/operations/joblogs/viewer-process (SC-002/003).
- [ ] T010 Executar `scripts/test.ps1` ou `scripts/test.sh`.
- [ ] T011 Validar monitor e links reais pela UI; executar juiz pago somente com autorização e registrar custo reportado separadamente.

## Entrega

- [ ] T012 Atualizar DOCUMENTACAO, README e `Harbor_install/skills/harbor-result-analyzer/SKILL.md`.
- [ ] T013 Revisar scanner/diff e registrar validações pendentes.
- [ ] T014 Implementar e testar [contracts.md](contracts.md): conflitos de sessão, default explícito, UUID/batch, lock ancestral/descendente, timeout e exit0 sem artefato, com executor fake sem gasto (FR-001/003/004/007).

Ordem: entidades → sessão/política → normalização/observabilidade → integração → entrega. T005/T006 podem ser desenvolvidas em arquivos separados após contrato definido. Nenhuma tarefa executa AWS.
