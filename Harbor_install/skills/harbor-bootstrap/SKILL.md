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
   `uv tool install harbor`
10. Validate:
    - `harbor --help`
    - `harbor agent list`
    - `harbor dataset list` or the equivalent reported by `harbor --help`
11. Validate Podman compatibility with Harbor using an actual minimal task before declaring
    success. If the task needs `--env docker` (Harbor's backend is Docker-oriented), Podman's
    Docker-compatible endpoint must be reachable, and how you reach it depends on the OS
    detected in step 2 — never assume the Docker CLI/SDK's own default is already pointed at
    Podman:
    - **Windows**: the Docker CLI/SDK default targets Docker Desktop's pipe even when it's
      stopped. Podman machine exposes a separate, fixed named pipe for Docker-CLI/SDK
      compatibility: `npipe:////./pipe/docker_engine` (this is a well-known fixed name, not
      derived from the machine's own name — `podman machine inspect` reports a *different*,
      machine-name-dependent pipe for its native API, which is not the one to use here).
    - **macOS**: Podman always runs inside a VM ("podman machine"). Get its Docker-compatible
      socket path with `podman machine inspect --format '{{.ConnectionInfo.PodmanSocket.Path}}'`
      and use `unix://<that path>`.
    - **Linux**: rootless Podman normally exposes its API socket directly (no VM) at the path
      reported by `podman info --format '{{.Host.RemoteSocket.Path}}'` — that same socket
      already speaks the Docker-compatible dialect, use it as-is. If a Podman machine is
      active instead (check `podman machine list --format json` for a running one — uncommon
      on Linux but supported), use the same machine-inspect approach as macOS.
    - Inject the resolved value as `DOCKER_HOST` **scoped to the single `harbor`/`podman`
      child process being validated** — never export it into the user's shell or write it to
      a profile file. This kit's own implementation of exactly this logic (canonical
      reference, kept in sync across three languages) lives in
      `scripts/lib/harbor.ts` (`resolvePodmanDockerHost`), `scripts/harbor-eval.ps1`
      (`Resolve-PodmanDockerHost`), and `scripts/harbor-eval.sh`
      (`resolve_podman_docker_host`) — reuse those instead of re-deriving this by hand when
      the install happens to be *for* this kit.
12. Persist exact actions and versions, including which OS branch of step 11 was used and
    what the resolved Docker-compatible endpoint was (or that none could be resolved).

## Java / Node / Python policy

Do not globally install Java/Node merely because a benchmark needs them.

Prefer the task environment:

- Java: Eclipse Temurin JDK image.
- TypeScript: official Node image.
- Python: official Python image.

Install host versions only when the orchestration tooling itself requires them.

## Success criteria

Return READY only if:
- Harbor CLI works;
- Podman smoke tests pass;
- one Harbor task runs end-to-end;
- cleanup metadata exists.
