import type { IncomingMessage, ServerResponse } from "node:http";
import { diagnoseGithubAccess } from "./lib/github-access.ts";

type AddRoute = (method: string, path: string, handler: (req: IncomingMessage, res: ServerResponse, params: Record<string, string>, body: any) => void | Promise<void>) => void;
export function registerGithubAccessRoutes(add: AddRoute, send: (res: ServerResponse, status: number, data: unknown) => void) {
  add("POST", "/api/github-access/diagnose", async (_req, res, _params, body) => {
    if (body?.repository !== undefined && typeof body.repository !== "string") throw new Error("Informe owner/repo como texto.");
    res.setHeader("Cache-Control", "no-store");
    send(res, 200, await diagnoseGithubAccess(body?.repository || ""));
  });
}
