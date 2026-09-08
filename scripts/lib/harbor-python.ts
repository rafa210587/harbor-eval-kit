import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

let cachedHarborPythonPath: string | null | undefined;

/** Locates the python interpreter inside the `uv tool install harbor` venv (portable across
 *  OS via `uv tool dir`, rather than hardcoding uv's storage layout). Memoized per process. */
export function getHarborPythonPath(): string | null {
  if (cachedHarborPythonPath !== undefined) return cachedHarborPythonPath;
  let result: string | null = null;
  try {
    const toolsDir = execFileSync("uv", ["tool", "dir"], { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
    const candidate =
      process.platform === "win32"
        ? join(toolsDir, "harbor", "Scripts", "python.exe")
        : join(toolsDir, "harbor", "bin", "python");
    result = existsSync(candidate) ? candidate : null;
  } catch (err) {
    // Only "uv isn't installed / didn't answer" is an expected failure here. A ReferenceError
    // or TypeError means THIS code is broken, and swallowing it reports the misleading
    // "Harbor isn't installed" to the user instead. That is exactly what happened once: a
    // refactor dropped the execFileSync import, and the resulting ReferenceError was caught
    // here and shown as an install problem. Let a coding error surface as a coding error.
    if (err instanceof ReferenceError || err instanceof TypeError) throw err;
    result = null;
  }
  cachedHarborPythonPath = result;
  return result;
}
