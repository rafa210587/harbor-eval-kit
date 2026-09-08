import { test } from "node:test";
import assert from "node:assert/strict";
import { publicJson } from "./public-json.ts";

test("public response redacts native values and fails closed if the reader breaks", () => {
  const value = ["synthetic", "session", "value"].join("-");
  const result = publicJson(200, { message: `prefix ${value}` }, () => ({ fixture: value }));
  assert.equal(result.status, 200);
  assert.equal(JSON.parse(result.body).message, "prefix [REDACTED]");
  const unavailable = publicJson(200, { message: value }, () => { throw new Error(value); });
  assert.equal(unavailable.status, 503);
  assert.ok(!unavailable.body.includes(value));
  assert.equal(JSON.parse(unavailable.body).ok, false);
});
