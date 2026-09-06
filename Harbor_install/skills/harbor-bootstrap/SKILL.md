# Harbor Bootstrap

## Trigger

Use when the user asks to install or configure Harbor Eval Kit.

## Goal

Bootstrap Harbor Framework on a Podman-only machine with minimal host mutation.

## Procedure

1. Read `AGENTS.md`.
2. Run the doctor before changing anything.
3. Snapshot versions and paths of:
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
4. Record preexisting tools in the installation manifest.
5. Never install Docker.
6. If `uv` is missing, install it user-level using the official installation route appropriate to the OS.
7. If usable Python is missing, install an isolated/user-level Python rather than replacing system Python.
8. Install Harbor using:
   `uv tool install harbor`
9. Validate:
   - `harbor --help`
   - `harbor agent list`
   - `harbor dataset list` or the equivalent reported by `harbor --help`
10. Validate Podman compatibility with Harbor using an actual minimal task before declaring success.
11. Persist exact actions and versions.

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
