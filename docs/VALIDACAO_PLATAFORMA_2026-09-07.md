# Validação da plataforma — 2026-09-07

Host: Windows, Node 24.19.0, Harbor 0.22.0, Podman 6.0.2, machine Linux/amd64.
UI real em `127.0.0.1:44175`, usando o estado local existente. LiteLLM proxy OFF.
Nenhuma infraestrutura AWS criada. Nenhuma instalação de Docker ou alteração do Harbor global.

## Ambiente e ownership

- Gate CLI/API/Compose passou, incluindo identificação Podman em `/version` e flags
  `compose up --wait` e `--pull`.
- Smoke real: build, exec, env sintética, bind nos dois sentidos, volume, rede, labels e cleanup.
- Imagens Alpine 3.20 e Python 3.13-slim eram preexistentes e foram preservadas.
- `oracle`: reward 1, zero erros, 26,600 s. `nop`: reward 0, zero erros, 25,593 s.
  Experimento `c7c59c87-3e14-420f-8494-7ee798d2ab44`, em `jobs-test/platform-validation`.
  Os seis recursos desses trials foram registrados no manifest e confirmados ausentes no fim.
- A revisão real descobriu que Analyze cria outra task interna e força o enum `docker`.
  As duas primeiras análises pagas usaram esse caminho upstream; **não comprovam ownership**.
  A sequência de novas chamadas foi interrompida e o executor foi corrigido antes de continuar.
  `harbor_eval_kit.cli` troca somente a entrada de ambiente no registro em memória do
  subprocesso, com versão/contrato fixados e restauração ao sair. Não edita o pacote instalado.
- Smoke do Analyze corrigido: `harbor-eval-kit-analyze-smoke`, em
  `jobs-test/platform-validation`, com `nop`: ambiente/verifier/cleanup executados em 21 s.
  Exit 1 e ausência de `analysis.json` são o resultado esperado de um juiz nop; nenhuma API.

## Comparação paga, iniciada por cliques

Modelos confirmados na [tabela oficial DeepSeek](https://api-docs.deepseek.com/quick_start/pricing/):
Flash e Pro são os dois modelos de texto estáveis mais econômicos disponíveis nessa tabela.
A variante vision experimental, empatada com Flash, ficou fora deste teste de programação.

Task: `evals/python/soma-fracoes`. Adapter: `mini-swe-agent`. Um trial por candidato,
concorrência 1, perfil sem instruções extras. A/B mudam só o modelo; C adiciona o conjunto
`Qualidade Python` (skill `Python enxuto`) ao Flash. Isso valida funcionalidades; três trials
não sustentam uma conclusão estatística sobre qualidade dos modelos ou eficácia da skill.

Limites usados igualmente: `cost_limit=0.08`, `max_tokens=1024`, `agent.step_limit=5`, thinking
desligado. Guarda pré-voo da UI: US$1. O usuário autorizou ensaios pagos; o teto foi uma escolha
conservadora de execução, sem compra de créditos. A guarda histórica não é um hard cap.

Dry-run: `e91d6568-0a16-482b-8af2-6f9eeb20da24`, três configurações válidas, nenhum trial.
Execução: `be1ad9f4-8b6f-4997-8c26-efc0eb1ed8ba`, em `jobs-test/platform-ui`.

| Candidato | Reward | Erros | Tokens entrada/saída | Custo reportado USD | Duração |
|---|---:|---:|---:|---:|---:|
| A: Flash, sem skills | 1 | 0 | 4697 / 647 | 0,001121296 | 62,824 s |
| B: Pro, sem skills | 1 | 0 | 6222 / 841 | 0,005663592 | 67,390 s |
| C: Flash + skill | 1 | 0 | 4673 / 788 | 0,001187800 | 68,929 s |

Total dos candidatos: **US$0,007972688**, extraído do `result.json` do Harbor, sem recalcular
pela tabela de preços. Custos reportados pelo SDK/Harbor não substituem a fatura do provider.
Os jobs, snapshots e hashes estão sob `.experiments/<id>/experiment.json` e `report.json`.

## Juiz e interface

Juiz Flash, rubric `Python Quality`, modo validação explícito. As primeiras análises A/B
concluíram com 2 PASS cada e custos reportados de US$0,011611152 e US$0,014428096.
Essas chamadas expuseram o caminho de runtime corrigido acima. Não se somam ao reward nem
autorizam ranking; os resultados persistem com `validationMode: true`.

Após a correção, duas análises reais passaram pelo runtime gerenciado, ambas com 2 PASS:

| Análise | Job do juiz | Tokens entrada/saída | Custo reportado USD |
|---|---|---:|---:|
| C, pela ação Analisar da comparação | `jobs/2026-09-07__20-42-20` | 123465 / 5569 | 0,016362912 |
| A, pela Análise avulsa | `jobs/2026-09-07__20-45-23` | 87726 / 2144 | 0,009966864 |

A análise avulsa confirmou o boolean de validação e restaurou o resultado de análise do
trial A após o smoke nop. Ela não se anexa automaticamente ao histórico da comparação.
As duas análises iniciais estão em `jobs/2026-09-07__20-30-29` (A, 104631/2877 tokens) e
`jobs/2026-09-07__20-31-51` (B, 135581/3865 tokens).

**Total pago reportado nesta rodada: US$0,060341712**, incluindo os três candidatos e os
quatro julgamentos. Nenhum teste pago de credencial foi necessário. O proxy continuou OFF.

A auditoria final confirmou **21 IDs de recursos criados e nenhum remanescente** no conjunto
gerenciado desta rodada. Três reservas de imagem sem ID correspondem a imagens preexistentes
reutilizadas pelo Analyze, sem criação. Recursos preexistentes foram preservados.

Comprovado por cliques nesta rodada:

- cadastro de perfil, duplicação de candidatos, mudança de modelo/skills e baseline;
- prévia efetiva mostrando ausência de instruções no perfil e a diferença de cada candidato;
- dry-run e execução paga; resultado, tokens e custo reais;
- reload durante execução: log, Cancelar e bloqueio de nova execução foram recuperados;
- edição do juiz preserva Flash e o modo validação;
- início de lote bloqueia juiz, rubric, modo e botões contra duplicação;
- modo compacto mantém avisos de gasto e validação;
- inspeção visual encontrou e corrigiu dicas numéricas e inputs sem o estilo comum;
- progresso de Analyze visível, com tempo decorrido, e análise avulsa real concluída;
- reabertura após reiniciar o servidor preservou três resultados e as análises da comparação;
- links CSV/JSON acionados na UI; respostas conferidas separadamente: HTTP 200, attachment,
  tipos corretos e três linhas/candidatos em cada exportação;
- comparação real inspecionada a 390 × 844 px: nenhum elemento ultrapassou o viewport;
  a tabela usa sua própria rolagem horizontal;
- conferência final do DOM após reload: 82 campos, todos com `aria-describedby` apontando
  para ajuda existente, incluindo os sete checkboxes gerados dinamicamente.

O renderer final da análise avulsa foi também conferido visualmente a 390 px com uma fixture
do resultado real C, usando os mesmos módulos e CSS. Isso validou resumo, PASS/FAIL/N/A,
marca de validação, custo e JSON recolhido sem repetir a chamada paga. A fixture temporária
foi removida do projeto após a conferência.

## Testes e limites

Suíte completa `pwsh -NoProfile -File scripts/test.ps1`: **163/163 testes**, imports e scanner
passaram. A extração final do renderer e os vínculos de ajuda foram seguidos por UI **14/14**, sintaxe JavaScript e
imports: **60 módulos TS + 25 módulos GUI**, sem ciclos. Python do ambiente uv do Harbor:
**14/14 testes offline** (ownership, runtime e bootstrap). Os wrappers PowerShell e Git Bash
executaram dry-run real; uma flag inválida confirmou propagação do exit code no PowerShell.

Entrega implementada e validada no escopo local, registrada no commit que inclui este
relatório. O servidor temporário de QA foi encerrado; os jobs ignorados pelo Git permanecem
disponíveis neste clone para inspeção. Não foi feito push.

macOS/Linux: lógica e runbook revisados; nenhum host real disponível para smoke. LiteLLM proxy:
contrato/configuração testados, integração real não executada. Runtime: apenas Linux,
serviço único e rede pública; tasks Compose e rede restrita são recusadas. Não houve teste
completo de teclado/leitor de tela ou de todos os adapters do catálogo.
