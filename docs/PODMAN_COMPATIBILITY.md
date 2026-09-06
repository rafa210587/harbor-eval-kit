# Podman compatibility gate

Harbor's local execution path is Docker-oriented.

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

## Harbor-specific gate

After Harbor installation create a minimal task using the Harbor CLI version actually installed.

Run the task through Harbor.

READY is allowed only if the task:
1. creates the environment;
2. launches the agent or a minimal compatible agent;
3. executes tests;
4. returns a Harbor result;
5. cleans its resources.

If Harbor cannot talk to Podman through the expected interface, stop and report BLOCKED. Do not install Docker automatically.
