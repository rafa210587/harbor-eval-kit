# Plano — experimentos

Baseline retrospectiva **2026-09-08**. Depende de `001-local-runtime` e `002-catalog-security`.

## Arquitetura

`scripts/lib/experiment-plan.ts` não escreve nem inicia subprocessos. `experiment-store.ts` reserva ID, congela inputs e persiste registros. `experiment-runner.ts` coordena Harbor/RunControl. `scripts/compare-matrix.ts` e `scripts/experiment-routes.ts` adaptam CLI/HTTP ao mesmo domínio. `cost.ts` usa histórico; `results.ts` lê artefatos. Frontend divide compare-domain/live/history/render.

## Contratos e precedência

POST `/api/compare/estimate` recebe path, jobsDir opcional, jobPrefix, runId, nAttempts, concurrency, dryRun, env, extra, title, description, baselineIndex e entries. Cada entry contém agentId, modelId opcional e skillsetIds opcional. Retorna estimativa, nTasks e plan.

- modelId omitido herda agent.modelId; string vazia seleciona default do Harbor.
- skillsetIds omitido herda defaultSkillsetIds; [] remove conjuntos desse candidato.
- Skills são deduplicadas por ID; agent.instructions não vazio adiciona skill authored própria.
- Defaults: jobsDir=jobs, prefix=cmp, nAttempts=1, concurrency=1, dryRun=false, env=docker (Podman). baselineIndex é zero-based e deve apontar candidato existente.
- extra permite --timeout-multiplier, --ak e --agent-kwarg; não permite sobrescrever dimensões do plano ou inserir credenciais, inclusive JSON aninhado.
- title até 120 caracteres e description até 1000.

POST `/api/compare` usa mesmo corpo e costCapUsd/acknowledgeCost. POST `/api/compare/cancel` recebe runId; run fora deste servidor retorna 404. GET `/api/experiments` e `/api/experiments/:id` usam jobsDir na query. GET `/api/experiments/:id/report?format=json|csv` aplica export safety antes da resposta.

## Persistência e estados

ExperimentPlan v1: id, createdAt, taskPath/tasks, jobsDir, nAttempts, concurrency, dryRun, env, extra, candidates e metadados opcionais. Candidate: id, label, profileId, agent, model, skills, skillset, jobName.

ExperimentRecord: plan, status prepared/running/finished/cancelled/failed, nodeVersion, testedHarborVersion, harborVersion opcional, inputs(path,sha256), rows, analyses, finishedAt/error opcionais. Local: `jobsDir/.experiments/<id>/experiment.json` e inputs associados. Escrita usa arquivo temporário/rename; ID é reservado exclusivamente. Histórico deriva resultados do disco; canCancel depende de handle ativo; running sem handle é executionUncertain.

## Implementação e verificação

Ordem: planner → snapshot/store → runner → adapters CLI/HTTP → histórico/UI. Testes existentes sob `scripts/lib`: `experiment.test.ts`, `experiment-routes.test.ts`, `cost.test.ts`, `cancel-containers.test.ts`, `experiment-logs.test.ts`, `ui-compare.test.ts`.

Executar `scripts/test.ps1` ou `scripts/test.sh`. Validar dry-run sem chamadas e, separadamente, Oracle/Nop em runtime real antes de provedores pagos. Não colocar execução de containers ou API paga na suíte offline.

## Evidência e limites

Evidência offline desta entrega está registrada no índice SDD; validação real de runtime é separada. Snapshot não congela pesos do provider. Guarda de custo é pré-voo, não monitor em tempo real. Cancelamento de container é melhor esforço e exige propriedade comprovada; reinício conserva observação, não controle de processo anterior.

Constitution check: equivalência de benchmark, métricas reais, segredos redigidos, Podman exclusivo, domínio desacoplado, testes/docs. AWS fora da execução.
