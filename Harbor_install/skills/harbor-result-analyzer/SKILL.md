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
