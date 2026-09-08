import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { listHarnessIntegrations, saveHarnessIntegration, deleteHarnessIntegration, diagnoseHarnessIntegration, discoverHarnessModels, resolveHarnessRun, runHarnessProbe, type HarnessIntegration } from "./harness-integrations.ts";
import { validateRegistryEntry } from "./registry-validation.ts";
const connection: HarnessIntegration = { id: "demo", label: "Demo", adapter: "codex", authMode: "api", trustedRepository: true };
test("host probes execute outside the project working directory", async () => {
  const output = await runHarnessProbe(process.execPath, ["-e", "process.stdout.write(process.cwd())"]);
  assert.equal(output, dirname(process.execPath));
});
function fixture() {
  const stateDir = mkdtempSync(join(tmpdir(), "harbor-eval-kit-harness-"));
  return { options: { stateDir, secrets: { OPENAI_API_KEY: ["fixture", "sensitive", "inference", "value"].join("-") } }, cleanup: () => rmSync(stateDir, { recursive: true, force: true }) };
}
test("harness store excludes auth paths from views and preserves secrets outside metadata", () => {
  const f = fixture(); try {
    const saved = saveHarnessIntegration({ ...connection, authMode: "native", authFilePath: join(f.options.stateDir, "auth.json") }, f.options);
    assert.equal(saved.hasAuthFile, true); assert.equal("authFilePath" in saved, false);
    assert.equal(JSON.stringify(listHarnessIntegrations(f.options)).includes(f.options.stateDir), false);
    assert.throws(() => saveHarnessIntegration({ ...connection, label: f.options.secrets.OPENAI_API_KEY }, f.options));
    assert.throws(() => saveHarnessIntegration({ ...connection, apiKey: "bad" }, f.options));
    deleteHarnessIntegration("demo", f.options); assert.deepEqual(listHarnessIntegrations(f.options), []);
  } finally { f.cleanup(); }
});
test("corrupt harness store refuses overwrite and does not echo contents", () => {
  const f = fixture(); try {
    const path = join(f.options.stateDir, "harness-integrations.json");
    writeFileSync(path, "private broken content");
    assert.throws(() => saveHarnessIntegration(connection, f.options), /corrompido/);
    assert.equal(readFileSync(path, "utf8"), "private broken content");
  } finally { f.cleanup(); }
});
test("API resolver selects only bound inference credential, safe kwargs and trust gate", () => {
  const f = fixture(); try {
    saveHarnessIntegration({ ...connection, version: "0.118.0" }, f.options);
    const run = resolveHarnessRun("demo", "openai/model", { ...f.options, trustedRepository: true });
    assert.equal(run.snapshot.version, "0.118.0");
    assert.equal(JSON.stringify(run.snapshot).includes(f.options.secrets.OPENAI_API_KEY), false);
    assert.equal("authFilePath" in run.snapshot, false);
    assert.deepEqual(run.extraEnv, f.options.secrets); assert.deepEqual(run.extraArgs, ["--ak", "version=0.118.0"]);
    assert.equal(JSON.stringify(run.extraArgs).includes(f.options.secrets.OPENAI_API_KEY), false);
    assert.throws(() => resolveHarnessRun("demo", "openai/model", { ...f.options, trustedRepository: false }), /confiável/);
    for (const model of ["openai/model;whoami", "openai/a/b", "$(whoami)"]) assert.throws(() => resolveHarnessRun("demo", model, { ...f.options, trustedRepository: true }));
  } finally { f.cleanup(); }
});
test("native sessions never use host auth implicitly and unsupported adapters fail closed", () => {
  const f = fixture(); try {
    saveHarnessIntegration({ ...connection, authMode: "native" }, f.options);
    assert.throws(() => resolveHarnessRun("demo", "model", { ...f.options, trustedRepository: true }), /explicitamente/);
    const auth = join(f.options.stateDir, "auth.json"); writeFileSync(auth, "{}");
    saveHarnessIntegration({ ...connection, authMode: "native", authFilePath: auth }, f.options);
    saveHarnessIntegration({ ...connection, label: "Edited", authMode: "native" }, f.options);
    assert.deepEqual(resolveHarnessRun("demo", "model", { ...f.options, trustedRepository: true }).extraEnv, { CODEX_AUTH_JSON_PATH: auth });
    for (const adapter of ["cursor-cli", "opencode"] as const) {
      saveHarnessIntegration({ ...connection, adapter, authMode: "native" }, f.options);
      assert.throws(() => resolveHarnessRun("demo", "provider/model", { ...f.options, trustedRepository: true }), /não suportado/);
    }
  } finally { f.cleanup(); }
});
test("diagnostic sanitizes failures and discovery calls only version/models for OpenCode 1.x", async () => {
  const f = fixture(); try {
    saveHarnessIntegration({ ...connection, adapter: "opencode" }, f.options);
    const commands: string[][] = [];
    const probe = async (_: string, args: string[]) => { commands.push(args); return args[0] === "--version" ? "1.4.2\n" : "openai/model\ninvalid;command\nopenai/model\n"; };
    const result = await discoverHarnessModels("demo", f.options, probe);
    assert.deepEqual(result.models, ["openai/model"]); assert.deepEqual(commands, [["--version"], ["models"]]);
    const diagnostic = await diagnoseHarnessIntegration("demo", f.options, async () => { throw new Error(f.options.secrets.OPENAI_API_KEY); });
    assert.equal(diagnostic.available, false); assert.equal(JSON.stringify(diagnostic).includes(f.options.secrets.OPENAI_API_KEY), false);
    assert.equal((await discoverHarnessModels("demo", f.options, async () => "2.0.0")).supported, false);
  } finally { f.cleanup(); }
});
test("harness rejects authenticated endpoints, unpinnable version and unsafe registry refs", () => {
  const f = fixture(); try {
    for (const baseUrl of ["https://user:pass@example.com", "https://example.com?key=private", "file:///tmp/model"]) assert.throws(() => saveHarnessIntegration({ ...connection, baseUrl }, f.options));
    assert.throws(() => saveHarnessIntegration({ ...connection, adapter: "cursor-cli", version: "1.0.0" }, f.options));
    validateRegistryEntry("agents", { id: "a", label: "A", agentValue: "codex", integrationId: "demo" });
    assert.throws(() => validateRegistryEntry("agents", { id: "a", label: "A", agentValue: "codex", integrationId: "../unsafe" }));
  } finally { f.cleanup(); }
});
