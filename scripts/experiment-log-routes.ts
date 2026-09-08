// HTTP adapter for the early per-candidate output log. Kept separate from gui-server so the
// portable server and the GUI can register the same route without duplicating file access.
import type { IncomingMessage, ServerResponse } from "node:http";
import { readCandidateLog } from "./lib/experiment-logs.ts";
import { readExperiment } from "./lib/experiment-store.ts";

type SendJson = (res: ServerResponse, status: number, data: unknown) => void;
type Handler = (req: IncomingMessage, res: ServerResponse, params: Record<string, string>, body: any) => void | Promise<void>;
type AddRoute = (method: string, path: string, handler: Handler) => void;

export function registerExperimentLogRoutes(addRoute: AddRoute, sendJson: SendJson): void {
  addRoute("GET", "/api/experiments/:id/logs/:candidateId", (req, res, params) => {
    const url = new URL(req.url ?? "", "http://localhost");
    const jobsDir = url.searchParams.get("jobsDir") || "jobs";
    const record = readExperiment(jobsDir, params.id);
    if (!record.plan.candidates.some(candidate => candidate.id === params.candidateId)) {
      return sendJson(res, 404, { ok: false, error: "candidato não pertence ao experimento" });
    }
    const offset = Number(url.searchParams.get("offset") || "0");
    const log = readCandidateLog(jobsDir, params.id, params.candidateId, offset);
    sendJson(res, 200, { experimentId: params.id, candidateId: params.candidateId, ...(log ?? { content: "", nextOffset: 0, size: 0, truncated: false }) });
  });
}
