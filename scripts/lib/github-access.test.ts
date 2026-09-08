import test from "node:test";
import assert from "node:assert/strict";
import { diagnoseGithubAccess } from "./github-access.ts";
import { registerGithubAccessRoutes } from "../github-access-routes.ts";

test("GitHub route rejects non-text repositories before probing", async () => {
  let handler: any;
  registerGithubAccessRoutes((method, path, callback) => {
    assert.equal(method, "POST");
    assert.equal(path, "/api/github-access/diagnose");
    handler = callback;
  }, () => assert.fail("must not send a successful response"));
  await assert.rejects(handler({}, {}, {}, { repository: { token: "fixture" } }), /como texto/);
});

test("GitHub diagnostic rejects credential URLs before spawning a process", async () => {
  for (const repository of ["https://user:secret@github.com/o/r", "o/r?token=secret", "--help", "../r"]) {
    await assert.rejects(diagnoseGithubAccess(repository, async () => { assert.fail("must not spawn"); }));
  }
});

test("GitHub diagnostic uses local gh identity, no inherited tokens, and read-only commands", async () => {
  const names = ["GH_TOKEN", "GITHUB_TOKEN", "ANTHROPIC_API_KEY", "GIT_CONFIG_COUNT", "GH_CONFIG_DIR"];
  const previous = names.map(name => process.env[name]);
  const calls: { command: string; args: string[] }[] = [];
  try {
    names.forEach(name => { process.env[name] = "fixture-sensitive-value"; });
    const result = await diagnoseGithubAccess("https://github.com/owner/repo.git", async (command, args, env) => {
      names.forEach(name => assert.equal(env[name], undefined));
      assert.equal(env.GIT_TERMINAL_PROMPT, "0");
      calls.push({ command, args });
      return true;
    });
    assert.equal(result.gitReadable, true);
    assert.equal(result.repositoryReadable, true);
    assert.equal(result.repository, "owner/repo");
    assert.deepEqual(calls.slice(0, 3), [
      { command: "gh", args: ["--version"] },
      { command: "gh", args: ["api", "--hostname", "github.com", "user", "--jq", ".login"] },
      { command: "gh", args: ["api", "--hostname", "github.com", "repos/owner/repo", "--jq", ".full_name"] },
    ]);
    assert.equal(calls[3].command, "git");
    assert.ok(calls[3].args.includes("credential.https://github.com.helper=!gh auth git-credential"));
    assert.deepEqual(calls[3].args.slice(-4), ["ls-remote", "--", "https://github.com/owner/repo.git", "HEAD"]);
    assert.doesNotMatch(JSON.stringify(result), /fixture-sensitive-value|token|loginName/);
  } finally { names.forEach((name, index) => { if (previous[index] === undefined) delete process.env[name]; else process.env[name] = previous[index]; }); }
});

test("GitHub diagnostic reports missing CLI, login failure and distinct repository failures", async () => {
  const absent = await diagnoseGithubAccess("", async () => false);
  assert.equal(absent.available, false);
  const login = await diagnoseGithubAccess("", async (_command, args) => args[0] === "--version");
  assert.equal(login.available, true);
  assert.equal(login.authenticated, false);
  const identity = await diagnoseGithubAccess("", async () => true);
  assert.equal(identity.authenticated, true);
  assert.equal(identity.repositoryReadable, undefined);
  let count = 0;
  const denied = await diagnoseGithubAccess("owner/repo", async () => ++count < 3);
  assert.equal(denied.authenticated, true);
  assert.equal(denied.repositoryReadable, false);
  assert.equal(denied.gitReadable, false);
  assert.equal(count, 3);
  const gitDenied = await diagnoseGithubAccess("owner/repo", async command => command !== "git");
  assert.equal(gitDenied.repositoryReadable, true);
  assert.equal(gitDenied.gitReadable, false);
});
