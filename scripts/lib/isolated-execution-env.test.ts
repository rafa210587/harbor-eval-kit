import test from "node:test";
import assert from "node:assert/strict";
import { execCommand, isolatedExecutionEnv } from "./exec.ts";

test("isolated CLI execution preserves bootstrap paths and excludes unrelated auth/proxy state", () => {
  const parent = { PATH: "fixture-path", HOME: "fixture-home", TEMP: "fixture-temp", ANTHROPIC_API_KEY: "unselected", GH_TOKEN: "github-only", HTTP_PROXY: "http://private-proxy", GIT_SSH_COMMAND: "private-helper", OPENAI_BASE_URL: "http://old-gateway", NODE_OPTIONS: "--require=untrusted" };
  const env = isolatedExecutionEnv({ OPENAI_API_KEY: "selected", OPENAI_BASE_URL: "http://configured-gateway" }, parent);
  assert.equal(env.PATH, parent.PATH); assert.equal(env.HOME, parent.HOME); assert.equal(env.TEMP, parent.TEMP);
  for (const key of ["ANTHROPIC_API_KEY", "GH_TOKEN", "HTTP_PROXY", "GIT_SSH_COMMAND", "NODE_OPTIONS"]) assert.equal(env[key], undefined);
  assert.equal(env.OPENAI_API_KEY, "selected"); assert.equal(env.OPENAI_BASE_URL, "http://configured-gateway");
  assert.equal(env.PYTHONUTF8, "1");
  assert.equal(parent.OPENAI_BASE_URL, "http://old-gateway");
});

test("empty isolated native-login environment cannot inherit provider keys", () => {
  const env = isolatedExecutionEnv({}, { ANTHROPIC_API_KEY: "unselected", OPENAI_API_KEY: "unselected", DEEPSEEK_API_KEY: "unselected", USERPROFILE: "fixture-user" });
  assert.equal(env.USERPROFILE, "fixture-user");
  for (const key of ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "DEEPSEEK_API_KEY"]) assert.equal(env[key], undefined);
});

test("isolated execution applies the allowlist to the actual spawned process", async () => {
  const previous = process.env.HARBOR_TEST_UNSELECTED;
  process.env.HARBOR_TEST_UNSELECTED = "fixture-only";
  try {
    const result = await execCommand(process.execPath, ["-e", "process.stdout.write(JSON.stringify({unselected:!!process.env.HARBOR_TEST_UNSELECTED,selected:!!process.env.HARBOR_TEST_SELECTED,utf8:process.env.PYTHONUTF8}))"], { isolatedEnv: true, extraEnv: { HARBOR_TEST_SELECTED: "fixture-only" }, timeoutMs: 10000 });
    assert.equal(result.code, 0);
    assert.deepEqual(JSON.parse(result.stdout), { unselected: false, selected: true, utf8: "1" });
  } finally { if (previous === undefined) delete process.env.HARBOR_TEST_UNSELECTED; else process.env.HARBOR_TEST_UNSELECTED = previous; }
});
