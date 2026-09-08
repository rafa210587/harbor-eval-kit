---
name: harbor-result-analyzer
description: Compare and interpret Harbor job results, including when the optional LLM judge is worth running. Use when analyzing or comparing eval results.
---

# Harbor Result Analyzer

## Trigger

Use to compare Harbor job results.

Execute Analyze through the kit's GUI or `execHarbor`, which routes its internal wrapper
task through the managed Podman environment. In Harbor 0.22.0 the analyze CLI accepts an enum
only; `harbor_eval_kit.cli` validates and redirects that enum inside the subprocess without
modifying the installed package. Direct upstream `harbor analyze` bypasses this ownership
guarantee. The preexisting Python 3.13-slim image and the doctor gates are required.

## Analysis principles

Do not rank from pass rate alone.

Report when available:
- pass@1
- mean score
- compile/typecheck failure
- test failure
- timeout
- infra failure
- agent failure
- token usage
- cost
- wall time

## Skill efficacy

For skill ablation compute:

- absolute score delta
- relative score delta
- failure-mode changes
- cost delta
- latency delta

A skill is not automatically better if it raises score at disproportionate cost.

## Statistical caution

For small task counts, explicitly label conclusions as preliminary.

Prefer repeated trials when nondeterminism materially affects the benchmark.

## The judge (harbor analyze) is optional, and gated

The deterministic reward from `tests/test.sh` **is** the comparison. Only reach for the judge
to break a tie between candidates that all passed, or to audit whether a pass was earned or
reward-hacked.

Judge use is an explicit, paid operation. Before starting Analyze, freeze the selected judge,
rubric, validation mode and candidate batch; lock the action against duplicate clicks and record
the effective inputs. A judge configuration edit must preserve its selected model until the user
changes that model deliberately. Never read judge controls again while the batch is running.

The judge's model defaults to the curated list (`JUDGE_MODELS` in
`scripts/lib/catalog.ts`). This policy does not establish judge quality: calibrate against
known verdicts before using its ranking for a decision.
The `teste-live` pack explicitly includes DeepSeek V4 Pro and Claude Opus 5 in this
policy. Flash and inexpensive aliases still require validation mode. This is not
evidence of calibration or agreement between the judges.

Registering a Judge therefore needs the full chain:
Secret → a Model whose value is literally one of those ids →
Judge.

Give every call a fresh client-generated `operationId` UUID. The backend creates
`~/.harbor-eval-kit/operations/<id>/operation.json` and `operation.log` before `execHarbor`,
then `GET /api/operations/<id>?offset=N` returns incremental, already-redacted progress. It
passes the experiment's `--jobs-dir` and a deterministic
`--job-name harbor-eval-kit-analysis-<id-without-hyphens>` to Harbor, so the judge's own
`job.log`, `trial.log` and trajectory can be located while Analyze is still running.

In the standalone GUI, keep **Path do job ou trial a analisar** separate from **Pasta de
trabalho da análise**. The first is the existing input that the judge reads. The second is the
new invocation's `jobsDir`, defaults to `jobs`, and controls where the deterministic internal
job and its logs/report are written. Changing the workspace must not rewrite or relocate the
input target. Record and display both paths explicitly.

For a single source trial, Harbor copies `analysis.json` back into that trial and also writes
the canonical result there. Keep the deterministic invocation name for audit, but offer a Logs
shortcut only while `<jobsDir>/<harborJobName>` is a real directory. If that directory was
removed or is missing, hide the shortcut. The durable `operation.log` remains available
when no internal job exists. For a source job, inspect each trial's artifact and use the internal
report for the aggregate. Preserve `analysisBatchId`, batch index and batch size for every rubric
call; an incomplete batch cannot produce a score.
Resolve this canonical path from the invocation's input, jobs directory and deterministic job
name, never from terminal formatting. Exit zero without a valid canonical artifact is a failed
operation, not a successful null analysis.

**Validation mode.** To smoke-test that the analyze pipeline works at all without paying for a
high-tier model, `POST /api/analyze` accepts `validationMode: true`, which is also exposed as a
checkbox in the GUI (needed in two places: the Judges form, to even offer a non-curated model,
and the Analyze panel, to send the flag). Never treat a validation-mode verdict as an
evaluation — the response carries `validationMode: true` and the UI stamps it accordingly.
Without the explicit flag the gate refuses; never work around it by editing `JUDGE_MODELS`.

## Reading persisted comparisons

Read the experiment record under `<jobsDir>/.experiments/<id>/` and the corresponding Harbor
job artifacts. Verify the effective inputs/hashes before claiming candidates differ only in
one dimension. A Config bundle contains editable definitions, not a frozen run.

`scripts/lib/results.ts` preserves every Analyze trial in `results` and exposes `aggregate`.
Use `pass / (pass + fail)`; report N/A and unknown outcomes separately. No checks means unknown
pass rate. Never select only `results[0]`. `aggregate.costUsd` is available only when every
trial reports cost; `reportedCostUsd` may be a partial sum and must be labelled as such.
Preserve `validationMode`, judge model and rubric identity when presenting or exporting results.
Missing/malformed `result.json` is an error, not a successful evaluation with empty metrics.

History and exported JSON/CSV are persisted records of completed or active experiment state; they
do not promise automatic process resume after a server restart. Reopen the saved comparison and
inspect its result files. An active row without a confirmed Harbor process remains uncertain until
the process identity is verified.

Likewise, a persisted Analyze operation in `starting`/`running` that does not belong to the
current server process returns `executionUncertain: true`. Stop automatic polling, inspect its
operation log and Harbor job, and never resume it or kill a persisted PID automatically.

`harbor view` is a read-only inspector for local job logs, trajectories and analysis artifacts.
The kit accepts and exposes only an HTTP loopback URL from that process. Its process log and
lifecycle are observable through the same operation endpoint; do not treat opening the viewer
as another evaluation.
