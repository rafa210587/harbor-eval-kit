# Jornadas reais da UI — plano, evidências e continuidade

Pedido: evidenciar o vínculo juiz → conjuntos de critérios, traduzir a UI,
esclarecer Logs/Trajetórias e testar jornadas reais com DeepSeek. Requisito adicional:
**exportação nunca inclui credenciais**.

## Plano registrado antes da implementação

1. Tornar os conjuntos padrão visíveis no juiz e herdá-los na análise avulsa.
2. Persistir saída de processos e recuperar acompanhamento sem expor segredos.
3. Executar doctor com Podman gerenciado; preservar recursos preexistentes.
4. Testar cadastros, uploads, export/import, tasks/datasets, comparações, execução,
   cancelamento, histórico, logs, viewer e julgamentos pela UI.
5. Usar task mínima, DeepSeek Flash/Pro e juiz Flash em modo validação.
6. Corrigir regressões, atualizar guias/skills, rodar gates, fazer commit e push.

AWS permanece **somente plano corporativo**. LiteLLM proxy permanece **OFF**.

## Ambiente e método

Windows, Node 24.19.0, Harbor 0.22.0 e Podman 6.0.2. Doctor passou CLI/API/Compose e
smoke primitivo; log em `jobs-test/ui-journeys-doctor.log`. Foram usados serviços
Linux `main`, rede pública e imagens base preexistentes. Sem Docker instalado.

Ações pela UI local: navegador interativo e Edge/Playwright com perfil temporário
próprio. Cadastros, uploads, downloads e execuções usaram a interface; leitura dos
artefatos no disco confirmou efeitos. Fixtures offline não substituíram chamadas reais.
O plano começou em 07/09; artefatos contêm também timestamps UTC de 08/09/2026.
Portas temporárias 44178–44181 e viewer 8080. Não expor a UI à internet.

## Matriz de cobertura

| Área | Evidência pela UI |
|---|---|
| Começar | Checklist identifica o passo faltante; os quatro atalhos selecionam models/agents/skills/free corretamente |
| Credenciais/modelos | Descoberta DeepSeek; probes Flash/Pro; criar/editar/remover modelo e credencial fictícios; valor não retorna |
| Agentes | Mini SWE e Terminus 2; modelo padrão; upload Markdown de instruções; conjunto padrão; edição |
| Skills | Authored, upload Markdown, extra com renome, path com SKILL.md, conjunto com duas skills |
| Critérios/juízes | Criar/editar, defaults vinculados visíveis, herança e bloqueio de dependências |
| Tasks/datasets | Criar task, editar quatro arquivos, defaults da task substituem juiz; download hello-world e descoberta aninhada |
| Configuração | Bundle por download; import por upload duas vezes sem duplicação; export bloqueado ao detectar credencial fictícia em notes |
| Compare | Flash vs Pro; Flash com skill; Oracle vs Nop ×2 tentativas/concorrência 2; Terminus 2; prévia e baseline |
| Execução | Dry run sem trial, logs e erro real; Oracle ativo cancelado, sem filho remanescente; guarda de seis trials recusada, sem criar experimento ou chamar modelo |
| Resultados | Reabrir disco após restart; reward/custos e análises preservadas; CSV/JSON baixados e campos conferidos, sem correspondência com as duas credenciais reais |
| Logs | Atalhos do candidato e análise; trial.log, verifier/reward.txt e stdout; alternar follow |
| Trajetórias | Iniciar, abrir job/task/trial; seis passos, Verifier/Log/Artifacts/Analysis; Parar liberou 8080 |
| Análise | Uma linha; todas as duas elegíveis; avulsa com dois conjuntos; critérios nativos em trial; reload durante última análise recuperou resultado |
| Design | Compare/Juízes/Análise/Credenciais a 390 px: sem overflow horizontal ou sobreposição observada; hints por campo |

“Todas as jornadas” significa caminhos funcionais, não todas as combinações de
providers, 41 adapters, datasets e sistemas operacionais. São smokes funcionais,
não evidência de qualidade geral dos modelos.

## Falhas reais encontradas e corrigidas

| Problema | Correção |
|---|---|
| Defaults do juiz pouco visíveis; avulsa não herdava | Campo próximo da identificação, nomes no resumo, herança editável; tradução Conjuntos de critérios |
| Analyze sem acompanhamento persistido | UUID por operação, estado/log em disco, tempo, controles bloqueados, atalho Logs e recuperação |
| Caminho impresso quebrou linha e ocultou análise/custo | Resolver analysis.json determinístico; código zero sem artefato válido agora falha |
| Skill falhou antes da API com WinError 206 | Job compacto, metadados no plano, preflight de comprimento e histórico compatível |
| Windows alterou acentos enviados ao modelo | PYTHONUTF8=1 e PYTHONIOENCODING=utf-8; smoke Python e trajetória Terminus confirmam |
| Dataset baixado não aparecia | Descoberta recursiva de raízes, recusa de links, filtro pelo destino |
| Dry run mostrava log anterior | Limpar painel e acompanhar saída persistida também no dry run |
| Prefixos por chunk quebravam palavras | Prefixar ao iniciar/mudar stream; preservar UTF-8 incremental |
| Job sem result final parecia ativo | “Sem finalização registrada”; falha de leitura visível |
| Discovery duplicava aliases | Normalização antes da deduplicação; estado e erros visíveis |
| Catálogo oferecia Terminus 1 inexistente | 41 registros reais do AgentFactory 0.22.0, incluindo ACP; customização preservada |
| Remoção referenciada dizia referência inexistente | Distinguir DELETE bloqueado de create/update inválido |
| Export permitia conteúdo sensível em texto livre | Credenciais fora do bundle; guarda de valores conhecidos, campos, formatos e arquivos antes de JSON/CSV/relatórios |

O parser antigo que dependia de stdout foi removido depois de confirmar que só os
testes o referenciavam. A regressão agora exercita o resolvedor usado em produção,
incluindo job com artefato antigo, trial individual e JSON inválido.

Análise inicial já paga foi reparada **offline**, sem chamada duplicada:
`7edbfc04-d5b7-4e97-ae58-d7ab09ceebfd`. Mesma posição no experimento, IDs/inputs/data
preservados; backup `jobs-test/ui-journeys-evidence-before-repair-80c5f48e.json`.
Trajetórias anteriores ao fix UTF-8 preservam o defeito original. Reward da task
mínima foi correto, mas elas não provam fidelidade de prompts acentuados.
O Terminus posterior confirmou os acentos corretos no input efetivo.

## Execuções e custo reportado

Modelos textuais estáveis `deepseek-v4-flash` e `deepseek-v4-pro`, conforme
[preços oficiais DeepSeek](https://api-docs.deepseek.com/quick_start/pricing/).
Flash é o mais barato desse catálogo textual estável; Pro é o segundo.
O modelo experimental de visão está fora desta avaliação de código.

Task criada pela UI: `evals/python/qa-ui-jornadas`, saída exata `42\n`,
Python padrão e base local `python:3.13-slim`.
Pasta: `jobs-test/ui-journeys-20260907`. Valores vêm dos artefatos Harbor.

| Experimento / candidato | Resultado | USD |
|---|---|---:|
| `2a676663-2f80-42d1-ab29-da7e20810c13`: Oracle ×2, Nop ×2 | Reward 1 / 0; sem chamada de modelo | Não reportado |
| `82efdd4c-31a3-46c8-ad00-3a2c8773a68d`: dry run | Três configurações válidas; sem trials | Não reportado |
| `80c5f48e-b827-4759-878f-0bd2da19d3d8`: Mini SWE + Flash | Reward 1; 6396 input/439 output; 68,1 s | 0.001321656 |
| Mesmo experimento: Mini SWE + Pro | Reward 1; 5144/354 tokens; 72,696 s | 0.003455408 |
| Mesmo experimento: Flash + skill | WinError 206 antes da API | Não reportado |
| `ee14cbbd-53e9-4929-9d28-2bb552284d72`: somente variante com skill após fix | Reward 1; 6658/371 tokens; 67,747 s | 0.000801896 |
| `abf29e5d-dd2a-4ebf-baa2-6240dea00ed5`: dry run Terminus | Configuração válida; sem trial | Não reportado |
| `dcab587f-c7e6-4ddf-be3a-5b8376949d9b`: Terminus 2 + Flash | Reward 1; 3181/401 tokens; 58,366 s; acentos corretos | 0.001056512 |

Mini SWE: cinco passos, 1024 tokens/resposta, thinking desligado, cost_limit=0.03.
Terminus: cinco turnos e 1024 tokens/resposta; isso limita volume, não é teto rígido.

| Operação do juiz Flash | Jornada / checks | USD |
|---|---|---:|
| `7edbfc04-d5b7-4e97-ae58-d7ab09ceebfd` | Linha Flash: 1 PASS; reparada offline | 0.008189328 |
| `9f8cda87-80ee-4097-b7e8-8009dcbb81ed` | Analisar todas: Flash, 1 PASS | 0.010178368 |
| `37b1dc77-5fb9-402c-bbe8-74ee42a098a5` | Analisar todas: Pro, 1 PASS | 0.007660976 |
| `688262ee-78cd-4be0-a048-08fd113bbb33` | Avulsa Python Quality, 2 PASS | 0.013658392 |
| `3501dbb8-f404-4ee8-8d4e-0d1503b52b1d` | Avulsa QA Resultado, 1 PASS; recuperada após reload | 0.011195856 |
| `3d408b5f-c846-43ab-a4f6-1864427f6798` | Avulsa nativa no trial qa-ui-jornadas__JNLzE9E: reward_hacking + task_specification, 2 PASS | 0.008888016 |

**Total reportado desta rodada: US$ 0.066406408**, candidatos e juiz.
Dois probes não reportaram custo e não são tratados como grátis.
Juiz Flash usou modo validação; resultados ficam fora do ranking de qualidade.
Analisar todas pulou a falha de infraestrutura e aplicou a mesma sessão congelada
às duas linhas elegíveis. Avulsa congelou os dois conjuntos antes de iniciar.
Reload recupera a chamada iniciada, mas não agenda automaticamente itens de um
lote que o navegador ainda não enviou.

## Onde ficam os logs e as trajetórias

| Ação | Arquivo / acesso |
|---|---|
| Executar / dry run | `<jobsDir>/.experiments/<id>/logs/candidate-N.log`; painel ao vivo e “Saída do processo”, mesmo antes do trial |
| Candidato Harbor | `<jobsDir>/<job>/job.log`, `<trial>/trial.log`, verifier/test-stdout.txt, verifier/reward.txt e logs do agent; Logs por linha |
| Analyze / viewer | `~/.harbor-eval-kit/operations/<uuid>/operation.json` e operation.log; cartão mostra caminho/estado/atalho |
| Julgamento | analysis.json canônico; job interno harbor-eval-kit-analysis-<uuid sem hífens>; caminho na operação |
| Trajetórias | Arquivos agent/ do trial; viewer lê o mesmo jobsDir |

O viewer permite investigar comandos, respostas, verificador e exceções por trás
do reward. Foi iniciado, navegado e parado pela UI. Alguns resumos upstream
arredondam custo a $0.00: use detalhes do kit/JSON para frações de centavo.
Na avulsa, o alvo inspecionado e a pasta de trabalho do juiz são diferentes.
O novo campo de pasta de trabalho explicita o destino, com padrão `jobs`.

## Segurança, evidências e encerramento

Bundle inclui somente registries autorizadas, nunca o armazenamento de credenciais.
Teste real com segredo fictício em notes: Exportar recusou, sem download e sem valor
no erro. Bundle normal foi baixado/importado duas vezes sem duplicar IDs.
Testes JSON/CSV comprovam recusa antes de headers e antes de gravar relatórios.

Evidências ignoradas pelo Git: `jobs-test/audit-ui-crud/` (downloads, logs e capturas
mobile), `jobs-test/ui-journeys-evidence.json` (métricas, acentos, scan e ownership),
`jobs-test/ui-journeys-baseline/` (snapshot anterior sem secrets).
Nenhuma credencial real aparece no relatório.

Cancelamento real: experimento `f03a1517-df00-45ae-9531-d59ff6c739bb`, Oracle,
estado final cancelled em 15 s; log visível e nenhum filho do teste ativo.
Dry run adicional `22f6d1b0-0508-469e-91e0-12e3e0c8c011` validou Oracle/Nop
e logs exclusivos da configuração atual, sem repetir chamadas pagas.

Conciliação final: 18 reservas de containers, 18 imagens e 18 redes nesta rodada,
zero volumes. Todos os 54 recursos já estavam ausentes na descoberta final;
dry-run de cleanup teve zero ações, sem prune nem remoção de preexistentes.
Auditoria persistida em `jobs-test/ui-journeys-cleanup-dry-run.json` e manifesto.
Varredura de 396 artefatos, 14 arquivos de operações, manifesto, backup e quatro
arquivos auxiliares encontrou zero correspondências com as credenciais conhecidas.

Guarda de volume: seis trials pagos sem histórico, diálogo recusado e
`experimentCreated:false`. Downloads CSV/JSON e cleanup dos sete cadastros QA
estão registrados em `jobs-test/ui-journeys-20260907/playwright-*-report.json`.
Defaults da task QA foram limpos. Os cinco perfis QA-FREE e as credenciais fictícias
também foram removidos. Nenhum cadastro preexistente foi removido.

Task e dois datasets criados nesta rodada foram preservados em
`jobs-test/ui-journeys-assets/`, sem entrar na distribuição. Os snapshots das
execuções continuam nos respectivos experimentos. As instâncias antigas da GUI
foram encerradas; uma instância com código atualizado permanece em 44181.

Gates finais concluídos: `pwsh -NoProfile -File scripts/test.ps1` terminou com
**TUDO VERDE**: Node **226/226**, imports **79 TS/36 GUI**, sem ciclos e scanner
completo sem credenciais. Contrato Python: **15/15**. O primeiro gate apontou duas
fixtures sintéticas; foram corrigidas sem mudar padrões, allowlists ou hooks, e
o gate completo passou novamente. `git diff --check` também passou.

Publicação autorizada por commit e push, com `.githooks` ativo. O commit associado
a este relatório e seu CI são verificáveis no histórico do repositório e no
[workflow CI](https://github.com/rafa210587/harbor-eval-kit/actions/workflows/ci.yml).
Não repetir chamadas pagas para reconfirmar esses resultados.

## Parecer e próximos investimentos

**Piloto local Windows** com objetivo central exercitado. Não declarar certificação
dos 41 adapters nem operação corporativa pronta.
Próximos pontos: smoke real macOS/Linux; integração LiteLLM quando autorizada; fila
durável para retomar lotes; política configurável e orçamento do juiz; extrair rotas
de gui-server.ts; licença e controles de uso compartilhado antes da implantação.
[AWS corporativo](PLANO_AWS_CORPORATIVO.md) continua somente plano.
[Materiais para consolidação/remoção](AUDITORIA_ENTREGA_2026-09-07.md#materiais-candidatos-a-remoção-ou-consolidação):
nenhum material preexistente foi excluído nesta rodada.

## Prompt de continuidade

```text
Continue por docs/JORNADAS_REAIS_UI_2026-09-07.md e pelo Git atual.
Leia AGENTS.md, docs/ENGENHARIA.md, .claude/skills/ship-change/SKILL.md e git diff.
Preserve mudanças existentes. Os testes reais DeepSeek listados já ocorreram:
não repita chamadas concluídas só para reconfirmar; confira os artefatos/IDs.
Credenciais nunca entram em export, logs ou argv. Preserve guardas fail-closed.
Não execute AWS, não ligue LiteLLM proxy, não instale Docker nem faça prune.
Cleanup exige manifest, prefixo, label e ID; preserve preexistentes.
Confira encerramento: termine só pendências, rode scripts/test.ps1 (ou test.sh),
imports, Python e hooks; commit/push sem force. Se publicado, confira SHA/CI.
Juiz Flash valida funcionamento; não é ranking científico. macOS/Linux real,
LiteLLM real e operação corporativa continuam limites declarados.
```
