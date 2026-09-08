// Freeze custom judge inputs before starting a paid process; later edits cannot change it.
import { analysisBudget } from "./analysis-budget.ts";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { managedPath, newId } from "./paths.ts";

export function freezeAnalysisInputs(original: string[], timeoutHours = 8) {
  const args = [...original];
  const dir = managedPath("analysis-inputs", newId());
  const contents: { rubric: string | null; prompt: string | null } = { rubric: null, prompt: null };
  for (const [flag, key, file] of [["--rubric", "rubric", "rubric.toml"], ["--prompt", "prompt", "prompt.txt"]] as const) {
    const index = args.indexOf(flag);
    if (index === -1) continue;
    contents[key] = readFileSync(args[index + 1], "utf8");
    mkdirSync(dir, { recursive: true });
    args[index + 1] = join(dir, file);
    writeFileSync(args[index + 1], contents[key], { flag: "wx" });
  }
  mkdirSync(dir, { recursive: true });
  const configPath = join(dir, "job-config.json");
  writeFileSync(configPath, JSON.stringify(analysisBudget(timeoutHours)), { flag: "wx" });
  args.push("--config", configPath);
  return { args, ...contents };
}
