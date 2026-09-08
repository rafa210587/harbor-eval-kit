---
name: cross-platform
description: Make a change work on macOS, Linux and Windows in this repo — script parity (.sh/.ps1), tools missing from Git Bash, killing processes, path handling, and per-OS branching. Use when writing or reviewing scripts, shell commands, process or path handling.
---

# Cross-platform (macOS · Linux · Windows)

This kit is developed on Windows and must run on all three. The traps below are the ones that
actually bit this codebase, not a generic checklist.

## Script parity

Every entry point exists twice and changes together in one commit:

- `.sh` — bash. Covers macOS, Linux **and** Windows, because Git for Windows ships Git Bash.
- `.ps1` — PowerShell, for people who live in a PowerShell terminal.

Exception, deliberate: **git hooks are bash only** (`.githooks/pre-commit`). Git for Windows
runs hooks with its own bash, so one implementation covers everything and there is no second
copy to drift.

## Tools you cannot assume exist

Git Bash on Windows is not a Linux box:

| Tool | Git Bash | Fallback used here |
|---|---|---|
| `lsof` | ❌ | `netstat -ano`, PID in the last column |
| `fuser` | ❌ | idem |
| `python` | often ❌ | don't shell out to it; use Node, or find the interpreter explicitly |
| `netstat` | ✅ | but it is Windows' netstat — different output format from Linux |
| `taskkill` | ✅ | Windows only; its presence is a fine way to detect Windows |

Always probe with `command -v <tool>` and degrade, never assume.

## Killing a process

**MSYS `kill` does not reliably kill a native Windows process.** It returns success, `kill -0`
then reports the process as gone, and the process keeps running and holding its port. This
produced a `stop-gui.sh` that cheerfully reported "Stopped." while the server stayed up.

```bash
if command -v taskkill >/dev/null 2>&1; then
  taskkill //PID "$pid" //F >/dev/null 2>&1 || true   # double slash: stops MSYS path mangling
else
  kill "$pid" 2>/dev/null || true
fi
```

Then **verify the effect** — re-check that the port is free — instead of trusting the exit code.
That is the general rule whenever the mechanism is OS-dependent.

## Paths

- Prefer Node's `join`/`relative` over hand-built strings.
- Windows paths reach you with backslashes (`evals\python\soma-fracoes`). Keys built from them
  must be used consistently — do not normalise on write and compare raw on read.
- Any path segment arriving over HTTP goes through `safeJoinUnderDir` before touching the disk,
  and the traversal case gets a test (`..\\..\\secrets.env` matters as much as `../../`).
- In Git Bash, an argument that starts with `/` may be converted to a Windows path. Use `//` for
  native-tool flags (`taskkill //PID`).

## Per-OS branching

Branch explicitly on `win32` / `darwin` / `linux`, in exactly one function, and surface the
resolved value so it can be audited. The canonical example is `DOCKER_HOST` resolution:

- `resolvePodmanConnection()` — `scripts/lib/podman.ts` is the source of truth.
- `resolvePodmanDockerHost()` — `scripts/lib/exec.ts` delegates to that resolver.
- Both shell wrappers delegate host decisions to the shared Node helpers.

Windows uses Podman's Docker-compatible pipe after selecting a running machine; macOS reads
that machine's inspected socket; Linux rootless reads the socket from Podman info. Machine
matching accepts its exact name or the standard `-root` alias and refuses collisions. Custom
connection aliases without a provable machine match require explicit configuration.
`GET /api/status` reports discovery; only the doctor smoke establishes readiness. Never equate
a version string or a discovered socket with a passing CLI/API/Compose/container smoke.

## Line endings

The repo carries `.sh` files edited on Windows. Git's autocrlf produces the "LF will be replaced
by CRLF" warnings — harmless for these scripts. But a shell script with CRLF **fails to run on
Linux/macOS** (`bad interpreter`). If you add a script, keep it LF.

## Say what you actually tested

Only the Windows path of this kit has real end-to-end runs. The macOS/Linux branches are
logic-tested. Documentation says so explicitly — keep it that way rather than implying coverage
that does not exist.
