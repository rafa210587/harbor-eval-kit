import { existsSync, mkdirSync, readdirSync, lstatSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { join, resolve, relative, isAbsolute, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { validateSafeVerificationChecks, validateVerificationThreshold, assertRelativeRepositoryPath, type VerificationCheck } from "./verification-profile.ts";
import { assertSafeExport } from "./export-safety.ts";
import { safeRepositoryPath } from "./repository-source.ts";
import { assertSafeId } from "./registry-validation.ts";

import { repositoryAgentTimeoutSec } from "./repository-limits.ts";

export interface RepositoryTaskInput {
  destination: string; baseRoot: string; documents: { path: string; content: string }[];
  checks: VerificationCheck[]; threshold?: number; agentTimeoutSec?: number; image: string; setupScript: string; label: string; recipeId: string;
  /** Reference material is forbidden in candidate tasks, including optional caller mistakes. */
  referenceDiffPath?: never;
}
function copyCleanTree(source: string, destination: string): void {
  const visit = (path: string) => {
    const from = join(source, path); const entry = lstatSync(from);
    if (entry.isSymbolicLink() || (!entry.isDirectory() && !entry.isFile())) throw new Error("Snapshot deve conter somente arquivos e diretórios regulares.");
    if (path) safeRepositoryPath(path);
    if (entry.isDirectory()) {
      mkdirSync(join(destination, path), { recursive: true });
      for (const name of readdirSync(from)) visit(path ? `${path}/${name}` : name);
    } else {
      const bytes = readFileSync(from); assertSafeExport(bytes.toString("utf8"));
      copyFileSync(from, join(destination, path));
    }
  };
  visit("");
}
/** Creates a new Harbor task. Does not execute setup, install packages or run containers. */
export function materializeRepositoryTask(input: RepositoryTaskInput): string {
  assertSafeId(input.recipeId); validateSafeVerificationChecks(input.checks);
  validateVerificationThreshold(input.threshold ?? 1);
  const agentTimeout = repositoryAgentTimeoutSec(input.agentTimeoutSec);
  if (input.referenceDiffPath !== undefined) throw new Error("Gabarito não pode entrar na task candidata.");
  if (!/^[A-Za-z0-9][A-Za-z0-9._/:@-]{0,255}$/.test(input.image) || input.image.startsWith("-")) throw new Error("Imagem de container inválida.");
  if (typeof input.setupScript !== "string" || input.setupScript.includes("\0") || input.setupScript.length > 65536) throw new Error("Setup inválido.");
  if (typeof input.label !== "string" || !input.label.trim() || input.label.length > 200) throw new Error("Nome da task inválido.");
  if (!Array.isArray(input.documents) || !input.documents.length) throw new Error("Selecione ao menos uma spec.");
  for (const doc of input.documents) { assertRelativeRepositoryPath(doc.path); if (typeof doc.content !== "string") throw new Error("Documento inválido."); }
  assertSafeExport({ documents: input.documents, setup: input.setupScript, label: input.label });
  const destination = resolve(input.destination), base = resolve(input.baseRoot);
  const offset = relative(base, destination);
  const external = isAbsolute(offset) || offset === ".." || offset.startsWith(`..${sep}`);
  if (existsSync(destination) || !external) throw new Error("Destino deve ser novo e externo ao snapshot.");
  const environment = join(destination, "environment"), tests = join(destination, "tests");
  mkdirSync(environment, { recursive: true }); mkdirSync(tests);
  copyCleanTree(base, join(environment, "repo"));
  copyCleanTree(base, join(tests, "repo"));
  const common = `FROM ${input.image}\nUSER root\nWORKDIR /workspace\nCOPY repo/ /workspace/\nCOPY setup.sh /opt/harbor-eval-kit-setup.sh\nRUN bash /opt/harbor-eval-kit-setup.sh && command -v python3 && id nobody\n`;
  writeFileSync(join(environment, "Dockerfile"), common);
  // Empty workspace before Harbor uploads final artifacts: deleted base files must stay deleted.
  writeFileSync(join(tests, "Dockerfile"), common + "RUN rm -rf /workspace && mkdir /workspace\nCOPY repository-verifier.py checks.json test.sh /tests/\nRUN chmod 755 /tests /tests/test.sh && chmod 644 /tests/checks.json /tests/repository-verifier.py\n");
  for (const dir of [environment, tests]) writeFileSync(join(dir, "setup.sh"), `#!/bin/bash\nset -euo pipefail\n${input.setupScript}\n`);
  copyFileSync(fileURLToPath(new URL("../templates/repository-verifier.py", import.meta.url)), join(tests, "repository-verifier.py"));
  writeFileSync(join(tests, "checks.json"), JSON.stringify({ checks: input.checks, threshold: input.threshold ?? 1 }, null, 2));
  writeFileSync(join(tests, "test.sh"), "#!/bin/bash\nset -euo pipefail\nexec python3 -I /tests/repository-verifier.py\n");
  writeFileSync(join(destination, "instruction.md"), `# ${input.label}\n\nImplemente os requisitos em /workspace. O repositório completo inicial está disponível.\nLeia as skills fornecidas em /harbor/skills, se houver. Não altere o avaliador nem arquivos de reward.\n\n` + input.documents.map(doc => `## Documento: ${doc.path}\n\n${doc.content}`).join("\n\n"));
  const timeout = input.checks.reduce((sum, check) => sum + check.timeoutSec, 0) + 60;
  writeFileSync(join(destination, "task.toml"), `schema_version = "1.4"\nartifacts = [{ source = "/workspace", destination = "workspace", exclude = [".git"] }]\n\n[task]\nname = ${JSON.stringify("harbor-eval-kit/" + input.recipeId)}\nversion = "1.0.0"\ndescription = ${JSON.stringify(input.label)}\nauthors = []\nkeywords = ["repository-pr"]\n\n[agent]\ntimeout_sec = ${agentTimeout}\n\n[environment]\nos = "linux"\nnetwork_mode = "public"\nbuild_timeout_sec = 1200\n\n[verifier]\nuser = "root"\nenvironment_mode = "separate"\ntimeout_sec = ${timeout}\n\n[verifier.environment]\nos = "linux"\nnetwork_mode = "no-network"\nbuild_timeout_sec = 1200\n`);
  return destination;
}
