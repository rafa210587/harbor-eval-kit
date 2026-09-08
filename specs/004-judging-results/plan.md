# Plano — julgamento e observabilidade

Baseline retrospectiva **2026-09-08**. Depende de 002 para catálogo e 003 para resultados congelados.

## Arquitetura

`scripts/lib/analysis-session.ts` grava sessão e prompt/rubricas; `materialize.ts` resolve criterionIds e TOML. `analysis-inputs.ts` congela arquivos de invocações e `analysis-lock.ts` controla exclusão. `operations.ts` grava estado/log. `results.ts` normaliza artefatos. Frontend separa `gui/app/judging.js`, `analysis-view.js`, `operation-live.js`, `logs.js` e `viewer-live.js`.

## Entidades e contratos

JudgeEntry: id, label, agentValue, modelId opcional, promptTemplate opcional, defaultRubricIds e notes. Modelo deve resolver ModelEntry.value. Prompt admite `{trial_path}`, `{task_section}`, `{criteria_guidance}`. RubricEntry referencia criterionIds; critérios possuem name, description, guidance.

AnalysisSession v1: id, createdAt, judgeId, judgeModel, agent, validationMode, prompt (string/null), rubrics [{id,content(string/null)}]. Input exige judgeId; rubricIds deve ser lista não vazia/sem duplicações, e omissão no domínio usa [__default__]. A UI resolve defaults do perfil antes de enviar; não presumir herança adicional invisível na API. validationMode omitido significa false. Política curada aplica-se quando false.

Sessões ficam em `~/.harbor-eval-kit/analysis-sessions/<id>/session.json`, `prompt.txt` e `rubric-<index>.toml`. Arquivos usam criação exclusiva. Sessão reutilizada não consulta conteúdos novos do catálogo.

OperationRecord v1: UUID, type analyze/view, status starting/running/succeeded/failed, createdAt/updatedAt/finishedAt, targetPath, jobsDir, harborJobName, artifactPath, error/result opcionais. Estado e log ficam em `~/.harbor-eval-kit/operations/<id>/operation.json` e `operation.log`. Leitura incremental usa offset; resposta inclui caminhos e hasHarborJob. running/starting sem handle ativo é execução incerta.

- GET/POST `/api/tasks/rubric-default`: path local, judgeId e rubricIds. Há um juiz padrão por task; pins não integram config bundle.
- POST `/api/analyze`: análise com input validado; GET `/api/operations/:id`: estado/progresso.
- GET `/api/logs/jobs`, `/api/logs/files`, `/api/logs/tail`: descoberta e tail de logs permitidos.

## Normalização

`results.ts` exige contagens e término coerentes em result.json. Em analysis.json preserva dados por trial, conta pass/fail/not_applicable/unknown e incompleteTrials. passRate só existe com outcomes conhecidos e análises completas; denominador é pass+fail. Custo completo requer valor reportado por todos os trials; reportado parcial permanece separado. Artifact de trial pode ser `<trial>/analysis.json`; de job, `<jobsDir>/<jobName>/analysis.json`.

## Verificação e limites

Suítes em scripts/lib: `analysis-session.test.ts`, `analysis-lock.test.ts`, `results.test.ts`, `operations.test.ts`, `joblogs.test.ts`, `viewer-process.test.ts`, `ui-compare.test.ts`. Gate `scripts/test.ps1` ou `scripts/test.sh`. Evidência offline da entrega deve ser consultada no índice SDD; smoke/julgamento real são separados.

Não há calibração automática, votação entre juízes ou skills injetadas em analyze. Trajetórias dependem do adapter e viewer disponível. Incerteza após reinício não autoriza adotar processo órfão. Constituição: evidência real, redaction, inputs congelados e Podman; AWS somente documental.
