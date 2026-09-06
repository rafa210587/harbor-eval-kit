# Harbor Eval Kit

Pacote agnóstico de modelo para instalar, validar, operar e remover um ambiente de evals com Harbor Framework usando Podman como runtime disponível no host.

## Objetivos

- Bootstrap automático de dependências.
- Nenhuma instalação de Docker.
- Validação explícita da compatibilidade Podman <-> Docker API/CLI exigida pelo Harbor local.
- Evals reprodutíveis para:
  - Java
  - TypeScript
  - Python
- Comparação:
  - model vs model
  - agent vs agent
  - skill ablation: com/sem skill
- Suporte operacional para:
  - Claude Code
  - Codex / GPT coding agents
- Uninstall conservador:
  - remove apenas o que o kit criou;
  - preserva ferramentas preexistentes;
  - suporta `--dry-run`.

## Layout

```text
harbor-eval-kit/
├── AGENTS.md
├── CLAUDE.md
├── README.md
├── DOCUMENTACAO.md
├── config/
│   └── defaults.env
├── manifests/
│   └── installation-manifest.example.json
├── Harbor_install/            (skills/agents PARA instalar/operar o kit -- não confundir
│   │                            com as abas "Skills"/"Agents" da GUI, que são outra coisa)
│   ├── skills/
│   │   ├── harbor-bootstrap/
│   │   ├── harbor-doctor/
│   │   ├── harbor-eval-designer/
│   │   ├── harbor-eval-runner/
│   │   ├── harbor-result-analyzer/
│   │   └── harbor-cleanup/
│   └── agents/
│       ├── environment-doctor.md
│       ├── harbor-installer.md
│       ├── eval-designer.md
│       ├── eval-runner.md
│       ├── result-analyzer.md
│       └── cleanup-guardian.md
├── scripts/
│   ├── harbor-eval.sh
│   ├── harbor-eval.ps1
│   ├── compare-matrix.ts
│   ├── gui-server.ts
│   └── lib/
│       └── harbor.ts
├── gui/
│   └── index.html
└── evals/
    ├── java/
    ├── typescript/
    └── python/
```

## Princípio operacional

Harbor é instalado como CLI Python no host/WSL via `uv tool install harbor`.

Podman é o runtime de containers. Como o backend local do Harbor é Docker-oriented, o kit nunca presume compatibilidade. O comando `doctor` valida:

- `podman`
- socket
- API Docker-compatible quando disponível
- build
- run
- exec
- bind mount
- named volume
- network
- cleanup

Se esse gate falhar, o kit não declara Harbor pronto.

## Comandos

Linux/WSL/macOS:

```bash
./scripts/harbor-eval.sh doctor
./scripts/harbor-eval.sh install
./scripts/harbor-eval.sh status
./scripts/harbor-eval.sh init-evals
./scripts/harbor-eval.sh eval
./scripts/harbor-eval.sh uninstall --dry-run
./scripts/harbor-eval.sh uninstall
```

PowerShell:

```powershell
.\scripts\harbor-eval.ps1 doctor
.\scripts\harbor-eval.ps1 install
.\scripts\harbor-eval.ps1 status
.\scripts\harbor-eval.ps1 init-evals
.\scripts\harbor-eval.ps1 eval -- --path .\evals\python\seed-task --agent oracle --env docker
.\scripts\harbor-eval.ps1 uninstall -DryRun
.\scripts\harbor-eval.ps1 uninstall
```

`eval` forwards everything after `--` verbatim to `harbor run`. On Windows it also injects
`DOCKER_HOST=npipe:////./pipe/docker_engine` for that single `harbor` call only (restored
afterward via `finally`), so `--env docker` reaches the Podman machine instead of a stopped
Docker Desktop — no need to set `DOCKER_HOST` yourself or touch your PowerShell profile.
The `--` is required: without it, short flags like `-o` collide with PowerShell's own
common parameters (e.g. `-OutVariable`).

## Estratégia de dependências

O host é classificado em três tipos:

1. preexisting: já existia antes do kit;
2. installed_by_kit: foi instalado pelo kit;
3. container_only: usado apenas dentro dos ambientes de eval.

O uninstall só remove itens `installed_by_kit`.

Por padrão:

- Harbor: host/user-level via uv.
- Python: reutiliza se compatível; senão tenta instalar user-level.
- uv: user-level.
- Java/Node: preferencialmente utilizados dentro dos containers dos evals.
- Maven/Gradle/npm: preferencialmente dentro dos containers.
- Podman: nunca é removido pelo kit.

## Secrets

Nunca grave API keys no manifest.

Use somente variáveis de ambiente:

```bash
export ANTHROPIC_API_KEY=...
export OPENAI_API_KEY=...
```

## Execução Harbor

Exemplo:

```bash
harbor run \
  --dataset ./evals/python \
  --agent claude-code \
  --model anthropic/<modelo> \
  --skill ./skills/python-engineering
```

Para Codex:

```bash
harbor run \
  --dataset ./evals/python \
  --agent codex \
  --model openai/<modelo>
```

Use `harbor agent list` e `harbor agent schema <agent>` para confirmar nomes e kwargs da versão instalada.

## Skill ablation

Rode a mesma task:

```text
modelo A + agente A + sem skill
modelo A + agente A + skill X
modelo B + agente A + sem skill
modelo B + agente A + skill X
modelo B + agente B + sem skill
modelo B + agente B + skill X
```

Mantenha constantes:

- task
- seed quando suportado
- timeout
- imagem base
- testes
- limites de recursos
- prompts da task

## Matriz de comparação (`compare-matrix.ts`)

`harbor run` só roda uma combinação por vez. `scripts/compare-matrix.ts` gera o produto
cartesiano de agentes × modelos × conjuntos de skill, dispara uma run por combinação e
agrega os `result.json` num relatório único (tabela no terminal + CSV + JSON).

Zero instalação: usa o type-stripping nativo do Node 22.6+/24 (já presente neste host) —
sem `tsc`, sem `ts-node`, sem `tsconfig.json`, sem dependências externas.

```powershell
node .\scripts\compare-matrix.ts `
  --path .\evals\python\seed-task `
  --agent claude-code --agent codex `
  --model anthropic/claude-sonnet-5 --model openai/gpt-5.1 `
  --skillset "" --skillset ".\skills\python-eng" --skillset ".\skills\python-eng,.\skills\testing" `
  --dry-run
```

- `--skillset` é como você compara **conjuntos** de skill, não só uma por vez: cada
  `--skillset` é uma lista separada por vírgula (ou `""` para o baseline sem skill).
- `--dry-run` valida todas as combinações via `harbor run --print-config` (sem rodar
  trial, sem custo, sem container) antes de gastar tokens de verdade.
- No Windows, injeta `DOCKER_HOST` automaticamente só no processo `harbor` filho de cada
  combinação (mesmo mecanismo do `harbor-eval.ps1 eval`), sem tocar a sessão do shell.
- `--concurrency N` roda N combinações em paralelo (default 1, sequencial).
- Saída: `<jobs-dir>/<job-prefix>-report.csv` e `.json`, além da tabela no terminal.

`node .\scripts\compare-matrix.ts --help` lista todas as opções.

## Interface gráfica local (`gui-server.ts`)

Servidor HTTP local (Node puro, sem framework, sem dependências) que serve uma página em
`gui/index.html` e uma API em `/api/*`. **Não é um Claude Artifact** — roda como processo na
sua máquina porque precisa chamar `harbor`/`podman` localmente; uma página hospedada não
teria esse acesso.

```powershell
node .\scripts\gui-server.ts        # abre http://127.0.0.1:4173
```

Abas:

- **Compare** — monta a matriz por linha: escolha um Agent, clique "Adicionar" (pode repetir o
  mesmo agent com overrides diferentes), e cada linha já vem com o model/skill-set pré-preenchidos
  do que está configurado nesse agent, sobrescrevíveis só naquela linha. Sem cross-product cego —
  cada avaliação julga a combinação inteira, então você monta exatamente as combinações que quer.
- **Skills** — uma skill é um `SKILL.md`: escreva as instruções direto na UI (ou anexe um `.md`)
  e o kit materializa o arquivo sozinho em `~/.harbor-eval-kit/skills/skill-<id>/`, ou aponte para
  uma pasta de skill já existente no disco.
- **Skill Sets** — agrupa uma ou mais Skills num pacote nomeado, pra comparar como unidade ou
  vincular a um Agent.
- **Agents** — um "perfil de uso": qual `--agent` do Harbor, qual **model** padrão (usado quando
  a run não sobrepõe modelo em Compare), **instructions** próprias do agent (viram uma skill
  implícita sempre anexada) e **default skill sets** sempre anexados.
- **Models** — atalho de label → `provider/modelo`.
- **Criteria** — um critério reutilizável (name/description/guidance) que um juiz LLM usa pra
  avaliar uma run já rodada (PASS/FAIL/N-A). Cadastrado uma vez, reaproveitado em vários rubrics.
- **Judge Rubrics** — agrupa Criteria por checkbox (igual Skill → Skillset) num pacote nomeado.
  Materializado sob demanda como `.toml` no schema exato que o Harbor espera. Bom pra padrões de
  código por linguagem (clean code, sem prolixidade) ou pra detectar reward hacking.
- **Tasks** — wizard sobre `harbor init --task` **com editor de arquivos direto no navegador**
  (instruction.md, Dockerfile, solve.sh, test.sh) — não precisa abrir editor externo.
- **Datasets** — tasks baixadas em `datasets/<nome>/` aparecem automaticamente junto das suas na
  aba Tasks e no seletor do Compare — não é um mundo separado.
- **Compare** ganhou, depois do reward aparecer: botão **"Ver trajetórias"** (abre o `harbor view`
  já apontado pro jobs-dir daquela run) e um painel opcional **"Analisar"** por resultado (ou
  todos) com um Judge Rubric + modelo da lista curada — nunca automático, é um desempate/auditoria
  por cima do reward, não o mecanismo de comparação em si.
- Agents/Models/Skills/Skillsets/Rubrics têm todos edição em lugar (botão **Edit** recarrega o
  formulário; **Cancel edit** volta pro modo de criação) e persistem em
  `~/.harbor-eval-kit/registries/*.json`.
- **Secrets** — cadastro de chaves de provider (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, etc.).
  Gravadas em texto puro em `~/.harbor-eval-kit/secrets.env` (nunca no manifest, nunca em git,
  nunca devolvidas pela API depois de salvas — só os nomes aparecem na lista).
- **Tasks** — wizard fino sobre `harbor init --task`, e lista o que já existe em `evals/*` com
  sinalização de "stub" vs "pronto".
- **Datasets** — `harbor dataset list`/`download` (saída bruta do Harbor, sem reformatar).
- **Trajectories** — inicia/para `harbor view <jobs-dir>` (processo de vida longa; a lista de
  viewers ativos não sobrevive a um restart do `gui-server`).
- **Analyze** — `harbor analyze` (avaliação por rubrica via LLM); precisa de uma chave cadastrada
  em Secrets para o agente avaliador.

Vínculo com o Docker-compatibility gate: todas as chamadas ao `harbor` feitas pelo servidor já
injetam `DOCKER_HOST` automaticamente por processo filho no Windows, igual ao `compare-matrix.ts`
e ao `harbor-eval.ps1 eval`.

## Critérios mínimos

Java:
- compila;
- testes passam;
- não quebra API pública sem instrução;
- static analysis opcional;
- diff dentro do escopo.

TypeScript:
- `npm test`;
- typecheck;
- lint;
- sem `any` novo não justificado quando o benchmark proibir.

Python:
- pytest;
- ruff;
- type check quando configurado.

## Instalação de skills nos agentes

Harbor aceita skills como diretórios com `SKILL.md`.

Para uso fora do Harbor:

- Claude Code pode receber estas skills pelo mecanismo de Agent Skills/plugin da instalação usada.
- Codex/GPT pode usar a mesma pasta de skills e `AGENTS.md` como instrução de repositório.

O conteúdo foi escrito para ser independente do modelo.

## Segurança do uninstall

O cleanup usa:

- prefixo `harbor-eval-kit-`
- label `io.harbor-eval-kit.managed=true`
- manifest local

Ele não usa:

```bash
podman rm -a
podman system prune -a
rm -rf ~/.cache
```

Esses comandos são deliberadamente proibidos.
