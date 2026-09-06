# Harbor Eval Kit - Agent Instructions

The user's explicit request has priority over this file.

## Mission

Operate Harbor-based coding evaluations safely and reproducibly with Podman-only local container infrastructure.

## Global invariants

1. Never install Docker.
2. Never claim Podman compatibility before the doctor smoke tests pass.
3. Never delete preexisting Java, Python, Node, npm, Maven, Gradle, uv, Podman, containers, images, networks or volumes.
4. Every created container/image/network/volume must use:
   - prefix: `harbor-eval-kit-`
   - label: `io.harbor-eval-kit.managed=true`
5. Never log secrets.
6. Prefer containerized language toolchains for benchmark tasks.
7. Preserve benchmark equivalence when comparing models, agents or skills.
8. Before destructive cleanup, inspect the installation manifest.
9. `uninstall --dry-run` must show the exact intended deletion set.
10. Abort destructive cleanup if ownership is ambiguous.

## Orchestration

Role definitions live under `Harbor_install/agents/` (moved out of the project root to avoid
colliding with the GUI's own unrelated "Agents" tab — agent *profiles for evals*, a different
concept, stored under `~/.harbor-eval-kit/`).

Use specialized agents/roles when useful:

- environment-doctor
- harbor-installer
- eval-designer
- eval-runner
- result-analyzer
- cleanup-guardian

For simple operations, execute directly instead of creating unnecessary subagents.

## Required install sequence

1. doctor host
2. snapshot preexisting dependencies
3. validate Podman
4. validate Docker-compatible interface required by Harbor
5. install missing user-level bootstrap dependencies
6. install Harbor
7. run Harbor CLI smoke tests
8. create/run one tiny Harbor task
9. persist manifest
10. declare READY only after success

## Required uninstall sequence

1. load manifest
2. discover managed resources by exact labels/prefixes
3. compare discovery with manifest
4. show dry-run plan
5. remove Harbor Eval Kit resources
6. remove dependencies installed_by_kit only
7. preserve all preexisting dependencies
8. leave manifest with uninstall audit unless user requests its deletion
