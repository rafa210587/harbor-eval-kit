import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assertPodmanApi,
  resolvePodmanConnection,
  selectEffectiveMachine,
  validatePodmanInterfaces,
  type PodmanRunner,
} from "./podman.ts";

function fixtureRunner(fixtures: Record<string, string>, calls: string[] = []): PodmanRunner {
  return (command, args, options) => {
    const key = `${command} ${args.join(" ")}`;
    calls.push(`${key}${options?.extraEnv?.DOCKER_HOST ? ` DOCKER_HOST=${options.extraEnv.DOCKER_HOST}` : ""}`);
    if (!(key in fixtures)) throw new Error(`missing fixture: ${key}`);
    return fixtures[key];
  };
}

const connections = JSON.stringify([
  { Name: "work", URI: "ssh://core@127.0.0.1:60000/run/podman.sock", Default: true },
  { Name: "other", URI: "ssh://core@127.0.0.1:60001/run/podman.sock", Default: false },
]);
const machines = JSON.stringify([
  { Name: "work", Running: true },
  { Name: "other", Running: true },
]);

test("resolver selects the running machine behind the effective connection on macOS", () => {
  const calls: string[] = [];
  const resolved = resolvePodmanConnection({ platform: "darwin", run: fixtureRunner({
    "podman system connection list --format json": connections,
    "podman machine list --format json": machines,
    "podman machine inspect work --format json": JSON.stringify([{ ConnectionInfo: { PodmanSocket: { Path: "/tmp/podman-work.sock" } } }]),
  }, calls) });
  assert.deepEqual(resolved, {
    platform: "darwin",
    dockerHost: "unix:///tmp/podman-work.sock",
    connectionName: "work",
    machineName: "work",
    podmanUri: "ssh://core@127.0.0.1:60000/run/podman.sock",
    source: "machine",
  });
  assert.ok(calls.includes("podman machine inspect work --format json"));
});

test("Windows only chooses the compatibility pipe after selecting a running machine", () => {
  const resolved = resolvePodmanConnection({ platform: "win32", run: fixtureRunner({
    "podman system connection list --format json": connections,
    "podman machine list --format json": machines,
    "podman machine inspect work --format json": JSON.stringify([{ ConnectionInfo: { PodmanSocket: { Path: "ignored" } } }]),
  }) });
  assert.equal(resolved.dockerHost, "npipe:////./pipe/docker_engine");
  assert.equal(resolved.machineName, "work");
});

test("Linux rootless uses the socket reported by live Podman info", () => {
  const resolved = resolvePodmanConnection({ platform: "linux", run: fixtureRunner({
    "podman system connection list --format json": "[]",
    "podman machine list --format json": "[]",
    "podman info --format json": JSON.stringify({ Host: { RemoteSocket: { Path: "/run/user/1000/podman/podman.sock" } } }),
  }) });
  assert.equal(resolved.dockerHost, "unix:///run/user/1000/podman/podman.sock");
  assert.equal(resolved.source, "rootless");
});

test("resolver blocks ambiguous machines instead of using an implicit default", () => {
  assert.throws(() => selectEffectiveMachine(
    [{ name: "unrelated", uri: "ssh://elsewhere", isDefault: true }],
    [{ name: "one", running: true }, { name: "two", running: true }],
  ), /ambiguous/);
});

test("API proof rejects a Docker-compatible endpoint that is not Podman", () => {
  assert.throws(() => assertPodmanApi({
    statusCode: 200,
    headers: {},
    body: JSON.stringify({ Components: [{ Name: "Engine" }] }),
  }), /did not identify itself as Podman/);
});

test("machine prefixes cannot hijack the selected connection and root alias collisions fail closed", () => {
  const connection = (name: string) => [{ name, uri: "ssh://fixture", isDefault: true }];
  const machines = (names: string[]) => names.map(name => ({ name, running: true }));
  assert.equal(selectEffectiveMachine(connection("work-dev"), machines(["work", "work-dev"])).machine.name, "work-dev");
  assert.equal(selectEffectiveMachine(connection("work-root"), machines(["work"])).machine.name, "work");
  assert.throws(() => selectEffectiveMachine(connection("work-root"), machines(["work", "work-root"])), /ambiguous/);
  assert.throws(() => selectEffectiveMachine(connection("work-custom"), machines(["work"])), /ambiguous/);
});

test("interface gate targets the selected Podman connection and scopes DOCKER_HOST to compose", async () => {
  const calls: string[] = [];
  const resolved = {
    platform: "darwin" as const,
    dockerHost: "unix:///tmp/podman.sock",
    connectionName: "work",
    machineName: "work",
    podmanUri: "ssh://work",
    source: "machine" as const,
  };
  await validatePodmanInterfaces(resolved, {
    run: fixtureRunner({
      "podman --connection work info --format json": JSON.stringify({ Host: {} }),
      "podman compose version": "podman-compose version 1.4.0",
      "podman compose up --help": "Usage: compose up --detach --wait --pull POLICY --no-build",
    }, calls),
    requestApi: async (host, path) => {
      assert.equal(host, resolved.dockerHost);
      assert.equal(path, "/version");
      return { statusCode: 200, headers: { "libpod-api-version": "5.0.0" }, body: "{}" };
    },
  });
  assert.ok(calls.includes("podman --connection work info --format json"));
  assert.ok(calls.includes("podman compose version DOCKER_HOST=unix:///tmp/podman.sock"));
  assert.ok(calls.includes("podman compose up --help DOCKER_HOST=unix:///tmp/podman.sock"));
});

test("interface gate blocks a Compose provider without Harbor's required flags", async () => {
  const resolved = {
    platform: "linux" as const,
    dockerHost: "unix:///run/user/1000/podman.sock",
    connectionName: null,
    machineName: null,
    podmanUri: null,
    source: "rootless" as const,
  };
  await assert.rejects(() => validatePodmanInterfaces(resolved, {
    run: fixtureRunner({
      "podman info --format json": "{}",
      "podman compose version": "provider 1.0",
      "podman compose up --help": "Usage: compose up --detach --no-build",
    }),
    requestApi: async () => ({ statusCode: 200, headers: { "libpod-api-version": "5" }, body: "{}" }),
  }), /--wait/);
});
