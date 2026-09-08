// Adds the same accessible contract to every visible form field: purpose, example, default and
// whether it is optional. Existing, more specific hints remain and are linked as well.

export function fieldContract({ label, placeholder, value, required, type, checked }) {
  const name = (label || "este campo").replace(/\s+/g, " ").trim();
  const fallback = type === "checkbox" ? (checked ? "marcado" : "desmarcado") : (value || "vazio");
  const example = placeholder || value || (type === "checkbox" ? "marque quando a condição se aplicar" : "consulte a dica específica acima");
  const optional = required
    ? "Obrigatório para continuar."
    : "Opcional: deixe no padrão ou vazio quando não precisar alterar esse comportamento.";
  return `Finalidade: configurar ${name}. Exemplo: ${example}. Padrão: ${fallback}. ${optional}`;
}

const FIELD_HELP = {
  "compact-toggle": "Oculta dicas introdutórias. Padrão: desligado. Avisos, custos, validação e estado continuam visíveis.",
  "compare-title": "Identifica o experimento no histórico. Ex.: Flash vs Pro. Padrão: sem título; opcional.",
  "compare-description": "Registra a pergunta e variáveis controladas. Ex.: mesmo agente, só muda o modelo. Padrão: vazia; opcional.",
  "compare-agent-picker": "Escolhe o perfil que resolve a task. Ex.: mini-swe-agent. Padrão: primeiro cadastrado; obrigatório para adicionar.",
  "compare-task-picker": "Preenche o caminho com uma task conhecida. Ex.: soma-fracoes. Padrão: nenhuma; opcional se digitar o caminho.",
  "f-task-dataset-path": "Define a task ou dataset avaliado. Ex.: .\\evals\\python\\soma-fracoes. Sem padrão; obrigatório.",
  "f-env": "Backend interno do Harbor conectado ao Podman. Padrão: docker. Avançado; não altere nesta instalação.",
  "f-job-prefix": "Prefixo legível dos jobs. Ex.: deepseek-ab. Padrão: cmp; opcional.",
  "f-jobs-dir": "Pasta que recebe resultados. Ex.: jobs. Padrão: jobs; altere para separar estudos.",
  "f-concurrency": "Trials simultâneos. Ex.: 2. Padrão: 1; aumente só quando custo e limite do provider permitirem.",
  "f-n-attempts": "Repetições de cada candidato por task. Ex.: 3. Padrão: 1; aumente para medir variação.",
  "f-teto-de-gasto-desta-run-usd": "Guarda pré-voo em USD. Ex.: 1.00. Padrão: 1.00; use 0 para desativar.",
  "f-extra-harbor-run-args-opcional-avancado": "Passa apenas kwargs permitidos. Ex.: --timeout-multiplier 1.5. Padrão: vazio; opcional avançado.",
  dryRun: "Valida a configuração sem executar trials pagos. Padrão: desligado; recomendado no primeiro uso.",
  "experiment-history-dir": "Pasta onde procurar experimentos. Ex.: jobs. Padrão: jobs.",
  "experiment-history-picker": "Escolhe um registro imutável para consulta. Padrão: nenhum; obrigatório para reabrir.",
  "compare-judge-picker": "Escolhe o perfil que julga resultados. Padrão: nenhum; opcional após a execução.",
  "analyze-validation-mode": "Permite juiz fora da lista curada e marca o veredito como não válido. Padrão: desligado; use só em smoke.",
  "f-label-apelido": "Nome legível do perfil de agente. Ex.: Mini SWE — DeepSeek. Sem padrão; obrigatório.",
  "f-harbor-agent-value": "Adaptador executado pelo Harbor. Ex.: mini-swe-agent. Sem padrão; obrigatório.",
  "agent-model-select": "Modelo herdado por novas candidaturas. Ex.: deepseek/deepseek-chat. Padrão: o do Harbor; opcional.",
  "agent-instructions": "Instruções sempre anexadas ao perfil. Ex.: regras do repositório. Padrão: template exibido; opcional e visível na prévia.",
  "agent-instructions-file": "Substitui as instruções pelo conteúdo de um Markdown. Padrão: nenhum arquivo; opcional.",
  "f-notes-opcional": "Contexto humano sobre o perfil. Ex.: compatível com modelos genéricos. Padrão: vazio; opcional.",
  "f-name-identificador-curto-sem-espaco": "Identificador do critério. Ex.: no_prolixity. Sem padrão; obrigatório.",
  "f-description": "Pergunta objetiva avaliada pelo critério. Ex.: a solução evita texto supérfluo? Sem padrão; obrigatório.",
  "criteria-guidance": "Explica evidência e regras de PASS/FAIL/N-A ao juiz. Padrão: roteiro exibido; obrigatório.",
  "f-label-3": "Nome legível do pacote de critérios. Ex.: Qualidade Python. Sem padrão; obrigatório.",
  "f-label-apelido-1": "Nome legível do juiz. Ex.: Juiz de alto rigor. Sem padrão; obrigatório.",
  "f-harbor-agent-value-quem-executa-o-julgam": "Adaptador que executa o julgamento. Ex.: claude-code. Padrão: claude-code; obrigatório.",
  "judge-model-select": "Modelo usado para julgar. Padrão: nenhum; obrigatório antes de analisar.",
  "judge-validation-mode": "Mostra modelos não curados para smoke. Padrão: desligado; opcional e sem validade avaliativa.",
  "f-instrucoes-do-juiz-opcional-substitui-o-": "Substitui o prompt do Harbor. Padrão: texto exibido; opcional, preserve os marcadores.",
  "f-notes-opcional-4": "Contexto humano sobre o juiz. Ex.: apenas validação. Padrão: vazio; opcional.",
  "f-label": "Nome curto exibido nos candidatos. Ex.: DeepSeek V4 Flash. Sem padrão; obrigatório.",
  "f-provider-model": "Identificador exato provider/modelo aceito pelo adapter. Ex.: deepseek/deepseek-chat. Sem padrão; obrigatório.",
  "f-label-5": "Nome legível da skill. Ex.: Engenharia Python. Sem padrão; obrigatório.",
  "f-instructions-markdown": "Conteúdo do SKILL.md criado pela UI. Padrão: roteiro exibido; obrigatório neste modo.",
  "skill-instructions-file": "Substitui as instruções com um Markdown. Padrão: nenhum arquivo; opcional.",
  "skill-extra-file-input": "Anexa exemplos ou scripts à pasta da skill. Padrão: nenhum; opcional.",
  "f-caminho-da-pasta-precisa-ter-um-skill-md": "Pasta existente com SKILL.md. Ex.: .\\skills\\review. Sem padrão; obrigatório no modo pasta.",
  "f-label-6": "Nome do conjunto de skills. Ex.: python + testes. Sem padrão; obrigatório.",
  "secret-provider-select": "Escolhe o provider e preenche a variável esperada. Ex.: Anthropic. Padrão: customizado; opcional.",
  "secret-name-input": "Nome exato da variável de credencial. Ex.: DEEPSEEK_API_KEY. Sem padrão; obrigatório.",
  "f-value": "Valor secreto fornecido pelo provider. Nunca volta à tela. Sem padrão; obrigatório.",
  "f-name-org-name-ou-so-o-nome": "Identificador da task. Ex.: minha-org/soma-fracoes. Sem padrão; obrigatório.",
  "f-org-se-o-nome-nao-tiver-org": "Namespace usado quando o nome não contém /. Ex.: minha-org. Padrão do kit; opcional.",
  "f-output-dir": "Pasta pai da nova task. Ex.: .\\evals\\python. Padrão do Harbor; opcional.",
  "f-steps-0-single-step": "Número de etapas sequenciais. Ex.: 2. Padrão: 0, etapa única; opcional.",
  "f-description-7": "Resumo humano da task no task.toml. Ex.: soma frações. Padrão: vazio; opcional.",
  "f-author": "Autor registrado no task.toml. Ex.: Equipe Eval. Padrão: vazio; opcional.",
  noPytest: "Omite o exemplo pytest. Padrão: desligado; marque ao usar outro framework.",
  noSolution: "Omite a solução de referência. Padrão: desligado; marque quando ela não será criada.",
  "task-editor-instruction": "Define o trabalho pedido ao agente. Sem padrão para tasks existentes; obrigatório para uma avaliação útil.",
  "task-editor-dockerfile": "Define o ambiente da task. Ex.: FROM python:3.13-slim. Sem padrão para tasks existentes.",
  "task-editor-solve": "Solução de referência usada no oracle. Padrão: vazio se omitida; recomendada para validar a task.",
  "task-editor-test": "Teste que grava reward real. Padrão novo: stub que falha; substitua antes de executar.",
  "task-editor-judge-picker": "Juiz sugerido para esta task. Padrão: nenhum; opcional.",
  "f-dataset-name-ou-name-version": "Nome publicado do dataset. Ex.: swe-bench-lite@1.2.0. Sem padrão; obrigatório.",
  "f-output-dir-2": "Pasta de download. Ex.: datasets. Padrão: datasets; opcional.",
  "config-import-file": "Bundle JSON de configuração. Padrão: nenhum; opcional e nunca contém credenciais.",
  "logs-jobs-dir": "Pasta de resultados que contém os logs. Ex.: jobs. Padrão: jobs.",
  "logs-job-picker": "Job cujo log será aberto. Padrão: mais recente; obrigatório quando houver jobs.",
  "logs-file-picker": "Arquivo de log dentro do job. Padrão: trial.log ou job.log; obrigatório quando disponível.",
  "logs-follow": "Acompanha novas linhas automaticamente. Padrão: ligado; desligue para inspecionar trecho antigo.",
  "f-jobs-dir-8": "Pasta entregue ao visualizador. Ex.: jobs. Padrão: jobs; obrigatório.",
  "f-job-or-trial-path": "Resultado que o juiz lerá. Ex.: .\\jobs\\cmp-... Sem padrão; obrigatório.",
  "analyze-judge-picker": "Juiz usado nesta análise avulsa. Padrão: nenhum; obrigatório.",
  "analyze-rubric-select": "Critérios aplicados. Padrão: rubrics nativos do Harbor; opcional.",
  "analyze-standalone-validation-mode": "Permite juiz não curado e marca o resultado como não válido. Padrão: desligado; use só para smoke.",
};

function labelText(field) {
  const label = field.id ? document.querySelector(`label[for="${CSS.escape(field.id)}"]`) : null;
  return label?.textContent || field.getAttribute("aria-label") || field.name || "este campo";
}

export function hasSpecificFieldHelp(id) { return Object.hasOwn(FIELD_HELP, id); }

export function resolveFieldHelp(id, override, fallback) {
  return typeof override === "string" && override ? override : FIELD_HELP[id] || fallback;
}

export function mergeHelpIds(...values) {
  return [...new Set(values.flatMap((value) => String(value || "").split(/\s+/)).filter(Boolean))].join(" ");
}

export function describeField(field, override) {
  if (!field || field.type === "hidden" || field.type === "radio" || field.closest(".checkbox-group") || field.dataset.fieldHelp === "off") return;
  if (!field.id) field.id = `field-${crypto.randomUUID()}`;
  const helpId = `${field.id}-field-help`;
  let help = document.getElementById(helpId);
  if (!help) {
    help = document.createElement("p");
    help.id = helpId;
    help.className = "hint field-help";
    const anchor = field.type === "checkbox" ? (field.closest("label") || field) : field;
    anchor.insertAdjacentElement("afterend", help);
  }
  const fallback = fieldContract({ label: labelText(field), placeholder: field.placeholder, value: field.defaultValue || field.value, required: field.required, type: field.type, checked: field.defaultChecked });
  help.textContent = resolveFieldHelp(field.id, override, fallback);
  if (field.id === "compact-toggle") help.classList.add("sr-only");
  const ids = new Set((field.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean));
  ids.add(helpId);
  field.setAttribute("aria-describedby", [...ids].join(" "));
}

export function installFieldHelp(root = document) {
  root.querySelectorAll("input:not([type=hidden]), select, textarea").forEach((field) => describeField(field));
}
