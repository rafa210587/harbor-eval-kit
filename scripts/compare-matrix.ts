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
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  type Combo,
  type ResultRow,
  type Skillset,
  buildCombos,
  buildHarborRunArgs,
  execHarbor,
  isHarborAvailable,
  jobName,
  parseResult,
  parseSkillset,
  runPool,
  writeReport,
} from "./lib/harbor.ts";

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
  --extra "<args>"       Extra raw args appended to every 'harbor run' call (space-split)
  --interactive          Do not auto-pass -y; let Harbor prompt (only if this script has a TTY)
  --dry-run              Validate every combo via 'harbor run --print-config' only.
                         No trials run, no cost, no containers.
  --no-docker-host-fix   Disable automatic DOCKER_HOST injection on Windows/Podman
  --out-prefix <path>    Report file prefix (default: <jobs-dir>/<job-prefix>-report)
  --help                 Show this help

Example (2 agents x 2 models x 3 skillsets = 12 combos, validated only):
  node scripts/compare-matrix.ts --path .\\evals\\python\\seed-task \\
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
  const prefix = values["job-prefix"]!;
  const jobsDir = values["jobs-dir"]!;
  const dryRun = values["dry-run"]!;
  const extra = values.extra ? values.extra.split(/\s+/).filter(Boolean) : [];
  const concurrency = Math.max(1, parseInt(values.concurrency ?? "1", 10) || 1);
  const dockerHostFix = !values["no-docker-host-fix"];
  const autoYes = !values.interactive;

  console.log(`Matrix: ${combos.length} combination(s)${dryRun ? " (dry run, no cost)" : ""}`);
  for (const c of combos) console.log(" -", jobName(prefix, c));

  mkdirSync(jobsDir, { recursive: true });

  const rows = await runPool(combos, concurrency, async (c: Combo) => {
    const name = jobName(prefix, c);
    const args = buildHarborRunArgs({
      taskPath: values.path!,
      combo: c,
      jobsDir,
      name,
      env: values.env!,
      nAttempts: values["n-attempts"]!,
      extra,
      autoYes,
      printConfigOnly: dryRun,
    });
    console.log(`\n=== ${name} ===`);
    console.log("harbor", args.join(" "));
    const res = await execHarbor(args, { echo: true, dockerHostFix });

    const row: ResultRow = {
      jobName: name,
      agent: c.agent,
      model: c.model ?? "(default)",
      skillset: c.skillset.label,
      ok: res.code === 0,
      durationSec: res.durationSec,
    };
    if (res.code !== 0) {
      row.error = `exit ${res.code}`;
      return row;
    }
    if (!dryRun) Object.assign(row, parseResult(join(jobsDir, name)));
    return row;
  });

  const outPrefix = values["out-prefix"] ?? join(jobsDir, `${prefix}-report`);
  writeReport(rows, outPrefix);
  console.log(`\nReport written to ${outPrefix}.json and ${outPrefix}.csv`);
  printTable(rows);

  if (rows.some((r) => !r.ok)) process.exitCode = 1;
}

main();
