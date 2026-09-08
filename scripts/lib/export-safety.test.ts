import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertSafeExport } from "./export-safety.ts";
import { saveSecret } from "./secrets.ts";
import { writeRegistry } from "./paths.ts";
import { exportConfigBundle } from "./bundle.ts";
import { writeReport } from "./results.ts";

test("export guard refuses nested credentials and values before JSON/CSV encoding", () => {
  const value = 'synthetic"value,with\\escaping';
  const secrets = { QA_EXPORT_MARKER: value };
  for (const input of [
    { notes: `prefix ${value} suffix` },
    { analysis: [{ summary: JSON.stringify(value) }] },
    { credentials: {} }, { apiKey: "example" }, { clientSecret: "example" }, { accessToken: "example" },
    { extraFiles: [{ name: ".env", content: "innocent" }] },
    { extraFiles: [{ name: "nested/credentials.json", content: "{}" }] },
    { instructions: "SERVICE_API_KEY=" + "synthetic-not-a-real-key" },
  ]) assert.throws(() => assertSafeExport(input, secrets), /Exportação bloqueada/);
  assert.doesNotThrow(() => assertSafeExport({ nInputTokens: 100, model: "deepseek/deepseek-v4-flash", instructions: "Configure DEEPSEEK_API_KEY em Credenciais." }, secrets));
});

test("bundle and disk reports never export a registered credential embedded in ordinary text", () => {
  const root = mkdtempSync(join(tmpdir(), "harbor-eval-kit-export-"));
  const previous = process.env.HARBOR_EVAL_STATE_DIR;
  process.env.HARBOR_EVAL_STATE_DIR = join(root, "state");
  try {
    const secret = 'synthetic"quote,comma\\token';
    saveSecret("QA_EXPORT_MARKER", secret);
    writeRegistry("agents", [{ id: "qa", label: "QA", agentValue: "oracle", notes: secret }]);
    assert.throws(exportConfigBundle, /Exportação bloqueada/);
    const prefix = join(root, "report");
    assert.throws(() => writeReport([{ jobName: "qa", agent: "oracle", model: "", skillset: "none", ok: false, error: secret }], prefix), /Exportação bloqueada/);
    assert.equal(existsSync(`${prefix}.json`), false);
    assert.equal(existsSync(`${prefix}.csv`), false);
    writeRegistry("agents", [{ id: "qa", label: "QA", agentValue: "oracle" }]);
    assert.equal(JSON.stringify(exportConfigBundle()).includes(secret), false);
    assert.equal(Object.hasOwn(exportConfigBundle(), "secrets"), false);
  } finally {
    if (previous === undefined) delete process.env.HARBOR_EVAL_STATE_DIR; else process.env.HARBOR_EVAL_STATE_DIR = previous;
    rmSync(root, { recursive: true, force: true });
  }
});
