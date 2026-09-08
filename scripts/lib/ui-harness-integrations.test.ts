import { harnessAuthFields } from "../../gui/app/harness-integrations-domain.js";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { catalogEntries, discoveredModelIds, integrationRequest, integrationSummary } from "../../gui/app/harness-integrations-domain.js";

const catalog = catalogEntries({ adapters: [
  { adapter: "codex", label: "Codex CLI", native: true, versionPin: true, supported: true, discovery: false },
  { adapter: "cursor-cli", label: "Cursor CLI", native: false, supported: true, blockers: ["modo nativo não comprovado"] },
] });

test("harness request follows server catalog and never mixes API and native bindings", () => {
  assert.deepEqual(integrationRequest({ label: "Codex API", adapter: "codex", authMode: "api", version: "1.2.3", credentialEnv: "OPENAI_API_KEY", baseUrl: "https://gateway/v1", authFilePath: "must-not-pass", trustedRepository: true }, catalog), {
    label: "Codex API", adapter: "codex", authMode: "api", trustedRepository: true, version: "1.2.3", credentialEnv: "OPENAI_API_KEY", baseUrl: "https://gateway/v1",
  });
  assert.deepEqual(integrationRequest({ label: "Codex native", adapter: "codex", authMode: "native", authFilePath: "C:/auth.json", credentialEnv: "must-not-pass", trustedRepository: true }, catalog), {
    label: "Codex native", adapter: "codex", authMode: "native", trustedRepository: true, authFilePath: "C:/auth.json",
  });
  assert.throws(() => integrationRequest({ label: "Cursor", adapter: "cursor-cli", authMode: "native", trustedRepository: true }, catalog), /ainda não é suportado/);
  assert.throws(() => integrationRequest({ label: "Codex", adapter: "codex", authMode: "api", trustedRepository: false }, catalog), /confiáveis/);
});

test("catalog and model discovery preserve only declared exact identifiers", () => {
  assert.equal(catalog[0].modelDiscovery, false);
  assert.deepEqual(discoveredModelIds({ models: ["gpt-5", { id: "provider/model" }, "gpt-5", {}, ""] }), ["gpt-5", "provider/model"]);
  assert.deepEqual(discoveredModelIds({ models: null }), []);
});

test("sanitized integration summaries never expose auth file paths", () => {
  const marker = "C:/private/session-marker.json";
  const summary = integrationSummary({ adapter: "codex", version: "1.2", authMode: "native", hasAuthFile: true, authFilePath: marker });
  assert.match(summary, /login nativo vinculado/);
  assert.doesNotMatch(summary, /private|session-marker/);
  const source = readFileSync(new URL("../../gui/app/harness-integrations.js", import.meta.url), "utf8");
  assert.match(source, /\/api\/harness-integrations\/catalog/);
  assert.match(source, /\/api\/harness-integrations\/\$\{encodeURIComponent\(item\.id\)\}\/\$\{type === "models" \? "models" : "diagnose"\}/);
  assert.match(source, /Nenhuma inferência foi enviada/);
  assert.match(source, /authFilePath: undefined/);
});


test("subscription forms never show API fields and use adapter-specific session bindings", () => {
  assert.deepEqual(harnessAuthFields("claude-code", "native"), { api: false, authFile: false, oauth: true });
  assert.deepEqual(harnessAuthFields("codex", "native"), { api: false, authFile: true, oauth: false });
  assert.deepEqual(harnessAuthFields("codex", "api"), { api: true, authFile: false, oauth: false });
  assert.deepEqual(harnessAuthFields("cursor-cli", "native"), { api: false, authFile: false, oauth: false });
});
