# Harbor Eval Kit

A local **evaluation workbench** for coding agents, built on top of the
[Harbor Framework](https://github.com/harbor-framework/harbor).

Harbor runs a coding agent against a task in a container and reports what happened. This kit is
the layer around that: it lets you compose the *experiment* — which agents, which models, which
skills, on which task, how many attempts — run the whole matrix, and compare the results side by
side, from a local GUI or a script. Container runtime is **Podman only**; it never installs Docker.

The question it exists to answer is the boring one that's annoyingly hard to answer well:

> *Is this model actually better than that one for my task — or did I just change three things
> at once and read the tea leaves?*

## What Harbor does vs. what this kit adds

| Harbor owns | Harbor Eval Kit owns |
|---|---|
| running a task in a container (the harness) | composing the comparison: agent × model × skill set × attempts |
| the agent adapters (`claude-code`, `mini-swe-agent`, `aider`, …) | registries so those pieces are named, reusable and shareable, not retyped flags |
| trials, trajectories, `result.json`, its own `analyze` | the spend guard, the judge/rubric policy, the GUI/CLI, the comparison table |
| the deterministic reward from your `tests/test.sh` | the reproducibility plumbing around it (config bundles, pinned Harbor version) |

Nothing here reimplements Harbor. Every run is a real `harbor` CLI call — this kit builds the
argv, injects the right credentials and reads the results back.

## The evaluation model

```text
Task  ×  Agent  ×  Model  ×  Skill Set  ×  N attempts
                      │
                      ▼
        deterministic reward (tests/test.sh)   ← this IS the comparison
                      │
                      └── optional: Judge × Rubric   ← only for what the test can't see
```

You normally vary **one** dimension and hold the rest fixed:

- **Model comparison** — same task, same agent, same skills; model A vs. model B.
- **Agent comparison** — same task, same model (where the adapter supports one), same skills.
- **Skill ablation** — same everything; no skills vs. skill A vs. skill A+B.

The reward from your own test script is the real signal, the same way SWE-bench/HumanEval do it.
The LLM judge is strictly opt-in, for the two things a pass/fail test cannot see: reward hacking,
and breaking a tie between candidates that all passed. The judge policy defaults to a curated
model list. This is an operational guardrail, not proof of accuracy: calibrate the judge
against examples with known verdicts. Explicit validation mode is for pipeline tests.

## Compatibility

| | Validated |
|---|---|
| **Harbor** | `0.22.0` — pinned by the installers, and the version every parsing assumption here was checked against |
| **Node** | 24+ (native TypeScript execution; no `tsc`, no build step, no `node_modules`) |
| **Podman** | 6.x, machine running. **No Docker, ever.** |
| **OS** | Windows validated end-to-end with real runs; macOS/Linux logic-tested, not yet run on real hardware |

The Harbor pin is deliberate: this kit mirrors one release's adapter list, parses its
`harbor analyze` output and reads its `result.json` field names — all of which change *silently*,
not loudly. The GUI's status bar reports the installed version and flags a mismatch against the
tested one. A newer Harbor will probably work; it just stops being something anyone verified.

## Documentation map

This README is the tour. The depth is elsewhere (in Portuguese):

The next platform improvements are documented **before implementation** in the
[platform plan](./docs/PLANO_PLATAFORMA_2026-09-07.md), with a
[Claude continuation prompt](./docs/PROMPT_CLAUDE_PLATAFORMA.md).
For corporate cloud use, see the [AWS infrastructure plan](./docs/PLANO_AWS_CORPORATIVO.md):
a small Podman-based pilot with controlled access, persistent storage and usage-based
operation. **AWS deployment is planned only; it is not implemented or validated.**

| Document | What's in it |
|---|---|
| [`DOCUMENTACAO.md`](./DOCUMENTACAO.md) | The complete reference: every decision and its reasoning, step-by-step install, every tab in detail |
| [`docs/COMO_FUNCIONA.md`](./docs/COMO_FUNCIONA.md) | Diagrams + a worked story: DeepSeek vs. Claude on the same task, including a real API-key failure and its fix |
| [`docs/FLUXO_RUN_COMPARE_ANALYZE.md`](./docs/FLUXO_RUN_COMPARE_ANALYZE.md) | "What must I register before this works?" — required vs. optional per operation, with every real error message and its fix |
| [`docs/PLANO_TESTES_UI.md`](./docs/PLANO_TESTES_UI.md) | 59 manual UI scenarios, each honestly marked click-tested / API-only / never tested (54 click-tested today; the 3 remaining need a human at the keyboard) |
| [`docs/PENDENCIAS.md`](./docs/PENDENCIAS.md) | What's deliberately not built yet, and why |
| [`docs/ENGENHARIA.md`](./docs/ENGENHARIA.md) | The engineering rules every change follows, and the real incident behind each one |

## Why Podman-only is a feature, not a limitation

Harbor's backend is Docker-oriented, and it does not talk to Podman out of the box on every
platform — the fix differs per OS (a Docker-pipe collision on Windows, a per-machine socket path
on macOS, usually nothing on native Linux). This kit detects the OS and resolves the right
`DOCKER_HOST` automatically, scoped to the child process so it never touches your shell. See
[the compatibility gate](./DOCUMENTACAO.md#4-o-gate-de-compatibilidade-podmanharbor-windows-macos-linux)
for the mechanism per platform, and its honest caveat (Windows is the path with real end-to-end
runs behind it). It also disables Harbor's own PostHog telemetry unconditionally — see
[Security](#security).

## Prerequisites

- Windows, macOS, or Linux with [Podman](https://podman.io/) installed and its machine
  running (`podman machine init && podman machine start` on Windows/macOS).
- [`uv`](https://docs.astral.sh/uv/) to install Harbor in an isolated environment.
- Node.js 24+ (native TypeScript execution — no `tsc`/`ts-node`/build step for anything
  in `scripts/`).
- The primitive `harbor-eval doctor/install` smoke requires a **preexisting** `docker.io/library/alpine:3.20` image. It uses `--pull=never`, so it will stop with a clear prerequisite error instead of creating an unowned base image.
- API keys for whichever model providers you plan to use (Anthropic, OpenAI, etc.) — entered
  into the GUI's Secrets tab, never as a global environment variable or in any tracked file.

## Quick start

There are two ways to get Harbor itself installed: let a coding agent do it via the bundled
skills, or run the commands yourself. Either way, ends with the same local GUI.

### Option A — let Claude Code (or Codex/another agent) install it for you

This repo ships its own install runbook as a **skill**: `Harbor_install/skills/harbor-bootstrap/SKILL.md`.
It's plain markdown with a numbered procedure (snapshot existing tools → install `uv` if
missing → `uv tool install harbor` → validate → gate on Podman compatibility with a real
minimal task → persist what was done) — any coding agent that can read a file and run shell
commands can follow it, not just Claude Code specifically:

- **Claude Code**: open this repo and ask `"install Harbor Eval Kit"` — `CLAUDE.md` at the
  root already points Claude Code at the right skill file for install/doctor/eval/cleanup
  requests, so it picks up `harbor-bootstrap` on its own.
- **Codex / GPT-based agents**: point it at the file directly, e.g. *"follow the procedure in
  `Harbor_install/skills/harbor-bootstrap/SKILL.md` step by step, asking me before anything
  destructive"*. There's nothing Claude-specific in the file itself.

The doctor/cleanup counterparts (`harbor-doctor`, `harbor-cleanup`) work the same way —
`"diagnose my Harbor setup"` / `"uninstall Harbor Eval Kit"`.

### Option B — do it yourself

```bash
# 1. Install Harbor in an isolated environment, pinned to the version this kit was
#    validated against (see Compatibility above for why the pin is not cosmetic)
uv tool install "harbor==0.22.0"

# 2. Make sure Podman is up and compatible with Harbor's Docker-oriented backend
podman machine init && podman machine start   # if not already running
```

### Enable and start the GUI

Either option above gets you to the same place — a script that checks Harbor/Podman are
actually usable and then launches the server:

```bash
# macOS/Linux
./scripts/start-gui.sh
```
```powershell
# Windows
.\scripts\start-gui.ps1
```

Both scripts are idempotent (safe to re-run), print exactly what's missing if something isn't
ready yet, and exit with a clear error instead of a stack trace if Harbor/Podman aren't found.
Once running: **http://127.0.0.1:4173**.

For a first comparison: **Secrets → Models → Agents → Compare**, selecting the executable
`evals/python/soma-fracoes` task. Use a model-agnostic adapter such as `mini-swe-agent` when
comparing providers. Skills, Criteria, Rubrics and Judges are optional. See
[`DOCUMENTACAO.md` §2](./DOCUMENTACAO.md#2-instalação-e-configuração--passo-a-passo) for the
fully detailed walkthrough, including the Podman↔Harbor compatibility gate and how to harden
`secrets.env`'s file permissions.

> Anything that goes wrong in `harbor`/`podman` *themselves* (a CLI flag, an adapter, a
> provider integration, a Harbor bug) is outside what this kit controls — check
> [harbor-framework/harbor](https://github.com/harbor-framework/harbor) upstream (issues,
> `harbor --help`, `harbor <command> --help`) before assuming it's this kit's doing. Anything
> about *this repo's own* GUI/scripts/skills is fair game here.

## Two ways to use it

| | GUI (`gui-server.ts`) | CLI (`compare-matrix.ts`) |
|---|---|---|
| Best for | interactive exploration, one-off comparisons, editing tasks/rubrics without leaving the browser | scripting, CI, reproducible sweeps from the terminal |
| Combinations | explicit list of entries (agent + model/skillset overrides), built by hand | full cartesian product via repeatable `--agent`/`--model`/`--skillset` flags |
| State | named registries plus persisted experiment records | flags configure candidates; experiment records persist on disk |
| Output | live table in the browser + CSV/JSON report | terminal table + CSV/JSON report |
| Spend guard | same guard, same estimate source (`--cost-cap-usd` ⇄ the "Teto de gasto" field) | same guard, acknowledged with `--yes-spend` |

Both are thin orchestrators around real `harbor` CLI calls — neither reimplements anything
Harbor already does. Both run **locally**, never as a hosted page, because they need to reach
your local Podman/Harbor installation.

```powershell
# CLI sweep example (PowerShell)
node .\scripts\compare-matrix.ts `
  --path .\evals\python\soma-fracoes `
  --agent mini-swe-agent `
  --model anthropic/claude-sonnet-5 --model openai/gpt-5.1 `
  --skillset "" `
  --dry-run
```

`node .\scripts\compare-matrix.ts --help` lists every option.

## The GUI, tab by tab

![Compare tab of the Harbor Eval Kit GUI](./docs/screenshots/compare-tab.jpg)

The numbered tabs are a feature map; you do not need every tab for a first evaluation.
Each one has inline hints in the UI itself — this is just the map. For the
full explanation of every tab (what it's for, exactly how to use it, edge cases) see
[`DOCUMENTACAO.md` §10](./DOCUMENTACAO.md#10-cada-aba-em-detalhe).

1. **Secrets** — provider API keys, stored only in `~/.harbor-eval-kit/secrets.env` (never in
   this repo, never returned by the API after saving). A **Test** button next to each saved
   key makes one real, minimal call (via LiteLLM, the same library Harbor uses) to confirm it
   actually works, and offers to auto-register any models it can discover live for that
   provider.
2. **Models** — `label → provider/model` shortcuts; badges show whether the expected key is
   already in Secrets.
3. **Skills** — a `SKILL.md`'s worth of instructions an agent can receive (write inline,
   attach a `.md`, or point at an existing folder). Optionally bundle example/template files
   alongside it (Anthropic/OpenAI's "progressive disclosure" convention) — Harbor uploads the
   whole skill folder into the agent's environment, not just `SKILL.md`, confirmed against
   its own source.
4. **Skill Sets** — bundle 1+ Skills into a named package to compare as a unit.
5. **Agents** — a "usage profile": which `--agent` Harbor runs, its default model, its own
   instructions, and default skill sets.
6. **Criteria** — one reusable, atomic evaluation question (`name`/`description`/`guidance`)
   an LLM judge answers PASS/FAIL/N-A about a finished run.
7. **Judge Rubrics** — bundle 1+ Criteria into a named rubric, reused across languages/tasks.
8. **Judges** — a judge's "usage profile": which `--agent` executes the judging, which
   (curated, high-tier-only) model, optional custom instructions, and default rubrics.
   A **validation mode** escape hatch exists for smoke-testing the analyze pipeline with a
   cheap non-curated model: it has to be asked for explicitly *both* when registering the
   judge and on the analyze call itself, and every result from it is stamped
   `⚠ não vale como avaliação`. It never silently relaxes the curated-model gate.
9. **Tasks** — `harbor init --task` plus an in-browser editor for `instruction.md`,
   `Dockerfile`, `solve.sh`, `test.sh` — no external editor needed. A task can also pin a
   default Judge + rubrics, auto-suggested later in Compare.
10. **Compare** — the core: add an Agent (repeatable, with per-row model/skillset overrides),
    point at a Task, run. Reward, cost, tokens, and duration show up per row; an optional
    **Analyze** panel judges any result afterward (never automatic).

Five support tools, not numbered because they're used situationally, not sequentially:

- **Datasets** — pull a published third-party task suite (`harbor dataset download`); its
  tasks then show up automatically alongside your own in Tasks/Compare.
- **Config** — export every registry (Agents, Models, Skills, Skill Sets, Criteria, Judge
  Rubrics, Judges) to one JSON file, or import one back in. Never includes secrets. Import is
  idempotent, upserting by id, so a team can commit the file and everyone can re-import it
  without duplicating entries or losing anything local.
- **Logs** — live tail of the log files harbor writes into the jobs dir (image build, agent
  install, the test running). Follows a run in progress and stays available afterwards; works
  for runs started by the CLI too, since the state is read from disk rather than kept in
  memory.
- **Trajectories** — opens Harbor's own step-by-step viewer (`harbor view`) for a finished
  job, so you can see exactly what an agent did inside the container, not just its reward.
- **Analyze** — the same judge run as Compare's Analyze panel, but pointed at a path you type
  by hand. For auditing a job that was run earlier, or from the CLI, without rebuilding the
  comparison that produced it.

Across every tab: each field carries an inline hint explaining what it's for and when to skip
it (a **compact mode** toggle in the header hides all of them once you no longer need them,
remembered per browser), labels are wired to their inputs so clicking the text focuses the
field, long operations stream a live log instead of freezing, and dead ends name the single
missing step rather than showing an empty dropdown. The theme follows your OS's
`prefers-color-scheme` — there is no toggle to get wrong.

Compare also has a **Cancel** button once a real run starts, and a live cost estimate (from
this machine's own run history) with a configurable cap that refuses to start a run before
anything is spawned if it would exceed it, or if too many paid trials would run blind with no
pricing history. Both are best-effort where Harbor itself gives no hook to be exact: cancelling
kills the `harbor` process and tries to stop its containers, but Harbor's own container cleanup
runs on normal completion, which a killed process never reaches.

On agents: Harbor accepts **42** `--agent` adapters, and the Agents tab autocompletes them,
flagging which are **model-agnostic** (LiteLLM-backed: `mini-swe-agent`, `terminus`, `aider`,
`opencode`, `openhands`, …). Those are the ones that let you hold the agent fixed and swap only
the model — a vendor CLI adapter (`claude-code`, `codex`, `gemini-cli`) speaks its own vendor's
API. Verified on 2026-09-06: `mini-swe-agent` + `deepseek/deepseek-chat` solved a real task at
reward 1.0 for $0.0017 in 63s.

## How comparison actually works

The **reward** from `tests/test.sh` (deterministic — pytest/shell/asserts writing 0/1 to
`/logs/verifier/reward.txt`) *is* the real comparison, the same method SWE-bench/HumanEval
use. **Analyze** (the LLM judge) is a strictly opt-in layer on top, for the cases the cheap
test can't catch: reward hacking, or breaking a tie between candidates that all passed. The
judge model defaults to a curated list, with explicit validation mode for pipeline tests.
The list does not establish judge quality; calibration does. Full mechanism, including the N-rubric-per-analysis and
Task↔Judge pinning: [`DOCUMENTACAO.md` §11](./DOCUMENTACAO.md#11-o-mecanismo-de-avaliação--reward-vs-juiz).

## Experiment records and shared configuration

Both entry points use the same experiment planner and spend guard. Planned paid volume
includes **tasks × attempts × candidates**; credentials come from the local secrets file
and enter child environments only. Extra run arguments are limited to adapter kwargs
(`--ak` / `--agent-kwarg`) and `--timeout-multiplier`, so they cannot override the guarded plan.

Snapshots accept regular files and exported task/skill directories. Links/junctions, `.git`, and credential filenames are refused explicitly. Image tags, external packages and provider aliases are not frozen by this copy; pin those in the task for stronger repeatability.

Records under `<jobsDir>/.experiments/<id>/` retain the effective plan, input snapshots/hashes,
results and attached analyses. Reopen a saved comparison in the GUI after refresh. Snapshots
fix local inputs; they do not freeze provider behavior or external image registries.
A **Config bundle** shares editable registry definitions. It does not contain credentials,
external skill folders, tasks or run history and is not a frozen experiment.

Analyze preserves every trial and excludes N/A and unknown outcomes from pass/fail ratios.
Total judge cost stays blank unless every analyzed trial reports it; partial reported cost is
identified separately. Validation-mode metadata remains attached to the analysis.

Cleanup is fail-closed: legacy manifests with missing ownership records require reconciliation before removal. `uv` is explicitly preserved because its full installer footprint is not recorded. Cancelling a comparison kills the Harbor process; unrecorded/unlabeled Harbor containers remain for inspection rather than being stopped by a name-prefix guess.

## Security

- **Provider API keys** live only in `~/.harbor-eval-kit/secrets.env`, outside this repo, and
  are only ever injected into the environment of the `harbor`/`podman` child process at run
  time — never as a command-line argument (which other processes can read), never written to
  any file this kit tracks, never returned by an API (listings give names, not values).
- **A pre-commit hook blocks any commit containing a credential.** Activate it once per clone:

  ```bash
  bash scripts/setup-hooks.sh      # macOS/Linux/Git Bash
  pwsh scripts/setup-hooks.ps1     # Windows PowerShell
  ```

  It runs `scripts/scan-secrets.sh --staged`, which matches vendor key formats (`sk-ant-`,
  `AKIA`, `ghp_`, `AIza`, PEM private keys, …), secret-ish `name=long-opaque-value`
  assignments, and forbidden filenames (`secrets.env`, `.env`, `*.pem`) regardless of content —
  while deliberately *not* firing on the mere mention of a key's name, which this repo's docs
  do constantly. Verified by attempting real commits of planted keys, not by reading its output.
- **`.gitignore`** defensively excludes `secrets.env`/`.env*` even though they're never
  created inside the repo by design.
- **Harbor's own telemetry is disabled unconditionally** (`HARBOR_TELEMETRY=disabled`
  injected into every `harbor` child process) — confirmed via the installed package's source
  that no API key ever enters that payload, but usage data (models tried, cost, reward) would
  leave the machine by default otherwise.
- **The local API refuses requests that didn't come from its own page.** Binding to `127.0.0.1`
  keeps the network out but not your own browser: any site you have open can send a
  `Content-Type: text/plain` POST to `http://127.0.0.1:4173` — a CORS "simple request", so
  there's no preflight to refuse — and while it can't read the reply, the side effect lands.
  That was enough to spend real API credit via `/api/compare`, repoint a Judge's model, or
  delete a registry. Every request is now checked on two axes: `Origin` must be this server's
  own page (absent is fine — curl and the kit's own scripts don't send one), and `Host` must be
  loopback on the right port, which is what catches DNS rebinding, where the page *is*
  same-origin by the time it fires.
- **Your registries survive a bad write.** Each registry file is written to a temp file and
  renamed over the target, so an interrupted write leaves either the old file or the new one —
  never a half-written one. And a registry that *is* unreadable makes the kit stop and say so,
  instead of quietly reading it as "empty" and then overwriting your agents/judges/rubrics with
  whatever you added next.
- Full threat-model writeup, including what *isn't* guaranteed (plain-text file on disk,
  Windows ACL hardening steps): [`DOCUMENTACAO.md` §7](./DOCUMENTACAO.md#7-segurança-das-secrets--o-que-é-garantido-e-o-que-não-é).

## Contributing / engineering standards

```bash
bash scripts/setup-hooks.sh    # once per clone: activates the credential guard
bash scripts/test.sh           # unit tests + import/cycle checker + credential scan
```

No test framework, no `node_modules`, no build step anywhere — `node --test` runs the `.ts`
files directly via native type stripping, and the GUI ships native ES modules the browser
loads as-is. The suite is deterministic and fully offline: it never spawns Podman, never calls
a provider, and never needs Harbor installed. Anything that costs money or runs a container is
validated by a real run and written down in the docs instead.

The rules that apply to every change (credentials, cross-platform parity, small files,
decoupling, a test per feature, explanatory UI, observability, docs in the same commit) are
summarised in [`AGENTS.md`](./AGENTS.md), with the reasoning and the real incident behind each
one in [`docs/ENGENHARIA.md`](./docs/ENGENHARIA.md). Coding agents also get them as invocable
skills in `.claude/skills/` (`ship-change`, `secret-guard`, `cross-platform`).

## Repo layout

```text
harbor-eval-kit/
├── AGENTS.md, CLAUDE.md          entrypoints for coding agents + engineering standards
├── README.md                     you are here
├── DOCUMENTACAO.md                the full reference (PT-BR)
├── .githooks/pre-commit          blocks any commit carrying a credential
├── .gitattributes                pins .sh to LF (CRLF would break the hook on Windows)
├── .github/workflows/ci.yml      unit tests + import checker + credential scan, 3 OSes
├── .claude/skills/               project skills: ship-change, secret-guard, cross-platform
├── docs/PENDENCIAS.md            what's deliberately not built yet, and why
├── config/defaults.env           non-secret default env var names/paths
├── manifests/                    example installation-manifest schema
├── docs/screenshots/             images used in this README
├── Harbor_install/               skills/agents for INSTALLING/OPERATING Harbor itself
│   ├── skills/                     (harbor-bootstrap, harbor-doctor, harbor-cleanup, ...)
│   └── agents/                     — not to be confused with the GUI's own "Agents" tab,
│                                     which is about agent profiles used *inside* evals.
├── scripts/
│   ├── start-gui.sh / .ps1       checks Harbor/Podman, then launches the GUI
│   ├── harbor-eval.sh / .ps1     original bootstrap/doctor scripts
│   ├── compare-matrix.ts         CLI sweep tool (cartesian product via repeatable flags)
│   ├── gui-server.ts             local HTTP server + all /api/* routes
│   ├── check-imports.mjs        finds missing cross-module imports + cycles, offline
│   └── lib/*.ts                 14 modules: exec, registries, secrets, materialization,
│                                   cost guard, config bundle, origin guard, ...
│                                   (harbor.ts is the barrel; *.test.ts sit alongside)
├── gui/
│   ├── index.html                markup for the 15 tabs
│   ├── styles.css                styles
│   └── app/*.js                  14 native ES modules, no build step
└── evals/{java,typescript,python}/   your own tasks (the seed-task/ in each is an empty stub)
```

`jobs/` (Compare/Analyze output) is git-ignored — it's local run history, not project content.
`datasets/` (downloaded task suites), if present, is deliberately **not** ignored — like
`evals/`, it's real project content once you've pulled it down.

## Uninstall safety

Cleanup only ever touches what this kit itself created — a fixed resource prefix
(`harbor-eval-kit-`) and label (`io.harbor-eval-kit.managed=true`), tracked in a local
manifest, with `--dry-run` support. It deliberately never runs `podman rm -a`,
`podman system prune -a`, or any other broad-destructive command, and never touches Podman
itself (Podman is preexisting infrastructure, not something this kit installed).

## Known limitations

- **Spend guard**: both the GUI and the CLI preview the estimated cost from this machine's own
  run history and refuse before spawning anything if it exceeds the cap, or if more than 5 paid
  trials would run with no history to price them. It is a pre-flight guard, not a hard limit —
  this Harbor exposes no cost flag, so nothing here can stop a run already in progress. A
  combination that has never run has *no* estimate, which is treated as "unknown", not as free.
- Compare uses a synchronous POST with elapsed time, logs and best-effort cancellation.
  Experiment records survive refresh. Restarting the server does not automatically resume
  interrupted execution.
- Every execution and candidate gets a unique identity, even with the same Job prefix.
  Re-running starts a new experiment; automatic reuse/resume is not supported.
- `harbor dataset list` (this Harbor version) only prints a Hub link, not a browsable list.
- A Judge can't be given a real tool-accessible skill (no `--skill` flag on `harbor analyze`)
  — only custom instructions via `--prompt`. Confirmed against Harbor's own source, not a gap
  in this GUI.
- `durationSec` in Compare is wall-clock time for the whole `harbor run` call, not the finer
  per-trial agent-execution timing Harbor records internally.
- The macOS/Linux `DOCKER_HOST` resolution is logic-tested (right `podman` commands, right Go
  template fields), but this kit was built on Windows — only the Windows path has a real,
  repeated, end-to-end `harbor run --env docker`. The GUI's status bar flags it explicitly
  (`⚠ DOCKER_HOST não resolvido`) instead of failing silently if it can't find a value.

Full list with rationale: [`DOCUMENTACAO.md` §13](./DOCUMENTACAO.md#13-limitações-conhecidas-decisões-conscientes-não-esquecimento).
