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
known verdicts before using its ranking for a decision. Registering a Judge
therefore needs the full chain: Secret → a Model whose value is literally one of those ids →
Judge.

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
