import { loadRedactionSecrets } from "./redaction-secrets.ts";

const credentialField = /^(?:secrets?|credentials?|password|passwd|passphrase|token|authorization|secret[_-]?(?:key|token|value)|(?:api|access|refresh|private|client)[_-]?(?:key|token|secret))$|(?:_API_KEY|_SECRET|_PASSWORD|_ACCESS_TOKEN)$/i;
const credentialText = /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\b(?:sk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|AKIA[A-Z0-9]{16})\b|\bBearer\s+[A-Za-z0-9._~+/-]{12,}|\b[A-Z][A-Z0-9_]*(?:API_KEY|SECRET|PASSWORD|ACCESS_TOKEN)\s*[=:]\s*["']?[^\s"'<>]{4,}/i;
const credentialFile = /(?:^|[/\\])(?:secrets\.env|\.env(?:\.[^/\\]+)?|credentials\.json)$|\.(?:pem|pfx|p12)$/i;

/** Fail closed before serializing a download or writing either report file.
 * Credential storage is never an export input. Known values also cannot escape through
 * user-authored instructions, extra files, judge output, JSON escaping or CSV quoting.
 */
export function assertSafeExport(value: unknown, secrets: Record<string, string> = loadRedactionSecrets()): void {
  const known = Object.values(secrets).filter(Boolean).flatMap(secret => [secret, JSON.stringify(secret).slice(1, -1)]);
  const refuse = () => { throw new Error("Exportação bloqueada: conteúdo potencialmente sensível. Remova credenciais dos cadastros/artefatos e tente novamente; nenhum arquivo foi exportado."); };
  const seen = new Set<object>();
  const visit = (item: unknown) => {
    if (typeof item === "string") {
      if (known.some(secret => item.includes(secret)) || credentialText.test(item)) refuse();
    } else if (item && typeof item === "object") {
      if (seen.has(item)) refuse();
      seen.add(item);
      if (Array.isArray(item)) item.forEach(visit);
      else for (const [key, child] of Object.entries(item)) {
        if (credentialField.test(key)) refuse();
        if (key === "name" && typeof child === "string" && credentialFile.test(child)) refuse();
        visit(key);
        visit(child);
      }
      seen.delete(item);
    }
  };
  visit(value);
}
