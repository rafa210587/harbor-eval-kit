import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import {
  ensurePodmanRunning,
  guiStopInvocation,
  isGuiProcess,
  parseUnixProcesses,
  parseWindowsProcesses,
  readGuiStatus,
  stopGui,
} from "./gui-lifecycle.ts";

const root = resolve("fixture-project");
const guiScript = resolve(root, "scripts", "gui-server.ts");

test("GUI process identity includes the exact project script and port", () => {
  assert.equal(isGuiProcess({
    pid: 12,
    commandLine: `node "${guiScript}" --port 4199`,
  }, root, 4199), true);
  assert.equal(isGuiProcess({
    pid: 13,
    commandLine: "node /other/scripts/gui-server.ts --port 4199",
  }, root, 4199), false);
  assert.equal(isGuiProcess({ pid: 14, commandLine: "node unrelated.ts --port 4173" }, root, 4173), false);
  assert.equal(isGuiProcess({ pid: 16, commandLine: `node other.ts "${guiScript}" --port 4199` }, root, 4199), false);
  assert.equal(isGuiProcess({
    pid: 15,
    commandLine: `powershell -Command "node '${guiScript}' --port 4199"`,
  }, root, 4199), false);
  assert.deepEqual(guiStopInvocation("win32", 44), { command: "taskkill", args: ["/PID", "44", "/F"] });
});

test("process list parsers preserve native command lines", () => {
  assert.deepEqual(parseWindowsProcesses(JSON.stringify({ ProcessId: 7, CommandLine: "node script.ts" })), [
    { pid: 7, commandLine: "node script.ts" },
  ]);
  assert.deepEqual(parseUnixProcesses("  8 node /work/scripts/gui-server.ts\ninvalid"), [
    { pid: 8, commandLine: "node /work/scripts/gui-server.ts" },
  ]);
});

test("status accepts only the Harbor Eval Kit API shape and never invokes a mutation", async () => {
  const status = await readGuiStatus(4173, async (input) => {
    assert.equal(String(input), "http://127.0.0.1:4173/api/status");
    return new Response(JSON.stringify({ harbor: {}, podman: {}, platform: "linux", stateDir: "/state" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  assert.equal(status.gui, "up");
  const unrelated = await readGuiStatus(4173, async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
  assert.equal(unrelated.gui, "down");
});

test("start selects a configured stopped machine instead of starting the implicit default", () => {
  const calls: string[] = [];
  ensurePodmanRunning("win32", (_command, args) => {
    calls.push(args.join(" "));
    if (args[0] === "info") throw new Error("stopped");
    if (args[0] === "system") return JSON.stringify([{ Name: "team", URI: "ssh://team", Default: true }]);
    if (args[0] === "machine" && args[1] === "list") return JSON.stringify([{ Name: "team", Running: false }]);
    return "{}";
  });
  assert.ok(calls.includes("machine start team"));
  assert.ok(calls.includes("--connection team info --format json"));
});

test("stop refuses a same-port foreign process and verifies the killed process disappeared", async () => {
  let records = [
    { pid: 20, commandLine: "node /other/scripts/gui-server.ts --port 4173" },
    { pid: 21, commandLine: `node "${guiScript}" --port 4173` },
  ];
  const killed: number[] = [];
  const pid = await stopGui({
    projectRoot: root,
    port: 4173,
    platform: "win32",
    processes: () => records,
    kill: target => {
      killed.push(target);
      records = records.filter(record => record.pid !== target);
    },
  });
  assert.equal(pid, 21);
  assert.deepEqual(killed, [21]);
  assert.deepEqual(records.map(record => record.pid), [20]);
});

test("stop does not kill when no exact project process matches", async () => {
  let killed = false;
  const pid = await stopGui({
    projectRoot: root,
    port: 4173,
    processes: () => [{ pid: 22, commandLine: "node unrelated.ts --port 4173" }],
    kill: () => { killed = true; },
  });
  assert.equal(pid, null);
  assert.equal(killed, false);
});
