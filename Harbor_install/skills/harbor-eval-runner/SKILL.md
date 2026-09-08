---
name: harbor-eval-runner
description: Run model, agent or skill evaluations with the comparison kept fair and the metadata recorded. Use when asked to run a benchmark or comparison.
---

# Harbor Eval Runner

## Trigger

Use to run model, agent or skill evaluations.

## Before running

1. Run doctor.
2. Confirm required secret names exist in `~/.harbor-eval-kit/secrets.env` without printing
   values. GUI and matrix CLI load them into child environments only; never pass them in argv.
3. Confirm the agent name against `harbor run --help` (the `--agent` option lists every
   accepted adapter). Do **not** use `harbor agent list` or `harbor agent schema <agent>` —
   verified 2026-09-06 on Harbor 0.22.0: there is no `harbor agent` command at all ("No such
   command 'agent'"), and `harbor adapter` only offers `init`/`review`, not a listing. There is
   no machine-readable adapter list; this kit mirrors it by hand in `HARBOR_AGENTS`
   (`scripts/lib/catalog.ts`, re-exported by `scripts/lib/harbor.ts` and served at
   `GET /api/harbor-agents`) — re-check it when upgrading
   Harbor.
4. **Match the adapter to the model.** Only the model-agnostic (LiteLLM-backed) adapters —
   `mini-swe-agent`, `terminus`, `aider`, `opencode`, `openhands`, `swe-agent`, `goose`,
   `langgraph`, … — accept an arbitrary `provider/model`. A vendor CLI adapter (`claude-code`,
   `codex`, `gemini-cli`, …) speaks its own vendor's API, so it is the wrong choice for a
   model-vs-model comparison across providers. `HARBOR_AGENTS` carries a `modelAgnostic` flag
   for exactly this.
5. Pin dataset/task revision.
6. Record skill digest/provenance.
7. Record Harbor version and environment details.

## UI path: Começar e Novo experimento

Use **Começar** for the first guided setup: choose the evaluation goal, task or dataset, candidates,
and execution environment. Use **Novo experimento** after the catalogs exist to create a saved plan
with the same choices, then review it before running. The UI and CLI share the same plan domain;
a preview is required before a real run.

## Planning and reproducibility

For the first real task use `evals/python/soma-fracoes`; `seed-task` folders are empty stubs.
GUI and CLI share experiment planning. Preview the full task × attempt × candidate volume,
including every task discovered in a dataset. Unknown historical cost is not zero cost.
Extra args support only `--ak`/`--agent-kwarg` and `--timeout-multiplier`; do not try to override
the task/model/count/job plan through extras. The matrix executor rejects `--interactive`.

The preview must show the effective task and dataset count, attempts, each candidate's agent,
model, effective skills, baseline marker, and experiment metadata that will be persisted. Check
that a baseline is explicit and candidates differ only in the intended dimension.

Every execution and candidate receives a new identity. Reusing a Job prefix does not reuse
results. Records in `<jobsDir>/.experiments/<id>/` retain the effective plan, input snapshots
and hashes, results and attached analyses. Preserve these alongside Harbor job artifacts.
Snapshots isolate local task/skill input; they do not freeze external providers or image tags.
There is no automatic resume after server restart. Reopen saved comparisons in the GUI.

When the managed Harbor runtime is selected, the supported contract is Harbor `0.22.0`, one Linux
`main` container with public network policy. Base images must already exist locally; implicit
pulls are refused. Containers, images and networks created by the extension must have exact
manifest ownership, the `harbor-eval-kit-` prefix and `io.harbor-eval-kit.managed=true`.
Compose/multiservice tasks and restricted network policies are rejected before resource creation.

## Watching a run in progress

`harbor run` writes its logs into the jobs dir as it goes. To follow one without blocking on
the process, read `<jobsDir>/<job>/job.log` and `<jobsDir>/<job>/<trial>/trial.log` directly,
or use the GUI's read-only routes: `GET /api/logs/jobs` (job dirs, with a `running` flag taken
from each `result.json`'s `finished_at`), `GET /api/logs/files`, `GET /api/logs/tail`
(incremental by byte offset). A job's completion is `finished_at != null` in its `result.json`
— poll that rather than guessing from elapsed time.

## Comparisons

### Model comparison
Same:
- agent
- task
- skill
- resources
- timeout

Change:
- model

### Agent comparison
Same:
- model family where meaningful
- task
- skill

Change:
- agent

### Skill ablation
Same:
- model
- agent
- task

Change:
- skill absent/present

Freeze the candidate matrix, judge, rubric and validation mode when a batch starts. Lock the run
button and judge controls so a double click or an edit during execution cannot create a second
request or change the inputs halfway through the batch. Editing a saved judge must retain its
selected model unless the user explicitly changes it; validation-only judges remain marked as
validation and are not evidence of model quality.

## Required result metadata

- timestamp
- git commit / dataset digest
- task id
- agent
- model
- skills
- Harbor version
- success
- test score
- duration
- token/cost metrics when Harbor exposes them
- failure category
