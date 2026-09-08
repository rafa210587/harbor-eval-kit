# Tarefas — experimentos

Baseline retrospectiva **2026-09-08**. Caixas vazias são receita de reconstrução, não ausência da implementação atual.

## Fase 1 — Fundação

- [ ] T001 Concluir dependências 001/002 e ler constituição/spec/plan.
- [ ] T002 Definir DTOs, descoberta e overrides em `scripts/lib/experiment-plan.ts` (US1/US2, FR-001–004).

## Fase 2 — Stories

- [ ] T003 Implementar estimativa e guarda pré-voo em `scripts/lib/cost.ts` (US1, FR-005).
- [ ] T004 Implementar reserva exclusiva, snapshots e hashes em `scripts/lib/experiment-store.ts` (US2, FR-006).
- [ ] T005 Implementar runner e persistência de métricas em `scripts/lib/experiment-runner.ts` e `results.ts` (US2, FR-007).
- [ ] T006 Ligar `scripts/compare-matrix.ts` e `scripts/experiment-routes.ts` ao mesmo plano (US1, FR-001).
- [ ] T007 Implementar cancelamento e incerteza nas rotas, histórico em `gui/app/compare-history.js` (US3, FR-008).

## Fase 3 — Validação

- [ ] T008 Recriar testes de equivalência/overrides/snapshot/limites em `scripts/lib/experiment.test.ts` e `experiment-routes.test.ts` (SC-001/002).
- [ ] T009 Testar custo ausente, cancelamento e histórico nas suítes de cost, cancel-containers, experiment-logs e ui-compare (FR-005/007/008, SC-003).
- [ ] T010 Executar `scripts/test.ps1` ou `scripts/test.sh`.
- [ ] T011 Validar pela UI preview, dry-run, Oracle/Nop, histórico reaberto e logs; registrar runtime real separadamente.

## Fase 4 — Entrega

- [ ] T012 Atualizar README/DOCUMENTACAO com overrides, limite pré-voo e recuperação pós-reinício.
- [ ] T013 Revisar scanner/diff e preservar evidências sem segredos.

Ordem: T002 → T003/T004 → T005 → T006/T007 → validação → entrega. Testes podem ser escritos com fixtures após T002, mas integração exige o runner. Evidência atual e limitações estão no plano. Nenhuma tarefa executa AWS.
