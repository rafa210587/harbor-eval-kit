# Harbor Eval Kit — Documentação completa

> Este arquivo documenta **tudo** que foi construído neste kit: como instalar do zero, por que
> cada peça existe, como funciona por dentro, a lógica de cada decisão, o que foi desligado
> de propósito, e onde tudo fica guardado. O `README.md` é o guia rápido de comandos; este
> arquivo é o passo a passo completo + o "porquê" de cada coisa.

## Índice

1. [O que é isto](#1-o-que-é-isto-e-por-que-existe)
2. [Instalação e configuração — passo a passo](#2-instalação-e-configuração--passo-a-passo)
3. [Por que a GUI é local](#3-por-que-a-gui-é-um-servidor-local-não-uma-página-hospedada)
4. [O gate de compatibilidade Podman↔Harbor](#4-o-gate-de-compatibilidade-no-windows)
5. [O que foi desligado de propósito](#5-o-que-foi-desligado-de-propósito-e-por-quê)
6. [Onde tudo fica guardado](#6-onde-tudo-fica-guardado-no-disco)
7. [Segurança das secrets](#7-segurança-das-secrets--o-que-é-garantido-e-o-que-não-é)
8. [Glossário — os conceitos e como se conectam](#8-glossário--os-conceitos-e-como-se-conectam)
9. [Ordem cognitiva das abas](#9-ordem-cognitiva-das-abas-1→10)
10. [Cada aba em detalhe](#10-cada-aba-em-detalhe)
11. [Reward vs. Juiz](#11-o-mecanismo-de-avaliação--reward-vs-juiz)
12. [CLI vs. GUI](#12-compare-matrixts-cli-vs-gui--quando-usar-cada-um)
13. [Limitações conhecidas](#13-limitações-conhecidas-decisões-conscientes-não-esquecimento)
14. [Arquivos-chave](#14-arquivos-chave-se-for-mexer-no-código)

---

## 1. O que é isto e por que existe

O objetivo é rodar **evals de agentes de coding** (comparar modelos, agentes e skills entre
si numa mesma task) usando o [Harbor Framework](https://github.com/harborlabs/harbor) como
motor, com **Podman** como runtime de containers (nunca Docker) e uma **interface gráfica
local** por cima, pra não precisar decorar flags de CLI nem editar JSON à mão.

Peças que compõem o kit:

1. **`Harbor_install/`** — skills e agents do **Claude Code** pra instalar/diagnosticar/operar
   o Harbor em si (não confundir com as abas "Skills"/"Agents" da GUI — são conceitos
   diferentes, ver seção 8).
2. **`scripts/harbor-eval.sh` / `.ps1`** — os mesmos passos de bootstrap/doctor em forma de
   script direto, sem precisar do Claude Code.
3. **`scripts/compare-matrix.ts`** — runner de matriz via linha de comando (sweep de
   agent × model × skillset), pra quem prefere terminal/CI.
4. **A GUI local** (`scripts/gui-server.ts` + `gui/index.html`) — onde mora a maior parte da
   lógica nova, e o que a maior parte deste documento cobre.

---

## 2. Instalação e configuração — passo a passo

Isto é o caminho do zero até ter a GUI aberta e pronta pra rodar sua primeira comparação.
Já foi executado nesta máquina, mas serve como referência caso precise refazer, mover pra
outra máquina, ou entender exatamente o que aconteceu.

### 2.1 Pré-requisitos

- Windows 10/11 com **WSL2** habilitado e uma distro Linux instalada (usamos Ubuntu).
- [`uv`](https://docs.astral.sh/uv/) instalado (gerencia Python isolado e o próprio Harbor).
- **Node.js 22.6+** (usamos 24.x) — roda os scripts `.ts` direto, sem `tsc`/`ts-node`.
- **Podman** (CLI) instalado no Windows.

### 2.2 Diagnóstico (doctor) — antes de instalar qualquer coisa

Duas formas equivalentes:

**Via Claude Code** (se estiver usando o assistente pra operar o kit): peça pra carregar
`Harbor_install/skills/harbor-doctor/SKILL.md` — ele sabe o que checar (Podman, socket, build,
run, exec, bind mount, named volume, network, cleanup, toolchains).

**Via script direto**:
```powershell
cd caminho\pro\harbor-eval-kit
.\scripts\harbor-eval.ps1 doctor
```

O doctor reporta `podman`, `uv`, `node`, `harbor` (versão ou "missing"), e valida
`podman info`. Se a máquina Podman nunca foi criada, ele vai falhar com erro de socket morto
— resolver com:
```powershell
podman machine init
podman machine start
```

**Não pare no doctor básico.** Ele só confirma que o Podman responde — não que ele consegue
fazer tudo que o Harbor precisa. Rode os smoke tests completos (ver seção 4) antes de
declarar o ambiente pronto.

### 2.3 Instalar o Harbor

```powershell
.\scripts\harbor-eval.ps1 install
```
Por baixo, isso roda `uv tool install harbor` — instala como CLI Python isolada (`uv`
gerencia seu próprio Python, não mexe no Python do sistema, que pode nem existir). Ou peça
pro Claude Code carregar `Harbor_install/skills/harbor-bootstrap/SKILL.md`, que segue a mesma
sequência com validação em cada passo.

### 2.4 Validar a compatibilidade de verdade (gate Podman↔Harbor)

Ver seção 4 pros detalhes técnicos. Na prática:
```powershell
$env:DOCKER_HOST = "npipe:////./pipe/docker_engine"
docker version   # deve mostrar "Podman Engine" no bloco Server
```
Depois disso, uma task mínima real precisa rodar de ponta a ponta (`harbor run --agent oracle
--env docker` contra uma task de teste) antes de considerar o ambiente pronto. Esse teste já
foi feito nesta máquina e está registrado em `~/.harbor-eval-kit/installation-manifest.json`.

### 2.5 Persistir o manifest de instalação

Tudo que foi instalado (vs. o que já existia antes) fica registrado em
`~/.harbor-eval-kit/installation-manifest.json` — inclui versões, decisões tomadas, e um
histórico de notas de cada mudança feita no kit. Consulte esse arquivo se quiser reconstruir
o histórico completo de decisões desta instalação.

### 2.6 Subir a interface gráfica

```powershell
cd caminho\pro\harbor-eval-kit
node .\scripts\gui-server.ts
```
Deixa essa janela aberta (é o servidor rodando — `Ctrl+C` desliga). Abre no navegador:
```
http://127.0.0.1:4173
```
Roda só em `127.0.0.1` — nunca acessível pela rede, nunca um servidor público.

### 2.7 Primeiro uso — siga a ordem das abas

A GUI já numera as abas 1→10 pra guiar a primeira vez (ver seções 9 e 10 pra detalhe de cada
uma). Resumo de "o que fazer" em sequência:

1. **Secrets** — cadastre a key de cada provider que for usar (dropdown já tem os 13
   principais). Sem isso, só dá pra testar com os agents `oracle`/`nop` (gratuitos, sem LLM).
2. **Models** — cadastre `provider/modelo` (ex.: `anthropic/claude-sonnet-5`). O badge avisa
   se a key esperada já está em Secrets.
3. **Skills** — escreva ou aponte pra instruções que um agent deve seguir (opcional).
4. **Skill Sets** — agrupe Skills num pacote nomeado (opcional, só se for usar Skills).
5. **Agents** — monte um "perfil de uso": `agentValue` do Harbor + model padrão +
   instructions + default skill sets.
6. **Criteria** — critérios de avaliação qualitativa, reutilizáveis (opcional, só necessário
   se for usar o Analyze/juiz).
7. **Judge Rubrics** — agrupe Criteria num rubric nomeado (opcional).
8. **Judges** — monte o "perfil de uso" do avaliador: `agentValue` + judge model (só os da
   lista curada, cadastrado antes em Models) + instruções custom (opcional) + Judge Rubrics
   padrão (opcional, só necessário se for usar o Analyze/juiz).
9. **Tasks** — crie uma task real (`harbor init --task`) e preencha os 4 arquivos direto no
   editor da própria aba. **Os `evals/*/seed-task` de exemplo são stubs vazios** — não dá pra
   comparar contra eles sem preencher primeiro.
10. **Compare** — escolha um Agent, clique "Adicionar" (repita pra cada combinação que quiser),
    aponte pra uma Task, e rode. Reward, custo e tokens aparecem na hora; "Analisar"/"Ver
    trajetórias" ficam disponíveis depois do resultado.

### 2.8 Reforçar a segurança das secrets (opcional, recomendado)

Por padrão o arquivo `secrets.env` já herda a permissão do seu perfil do Windows (só sua
conta + Administradores + SYSTEM). Pra travar explicitamente só na sua conta:
```powershell
icacls "$HOME\.harbor-eval-kit\secrets.env" /inheritance:r
icacls "$HOME\.harbor-eval-kit\secrets.env" /grant:r "$env:USERNAME:F"
```
Ver seção 7 pro que isso cobre e o que não cobre.

---

## 3. Por que a GUI é um servidor local, não uma página hospedada

`gui-server.ts` é um servidor `node:http` puro (sem framework, sem dependências) que só
escuta em `127.0.0.1`. Isso é proposital: a GUI precisa chamar `harbor` e `podman` de verdade
na sua máquina, e uma página hospedada (tipo um Claude Artifact) roda isolada, sem esse
acesso. Por isso o kit exige rodar `node scripts/gui-server.ts` localmente.

---

## 4. O gate de compatibilidade no Windows

Antes de qualquer coisa, o kit valida que Podman consegue fazer tudo que o Harbor precisa:
`run`, `exec`, bind mount, named volume, network, build, labels, cleanup. No Windows existe
um detalhe importante: **o CLI/SDK Docker, por padrão, mira o pipe do Docker Desktop**
(`dockerDesktopLinuxEngine`), não o pipe genérico que a máquina Podman expõe
(`docker_engine`). Sem corrigir isso, `harbor run --env docker` falha com "Docker daemon is
not running" mesmo com Podman rodando perfeitamente.

**Correção aplicada**: `DOCKER_HOST=npipe:////./pipe/docker_engine` é injetado **só no
processo filho do `harbor`** (nunca na sessão do shell nem em variável de ambiente do
sistema) — ver `buildHarborEnv()` em `scripts/lib/harbor.ts`. Isso é escopado por
`dockerHostFix` em `ExecOptions` e é aplicado automaticamente em toda chamada feita pela GUI
e pelo `compare-matrix.ts`. Docker Desktop, se estiver instalado, fica completamente intocado.

---

## 5. O que foi desligado de propósito, e por quê

### 5.1 Telemetria do Harbor — **desligada por padrão**

Investigando o código-fonte do pacote instalado (não por suposição), achamos que o Harbor
tem telemetria própria (`harbor/telemetry.py`), disparada em **todo comando** via o callback
principal da CLI (`harbor/cli/main.py`). Ela manda eventos pro PostHog (analytics de
terceiros, com uma API key fixa do time do Harbor) contendo: id de instalação anônimo,
versão do Harbor/Python/SO, **nomes de agent usados**, **provider e nome do modelo**, reward
médio, custo em USD, contagem de tokens, tipos de exceção, duração.

Conferimos o código de filtragem (`_allowlist_before_send`) e confirmamos que **nenhuma API
key ou variável de ambiente entra nesse payload** — mas dados de uso (quais modelos você
testou, quanto custou, quanto acertou) saem da máquina por padrão, o que já é motivo
suficiente pra desligar.

**Como desligamos**: `HARBOR_TELEMETRY=disabled` é injetado incondicionalmente em todo
processo `harbor` que o kit dispara (`withTelemetryDisabled()` em `scripts/lib/harbor.ts`,
aplicado tanto em `buildHarborEnv()` quanto em `execCommand()` — de propósito, isso **não**
depende do fix de `DOCKER_HOST`, porque são preocupações diferentes: uma é sobre onde o
Podman escuta, a outra é sobre nada vazar). Verificado rodando `buildHarborEnv()` e
inspecionando o valor, e confirmando reward correto numa run real depois da mudança.

A lib LiteLLM (que o Harbor usa por baixo pra falar com os providers) tem um flag
`telemetry = True`, mas vasculhando o pacote inteiro não achamos nenhum código que realmente
leia esse flag e dispare um envio — parece resquício sem uso ativo nesta versão. A integração
com PostHog que existe ali é opt-in (só ativa se você mesmo configurar sua própria conta).

### 5.2 Comando `docker` do sistema — nunca usado

O kit nunca instala Docker (invariante do `AGENTS.md`), e o `DOCKER_HOST` que injetamos
aponta pro Podman, nunca pro Docker Desktop (que fica intocado, mesmo estando instalado na
máquina).

### 5.3 O seletor "Foco" do Compare — removido

Numa iteração anterior, o Compare tinha um seletor "Foco da comparação" (Geral / foco em
Agent / foco em Model / foco em Skill Set) que travava dimensões em seleção única via radio
buttons. Foi removido porque a lógica não fazia sentido: a avaliação (reward) julga a
**combinação inteira** (agent + model + skillset juntos), não uma dimensão isolada — travar
"foco" numa dimensão só escondia isso. Foi substituído pelo modelo de **entradas por linha**
(seção 10.10).

### 5.4 `PYTHONIOENCODING=utf-8` — injetado incondicionalmente (bug real, não uma remoção)

Diferente dos itens acima, isto não foi "desligado por escolha" — é a correção de um bug real
encontrado testando o Judges/`/api/analyze`: `harbor analyze` imprime um emoji
(`\U0001f50d`, antes de "Analyzing trial(s)...") logo na primeira linha do comando, via
`rich`. Rodado como processo filho no Windows, o Python herda o code page do console
(`cp1252`) em vez de UTF-8 pra `stdout`, e aquele emoji não existe em `cp1252` —
`UnicodeEncodeError`, comando morre antes de fazer qualquer validação, **mesmo com todos os
argumentos corretos**. Reproduzido e confirmado neste kit; não é específico de nenhum
`--agent`/`--model`/`--prompt` em particular, acontece com qualquer chamada de
`harbor analyze` no Windows.

**Correção**: `PYTHONIOENCODING=utf-8` injetado incondicionalmente em todo processo `harbor`
que o kit dispara (`withPythonUtf8()` em `scripts/lib/harbor.ts`, mesmo padrão de
`withTelemetryDisabled()` — aplicado tanto em `buildHarborEnv()` quanto na chamada de
`execCommand()` sem `dockerHostFix`, pra não depender do fix do `DOCKER_HOST`). Verificado
rodando `/api/analyze` antes (crash) e depois (chega até a validação real de path) da mudança.

---

## 6. Onde tudo fica guardado no disco

```
~/.harbor-eval-kit/                        (state dir — NUNCA dentro do repo)
├── installation-manifest.json             histórico de tudo que foi instalado/decidido
├── secrets.env                            KEY=VALUE, texto puro, só nesta máquina
├── registries/
│   ├── agents.json
│   ├── models.json
│   ├── skills.json
│   ├── skillsets.json
│   ├── criteria.json
│   ├── rubrics.json
│   └── judges.json
├── task-rubric-defaults.json              rubrics/Judge pinados por task (chave = path da task)
├── skills/                                SKILL.md materializados (Skills + instructions de Agent)
│   ├── skill-<id>/SKILL.md
│   └── agent-<id>/SKILL.md
├── rubrics/
│   └── <rubricId>/rubric.toml             materializado sob demanda antes de cada Analyze
└── judges/
    └── <judgeId>/prompt.txt               instruções custom do Judge, só se tiver alguma (senão usa o padrão do Harbor)

<raiz do projeto>/
├── Harbor_install/                        skills/agents do Claude Code p/ instalar o Harbor
│   ├── skills/
│   └── agents/
├── evals/<linguagem>/<nome>/              tasks que você criou (task.toml, instruction.md, ...)
├── datasets/<dataset>/<nome>/             tasks baixadas via aba Datasets — mesma estrutura
└── jobs/ (ou o jobs-dir que você escolher) resultado de cada harbor run (result.json, etc.)
```

Por que `~/.harbor-eval-kit/` e não dentro do projeto: secrets/registries são configuração
**da sua máquina**, não conteúdo do projeto — não fazem sentido versionados no git.
`evals/`/`datasets/` já são conteúdo do projeto (tasks reais), por isso ficam dentro do repo.

**Por que `Harbor_install/` existe**: `skills/` e `agents/` originalmente ficavam na raiz do
projeto, mas isso colide de nome com as abas "Skills" e "Agents" da GUI (que são um conceito
totalmente diferente — ver seção 8). Movidos pra dentro de `Harbor_install/` especificamente
pra tirar essa ambiguidade: tudo que é sobre **instalar/operar o Harbor via Claude Code**
mora ali; tudo que é sobre **as evals em si** mora na GUI + `~/.harbor-eval-kit/`.

---

## 7. Segurança das secrets — o que é garantido e o que não é

- A key nunca é uma variável de ambiente do Windows/sistema. Fica só em `secrets.env` e é
  injetada apenas no `env` do processo filho `harbor`/`podman` no momento da run
  (`loadSecretsEnv()` mesclado via `extraEnv`).
- A API (`GET /api/secrets`) **nunca** devolve o valor — só os nomes cadastrados
  (`listSecretNames()`).
- O valor nunca é logado em console, nunca escrito em relatório, nunca no manifest.
- O servidor só escuta em `127.0.0.1` — inacessível pela rede.
- **A ACL do arquivo foi travada** (seção 2.8) pra só a conta do usuário — nem
  Administradores, nem SYSTEM têm mais acesso explícito (antes era herdado do perfil, que já
  bloqueava outras contas, mas não era explícito).

**O que NÃO é garantido tecnicamente** (sendo honesto, não vendendo segurança que não existe):

1. **Qualquer processo rodando com a SUA conta consegue ler o arquivo.** É um `.txt` sem
   criptografia — não é um cofre tipo Windows Credential Manager. Outro programa seu, uma
   extensão de navegador com acesso a arquivo, ou um malware rodando como você, tecnicamente
   conseguem abrir e ler.
2. **A key vira texto puro dentro do container na hora da run** — inevitável, o agente
   (`claude-code`, etc.) precisa dela pra chamar a API. Não é vazamento, é funcionamento
   normal, mas existe em texto puro, ainda que brevemente, dentro do processo do container.
3. **Se o agente ou a task rodar um comando tipo `env`/`echo $ANTHROPIC_API_KEY`**, isso fica
   gravado no log/trajetória do job (`jobs/.../agent/trajectory.json`) — fica salvo na sua
   máquina, não é enviado a lugar nenhum por nós, mas passa a existir em texto puro num
   arquivo que talvez você compartilhe/suba sem perceber que tem uma key ali dentro.
4. **Backup/sync**: se `C:\Users\<você>` for sincronizado (OneDrive, backup automático),
   a key vai junto em texto puro pra onde quer que isso vá.
5. **Ela obviamente chega no provider** (Anthropic/OpenAI/etc.) quando você usa de verdade —
   isso é o esperado, não é uma falha.
6. **O assistente (Claude, rodando a sessão que construiu isto) tem acesso geral ao shell da
   máquina** — nada impede fisicamente rodar `cat secrets.env`. A garantia real é de
   **comportamento**: o app nunca precisa fazer isso pra funcionar, e normalmente não é
   feito. (Registro de transparência: o arquivo foi lido uma vez, cedo na construção deste
   kit, só pra confirmar que uma chave *falsa* de teste — `TEST_FAKE_KEY=abc123`, criada pelo
   próprio processo de teste — foi salva/removida corretamente, nunca uma key real.)

Se quiser proteção "de verdade" (criptografada pelo SO, não arquivo texto), a alternativa é
trocar `secrets.env` pelo Windows Credential Manager — foi cogitado e descartado no desenho
inicial em favor de simplicidade/zero-dependência, mas dá pra reconsiderar.

---

## 8. Glossário — os conceitos e como se conectam

O kit repete um padrão "unidade reutilizável → pacote que agrupa" em vários lugares. Isso
ajuda a não confundir os nomes parecidos:

| Conceito | O que é | Referenciado por | Materializado em |
|---|---|---|---|
| **Skill** | Um `SKILL.md` — instruções que um agent pode receber | Skillset (`skillIds`), Agent (`instructions` é uma skill implícita) | `~/.harbor-eval-kit/skills/<id>/SKILL.md` |
| **Skill Set** | Pacote nomeado de 1+ Skills | Agent (`defaultSkillsetIds`), linha do Compare | — (é só uma lista de ids) |
| **Criterion** | Um critério de avaliação: `name`+`description`+`guidance` | Rubric (`criterionIds`) | vira um bloco `[[criteria]]` no `.toml` do rubric |
| **Judge Rubric** | Pacote nomeado de 1+ Criteria | Analyze / botão "Analisar" do Compare | `~/.harbor-eval-kit/rubrics/<id>/rubric.toml` |
| **Judge** | "Perfil de uso" do avaliador: `agentValue` do Harbor + judge model (high-tier) + instruções custom (opcional) + Judge Rubrics padrão | Compare (painel Analisar), Analyze, Task↔Rubric default | `~/.harbor-eval-kit/judges/<id>/prompt.txt` (só se tiver instruções custom) |
| **Model** | Atalho de label → `provider/modelo` | Agent (`modelId`), linha do Compare (override) | passado direto como `--model` pro Harbor |
| **Agent** | "Perfil de uso": `agentValue` do Harbor + model padrão + instructions + default skill sets | linha do Compare | passado como `--agent`/`--model`/`--skill` pro Harbor |
| **Task** | O problema em si: `task.toml` + `instruction.md` + `Dockerfile` + `solve.sh` + `test.sh` | Compare (`path`) | `evals/<lang>/<nome>/` ou `datasets/<nome>/<nome>/` |
| **Job** | Uma execução do `harbor run` (uma linha do Compare = um job) | — | `<jobs-dir>/<job-name>/result.json` |
| **Trial** | Uma tentativa dentro de um job (normalmente 1, a menos que `n-attempts` > 1) | — | `<jobs-dir>/<job-name>/<trial>/` |
| **Reward** | Número (0/1 ou fração) que `tests/test.sh` escreve em `/logs/verifier/reward.txt` | — | dentro do `result.json` do job |
| **Analysis** | Veredito PASS/FAIL/N-A por critério, gerado pelo juiz LLM sobre um job já rodado | — | `analysis.json` dentro do diretório analisado |
| **Task↔Rubric default** | 0+ Judge Rubrics + 1 Judge "pinados" numa Task, pra pré-marcar sozinhos no painel Analisar do Compare | Task (editor, seção "Judge padrão desta task") | `~/.harbor-eval-kit/task-rubric-defaults.json`, chaveado pelo path da task |

**Agent (Harbor_install) ≠ Agent (GUI)**: `Harbor_install/agents/*.md` são papéis pro Claude
Code operar o kit (`environment-doctor`, `harbor-installer`, ...). A aba "Agents" da GUI é
outra coisa — perfis de agente **pra rodar dentro das evals** (`claude-code`, `codex`,
`oracle`, `nop`, ...). Mesma lógica pra `Skills`: `Harbor_install/skills/*` são skills do
Claude Code pra instalar/diagnosticar; a aba "Skills" da GUI é sobre o que os agentes
**sob teste** recebem de instrução.

---

## 9. Ordem cognitiva das abas (1→10)

A GUI é organizada pra guiar um uso de primeira vez, mas cada aba funciona isolada depois:

| # | Aba | Depende de |
|---|-----|-----------|
| 1 | Secrets | — |
| 2 | Models | Secrets (badge de key) |
| 3 | Skills | — |
| 4 | Skill Sets | Skills |
| 5 | Agents | Models, Skill Sets |
| 6 | Criteria | — |
| 7 | Judge Rubrics | Criteria |
| 8 | Judges | Models (model do juiz), Judge Rubrics (defaults) |
| 9 | Tasks | — |
| 10 | Compare | Agents, Tasks, Judges (opcional, pro painel Analisar) |

`Datasets`, `Trajectories` e `Analyze` são ferramentas de apoio, sem número — usadas quando
preciso, não fazem parte do fluxo linear.

---

## 10. Cada aba em detalhe

### 10.1 Secrets
Cadastra chaves de provider. Dropdown com 13 providers curados (Anthropic, OpenAI, Azure,
DeepSeek, Gemini, Vertex AI, OpenRouter, Groq, Mistral, Cohere, xAI, Together AI, Fireworks) —
escolher um preenche o `Name` certo automaticamente (tabela `PROVIDERS` em `gui/index.html`);
"outro/customizado" deixa digitar qualquer nome. Ver seção 7 pra garantias de segurança.

**Como usar**: escolha o provider no dropdown (ou "outro"), cole o valor da key, "Save key".
A lista abaixo mostra só os *nomes* já cadastrados, nunca os valores.

### 10.2 Models
Atalho de label → `provider/modelo` (ex.: `anthropic/claude-sonnet-5`). O prefixo antes da
`/` é a convenção que o Harbor/LiteLLM usa pra decidir qual API key ler — por isso cada model
mostra um badge dizendo se a key esperada já está em Secrets (`guessProviderKey`).

**Como usar**: label livre + `provider/modelo` exato. O preview abaixo do campo já avisa qual
key ele vai esperar antes mesmo de salvar.

### 10.3 Skills
Uma skill é um `SKILL.md`. Duas origens: **escrever instruções** (materializado sob demanda
em `~/.harbor-eval-kit/skills/skill-<id>/SKILL.md`) ou **apontar pra uma pasta existente**.
Vem com um template elaborado (Propósito / Quando aplicar / Princípios / Regras concretas /
Exemplo bom-ruim / Casos-limite) — não fica em branco, você edita em cima.

### 10.4 Skill Sets
Agrupa uma ou mais Skills por checkbox — mesma referência por `id`, sem duplicar texto (se
você editar uma Skill, todo Skillset que a usa já reflete a mudança).

### 10.5 Agents
Um agent aqui é um **perfil de uso**, não só o nome cru do Harbor: junta
`agentValue` (`claude-code`, `codex`, `oracle`, `nop`, ...) + um **model padrão** + umas
**instructions** próprias (viram uma skill implícita, sempre anexada — `resolveAgentInstructionsPath`)
+ **default skill sets**. Isso é o que a aba Compare usa pra pré-preencher cada linha.

**Valores de `agentValue` aceitos** pelo Harbor instalado (via `harbor run --help`):
`claude-code`, `codex`, `oracle`, `nop`, e vários outros CLIs de terceiros. `oracle` e `nop`
não gastam API — bons pra testar o kit sem custo (ver seção 11).

### 10.6 Criteria
Um critério reutilizável que um juiz LLM usa pra avaliar uma run: `name` (identificador),
`description` (pergunta objetiva), `guidance` (instrução detalhada, incluindo o que conta
como PASS/FAIL/N-A). O template segue o formato real que o próprio Harbor usa internamente
(achado em `harbor/analyze/prompts/analyze-rubric.toml` do pacote instalado).

### 10.7 Judge Rubrics
Agrupa Criteria por checkbox — mesma relação Skill→Skillset. Materializado sob demanda como
`.toml` (`serializeRubricToml`) no schema exato que `harbor analyze --rubric` espera.

### 10.8 Judges
Mesma relação que Agent tem com Model/Skill Set, só que do lado de quem julga: um Judge junta
**quem executa o julgamento** (`agentValue`, o mesmo `--agent` do Harbor — por padrão
`claude-code`), **com qual model** (dropdown filtrado só pros models cadastrados na aba 2 cujo
`provider/modelo` bate com a lista curada high-tier do kit — nunca o padrão barato do próprio
Harbor, `claude-haiku-4-5`), **instruções customizadas** (opcional) e **quais Judge Rubrics
marcar por padrão**. Depois de cadastrado, escolha esse Judge no painel Analisar do Compare, na
aba Analyze, ou no pin de uma Task — em vez de escolher model/agent/rubric soltos toda run.

**Importante — isto NÃO é uma skill de verdade.** O `harbor analyze` roda um agente Harbor real
com acesso a arquivo (não é uma chamada de LLM crua: ele lê `result.json`,
`agent/trajectory.json`, `test-stdout.txt` dentro do trial antes de responder), mas confirmado
contra o pacote instalado (`harbor/analyze/analyzer.py`, função `_run_analyze_job`) que ele
monta o `AgentConfig` do avaliador **sem nunca setar `.skills`**, e o comando `harbor analyze`
não tem flag `--skill`/`--skills` (diferente de `harbor run`, que tem). Ou seja: não dá pra
anexar um SKILL.md tool-acessível ao juiz hoje, isso é uma limitação do próprio Harbor, não
desta GUI. A alavanca real que o Harbor expõe é `--prompt <arquivo>`, que **substitui por
completo** o texto padrão do juiz (`harbor/analyze/prompts/analyze.txt`) — é isso que o campo
"Instruções do juiz" do Judge materializa e passa (`resolveJudgePromptPath` em
`scripts/lib/harbor.ts`, mesma técnica de materialização sob demanda que Skills e Judge
Rubrics já usam). O textarea já vem preenchido com o texto padrão real do Harbor como template
editável — troque o que quiser, mas mantenha os marcadores `{trial_path}`, `{task_section}` e
`{criteria_guidance}` em algum lugar, porque é ali que o Harbor injeta o caminho do trial e a
orientação de cada critério; sem eles o juiz fica sem saber o que examinar.

### 10.9 Tasks
Wizard fino sobre `harbor init --task`, **com editor de arquivos direto no navegador**
(instruction.md, Dockerfile, solve.sh, test.sh — `GET`/`POST /api/tasks/detail`). Templates
elaborados alinhados ao rubric de qualidade que o próprio `harbor check` usa
(`harbor/cli/quality_checker/default-rubric.toml`): tudo que os testes verificam precisa
estar na instrução, nunca copiar `tests/`/`solution/` pra dentro da imagem, dependência de
teste vai no `test.sh` (não no Dockerfile), a solução de referência precisa **demonstrar o
processo**, não só ecoar a resposta final ("hardcoded solution").

**Como usar**: preencha nome/org/output dir, clique "Create task" — o editor abre sozinho
logo em seguida com os 4 arquivos prontos pra editar. "Save files" grava direto no disco.

O campo "Steps" do formulário de criação decide entre task de **um passo só** (0, o normal —
1 `instruction.md` + 1 `test.sh`) e task de **N passos sequenciais** (gera
`steps/step-1/`, `steps/step-2/`, ... — cada um com sua própria instrução e teste, rodando em
ordem; se um passo falhar, os seguintes são pulados). Use N>0 só quando a task modela um fluxo
de várias etapas dependentes entre si.

**Rubrics/Judge padrão da task**: o editor também tem "Judge padrão desta task" (dropdown de
Judges — aba 8) e "Judge rubrics padrão desta task" (checkbox, pode marcar **N rubrics**, não
só um; escolher um Judge pré-marca os rubrics padrão dele aqui, ainda editável). Isso não roda
nada sozinho — é só um "lembrete pinado": quando essa task é usada numa run do Compare, o
painel Analisar já abre com esse Judge e esses rubrics pré-selecionados, prontos pra clicar em
"Analisar" (ver 10.10 e 11). Fica salvo em
`~/.harbor-eval-kit/task-rubric-defaults.json`, indexado pelo path da task — não dentro da
pasta da task, pra não misturar preferência de UI com o conteúdo da task em si.

### 10.10 Compare — o núcleo do kit
Não é 3 checkboxes cruzados. Você escolhe um **Agent** num dropdown e clica **Adicionar** —
isso cria uma linha na lista de entradas, já com **model** e **skill sets** pré-preenchidos
do que está configurado nesse agent, mas **sobrescrevíveis só naquela linha**. Pode adicionar
o mesmo agent de novo com overrides diferentes (é assim que "comparar só o modelo, mesmo
agent" e "comparar N agents" convivem sem confusão).

Cada linha vira uma `harbor run` própria. O reward que sai do `test.sh` **já é a comparação
real** — determinística, sem LLM nenhuma julgando por trás (ver seção 11).

A tabela de resultado também traz `durationSec`, `custo agent (USD)` e `tokens in/out` lidos
direto de `stats.cost_usd`/`n_input_tokens`/`n_output_tokens` no `result.json` que o próprio
Harbor grava — ver seção 11 pra detalhes de onde vem cada número.

Depois do resultado: botão **Ver trajetórias** (abre `harbor view` já no jobs-dir certo) e um
painel opcional **Analisar** por linha (ou "Analisar todas") usando um **Judge** (aba 8) +
**um ou mais Judge Rubrics** (checkbox — cada um marcado dispara uma chamada de análise
separada, os resultados aparecem empilhados, cada um com o custo daquela análise). Se a task
rodada tiver Judge/rubrics pinados (seção 10.9), o painel já abre com eles pré-selecionados —
pode ajustar antes de clicar.

### 10.11 Datasets
Baixa tasks de terceiros (`harbor dataset download`) em `datasets/<nome>/` — que
`listTasks()` escaneia junto de `evals/`, então elas aparecem automaticamente no picker do
Compare, sem virar um conceito separado.

### 10.12 Trajectories
Uso ad-hoc do `harbor view <jobs-dir>` (processo de vida longa; lista de viewers ativos não
sobrevive a um restart do `gui-server`).

### 10.13 Analyze
Uso ad-hoc do `harbor analyze` num path específico, escolhendo um Judge (aba 8) já cadastrado —
o fluxo normal é pelo botão "Analisar" direto na tabela de resultados do Compare (seção 10.10),
esta aba existe pra quando você já tem um path exato em mente.

---

## 11. O mecanismo de avaliação — reward vs. juiz

**O reward já é a comparação de verdade.** Cada linha do Compare roda o agent real (LLM de
verdade, exceto `oracle`/`nop`) contra a task, e depois `tests/test.sh` — **código
determinístico** (pytest, shell, asserts) — decide 0/1 (ou fração). Isso é o mesmo método de
SWE-bench/HumanEval: teste como critério objetivo, não uma LLM opinando.

**O Analyze (juiz) é uma camada extra**, não o que decide a comparação. Ele lê a trajetória
completa do agent (`agent/trajectory.json`, `result.json`, `verifier/test-stdout.txt`,
`exception.txt` — confirmado no prompt real que o Harbor manda pro avaliador) e dá um
veredito PASS/FAIL/N-A por critério do rubric. Serve pra pegar o que o teste barato não pega:
reward hacking, ou desempatar candidatos que **todos** passaram.

Por isso: **nunca automático**. É um botão por resultado (ou "Analisar todas", que roda o
mesmo botão em toda linha `ok` da tabela, uma de cada vez, sequencial) — você aciona só quando
o caso pede (empate, suspeita de gambiarra, decisão final entre finalistas), não em toda
iteração exploratória. E o modelo do juiz é **travado numa lista curada high-tier**
(`JUDGE_MODELS`/`isJudgeModelAllowed` em `scripts/lib/harbor.ts`) — o próprio Harbor usa
`claude-haiku-4-5` como padrão, que é uma escolha de custo, não uma escolha pensada pra
julgar bem. (Os IDs exatos em `JUDGE_MODELS` são ilustrativos — confira contra os
identificadores reais de cada provider antes de depender deles.)

**Quem é o juiz é registrado como um Judge (aba 8)**, não escolhido solto toda vez: um Judge
junta `--agent` (quem executa a leitura — um agente Harbor real com acesso a arquivo, não uma
chamada de LLM crua), o judge model (da lista curada) e, opcionalmente, instruções custom que
substituem o texto padrão do juiz por completo via `harbor analyze --prompt <arquivo>`
(`resolveJudgePromptPath`). **Isso não inclui skills de verdade** — confirmado contra o
`harbor` instalado que `harbor analyze` nunca seta `.skills` no `AgentConfig` do avaliador e
não tem flag `--skill` (diferente de `harbor run`); a única alavanca real pra moldar como o
juiz avalia é reescrever essas instruções (ver 10.8 pro detalhe completo).

"Qual foi melhor mesmo com todos passando" fica respondido rankeando pelo `passRate`
calculado no lado do kit (pass/total de critérios aplicáveis) entre resultados já analisados
— o Harbor avalia uma trajetória por vez, não várias numa chamada só; quem rankeia é a
própria GUI (`analyzeRow`/`compare-sort-btn` em `gui/index.html`).

**Um resultado pode ser analisado por N rubrics ao mesmo tempo.** O checkbox-picker do painel
Analisar (seção 10.10) aceita marcar mais de um Judge Rubric; `analyzeRow` faz **uma chamada
`/api/analyze` por rubric marcado** (sequencial, não em paralelo), cada uma gerando seu
próprio `analysis.json`/veredito, exibidos empilhados sob o nome do rubric. O `passRate`
usado pra ordenar soma pass/aplicável de **todos** os rubrics analisados naquele resultado —
então rodar 2 rubrics (ex.: "Python Quality" + "Reward Hacking Check") sobre o mesmo job conta
os critérios dos dois juntos, não substitui um pelo outro. Se nenhum rubric for marcado, cai
no rubric padrão do próprio Harbor (`reward_hacking` + `task_specification`).

Pra não ter que marcar isso toda vez: uma Task pode ter um Judge + rubrics **pinados**
(seção 10.9) — o painel Analisar detecta que a run atual usou aquela task e já vem com esse
Judge e esses rubrics pré-selecionados, sem rodar nada sozinho (o clique em "Analisar"
continua manual).

### Custo, tokens e velocidade

Dois custos diferentes existem e não devem ser somados como se fossem um só:

- **Custo do agent que resolveu a task** — aparece direto na tabela do Compare (`custo agent
  (USD)`, `tokens in/out`), lido de `stats.cost_usd`/`n_input_tokens`/`n_output_tokens` no
  `result.json` do job (`parseResult` em `scripts/lib/harbor.ts`). São os números reais de
  billing que o próprio Harbor calculou (mesmo `compute_token_cost_totals()` que o `harbor
  check`/`harbor analyze` usam para as próprias contas) — não é uma estimativa deste kit.
  Fica em branco quando o adapter do agent usado não reporta isso.
- **Custo do Judge** — só existe depois de clicar "Analisar"; aparece como "custo juiz (USD)"
  na tabela (soma de todos os rubrics analisados naquela linha) e como uma linha por rubric no
  painel de resultado, lido de `estimated_cost_usd` no `analysis.json` que o `harbor analyze`
  grava. É o custo de o Judge *ler* o resultado, sempre separado do custo de tê-lo *produzido*.

**Velocidade**: `durationSec` na tabela do Compare é o tempo de parede da chamada `harbor run`
inteira daquela linha (medido pelo próprio kit, em `execCommand`) — inclui subir o
container/ambiente, não só o agente "pensando". O Harbor grava timing mais fino por trial
(`agent_execution`/`verifier` em `TrialResult`, com `started_at`/`finished_at`), mas este kit
não lê esses campos hoje; `durationSec` é a métrica de velocidade disponível na GUI.

---

## 12. `compare-matrix.ts` (CLI) vs. GUI — quando usar cada um

`compare-matrix.ts` é a ferramenta de linha de comando, pra scriptar/automatizar: sweep
completo via `--agent`/`--model`/`--skillset` repetíveis (produto cartesiano de verdade, ao
contrário da GUI). Continua exatamente como era — **não foi tocado** nas rodadas de mudança
na GUI. Use quando quiser rodar de um script, CI, ou preferir terminal.

A GUI (`gui-server.ts`) é pra uso interativo — registries persistentes, editor de arquivos,
Compare por entradas com override por linha, Analyze integrado. As duas falam com o mesmo
Harbor por baixo, só a forma de montar a chamada muda.

---

## 13. Limitações conhecidas (decisões conscientes, não esquecimento)

- Compare na GUI é **síncrono** — sem streaming ao vivo do progresso; a página fica com
  spinner até acabar tudo.
- `harbor view` ativo não sobrevive a um restart do `gui-server` (registro só em memória).
- `Datasets` → `harbor dataset list` nesta versão do Harbor só imprime um link pro Hub, não
  uma lista navegável — limitação do CLI, não da GUI.
- Ranking multi-way do Analyze é feito pelo kit (chamadas separadas + comparação local), não
  uma chamada nativa do Harbor que julga N candidatos de uma vez — esse recurso não existe no
  Harbor atual.
- `JUDGE_MODELS` tem identificadores de modelo ilustrativos — conferir os IDs exatos de cada
  provider antes de depender deles em produção.
- Não dá pra anexar uma skill de verdade (SKILL.md tool-acessível) a um Judge — limitação do
  próprio `harbor analyze` (sem flag `--skill`, `AgentConfig.skills` nunca setado), não desta
  GUI. O que dá pra fazer é reescrever as instruções do juiz por completo (seção 10.8).
- `durationSec` do Compare é tempo de parede da chamada inteira, não o timing fino por-trial
  que o Harbor já grava internamente (`agent_execution`/`verifier` em `TrialResult`) — este kit
  não lê esses campos hoje (seção 11, "Custo, tokens e velocidade").
- Secrets ficam em arquivo texto (com ACL restrita), não num cofre criptografado pelo SO —
  ver seção 7 pro que isso implica.

---

## 14. Arquivos-chave, se for mexer no código

```
Harbor_install/skills/        skills do Claude Code p/ instalar/diagnosticar/limpar o Harbor
Harbor_install/agents/        papéis/sub-agentes usados junto com as skills acima
scripts/lib/harbor.ts         lógica compartilhada: exec de processos, registries, secrets,
                               materialização de skills/rubrics, DOCKER_HOST fix, telemetria
scripts/gui-server.ts         servidor HTTP + todas as rotas /api/*
scripts/compare-matrix.ts     CLI de sweep (produto cartesiano via flags repetíveis)
gui/index.html                frontend inteiro (HTML+CSS+JS num arquivo só, sem build)
scripts/harbor-eval.sh/.ps1   bootstrap/doctor originais (instalação do Podman+Harbor)
```
