// Guards the cross-platform contract for the shell scripts (AGENTS.md §2: one bash
// implementation covers macOS, Linux and Git Bash on Windows).
//
// Why this file exists: CI was red on macOS only, for four consecutive runs, with
// "mapfile: command not found" followed by "PATHS[@]: unbound variable". `mapfile` is a bash 4
// builtin (2009) and macOS still ships bash 3.2 as /bin/bash -- frozen in 2007 over GPLv3 --
// so every script here has to stay inside bash 3.2's feature set. Nothing on a developer
// machine catches that: Git Bash on Windows ships bash 5.x and Linux runners ship 5.x too,
// which is exactly why it survived until a macOS runner ran it.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const SCRIPTS_DIR = join(import.meta.dirname, "..");

/** Every tracked .sh in scripts/ plus the git hook, which is the same code path. */
function shellScripts(): { name: string; body: string }[] {
  const files = readdirSync(SCRIPTS_DIR)
    .filter((f) => f.endsWith(".sh"))
    .map((f) => ({ name: `scripts/${f}`, body: readFileSync(join(SCRIPTS_DIR, f), "utf-8") }));
  try {
    const hook = join(SCRIPTS_DIR, "..", ".githooks", "pre-commit");
    files.push({ name: ".githooks/pre-commit", body: readFileSync(hook, "utf-8") });
  } catch {
    /* hook not present in this checkout -- not this test's problem */
  }
  return files;
}

/** bash 4+ only constructs, each with the failure it produced or would produce on bash 3.2. */
const BASH4_ONLY: { pattern: RegExp; what: string }[] = [
  { pattern: /\bmapfile\b/, what: "mapfile (bash 4) -- use `while IFS= read -r x; do arr+=(\"$x\"); done < <(...)`" },
  { pattern: /\breadarray\b/, what: "readarray (bash 4, alias of mapfile) -- same replacement" },
  { pattern: /\bdeclare\s+-A\b/, what: "associative array (bash 4)" },
  { pattern: /\blocal\s+-A\b/, what: "associative array (bash 4)" },
  { pattern: /\$\{[A-Za-z_][A-Za-z0-9_]*\^\^/, what: "${var^^} uppercase expansion (bash 4)" },
  { pattern: /\$\{[A-Za-z_][A-Za-z0-9_]*,,/, what: "${var,,} lowercase expansion (bash 4)" },
  { pattern: /shopt\s+-s\s+globstar/, what: "globstar (bash 4)" },
  { pattern: /\|&/, what: "|& pipe-stderr shorthand (bash 4) -- use 2>&1 |" },
];

describe("shell scripts stay inside bash 3.2 (macOS /bin/bash)", () => {
  for (const { pattern, what } of BASH4_ONLY) {
    test(`nenhum script usa ${what.split(" --")[0]}`, () => {
      const offenders: string[] = [];
      for (const { name, body } of shellScripts()) {
        // Comments are allowed to name the construct -- that is how the fix documents itself.
        const code = body
          .split("\n")
          .filter((line) => !line.trimStart().startsWith("#"))
          .join("\n");
        if (pattern.test(code)) offenders.push(name);
      }
      assert.deepEqual(offenders, [], `${offenders.join(", ")} usa ${what}`);
    });
  }

  test("scan-secrets.sh não expande array possivelmente vazio sob set -u", () => {
    // The second half of the same macOS failure: on bash 3.2, "${arr[@]}" on an EMPTY array is
    // an unbound-variable error when `set -u` is on. Every such loop must be length-guarded.
    const body = readFileSync(join(SCRIPTS_DIR, "scan-secrets.sh"), "utf-8");
    assert.match(body, /set -u/, "o script depende de set -u; se isso mudar, revise este teste");
    assert.match(
      body,
      /if \[ \$\{#PATHS\[@\]\} -gt 0 \]; then/,
      "a iteração sobre PATHS precisa ser protegida por uma checagem de tamanho"
    );
  });
});
