# Harbor Eval Kit

Plataforma local para criar e comparar avaliações de agentes de programação sobre o
[Harbor Framework](https://github.com/harbor-framework/harbor). O Harbor executa tasks e
verificadores; o kit organiza candidatos, modelos, skills, repetições, resultados e análise
numa GUI local e numa CLI reproduzível.

O runtime local é **Podman somente**. O kit não instala nem chama Docker Engine.

## O que a plataforma entrega

| Harbor | Harbor Eval Kit |
|---|---|
| executa agent, task e verifier | monta o experimento e congela seus inputs |
| grava trials, trajetória e `result.json` | compara candidatos e preserva o histórico |
| fornece adapters e `harbor analyze` | gerencia perfis, modelos, skills, conjuntos de critérios e juízes |
| calcula reward, tokens e custo reportado | mostra logs, resultados e guarda prévia de gasto |

O desenho experimental é:

```text
Task × Agent × Model × Skill Set × tentativas
                       │
                       ├── reward determinístico do tests/test.sh
                       └── Juiz × conjunto de critérios opcional, depois da execução
```

Compare modelos mantendo agent, task e skills iguais; compare agents mantendo o restante
igual; avalie uma skill contra uma baseline sem ela. A tela de revisão mostra as diferenças
efetivas antes de executar. O juiz é opcional e seus resultados de modo validação não entram no
ranking.

## Estado de entrega e compatibilidade

O estado atual é **piloto local validado**, com escopo explícito: Windows, Podman 6.0.2,
Harbor 0.22.0, um serviço Linux `main`, rede pública e imagens base já presentes. A validação
real mais recente está em [Jornadas reais da UI](./docs/JORNADAS_REAIS_UI_2026-09-07.md),
com o histórico anterior em [Validação da plataforma](./docs/VALIDACAO_PLATAFORMA_2026-09-07.md)
e a auditoria de entrega em [Auditoria de entrega](./docs/AUDITORIA_ENTREGA_2026-09-07.md).
Isso não constitui certificação para macOS/Linux nem prontidão para implantação corporativa.
AWS continua somente no plano; não há deploy, autenticação multiusuário, RBAC ou infraestrutura
cloud implementada. O repositório também não declara uma licença de distribuição: essa decisão
pertence ao proprietário do projeto.

### Compatibilidade comprovada nesta rodada

- Harbor `0.22.0`, pinado porque o kit depende do contrato dessa versão;
- Node.js 24+ para TypeScript nativo;
- Windows com Podman 6.0.2: conexão CLI, API identificada como Podman, Compose, smoke completo e
  task real `soma-fracoes`;
- oracle retornou reward 1 e nop retornou reward 0, sem chamada de modelo; seis recursos foram
  registrados no manifest e nenhum permaneceu após o lifecycle;
- macOS e Linux têm testes offline do resolvedor e procedimentos reproduzíveis, sem smoke real
  nesses hosts até agora.

Em 2026-09-08 corrigimos um comando `podman machine inspect` que impedia a leitura
do socket no macOS e era ocultado pela fixture antiga. Veja o
[diagnóstico e os gates ainda pendentes no Mac](./docs/MACOS_VALIDACAO_2026-09-08.md).

O adapter gerenciado atual suporta containers Linux, um serviço `main`, rede pública e
Dockerfile ou imagem prebuilt local. Ele bloqueia antes de criar recursos quando encontra
Compose customizado/multisserviço, política de rede restrita, imagem com volumes anônimos,
base ausente ou pull implícito.

## Pré-requisitos

- Git, Node.js 24+, Podman e `uv`;
- uma Podman machine no Windows/macOS ou API rootless ativa no Linux;
- provider para `podman compose` com suporte a `up --wait` e `--pull`;
- `docker.io/library/alpine:3.20` preexistente para o doctor;
- imagens base das tasks preexistentes, como `python:3.13-slim` para `soma-fracoes`.

As imagens precisam ser pré-provisionadas e registradas pela administração da máquina. O kit
usa `--pull=never`, pois um pull implícito criaria uma imagem fora do ownership auditável.

O guia com comandos separados para Windows PowerShell, Windows Git Bash, macOS e Linux rootless
está em [Instalação manual](./docs/INSTALACAO_MANUAL.md).

## Início rápido

**Com Claude Code local:** abra este clone com `claude` e execute `/harbor-setup`.
A skill do projeto conduz a instalação, os gates e a preparação da demo. Veja
[Instalação com Claude](./docs/INSTALACAO_CLAUDE.md) para os pré-requisitos, o cadastro
seguro das credenciais e o fallback caso a skill não apareça. Para instalar manualmente,
siga os comandos abaixo.

Ative o scanner de credenciais neste clone:

```powershell
pwsh scripts/setup-hooks.ps1
```

Ou, em Bash:

```bash
bash scripts/setup-hooks.sh
```

No PowerShell:

```powershell
pwsh -NoProfile -File scripts/harbor-eval.ps1 install
pwsh -NoProfile -File scripts/harbor-eval.ps1 doctor
pwsh -NoProfile -File scripts/start-gui.ps1
```

No macOS, Linux ou Git Bash:

```bash
bash scripts/harbor-eval.sh install
bash scripts/harbor-eval.sh doctor
bash scripts/start-gui.sh
```

`install` preserva um snapshot das dependências e instala Harbor isolado via `uv`. `doctor`
faz os gates Podman CLI/API/Compose e o smoke mutável. Antes de considerar o ambiente READY,
rode oracle e nop pela GUI ou pelos wrappers:

```bash
bash scripts/harbor-eval.sh eval --path evals/python/soma-fracoes --agent oracle --env docker
bash scripts/harbor-eval.sh eval --path evals/python/soma-fracoes --agent nop --env docker
```

No PowerShell, use `pwsh scripts/harbor-eval.ps1 eval --` seguido dos mesmos argumentos. Os
wrappers passam pelo executor comum, carregam `~/.harbor-eval-kit/secrets.env` apenas no ambiente
filho, selecionam o adapter Podman gerenciado e preservam o código de saída do Harbor.

A GUI abre em [http://127.0.0.1:4173](http://127.0.0.1:4173). O launcher é idempotente: reconhece
uma instância existente e seleciona pelo nome a Podman machine associada à conexão configurada.

Status rápido, sem smoke nem mutação:

```powershell
pwsh scripts/harbor-eval.ps1 status
```

```bash
bash scripts/harbor-eval.sh status
```

Para parar, use `scripts/stop-gui.ps1` ou `scripts/stop-gui.sh`. O helper exige o executável
Node, o caminho absoluto deste projeto e a porta antes de encerrar o PID; um processo alheio na
mesma porta é preservado. Parar a Podman machine é uma ação separada e explícita.

## Primeiro experimento

Para um conjunto já montado com três dificuldades, quatro modelos, duas skills e
dois juízes, siga o [roteiro teste-live](./docs/TESTE_LIVE.md). O catálogo pode ser
importado pela UI sem credenciais; a execução paga continua sendo uma ação explícita.

Na GUI, siga **Começar → Novo experimento**:

1. escolha `evals/python/soma-fracoes`;
2. em **Agentes**, crie dois perfis com adaptadores `oracle` e `nop`, sem modelo, instruções
   ou skills; volte a Novo experimento e adicione ambos para validar o verifier sem custo;
3. revise os inputs efetivos e execute;
4. confira reward, erro, custo reportado, tokens, duração e logs;
5. só então configure Credenciais, Modelos e um perfil em Agentes para uma comparação paga.

Credenciais ficam fora do repositório e a API nunca devolve seus valores. O botão de teste de uma
credencial faz uma chamada real e exige um modelo explícito do provider escolhido.

## Jornadas da GUI

O [guia visual das 16 abas](./docs/GUIA_VISUAL.md) explica o que cada área faz,
quando usá-la e a sequência para montar a primeira comparação.

<details>
<summary>Ver a UI: configuração, prévia e resultado de um experimento</summary>

![Novo experimento: candidatos e task à esquerda; histórico, prévia e resultado à direita](./docs/screenshots/compare-tab.png)

Captura real de 08/09/2026, durante um teste de cancelamento com Oracle. O estado
de falha/cancelamento foi provocado para validar a jornada; não representa uma
comparação de qualidade. Veja também a [tela de Credenciais e o mapa das abas](./docs/GUIA_VISUAL.md#capturas-da-ui).

</details>

- **Começar** explica o próximo passo e aponta para o primeiro experimento.
- **Novo experimento** cria candidatos, mostra a prévia/diferenças e reabre o histórico.
- **Catálogo** mantém Modelos, Agentes, Skills, Conjuntos de skills, Tasks, Critérios, Conjuntos de critérios e Juízes.
- **Ambiente e ajuda** reúne Credenciais, Configuração, Datasets, Logs, Trajetórias e Análise avulsa.

Cada campo informa finalidade, exemplo, padrão e quando pode ser ignorado. Operações longas
bloqueiam repetição, mostram tempo e log. Avisos de gasto e validação permanecem visíveis no
modo compacto.

O catálogo `HARBOR_AGENTS` espelha os adapters registrados pelo `AgentFactory` do Harbor 0.22.0
e alimenta a GUI por uma rota única. O campo continua aceitando import paths customizados e
atalhos ACP. Adapters model agnostic, como `mini-swe-agent` e `terminus-2`, permitem variar
provider e modelo mantendo o agent fixo. `oracle` e `nop` não gastam API.

## CLI de comparação

`compare-matrix.ts` usa o mesmo plano, snapshots, guarda de gasto e executor da GUI:

```powershell
node scripts/compare-matrix.ts `
  --path evals/python/soma-fracoes `
  --agent mini-swe-agent `
  --model provider/modelo-a --model provider/modelo-b `
  --skillset "" `
  --dry-run
```

Use `node scripts/compare-matrix.ts --help` para as opções. O dry-run valida o plano sem criar
container nem chamar API. Uma execução real recebe ID novo; resultados anteriores nunca são
sobrescritos.

## Podman e ownership

O resolvedor único em `scripts/lib/podman.ts` escolhe explicitamente a conexão/máquina efetiva:

- Windows: pipe `npipe:////./pipe/docker_engine` após confirmar uma machine selecionada;
- macOS: socket da machine selecionada pelo nome;
- Linux rootless: socket retornado por `podman info`;
- Linux com machine: mesmo caminho explícito do macOS.

O gate consulta `/version` e recusa endpoint que não se identifique como Podman. Também exige
as flags Compose que o Harbor usa. Nenhum valor é exportado no shell do usuário.

Cada container, imagem e rede criada pelo adapter usa prefixo `harbor-eval-kit-`, label
`io.harbor-eval-kit.managed=true`, identidade conciliada e reserva no manifest antes da criação.
Cleanup e cancelamento preservam qualquer recurso cuja propriedade seja ambígua.
O julgamento também cria um ambiente; seu bootstrap isolado aplica o mesmo controle sem
alterar o Harbor instalado. Essa integração exige o contrato exato do Harbor 0.22.0.

Os diretórios dos candidatos usam um nome curto no formato `prefixo-runId-cN`. O agente,
modelo e conjunto de skills completos continuam no `experiment.json`, onde a GUI e a CLI os
exibem; eles não precisam caber no nome do diretório. O planejamento recusa previamente um
caminho de job ou de artefatos que possa exceder o limite conservador do Windows e informa para
encurtar `jobs-dir` ou o nome da task.

## LiteLLM

O proxy opcional permanece **OFF por padrão**. Na aba **Credenciais**, o cartão do gateway
guarda a chave virtual de inferência, descobre aliases do proxy e permite registrá-los e testar
um modelo escolhido explicitamente. Os controles dos providers continuam sendo chamadas diretas.
As chaves dos providers e a chave administrativa ficam no proxy; nenhuma credencial entra no
export. Configuração ON inválida bloqueia com diagnóstico. O cliente foi testado com HTTP local
simulado, sem API paga; um proxy real e o roteamento de cada adapter ainda exigem validação.
Veja [configuração, uso e limites do LiteLLM](./docs/LITELLM.md).

## Segurança e reprodutibilidade

- chaves apenas em `~/.harbor-eval-kit/secrets.env`, nunca em argv, resposta ou log;
- telemetria do Harbor desabilitada nos filhos;
- hook e scanner fail closed para credenciais;
- snapshots de task/skills e inputs efetivos por execução;
- custo e tokens somente do `result.json` do Harbor; ausente continua “não reportado”;
- limpeza por manifest, prefixo, label e identidade; `--dry-run` lista o conjunto exato;
- nenhum `--no-verify`, Docker install, prune global ou remoção de dependência preexistente.

Exportações de configuração e relatórios são fail-closed: antes de gerar a resposta ou gravar
um arquivo, o kit inspeciona campos e textos aninhados em busca de credenciais conhecidas,
nomes de arquivos sensíveis e padrões de chave. Se houver suspeita, a operação falha sem
entregar bytes; credenciais também não entram no bundle. CSV ainda neutraliza valores que
poderiam ser interpretados como fórmulas. Consulte a seção de [Config Bundle e exportação](./DOCUMENTACAO.md#1010-d-config-bundle--compartilhar-configuração-entre-máquinas)
para o contrato e as limitações.

Rode a suíte completa antes de entregar uma mudança:

```powershell
pwsh scripts/test.ps1
```

```bash
bash scripts/test.sh
```

Esses wrappers cobrem a suíte Node, o checker de imports e o scanner de credenciais. O contrato
Python do adapter/Analyze usa o Harbor pinado e é separado; em um ambiente com esse runtime,
rode o comando offline descrito em [Engenharia](./docs/ENGENHARIA.md). Nenhum desses testes
substitui o smoke real do piloto local.

O plano manual de UI permanece em [Plano de testes da UI](./docs/PLANO_TESTES_UI.md), com cada
cenário e sua evidência registrada; testes de lógica não são apresentados como clique real.

## Guias por público

Para uso da plataforma, comece por [Instalação manual](./docs/INSTALACAO_MANUAL.md),
[Como funciona](./docs/COMO_FUNCIONA.md) e [Run, Compare e Analyze](./docs/FLUXO_RUN_COMPARE_ANALYZE.md).
Para manutenção e automação por agentes, use `AGENTS.md`, `CLAUDE.md`,
`Harbor_install/skills/` e `Harbor_install/agents/`. Os planos, prompts e relatórios datados
em `docs/` são material de histórico ou de contribuidores; não substituem o fluxo atual.

## Skills operacionais

Os runbooks em `Harbor_install/skills/` podem ser lidos por qualquer agente, mas essa pasta não
é descoberta automaticamente por todo cliente:

- `harbor-bootstrap`: snapshot, instalação e gates;
- `harbor-doctor`: diagnóstico profundo e smoke;
- `harbor-up`, `harbor-status`, `harbor-down`: operação diária;
- `harbor-eval-designer`, `harbor-eval-runner`, `harbor-result-analyzer`: criar, executar e
  interpretar avaliações;
- `harbor-cleanup`: remoção auditável.

No Claude Code, a entrada descoberta automaticamente é `/harbor-setup`, versionada
em `.claude/skills/harbor-setup/`. Ela reutiliza os runbooks acima, sem copiá-los para
o perfil do usuário. O [guia com Claude](./docs/INSTALACAO_CLAUDE.md) traz o prompt
alternativo e os limites da automação. Outros agentes podem ler diretamente essa
skill na raiz do clone. Os pré-requisitos do host continuam necessários.

Sem suporte a skills, siga [Instalação manual](./docs/INSTALACAO_MANUAL.md) e
[Run, Compare e Analyze](./docs/FLUXO_RUN_COMPARE_ANALYZE.md).

## Documentação

Para entender ou reconstruir as capacidades, consulte a
[baseline SDD com 12 capacidades, planos, tasks e contratos](./specs/README.md),
organizada segundo o fluxo do Spec Kit. A [auditoria de suficiência](./docs/AUDITORIA_SDD_2026-09-08.md)
identifica as lacunas das seis specs iniciais, mapeia 215 arquivos e 64 rotas e
registra limites ainda existentes. A reconstrução independente permanece por validar.
Não é necessário instalar Spec Kit para usar a GUI.

### Para usar a plataforma

| Documento | Conteúdo |
|---|---|
| [Documentação completa](./DOCUMENTACAO.md) | conceitos, decisões, GUI e referência técnica |
| [Instalação manual](./docs/INSTALACAO_MANUAL.md) | setup e operação nos quatro shells/SOs |
| [Como funciona](./docs/COMO_FUNCIONA.md) | fluxo e arquitetura |
| [Run, Compare e Analyze](./docs/FLUXO_RUN_COMPARE_ANALYZE.md) | pré-requisitos de cada jornada |
| [Compatibilidade Podman](./docs/PODMAN_COMPATIBILITY.md) | gates, ownership e limites atuais |
| [Plano de testes da UI](./docs/PLANO_TESTES_UI.md) | checklist manual; evidência específica fica rotulada como histórica |

### Para contribuir e operar por agentes

| Documento | Conteúdo |
|---|---|
| [Engenharia](./docs/ENGENHARIA.md) | regras do repositório e incidentes que as originaram |
| [Pendências](./docs/PENDENCIAS.md) | trabalho deliberadamente adiado |

### Histórico, auditoria e planejamento

| Documento | Conteúdo |
|---|---|
| [Validação desta rodada](./docs/VALIDACAO_PLATAFORMA_2026-09-07.md) | evidência datada de Windows/Podman e limites conhecidos |
| [Auditoria de entrega](./docs/AUDITORIA_ENTREGA_2026-09-07.md) | lacunas de distribuição, CI, documentação e escopo |
| [Plano da plataforma](./docs/PLANO_PLATAFORMA_2026-09-07.md) e [prompts de continuidade](./docs/PROMPT_CLAUDE_PLATAFORMA.md) | escopo e handoff datados, não instruções normativas |
| [Plano AWS corporativo](./docs/PLANO_AWS_CORPORATIVO.md) | plano futuro; nenhuma infraestrutura AWS foi criada |

O plano AWS é somente documental nesta rodada. Não há deploy, autenticação multiusuário, RBAC
ou infraestrutura cloud implementada.
