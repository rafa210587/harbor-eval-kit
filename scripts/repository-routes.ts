import type { IncomingMessage, ServerResponse } from "node:http";
import { Worker } from "node:worker_threads";
import { randomUUID } from "node:crypto";
import { startRepositoryPreparation, cancelRepositoryPreparation } from "./lib/repository-calibration.ts";
import { HARNESS_CAPABILITIES, listHarnessIntegrations, saveHarnessIntegration, deleteHarnessIntegration, diagnoseHarnessIntegration, discoverHarnessModels } from "./lib/harness-integrations.ts";
import { listRepositoryRecipes, saveRepositoryRecipe, readRepositoryRecipe, exportRepositoryRecipe, previewRepositoryRecipeImport } from "./lib/repository-recipes.ts";

type Handler = (req: IncomingMessage, res: ServerResponse, params: Record<string, string>, body: any) => void | Promise<void>;
type AddRoute = (method: string, path: string, handler: Handler) => void;
type Send = (res: ServerResponse, status: number, data: unknown) => void;
export function registerRepositoryRoutes(add: AddRoute, send: Send, activeIds: Set<string>) {
  add("GET", "/api/harness-integrations/catalog", (_q, r) => send(r, 200, HARNESS_CAPABILITIES));
  add("GET", "/api/harness-integrations", (_q, r) => send(r, 200, listHarnessIntegrations()));
  add("POST", "/api/harness-integrations", (_q, r, _p, b) => send(r, 200, saveHarnessIntegration({ ...b, id: b.id || randomUUID() })));
  add("DELETE", "/api/harness-integrations/:id", (_q, r, p) => { deleteHarnessIntegration(p.id); send(r, 200, { ok: true }); });
  add("POST", "/api/harness-integrations/:id/diagnose", async (_q, r, p) => send(r, 200, await diagnoseHarnessIntegration(p.id)));
  add("POST", "/api/harness-integrations/:id/models", async (_q, r, p) => send(r, 200, await discoverHarnessModels(p.id)));
  add("GET", "/api/repository-evals", (_q, r) => send(r, 200, listRepositoryRecipes()));
  add("POST", "/api/repository-evals", (_q, r, _p, b) => send(r, 200, saveRepositoryRecipe(b)));
  add("GET", "/api/repository-evals/export", (q, r) => {
    const id = new URL(q.url!, "http://localhost").searchParams.get("id") || "";
    const bundle = exportRepositoryRecipe(readRepositoryRecipe(id));
    r.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": 'attachment; filename="repository-recipe.json"', "Cache-Control": "no-store" });
    r.end(JSON.stringify(bundle, null, 2));
  });
  add("POST", "/api/repository-evals/import", (_q, r, _p, b) => send(r, 200, previewRepositoryRecipeImport(b)));
  add("POST", "/api/repository-evals/resolve", async (_q, r, _p, b) => {
    const result = await new Promise<any>((done, reject) => {
      const worker = new Worker(new URL("./repository-worker.ts", import.meta.url), { workerData: { recipe: b.recipe ?? b } });
      worker.once("message", done);
      worker.once("error", () => reject(new Error("aquisição interrompida; confira Git/gh e resolva novamente")));
      worker.once("exit", code => { if (code) reject(new Error("aquisição interrompida")); });
    });
    send(r, result.ok ? 200 : 400, result);
  });
  add("POST", "/api/repository-evals/prepare", (_q, r, _p, b) => send(r, 202, startRepositoryPreparation(b, activeIds)));
  add("POST", "/api/repository-evals/cancel", (_q, r, _p, b) => send(r, 200, cancelRepositoryPreparation(b)));
}
