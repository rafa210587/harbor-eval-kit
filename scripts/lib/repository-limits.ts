/** Per-candidate budget, independent from deterministic checks and judge analysis. */
export function repositoryAgentTimeoutSec(value: unknown = 8 * 3600): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error("Prazo do agente deve ser um número inteiro positivo de segundos dentro da precisão segura.");
  }
  return value;
}
