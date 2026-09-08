import { execFile } from "node:child_process";
import { repositoryProcessEnv } from "./repository-source.ts";
import { normalizeGithubRepository } from "./github-reference.ts";

type Probe = (command: string, args: string[], env: NodeJS.ProcessEnv) => Promise<boolean>;
const probe: Probe = (command, args, env) => new Promise(resolve => {
  // Output can contain identity or credentials. Neither stream ever leaves this probe.
  execFile(command, args, { env, timeout: 30000, maxBuffer: 1024 * 1024, windowsHide: true }, error => resolve(!error));
});

export interface GithubAccess {
  available: boolean;
  authenticated: boolean;
  repository?: string;
  repositoryReadable?: boolean;
  gitReadable?: boolean;
  message: string;
}

/** Read-only checks against the same host identity used during acquisition; no stored result. */
export async function diagnoseGithubAccess(repository = "", run: Probe = probe): Promise<GithubAccess> {
  const normalized = repository ? normalizeGithubRepository(repository.trim()) : "";
  const env = repositoryProcessEnv();
  if (!await run("gh", ["--version"], env)) return { available: false, authenticated: false, message: "Instale GitHub CLI (gh) no host que executa a plataforma e reinicie o serviço para atualizar o PATH." };
  const apiArgs = ["api", "--hostname", "github.com"];
  if (!await run("gh", [...apiArgs, "user", "--jq", ".login"], env)) return { available: true, authenticated: false, message: "Login local indisponível ou GitHub inacessível. No host do serviço, execute gh auth login --hostname github.com e confirme rede, conta e SSO corporativo." };
  if (!normalized) return { available: true, authenticated: true, message: "Login local confirmado. Informe owner/repo para também verificar leitura da API e do Git. Nenhuma credencial foi coletada." };
  const repositoryReadable = await run("gh", [...apiArgs, `repos/${normalized}`, "--jq", ".full_name"], env);
  const gitReadable = repositoryReadable && await run("git", ["-c", "core.hooksPath=/dev/null", "-c", "core.fsmonitor=false", "-c", "protocol.ext.allow=never", "-c", "credential.helper=", "-c", "credential.https://github.com.helper=!gh auth git-credential", "ls-remote", "--", `https://github.com/${normalized}.git`, "HEAD"], env);
  return { available: true, authenticated: true, repository: normalized, repositoryReadable, gitReadable,
    message: repositoryReadable && gitReadable ? "Leitura confirmada na API e no Git com o login local. O acesso a cada PR e revisão será validado ao resolver a avaliação." : "Login confirmado, mas a leitura do repositório falhou na API ou no Git. Confira nome, permissões, instalação do Git, rede e autorização SSO." };
}
