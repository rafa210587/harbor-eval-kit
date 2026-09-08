/** Harbor 0.22 analyze templates allocate 1800 seconds per judge task.
 * Use its agent-only multiplier so verifier/build budgets remain independent. */
export function analysisBudget(hours: unknown = 8) {
  if (typeof hours !== "number" || !Number.isFinite(hours) || hours <= 0 || !Number.isSafeInteger(Math.round(hours * 3600)) || Math.round(hours * 3600) < 1) {
    throw new Error("Prazo do juiz deve ser positivo em horas, com precisão de segundos.");
  }
  return { agent_timeout_multiplier: Math.round(hours * 3600) / 1800 };
}
