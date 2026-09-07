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
    - `harbor run --help` (its `--agent` option enumerates every accepted adapter — there is
      no `harbor agent list`: verified 2026-09-06 on Harbor 0.22.0, that command does not
      exist, and `harbor adapter` only offers `init`/`review`)
    - `harbor dataset list` or the equivalent reported by `harbor --help`
11. Validate Podman compatibility with Harbor by running an **actual minimal task**, not just
    `podman info`, before declaring success. A task using `--env docker` needs Podman's
    Docker-compatible endpoint, and how you reach it differs per OS — the Docker CLI/SDK's own
    default never points at Podman on any of them.
    **→ `Harbor_install/references/docker-host-por-so.md`** has the exact command and value per
    OS, the rules that hold on all three, and this kit's canonical implementation to reuse
    rather than re-derive.
12. Persist exact actions and versions, including which OS branch of step 11 was used and
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
discovery. Bash also records uv if it installs it; PowerShell requires uv to be provisioned.
The primitive smoke uses unique names, labels, manifest reservations and audited cleanup.
It requires an existing `docker.io/library/alpine:3.20` base image and uses `--pull=never` so
it cannot silently create an unowned upstream image. Provision this prerequisite explicitly.

The wrappers do not automatically execute an end-to-end Harbor task or declare READY.
Kit-installed uv is recorded but preserved by uninstall because its full upstream installer
footprint is not captured. Tests are offline with fake tools; no real installation validated
these changes. Finish and record the remaining compatibility gate before claiming readiness.