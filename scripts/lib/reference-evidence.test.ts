import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prepareRepositoryAnalysisTarget, restoreRepositoryAnalysisResults } from "./reference-evidence.ts";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
function fixture(t: any) {
  const state = mkdtempSync(join(tmpdir(), "harbor-eval-kit-evidence-test-"));
  t.after(() => rmSync(state, { recursive: true, force: true }));
  const task = join(state, "task"), trial = join(state, "trial"), base = join(state, "base"), preview = join(state, "repository-previews", "fixture-preview");
  for (const dir of [task, base, preview, join(trial, "artifacts", "workspace"), join(trial, "verifier"), join(trial, "agent")]) mkdirSync(dir, { recursive: true });
  writeFileSync(join(task, "repository-eval.json"), JSON.stringify({ previewId: "fixture-preview" }));
  writeFileSync(join(task, "answer-private.txt"), "FULL ANSWER SENTINEL");
  writeFileSync(join(trial, "trial.log"), "RAW LOG SENTINEL");
  writeFileSync(join(trial, "config.json"), JSON.stringify({ task: { path: task }, env: { private: "PRIVATE CONFIG SENTINEL" } }));
  writeFileSync(join(trial, "agent", "trajectory.json"), "TRAJECTORY SENTINEL");
  writeFileSync(join(trial, "verifier", "checks.json"), JSON.stringify({ approved: true, score: 1, results: [{ id: "test", status: "passed", stdout: "RAW OUTPUT SENTINEL" }] }));
  writeFileSync(join(base, "code.txt"), "initial\n"); writeFileSync(join(base, "deleted.txt"), "delete me\n");
  writeFileSync(join(trial, "artifacts", "workspace", "code.txt"), "implemented\n");
  writeFileSync(join(trial, "artifacts", "workspace", "new.txt"), "untracked addition\n");
  const reference = "diff --git a/code.txt b/code.txt\n--- a/code.txt\n+++ b/code.txt\n@@ -1 +1 @@\n-initial\n+reference implementation\n";
  writeFileSync(join(preview, "reference.diff"), reference);
  writeFileSync(join(preview, "preview.json"), JSON.stringify({ previewId: "fixture-preview", recipe: { checks: [{ id: "test", argv: ["true"], cwd: ".", timeoutSec: 10, acceptedExitCodes: [0], weight: 1, required: true }] }, baseRoot: base, documents: [{ path: "spec.md", content: "# Requirements", sha256: hash("# Requirements") }], manifest: { referenceDiffSha256: hash(reference), codeFiles: [{ path: "code.txt", sha256: hash("initial\n") }, { path: "deleted.txt", sha256: hash("delete me\n") }] } }));
  return { state, trial, task, preview };
}

test("repository judge target contains only diffs, docs and allowlisted verifier evidence", t => {
  const { state, trial, task } = fixture(t);
  const target = prepareRepositoryAnalysisTarget(trial, state)!;
  assert.ok(target);
  assert.deepEqual(readdirSync(target.path).sort(), ["candidate.diff", "documents.md", "reference.diff", "result.json", "trial.log", "verification.json"]);
  const text = readdirSync(target.path).map(file => readFileSync(join(target.path, file), "utf8")).join("\n");
  for (const sentinel of ["FULL ANSWER SENTINEL", "RAW LOG SENTINEL", "PRIVATE CONFIG SENTINEL", "TRAJECTORY SENTINEL", "RAW OUTPUT SENTINEL", task]) assert.ok(!text.includes(sentinel));
  const candidate = readFileSync(join(target.path, "candidate.diff"), "utf8");
  assert.match(candidate, /-initial/); assert.match(candidate, /\+implemented/); assert.match(candidate, /untracked addition/); assert.match(candidate, /-delete me/);
  assert.ok(!candidate.includes(state));
  const result = JSON.parse(readFileSync(join(target.path, "result.json"), "utf8"));
  assert.equal(result.config.task.path, undefined);
  assert.equal(result.config.task.name, "harbor-eval-kit/evidence-only");
  assert.equal(result.verifier_result.rewards.reward, 1);
  assert.ok(!existsSync(join(target.path, "artifacts")));
  assert.ok(!readdirSync(join(target.path, "..")).some(name => name.startsWith("work-")));
});

test("repository evidence preserves the configured judge instructions with diff-only guidance", t => {
  const { state, trial } = fixture(t);
  const customPromptPath = join(state, "custom-prompt.txt");
  writeFileSync(customPromptPath, "Explique cada violação de requisito em português. {criteria_guidance}");
  const target = prepareRepositoryAnalysisTarget(trial, state, { customPromptPath })!;
  const prompt = readFileSync(target.promptPath, "utf8");
  assert.match(prompt, /candidate\.diff/);
  assert.match(prompt, /Explique cada violação/);
  assert.ok(!readdirSync(target.path).includes("custom-prompt.txt"));
});

test("missing candidate artifacts and changed reference block analysis", t => {
  const { state, trial, preview } = fixture(t);
  rmSync(join(trial, "artifacts", "workspace"), { recursive: true });
  assert.throws(() => prepareRepositoryAnalysisTarget(trial, state), /Workspace final/);
  mkdirSync(join(trial, "artifacts", "workspace"));
  writeFileSync(join(preview, "reference.diff"), "changed");
  assert.throws(() => prepareRepositoryAnalysisTarget(trial, state), /mudou/);
});

test("binary and sensitive candidate diffs are not partially evaluated", t => {
  const { state, trial } = fixture(t);
  const candidate = join(trial, "artifacts", "workspace", "new.txt");
  writeFileSync(candidate, Buffer.from([0, 1, 2, 3]));
  assert.throws(() => prepareRepositoryAnalysisTarget(trial, state), /binário/);
  writeFileSync(candidate, ["Bearer", "synthetic".repeat(8)].join(" "));
  assert.throws(() => prepareRepositoryAnalysisTarget(trial, state), /sensível/);
});

test("legacy trials remain unchanged and copyback includes completed analysis only", t => {
  const { state, trial, task } = fixture(t);
  const target = prepareRepositoryAnalysisTarget(trial, state)!;
  writeFileSync(join(target.path, "analysis.json"), JSON.stringify({ summary: "checked", criteria: [] }));
  writeFileSync(join(target.path, "untrusted-extra.txt"), "not copied");
  restoreRepositoryAnalysisResults(target);
  assert.equal(JSON.parse(readFileSync(join(trial, "analysis.json"), "utf8")).summary, "checked");
  assert.ok(!existsSync(join(trial, "untrusted-extra.txt")));
  rmSync(join(task, "repository-eval.json"));
  assert.equal(prepareRepositoryAnalysisTarget(trial, state), null);
});

test("mixed legacy and repository jobs require explicit trial selection", t => {
  const { state, trial } = fixture(t);
  writeFileSync(join(state, "job.log"), "");
  const legacy = join(state, "legacy"); mkdirSync(legacy);
  writeFileSync(join(legacy, "trial.log"), "");
  writeFileSync(join(legacy, "config.json"), JSON.stringify({ task: { name: "legacy/task" } }));
  assert.throws(() => prepareRepositoryAnalysisTarget(state, state), /mistura/);
  assert.ok(existsSync(join(trial, "trial.log")));
});

test("failed checks block judging unless diagnostic override is explicit", t => {
  const { state, trial } = fixture(t);
  writeFileSync(join(trial, "verifier", "checks.json"), JSON.stringify({ approved: false, score: 0, results: [{ id: "test", status: "failed" }] }));
  assert.throws(() => prepareRepositoryAnalysisTarget(trial, state), /Julgar falhas/);
  const target = prepareRepositoryAnalysisTarget(trial, state, { allowFailedChecks: true })!;
  assert.equal(JSON.parse(readFileSync(join(target.path, "result.json"), "utf8")).verifier_result.rewards.reward, 0);
});


test("judge recomputes weighted approval from frozen recipe and rejects forged success", t => {
  const { state, trial, preview } = fixture(t);
  const path = join(preview, "preview.json");
  const value = JSON.parse(readFileSync(path, "utf8"));
  value.recipe.threshold = 0.8;
  value.recipe.checks[0].weight = 4;
  value.recipe.checks.push({ ...value.recipe.checks[0], id: "optional", weight: 1, required: false });
  writeFileSync(path, JSON.stringify(value));
  const report = join(trial, "verifier", "checks.json");
  writeFileSync(report, JSON.stringify({ approved: false, score: 0, results: [{ id: "test", status: "passed" }, { id: "optional", status: "failed" }] }));
  const target = prepareRepositoryAnalysisTarget(trial, state)!;
  const summary = JSON.parse(readFileSync(join(target.path, "verification.json"), "utf8"));
  assert.equal(summary.approved, true); assert.equal(summary.score, 0.8);
  writeFileSync(report, JSON.stringify({ approved: true, score: 1, results: [{ id: "test", status: "failed" }, { id: "optional", status: "passed" }] }));
  assert.throws(() => prepareRepositoryAnalysisTarget(trial, state), /Checks falharam/);
  writeFileSync(report, JSON.stringify({ approved: true, results: [{ id: "test", status: "passed" }] }));
  assert.throws(() => prepareRepositoryAnalysisTarget(trial, state), /Checks falharam/);
});
