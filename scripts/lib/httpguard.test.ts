// Tests for the browser-origin guard. Every case here maps to something that was actually
// possible before it existed: the cross-origin POST was reproduced against the running server
// (it created a registry entry and persisted it), and the rebinding case is the reason Host is
// checked at all rather than trusting Origin alone.

import { test } from "node:test";
import assert from "node:assert/strict";

import { checkRequestOrigin } from "./httpguard.ts";

const PORT = 4173;

test("allows the GUI's own page", () => {
  const r = checkRequestOrigin({ host: `127.0.0.1:${PORT}`, origin: `http://127.0.0.1:${PORT}` }, PORT);
  assert.equal(r.allowed, true);
  assert.equal(r.reason, null);
});

test("allows localhost and [::1] spellings of the same loopback origin", () => {
  for (const h of ["localhost", "[::1]"]) {
    const r = checkRequestOrigin({ host: `${h}:${PORT}`, origin: `http://${h}:${PORT}` }, PORT);
    assert.equal(r.allowed, true, `${h} should be allowed`);
  }
});

test("allows a request with no Origin at all (curl, the kit's own scripts)", () => {
  const r = checkRequestOrigin({ host: `127.0.0.1:${PORT}` }, PORT);
  assert.equal(r.allowed, true);
});

test("refuses a cross-origin request from a web page -- the CSRF case", () => {
  const r = checkRequestOrigin(
    { host: `127.0.0.1:${PORT}`, origin: "https://evil.example.com" },
    PORT
  );
  assert.equal(r.allowed, false);
  assert.match(r.reason ?? "", /cross-origin/);
});

test("refuses an Origin of 'null' (sandboxed iframe, file://)", () => {
  const r = checkRequestOrigin({ host: `127.0.0.1:${PORT}`, origin: "null" }, PORT);
  assert.equal(r.allowed, false);
});

test("refuses a non-loopback Host -- the DNS-rebinding case", () => {
  // After rebinding, the page IS same-origin, so Origin looks fine; only Host gives it away.
  const r = checkRequestOrigin(
    { host: "attacker.example.com", origin: "http://attacker.example.com" },
    PORT
  );
  assert.equal(r.allowed, false);
  assert.match(r.reason ?? "", /rebinding/);
});

test("refuses a loopback Host on someone else's port", () => {
  const r = checkRequestOrigin({ host: "127.0.0.1:9999" }, PORT);
  assert.equal(r.allowed, false);
  assert.match(r.reason ?? "", /port/);
});

test("refuses a missing Host header", () => {
  const r = checkRequestOrigin({}, PORT);
  assert.equal(r.allowed, false);
});

test("honours a non-default port", () => {
  assert.equal(checkRequestOrigin({ host: "127.0.0.1:5000", origin: "http://127.0.0.1:5000" }, 5000).allowed, true);
  assert.equal(checkRequestOrigin({ host: "127.0.0.1:4173", origin: "http://127.0.0.1:4173" }, 5000).allowed, false);
});

test("is not fooled by a hostname that merely starts with loopback", () => {
  for (const host of ["127.0.0.1.evil.com", "localhost.evil.com"]) {
    assert.equal(checkRequestOrigin({ host }, PORT).allowed, false, `${host} must be refused`);
  }
});
