# Tasks — 013

Status: **implementação inicial validada em 2026-09-08; matriz completa ainda aberta**. Checkboxes só representam
trabalho concluído com evidência. Aprovação não significa feature entregue.

## Fase 0 — aprovação e contratos

- [x] T001 Registrar aprovação e eventuais ajustes em spec/plan antes de código.
  Evidência: usuário aprovou execução e pediu UI enxuta, guias e novas capturas;
  FR28–30 e seção de UI do plano incorporam esses requisitos.
- [x] T002 Definir schemas de receitas, manifesto, checks, integração e erros; testar
  compatibilidade com registros existentes (FR01–05, FR20–23, FR27).
- [ ] T003 Provar interfaces Harbor 0.22.0 para snapshot final, verifier separado,
  contexto do juiz e skills; listar limitações por adapter (FR09–10, FR14, FR17, FR24).
  O risco de cópia integral do Harbor foi contornado por pacote de evidências
  independente; teste real DeepSeek confirmou a jornada. Leitura de skills ainda
  não foi exercitada em todos os adapters; por isso a tarefa permanece parcial.
- [x] T004 Provar isolamento de rede/autenticação para inferência sem acesso ao
  gabarito; se inviável, apresentar revisão de escopo (FR09–10, FR21).
  Resolvido: usuário aprovou modo confiável com identidade CLI acessível ao código,
  sem broker, e FR10 foi atualizado. Credenciais Git/gabarito locais ficam separados.
  Cursor/OpenCode nativo seguem bloqueados pelo catálogo, sem promessa de suporte.

## Fase 1 — fontes, história e documentos

- [ ] T005 Implementar aquisição somente leitura local/Git HTTPS/SSH/GitHub e vínculo
  de credencial por finalidade; testes de paths, URLs, redirecionamento, logs e argv.
- [ ] T006 Resolver merge/squash/rebase completo; fixtures multi-commit, merge queue,
  ref reescrita, fork, PR inexistente/não mergeado e SHA ambíguo (FR06–08).
- [ ] T007 Congelar e hashear árvores; testes com commit posterior sentinela,
  paginação, arquivos renomeados/removidos/binários, quotas e efeitos de filtros Git.
- [ ] T008 Resolver spec/plan/tasks selecionados; ciclos, referências externas,
  escapes, links, arquivos ausentes e alterações posteriores ao preview (FR03–05).
- [ ] T009 Persistir manifestos imutáveis e operação recuperável; cancelamento e
  cleanup gerenciado sem alterar checkout ou dependências preexistentes (FR25–26).

## Fase 2 — execução e julgamento

- [x] T010 Materializar task Harbor compatível com planner/runner atuais; garantir
  exclusão do gabarito em build context, camadas, mounts e Git do candidato.
- [x] T011 Implementar checks tipados, agregação e relatórios por check; testar
  timeout, parser inválido, zero checks, pesos/limiares e falha obrigatória (FR11–12).
- [ ] T012 Validar base/referência e justificativa documental; testar resultado real
  e impedir aprovação por reward forjado ou modificação de testes (FR13–14).
- [ ] T013 Capturar árvore candidata inteira internamente e gerar os dois diffs
  agregados para o juiz; testar arquivos novos, cobertura, estouro de contexto e
  instruções maliciosas. Provar ausência de acesso do juiz às árvores completas.
- [ ] T014 Integrar juiz/rubrica e política após checks, incluindo sem juiz e
  diagnóstico de falhas; aceitar solução semanticamente equivalente (FR15–19).

## Fase 3 — integrações e UI

- [x] T015 Acrescentar vínculo opcional de integração aos profiles existentes e
  catálogo server-side de capacidades por versão; não duplicar modelos/skills.
- [ ] T016 Configurar Claude Code, Codex CLI, Cursor CLI e OpenCode em Podman;
  testar diagnóstico, autenticação por finalidade, modelo efetivo e cancelamento.
- [x] T017 Implementar descoberta suportada e cadastro manual; testes com executáveis
  simulados, saídas inesperadas, timeout e ausência de inferência automática.
- [ ] T018 Validar matriz CLI/provider/LiteLLM, aliases e ausência de fallback oculto;
  preservar LiteLLM desligado e não ampliar elegibilidade de juiz por alias arbitrário.
- [ ] T019 Demonstrar entrega e leitura de skills por adapter, inclusive tratar
  limitação conhecida Mini SWE com equivalência das instruções (FR24).
- [ ] T020 Entregar assistente de Tasks e configuração em Agents: hints, exemplos,
  preview, pré-requisitos, progresso/cancelamento e logs por operação (FR25–26, FR28–29).
  Sem novas abas por CLI; testar divulgação progressiva e navegação por teclado.
- [ ] T021 Exibir resultados determinísticos e do juiz, manifesto e cobertura;
  testar restauração após reinício e isolamento de execuções concorrentes.

## Fase 4 — portabilidade e entrega

- [ ] T022 Implementar export/import versionado com preview, remapeamento, atomicidade,
  conflitos e reautenticação. Testar ida/volta sem segredo/caminho privado (FR27).
- [ ] T023 Testes de segurança cruzam API, stdout/stderr, argv, snapshots, logs,
  export e evidências; canários sensíveis nunca aparecem em nenhuma dessas saídas.
- [ ] T024 Testar todas as jornadas pela UI: preparar, individual, Compare, sem juiz,
  com juiz, falha de check, rebase ambíguo, integração indisponível, import e cancelar.
- [ ] T025 Validar chamadas reais com orçamento acordado; registrar versões, modelos,
  skills observadas, custos reportados e adapters/SOs não exercitados.
- [x] T026 Atualizar README, DOCUMENTACAO, guias, screenshots pertinentes e skill
  harbor-setup com fallback manual (FR30). Capturas reais sanitizadas das jornadas
  entregues; verificar links e correspondência com a UI. Nenhuma instrução implica AWS.
- [ ] T027 Rodar gates completos, validar Bash/PowerShell e smoke Windows/Linux/macOS
  quando hosts disponíveis. Não marcar suporte real com testes simulados.
- [ ] T028 Revisar aceitação FR01–27, regressão das tasks legadas, diff e scanner;
  commit/push seguindo autorização de entrega, sem ignorar hooks.
- [ ] T029 Revisar FR28–31: UI enxuta, configuração compartilhada, docs/imagens reais
  e regressão. Usar fixtures dos schemas anteriores e conferir os mesmos resultados
  para entradas antigas. Não habilitar a jornada com regressões conhecidas.
- [ ] T030 Registrar gate baseline e repetir suíte após mudanças; exercitar pela UI
  as capacidades legadas afetadas, incluindo sem juiz, dois candidatos, pins,
  export/import, logs, cancelamento e restauração. Documentar o que não foi exercitado.

## Prompt de continuidade para Claude ou outro agente

### Estado de execução — 2026-09-08

Aprovação registrada: executar API e login nativo para fontes confiáveis, UI enxuta,
docs, capturas e regressão. Não pedir novamente esta autorização. Não implantar AWS
nem ativar LiteLLM. Cursor/OpenCode nativo continuam indisponíveis no adapter atual.

Implementação inicial incluída nesta revisão (consulte git log para a publicação):

- Aquisição local/Git, histórico merge/squash/rebase comprovado, bundle Markdown,
  receitas/import/export, hashes e calibração em módulos scripts/lib/repository-*.
- Materializador com verifier separado sem rede e checks não root; gerenciador
  Python suporta no-network estático. Shells/install legados não foram alterados.
- Juiz recebe pacote mínimo: candidate.diff, reference.diff, docs, checks sanitizados.
  Prompt personalizado preservado. Falhas bloqueiam juiz, salvo opção explícita em
  Análise avulsa. Casos legados mantêm a entrada anterior.
- Integrações com bindings explícitos, catálogo, diagnóstico, edição, descoberta
  suportada/manual e snapshot público. Reader de sessão nativa alimenta redatores
  de API/logs/export. Arquivo ilegível produz resposta genérica 503, sem vazar dados.
- Assistente Tasks e seção de conexões em Credenciais recolhidos; inputs seguem tema; viewport 390 px
  conferido sem overflow. Capturas reais em docs/screenshots/repository-checks.png
  e harness-integration.png, vinculadas em docs/GUIA_VISUAL.md.
- Guias/README/DOCUMENTACAO/skills atualizados; guia principal novo:
  docs/REPOSITORIOS_E_HARNESSES.md. Reconciliar checklist com evidência final.

Testes reais nesta etapa:

1. UI preparando octocat/Hello-World#6: operação e24e01e2-b439-4474-b9d1-bc383de43eaa,
   base reward 0, referência 1. Task evals/repositories/repo-c1be9139-ebb.
   Corrigidos bugs de test.sh não copiado e materialização C: → D:.
2. Unitário Nop na nova task: experimento 462dd3d3-ae7d-44b9-b422-72cb40e1c79e,
   reward 0, zero exceções, 50,3 s. Juiz bloqueado antes de inferência pela UI.
3. Análise avulsa com override diagnóstico e DeepSeek V4 Flash:
   operação 0c84ce99-0da9-4c71-8798-8d700d494146, sucesso, US$ 0,007408 reportados,
   referências aos quatro arquivos de evidências na resposta. Não vale como nota real.
4. Legado soma-fracoes: experimento 31026dec-ef39-4731-a8c9-063f63474136,
   Oracle reward 1 (27,8 s), Nop reward 0 (26,7 s). Logs abrem o candidato correto;
   reabertura após reload mostrou resultados persistidos.
5. Export/import de receita pela UI, prévia sem gravação; configuração/edição de
   QA spec013 — Codex API, diagnóstico 0.153.4 do host, fallback manual de modelos.
   Cadastro temporário removido após conferir ausência de vínculos. Nenhuma credencial criada.
6. Comparação DeepSeek Flash/Pro com duas skills iniciada na UI:
   experimento c3848ffe-2cd1-4b54-aee6-81848604d0c6, kwargs cost_limit=0.10 e
   step_limit=12 por candidato. Flash reward 1, US$ 0,00283164, 96,302 s;
   Pro reward 1, US$ 0,004849768, 99,855 s. Flash leu ambos SKILL.md; Pro não mostrou
   leitura das skills. Números registrados no guia; não generalizar qualidade.

7. Cancelamento real de preparação pela UI: operação
   74fa923f-ab17-4da3-8e85-427668ec23e3, estado persistido como cancelado e nenhum
   container gerenciado rodando ao final.
8. Verifier em Podman sem LLM: check comprovou execução não root, nenhuma rota de
   rede e recusa de sobrescrita de reward. Job harbor-eval-kit-verifier-security,
   reward 1, zero exceções, 51,282 s. Evidência local ignorada em
   jobs-test/harbor-eval-kit-verifier-security-yGUMy2.

Gates: baseline antigo 247 Node passou. Gate completo v2 passou (296 Node,
imports e scanner). Verificação seguinte 297 Node passou. Após alinhar limiar
configurável entre UI/verifier/juiz, 300 Node e 3 helpers Python passaram; gate
completo v3 passou: imports sem ciclos e scanner sem credenciais, registrado em
jobs-test/spec013-final-gates-v3.log. A rodada Node final com 300 testes está em
jobs-test/spec013-final-node.log. Python managed:
12 testes passaram. Nenhum teste automatizado faz inferência ou sobe containers.

Próximos passos concretos:

- Evidência concluída do limiar pela UI na operação
  73714e47-7f8d-47b4-bf26-bfe3f077331e: base score 0/reprovada, referência 0,8/aprovada
  apesar de falha opcional controlada. Receita salva anterior preservada.
- Conferir git status/log antes de continuar; os gates e a revisão desta etapa já
  terminaram. Publicação autorizada, mantendo hooks; não inclua artefatos de runtime.
- Seguir tarefas abertas sem confundir implementação inicial com certificação de
  todos os cenários: quatro logins CLI reais não validados; macOS indisponível;
  Cursor/OpenCode nativo bloqueados pelo adapter; UI JUnit somente via receita/API;
  resolução Git usa worker e timeout por comando, sem operação persistida e
  cancelamento próprios; merge queues e forks exigem mais fixtures.
- Jobs, capturas de diagnóstico de runtime e tasks materializadas são ignorados;
  screenshots documentais sanitizados são os únicos artefatos visuais publicados.

> Continue lendo AGENTS.md, spec.md, plan.md e os módulos citados. O usuário já
> aprovou implementação, modo confiável e commit/push. Não reabra essas aprovações;
> não implemente AWS nem ative LiteLLM. Consulte primeiro git status/log e os gates
> para não repetir trabalho concluído. Priorize as tarefas abertas e atualize as
> evidências, sem alegar certificação de CLI/SO que não ocorreu. A UI de teste usa
> http://127.0.0.1:44494/; não encerre a GUI original em outras portas. Não exporte
> credenciais nem dados de sessão. Rode o gate e mantenha os hooks ativos.


## Ajuste aprovado — conexões compartilhadas (2026-09-08)

- Centralizar cadastro/diagnóstico em Credenciais; Agentes e Juízes apenas selecionam.
- Separar API, sessão Codex e OAuth Claude; nenhum campo de API no modo assinatura.
- Reutilizar resolveHarnessRun no Analyze, com ambiente isolado e parâmetros do adapter.
- Congelar identidade/configuração da conexão na sessão; recusar edição durante o lote.
- Preservar análises sem conexão, rubricas, política de modelos e pacote somente diff.
- Testar regras e UI; atualizar docs/capturas, executar gate e publicar.

Continuidade: conferir git diff antes de repetir etapas. O Analyze instalado aceita
--agent e --ak; não é necessário um segundo motor de julgamento. Sessões pessoais
não devem ser vinculadas automaticamente nem usadas em testes sem vínculo explícito.


### Validação do ajuste compartilhado

305 testes Node passaram; gate completo passou com imports sem ciclos e scanner
limpo. UI confirmou formulário API/Claude OAuth/Codex sessão, cadastro compartilhado,
seleção e reedição do juiz, bloqueio de remoção enquanto vinculado e limpeza dos
cadastros QA. O usuário autorizou testar a sessão Codex local por assinatura.
Primeira operação e801f21e-647c-4a55-ad3a-8688d083f3e4 autenticou e escreveu análise,
mas foi interrompida pelo limite antigo de 120 s durante a primeira inicialização.
Timeout externo removido; prazo do juiz configurável em horas. Container residual removido com prova no
manifesto e credencial original fora do repo. Repetição real em andamento na UI.
Não publicar resultado de sucesso antes de conferir operation/result.json.


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

Validação local final: login/API/Git confirmados pela UI, juiz de QA salvo com 24 h
e removido, campo candidato aceita 72 h. Config do Harbor instalado confirma 24 h
para o juiz. Corrigido também carregamento assíncrono dos catálogos na receita.
Gate completo e scanner passaram; suite ampliada e CI remoto conferidos ao publicar.
