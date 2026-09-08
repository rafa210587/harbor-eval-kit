---
name: harbor-bootstrap
description: Install and configure Harbor Eval Kit on a Podman-only machine with minimal host mutation. Use when asked to install, bootstrap or set up Harbor.
---

# Harbor Bootstrap

## Trigger

Use when the user asks to install or configure Harbor Eval Kit.

## Goal

Bootstrap Harbor Framework on a Podman-only machine with minimal host mutation.

## Procedure

In Claude Code, `/harbor-setup` is the discoverable project entry point and loads this
runbook. See `docs/INSTALACAO_CLAUDE.md`. Prefer the repository's `harbor-eval` install
wrapper over issuing `uv tool install` directly: it snapshots dependencies, runs
doctor, records ownership and checks the isolated Harbor runtime. Steps below describe
the gates; do not repeat a successful mutable smoke without a new reason.

1. Read `AGENTS.md`.
2. Detect the OS first (`win32`/`darwin`/`linux` — e.g. `process.platform` in Node, `uname -s`
   in a POSIX shell, `$IsWindows`/`$IsMacOS`/`$IsLinux` in PowerShell 7+). Step 10 below
   branches on this — don't assume Windows just because that's where this kit was first built.
3. Run the doctor before changing anything.
4. Snapshot versions and paths of:
   - podman
   - python/python3
   - pip
   - uv
   - java/javac
   - mvn
   - gradle
   - node
   - npm
   - npx
5. Record preexisting tools in the installation manifest.
6. Never install Docker.
7. If `uv` is missing, install it user-level using the official installation route appropriate to the OS.
8. If usable Python is missing, install an isolated/user-level Python rather than replacing system Python.
9. Install Harbor using:
   `uv tool install harbor==0.22.0`
10. Validate:
    - `harbor --help`
    - `harbor run --help` as a candidate list, then the installed Harbor 0.22.0
      `AgentFactory` mapping as the runtime authority — help can include enum values that are
      not registered. There is no `harbor agent list`: verified 2026-09-06, that command does
      not exist, and `harbor adapter` only offers `init`/`review`.
    - `harbor dataset list` or the equivalent reported by `harbor --help`
11. Run the read-only connection gates before any container work:
    - `node scripts/installation.ts gate <manifest>`
    - this selects an explicit running machine/connection, proves the API identifies itself as
      Podman, and runs `podman compose version` with the resolved `DOCKER_HOST` scoped to that
      child only; it never requires Docker Engine. The Compose provider itself must be present
      and its `up --help` must expose `--wait` and `--pull`.
12. Run `node scripts/installation.ts smoke <manifest>`. This checks build, run, exec, a
    synthetic environment variable, two-way bind-mount I/O, volume, network, labels and
    verified cleanup. It requires the preexisting `docker.io/library/alpine:3.20` image and
    uses `--pull=never`; provision the base explicitly outside the smoke.
13. Validate Podman compatibility with Harbor by running an **actual minimal oracle task**
    before declaring success. The kit's managed environment adapter invokes Podman directly;
    it does not depend on `docker` being installed.
    **→ `Harbor_install/references/docker-host-por-so.md`** has the exact command and value per
    OS, the rules that hold on all three, and this kit's canonical implementation to reuse
    rather than re-derive.
14. Persist exact actions and versions, including which OS branch of step 11 was used and
    what the resolved Docker-compatible endpoint was (or that none could be resolved).

## Java / Node / Python policy

Do not globally install Java/Node merely because a benchmark needs them — prefer the task's own
container (Eclipse Temurin for Java, the official Node and Python images). Install a host
version only when the orchestration tooling itself requires it.

## Success criteria

Return READY only if:
- Harbor CLI works;
- Podman smoke tests pass;
- one Harbor task runs end-to-end;
- cleanup metadata exists.

## Implemented wrapper scope (2026-09-07)

Both install wrappers require Node.js 24+ and write/preserve the same dependency snapshot
before installation. They record Harbor only after successful installation and executable
discovery. After `uv tool install`, both add `uv tool dir --bin` only to the current process PATH
and prove Harbor 0.22.0 comes from the corresponding uv environment. A preexisting unsupported
Harbor is preserved and produces a clear gate failure. Bash also records uv if it installs it;
PowerShell requires uv to be provisioned.
The primitive smoke uses unique names, labels, manifest reservations and audited cleanup.
It requires an existing `docker.io/library/alpine:3.20` base image and uses `--pull=never` so
it cannot silently create an unowned upstream image. Its build also uses `--layers=false`,
`--force-rm` and the managed label. It proves synthetic env injection and host/container
bind-mount writes. Provision the base prerequisite explicitly.

Node and Python writers serialize manifest changes with the same `.runtime-lock`, reload after
acquiring it and replace the file atomically. A lock still present after 30 seconds blocks the
operation; inspect the owning process before treating it as abandoned.

The wrappers do not automatically execute an end-to-end Harbor task or declare READY.
Kit-installed uv is recorded but preserved by uninstall because its full upstream installer
footprint is not captured. Windows validation on 2026-09-07 covered the read-only gates,
primitive smoke and real oracle/nop tasks (reward 1/0). macOS/Linux still require real-host
validation before their branches can be declared ready.

Local runs go through `harbor_eval_kit.managed:ManagedPodmanEnvironment`. Current supported
scope is Harbor 0.22.0, Linux container, one `main` service, public network policy and a local
prebuilt image or Dockerfile whose base images already exist. Custom Compose/multiservice,
restricted networking, implicit pulls and images declaring anonymous volumes are blocked before
resource creation. Do not widen this scope from a logic test alone.
