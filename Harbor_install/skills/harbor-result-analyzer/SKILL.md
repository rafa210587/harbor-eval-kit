# Harbor Result Analyzer

## Trigger

Use to compare Harbor job results.

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

The judge's model is restricted to the curated high-tier list (`JUDGE_MODELS` in
`scripts/lib/harbor.ts`) — a cheap judge defeats the purpose of judging. Registering a Judge
therefore needs the full chain: Secret → a Model whose value is literally one of those ids →
Judge.

**Validation mode.** To smoke-test that the analyze pipeline works at all without paying for a
high-tier model, `POST /api/analyze` accepts `validationMode: true`, which is also exposed as a
checkbox in the GUI (needed in two places: the Judges form, to even offer a non-curated model,
and the Analyze panel, to send the flag). Never treat a validation-mode verdict as an
evaluation — the response carries `validationMode: true` and the UI stamps it accordingly.
Without the explicit flag the gate refuses; never work around it by editing `JUDGE_MODELS`.
