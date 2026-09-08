import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { saveHarnessIntegration } from "./harness-integrations.ts";
import { freezeJudgeConnection, resolveJudgeConnection } from "./judge-harness.ts";
import { validateRegistryEntry } from "./registry-validation.ts";

test("judge connection reuses isolated API bindings and rejects changes after session freeze", t => {
  const stateDir = mkdtempSync(join(tmpdir(), "harbor-eval-kit-judge-"));
  t.after(() => rmSync(stateDir, { recursive: true, force: true }));
  const options = { stateDir, secrets: { FIXTURE: ["synthetic", "private", "value"].join("-") } };
  const integration = { id: "judge-cli", label: "Judge", adapter: "codex", authMode: "api", credentialEnv: "FIXTURE", trustedRepository: true, version: "0.153.4" };
  saveHarnessIntegration(integration, options);
  const frozen = freezeJudgeConnection(integration.id, options);
  assert.ok(!JSON.stringify(frozen).includes(options.secrets.FIXTURE));
  const run = resolveJudgeConnection(frozen, "codex", "openai/gpt-5", options)!;
  assert.deepEqual(run.extraEnv, { OPENAI_API_KEY: options.secrets.FIXTURE });
  assert.equal("timeoutMs" in run, false);
  assert.deepEqual(run.extraArgs, ["--ak", "version=0.153.4"]);
  assert.throws(() => resolveJudgeConnection(frozen, "claude-code", "gpt-5", options), /Adapter/);
  saveHarnessIntegration({ ...integration, version: "0.153.5" }, options);
  assert.throws(() => resolveJudgeConnection(frozen, "codex", "gpt-5", options), /alterada/);
  assert.equal(resolveJudgeConnection({}, "mini-swe-agent", "deepseek/model", options), null);
  validateRegistryEntry("judges", { id: "judge", label: "Judge", agentValue: "codex", integrationId: integration.id });
});

test("judge native bindings use OAuth or explicit auth file without API fallback", t => {
  const stateDir = mkdtempSync(join(tmpdir(), "harbor-eval-kit-judge-native-"));
  t.after(() => rmSync(stateDir, { recursive: true, force: true }));
  const options = { stateDir, secrets: { SESSION: ["synthetic", "oauth", "value"].join("-") } };
  saveHarnessIntegration({ id: "claude", label: "Claude", adapter: "claude-code", authMode: "native", credentialEnv: "SESSION", trustedRepository: true }, options);
  const claude = resolveJudgeConnection(freezeJudgeConnection("claude", options), "claude-code", "anthropic/claude-opus", options)!;
  assert.deepEqual(Object.keys(claude.extraEnv).sort(), ["CLAUDE_CODE_OAUTH_TOKEN", "CLAUDE_FORCE_OAUTH"]);
  const authFilePath = join(stateDir, "session.json");
  writeFileSync(authFilePath, JSON.stringify({ tokens: { access_token: options.secrets.SESSION } }));
  saveHarnessIntegration({ id: "codex", label: "Codex", adapter: "codex", authMode: "native", authFilePath, trustedRepository: true }, options);
  const frozen = freezeJudgeConnection("codex", options);
  assert.ok(!JSON.stringify(frozen).includes(authFilePath));
  assert.deepEqual(resolveJudgeConnection(frozen, "codex", "gpt-5", options)!.extraEnv, { CODEX_AUTH_JSON_PATH: authFilePath });
});
