---
name: secret-guard
description: Credential protection for this repo — activate/verify the pre-commit scanner, audit where a secret flows, and handle a suspected leak. Use when asked about API keys, secrets, credential safety, "can this leak", or when a key may have been exposed.
---

# Secret guard

The rule is absolute: **no credential enters this repository**, and that is enforced by a
mechanism, not by remembering.

## Where secrets are allowed to exist

| Place | Allowed | Note |
|---|---|---|
| `~/.harbor-eval-kit/secrets.env` | ✅ | the only home; outside the repo tree by design |
| env var of the spawned `harbor`/`podman` process | ✅ | injected per call, via `extraEnv` |
| anywhere in the repo | ❌ | blocked by the pre-commit hook |
| a command-line argument | ❌ | visible to other processes and the task manager |
| an API response / a log line / a report | ❌ | listings return secret **names**, never values |

## Activate the protection (once per clone)

```bash
bash scripts/setup-hooks.sh     # macOS/Linux/Git Bash
pwsh scripts/setup-hooks.ps1    # Windows PowerShell
```

Sets `core.hooksPath=.githooks` — git never distributes hooks itself, so a fresh clone is
unprotected until this runs. Verify with `git config core.hooksPath` (expect `.githooks`).

## Scan on demand

```bash
bash scripts/scan-secrets.sh              # every tracked file
bash scripts/scan-secrets.sh --staged     # what a commit would record (what the hook runs)
bash scripts/scan-secrets.sh path/to/file
```

Exit 0 = clean, 1 = something that looks like a credential.

What it catches: vendor key formats (`sk-ant-`, `sk-`, `AKIA`, `AIza`, `ghp_`, `xox*`, PEM
private keys…), a secret-ish name assigned a long opaque value (case-insensitive), and files
whose *name* alone disqualifies them (`secrets.env`, `.env`, `*.pem`, `id_rsa`…) regardless of
content.

What it deliberately does not catch: the mere mention of a key's **name**. This repo's docs say
`ANTHROPIC_API_KEY` constantly; blocking that would teach everyone to reach for `--no-verify`,
which is the real failure mode.

## When it fires

1. Remove the value from the file — reference the variable name, never the value.
2. **If the key was ever real, revoke it in the provider's console.** Deleting the line does not
   undo the exposure.
3. Commit again.

If it is genuinely a false positive, adjust the pattern or the allowlist in
`scripts/scan-secrets.sh` **and add a case to the tests**. Never `--no-verify`.

## Auditing a change by hand

- Does any new code path put a secret in argv instead of `extraEnv`?
- Does any route return a secret value rather than its name?
- Does any log/report/error message interpolate a secret?
- Does a new file type belong in `.gitignore`?

## Two failure modes worth knowing

- **A hook that warns but does not block** is worse than no hook: it manufactures confidence.
  This one shipped that way for one iteration (a bash pipeline subshell swallowed the failure
  flag) and was only caught by attempting a real commit with a fake key. When you change the
  scanner, test it by *actually trying to commit* a planted key, not by reading its output.
- **A clone with hooks not activated** looks identical to a protected one. `git config
  core.hooksPath` is the only way to tell.
