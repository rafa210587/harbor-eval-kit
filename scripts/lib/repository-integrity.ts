import { createHash } from "node:crypto";
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { safeRepositoryPath, type RepositoryFile } from "./repository-source.ts";

/** Re-hash frozen trees before calibration; additions and deletions also invalidate them. */
export function repositoryTreeManifest(root: string): RepositoryFile[] {
  const files: RepositoryFile[] = [];
  let total = 0;
  function visit(path: string) {
    if (path) safeRepositoryPath(path);
    const location = join(root, path), stat = lstatSync(location);
    if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) throw new Error("Snapshot contém link ou arquivo especial.");
    if (stat.isDirectory()) {
      for (const name of readdirSync(location)) visit(path ? `${path}/${name}` : name);
    } else {
      if (files.length >= 20000 || stat.size > 16 * 1024 * 1024 || (total += stat.size) > 256 * 1024 * 1024) throw new Error("Snapshot excede limites de tamanho.");
      files.push({ path, size: stat.size, sha256: createHash("sha256").update(readFileSync(location)).digest("hex") });
    }
  }
  visit("");
  return files;
}
export function assertRepositoryTreeUnchanged(root: string, expected: RepositoryFile[]) {
  const normalized = (files: RepositoryFile[]) => JSON.stringify(files.map(({ path, sha256 }) => [path, sha256]).sort((a, b) => a[0].localeCompare(b[0])));
  if (!Array.isArray(expected) || normalized(repositoryTreeManifest(root)) !== normalized(expected)) throw new Error("Snapshot mudou após a prévia; resolva novamente a receita.");
}
