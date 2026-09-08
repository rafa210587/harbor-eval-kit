import type { IncomingMessage } from "node:http";

/** Count bytes before buffering, then decode once: a UTF-8 character may span TCP chunks. */
export function readJsonBody(req: IncomingMessage, maxBytes = 10_000_000): Promise<any> {
  return new Promise((resolvePromise, reject) => {
    const chunks: Buffer[] = [];
    let bytes = 0, failed = false;
    req.on("data", (chunk: Buffer) => {
      if (failed) return;
      bytes += chunk.length;
      if (bytes > maxBytes) {
        failed = true;
        chunks.length = 0;
        reject(Object.assign(new Error("request body excede o limite permitido"), { statusCode: 413 }));
        req.resume();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (failed) return;
      if (!bytes) return resolvePromise({});
      try { resolvePromise(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
      catch { reject(new Error("Invalid JSON body")); }
    });
    req.on("error", reject);
    req.on("aborted", () => reject(new Error("request interrompida antes de completar o body")));
  });
}
