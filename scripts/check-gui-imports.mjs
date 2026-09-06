// Static check for the GUI's ES modules: does any module use a name another module exports,
// without importing it?
//
// The browser only reports these one at a time, at run time, and only for the code path that
// actually executed -- during the split of index.html into modules that meant reload/read
// console/fix, over and over, with no guarantee an untouched tab was not still broken. This
// finds all of them at once, offline, and is why it lives in the suite.
//
// It also flags import cycles, which are the smell that a lower layer started depending on a
// higher one (core.js reaching for refreshAll, for example).

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const APP_DIR = join(import.meta.dirname, "..", "gui", "app");
const files = readdirSync(APP_DIR).filter((f) => f.endsWith(".js"));

const read = (f) => readFileSync(join(APP_DIR, f), "utf-8");

// name -> [modules exporting it]
const exportedBy = {};
for (const f of files) {
  const src = read(f);
  for (const m of src.matchAll(/^export (?:async )?function (\w+)/gm)) (exportedBy[m[1]] ??= []).push(f);
  for (const m of src.matchAll(/^export (?:const|let) (\w+)/gm)) (exportedBy[m[1]] ??= []).push(f);
}

const problems = [];
const importGraph = {};

for (const f of files) {
  const src = read(f);

  const imported = new Set();
  importGraph[f] = [];
  for (const m of src.matchAll(/^import \{([^}]+)\} from "\.\/([\w.-]+)"/gm)) {
    m[1].split(",").forEach((n) => imported.add(n.trim().split(" as ")[0]));
    importGraph[f].push(m[2]);
  }
  for (const m of src.matchAll(/^import "\.\/([\w.-]+)"/gm)) importGraph[f].push(m[1]);

  const local = new Set();
  for (const m of src.matchAll(/^(?:export )?(?:async )?function (\w+)/gm)) local.add(m[1]);
  for (const m of src.matchAll(/^(?:export )?(?:const|let|var) (\w+)/gm)) local.add(m[1]);

  for (const [name, owners] of Object.entries(exportedBy)) {
    if (owners.includes(f) || imported.has(name) || local.has(name)) continue;
    // Called as a function or referenced before a brace -- good enough to catch real usage
    // without parsing, and false positives would show up as a failing check, not silence.
    if (new RegExp(`(^|[^\\w."'])${name}\\s*[({]`, "m").test(src)) {
      problems.push(`${f} usa ${name}() sem importar (exportado por ${owners.join(", ")})`);
    }
  }
}

// Cycle detection over the import graph.
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
  for (const dep of importGraph[node] ?? []) walk(dep);
  stack.pop();
}
for (const f of files) walk(f);

if (problems.length) {
  console.error("Problemas nos módulos da GUI:");
  for (const p of problems) console.error("  ✗ " + p);
  process.exit(1);
}
console.log(`  ✓ ${files.length} módulos da GUI: imports resolvidos, sem ciclos`);
