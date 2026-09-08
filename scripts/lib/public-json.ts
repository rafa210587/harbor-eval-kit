import { loadRedactionSecrets } from "./redaction-secrets.ts";
import { redactOutput } from "./experiment-runner.ts";

/** A broken native session must never expose unredacted data or crash error handling. */
export function publicJson(status: number, data: unknown, readValues = loadRedactionSecrets) {
  try { return { status, body: redactOutput(JSON.stringify(data), readValues()) }; }
  catch {
    return { status: 503, body: JSON.stringify({ ok: false, error: "Não foi possível validar a proteção de credenciais. Confira os arquivos de autenticação vinculados às integrações locais antes de consultar logs ou exportar." }) };
  }
}
