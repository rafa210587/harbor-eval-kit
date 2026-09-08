import { test } from "node:test";
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import type { IncomingMessage } from "node:http";
import { readJsonBody } from "./http-body.ts";

test("JSON body preserves UTF-8 split across arbitrary transport chunks", async () => {
  const stream = new PassThrough(), parsed = readJsonBody(stream as unknown as IncomingMessage);
  const expected = { text: "avaliação 🧪" };
  for (const byte of Buffer.from(JSON.stringify(expected))) stream.write(Buffer.from([byte]));
  stream.end();
  assert.deepEqual(await parsed, expected);
});

test("oversized or malformed JSON is refused without including its content", async () => {
  const stream = new PassThrough(), parsed = readJsonBody(stream as unknown as IncomingMessage, 4);
  const rejected = assert.rejects(parsed, (error: any) => error.statusCode === 413 && !error.message.includes("private"));
  stream.end("private-value");
  await rejected;
  const malformed = new PassThrough(), bad = readJsonBody(malformed as unknown as IncomingMessage);
  malformed.end("private-value");
  await assert.rejects(bad, /^Error: Invalid JSON body$/);
});
