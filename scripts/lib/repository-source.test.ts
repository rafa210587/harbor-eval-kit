import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prepareRepositorySource, repositoryProcessEnv, safeRepositoryPath, snapshotRepositoryTree, validateRepositoryRemote } from "./repository-source.ts";
import { resolveSpecBundle } from "./spec-bundle.ts";
import { normalizeGithubRepository, resolveHistoricalRange } from "./github-reference.ts";

function fixture(t: any) {
  const root = mkdtempSync(join(tmpdir(), "harbor-eval-kit-repository-test-")), repo = join(root, "repo");
  mkdirSync(repo);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (...args: string[]) => execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", env: { ...repositoryProcessEnv(), GIT_AUTHOR_NAME: "Fixture", GIT_AUTHOR_EMAIL: "fixture@example.invalid", GIT_COMMITTER_NAME: "Fixture", GIT_COMMITTER_EMAIL: "fixture@example.invalid" }, stdio: ["ignore", "pipe", "pipe"], windowsHide: true }).trim();
  git("init", "-b", "main");
  const commit = (name: string, content: string) => { writeFileSync(join(repo, name), content); git("add", "--", name); git("commit", "-m", "fixture"); return git("rev-parse", "HEAD"); };
  return { root, repo, git, commit };
}

test("repository source rejects traversal, secret paths and credentials in Git URLs", () => {
  for (const path of ["../x", "a/../x", "a\\x", "/x", "C:/x", ".git/config", ".env", ".ssh/id_rsa", "x\0md"]) assert.throws(() => safeRepositoryPath(path));
  for (const url of ["https://user:password@github.com/o/r", "https://github.com/o/r?key=abc", "file:///tmp/repo", "ext::evil", "--config=x"]) assert.throws(() => validateRepositoryRemote(url));
  assert.equal(validateRepositoryRemote("git@github.com:owner/repo.git"), "git@github.com:owner/repo.git");
  assert.equal(validateRepositoryRemote("ssh://git@example.org/team/repo.git"), "ssh://git@example.org/team/repo.git");
  assert.equal(normalizeGithubRepository("https://github.com/owner/repo.git"), "owner/repo");
  assert.throws(() => normalizeGithubRepository("owner/repo?x=1"));
});

test("repository subprocess does not inherit provider tokens or custom Git execution", () => {
  const names = ["EXAMPLE_API_KEY", "GIT_SSH_COMMAND", "GIT_CONFIG_COUNT", "GH_TOKEN"];
  const previous = names.map(name => process.env[name]);
  try {
    names.forEach(name => { process.env[name] = "fixture-sensitive-value"; });
    const env = repositoryProcessEnv();
    names.forEach(name => assert.equal(env[name], undefined));
    assert.equal(env.GIT_TERMINAL_PROMPT, "0");
  } finally { names.forEach((name, index) => { if (previous[index] === undefined) delete process.env[name]; else process.env[name] = previous[index]; }); }
});

test("snapshot uses requested commit, excludes future/uncommitted changes and original Git metadata", t => {
  const { root, repo, git, commit } = fixture(t);
  const base = commit("code.txt", "base\n");
  commit("future.txt", "future sentinel\n");
  writeFileSync(join(repo, "code.txt"), "dirty checkout\n");
  const snapshot = prepareRepositorySource({ kind: "local", location: repo, ref: base }, join(root, "snapshot"));
  assert.equal(snapshot.revision, base);
  assert.deepEqual(snapshot.files.map(file => file.path), ["code.txt"]);
  assert.equal(readFileSync(join(snapshot.root, "code.txt"), "utf8"), "base\n");
  assert.equal(readFileSync(join(repo, "code.txt"), "utf8"), "dirty checkout\n");
  assert.match(git("status", "--porcelain"), /code.txt/);
});

test("working tree requires explicit selection and refuses snapshot inside source", t => {
  const { root, repo, commit } = fixture(t);
  commit("code.txt", "base\n");
  writeFileSync(join(repo, "code.txt"), "dirty\n");
  const snapshot = prepareRepositorySource({ kind: "local", location: repo, includeWorkingTree: true }, join(root, "working"));
  assert.equal(snapshot.revision, null);
  assert.equal(readFileSync(join(snapshot.root, "code.txt"), "utf8"), "dirty\n");
  assert.throws(() => prepareRepositorySource({ kind: "local", location: repo, includeWorkingTree: true }, join(repo, "nested")));
});

test("plain folder nested under Git does not accidentally snapshot the parent repository", t => {
  const { root, repo, commit } = fixture(t);
  commit("parent-only.txt", "not selected\n");
  const docs = join(repo, "docs"); mkdirSync(docs);
  writeFileSync(join(docs, "spec.md"), "# selected document\n");
  const snapshot = prepareRepositorySource({ kind: "local", location: docs }, join(root, "nested-folder"));
  assert.equal(snapshot.revision, null);
  assert.deepEqual(snapshot.files.map(file => file.path), ["spec.md"]);
});

test("snapshot containment resolves destination ancestor aliases before writing", t => {
  const { root, repo } = fixture(t);
  const alias = join(root, "alias");
  symlinkSync(repo, alias, process.platform === "win32" ? "junction" : "dir");
  assert.throws(() => prepareRepositorySource({ kind: "local", location: repo, includeWorkingTree: true }, join(alias, "new", "snapshot")), /dentro da fonte/);
});

test("Git root accepts Windows path case differences", { skip: process.platform !== "win32" }, t => {
  const { root, repo, commit } = fixture(t);
  const base = commit("code.txt", "base\n");
  const snapshot = prepareRepositorySource({ kind: "local", location: repo.toUpperCase(), ref: base }, join(root, "case-snapshot"));
  assert.equal(snapshot.revision, base);
});

test("Git snapshots accept Windows short paths and still enforce containment", { skip: process.platform !== "win32" }, t => {
  const { root, repo, commit } = fixture(t);
  const base = commit("code.txt", "base\n");
  const shortRoot = execFileSync("cmd.exe", ["/d", "/c", 'for %I in ("%HEK_TEST_LONG_PATH%") do @echo %~sI'], {
    encoding: "utf8", windowsHide: true, windowsVerbatimArguments: true,
    env: { ...repositoryProcessEnv(), HEK_TEST_LONG_PATH: root },
  }).trim();
  if (!shortRoot.includes("~")) return t.skip("This filesystem does not generate Windows 8.3 aliases.");
  const shortRepo = join(shortRoot, "repo");
  const snapshot = prepareRepositorySource({ kind: "local", location: shortRepo, ref: base }, join(root, "short-snapshot"));
  assert.equal(snapshot.revision, base);
  assert.throws(() => prepareRepositorySource({ kind: "local", location: repo, includeWorkingTree: true }, join(shortRepo, "nested")), /dentro da fonte/);
});

test("snapshot refuses credential content even in an ordinary source filename", t => {
  const { root, repo, commit } = fixture(t);
  commit("source.txt", ["Bearer", "synthetic".repeat(8)].join(" "));
  assert.throws(() => prepareRepositorySource({ kind: "local", location: repo }, join(root, "sensitive")), /sensível/);
});

test("Git symlink entries are refused before materialization", t => {
  const { root, repo, git, commit } = fixture(t);
  commit("normal.txt", "ordinary\n");
  const blob = git("hash-object", "normal.txt");
  git("update-index", "--add", "--cacheinfo", `120000,${blob},escape`);
  git("commit", "-m", "symlink fixture");
  assert.throws(() => snapshotRepositoryTree(repo, git("rev-parse", "HEAD"), join(root, "snapshot")), /simbólicos/);
});

test("Markdown bundle lists linked plan/tasks without automatically reading them", t => {
  const { repo } = fixture(t);
  writeFileSync(join(repo, "spec.md"), "# Spec\n[plan](plan.md) [escape](../secret.md) [remote](https://example.org/tasks.md)\n");
  writeFileSync(join(repo, "plan.md"), "# Plan\n[spec](spec.md)\n");
  const preview = resolveSpecBundle(repo, "spec.md");
  assert.deepEqual(preview.suggestedPaths, ["plan.md"]);
  assert.equal(preview.documents.length, 1);
  assert.equal(resolveSpecBundle(repo, "spec.md", ["plan.md"]).documents.length, 2);
  assert.throws(() => resolveSpecBundle(repo, "../secret.md"));
  assert.throws(() => resolveSpecBundle(repo, "spec.md", Array.from({ length: 100 }, (_, i) => `${i}.md`)), /100/);
  writeFileSync(join(repo, "large.md"), "x".repeat(1024 * 1024 + 1));
  assert.throws(() => resolveSpecBundle(repo, "large.md"), /MiB/);
});

test("historical merge includes entire PR and excludes later commits", t => {
  const { repo, git, commit } = fixture(t);
  const base = commit("base.txt", "base\n");
  git("checkout", "-b", "feature");
  const first = commit("first.txt", "first PR change\n"), headSha = commit("second.txt", "second PR change\n");
  git("checkout", "main");
  git("merge", "--no-ff", "feature", "-m", "merge fixture");
  const mergeSha = git("rev-parse", "HEAD");
  commit("future.txt", "FUTURE SENTINEL\n");
  const range = resolveHistoricalRange(repo, { mergeSha, headSha, mergedAt: "2026-09-08", commitShas: [first, headSha] });
  assert.equal(range.baseSha, base);
  assert.equal(range.finalSha, mergeSha);
  assert.equal(range.mergeMethod, "merge");
  assert.match(range.diff, /first PR change/); assert.match(range.diff, /second PR change/);
  assert.doesNotMatch(range.diff, /FUTURE SENTINEL/);
  assert.throws(() => resolveHistoricalRange(repo, { mergeSha, headSha, mergedAt: "2026-09-08", commitShas: [first, headSha] }, mergeSha));
});

test("historical squash proves aggregate PR patches", t => {
  const { repo, git, commit } = fixture(t);
  const base = commit("base.txt", "base\n");
  git("checkout", "-b", "feature");
  const first = commit("first.txt", "first\n"), headSha = commit("second.txt", "second\n");
  git("checkout", "main"); git("merge", "--squash", "feature"); git("commit", "-m", "squash fixture");
  const mergeSha = git("rev-parse", "HEAD");
  const range = resolveHistoricalRange(repo, { mergeSha, headSha, mergedAt: "2026-09-08", commitShas: [first, headSha] });
  assert.equal(range.mergeMethod, "squash"); assert.equal(range.baseSha, base);
});

test("historical rebase requires explicit proven full range and rejects extra commits", t => {
  const { repo, git, commit } = fixture(t);
  const originalBase = commit("base.txt", "base\n");
  git("checkout", "-b", "feature");
  const first = commit("first.txt", "first\n"), headSha = commit("second.txt", "second\n");
  git("checkout", "main"); const base = commit("unrelated.txt", "upstream\n");
  git("cherry-pick", first, headSha);
  const mergeSha = git("rev-parse", "HEAD"), evidence = { mergeSha, headSha, mergedAt: "2026-09-08", commitShas: [first, headSha] };
  assert.throws(() => resolveHistoricalRange(repo, evidence), /ambíguo/);
  const range = resolveHistoricalRange(repo, evidence, base);
  assert.equal(range.mergeMethod, "rebase"); assert.equal(range.baseSha, base);
  assert.doesNotMatch(range.diff, /upstream/);
  assert.throws(() => resolveHistoricalRange(repo, evidence, originalBase), /quantidade/);
});
