---
name: harbor-eval-designer
description: Design or refine a coding benchmark task (instruction, environment, tests, reference solution). Use when creating or improving an eval task.
---

# Harbor Eval Designer

## Trigger

Use to create or refine coding benchmarks.

## Required benchmark dimensions

Languages:
- Java
- TypeScript
- Python

Task families:
- bugfix
- feature
- refactor
- tests
- code review / repair
- architecture or codebase reasoning when objectively gradable

## Benchmark construction

Each Harbor task should contain, as supported by the installed Harbor version:
- instruction.md
- task.toml
- environment/Dockerfile
- tests/test.sh
- solution/solve.sh when appropriate

**→ `references/exemplo-completo.md`** — a complete worked example (the repo's own
`evals/python/soma-fracoes`, validated by a real run at reward 1.0), file by file, plus the
zero-cost `oracle`/`nop` validation cycle that catches a broken task before any API is spent.
Load it when you want a concrete model rather than the rules below.

Treat a new verifier as failing by default until the task is exercised: run the real task with
`oracle` and require reward `1.0`, then with `nop` and require reward `0.0`. `oracle` applies the
task's `solution/solve.sh`; `nop` changes nothing. A stub test that passes without checking the
requested behavior must fail explicitly rather than approving the task. This cycle is a contract
test and does not spend model API calls.

## Rules

1. Tests must grade the requirement, not implementation trivia.
2. Prevent obvious hardcoding.
3. Include hidden or adversarial cases where useful.
4. Separate compile/type/lint/test signals.
5. Keep tasks agent-neutral.
6. Keep skill-ablation tasks identical across runs.
7. Pin base image versions.
8. Avoid network dependency during scoring when possible.
9. Keep the runtime contract visible in the task design: the managed extension supports Harbor
   `0.22.0`, a single Linux `main` container with public network policy, and preexisting local
   base images. It refuses implicit pulls, multiservice Compose and restricted network policies.
   Resources created during a run must be recorded in the exact installation manifest and use
   the kit prefix and label.

## Language baselines

Java:
- Java 21+
- Maven or Gradle wrapper
- JUnit 5

TypeScript:
- Node LTS
- npm
- tsc
- Vitest/Jest

Python:
- Python 3.12+
- pytest
- ruff

## Repository / PR mode (spec 013)

Read `docs/REPOSITORIOS_E_HARNESSES.md` from the repository root before configuring
this optional mode. Keep the standard doctor/install sequence. Tasks has a collapsed
repository/spec/merged-PR wizard; Agents has reusable CLI integrations. Credentials
for Git acquisition stay on the host, separate from inference bindings. Both API
and native CLI identity require trusted source code; do not promise a broker or
adversarial credential isolation. Check the server capability catalog: unsupported
native adapters must remain blocked. Do not enable LiteLLM or provision AWS implicitly.

Calibrate the historical base and reference with deterministic checks before running
candidates. The judge receives only the two diffs as code plus selected requirements,
rubric and sanitized check results. Never use raw upstream Analyze on the original
repository trial to bypass this evidence boundary. Failed checks block paid judging
unless the user selects the diagnostic override. The guide also provides the manual
fallback, local recipe import/export and the actual validation limits.
