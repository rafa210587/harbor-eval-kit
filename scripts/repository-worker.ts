// Acquisition uses synchronous Git plumbing in a worker so the UI remains responsive.
import { parentPort, workerData } from "node:worker_threads";
import { resolveRepositoryRecipe } from "./lib/repository-preparation.ts";
import { redactOutput } from "./lib/experiment-runner.ts";
import { loadSecretsEnv } from "./lib/secrets.ts";
try {
  const preview = resolveRepositoryRecipe(workerData.recipe);
  parentPort!.postMessage({ ok: true, previewId: preview.previewId, manifest: preview.manifest, warnings: preview.warnings, blockers: preview.blockers });
} catch (error) {
  parentPort!.postMessage({ ok: false, error: redactOutput((error as Error).message, loadSecretsEnv()) });
}
