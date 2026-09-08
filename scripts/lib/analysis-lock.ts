import { realpathSync, statSync } from "node:fs";
import { relative, isAbsolute, sep } from "node:path";

const active = new Set<string>();
function contains(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  return !rel || rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

/** Harbor writes analysis.json into the input. Refuse overlapping analyses in this server
 * rather than letting duplicate browser/API requests race over the same artifact. */
export async function withAnalysisTarget<T>(path: string, run: () => Promise<T>): Promise<T> {
  const resolved = realpathSync(path);
  if (!statSync(resolved).isDirectory()) throw new Error("análise requer diretório de job ou trial");
  const key = process.platform === "win32" ? resolved.toLowerCase() : resolved;
  if ([...active].some(other => contains(other, key) || contains(key, other))) {
    throw Object.assign(new Error("já existe análise ativa para este job/trial; aguarde sua conclusão"), { statusCode: 409 });
  }
  active.add(key);
  try { return await run(); }
  finally { active.delete(key); }
}
