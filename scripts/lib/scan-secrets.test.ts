import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { tmpdir } from "node:os";

test("scanner rejects a synthetic credential without echoing its value", () => {
  const root = mkdtempSync(join(tmpdir(), "harbor-eval-kit-scanner-test-"));
  try {
    const file = join(root, "fixture.txt");
    const planted = ["sk", "ant", "Z".repeat(40)].join("-");
    writeFileSync(file, planted);
    const gitRoot = process.platform === "win32" ? dirname(dirname(dirname(execFileSync("git", ["--exec-path"], { encoding: "utf8" }).trim()))) : "";
    const bash = process.platform === "win32" ? join(gitRoot, "bin", "bash.exe") : "bash";
    const result = spawnSync(bash, ["scripts/scan-secrets.sh", file.replaceAll("\\", "/")], { cwd: resolve(import.meta.dirname, "..", ".."), encoding: "utf8", timeout: 60000 });
    assert.equal(result.status, 1, result.error?.message);
    assert.ok(!`${result.stdout}${result.stderr}`.includes(planted));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
