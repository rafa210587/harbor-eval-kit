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

## Engineering standards (apply to every change)

Rationale and the real incident behind each rule: [`docs/ENGENHARIA.md`](docs/ENGENHARIA.md).

1. **Credentials**: never in the repo. Secrets live in `~/.harbor-eval-kit/secrets.env`, are
   passed to child processes via env vars only (never argv), and are never returned by an API
   or written to a log. `bash scripts/setup-hooks.sh` activates the pre-commit scanner that
   enforces this. Never bypass it with `--no-verify`; fix the pattern instead.
2. **Cross-platform**: every entry point ships `.sh` (bash — covers macOS, Linux and Git Bash on
   Windows) *and* `.ps1`, changed together. Never assume a Unix tool exists (`lsof`, `fuser`,
   `python` are absent on Git Bash). MSYS `kill` does not kill a native Windows process — use
   `taskkill //PID <pid> //F`. Branch on OS explicitly, in one place, and verify the *effect*
   rather than the exit code.
3. **Small files**: target ≤400 lines per module; one job per function. `scripts/gui-server.ts`
   and `gui/index.html` are already over that — known debt, not a pattern to extend.
4. **Decoupling**: `lib/` owns the domain, `gui-server.ts` only maps HTTP onto it, the HTML only
   renders. Extending a list (`PROVIDERS`, `JUDGE_MODELS`, `HARBOR_AGENTS`) must never require a
   new branch. One source of truth, server-side, exposed via an endpoint — never a second copy
   in the frontend.
5. **Tests with every feature**, in the same change: `bash scripts/test.sh`. Always test pure
   logic, every security guard, and every fixed bug. Never put API-spending or container-running
   work in the suite — validate that with a real run and record the numbers in the docs. Test
   the actual effect, not the printed output.
6. **Explanatory UI**: each tab says what it is, when to use it, when to skip. Dead ends must
   name the one missing step. Long operations lock their button, show elapsed time and stream a
   live log. Guardrails are explained and opt-out is labelled, never hidden.
7. **Observability**: execution state is read from disk (`result.json`), not from server memory,
   so it survives a restart and covers CLI-started runs. Show real error text. Cost/token
   numbers come from Harbor's own `result.json`, blank when unreported — never estimated. Never
   log a secret.
8. **Docs in the same commit**: `README.md`, `DOCUMENTACAO.md`, `docs/*` and the affected
   `Harbor_install/skills/*`. When an earlier caveat turns out to be wrong, correct that
   passage instead of appending a newer one elsewhere. Record what was *not* validated too.

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
