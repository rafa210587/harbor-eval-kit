import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getHarnessSecretValues, readNativeAuthSecretValues } from "./harness-sensitive.ts";
import { saveHarnessIntegration, resolveHarnessRun } from "./harness-integrations.ts";
import { assertSafeExport } from "./export-safety.ts";

test("explicit native bindings supply nested exact redaction values without exporting sessions", () => {
  const stateDir = mkdtempSync(join(tmpdir(), "harbor-eval-kit-native-"));
  try {
    const authFilePath = join(stateDir, "session.json");
    const canary = "synthetic-native-session-canary";
    writeFileSync(authFilePath, JSON.stringify({ tokens: { access_token: canary, refresh_token: ["synthetic", "refresh", "value"].join("-"), id_token: "synthetic-id-value" }, account_id: "not-a-token" }));
    saveHarnessIntegration({ id: "native", label: "Native", adapter: "codex", authMode: "native", authFilePath, trustedRepository: true }, { stateDir, secrets: {} });
    const values = getHarnessSecretValues(stateDir);
    assert.equal(values.length, 3); assert.ok(values.includes(canary)); assert.equal(values.includes("not-a-token"), false);
    const run = resolveHarnessRun("native", "openai/model", { stateDir, secrets: {}, trustedRepository: true });
    assert.ok(run.redactValues.includes(canary)); assert.equal(JSON.stringify(run.extraArgs).includes(canary), false);
    assert.throws(() => assertSafeExport({ text: canary }, Object.fromEntries(values.map((v, i) => [`NATIVE_${i}`, v]))));
    for (const model of ["openai/team/model", "anthropic/model"]) assert.throws(() => resolveHarnessRun("native", model, { stateDir, secrets: {}, trustedRepository: true }));
  } finally { rmSync(stateDir, { recursive: true, force: true }); }
});
test("native file parser bounds size and sanitizes malformed JSON", () => {
  const dir = mkdtempSync(join(tmpdir(), "harbor-eval-kit-native-"));
  try {
    const path = join(dir, "auth.json");
    for (const content of ["synthetic-secret invalid json", "x".repeat(1024 * 1024 + 1)]) {
      writeFileSync(path, content);
      assert.throws(() => readNativeAuthSecretValues(path), error => error instanceof Error && !error.message.includes("synthetic-secret") && /autenticação/.test(error.message));
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("native parser rejects user-controlled directory links even when they point to valid JSON", () => {
  const dir = mkdtempSync(join(tmpdir(), "harbor-eval-kit-native-"));
  try {
    const actual = join(dir, "actual"), alias = join(dir, "alias");
    mkdirSync(actual); writeFileSync(join(actual, "auth.json"), "{}");
    symlinkSync(actual, alias, process.platform === "win32" ? "junction" : "dir");
    assert.throws(() => readNativeAuthSecretValues(join(alias, "auth.json")), /autenticação/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
