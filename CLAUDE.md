# Claude Code entrypoint

Read `AGENTS.md` first — its "Engineering standards" section applies to **every** change here
(credentials, cross-platform, small files, decoupling, tests, explanatory UI, observability,
docs in the same commit). The reasoning behind each rule is in `docs/ENGENHARIA.md`.

Project skills in `.claude/skills/` (invocable by name):

- `harbor-setup` — first local installation and demo preparation; start with
  `/harbor-setup`. See `docs/INSTALACAO_CLAUDE.md` for prerequisites and fallback.
- `ship-change` — the definition of done before committing: tests, credential scan,
  cross-platform parity, docs in the same commit.
- `secret-guard` — credential protection: activate/verify the pre-commit scanner, audit where a
  secret flows, handle a suspected leak.
- `cross-platform` — macOS/Linux/Windows parity: `.sh`/`.ps1`, tools absent from Git Bash,
  killing processes, paths, per-OS branching.

Before the first commit in a fresh clone: `bash scripts/setup-hooks.sh` (or
`pwsh scripts/setup-hooks.ps1`). Git does not distribute hooks, so without it the credential
guard is not active. Verify with `git config core.hooksPath` → `.githooks`.

When the user asks to install, validate, benchmark, compare, diagnose or uninstall Harbor Eval Kit, load the matching skill under `Harbor_install/skills/`.

Note: `Harbor_install/skills/` and `Harbor_install/agents/` are the kit's OWN operational
skills/sub-agents (for installing and operating Harbor itself) — moved out of the project
root specifically to avoid colliding with the GUI's unrelated "Skills" and "Agents" concepts
(SKILL.md files and agent profiles that the *evals themselves* use, defined in `gui/index.html`
and stored under `~/.harbor-eval-kit/`). Don't confuse the two.

Recommended mapping:

- bootstrap/install -> `Harbor_install/skills/harbor-bootstrap/SKILL.md`
- full diagnose (smoke tests) -> `Harbor_install/skills/harbor-doctor/SKILL.md`
- create benchmark -> `Harbor_install/skills/harbor-eval-designer/SKILL.md`
- run benchmark -> `Harbor_install/skills/harbor-eval-runner/SKILL.md`
- compare/analyze -> `Harbor_install/skills/harbor-result-analyzer/SKILL.md`
- cleanup/uninstall -> `Harbor_install/skills/harbor-cleanup/SKILL.md`

Operational (simple, everyday use — assumes install already happened, no smoke tests, no
mutation of containers/images/volumes):

- start/bring up services + GUI -> `Harbor_install/skills/harbor-up/SKILL.md`
- stop/shut down services + GUI -> `Harbor_install/skills/harbor-down/SKILL.md`
- quick status ("tá tudo de pé?") -> `Harbor_install/skills/harbor-status/SKILL.md`

These three live in the same `Harbor_install/skills/` folder as the install/lifecycle skills
above (no separate "operational" directory) — the distinction is documented here, in each
skill's own `## Category` header, and lives entirely in scope, not location.

Do not weaken cleanup safeguards.

For product reconstruction or capability changes, read `specs/README.md` and
`.specify/memory/constitution.md`. The SDD baseline is retrospective; reconstruction
checkboxes do not imply that existing code is missing. AWS remains plan-only.
