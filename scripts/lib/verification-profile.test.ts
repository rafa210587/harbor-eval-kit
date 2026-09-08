import { test } from "node:test";
import assert from "node:assert/strict";
import { validateVerificationChecks, verificationVerdict, validateSafeVerificationChecks, type VerificationCheck } from "./verification-profile.ts";
const checks: VerificationCheck[] = [
  { id: "tests", argv: ["python3", "-m", "unittest"], cwd: ".", timeoutSec: 60, acceptedExitCodes: [0], weight: 1, required: true },
  { id: "lint", argv: ["ruff", "check", "."], cwd: ".", timeoutSec: 60, acceptedExitCodes: [0], weight: 100, required: false },
];
test("required failure cannot be hidden by weight or threshold", () => {
  assert.equal(verificationVerdict(checks, [{ id: "tests", status: "failed" }, { id: "lint", status: "passed" }], .1).approved, false);
  assert.equal(verificationVerdict(checks, checks.map(c => ({ id: c.id, status: "passed" }))).approved, true);
});
test("empty, missing, duplicate, unknown and infrastructure results never approve", () => {
  assert.throws(() => verificationVerdict([], []));
  assert.equal(verificationVerdict(checks, [], 0).approved, false);
  assert.equal(verificationVerdict(checks, [{ id: "tests", status: "passed" }], 0).complete, false);
  assert.throws(() => verificationVerdict(checks, [{ id: "oops", status: "passed" }]));
  assert.throws(() => verificationVerdict(checks, [{ id: "tests", status: "passed" }, { id: "tests", status: "passed" }]));
  assert.equal(verificationVerdict(checks, [{ id: "tests", status: "passed" }, { id: "lint", status: "infrastructure-error" }], 0).approved, false);
});
test("verifier schema rejects traversal, injected fields, invalid limits and missing reports", () => {
  for (const patch of [{ cwd: "../escape" }, { cwd: "C:/outside" }, { cwd: "a\\b" }, { timeoutSec: 0 },
    { weight: NaN }, { argv: [] }, { argv: ["echo\ncommand"] }, { acceptedExitCodes: [-1] }, { required: "yes" },
    { parser: "junit" }, { reportPath: "unused.xml" }, { env: { SOMETHING: "value" } }]) {
    assert.throws(() => validateVerificationChecks([{ ...checks[0], ...patch }]));
  }
  assert.throws(() => validateSafeVerificationChecks([{ ...checks[0], argv: ["echo", "fixture-sensitive-value"] }], { PRIVATE: "fixture-sensitive-value" }));
});
