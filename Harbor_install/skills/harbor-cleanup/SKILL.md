---
name: harbor-cleanup
description: Remove only what this kit created, verified against the installation manifest, with a dry-run plan first. Use for cleanup, reset or uninstall.
---

# Harbor Cleanup Guardian

## Trigger

Use for cleanup, reset or uninstall.

## Non-negotiable rules

Never use:
- `podman system prune -a`
- `podman rm -a`
- `podman rmi -a`
- wildcard deletion outside the kit root
- global package removal without manifest proof

## Procedure

1. Load installation manifest.
2. Discover resources with:
   label `io.harbor-eval-kit.managed=true`
3. Cross-check IDs/names against the manifest.
4. Produce a dry-run plan.
5. Delete only confirmed owned resources.
6. Remove Harbor only if manifest says `installed_by_kit=true`.
7. Remove uv/Python/Node/Java only if:
   - installed_by_kit=true
   - no external ownership ambiguity exists.
8. Never remove Podman.
9. Preserve an audit log.

If ownership cannot be proven, skip the resource and report it.
