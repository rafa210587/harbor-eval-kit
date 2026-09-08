import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runHarborEval } from "./harbor-cli.ts";

test("eval wrapper uses the common Harbor executor, loads secrets and preserves its exit code", async () => {
  let seen: unknown;
  const code = await runHarborEval(["--path", "task", "--agent", "oracle"], {
    loadSecrets: () => ({ SYNTHETIC_TEST_TOKEN: "fixture" }),
    execute: async (args, options) => {
      seen = { args, options };
      return { code: 23, stdout: "", stderr: "failed", durationSec: 0 };
    },
  });
  assert.equal(code, 23);
  assert.deepEqual(seen, {
    args: ["run", "--path", "task", "--agent", "oracle"],
    options: { extraEnv: { SYNTHETIC_TEST_TOKEN: "fixture" }, echo: true },
  });
});

test("bash and PowerShell wrappers delegate eval and lifecycle to Node", () => {
  const scripts = join(import.meta.dirname, "..");
  const bash = readFileSync(join(scripts, "harbor-eval.sh"), "utf8");
  const powershell = readFileSync(join(scripts, "harbor-eval.ps1"), "utf8");
  assert.match(bash, /harbor-cli\.ts" eval --/);
  assert.match(powershell, /harbor-cli\.ts"\) eval --/);
  assert.doesNotMatch(bash, /resolve_podman_docker_host/);
  assert.doesNotMatch(powershell, /Resolve-PodmanDockerHost/);
  assert.doesNotMatch(powershell, /^param\(/m, "PowerShell param binder must not consume Harbor --flags");
  assert.match(powershell, /With no param\(\) binder, Harbor flags remain opaque/);

  for (const name of ["start-gui.sh", "start-gui.ps1", "stop-gui.sh", "stop-gui.ps1"]) {
    assert.match(readFileSync(join(scripts, name), "utf8"), /gui-lifecycle\.ts/);
  }
});
