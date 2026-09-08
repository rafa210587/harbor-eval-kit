import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync } from "node:fs";
import { join, parse } from "node:path";
import { tmpdir } from "node:os";
import { materializeRepositoryTask, type RepositoryTaskInput } from "./repository-task.ts";
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "harbor-eval-kit-repotask-"));
  mkdirSync(join(root, "base")); writeFileSync(join(root, "base", "app.py"), "print('base')\n");
  const input: RepositoryTaskInput = { destination: join(root, "task"), baseRoot: join(root, "base"), documents: [{ path: "spec.md", content: "Implement requirement." }], checks: [{ id: "syntax", argv: ["python3", "-m", "compileall", "."], cwd: ".", timeoutSec: 10, acceptedExitCodes: [0], weight: 1, required: true }], image: "python:3.12-slim", setupScript: "true", label: "Demo", recipeId: "demo" };
  return { root, input, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}
test("materialized task isolates verifier and exposes full base only to candidate", () => {
  const f = fixture(); try {
    const task = materializeRepositoryTask(f.input);
    assert.equal(readFileSync(join(task, "environment/repo/app.py"), "utf8"), "print('base')\n");
    assert.deepEqual(readdirSync(join(task, "environment")).sort(), ["Dockerfile", "repo", "setup.sh"]);
    const toml = readFileSync(join(task, "task.toml"), "utf8");
    assert.match(toml, /environment_mode = "separate"/); assert.match(toml, /network_mode = "no-network"/);
    assert.match(toml, /\[agent\]\ntimeout_sec = 28800/);
    assert.match(toml, /source = "\/workspace", destination = "workspace"/);
    assert.match(readFileSync(join(task, "tests/Dockerfile"), "utf8"), /rm -rf \/workspace/);
    assert.match(readFileSync(join(task, "tests/Dockerfile"), "utf8"), /COPY repository-verifier\.py checks\.json test\.sh \/tests\//);
    assert.match(readFileSync(join(task, "tests/Dockerfile"), "utf8"), /chmod 755 \/tests \/tests\/test\.sh/);
    assert.deepEqual(JSON.parse(readFileSync(join(task, "tests/checks.json"), "utf8")), { checks: f.input.checks, threshold: 1 });
    assert.match(readFileSync(join(task, "tests/test.sh"), "utf8"), /python3 -I/);
    assert.throws(() => materializeRepositoryTask(f.input), /Destino/);
  } finally { f.cleanup(); }
});
test("materialization rejects answer paths, private files and unsafe image/setup", () => {
  const f = fixture(); try {
    assert.throws(() => materializeRepositoryTask({ ...f.input, referenceDiffPath: "answer.diff" } as unknown as RepositoryTaskInput), /Gabarito/);
    assert.throws(() => materializeRepositoryTask({ ...f.input, image: "python:3\nRUN whoami" }), /Imagem/);
    assert.throws(() => materializeRepositoryTask({ ...f.input, destination: join(f.input.baseRoot, "task") }), /Destino/);
    writeFileSync(join(f.input.baseRoot, ".env"), "fixture");
    assert.throws(() => materializeRepositoryTask(f.input), /sensível/);
  } finally { f.cleanup(); }
});

test("materialization accepts a separate Windows drive", { skip: process.platform !== "win32" || parse(tmpdir()).root === parse(process.cwd()).root }, () => {
  const f = fixture();
  mkdirSync(join(process.cwd(), "jobs-test"), { recursive: true });
  const targetRoot = mkdtempSync(join(process.cwd(), "jobs-test", "harbor-eval-kit-cross-drive-"));
  try {
    const path = materializeRepositoryTask({ ...f.input, destination: join(targetRoot, "task") });
    assert.equal(readFileSync(join(path, "environment/repo/app.py"), "utf8"), "print('base')\n");
  } finally { f.cleanup(); rmSync(targetRoot, { recursive: true, force: true }); }
});


test("materializer persists approval threshold and rejects invalid limits before creating files", () => {
  const f = fixture(); try {
    assert.throws(() => materializeRepositoryTask({ ...f.input, threshold: -1 }), /limiar/);
    const task = materializeRepositoryTask({ ...f.input, threshold: 0.8 });
    assert.equal(JSON.parse(readFileSync(join(task, "tests/checks.json"), "utf8")).threshold, 0.8);
  } finally { f.cleanup(); }
});

test("candidate budget supports multi-day specs and rejects invalid seconds before writing", () => {
  const f = fixture(); try {
    for (const agentTimeoutSec of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, null, "3600"]) {
      assert.throws(() => materializeRepositoryTask({ ...f.input, agentTimeoutSec } as RepositoryTaskInput), /Prazo do agente/);
    }
    const task = materializeRepositoryTask({ ...f.input, agentTimeoutSec: 72 * 3600 });
    const toml = readFileSync(join(task, "task.toml"), "utf8");
    assert.match(toml, /\[agent\]\ntimeout_sec = 259200/);
    assert.match(toml, /\[verifier\][\s\S]*timeout_sec = 70/);
  } finally { f.cleanup(); }
});
