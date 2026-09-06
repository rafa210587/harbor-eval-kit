# Harbor Doctor

## Trigger

Use for preflight, health checks, status or troubleshooting.

## Checks

### Host
- OS
- WSL detection
- shell
- architecture

### Podman
- version
- info
- socket/service
- build
- run
- exec
- bind mount
- named volume
- user-defined network
- labels
- cleanup

### Docker compatibility gate

Harbor local execution is Docker-oriented. Check whether the current Harbor environment implementation can reach Podman through its expected API/CLI.

Do not assume `alias docker=podman` is sufficient.

Verify the exact operations Harbor performs by running a minimal Harbor task.

### Toolchains

Report but do not automatically mutate during doctor:
- Python
- uv
- Java
- javac
- Maven
- Gradle
- Node
- npm
- npx
- Harbor

## Output states

- READY
- DEGRADED
- BLOCKED

Every BLOCKED item must include the exact failing command and safe remediation.
