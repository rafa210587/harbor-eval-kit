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

## Rules

1. Tests must grade the requirement, not implementation trivia.
2. Prevent obvious hardcoding.
3. Include hidden or adversarial cases where useful.
4. Separate compile/type/lint/test signals.
5. Keep tasks agent-neutral.
6. Keep skill-ablation tasks identical across runs.
7. Pin base image versions.
8. Avoid network dependency during scoring when possible.

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
