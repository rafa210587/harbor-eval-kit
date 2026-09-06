// Static check: does any module use a name it never imported?
//
// Covers both sides of the codebase:
//   - scripts/**.ts  -- Node built-ins used without importing them
//   - gui/app/*.js   -- names another module exports, used without importing; plus import cycles
//
// Why this exists, twice over. Splitting index.html into ES modules produced five rounds of
// reload / read console / fix, because the browser reports these one at a time and only for the
// code path that actually ran. Then the exact same class of bug hit the backend: a refactor
// dropped `import { execFileSync }` while a function still called it, the surrounding
// `catch {}` swallowed the ReferenceError, and the GUI told the user "Harbor isn't installed" --
// a wrong answer to a real question, found only by clicking the button in a full manual pass.
//
// Neither `node --test` nor `node --check` catches this: it is a runtime error on a path no
// test exercises. A static pass over every file does, in under a second.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const problems = [];

/** Names defined at the top level of a file (so "used but not imported" excludes them). */
function localNames(src) {
  const names = new Set();
  for (const m of src.matchAll(/^(?:export )?(?:async )?function (\w+)/gm)) names.add(m[1]);
  for (const m of src.matchAll(/(?:const|let|var) (\w+)/g)) names.add(m[1]);
  for (const m of src.matchAll(/(\w+)\s*(?:=>|=\s*function)/g)) names.add(m[1]);
  return names;
}

function importedNames(src) {
  const names = new Set();
  for (const m of src.matchAll(/^import (?:type )?\{([^}]+)\} from/gm)) {
    m[1].split(",").forEach((n) => names.add(n.trim().split(/\s+as\s+/)[0]));
  }
  for (const m of src.matchAll(/^import (\w+) from/gm)) names.add(m[1]);
  return names;
}

/**
 * Blanks out comment LINES so prose is not mistaken for code. This codebase explains itself
 * heavily and its comments name functions constantly ("buildHarborEnv() is the single choke
 * point..."), so without this every such sentence reads as a call and the check cries wolf --
 * which is how a checker stops being run.
 *
 * Line-based, and deliberately not a lexer. Two more precise attempts both failed *silently*,
 * in opposite directions, which is the worst behaviour a checker can have:
 *
 *   - Regex block-comment stripping: a header comment mentioning the route prefix `/api/` + `*`
 *     read as an opening `/*`, ran to the next close far below, and deleted every import in
 *     between -- so the checker reported five imports missing that were right there.
 *   - A character scanner: a backtick inside a `//` comment (`created by \`harbor init\``) left
 *     it stuck in "string" state for the rest of the file, blanking a real bug out of existence.
 *
 * Working per line cannot desynchronise: the worst case is one wrong line, never the whole file.
 * A name inside a string on a code line can still produce a false positive -- visible and cheap
 * to fix, unlike the silent misses above.
 */
function stripNonCode(src) {
  return src
    .split("\n")
    .map((line) => {
      const t = line.trimStart();
      if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) return "";
      // Trailing `// comment` on a code line -- ignore `://` so URLs and npipe paths survive.
      return line.replace(/(^|[^:])\/\/.*$/, "$1");
    })
    .join("\n");
}

/** Called as `name(` and not preceded by a dot (so `obj.join(` doesn't count). */
function callsFunction(src, name) {
  return new RegExp(String.raw`(^|[^\w.])${name}\s*\(`, "m").test(src);
}

// ---------- backend: node built-ins used without importing them ----------

const BUILTINS = [
  "execFileSync", "execSync", "spawn", "spawnSync",
  "readFileSync", "writeFileSync", "existsSync", "mkdirSync", "readdirSync",
  "statSync", "openSync", "readSync", "closeSync", "rmSync", "appendFileSync",
  "join", "dirname", "basename", "relative", "isAbsolute", "resolve",
  "homedir", "tmpdir", "randomUUID", "createServer", "parseArgs", "readFile",
];

const tsFiles = [];
for (const dir of ["scripts", "scripts/lib"]) {
  for (const f of readdirSync(join(ROOT, dir))) {
    if (f.endsWith(".ts")) tsFiles.push(join(dir, f));
  }
}

// Names exported by scripts/lib modules, so "used but not imported" also covers the library's
// own functions -- `export *` re-exports a name for CALLERS but does not bring it into the
// re-exporting file's own scope, which is exactly how a split left harbor.ts calling
// execCommand() without importing it.
const libExports = {};
for (const rel of tsFiles) {
  if (!rel.includes("lib")) continue;
  const src = stripNonCode(readFileSync(join(ROOT, rel), "utf-8"));
  for (const m of src.matchAll(/^export (?:async )?function (\w+)/gm)) (libExports[m[1]] ??= []).push(rel);
  for (const m of src.matchAll(/^export (?:const|let) (\w+)/gm)) (libExports[m[1]] ??= []).push(rel);
}

for (const rel of tsFiles) {
  const src = stripNonCode(readFileSync(join(ROOT, rel), "utf-8"));
  const known = new Set([...importedNames(src), ...localNames(src)]);
  for (const name of BUILTINS) {
    if (!known.has(name) && callsFunction(src, name)) {
      problems.push(`${rel} chama ${name}() sem importar`);
    }
  }
  for (const [name, owners] of Object.entries(libExports)) {
    if (owners.includes(rel) || known.has(name)) continue;
    if (callsFunction(src, name)) {
      problems.push(`${rel} chama ${name}() sem importar (de ${owners.join(", ")})`);
    }
  }
}

// ---------- frontend: cross-module names and import cycles ----------

const APP_DIR = join(ROOT, "gui", "app");
const jsFiles = readdirSync(APP_DIR).filter((f) => f.endsWith(".js"));
const readApp = (f) => stripNonCode(readFileSync(join(APP_DIR, f), "utf-8"));

const exportedBy = {};
for (const f of jsFiles) {
  const src = readApp(f);
  for (const m of src.matchAll(/^export (?:async )?function (\w+)/gm)) (exportedBy[m[1]] ??= []).push(f);
  for (const m of src.matchAll(/^export (?:const|let) (\w+)/gm)) (exportedBy[m[1]] ??= []).push(f);
}

const graph = {};
for (const f of jsFiles) {
  const src = readApp(f);
  graph[f] = [];
  for (const m of src.matchAll(/^import [^"]*from "\.\/([\w.-]+)"/gm)) graph[f].push(m[1]);
  for (const m of src.matchAll(/^import "\.\/([\w.-]+)"/gm)) graph[f].push(m[1]);

  const known = new Set([...importedNames(src), ...localNames(src)]);
  for (const [name, owners] of Object.entries(exportedBy)) {
    if (owners.includes(f) || known.has(name)) continue;
    if (callsFunction(src, name)) {
      problems.push(`gui/app/${f} usa ${name}() sem importar (de ${owners.join(", ")})`);
    }
  }
}

// ---------- frontend: calling a name that is PRIVATE to another module ----------
//
// The check above only knows names a module EXPORTS. A call to a function defined in another
// module but never exported slips through it -- which is how core.js kept calling
// setLogsPolling() (private to logs.js) after a refactor. The ReferenceError fired inside a
// click handler and aborted it silently: the tab switched but never loaded its data, and
// nothing appeared in the console until someone clicked that exact tab.
//
// Matching against names actually defined at the top level of a sibling module keeps this
// precise. A general "identifier that exists nowhere" check was tried and abandoned: without a
// real parser it flagged UI strings ("nenhum", "juiz"), `async (`, `$`, and nested functions --
// dozens of false alarms, and a checker that cries wolf is one that stops being run.
const topLevelFns = {};
for (const f of jsFiles) {
  for (const m of readApp(f).matchAll(/^(?:export )?(?:async )?function (\w+)/gm)) {
    (topLevelFns[m[1]] ??= []).push(f);
  }
}

for (const f of jsFiles) {
  const src = readApp(f);
  const known = new Set([...importedNames(src), ...localNames(src)]);
  for (const [name, owners] of Object.entries(topLevelFns)) {
    if (owners.includes(f) || known.has(name)) continue;
    if (callsFunction(src, name)) {
      const exported = (exportedBy[name] ?? []).length > 0;
      problems.push(
        `gui/app/${f} chama ${name}()` +
          (exported ? ` sem importar (de ${owners.join(", ")})` : ` que é privado de ${owners.join(", ")}`)
      );
    }
  }
}

const seen = new Set();
const stack = [];
function walk(node) {
  if (stack.includes(node)) {
    problems.push(`ciclo de import: ${[...stack.slice(stack.indexOf(node)), node].join(" -> ")}`);
    return;
  }
  if (seen.has(node)) return;
  seen.add(node);
  stack.push(node);
  for (const dep of graph[node] ?? []) walk(dep);
  stack.pop();
}
for (const f of jsFiles) walk(f);

if (problems.length) {
  console.error("Imports quebrados:");
  for (const p of problems) console.error("  ✗ " + p);
  process.exit(1);
}
console.log(`  ✓ ${tsFiles.length} módulos TS + ${jsFiles.length} módulos da GUI: imports resolvidos, sem ciclos`);
