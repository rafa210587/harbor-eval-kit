---
name: harbor-eval-runner
description: Run model, agent or skill evaluations with the comparison kept fair and the metadata recorded. Use when asked to run a benchmark or comparison.
---

# Harbor Eval Runner

## Trigger

Use to run model, agent or skill evaluations.

## Before running

1. Run doctor.
2. Confirm secrets exist as environment variables without printing values.
3. Confirm the agent name against `harbor run --help` (the `--agent` option lists every
   accepted adapter). Do **not** use `harbor agent list` or `harbor agent schema <agent>` —
   verified 2026-09-06 on Harbor 0.22.0: there is no `harbor agent` command at all ("No such
   command 'agent'"), and `harbor adapter` only offers `init`/`review`, not a listing. There is
   no machine-readable adapter list; this kit mirrors it by hand in `HARBOR_AGENTS`
   (`scripts/lib/harbor.ts`, served at `GET /api/harbor-agents`) — re-check it when upgrading
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
