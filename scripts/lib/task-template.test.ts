import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { SAFE_TEST_SH_TEMPLATE } from "../../gui/app/task-template.js";

function gitBash(): string {
  if (process.platform !== "win32") return "bash";
  const execPath = execFileSync("git", ["--exec-path"], { encoding: "utf8" }).trim();
  const gitRoot = dirname(dirname(dirname(execPath)));
  return join(gitRoot, "bin", "bash.exe");
}

test("template de verifier falha e grava reward 0 sem aprovar um stub", () => {
  const root = mkdtempSync(join(tmpdir(), "harbor-eval-kit-task-template-test-"));
  try {
    // Run from the fixture and use a shell path variable so Windows Git Bash never receives a
    // native drive path inside the generated script. The template's only changed literal is the
    // verifier output directory; no host /logs path is created.
    const script = SAFE_TEST_SH_TEMPLATE.replaceAll("/logs/verifier", "$PWD/verifier");
    writeFileSync(join(root, "verify.sh"), script, "utf8");
    const result = spawnSync(gitBash(), ["verify.sh"], {
      cwd: root,
      encoding: "utf8",
      timeout: 60000,
    });
    assert.equal(result.status, 1, result.error?.message);
    assert.equal(readFileSync(join(root, "verifier", "reward.txt"), "utf8").trim(), "0");
    assert.match(`${result.stdout}${result.stderr}`, /substitua o stub/);
    assert.doesNotMatch(`${result.stdout}${result.stderr}`, /aprovad|approved/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
