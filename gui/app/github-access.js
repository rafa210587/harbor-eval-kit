import { $, api } from "./core.js";

const host = $("#tab-secrets");
if (host) {
  const section = document.createElement("details");
  section.id = "github-access";
  section.className = "panel";
  section.innerHTML = `<summary><strong>Acesso ao GitHub</strong></summary>
    <p class="hint persistent-hint">Use para avaliações que leem specs e PRs no GitHub. Pule somente quando a avaliação não consulta o GitHub; PR de referência exige acesso mesmo com código local. A plataforma reutiliza o login do GitHub CLI no host do serviço, separado da assinatura do harness.</p>
    <p class="hint persistent-hint">Nesse host, execute <code>gh auth login --hostname github.com</code>. Use uma conta com leitura do repo e autorize o SSO, se exigido. Não cole tokens aqui. Em servidor remoto, o login do seu notebook não é transferido.</p>
    <form id="github-access-form"><label for="github-access-repository">Repositório para verificar (opcional)</label>
      <input id="github-access-repository" type="text" placeholder="owner/repo" data-field-help="off" aria-describedby="github-access-help">
      <p id="github-access-help" class="hint">Vazio verifica somente o login. Com owner/repo, verifica leitura pela API e pelo Git sem alterar arquivos ou PRs. O campo não é salvo.</p>
      <button type="submit" class="secondary">Verificar acesso GitHub</button>
    </form><p id="github-access-status" role="status" aria-live="polite"></p>
    <p class="hint persistent-hint">A credencial permanece no armazenamento local do gh. Ela não entra em exports, logs, snapshots ou containers de agentes/juízes. Esta conexão atende github.com; outros remotos Git usam o fluxo HTTPS/SSH documentado.</p>`;
  host.appendChild(section);
  $("#github-access-form").addEventListener("submit", async event => {
    event.preventDefault();
    const button = $("button", event.currentTarget), status = $("#github-access-status");
    if (button.disabled) return;
    button.disabled = true;
    const started = Date.now(), label = button.textContent;
    const timer = setInterval(() => { button.textContent = `${label} · ${Math.floor((Date.now() - started) / 1000)}s`; }, 1000);
    status.textContent = "Verificando o login local e as permissões de leitura. Nenhuma inferência será enviada.";
    try {
      const result = await api("POST", "/api/github-access/diagnose", { repository: $("#github-access-repository").value.trim() });
      status.textContent = result.message;
      status.style.color = result.authenticated && result.gitReadable !== false ? "var(--ok)" : "var(--warn)";
    } catch (error) { status.textContent = error.message; status.style.color = "var(--warn)"; }
    finally { clearInterval(timer); button.disabled = false; button.textContent = label; }
  });
}
