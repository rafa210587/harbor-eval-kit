# Tarefas — demo teste-live

Baseline retrospectiva **2026-09-08**. Checklist vazio para reconstrução; evidências do código atual ficam no plano/guia, separadas das caixas.

## Fundação

- [ ] T001 Concluir dependências 001–005 e ler constituição/spec/plan.
- [ ] T002 Escrever contratos/limites em instruction.md das três pastas `evals/python/*-teste-live` (US2, FR-001/002).

## Stories

- [ ] T003 Implementar Dockerfiles, stubs, oracles e verificadores isolados nas três tasks (US2, FR-003).
- [ ] T004 Criar 23 registros com IDs estáveis em `config/teste-live/catalogo-teste-live.json` (US1/US3, FR-004/005).
- [ ] T005 Escrever critérios, rubrica e prompts dos dois juízes no bundle (US3, FR-006).
- [ ] T006 Criar mapa de pins e instruções em `config/teste-live/vinculos-tasks-teste-live.json` e `docs/TESTE_LIVE.md` (US1, FR-007).

## Validação

- [ ] T007 Executar tests/test_outputs.py de cada task separadamente contra oracle e stub; registrar resultados sem confundir com reward real (SC-001).
- [ ] T008 Implementar/reexecutar `scripts/lib/live-config.test.ts` para referências, reimport, planos, ablação e juízes (SC-002/003).
- [ ] T009 Executar `scripts/test.ps1` ou `scripts/test.sh`.
- [ ] T010 Importar pela UI/API autorizada, aplicar pins e reler todas as entidades; sem copiar credenciais (US1, FR-007).
- [ ] T011 Validar dry-run e Oracle/Nop real, coletando reward/solution.py/cleanup (US2, FR-008).
- [ ] T012 Executar comparação e dois juízes somente quando autorizados; registrar custos, artefatos e discordâncias (US3, FR-008).

## Entrega

- [ ] T013 Atualizar README e `docs/TESTE_LIVE.md` com o que passou e o que não foi validado; revisar scanner/diff.

Ordem: contratos → implementação/catalogação → offline → import → smoke → pago autorizado → documentação final. T004/T005 dependem dos tipos da feature002; T012 depende de T011. Não concluir T012 com evidência offline. Nenhuma tarefa executa AWS.
