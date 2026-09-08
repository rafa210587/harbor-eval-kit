import { test } from "node:test";
import assert from "node:assert/strict";
import { viewerUrlFromOutput } from "./viewer-process.ts";

test("viewer URL accepts only an explicit loopback HTTP endpoint", () => {
  assert.equal(viewerUrlFromOutput("Server: http://127.0.0.1:8080\n"), "http://127.0.0.1:8080/");
  assert.equal(viewerUrlFromOutput("Server: http://localhost:8081/path\u001b[0m"), "http://localhost:8081/path");
  assert.equal(viewerUrlFromOutput("Server: http://[::1]:8082"), "http://[::1]:8082/");
  assert.equal(viewerUrlFromOutput("see https://example.com:443 first"), null);
  assert.equal(viewerUrlFromOutput("http://127.0.0.1:99999"), null);
});
