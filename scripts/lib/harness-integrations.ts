// Local connection metadata. Never include this store in portable catalog bundles.
import { existsSync, readFileSync, mkdirSync, writeFileSync, renameSync, statSync } from "node:fs";
import { isAbsolute, dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { getStateDir, readRegistry, safeJoinUnderDir } from "./paths.ts";
import { loadSecretsEnv } from "./secrets.ts";
import { assertSafeId } from "./registry-validation.ts";
import { assertSafeExport } from "./export-safety.ts";
import { readNativeAuthSecretValues } from "./harness-sensitive.ts";

export const HARNESS_CAPABILITIES = [
  { adapter: "claude-code", executable: "claude", native: true, versionPin: true, discovery: false, protocol: "anthropic" },
  { adapter: "codex", executable: "codex", native: true, versionPin: true, discovery: false, protocol: "openai" },
  { adapter: "cursor-cli", executable: "cursor-agent", native: false, versionPin: false, discovery: false, protocol: "cursor" },
  { adapter: "opencode", executable: "opencode", native: false, versionPin: true, discovery: true, protocol: "provider" },
] as const;
export type HarnessAdapter = typeof HARNESS_CAPABILITIES[number]["adapter"];
export interface HarnessIntegration {
  id: string; label: string; adapter: HarnessAdapter; authMode: "api" | "native";
  version?: string; credentialEnv?: string; baseUrl?: string; authFilePath?: string;
  trustedRepository: boolean;
}
export type HarnessIntegrationView = Omit<HarnessIntegration, "authFilePath"> & { hasAuthFile: boolean };
export interface HarnessOptions { stateDir?: string; secrets?: Record<string, string> }
const modelPattern = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/;
const versionPattern = /^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/;
function capability(adapter: unknown) {
  const result = HARNESS_CAPABILITIES.find(item => item.adapter === adapter);
  if (!result) throw new Error("Harness não reconhecido.");
  return result;
}
function validate(value: unknown, options: HarnessOptions): HarnessIntegration {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Integração deve ser um objeto.");
  const input = value as HarnessIntegration;
  const fields = ["id", "label", "adapter", "authMode", "version", "credentialEnv", "baseUrl", "authFilePath", "trustedRepository"];
  if (Object.keys(input).some(key => !fields.includes(key))) throw new Error("Campo de integração não permitido.");
  assertSafeId(input.id);
  const cap = capability(input.adapter);
  if (typeof input.label !== "string" || !input.label.trim() || input.label.length > 120) throw new Error("Nome de integração inválido.");
  if (!["api", "native"].includes(input.authMode) || typeof input.trustedRepository !== "boolean") throw new Error("Modo de autenticação ou confiança inválido.");
  if (input.version !== undefined && (typeof input.version !== "string" || !versionPattern.test(input.version) || !cap.versionPin)) throw new Error("Versão inválida ou pin não suportado pelo adapter.");
  if (input.credentialEnv !== undefined && (typeof input.credentialEnv !== "string" || !/^[A-Z][A-Z0-9_]{0,95}$/.test(input.credentialEnv))) throw new Error("Referência de credencial inválida.");
  if (input.baseUrl !== undefined) {
    if (typeof input.baseUrl !== "string") throw new Error("Endpoint inválido.");
    let url: URL;
    try { url = new URL(input.baseUrl); } catch { throw new Error("Endpoint inválido."); }
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.search || url.hash || input.adapter === "cursor-cli" || input.authMode === "native") throw new Error("Endpoint não permitido para esta integração.");
  }
  if (input.authFilePath !== undefined && (typeof input.authFilePath !== "string" || !isAbsolute(input.authFilePath) || /[\x00-\x1f]/.test(input.authFilePath) || input.adapter !== "codex" || input.authMode !== "native")) throw new Error("Arquivo de autenticação requer Codex nativo e caminho absoluto explícito.");
  // Do not serialize a supplied key hidden in metadata or endpoint URLs.
  assertSafeExport(input, options.secrets ?? loadSecretsEnv());
  return { ...input, label: input.label.trim() };
}
function file(options: HarnessOptions): string {
  const path = safeJoinUnderDir(options.stateDir ?? getStateDir(), "harness-integrations.json");
  if (!path) throw new Error("Cadastro de integrações não pode atravessar links simbólicos.");
  return path;
}
function read(options: HarnessOptions): HarnessIntegration[] {
  if (!existsSync(file(options))) return [];
  let value: unknown;
  try { value = JSON.parse(readFileSync(file(options), "utf8")); } catch { throw new Error("Cadastro de integrações corrompido; não foi sobrescrito."); }
  if (!Array.isArray(value)) throw new Error("Cadastro de integrações inválido.");
  const items = value.map(item => validate(item, options));
  if (new Set(items.map(item => item.id)).size !== items.length) throw new Error("Cadastro de integrações contém IDs duplicados.");
  return items;
}
function write(items: HarnessIntegration[], options: HarnessOptions): void {
  const dir = options.stateDir ?? getStateDir();
  mkdirSync(dir, { recursive: true });
  const tmp = file(options) + "." + randomUUID() + ".tmp";
  writeFileSync(tmp, JSON.stringify(items, null, 2), { flag: "wx", mode: 0o600 });
  renameSync(tmp, file(options));
}
function view(item: HarnessIntegration): HarnessIntegrationView {
  const { authFilePath, ...publicFields } = item;
  return { ...publicFields, hasAuthFile: !!authFilePath };
}
function get(id: string, options: HarnessOptions): HarnessIntegration {
  assertSafeId(id);
  const item = read(options).find(item => item.id === id);
  if (!item) throw new Error("Integração não encontrada; vincule uma conexão local.");
  return item;
}
export function listHarnessIntegrations(options: HarnessOptions = {}): HarnessIntegrationView[] { return read(options).map(view); }
export function saveHarnessIntegration(value: unknown, options: HarnessOptions = {}): HarnessIntegrationView {
  const all = read(options);
  const incoming = validate(value, options);
  const index = all.findIndex(existing => existing.id === incoming.id);
  // Views intentionally omit the private path. Editing unrelated fields must not erase it.
  const prior = index >= 0 ? all[index] : undefined;
  const item = validate({ ...incoming, ...(incoming.adapter === "codex" && incoming.authMode === "native" && incoming.authFilePath === undefined && prior?.authFilePath ? { authFilePath: prior.authFilePath } : {}) }, options);
  if (index < 0) all.push(item); else all[index] = item;
  write(all, options); return view(item);
}
export function deleteHarnessIntegration(id: string, options: HarnessOptions = {}): void {
  get(id, options);
  // An alternate test store has no connection to the real user's agent registry.
  if (!options.stateDir && readRegistry<{ integrationId?: string }>("agents").some(agent => agent.integrationId === id)) throw new Error("Integração ainda referenciada por um agente.");
  write(read(options).filter(item => item.id !== id), options);
}
export type HarnessProbe = (executable: string, args: string[]) => Promise<string>;
export const runHarnessProbe: HarnessProbe = (executable, args) => new Promise((completeProbe, reject) => {
  // Fixed executables/args only; no shell or credentials provided by this module.
  const env: NodeJS.ProcessEnv = {};
  for (const key of ["PATH", "Path", "HOME", "USERPROFILE", "LOCALAPPDATA", "APPDATA", "SystemRoot", "SYSTEMROOT", "TEMP", "TMP", "PATHEXT"]) if (process.env[key]) env[key] = process.env[key];
  // Never search an implicit executable/config relative to the project being evaluated.
  execFile(executable, args, { cwd: dirname(process.execPath), env, timeout: 10000, maxBuffer: 262144, windowsHide: true }, (error, stdout) => {
    if (error) reject(new Error("CLI indisponível, incompatível ou diagnóstico expirado. Instale manualmente e tente novamente."));
    else completeProbe(stdout);
  });
});
export async function diagnoseHarnessIntegration(id: string, options: HarnessOptions = {}, probe: HarnessProbe = runHarnessProbe) {
  const item = get(id, options); const cap = capability(item.adapter);
  let output: string;
  try { output = await probe(cap.executable, ["--version"]); } catch { return { available: false, scope: "host", version: null, message: "CLI não disponível no host. O diagnóstico não instala nem autentica." }; }
  const version = output.match(/(?:^|\s)(\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?)(?=\s|$)/)?.[1] ?? null;
  return { available: !!version, scope: "host", version, requestedVersionMatches: !item.version || item.version === version, nativeSupported: cap.native, message: "Versão do host; execução em container e autenticação requerem validação separada." };
}
export async function discoverHarnessModels(id: string, options: HarnessOptions = {}, probe: HarnessProbe = runHarnessProbe) {
  const item = get(id, options); const cap = capability(item.adapter);
  if (!cap.discovery) return { supported: false, models: [] as string[], message: "Este adapter não oferece descoberta validada. Cadastre o identificador do modelo manualmente." };
  const diagnostic = await diagnoseHarnessIntegration(id, options, probe);
  if (!diagnostic.available || !diagnostic.version?.startsWith("1.")) return { supported: false, models: [] as string[], message: "Descoberta disponível somente para OpenCode 1.x diagnosticado no host." };
  let output: string;
  try { output = await probe(cap.executable, ["models"]); } catch { throw new Error("Não foi possível consultar o catálogo do CLI."); }
  const models = [...new Set(output.split(/\r?\n/).map(line => line.trim()).filter(line => modelPattern.test(line) && line.includes("/")))].slice(0, 500);
  assertSafeExport(models, options.secrets ?? loadSecretsEnv());
  return { supported: true, models, message: "Catálogo do CLI no host; não comprova acesso, saldo ou compatibilidade em container. Nenhuma inferência solicitada." };
}
export interface HarnessRunOptions extends HarnessOptions { trustedRepository: boolean }
/** Internal-only return: extraEnv contains sensitive values and must never become API/log/snapshot output. */
export function resolveHarnessRun(id: string, model: string, options: HarnessRunOptions) {
  const item = get(id, options); const cap = capability(item.adapter);
  if (!item.trustedRepository || !options.trustedRepository) throw new Error("Confirme repositório confiável: CLI e código compartilham o ambiente autenticado; isolamento forte não está disponível.");
  if (!modelPattern.test(model)) throw new Error("Identificador de modelo inválido.");
  const segments = model.split("/");
  if (item.adapter === "codex" && (segments.length > 2 || (segments.length === 2 && segments[0] !== "openai"))) throw new Error("Codex requer modelo OpenAI ou identificador sem prefixo; aliases com múltiplos segmentos não são preservados pelo adapter.");
  if (item.adapter === "claude-code" && segments.length > 1 && segments[0] !== "anthropic") throw new Error("Claude Code requer protocolo/modelo Anthropic; outro prefixo não será convertido automaticamente.");
  const redactValues: string[] = [];
  const secrets = options.secrets ?? loadSecretsEnv();
  const extraEnv: Record<string, string> = {};
  const extraArgs: string[] = item.version ? ["--ak", `version=${item.version}`] : [];
  if (item.authMode === "native") {
    if (!cap.native) throw new Error("Login nativo ainda não suportado por este adapter Harbor; use API ou outra integração.");
    if (item.adapter === "codex") {
      if (!item.authFilePath || !existsSync(item.authFilePath) || !statSync(item.authFilePath).isFile()) throw new Error("Selecione explicitamente um auth.json existente para a sessão Codex dedicada.");
      extraEnv.CODEX_AUTH_JSON_PATH = item.authFilePath;
      redactValues.push(...readNativeAuthSecretValues(item.authFilePath));
    } else {
      const oauth = item.credentialEnv && secrets[item.credentialEnv];
      if (!oauth) throw new Error("Vincule o token OAuth da sessão Claude dedicada em Credenciais.");
      extraEnv.CLAUDE_CODE_OAUTH_TOKEN = oauth; extraEnv.CLAUDE_FORCE_OAUTH = "1";
    }
  } else {
    const provider = model.split("/")[0];
    const mappings: Record<string, [string, string?]> = { "claude-code": ["ANTHROPIC_API_KEY", "ANTHROPIC_BASE_URL"], codex: ["OPENAI_API_KEY", "OPENAI_BASE_URL"], "cursor-cli": ["CURSOR_API_KEY"] };
    const providerMappings: Record<string, [string, string]> = { openai: ["OPENAI_API_KEY", "OPENAI_BASE_URL"], anthropic: ["ANTHROPIC_API_KEY", "ANTHROPIC_BASE_URL"], deepseek: ["DEEPSEEK_API_KEY", "DEEPSEEK_BASE_URL"], google: ["GOOGLE_API_KEY", "GOOGLE_BASE_URL"] };
    const mapping = item.adapter === "opencode" ? providerMappings[provider] : mappings[item.adapter];
    if (!mapping) throw new Error("Provider não suportado por esta integração; não haverá fallback de modelo.");
    if (item.adapter === "codex" && model.split("/").length > 2) throw new Error("O adapter Codex remove segmentos do modelo; este alias não é seguro para seleção exata.");
    if (item.adapter === "opencode" && item.baseUrl && provider === "deepseek") throw new Error("Endpoint customizado DeepSeek não suportado pelo adapter OpenCode; use provider OpenAI compatível.");
    const key = secrets[item.credentialEnv ?? mapping[0]];
    if (!key) throw new Error("Credencial de inferência ausente; configure o vínculo em Credenciais.");
    extraEnv[mapping[0]] = key;
    if (item.baseUrl && mapping[1]) extraEnv[mapping[1]] = item.baseUrl;
  }
  redactValues.push(...Object.entries(extraEnv).filter(([key]) => /KEY|TOKEN|SECRET|PASSWORD/.test(key)).map(([, value]) => value));
  return { snapshot: { id: item.id, adapter: item.adapter, authMode: item.authMode, version: item.version, baseUrl: item.baseUrl, trustedRepository: item.trustedRepository }, integrationId: item.id, agentValue: item.adapter, extraArgs, extraEnv, redactValues: [...new Set(redactValues)] };
}
