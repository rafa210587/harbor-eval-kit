# Tarefas — catálogos e segurança

Baseline retrospectiva **2026-09-08**. Checklist vazio de reconstrução; código existente é referência, não tarefa automaticamente concluída.

## Fase 1 — Fundação

- [ ] T001 Ler constituição, AGENTS.md e spec/plan; preparar estado temporário isolado.
- [ ] T002 Definir entidades e IDs em `scripts/lib/types.ts` e `registry-validation.ts` (US1, FR-001/002).

## Fase 2 — Stories

- [ ] T003 Implementar paths seguros e CRUD em `scripts/lib/paths.ts` e `registry-service.ts` (US1, FR-002/008).
- [ ] T004 Implementar validação de extraFiles em `registry-validation.ts` e snapshot de skills em `experiment-store.ts`, ambos sob scripts/lib (US1, FR-003; contrato 003).
- [ ] T005 Implementar secrets privados e redaction em `scripts/lib/secrets.ts` e `exec.ts` (US3, FR-007).
- [ ] T006 Implementar gate compartilhado em `scripts/lib/export-safety.ts` e rotas de relatório (US2, FR-005).
- [ ] T007 Implementar bundle e input da GUI em `scripts/lib/bundle.ts` e `gui/app/config-bundle.js` (US2, FR-004/006).
- [ ] T008 Implementar guardas HTTP em `scripts/lib/httpguard.ts` e `http-body.ts` (US3, FR-008).
- [ ] T014 Implementar descoberta/teste explícito em `scripts/lib/provider-probe.ts` e `scripts/python/probe_provider.py`, com testes `provider-probe.test.ts` e `provider-domain.test.ts` (US4, FR-009).
- [ ] T015 Implementar gateway opcional e isolamento de chave em `scripts/lib/litellm.ts` e `litellm.test.ts`; manter OFF e testar rejeição de env de infraestrutura (US4, FR-010).

## Fase 3 — Validação

- [ ] T009 Recriar testes de referências, upsert, traversal, payloads inválidos e segredos sintéticos nas suítes listadas em plan.md (US1–US3, FR-001–008).
- [ ] T010 Executar gate completo `scripts/test.ps1` ou `scripts/test.sh`.
- [ ] T011 Validar pela GUI export seguro, import repetido e erro visível com arquivo inválido (SC-001/002).

## Fase 4 — Entrega

- [ ] T012 Atualizar README/DOCUMENTACAO com escopo real do bundle e instrução de credenciais locais.
- [ ] T013 Revisar scanner e diff antes da publicação (SC-003).

Ordem: fundação → armazenamento/segurança → consumidores → validação → entrega. T005 precede T006; T006 precede export em T007. Evidências e limitações atuais estão no plano; não inserir segredos reais nos testes. Nenhuma tarefa executa AWS.
