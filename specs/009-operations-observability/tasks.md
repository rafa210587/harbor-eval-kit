# Tasks — operações e observabilidade

Checklist para reconstrução; itens abertos não afirmam ausência no produto atual.

## Fundação
- [ ] T001 Definir OperationRecord, LogTail e rotas da tabela do plano (FR-001/002).
- [ ] T002 Implementar validação UUID, fronteiras sem links, escrita exclusiva e
  atualização atômica; testar duplicação, traversal e registro inexistente (FR-002/004).
- [ ] T003 Implementar redator de streaming e writers por canal; fixtures devem
  partir segredo entre stdout chunks e conter valor JSON escapado (FR-006, SC-001).

## Stories
- [ ] T004 US1: criar log de candidato antes do spawn; persistir em diretório do
  experimento e validar pertença ao plano no endpoint de leitura (FR-001).
- [ ] T005 US3: implementar allowlist, ordenação por mtime, profundidade e descoberta
  de jobs da CLI; não deduzir sucesso de running=false (FR-004/005, SC-004).
- [ ] T006 US3: implementar tail em bytes, rotação, truncamento, overlap de segredo
  e retenção UTF-8; testar offsets arbitrários e append subsequente (FR-003, SC-001).
- [ ] T007 US2: persistir operação analyze/view antes da execução; integrar resultado,
  artefato e incerteza sem adoção de PID (FR-002/005, SC-002).
- [ ] T008 US4: implementar descoberta loopback, timeout de 8s e estados reais;
  stub de processo deve simular erro, URL tardia e exit não solicitado (FR-007).
- [ ] T009 US4: stop somente por handle pertencente ao servidor, confirmação em 2s,
  árvore Windows/Unix e 404 de desconhecido (SC-003).
- [ ] T010 US2/4: UI com elapsed, locks, polling 1s, descritores recuperáveis e links
  condicionais; testar recarga, resposta POST tardia e URL recusada (FR-008).

## Validação e entrega
- [ ] T011 Executar suítes operations, joblogs, experiment-logs, viewer-process e
  contratos de UI; depois gate completo `scripts/test.ps1` ou `scripts/test.sh`.
- [ ] T012 Em host provisionado, validar viewer start/stop real e Logs pela UI,
  incluindo restart; registrar OS/versões e efeito, sem modelo pago necessário.
- [ ] T013 Atualizar guia de logs/trajectórias e distinguir contratos atuais da
  dívida de uniformização de offsets/retomada de viewers. Não executar AWS.
- [ ] T014 US5: implementar GET status e cliente readGuiStatus com timeout1500ms,
  reconhecimento de forma e ausência de mutação; testar resposta estrangeira,
  indisponibilidade e health parcial sem confundir com identidade (FR-009).
- [ ] T015 US5: implementar CLI preflight/status/stop e launchers .sh/.ps1 pareados,
  Node24+, código20 idempotente, seleção Podman e ausência de start VM no Linux
  (FR-010, SC-005). Fazer antes do gate T011.
- [ ] T016 US5: implementar enumeração e prova script/porta, ambiguidade, stop por
  OS e confirmação20x100ms; fixtures devem preservar clone estrangeiro e testar
  processo que resiste à parada (FR-010, SC-005). Incluir gui-lifecycle.test.ts no gate.
- [ ] T017 Em hosts provisionados, registrar status/start/stop real do servidor
  nos três OS e verificar efeito sobre PID; não declarar isso validado apenas
  por fixtures ou CI offline, e não encerrar jobs/viewers de terceiros.
