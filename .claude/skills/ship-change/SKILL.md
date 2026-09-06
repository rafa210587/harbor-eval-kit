---
name: ship-change
description: Definition of done for any change in this repo — run the tests and the credential scan, check cross-platform parity, update the docs in the same commit, then commit. Use before committing or when asked to finish/ship/close out a change.
---

# Ship a change

The gate every change passes before it is committed here. Full rationale, with the incident
behind each item: `docs/ENGENHARIA.md`. Short always-on rules: `AGENTS.md`.

Do not skip a step because the change "is small" — the bugs that made these rules exist all
arrived inside small changes.

## 1. Tests

```bash
bash scripts/test.sh        # macOS/Linux/Git Bash
pwsh scripts/test.ps1       # Windows PowerShell
```

Runs `node --test` over `scripts/lib/*.test.ts` plus the credential scan. Must be fully green.

Then ask: **does this change add a test?**

- New pure logic (formatting, parsing, resolution) → yes, always.
- New security guard (path traversal, a gate, an allowlist) → yes, always, including the case
  that must be *refused*.
- A fixed bug → yes: the test is what stops it coming back.
- Something that spends API, builds a container or hits the network → **no**. Validate it with
  a real run and record the measured numbers in the docs instead.

Test the real effect, not the printed output. The credential hook once printed its warning and
let the commit through anyway; only an actual attempted commit exposed it.

## 2. Cross-platform

- Touched a `.sh`? The `.ps1` sibling changes in the same commit, and vice versa.
- Used a Unix tool? Confirm it exists on Git Bash for Windows — `lsof`, `fuser` and often
  `python` do **not**. Provide a fallback and detect with `command -v`.
- Killing a process on Windows? MSYS `kill` returns success without killing a native Windows
  process. Use `taskkill //PID <pid> //F`.
- OS-dependent behaviour branches explicitly on win32/darwin/linux, in one place.
- State honestly in the docs which platforms were actually exercised.

## 3. Credentials

`scripts/test.sh` already runs the scan. Beyond that, confirm by eye that the diff introduces no
key material, no secret in argv, and no API response or log line that echoes a secret value.

If hooks are not active in this clone yet: `bash scripts/setup-hooks.sh`.

## 4. Documentation, in this same commit

Update whichever apply:

| Change | Document |
|---|---|
| new/changed UI behaviour | `DOCUMENTACAO.md` §10 (per tab), `README.md` tab list |
| new capability or flow | `docs/COMO_FUNCIONA.md`, `docs/FLUXO_RUN_COMPARE_ANALYZE.md` |
| new prerequisite/gate | `docs/FLUXO_RUN_COMPARE_ANALYZE.md` |
| new engineering rule | `docs/ENGENHARIA.md` + `AGENTS.md` |
| how to install/operate | the matching `Harbor_install/skills/*/SKILL.md` |
| new script | `DOCUMENTACAO.md` §14 file map |

Two things people forget:

- **A caveat that turned out wrong gets corrected in place** — do not leave the wrong sentence
  standing and add a right one elsewhere.
- **Record what was not validated.** "Logic-tested only, no real run on that OS" is useful;
  silence reads as a promise.

## 5. Commit

Stage deliberately (`git status` after adding), never `--no-verify`. If the hook fires, fix the
content or the pattern — never work around it.

Write the message so it explains *why*, names what was verified and how, and states what was
left unverified. Push only if the user asked.
