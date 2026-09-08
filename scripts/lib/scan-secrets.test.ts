import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { tmpdir } from "node:os";

function resolveBash(): string {
  const candidates = process.platform === "win32"
    ? [join(dirname(dirname(dirname(execFileSync("git", ["--exec-path"], { encoding: "utf8" }).trim()))), "bin", "bash.exe")]
    : ["/bin/bash", "/usr/bin/bash"];
  for (const candidate of candidates) if (existsSync(candidate)) return candidate;
  // Keep lookup in the parent environment. Callers deliberately replace PATH after this
  // resolver returns to exercise the scanner's missing-tool path.
  const shell = process.platform === "win32" ? "sh" : "/bin/sh";
  try {
    const found = execFileSync(shell, ["-c", "command -v bash"], { encoding: "utf8", env: process.env }).trim();
    if (found && existsSync(found)) return found;
  } catch { /* report a clear test failure below */ }
  throw new Error("bash não encontrado no ambiente de teste");
}

test("scanner rejects a synthetic credential without echoing its value", () => {
  const root = mkdtempSync(join(tmpdir(), "harbor-eval-kit-scanner-test-"));
  try {
    const file = join(root, "fixture.txt");
    const planted = ["sk", "ant", "Z".repeat(40)].join("-");
    writeFileSync(file, planted);
    const bash = resolveBash();
    const result = spawnSync(bash, ["scripts/scan-secrets.sh", file.replaceAll("\\", "/")], { cwd: resolve(import.meta.dirname, "..", ".."), encoding: "utf8", timeout: 60000 });
    assert.equal(result.status, 1, result.error?.message);
    assert.ok(!`${result.stdout}${result.stderr}`.includes(planted));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("scanner falha fechado sem grep e não ecoa o segredo sintético", () => {
  const root = mkdtempSync(join(tmpdir(), "harbor-eval-kit-scanner-path-test-"));
  try {
    const file = join(root, "fixture.txt");
    const planted = ["sk", "ant", "Y".repeat(40)].join("-");
    writeFileSync(file, planted);
    const bash = resolveBash();
    const noToolsEnv = { ...process.env };
    delete noToolsEnv.Path;
    delete noToolsEnv.PATH;
    noToolsEnv.PATH = root;
    const script = `scripts/scan-secrets.sh '${file.replaceAll("'", "'\\''").replaceAll("\\", "/")}'`;
    // Git Bash injects /usr/bin when a stripped PATH reaches its MSYS runtime. An exported
    // failing function models the same missing-tool execution path while keeping this test
    // deterministic on Windows; Linux/macOS exercise the literal PATH-without-grep case.
    const args = process.platform === "win32"
      ? ["--noprofile", "--norc", "-c", `grep() { return 2; }; export -f grep; bash ${script}`]
      : ["scripts/scan-secrets.sh", file.replaceAll("\\", "/")];
    const result = spawnSync(bash, args, {
      cwd: resolve(import.meta.dirname, "..", ".."),
      encoding: "utf8",
      timeout: 60000,
      env: noToolsEnv,
    });
    assert.equal(result.status, 2, result.error?.message);
    assert.ok(!`${result.stdout}${result.stderr}`.includes(planted));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
