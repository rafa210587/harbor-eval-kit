import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { ensurePodmanRunning, readGuiStatus, stopGui } from "./lib/gui-lifecycle.ts";
import { defaultPodmanRunner } from "./lib/podman.ts";

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    port: { type: "string", default: "4173" },
    root: { type: "string", default: resolve(import.meta.dirname, "..") },
  },
});
const command = positionals[0] ?? "status";
const port = Number(values.port);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Port must be between 1 and 65535");

if (command === "status") {
  const status = await readGuiStatus(port);
  console.log(JSON.stringify(status, null, 2));
} else if (command === "preflight") {
  const status = await readGuiStatus(port);
  if (status.gui === "up") {
    console.log(`Harbor Eval Kit GUI already running at ${status.url}`);
    process.exitCode = 20;
  } else {
    execFileSync("harbor", ["--version"], { stdio: "ignore" });
    ensurePodmanRunning(process.platform as "win32" | "darwin" | "linux", defaultPodmanRunner);
  }
} else if (command === "stop") {
  const pid = await stopGui({ projectRoot: resolve(values.root!), port });
  if (pid === null) console.log(`Harbor Eval Kit GUI is not running on port ${port}.`);
  else console.log(`Stopped Harbor Eval Kit GUI process ${pid}.`);
} else {
  throw new Error("Usage: gui-lifecycle.ts status|preflight|stop [--port N] [--root PATH]");
}
