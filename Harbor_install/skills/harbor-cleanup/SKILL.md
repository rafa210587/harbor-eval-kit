---
name: harbor-cleanup
description: Remove only what this kit created, verified against the installation manifest, with a dry-run plan first. Use for cleanup, reset or uninstall.
---

# Harbor Cleanup Guardian

Use `scripts/harbor-eval.sh uninstall --dry-run` or
`scripts/harbor-eval.ps1 uninstall -DryRun` first. Both use `scripts/cleanup.ts`;
Node.js 24+ is required. No Python or shell-specific deletion logic is used.

1. Load the installation manifest before contacting Podman. Missing or invalid manifests abort.
2. Discover all resources and inspect their ownership; reconcile exact IDs/names with
   `managed_resources`, prefix `harbor-eval-kit-` and label
   `io.harbor-eval-kit.managed=true`. All three are required. Image aliases must all use the prefix.
3. Abort the entire operation before deletion if a related resource has ambiguous ownership.
   Legacy manifests with empty resource arrays cannot authorize labeled resources automatically.
   Inspect and reconcile ownership manually; never invent missing installation history. This also
   preserves preexisting Harbor/Podman resources and runtime resources lacking all three proofs.
4. The JSON dry-run lists exact command argument arrays, including `uv tool uninstall harbor`
   only when the dependency snapshot proves Harbor was absent, installed by the kit, still at
   its recorded path, and belongs to the active uv tool directory.
5. Preserve preexisting dependencies and Podman. Kit-installed uv is explicitly listed as preserved
   because the upstream installer footprint is not fully recorded; remove it manually only after
   inspecting its ownership. Other unexpected dependencies abort instead of guessing paths.
6. Execute the same plan without the dry-run flag. Stop at the first failure and verify that
   each removed resource/executable is absent. Keep the manifest and its `uninstall_audit`,
   including the plan, completed actions and final status. Never persist command output.

Every manifest mutation, including cleanup audit progress, must acquire the shared
`<manifest>.runtime-lock`, reload after acquiring it and replace the manifest atomically. This
preserves resource reservations written concurrently by the managed Python runtime. If the lock
remains for 30 seconds, abort and inspect the owning process before treating it as abandoned.

Never use global prune, wildcard deletion or global package removal. Custom ownership marker
values are rejected. Do not remove the manifest unless the user separately requests it.

Validated with offline fake-executor tests; no real resources were deleted. Actual Podman
cleanup and platform-specific shell execution still require a controlled owned-resource test.

The managed Harbor extension currently creates only resources proven against the exact manifest
entry, `harbor-eval-kit-` name prefix and `io.harbor-eval-kit.managed=true` label. Cleanup must
continue to preserve resources outside that contract, including preexisting base images.
