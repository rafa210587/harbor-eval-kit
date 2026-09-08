# Podman compatibility gate

Harbor runs locally through this kit's managed Podman environment adapter. Docker Engine is
neither installed nor invoked; Podman may use an existing Compose CLI provider.

This kit treats Podman support as a tested compatibility target, not an assumption.

## Required primitive tests

- build image
- create/run container
- exec
- bind mounts
- named volumes
- user network
- env propagation
- labels
- removal

The smoke also verifies host-to-container and container-to-host bind I/O. It requires the
preexisting `docker.io/library/alpine:3.20` image and uses `--pull=never`.

## Read-only connection gates

Before the primitive smoke, `scripts/installation.ts gate` selects an explicit effective
Podman machine/connection, validates it through the Podman CLI, requests `/version` from the
resolved API endpoint and requires it to identify itself as Podman, then runs
`podman compose version` and `podman compose up --help` with child-scoped `DOCKER_HOST`. The
provider must support `--wait` and `--pull`, which Harbor's lifecycle uses. A preexisting
Docker Compose CLI plugin may serve as Podman's provider without Docker Engine; an incompatible
`podman-compose` is rejected.

The resolver is `scripts/lib/podman.ts`. Windows uses the validated compatibility pipe only
after selecting a running machine. macOS inspects the selected machine by name. Linux rootless
uses the socket reported by `podman info`; an active Linux machine follows the macOS branch.

## Harbor-specific gate

After Harbor installation create a minimal task using the Harbor CLI version actually installed.

Run the task through Harbor. `execHarbor` selects
`harbor_eval_kit.managed:ManagedPodmanEnvironment`, which invokes `podman build` and
`podman compose` directly and reserves prefixed/labeled resources before creation.

`harbor analyze` creates a separate wrapper task and accepts an environment enum only in
0.22.0. The kit launches it through `python -m harbor_eval_kit.cli`: this bootstrap validates
the exact Harbor version and registry contract, then redirects the Docker enum to the same
managed adapter **inside that child process only**. No installed Harbor file is modified.
This additional seam deliberately fails on version/contract drift and has offline tests.
The Analyze template requires the already present `python:3.13-slim` image as well.

READY is allowed only if the task:
1. creates the environment;
2. launches the agent or a minimal compatible agent;
3. executes tests;
4. returns a Harbor result;
5. cleans its resources.

If Harbor cannot talk to Podman through the expected interface, stop and report BLOCKED. Do not install Docker automatically.

The managed adapter currently supports Linux, one `main` service, a Dockerfile or prebuilt
local image, and public network policy. Compose/multiservice tasks, restrictive network policy
and implicit pulls are blocked before resource creation.

Validated on 2026-09-07: Windows, Podman 6.0.2, API/Compose gates, complete primitive smoke,
oracle reward 1 and nop reward 0. macOS and Linux resolution branches have offline tests only;
real-host validation remains pending.
