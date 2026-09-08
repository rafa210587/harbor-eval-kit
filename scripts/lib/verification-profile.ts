// Repository verifiers are authored by the operator, not by the candidate.
import { assertSafeExport } from "./export-safety.ts";
import { assertSafeId } from "./registry-validation.ts";

export interface VerificationCheck {
  id: string; argv: string[]; cwd: string; timeoutSec: number;
  acceptedExitCodes: number[]; weight: number; required: boolean;
  parser?: "exit-code" | "junit"; reportPath?: string;
}
export type CheckStatus = "passed" | "failed" | "timeout" | "infrastructure-error" | "not-run";
export interface CheckResult { id: string; status: CheckStatus; exitCode?: number }
export function validateVerificationThreshold(value: unknown): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) throw new Error("limiar deve estar entre 0 e 1");
}

export function assertRelativeRepositoryPath(value: unknown, allowDot = false): asserts value is string {
  if (allowDot && value === ".") return;
  if (typeof value !== "string" || !value || value.length > 1024 || /[\\:\x00-\x1f]/.test(value)
    || value.split("/").some(p => !p || p === "." || p === ".." || /[. ]$/.test(p)
      || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p))) {
    throw new Error("caminho deve ser relativo à raiz do repositório, sem links ou escapes");
  }
}
export function validateVerificationChecks(value: unknown): asserts value is VerificationCheck[] {
  if (!Array.isArray(value) || !value.length || value.length > 50) throw new Error("configure de 1 a 50 verificações");
  const ids = new Set<string>();
  for (const check of value) {
    if (!check || typeof check !== "object" || Array.isArray(check)
      || Object.keys(check).some(k => !["id", "argv", "cwd", "timeoutSec", "acceptedExitCodes", "weight", "required", "parser", "reportPath"].includes(k))) throw new Error("verificação inválida");
    assertSafeId(check.id);
    if (ids.has(check.id)) throw new Error("verificações com IDs repetidos");
    ids.add(check.id);
    if (!Array.isArray(check.argv) || !check.argv.length || check.argv.length > 100
      || check.argv.some((a: unknown) => typeof a !== "string" || !a || a.length > 8192 || /[\x00\r\n]/.test(a))) throw new Error("comando precisa de argumentos separados, sem linhas adicionais");
    assertRelativeRepositoryPath(check.cwd, true);
    if (!Number.isInteger(check.timeoutSec) || check.timeoutSec < 1 || check.timeoutSec > 7200) throw new Error("timeout deve ser inteiro entre 1 e 7200 segundos");
    if (!Array.isArray(check.acceptedExitCodes) || !check.acceptedExitCodes.length
      || check.acceptedExitCodes.some((c: unknown) => !Number.isInteger(c) || Number(c) < 0 || Number(c) > 255)) throw new Error("códigos de saída inválidos");
    if (!Number.isFinite(check.weight) || check.weight <= 0 || check.weight > 1000 || typeof check.required !== "boolean") throw new Error("peso positivo e indicação obrigatório são necessários");
    if (check.parser !== undefined && !["exit-code", "junit"].includes(check.parser)) throw new Error("parser não suportado");
    if (check.parser === "junit") assertRelativeRepositoryPath(check.reportPath);
    else if (check.reportPath !== undefined) throw new Error("reportPath só é aceito com parser junit");
  }
}
export function verificationVerdict(checks: VerificationCheck[], results: CheckResult[], threshold = 1) {
  validateVerificationChecks(checks);
  validateVerificationThreshold(threshold);
  const expected = new Set(checks.map(c => c.id));
  if (new Set(results.map(r => r.id)).size !== results.length || results.some(r => !expected.has(r.id)
    || !["passed", "failed", "timeout", "infrastructure-error", "not-run"].includes(r.status))) throw new Error("resultados não correspondem às verificações");
  const passed = (id: string) => results.find(r => r.id === id)?.status === "passed";
  const complete = checks.every(c => results.some(r => r.id === c.id && r.status !== "not-run"));
  const weight = checks.reduce((sum, c) => sum + c.weight, 0);
  const score = checks.reduce((sum, c) => sum + (passed(c.id) ? c.weight : 0), 0) / weight;
  const error = results.some(r => ["timeout", "infrastructure-error"].includes(r.status));
  return { complete, score, approved: complete && !error && checks.filter(c => c.required).every(c => passed(c.id)) && score >= threshold };
}
export function validateSafeVerificationChecks(value: unknown, secrets?: Record<string, string>): asserts value is VerificationCheck[] {
  validateVerificationChecks(value);
  assertSafeExport(value, secrets);
}
