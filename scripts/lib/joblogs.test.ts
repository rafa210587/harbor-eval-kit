import { test } from "node:test";
import assert from "node:assert/strict";
import { appendFileSync, mkdtempSync, mkdirSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { listJobLogFiles, listJobLogs, tailJobLog } from "./joblogs.ts";

test("log redaction protects append boundaries and arbitrary offsets while retaining byte positions", () => {
  const root = mkdtempSync(join(tmpdir(), "hek-log-redaction-")), job = join(root, "job"), secret = "fixture-value";
  mkdirSync(job);
  const file = join(job, "trial.log"), secrets = { PROVIDER_AUTH: secret };
  try {
    writeFileSync(file, "start " + secret.slice(0, 9));
    const first = tailJobLog(root, "job", "trial.log", 0, secrets)!;
    assert.equal(first.content, "start ");
    appendFileSync(file, secret.slice(9) + " end\n");
    const second = tailJobLog(root, "job", "trial.log", first.nextOffset, secrets)!;
    assert.equal(second.content, "*".repeat(secret.length) + " end\n");
    assert.equal(second.nextOffset, second.size);
    assert.equal(tailJobLog(root, "job", "trial.log", 10, secrets)!.content, "*".repeat(secret.length - 4) + " end\n");
    writeFileSync(file, "x".repeat(200_000) + secret + "\n");
    const truncated = tailJobLog(root, "job", "trial.log", 0, secrets)!;
    assert.equal(truncated.truncated, true);
    assert.ok(!truncated.content.includes(secret));
    for (const offset of [-1, 1.5, Infinity]) assert.throws(() => tailJobLog(root, "job", "trial.log", offset, secrets), /offset/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("only known log artifacts are listable and tailable", () => {
  const root = mkdtempSync(join(tmpdir(), "hek-log-allowlist-")), job = join(root, "custom-job");
  mkdirSync(join(job, "agent"), { recursive: true });
  mkdirSync(join(job, "verifier"), { recursive: true });
  try {
    writeFileSync(join(job, "job.log"), "job\n");
    writeFileSync(join(job, "agent", "agent-stdout.txt"), "stdout\n");
    writeFileSync(join(job, "agent", "agent-stderr.txt"), "stderr\n");
    writeFileSync(join(job, "agent", "mini-swe-agent.txt"), "agent\n");
    writeFileSync(join(job, "stdout.txt"), "stdout\n");
    writeFileSync(join(job, "stderr.txt"), "stderr\n");
    writeFileSync(join(job, "verifier", "test-stdout.txt"), "test\n");
    writeFileSync(join(job, "verifier", "test-output.txt"), "test details\n");
    writeFileSync(join(job, "verifier", "reward.txt"), "1\n");
    writeFileSync(join(job, "exception.txt"), "failure\n");
    writeFileSync(join(job, "verifier", "config.txt"), "private-config\n");
    writeFileSync(join(job, "secrets.env"), "PRIVATE_SECRET=fixture\n");

    const files = listJobLogFiles(root, "custom-job");
    for (const expected of ["job.log", "agent/agent-stdout.txt", "agent/agent-stderr.txt", "agent/mini-swe-agent.txt", "stdout.txt", "stderr.txt", "verifier/test-stdout.txt", "verifier/test-output.txt", "verifier/reward.txt", "exception.txt"]) {
      assert.ok(files.includes(expected), `expected ${expected} to be listed`);
    }
    assert.equal(files.includes("verifier/config.txt"), false);
    assert.equal(files.includes("secrets.env"), false);
    assert.equal(tailJobLog(root, "custom-job", "verifier/config.txt", 0), null);
    assert.equal(tailJobLog(root, "custom-job", "secrets.env", 0), null);
    assert.equal(tailJobLog(root, "custom-job", "job.log", 0)?.content, "job\n");

    mkdirSync(join(job, "named.log"));
    assert.equal(listJobLogFiles(root, "custom-job").includes("named.log"), false);
    assert.equal(tailJobLog(root, "custom-job", "named.log", 0), null);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("tail holds an incomplete UTF-8 code point until the next append", () => {
  const root = mkdtempSync(join(tmpdir(), "hek-log-utf8-")), job = join(root, "job"), file = join(job, "trial.log");
  mkdirSync(job);
  try {
    const complete = Buffer.from("before 🔑 after");
    const split = Buffer.byteLength("before ") + 2;
    writeFileSync(file, complete.subarray(0, split));
    const first = tailJobLog(root, "job", "trial.log", 0)!;
    assert.equal(first.content, "before ");
    assert.equal(first.nextOffset, Buffer.byteLength("before "));
    appendFileSync(file, complete.subarray(split));
    const second = tailJobLog(root, "job", "trial.log", first.nextOffset)!;
    assert.equal(second.content, "🔑 after");
    assert.doesNotMatch(first.content + second.content, /�/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("skips symlinked log trees and files", (t) => {
  const root = mkdtempSync(join(tmpdir(), "hek-log-links-")), job = join(root, "job"), outside = mkdtempSync(join(tmpdir(), "hek-log-outside-"));
  mkdirSync(job);
  try {
    writeFileSync(join(job, "job.log"), "safe\n");
    writeFileSync(join(outside, "stolen.log"), "outside-secret\n");
    try {
      symlinkSync(outside, join(job, "linked-trial"), process.platform === "win32" ? "junction" : "dir");
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "EPERM" || code === "EACCES") {
        t.skip("symlink creation is unavailable in this environment");
        return;
      }
      throw error;
    }
    assert.equal(listJobLogFiles(root, "job").some((file) => file.includes("linked-trial")), false);
    assert.equal(tailJobLog(root, "job", "linked-trial/stolen.log", 0), null);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test("orders jobs by the newest listed log, including an appended log", () => {
  const root = mkdtempSync(join(tmpdir(), "hek-log-mtime-"));
  try {
    const first = join(root, "first-job"), second = join(root, "second-job");
    mkdirSync(first);
    mkdirSync(second);
    const firstLog = join(first, "job.log"), secondLog = join(second, "job.log");
    writeFileSync(firstLog, "first\n");
    writeFileSync(secondLog, "second\n");
    const oldTime = new Date("2020-01-01T00:00:00Z"), newTime = new Date("2020-01-02T00:00:00Z");
    utimesSync(firstLog, oldTime, oldTime);
    utimesSync(secondLog, newTime, newTime);
    assert.deepEqual(listJobLogs(root).map((job) => job.name), ["second-job", "first-job"]);

    appendFileSync(firstLog, "appended\n");
    const latest = new Date("2020-01-03T00:00:00Z");
    utimesSync(firstLog, latest, latest);
    const jobs = listJobLogs(root);
    assert.deepEqual(jobs.map((job) => job.name), ["first-job", "second-job"]);
    assert.equal(jobs[0].mtimeMs, statSync(firstLog).mtimeMs);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
