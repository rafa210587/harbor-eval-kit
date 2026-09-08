import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { runHarborEval } from "./harbor-cli.ts";
import { createStreamingRedactor, execCommand } from "./exec.ts";

test("eval wrapper uses the common Harbor executor, loads secrets and preserves its exit code", async () => {
  let seen: unknown;
  const code = await runHarborEval(["--path", "task", "--agent", "oracle"], {
    loadSecrets: () => ({ SYNTHETIC_TEST_TOKEN: "fixture" }),
    execute: async (args, options) => {
      seen = { args, options };
      return { code: 23, stdout: "", stderr: "failed", durationSec: 0 };
    },
  });
  assert.equal(code, 23);
  assert.deepEqual(seen, {
    args: ["run", "--path", "task", "--agent", "oracle"],
    options: { extraEnv: { SYNTHETIC_TEST_TOKEN: "fixture" }, redactValues: ["fixture"], echo: true },
  });
});

test("stream redaction covers a secret split across arbitrary chunks", () => {
  let output = "";
  const stream = createStreamingRedactor(["synthetic-secret"], text => { output += text; });
  stream.write("before synthetic-");
  stream.write("secret after");
  stream.end();
  assert.equal(output, "before [REDACTED] after");
  let escaped = "";
  const jsonStream = createStreamingRedactor(['quoted"secret'], text => { escaped += text; });
  jsonStream.write('value=quoted\\"');
  jsonStream.write('secret');
  jsonStream.end();
  assert.equal(escaped, "value=[REDACTED]");

  let unicode = "";
  const unrelatedSecret = "unrelated-secret";
  const unicodeStream = createStreamingRedactor([unrelatedSecret], text => { unicode += text; });
  const input = "prefix🔑" + "x".repeat(unrelatedSecret.length - 2);
  unicodeStream.write(input);
  unicodeStream.end();
  assert.equal(unicode, input);
  assert.doesNotMatch(unicode, /�/);
});

test("exec decodes one-byte UTF-8 writes before redacting the child environment secret", async () => {
  const secret = "sëcret-🔑";
  const script = "const b=Buffer.from(process.env.SYNTHETIC_TEST_TOKEN);let i=0;const t=setInterval(()=>{process.stdout.write(b.subarray(i,i+1));if(++i===b.length)clearInterval(t)},2)";
  const result = await execCommand(process.execPath, ["-e", script], {
    extraEnv: { SYNTHETIC_TEST_TOKEN: secret }, redactValues: [secret], timeoutMs: 5_000,
    dockerHostFix: false,
  });
  assert.equal(result.code, 0);
  assert.equal(result.stdout, "[REDACTED]");
  assert.doesNotMatch(result.stdout, /�/);
});

test("child Python file and stdio encoding stay UTF-8 even with conflicting host overrides", async () => {
  const result = await execCommand(process.execPath, ["-e", "process.stdout.write(JSON.stringify([process.env.PYTHONUTF8,process.env.PYTHONIOENCODING]))"], {
    extraEnv: { PYTHONUTF8: "0", PYTHONIOENCODING: "cp1252" }, dockerHostFix: false,
  });
  assert.equal(result.code, 0);
  assert.deepEqual(JSON.parse(result.stdout), ["1", "utf-8"]);
});

test("timeout kills an owned descendant that ignores SIGTERM", async () => {
  const descendant = "process.stdout.write('ready');process.on('SIGTERM',()=>{});setInterval(()=>{},1000)";
  const parent = `const{spawn:createChild}=require('node:child_process');const c=createChild(process.execPath,['-e',${JSON.stringify(descendant)}],{stdio:['ignore','pipe','ignore']});c.stdout.once('data',()=>console.log(c.pid));setInterval(()=>{},1000)`;
  const result = await execCommand(process.execPath, ["-e", parent], {
    timeoutMs: 2_500, dockerHostFix: false,
  });
  assert.match(result.stderr, /exceeded 2500ms timeout/);
  const pid = Number(result.stdout.trim());
  assert.ok(Number.isInteger(pid) && pid > 0, `expected ready descendant PID, got ${JSON.stringify(result.stdout)}`);
  let gone = false;
  for (let attempt = 0; attempt < 20 && !gone; attempt++) {
    try {
      process.kill(pid, 0);
      if (process.platform !== "win32") {
        const state = execFileSync("ps", ["-o", "stat=", "-p", String(pid)], { encoding: "utf8" }).trim();
        gone = state.startsWith("Z");
      }
    } catch { gone = true; }
    if (!gone) await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.equal(gone, true, `descendant ${pid} remained live after timeout`);
});

test("bash and PowerShell wrappers delegate eval and lifecycle to Node", () => {
  const scripts = join(import.meta.dirname, "..");
  const bash = readFileSync(join(scripts, "harbor-eval.sh"), "utf8");
  const powershell = readFileSync(join(scripts, "harbor-eval.ps1"), "utf8");
  assert.match(bash, /harbor-cli\.ts" eval --/);
  assert.match(powershell, /harbor-cli\.ts"\) eval --/);
  assert.doesNotMatch(bash, /resolve_podman_docker_host/);
  assert.doesNotMatch(powershell, /Resolve-PodmanDockerHost/);
  assert.doesNotMatch(powershell, /^param\(/m, "PowerShell param binder must not consume Harbor --flags");
  assert.match(powershell, /With no param\(\) binder, Harbor flags remain opaque/);
  assert.match(bash, /uv tool dir --bin/);
  assert.match(powershell, /uv tool dir --bin/);
  assert.doesNotMatch(bash, /^PREFIX=|^LABEL=/m);
  assert.doesNotMatch(powershell, /^\$Prefix\s*=|^\$Label\s*=/m);

  for (const name of ["start-gui.sh", "start-gui.ps1", "stop-gui.sh", "stop-gui.ps1"]) {
    assert.match(readFileSync(join(scripts, name), "utf8"), /gui-lifecycle\.ts/);
  }
});

test("bash converts the Windows uv tool bin before extending Git Bash PATH", () => {
  const bash = readFileSync(join(import.meta.dirname, "..", "harbor-eval.sh"), "utf8");
  const start = bash.indexOf("add_uv_tool_bin() {");
  const end = bash.indexOf("\n}\n\nverify_harbor_runtime", start);
  assert.ok(start >= 0 && end > start);
  const helper = bash.slice(start, end + 2);
  const fixture = String.raw`
uv(){ printf '%s\n' 'C:\Users\Rafa\AppData\Local\uv\bin'; }
uname(){ printf '%s\n' 'MINGW64_NT-10.0'; }
cygpath(){ [ "$1" = '-u' ] || return 9; printf '%s\n' '/c/Users/Rafa/AppData/Local/uv/bin'; }
have(){ command -v "$1" >/dev/null 2>&1; }
say(){ printf '%s\n' "$*" >&2; }
PATH='/usr/bin'
add_uv_tool_bin
printf '%s' "$PATH"
`;
  let bashExecutable = "bash";
  if (process.platform === "win32") {
    const gitPaths = spawnSync("where.exe", ["git"], { encoding: "utf8" }).stdout
      .split(/\r?\n/).filter(Boolean);
    const candidates = [
      ...gitPaths.map(path => resolve(dirname(path), "..", "bin", "bash.exe")),
      join(process.env.ProgramFiles ?? "C:\\Program Files", "Git", "bin", "bash.exe"),
    ];
    bashExecutable = candidates.find(existsSync) ?? "";
    assert.ok(bashExecutable, "Git Bash executable is required for the Windows wrapper regression test");
  }
  const result = spawnSync(bashExecutable, ["-c", `${helper}\n${fixture}`], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "/c/Users/Rafa/AppData/Local/uv/bin:/usr/bin");
});
