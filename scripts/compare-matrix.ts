// Harbor Eval Kit - comparison matrix runner.
//
// Runs `harbor run` once per combination of {agent} x {model} x {skillset} and
// aggregates the resulting reward into one table/CSV/JSON report. Zero install:
// Node's built-in type stripping runs this file directly (`node scripts/compare-matrix.ts`),
// no tsc/ts-node/tsconfig needed. Shares its Harbor/Podman plumbing with gui-server.ts
// via ./lib/harbor.ts.
//
// Run with no arguments (or --help) for usage.

import { parseArgs } from "node:util";
import { type ResultRow, type Skillset, buildCombos, isHarborAvailable, parseSkillset, writeReport } from "./lib/harbor.ts";
import { createExperimentPlan, cliCandidates, estimateExperiment } from "./lib/experiment-plan.ts";
import { runExperiment } from "./lib/experiment-runner.ts";

function printHelp(): void {
  console.log(`Usage: node scripts/compare-matrix.ts --path <task> --agent <name> [options]

Required:
  --path <path>         Local task or dataset path (passed to 'harbor run --path')
  --agent <name>        Agent to test. Repeatable: --agent claude-code --agent codex

Sweep dimensions (repeatable; omit a dimension to hold it fixed at Harbor's default):
  --model <name>        e.g. anthropic/claude-sonnet-5. Repeatable.
  --skillset <list>     Comma-separated --skill paths for one variant, or "" for the
                         no-skill baseline. Repeatable. This is how you compare SETS of
                         skills, not just single skills:
                           --skillset ""  --skillset "./skills/a"  --skillset "./skills/a,./skills/b"

Options:
  --env <type>           Harbor --env value (default: docker)
  --job-prefix <str>     Prefix for generated job names (default: cmp)
  --jobs-dir <path>      Harbor --jobs-dir (default: jobs)
  --n-attempts <int>     Harbor --n-attempts / -k (default: 1)
  --concurrency <int>    How many 'harbor run' processes to run in parallel (default: 1)
  --extra "<args>"       Only --ak/--agent-kwarg/--timeout-multiplier; quoted values supported
  --interactive          Unsupported: fails before spawning; use Harbor directly for prompts
  --dry-run              Validate every combo via 'harbor run --print-config' only.
                         No trials run, no cost, no containers.
  --cost-cap-usd <n>     Refuse the run if the estimated cost exceeds this (0/unset = no cap)
  --yes-spend            Acknowledge the spend guard and run anyway
  --no-docker-host-fix   Disable automatic DOCKER_HOST injection on Windows/Podman
  --out-prefix <path>    Optional additional export; canonical report is under .experiments/<id>/
  --help                 Show this help

Example (2 agents x 2 models x 3 skillsets = 12 combos, validated only):
  node scripts/compare-matrix.ts --path .\\evals\\python\\soma-fracoes \\
    --agent claude-code --agent codex \\
    --model anthropic/claude-sonnet-5 --model openai/gpt-5.1 \\
    --skillset "" --skillset ".\\skills\\python-eng" --skillset ".\\skills\\python-eng,.\\skills\\testing" \\
    --dry-run
`);
}

function printTable(rows: ResultRow[]): void {
  console.log("\n=== Comparison Matrix Results ===");
  console.table(
    rows.map((r) => ({
      job: r.jobName,
      agent: r.agent,
      model: r.model,
      skillset: r.skillset,
      ok: r.ok,
      trials: r.nTrials ?? "",
      errors: r.nErrors ?? "",
      reward: r.meanReward ?? "",
      sec: r.durationSec !== undefined ? r.durationSec.toFixed(1) : "",
      error: r.error ?? "",
    }))
  );
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      path: { type: "string" },
      agent: { type: "string", multiple: true },
      model: { type: "string", multiple: true },
      skillset: { type: "string", multiple: true },
      env: { type: "string", default: "docker" },
      "job-prefix": { type: "string", default: "cmp" },
      "jobs-dir": { type: "string", default: "jobs" },
      "n-attempts": { type: "string", default: "1" },
      concurrency: { type: "string", default: "1" },
      extra: { type: "string", default: "" },
      interactive: { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
      "no-docker-host-fix": { type: "boolean", default: false },
      "cost-cap-usd": { type: "string" },
      "yes-spend": { type: "boolean", default: false },
      "out-prefix": { type: "string" },
      help: { type: "boolean", default: false },
    },
  });

  if (values.help) {
    printHelp();
    return;
  }
  if (!values.path || !values.agent || values.agent.length === 0) {
    console.error("Missing required --path and/or --agent.\n");
    printHelp();
    process.exit(1);
  }

  if (values.interactive) throw new Error("--interactive não é suportado: este runner fecha stdin; rode harbor diretamente para interação");

  if (!isHarborAvailable()) {
    console.error(
      "harbor not found on PATH. Run '.\\scripts\\harbor-eval.ps1 install' (or the .sh equivalent) first."
    );
    process.exit(1);
  }

  const agents = values.agent;
  const models = values.model ?? [];
  const skillsets: Skillset[] =
    values.skillset && values.skillset.length > 0
      ? values.skillset.map(parseSkillset)
      : [parseSkillset("")];

  const combos = buildCombos(agents, models, skillsets);
  const plan = createExperimentPlan({ path: values.path!, jobsDir: values["jobs-dir"], jobPrefix: values["job-prefix"], nAttempts: values["n-attempts"], concurrency: values.concurrency, dryRun: values["dry-run"], env: values.env, extra: values.extra }, cliCandidates(combos));
  const estimate = estimateExperiment(plan);
  console.log(`Experimento ${plan.id}: ${plan.candidates.length} candidatos × ${plan.tasks.length} tasks × ${plan.nAttempts} tentativas = ${estimate.totalTrials} trials`);
  console.log(`Estimativa: ${estimate.estimateUsd === null ? "sem histórico" : "$" + estimate.estimateUsd.toFixed(4)}${plan.dryRun ? " (dry run, sem trials)" : ""}`);
  const result = await runExperiment(plan, { costCapUsd: values["cost-cap-usd"], acknowledgeCost: values["yes-spend"], dockerHostFix: !values["no-docker-host-fix"] });
  if (values["out-prefix"]) writeReport(result.rows, values["out-prefix"]);
  console.log(`Relatórios: ${result.reportJson} e ${result.reportCsv}`);
  printTable(result.rows);
  if (result.rows.some(r => !r.ok)) process.exitCode = 1;
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
