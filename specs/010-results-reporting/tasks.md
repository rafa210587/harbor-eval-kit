# Tasks — resultados e relatórios

Checklist de reconstrução, sem afirmar execução histórica do workflow SDD.

## Fundação
- [ ] T001 Definir ResultRow, entradas Harbor e matriz de mensagens/ausências do
  plano; manter dependências 003/004 e separação do catálogo 002.
- [ ] T002 US1: implementar parseResult com prioridade de erros; testar ausência,
  JSON inválido, n_total_trials inconsistente, cancelamento e zero trials (FR-001).
- [ ] T003 US1: ponderar grupos por n_trials, preservar billing ausente e zero real;
  fixture 1x0 + 3x1 deve resultar 0,75 (FR-002, SC-001).

## Julgamento
- [ ] T004 US2: normalizar objeto único e resultados múltiplos sem perder metadados;
  implementar pass/fail/N/A/unknown e incompletude por trial (FR-003, SC-002).
- [ ] T005 US2: implementar custo parcial/completo e fallback documentado; testar
  zero, ausência, custo inválido e reportedCostUsd (FR-005, SC-003).
- [ ] T006 US2: selecionar último lote, validar completude e excluir validationMode
  do score; testar lote anterior, índice duplicado e lote faltante (FR-004).
- [ ] T007 US2: resolver artefatos distintos de trial/job; fixture com stdout
  enganoso e analysis.json antigo não deve alterar escolha (FR-006).

## Exportação
- [ ] T008 US3: definir colunas fixas e escaping CSV; testar aspas, linhas, strings
  de fórmula e números negativos com resultado esperado independente (FR-007).
- [ ] T009 US3: implementar guarda recursiva de conteúdo, valores secretos reais e
  escapados, campos/arquivos proibidos, padrões e ciclos; erro nunca revela valor
  ofensivo (FR-008, SC-004).
- [ ] T010 US3: integrar relatório HTTP e CLI; em teste provar zero headers/bytes
  e nenhum dos dois arquivos criado quando guarda recusa (FR-008).

## Validação e entrega
- [ ] T011 Rodar results/export-safety/export-route-security/experiment-routes e
  gate completo `scripts/test.ps1` ou `scripts/test.sh` com fixtures sintéticas.
- [ ] T012 Validar UI de métricas e download usando resultados sintéticos, conferindo
  em JSON/CSV ausência, zero e valores parciais; modelo pago não é necessário.
- [ ] T013 Atualizar guias de interpretação e limitações: custo negativo no parser,
  ausência de cobertura dos grupos, formato de finished_at e validação do batch
  delegada à API. Propor endurecimento separado sem inventar comportamento atual.
- [ ] T014 Registrar evidência executada versus pendência; manter AWS só documental
  e não incluir credenciais ou artefatos reais privados nos fixtures.
