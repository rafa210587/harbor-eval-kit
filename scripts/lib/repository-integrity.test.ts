import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { repositoryTreeManifest, assertRepositoryTreeUnchanged } from "./repository-integrity.ts";

test("snapshot integrity rejects changed, deleted and additional files", t => {
  const root = mkdtempSync(join(tmpdir(), "harbor-eval-kit-integrity-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const file = join(root, "code.py");
  writeFileSync(file, "initial");
  const expected = repositoryTreeManifest(root);
  assertRepositoryTreeUnchanged(root, expected);
  writeFileSync(file, "mutated");
  assert.throws(() => assertRepositoryTreeUnchanged(root, expected), /mudou/);
  rmSync(file);
  assert.throws(() => assertRepositoryTreeUnchanged(root, expected), /mudou/);
  writeFileSync(file, "initial"); writeFileSync(join(root, "extra"), "addition");
  assert.throws(() => assertRepositoryTreeUnchanged(root, expected), /mudou/);
});
