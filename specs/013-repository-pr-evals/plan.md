# Plano — spec de repositório, PR histórico e harness

Status: **APROVADO em 2026-09-08 — implementação e validação em andamento**.

Decisão posterior aos gates: usuário autorizou API e login nativo para fontes
confiáveis. Não implementar nem alegar broker/isolamento adversarial nesta etapa.
Candidato tem rede pública; verifier separado sem rede. Cursor/OpenCode nativo
permanecem bloqueados pelo catálogo atual. As alternativas de isolamento abaixo
registram a auditoria, não são promessa da implementação atual. Contratos efetivos
e limitações estão em `docs/REPOSITORIOS_E_HARNESSES.md`.

## UI e documentação aprovadas

Preservar navegação principal. Tasks abre assistente progressivo do novo modo;
Credenciais agrupa conexões em seção recolhível com edição em painel. Uma etapa por vez,
valores avançados recolhidos, resumo final antes de executar e erros visíveis.
Configuração compartilhada de CLI segue versão/ambiente, autenticação por vínculo,
origem/modelo e teste explícito; não replicar formulários de credenciais.

Atualizar README, DOCUMENTACAO, instalação manual/Claude, fluxo Run/Compare/Analyze
e skill harbor-setup conforme cada função for entregue. Capturar UI real com dados
de demonstração sanitizados e substituir imagens afetadas, mantendo nomes estáveis
quando apropriado. Revisar layout em desktop e viewport estreito, foco/teclado,
disclosures, ações desabilitadas, logs e retomada. Não ilustrar proposta como pronta.

## Reuso e mudanças delimitadas

Não criar segundo executor nem outro cadastro de agentes/modelos/skills. Materializar
a fonte nova como task Harbor e alimentar `experiment-plan.ts` e
`experiment-runner.ts`. Manter schema/leitura dos experimentos existentes. As novas
entidades referenciam os registries atuais; campos novos são opcionais no modo antigo.

| Fronteira | Responsabilidade nova |
|---|---|
| `repository-source.ts` + `github-reference.ts` | Adquirir somente leitura e resolver história, sem execução do repo |
| `spec-bundle.ts` | Resolver Markdown selecionado, limites, hashes e manifesto |
| `repository-task.ts` | Produzir task/ambiente a partir do snapshot inicial |
| `verification-profile.ts` | Validar checks tipados e calcular resultado determinístico |
| `reference-evidence.ts` | Diffs históricos/candidatos para juiz; índice e cobertura |
| `harness-integrations.ts` + adapters pequenos | Diagnóstico, capacidades e descoberta por versão |
| GUI Tasks/Credenciais/Agents/Juízes/Analyze | Formulários e revisão usando contratos server-side |

Nomes de módulos são propostos; separar quando chegar a 400 linhas. Rotas apenas
delegam ao domínio. Não remover o bloqueio atual de `.git` no snapshot: exportar
árvores limpas antes dessa fronteira. Se o harness precisar de Git, criar um repo
novo com um único commit inicial e sem remote, dentro do sandbox.

## Modelo e contratos propostos

- `RepositoryEvalRecipe {schemaVersion:1,id,revision,codeSource,documentSource,
  specPaths,reference,verificationProfileId,environmentProfile,integrationIds,
  judgeId?,rubricIds?,judgePolicy}`. Fonte usa URL sem credencial ou vínculo local;
  referência usa host/owner/repo/prNumber e SHAs resolvidos no manifesto.
- `HarnessIntegration {id,adapter,version,executionTarget:"podman",
  authMode,credentialBinding?,options}`. Binding é identificador local, não segredo;
  export substitui por requisito de autenticação. Opções tipadas por adapter.
- `ResolvedRepositoryManifest`: hashes de arquivos, SHAs anterior/final/documental,
  head original, evidência do intervalo, versões Harbor/CLI, digest de ambiente,
  exclusões aprovadas, checks e origem do modelo. Referência fica separada dos inputs
  montados no candidato. Segredos são removidos antes de construir qualquer manifesto.
- `VerificationCheck {id,argv,cwd,timeoutSec,acceptedExitCodes,parser,weight,required}`;
  parser inicial `exit-code` ou `junit`; relatórios não presentes falham fechado.
- APIs propostas: `/api/repository-evals` (CRUD de receitas),
  `/api/repository-evals/resolve` (preview), `/api/repository-evals/prepare`
  (operação assíncrona), `/api/harness-integrations`, subações `diagnose` e `models`.
  Seguir guardas Host/Origin atuais; nenhuma rota retorna config/autenticação bruta.
  Definir schemas request/response e erros nos testes de contrato antes da UI.
- Export da receita é envelope separado versionado com referências de catálogo;
  reaproveitar validação e transação do import atual, sem mudar silenciosamente o
  significado do bundle v1. Preview não grava; aplicar exige conflitos resolvidos.

## Aquisição e isolamento

1. Resolver fontes em área gerenciada exclusiva. Não carregar hooks, filtros Git,
   helpers arbitrários do repo ou configurações globais inesperadas. Comandos argv
   separados; credencial via ambiente de processo de aquisição, sem URLs autenticadas.
   Remotes só HTTPS/SSH, hosts explícitos, sem redirecionamento que encaminhe segredo.
2. Resolver GitHub PR autenticado em modo leitura. Percorrer paginação, conferir
   hashes e ancestrais. Rebase não pode assumir `final^` nem inferir intervalo apenas
   pela contagem de commits. Casos especiais de merge queue/branch reescrita seguem
   resolução provada ou bloqueio. PR aberto/fechado sem merge é rejeitado.
3. Para PR de outra fonte, exigir correspondência da árvore inicial e evidência de
   equivalência antes de comparar; não aceitar dois projetos diferentes por nome.
4. Materializar arquivos regulares com quotas iniciais: documentos até 100 arquivos,
   1 MiB por arquivo, 10 MiB totais e profundidade 8; código até 100 mil arquivos e
   1 GiB expandido. Limites aparecem no preview; exceder bloqueia, nunca trunca.
   Symlinks/junctions, submodules e LFS exigem resolução explícita ou bloqueio na v1.
   Scanner de segredos precede snapshots; remover silenciosamente arquivo não é opção.
5. Separar source cache autenticado, base candidata e referência. Build context
   candidato só contém base e inputs aprovados. Preparar dependências fixadas sem
   fornecer gabarito; armazenar digest. Não compartilhar volumes graváveis entre trials.
6. Gate técnico antes de implementar UI de execução: comprovar que Podman/Harbor
   permite inferência por endpoint autorizado sem acesso livre ao GitHub/gabarito.
   Credenciais de inferência não podem ficar legíveis ao código avaliado: broker
   externo injeta autenticação, ou adapter oferece separação equivalente demonstrada.
   Sem isolamento demonstrado, bloquear o novo modo; nunca prometer proteção usando
   apenas instruções no prompt. O modo legado não muda de política implicitamente.
7. Rodar verifier em novo ambiente sem credenciais, alimentado pelo snapshot da
   solução candidata. Checks privados e agregador confiável não vêm da solução.
   Capturar workspace completo após execução via mecanismo Harbor validado; se o
   adapter só produzir trajetória/diff parcial, o gate deve apontar a insuficiência.
8. Derivar os dois diffs agregados com opções fixas e contexto de três linhas por hunk;
   capturar também arquivos novos não commitados e mudanças de modo/renomes/exclusões.
   Não depender apenas do diff informado pelo agente. Binários ficam identificados
   com hashes e status não avaliável textualmente; checks fazem sua validação aplicável.
   Juiz recebe somente esses diffs como código, documentos aprovados, rubrica e
   relatórios sanitizados. Não montar árvores nem permitir leitura do repo pelo juiz.
   Seu adapter não recebe credenciais Git nem capacidade de executar código do repo.
   Se `harbor analyze`
   não suportar esse contexto com isolamento, implementar ponte de evidências na
   camada de análise, mantendo registries/rubricas e formato de resultados existentes.
   Testar a entrada efetiva, inclusive contexto automático do adapter, para impedir
   que arquivos completos ou trajetórias com código extra contornem a restrição.

## Harness: descoberta e autenticação

Auditoria documental em 2026-09-08; ainda não é teste de integração. O Harbor instalado
é 0.22.0: sua versão de CLI pode diferir dos comandos documentados hoje.

| Adapter | Evidência oficial | Decisão proposta |
|---|---|---|
| `claude-code` | `--model` e execução não interativa na [referência Claude](https://code.claude.com/docs/en/cli-reference) | Fixar ID completo; descoberta só mediante API suportada comprovada; fallback manual |
| `codex` | `exec` e `debug models` experimental na [referência oficial](https://learn.chatgpt.com/docs/developer-commands?surface=cli) | Detectar versão/capacidade; não assumir comando experimental em versões antigas |
| `cursor-cli` | `--list-models` na [referência Cursor](https://cursor.com/docs/cli/reference/parameters) | Resolver binário/versão e normalizar somente campos permitidos |
| `opencode` | `models [provider]` e `run` na [referência OpenCode](https://opencode.ai/docs/cli/) | Descobrir catálogo configurado; listar não prova acesso de inferência |

O [contrato GitHub](https://docs.github.com/en/rest/pulls/pulls#get-a-pull-request)
define `merge_commit_sha` de maneira diferente para merge, squash e rebase.
Essa é a razão para persistir um intervalo verificado, não apenas número de PR.

Manter tabela server-side com execução headless, protocolos aceitos, auth, descoberta,
cancelamento, captura de alterações e entrega de skills por versão. O código atual do
adapter Codex também transforma o identificador de modelo: testar preservação de
aliases de gateway com barras antes de habilitar combinações dessa natureza.

Credenciais continua útil: provider direto e chave de inferência LiteLLM permanecem
lá; vínculo Git e login de integração têm propósitos separados. Não encaminhar todas
as credenciais salvas a qualquer subprocesso. Usar seleção por finalidade. Não ativar
LiteLLM, instalar CLIs ou disparar inferência durante descoberta/abertura de formulário.

## Fases e portas de decisão

### Resultado inicial dos gates — 2026-09-08

Inspeção da distribuição Harbor 0.22.0 instalada e prova offline com fixture sintético,
sem containers e sem chamadas LLM. Não equivale a certificação de integração.

| Gate | Evidência observada | Consequência |
|---|---|---|
| Juiz restrito a diff | `analyze/analyzer.py:221–232` copia trial e task completos. Chamar `assemble_analyze_task` com prompt pedindo só diff ainda copiou `task/solution/whole-repository.txt` e `trial/agent/trajectory.json` sintéticos | Preparar entrada nova por allowlist antes de Analyze; nunca passar trial/task originais. Validar pacote efetivo, não apenas prompt |
| Segredo fora do código | `agents/installed/base.py:814–860` executa CLI no ambiente; Claude/OpenCode/Cursor recebem segredo em env; `codex.py:1377–1396` grava/copia auth.json | Constatação anterior à aprovação: reuso não fornece isolamento forte. Usuário aprovou modo confiável; FR10/T004 registram a mudança. Broker permanece fora da entrega atual |
| Cursor | `cursor_cli.py:860–891` exige chave nativa, sem override de endpoint; `335–350` instala versão atual sem usar pin | Não habilitar modo isolado nem afirmar versão fixada sem adapter específico e prova |
| Rede | Harbor possui sidecar egress com NET_ADMIN/NET_RAW; probe de kernel cria container sem ownership do kit | Adaptar probe/ownership antes de executar e provar efeito no Podman; não usar probe bruto nem presumir suporte |
| Skills | Quatro adapters copiam para diretórios nativos; leitura efetiva ainda não exercitada | Teste real por adapter continua obrigatório |
| Modelos | Nenhum dos quatro adapters implementa discovery; alguns interpolam ID em comando interno | Probes por versão e validação estrita de IDs antes do adapter, além de tratamento de aliases |

Arquivos citados acima pertencem ao pacote Python `harbor`, não ao código deste repo.
Na inspeção, Claude usa versão em `claude_code.py:448–456`, Codex em `codex.py:318–338`
e OpenCode em `opencode.py:111–123`. Isso não certifica os instaladores atuais em Mac.

**Decisão de autenticação confirmada:** o usuário precisa de ambas as opções,
chaves de API e login/assinatura nativa. O broker não deve ser confundido com LiteLLM,
que continua opcional e desligado.
Uma identidade temporária dentro do sandbox também pode ser lida pelo código;
não satisfaz a garantia literal de nenhuma credencial acessível. Para API, avaliar
broker por identidade de transporte/rede e allowlist de operações, com limites por
trial. Para login nativo sem endpoint alternativo, avaliar execução de ferramentas
separada; isso pode exigir adapter específico e ampliar a alteração prevista.

A porta de decisão foi resolvida pelo usuário: **alternativa 1 aprovada**, para
repositórios confiáveis, com FR10 revisado. Isolamento forte continua fora da
capacidade entregue e não deve ser alegado.
### Decisão de isolamento nativo aprovada

As duas alternativas abaixo mantêm credenciais fora de export, logs, respostas da
API, evidências do juiz e artefatos versionados. Nenhuma altera o fluxo legado.

1. **Modo nativo para repositórios confiáveis:** CLI autenticado em ambiente Podman
   dedicado, sem credencial Git e sem gabarito, com a autenticação que o próprio CLI
   requer. UI explica que o código executado nesse ambiente pode acessar a sessão
   ou chave do CLI. Habilitar esse modo exige revisar expressamente a garantia mais
   forte do passo 6/FR21; não apresentá-lo como isolamento de credencial do candidato.
2. **Isolamento forte também para login nativo:** manter o gate e desenvolver/provar
   separação de execução de ferramentas e autenticação por adapter. Não há interface
   universal já comprovada; Cursor pode exigir integração específica ou permanecer
   indisponível até suporte técnico. Isso amplia o esforço além da integração simples.

A escolha foi apresentada e aprovada explicitamente. A reutilização dos CLIs
nativos existentes não fornece a garantia forte. A UI permanece
a mesma em ambas: autenticação por vínculo, capacidades e impedimentos no painel.

1. **Contratos e provas offline:** resolver história e testar isolamento possível
   no Harbor, captura de workspace, juiz e capabilities dos quatro adapters.
   Se exigir substituir o executor ou afrouxar isolamento, atualizar plano e pedir
   aprovação da mudança de escopo antes de continuar.
2. **Vertical completa:** repo local/GitHub, documentos, merge/squash/rebase validado,
   verifier isolado, um adapter já suportado e julgamento de referência. UI mínima
   completa para preparar, executar individual/Compare e analisar.
3. **Integrações:** configurar os quatro harnesses, descobrir modelos quando possível,
   provider/LiteLLM/manual, skill delivery e bloqueios explicados por combinação.
4. **Entrega:** import/export, documentação, skills de setup, testes UI, paridade e
   regressão do modo Harbor tradicional. Entrega final exige todas as fases, não só 2.

A aprovação documental antecedeu a implementação. A validação real subsequente
usa PR conhecido e DeepSeek conforme autorizado, com custo reportado no guia
`docs/REPOSITORIOS_E_HARNESSES.md`.
Validar macOS/Podman em Mac real; CI e mocks não certificam essa instalação.

## Constitution check

- Comparabilidade: mesmos snapshots e checks, origem e identidade efetiva registradas.
- Segredos: aquisição isolada, bindings locais, redaction e testes de não exportação.
- Runtime: Podman, ownership e manifest; nenhum deploy AWS ou Docker instalado.
- Arquitetura: módulos de domínio, integrações com capacidades declaradas e UI explicativa.
- Entrega: gates offline + evidências reais separadas; versões não testadas identificadas.

Risco principal: sandbox com acesso ao provedor também permitir exfiltração/leitura
do gabarito. Segundo risco: inferir incorretamente início de PR rebased. Ambos são
gates de funcionamento, não detalhes a adiar para depois da UI.


### Ajuste de conexões compartilhadas

Cadastro em Credenciais; componente único de seleção reutilizado em Agentes/Juízes.
Analyze aceita --agent/--ak no Harbor 0.22.0 instalado: reutilizar resolveHarnessRun,
sem segundo runner. Persistir digest da configuração na AnalysisSession; resolver
segredos somente no disparo, em env isolado, e recusar configuração alterada.


### Ajuste aprovado: SDD longo, GitHub e CI

- Prazo candidato configurável na receita em horas; prazo juiz separado no perfil,
  congelado na sessão. Padrão 8 h, sem teto fixo de horas; números finitos positivos.
- Remover timeout externo da análise/calibração; manter prazos individuais do Harbor
  e checks customizados. Export/import preservam apenas números, nunca identidade.
- Diagnóstico explícito em Credenciais usa login gh local para API/Git somente leitura;
  resultados booleanos e orientações, sem token, persistência ou login automático.
- CI anterior: corrigir aliases de sistema macOS, containment com paths canonicalizados,
  caixa de caminhos Windows e fixture independente de jobs-test preexistente.
- Validação: testar lógica, UI GitHub/prazos, suite e CI remoto após push. Smoke Codex
  anterior concluído; não equivale a executar por horas ou certificar macOS/Claude real.
