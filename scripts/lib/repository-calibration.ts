import type { ChildProcess } from "node:child_process";
import { join, resolve } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { validatePreviewSelection, repositoryPreviewDirectory, preparedRepositoryTaskPath, pinPreparedRepositoryTask } from "./repository-preparation.ts";
import { assertRepositoryTreeUnchanged } from "./repository-integrity.ts";
import { materializeRepositoryTask } from "./repository-task.ts";
import { createOperation, updateOperation, appendOperationLog, assertOperationId } from "./operations.ts";
import { execHarbor, terminateProcessTree, stopContainersForJob } from "./exec.ts";
import { loadRedactionSecrets } from "./redaction-secrets.ts";
import { redactOutput } from "./experiment-runner.ts";
import { parseResult } from "./results.ts";

const active = new Map<string, { cancelled: boolean; child?: ChildProcess; job?: string; jobsDir: string; previewId: string }>();
export function validateCalibrationResults(base: ReturnType<typeof parseResult>, reference: ReturnType<typeof parseResult>, allowPassingBase = false) {
  for (const result of [base, reference]) {
    if (result.error || result.nErrors || result.nTrials !== 1 || ![0, 1].includes(result.meanReward as number)) throw new Error("Calibração sem resultado determinístico completo; consulte os logs.");
  }
  if (reference.meanReward !== 1) throw new Error("gabarito não atingiu a aprovação determinística; revise a receita antes de executar candidatos");
  if (base.meanReward === 1 && !allowPassingBase) throw new Error("base já passa nos checks; adicione teste do comportamento novo ou justifique exceção documental nas opções avançadas");
}
export function startRepositoryPreparation(b: { operationId: string; previewId: string; recipe: unknown }, activeIds: Set<string>) {
    assertOperationId(b.operationId);
    if ([...active.values()].some(item => item.previewId === b.previewId)) throw new Error("Este preview já está sendo preparado; acompanhe a operação ativa.");
    const preview = validatePreviewSelection(b.previewId, b.recipe);
    assertRepositoryTreeUnchanged(preview.baseRoot, preview.manifest.codeFiles);
    assertRepositoryTreeUnchanged(preview.referenceRoot, preview.manifest.referenceFiles);
    const jobsDir = resolve("jobs", "repository-calibration"), control = { cancelled: false, jobsDir, previewId: b.previewId } as { cancelled: boolean; child?: ChildProcess; job?: string; jobsDir: string; previewId: string };
    const redactionValues = loadRedactionSecrets();
    createOperation({ id: b.operationId, type: "repository", targetPath: preview.recipe.label, jobsDir }, redactionValues);
    active.set(b.operationId, control); activeIds.add(b.operationId);
    updateOperation(b.operationId, { status: "running" }, redactionValues);

    void (async () => {
      const log = (text: string) => appendOperationLog(b.operationId, "stdout", text + "\n", redactionValues);
      try {
        const root = join(repositoryPreviewDirectory(preview.previewId), `calibration-${b.operationId}`);
        mkdirSync(root);
        const results: Record<string, ReturnType<typeof parseResult>> = {};
        for (const stage of ["base", "reference"] as const) {
          if (control.cancelled) throw new Error("preparação cancelada");
          log(`Validando ${stage === "base" ? "base histórica" : "gabarito"} sem LLM, em verifier separado.`);
          const task = materializeRepositoryTask({ destination: join(root, stage), baseRoot: stage === "base" ? preview.baseRoot : preview.referenceRoot,
            documents: preview.documents, checks: preview.recipe.checks, threshold: preview.recipe.threshold, image: preview.recipe.image, setupScript: preview.recipe.setupScript,
            label: preview.recipe.label, recipeId: `${stage}-${preview.previewId.slice(0,8)}` });
          const name = `harbor-eval-kit-cal-${b.operationId.slice(0,8)}-${stage}`;
          control.job = name;
          updateOperation(b.operationId, { harborJobName: name }, redactionValues);
          const result = await execHarbor(["run", "--path", task, "--agent", "nop", "--jobs-dir", jobsDir, "--job-name", name, "--n-attempts", "1", "-y"], {
            isolatedEnv: true, extraEnv: {}, redactValues: Object.values(redactionValues), timeoutMs: 3600000,
            onSpawn: child => { control.child = child; }, onOutput: (channel, text) => appendOperationLog(b.operationId, channel, text, redactionValues),
          });
          if (control.cancelled) throw new Error("preparação cancelada");
          if (result.code !== 0) throw new Error(`calibração ${stage} não terminou; consulte o log da operação`);
          results[stage] = parseResult(join(jobsDir, name));
          if (results[stage].error || results[stage].nErrors || !results[stage].nTrials) throw new Error(`erro de infraestrutura na calibração ${stage}`);
        }
        validateCalibrationResults(results.base, results.reference, preview.recipe.allowPassingBase);
        const taskPath = preparedRepositoryTaskPath(preview.previewId);
        materializeRepositoryTask({ destination: taskPath, baseRoot: preview.baseRoot, documents: preview.documents, checks: preview.recipe.checks, threshold: preview.recipe.threshold,
          image: preview.recipe.image, setupScript: preview.recipe.setupScript, label: preview.recipe.label, recipeId: preview.recipe.id });
        writeFileSync(join(taskPath, "repository-eval.json"), JSON.stringify({ version: 1, previewId: preview.previewId, calibrated: true,
          baseSha: preview.manifest.baseSha, finalSha: preview.manifest.finalSha }), { flag: "wx" });
        writeFileSync(join(root, "calibration.json"), JSON.stringify(results, null, 2), { flag: "wx" });
        pinPreparedRepositoryTask(taskPath, preview.recipe);
        log("Task pronta. Selecione-a em Novo experimento; juiz continua opcional.");
        updateOperation(b.operationId, { status: "succeeded", finishedAt: new Date().toISOString(), result: { taskPath, recipeId: preview.recipe.id, calibration: results } }, redactionValues);
      } catch (error) {
        const message = redactOutput((error as Error).message, redactionValues);
        appendOperationLog(b.operationId, "stderr", message, redactionValues);
        updateOperation(b.operationId, { status: "failed", finishedAt: new Date().toISOString(), error: message }, redactionValues);
      } finally { active.delete(b.operationId); activeIds.delete(b.operationId); }
    })();
    return { operationId: b.operationId, status: "running" };
}
export function cancelRepositoryPreparation(b: { operationId: string }) {
    const control = active.get(b.operationId);
    if (!control) throw new Error("operação não está ativa neste servidor");
    control.cancelled = true;
    if (control.child) terminateProcessTree(control.child);
    const stopped = control.job ? stopContainersForJob(control.jobsDir, control.job) : [];
    return { ok: true, stopped };
}
