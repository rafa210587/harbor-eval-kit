import { execCommand } from "./lib/exec.ts";
import { runHarborEval } from "./lib/harbor-cli.ts";
import { readGuiStatus } from "./lib/gui-lifecycle.ts";

const [command = "status", ...rawArgs] = process.argv.slice(2);
const args = rawArgs[0] === "--" ? rawArgs.slice(1) : rawArgs;

if (command === "eval") {
  if (!args.length) {
    console.log("Usage: harbor-eval eval -- <harbor run arguments>");
  } else {
    process.exitCode = await runHarborEval(args);
  }
} else if (command === "status") {
  const gui = await readGuiStatus(4173);
  console.log(`GUI: ${gui.gui}${gui.gui === "up" ? ` @ ${gui.url}` : ""}`);
  if (gui.payload) {
    console.log(JSON.stringify(gui.payload, null, 2));
    try {
      const response = await fetch("http://127.0.0.1:4173/api/logs/jobs?jobsDir=jobs", { signal: AbortSignal.timeout(1500) });
      const jobs = response.ok ? await response.json() as Array<{ name?: string; running?: boolean }> : [];
      const running = jobs.filter(job => job.running).map(job => job.name).filter(Boolean);
      console.log(`Evaluations running: ${running.length ? running.join(", ") : "none"}`);
    } catch { console.log("Evaluations running: unknown"); }
  } else {
    const [harbor, podman] = await Promise.all([
      execCommand("harbor", ["--version"], { dockerHostFix: false }),
      execCommand("podman", ["info", "--format", "json"], { dockerHostFix: false }),
    ]);
    console.log(`Harbor CLI: ${harbor.code === 0 ? harbor.stdout.trim() : "down"}`);
    console.log(`Podman: ${podman.code === 0 ? "running" : "down"}`);
    console.log("Evaluations running: unknown (GUI is down)");
  }
} else {
  throw new Error("Usage: harbor-cli.ts eval|status [arguments]");
}
