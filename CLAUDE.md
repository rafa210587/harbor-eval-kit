# Claude Code entrypoint

Read `AGENTS.md` first.

When the user asks to install, validate, benchmark, compare, diagnose or uninstall Harbor Eval Kit, load the matching skill under `Harbor_install/skills/`.

Note: `Harbor_install/skills/` and `Harbor_install/agents/` are the kit's OWN operational
skills/sub-agents (for installing and operating Harbor itself) — moved out of the project
root specifically to avoid colliding with the GUI's unrelated "Skills" and "Agents" concepts
(SKILL.md files and agent profiles that the *evals themselves* use, defined in `gui/index.html`
and stored under `~/.harbor-eval-kit/`). Don't confuse the two.

Recommended mapping:

- bootstrap/install -> `Harbor_install/skills/harbor-bootstrap/SKILL.md`
- diagnose/status -> `Harbor_install/skills/harbor-doctor/SKILL.md`
- create benchmark -> `Harbor_install/skills/harbor-eval-designer/SKILL.md`
- run benchmark -> `Harbor_install/skills/harbor-eval-runner/SKILL.md`
- compare/analyze -> `Harbor_install/skills/harbor-result-analyzer/SKILL.md`
- cleanup/uninstall -> `Harbor_install/skills/harbor-cleanup/SKILL.md`

Do not weaken cleanup safeguards.
