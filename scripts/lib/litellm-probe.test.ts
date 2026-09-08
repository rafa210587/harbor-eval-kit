import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { once } from "node:events";
import { discoverLitellmModels, litellmProbeStatus, testLitellmModel } from "./litellm-probe.ts";
import { LITELLM_GATEWAY_DISABLED, type LitellmGatewayConfig } from "./litellm.ts";

// Synthetic credentials, never a real provider or proxy key.
const credential = "fixture-inference";
const secrets = { GATEWAY_INFERENCE: credential, GATEWAY_MASTER: "fixture-master" };
const config = (hostBaseUrl: string): LitellmGatewayConfig => ({
  enabled: true, hostBaseUrl, containerBaseUrl: "http://host.containers.internal:4000",
  inferenceKeyEnv: "GATEWAY_INFERENCE", masterKeyEnv: "GATEWAY_MASTER",
  env: { OPENAI_BASE_URL: "{hostBaseUrl}/v1", OPENAI_API_KEY: "{inferenceKey}" },
});

async function withServer(
  handler: (req: IncomingMessage, res: ServerResponse) => void,
  run: (url: string) => Promise<void>,
): Promise<void> {
  const server = createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try { await run(`http://127.0.0.1:${address.port}`); }
  finally {
    server.closeAllConnections();
    await new Promise<void>((done, reject) => server.close(error => error ? reject(error) : done()));
  }
}

function safeError(error: unknown): boolean {
  assert.ok(error instanceof Error);
  assert.equal(error.message.includes(credential), false);
  assert.equal(error.message.includes(secrets.GATEWAY_MASTER), false);
  assert.equal(error.message.includes("private-response-marker"), false);
  return true;
}

test("gateway status exposes only configuration and credential presence", () => {
  const status = litellmProbeStatus(config("http://127.0.0.1:4000"), secrets);
  assert.deepEqual(status, { enabled: true, configured: true, inferenceKeyEnv: "GATEWAY_INFERENCE", hasCredential: true });
  assert.equal(litellmProbeStatus(config("http://127.0.0.1:4000"), {}).hasCredential, false);
  assert.equal(litellmProbeStatus(LITELLM_GATEWAY_DISABLED, secrets).enabled, false);
  assert.equal(JSON.stringify(status).includes(credential), false);
});

test("OFF and missing host or inference credential refuse to make network requests", async () => {
  let calls = 0;
  const request: typeof fetch = async () => { calls++; throw new Error("unexpected request"); };
  for (const [cfg, keys] of [
    [LITELLM_GATEWAY_DISABLED, secrets],
    [{ ...config("http://127.0.0.1:4000"), hostBaseUrl: null }, secrets],
    [config("http://127.0.0.1:4000"), { GATEWAY_MASTER: secrets.GATEWAY_MASTER }],
    [config("http://127.0.0.1:4000"), { GATEWAY_INFERENCE: "  " }],
  ] as Array<[LitellmGatewayConfig, Record<string, string>]>) {
    await assert.rejects(() => discoverLitellmModels(cfg, keys, request), safeError);
    await assert.rejects(() => testLitellmModel("team/alias", cfg, keys, request), safeError);
  }
  assert.equal(calls, 0);
});

test("discovery performs only authenticated GET models and preserves proxy aliases", async () => {
  const requests: Array<{ method?: string; path?: string; auth?: string }> = [];
  await withServer((req, res) => {
    requests.push({ method: req.method, path: req.url, auth: req.headers.authorization });
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ data: [{ id: "team/alias", metadata: credential }, { id: "cheap-model" }, { id: "team/alias" }], extra: secrets.GATEWAY_MASTER }));
  }, async url => {
    for (const suffix of ["", "/", "/v1", "/v1/"]) {
      const result = await discoverLitellmModels(config(url + suffix), secrets);
      assert.deepEqual([...result.models].sort(), ["cheap-model", "team/alias"]);
      assert.deepEqual(Object.keys(result), ["models"]);
    }
  });
  assert.equal(requests.length, 4);
  for (const req of requests) assert.deepEqual(req, { method: "GET", path: "/v1/models", auth: `Bearer ${credential}` });
});

test("explicit test posts the exact alias and a bounded completion request", async () => {
  let actual: { method?: string; path?: string; auth?: string; body?: Record<string, unknown> };
  await withServer((req, res) => {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", () => {
      actual = { method: req.method, path: req.url, auth: req.headers.authorization, body: JSON.parse(body) };
      res.end(JSON.stringify({ choices: [{ message: { role: "assistant", content: "OK" } }], ignored: credential }));
    });
  }, async url => {
    assert.deepEqual(await testLitellmModel("team/alias", config(url), secrets), { ok: true, testedModel: "team/alias" });
  });
  assert.equal(actual!.method, "POST");
  assert.equal(actual!.path, "/v1/chat/completions");
  assert.equal(actual!.auth, `Bearer ${credential}`);
  assert.equal(actual!.body!.model, "team/alias");
  assert.equal(actual!.body!.max_tokens, 8);
  assert.ok(Array.isArray(actual!.body!.messages));
});

test("invalid or missing explicit models are rejected before spending", async () => {
  let calls = 0;
  const request: typeof fetch = async () => { calls++; throw new Error("unexpected request"); };
  for (const model of [undefined, null, 42, "", " model", "model ", "-model", "a\nb", "a?b", "x".repeat(201), `alias/${credential}`]) {
    await assert.rejects(() => testLitellmModel(model, config("http://127.0.0.1:4000"), secrets, request), safeError);
  }
  assert.equal(calls, 0);
});

test("HTTP errors never echo response bodies or credentials", async () => {
  for (const status of [401, 403, 500]) {
    await withServer((_req, res) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: `${credential} ${secrets.GATEWAY_MASTER} private-response-marker` }));
    }, async url => {
      await assert.rejects(() => discoverLitellmModels(config(url), secrets), safeError);
      await assert.rejects(() => testLitellmModel("alias", config(url), secrets), safeError);
    });
  }
});

test("discovery rejects malformed JSON and model list schemas", async () => {
  for (const body of ["not-json", "null", "{}", '{"data":{}}', '{"data":[{"id":42}]}', '{"data":[{"id":"invalid alias"}]}', JSON.stringify({ data: [{ id: `alias/${credential}` }] })]) {
    await withServer((_req, res) => { res.end(body); }, async url => {
      await assert.rejects(() => discoverLitellmModels(config(url), secrets), safeError);
    });
  }
});

test("completion requires a nonempty assistant response", async () => {
  for (const body of ["not-json", "null", "{}", '{"choices":[]}', '{"choices":[{}]}', '{"choices":[{"message":{"content":""}}]}']) {
    await withServer((_req, res) => { res.end(body); }, async url => {
      await assert.rejects(() => testLitellmModel("alias", config(url), secrets), safeError);
    });
  }
});

test("redirects cannot forward the inference credential to another endpoint", async () => {
  let redirectedCalls = 0;
  await withServer((_req, res) => { redirectedCalls++; res.end('{"data":[]}'); }, async target => {
    await withServer((_req, res) => { res.writeHead(302, { location: target + "/capture" }); res.end(); }, async url => {
      await assert.rejects(() => discoverLitellmModels(config(url), secrets), safeError);
      await assert.rejects(() => testLitellmModel("alias", config(url), secrets), safeError);
    });
  });
  assert.equal(redirectedCalls, 0);
});

test("network failure is sanitized and requests use abort protection and redirect refusal", async () => {
  const request: typeof fetch = async (_url, init) => {
    assert.equal(init?.redirect, "error");
    assert.ok(init?.signal instanceof AbortSignal);
    throw new Error(`${credential} ${secrets.GATEWAY_MASTER} private-response-marker`);
  };
  await assert.rejects(() => discoverLitellmModels(config("http://127.0.0.1:4000"), secrets, request), safeError);
  await assert.rejects(() => testLitellmModel("alias", config("http://127.0.0.1:4000"), secrets, request), safeError);
});

test("endpoint credentials, query strings and fragments are rejected before requests", async () => {
  let calls = 0;
  const request: typeof fetch = async () => { calls++; throw new Error("unexpected request"); };
  for (const url of ["http://user:pass@localhost:4000", "http://localhost:4000?token=hidden", "http://localhost:4000#hidden"]) {
    await assert.rejects(() => discoverLitellmModels(config(url), secrets, request), safeError);
  }
  assert.equal(calls, 0);
});

test("oversize responses are rejected without retaining or returning upstream output", async () => {
  await withServer((_req, res) => {
    res.setHeader("content-type", "application/json");
    // Deliberately chunked, with no Content-Length header to trust.
    res.write('{"padding":"');
    res.write("x".repeat(1024 * 1024));
    res.end(`", "private":"${credential}","data":[]}`);
  }, async url => {
    await assert.rejects(() => discoverLitellmModels(config(url), secrets), safeError);
    await assert.rejects(() => testLitellmModel("alias", config(url), secrets), safeError);
  });
});

test("timeout failures do not escape raw fetch diagnostics", async () => {
  const request: typeof fetch = async () => { throw new DOMException(`private-response-marker ${credential}`, "TimeoutError"); };
  await assert.rejects(() => discoverLitellmModels(config("http://127.0.0.1:4000"), secrets, request), safeError);
  await assert.rejects(() => testLitellmModel("alias", config("http://127.0.0.1:4000"), secrets, request), safeError);
});

test("failure to discard an HTTP error body cannot expose upstream diagnostics", async () => {
  const request: typeof fetch = async () => new Response(new ReadableStream({
    cancel() { throw new Error(`private-response-marker ${credential}`); },
  }), { status: 500 });
  await assert.rejects(() => discoverLitellmModels(config("http://127.0.0.1:4000"), secrets, request), safeError);
});
