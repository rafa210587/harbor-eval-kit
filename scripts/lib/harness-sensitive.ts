// Sensitive readers only: no secret-store import, API serialization or child execution.
import { closeSync, constants, existsSync, fstatSync, lstatSync, openSync, readSync } from "node:fs";
import { dirname, isAbsolute, parse, resolve } from "node:path";
import { getStateDir, safeJoinUnderDir } from "./paths.ts";

function boundedJson(path: string): unknown {
  let fd: number | undefined;
  try {
    if (!isAbsolute(path)) throw new Error();
    let ancestor = resolve(path);
    for (;;) {
      if (lstatSync(ancestor).isSymbolicLink()) throw new Error();
      if (ancestor === parse(ancestor).root) break;
      ancestor = dirname(ancestor);
    }
    fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > 1024 * 1024) throw new Error();
    const bytes = Buffer.alloc(1024 * 1024 + 1);
    let length = 0;
    while (length < bytes.length) {
      const count = readSync(fd, bytes, length, bytes.length - length, null);
      if (!count) break;
      length += count;
    }
    if (length > 1024 * 1024) throw new Error();
    return JSON.parse(bytes.subarray(0, length).toString("utf8"));
  } catch { throw new Error("Não foi possível validar o arquivo local de autenticação; nenhuma informação sensível foi retornada."); }
  finally { if (fd !== undefined) closeSync(fd); }
}

/** Internal-only values for exact-match redaction. Never expose this return through API/export. */
export function readNativeAuthSecretValues(authFilePath: string): string[] {
  const values = new Set<string>();
  function visit(value: unknown, depth: number): void {
    if (depth > 24) throw new Error("Arquivo de autenticação excede a profundidade permitida.");
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      if (/(?:token|apikey|secret|password|authorization)$/i.test(key.replace(/[_-]/g, "")) && typeof child === "string" && child) values.add(child);
      else visit(child, depth + 1);
    }
  }
  visit(boundedJson(authFilePath), 0);
  return [...values];
}

/** Read only explicitly bound Codex native files, never a default personal auth profile. */
export function getHarnessSecretValues(stateDir = getStateDir()): string[] {
  const path = safeJoinUnderDir(stateDir, "harness-integrations.json");
  if (!path) throw new Error("Cadastro de integrações atravessa link simbólico.");
  if (!existsSync(path)) return [];
  const records = boundedJson(path);
  if (!Array.isArray(records)) throw new Error("Cadastro de integrações inválido.");
  const values = new Set<string>();
  for (const item of records) {
    if (item?.adapter !== "codex" || item?.authMode !== "native" || !item.authFilePath) continue;
    if (typeof item.authFilePath !== "string") throw new Error("Vínculo de autenticação inválido.");
    for (const value of readNativeAuthSecretValues(item.authFilePath)) values.add(value);
  }
  return [...values];
}
