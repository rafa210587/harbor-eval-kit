# Harbor Eval Kit — Documentação completa

> Este arquivo documenta **tudo** que foi construído neste kit: como instalar do zero, por que
> cada peça existe, como funciona por dentro, a lógica de cada decisão, o que foi desligado
> de propósito, e onde tudo fica guardado. O `README.md` é o guia rápido de comandos; este
> arquivo é o passo a passo completo + o "porquê" de cada coisa.

## Índice

1. [O que é isto](#1-o-que-é-isto-e-por-que-existe)
2. [Instalação e configuração — passo a passo](#2-instalação-e-configuração--passo-a-passo)
3. [Por que a GUI é local](#3-por-que-a-gui-é-um-servidor-local-não-uma-página-hospedada)
4. [O gate de compatibilidade Podman↔Harbor](#4-o-gate-de-compatibilidade-podmanharbor-windows-macos-linux)
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

Use `scripts/start-gui.sh` (macOS/Linux) ou `scripts\start-gui.ps1` (Windows) — eles conferem
se `harbor`/`podman` existem e se `podman info` responde antes de subir o servidor, e falham
com uma mensagem clara em vez de um stack trace se algo não estiver pronto. Idempotente,
pode rodar de novo a qualquer momento:

```powershell
cd caminho\pro\harbor-eval-kit
.\scripts\start-gui.ps1
```
```bash
cd caminho/pro/harbor-eval-kit
./scripts/start-gui.sh
```

Se preferir pular a checagem e só subir o servidor direto (equivalente ao que os scripts
acima fazem por baixo, na última linha):
```powershell
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

## 4. O gate de compatibilidade Podman↔Harbor (Windows, macOS, Linux)

Antes de qualquer coisa, o kit valida que Podman consegue fazer tudo que o Harbor precisa:
`run`, `exec`, bind mount, named volume, network, build, labels, cleanup. Além disso, como o
backend local do Harbor é Docker-oriented, existe um detalhe importante e **diferente por
sistema operacional**: sem apontar explicitamente pro endpoint certo do Podman, `harbor run
--env docker` falha com algo como "Docker daemon is not running" mesmo com Podman rodando
perfeitamente.

**Windows**: o CLI/SDK Docker, por padrão, mira o pipe do Docker Desktop
(`dockerDesktopLinuxEngine`), mesmo que ele esteja parado — não o pipe que a máquina Podman
expõe. Correção: `DOCKER_HOST=npipe:////./pipe/docker_engine` — um pipe **fixo e
bem-conhecido** que a máquina Podman expõe especificamente pra compatibilidade com Docker
CLI/SDK, diferente do pipe nativo da própria API do Podman (que depende do nome da máquina,
confirmado rodando `podman machine inspect` — reporta um pipe diferente,
`\\.\pipe\<nome-da-maquina>`).

**macOS**: Podman roda sempre dentro de uma VM ("podman machine"); não existe conflito com um
pipe do Docker Desktop, mas o socket Docker-compatível fica num caminho que depende do nome da
máquina. Resolvido dinamicamente com
`podman machine inspect --format '{{.ConnectionInfo.PodmanSocket.Path}}'` →
`DOCKER_HOST=unix://<esse caminho>`.

**Linux**: Podman rootless nativo normalmente expõe seu próprio socket direto (sem VM) —
`podman info --format '{{.Host.RemoteSocket.Path}}'` — e esse mesmo socket **já fala o
dialeto Docker-compatível** (o servidor de API do Podman atende os dois formatos no mesmo
socket em sistemas Unix), então normalmente nem precisa de correção. Se em vez disso houver
uma "podman machine" ativa (incomum em Linux, mas suportado), usa-se a mesma resolução do
macOS.

**Correção aplicada**: `resolvePodmanDockerHost()` em `scripts/lib/harbor.ts` detecta
`process.platform` e resolve o valor certo por SO (memoizado por processo, já que isso
dispara uma chamada a `podman`); é injetado **só no processo filho do `harbor`** (nunca na
sessão do shell nem em variável de ambiente do sistema) via `buildHarborEnv()`. Escopado por
`dockerHostFix` em `ExecOptions`, aplicado automaticamente em toda chamada feita pela GUI e
pelo `compare-matrix.ts`. A mesma lógica existe duplicada (mantida sincronizada à mão, já que
são linguagens diferentes) em `scripts/harbor-eval.ps1` (`Resolve-PodmanDockerHost`) e
`scripts/harbor-eval.sh` (`resolve_podman_docker_host`), pros usos fora da GUI/TS. Docker
Desktop, se estiver instalado (Windows/macOS), fica completamente intocado.

**Honestidade sobre verificação**: os três branches (Windows, macOS, Linux) foram validados
por leitura cuidadosa da própria documentação/comportamento do Podman e por testes reais dos
comandos `podman info`/`podman machine inspect`/`podman machine list` — mas este
desenvolvimento aconteceu numa máquina Windows. O branch Windows tem validação end-to-end
completa (`harbor run` real, com reward correto, repetido várias vezes nesta sessão). Os
branches macOS/Linux têm a lógica de resolução testada isoladamente (os comandos `podman`
corretos, os nomes de campo certos do template Go), mas **não** uma execução ponta-a-ponta
real de `harbor run --env docker` numa máquina macOS/Linux de verdade — se algo não bater no
seu ambiente, `resolvePodmanDockerHost()`/`Resolve-PodmanDockerHost`/`resolve_podman_docker_host`
são os três lugares certos pra depurar ou ajustar.

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

### 5.1-b Gateway LiteLLM — **encaixe preparado, desligado**

O kit **já usa LiteLLM** num lugar: o botão "Test" da aba Secrets chama `litellm.completion()` e
`litellm.get_valid_models()` no venv do próprio Harbor (seção 10.1). Isso é o SDK, dentro deste
processo, e não precisa de encaixe nenhum.

O que ficou **preparado e desligado** é a outra integração que se chama "LiteLLM": rodar um
**proxy** LiteLLM e apontar os agents pra ele. Ganha-se um lugar só pra chaves, teto de gasto,
cache, fallback e log de requisição entre todos os providers — e, em tese, um adapter preso a um
fornecedor (`claude-code`, `codex`) passaria a alcançar model de outro provider, exatamente a
limitação da seção 10.5.

**Onde encaixa**: apontar um agent pra um proxy significa uma coisa só — setar variáveis
`*_BASE_URL`/chave no processo filho `harbor`. `buildHarborEnv()` é o ponto único por onde todo
filho recebe ambiente, então o encaixe inteiro é mais um decorador ali, ao lado de
`withTelemetryDisabled` e `withPythonUtf8`.

**Como ligar**: copie `config/litellm-gateway.example.json` para
`~/.harbor-eval-kit/litellm-gateway.json` e ponha `enabled: true`. Sem esse arquivo (o padrão),
`buildHarborEnv()` produz exatamente o mesmo ambiente de antes desta integração existir — há
teste fixando isso. Arquivo ausente, ilegível ou malformado significam **desligado**: uma config
quebrada nunca deve redirecionar tráfego de modelo em silêncio nem impedir uma run normal.
`GET /api/status` reporta `litellmGateway.enabled`, pra responder "meu tráfego está passando por
proxy agora?" sem abrir arquivo.

**O mapeamento de variáveis é declarado, não adivinhado**: o bloco `env` da config diz quais
variáveis setar, com os placeholders `{baseUrl}` e `{apiKey}`. Este kit não sabe qual variável
cada adapter lê, e fingir que sabe seria o tipo de chute que falha silenciosamente na run. O
`{apiKey}` vem do secret cujo **nome** está em `apiKeyEnv` — o valor continua só no
`secrets.env`.

**Honestidade**: nada disso foi executado contra um proxy LiteLLM real. É encaixe preparado, não
recurso suportado — por isso vem desligado e com o mapeamento sob responsabilidade de quem
ligar.

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
- **`secrets.env` nunca fica dentro da pasta do projeto** (fica em `~/.harbor-eval-kit/`,
  fora do repo git) — por isso nunca é versionado. O `.gitignore` do repo ainda assim tem uma
  regra defensiva pra `secrets.env`/`.env`/`.env.*` (defesa em profundidade: cobre o caso de
  alguém apontar `HARBOR_EVAL_STATE_DIR` pra dentro do projeto, ou criar um `.env` à mão por
  engano) — mas isso é cinto-e-suspensório, a proteção real é o arquivo nunca existir ali.

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
Cadastra chaves de provider. Dropdown com 15 providers curados (Anthropic, OpenAI, Azure,
DeepSeek, Gemini, Vertex AI, OpenRouter, Groq, Mistral, Cohere, xAI, Together AI, Fireworks,
Ollama, Bedrock) — escolher um preenche o `Name` certo automaticamente. A lista canônica
(`PROVIDERS`) mora no servidor (`scripts/lib/harbor.ts`) e é buscada via `GET /api/providers`
— a GUI não mantém mais uma cópia própria, pra não ter duas listas divergindo com o tempo.
"outro/customizado" deixa digitar qualquer nome. Ver seção 7 pra garantias de segurança.

**Como usar**: escolha o provider no dropdown (ou "outro"), cole o valor da key, "Save key".
A lista abaixo mostra só os *nomes* já cadastrados, nunca os valores.

**Botão "Test"**: depois de salvar, faz uma chamada real — não só um "parece bem formada" —
usando a key salva: `hi`, `max_tokens: 5`, no model mais barato que o LiteLLM souber pra
aquele provider. Confirmado no `harbor --help` que não existe um comando `harbor` pra isso
(nem pra listar models de um provider), então esse botão chama o LiteLLM diretamente — via um
script Python pequeno, materializado em `~/.harbor-eval-kit/test-provider-key.py`, executado
com o **mesmo interpretador Python de dentro do venv que `uv tool install harbor` criou**
(localizado via `uv tool dir`, portável entre SOs — não um Python do sistema separado, já que
o `litellm` que o script importa é uma dependência do próprio pacote `harbor`). A key é
passada pro processo filho só via variável de ambiente, nunca por argumento de linha de
comando (que ficaria visível pra outros processos/gerenciador de tarefas) — mesma disciplina
de segredo usada em toda chamada a `harbor`/`podman` neste kit.

Se o provider suportar (via `litellm.get_valid_models(check_provider_endpoint=True, ...)`,
que faz uma chamada de verdade no catálogo do provider), o resultado também traz uma lista de
models descobertos **ao vivo** — a GUI mostra um checklist pra cadastrar os que quiser direto
como Models (aba 2), sem digitar `provider/modelo` à mão um por um. Nem todo provider suporta
listagem ao vivo nesta versão do LiteLLM — lista vazia aí não significa key inválida (o botão
já teria mostrado ✗ nesse caso), só que não tinha catálogo pra buscar.

Testado nos dois caminhos: com uma key inválida (reporta o `AuthenticationError` real vindo da
API do provider — ex.: `DeepseekException — Authentication Fails, Your api key: ****1532 is
invalid`, que foi como se descobriu que uma key salva tinha sido revogada no painel), e, em
2026-09-06, com uma key **válida** de DeepSeek: retornou `ok: true`, model testado
`deepseek/deepseek-chat` e 14 models descobertos ao vivo, que o checklist cadastrou direto na
aba Models sem digitação manual.

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

**Exemplos e templates bundled (opcional)**: no modo "Escrever instruções" dá pra anexar
arquivos extras (nomeados com caminho relativo, ex. `examples/bom.py`, `templates/base.md`) —
não é só uma conveniência da GUI. Confirmado no código do Harbor instalado
(`harbor/trial/trial.py`, `_upload_injected_skills`): ele sobe **a pasta inteira** da skill
pro ambiente do agent, não só o `SKILL.md` — a mesma convenção de "progressive disclosure"
que Anthropic e OpenAI recomendam pra skills/tools (o arquivo de entrada referencia material
de apoio por caminho relativo, o agente lê sob demanda em vez de tudo vir empurrado de uma vez
no prompt). No modo "pasta existente" isso já funcionava naturalmente (é uma pasta real no
disco, bota o que quiser nela); o modo "escrever instruções" só não tinha como anexar mais de
um arquivo até agora. Materializado por `materializeSkillMd()` em `scripts/lib/harbor.ts`, com
uma checagem de path-traversal (`safeJoinUnderDir`) pra um nome de arquivo tipo `../../etc/x`
nunca escrever fora da pasta da própria skill — testado com um caso desses de propósito.

### 10.4 Skill Sets
Agrupa uma ou mais Skills por checkbox — mesma referência por `id`, sem duplicar texto (se
você editar uma Skill, todo Skillset que a usa já reflete a mudança).

### 10.5 Agents
Um agent aqui é um **perfil de uso**, não só o nome cru do Harbor: junta
`agentValue` (`claude-code`, `codex`, `oracle`, `nop`, ...) + um **model padrão** + umas
**instructions** próprias (viram uma skill implícita, sempre anexada — `resolveAgentInstructionsPath`)
+ **default skill sets**. Isso é o que a aba Compare usa pra pré-preencher cada linha.

**Valores de `agentValue` aceitos** pelo Harbor instalado: **42**, com autocomplete no próprio
campo (`<datalist>` alimentado por `GET /api/harbor-agents`, cuja fonte é a constante
`HARBOR_AGENTS` em `scripts/lib/harbor.ts` — espelho mantido à mão de `harbor run --help`,
porque `harbor agent list` não existe neste Harbor). O campo continua **livre**: o Harbor
também aceita um import path customizado (`module.path:ClassName`) e atalhos ACP
(`acp:opencode@1.3.9`), que um `<select>` fechado impediria.

A distinção que mais importa na hora de comparar models está marcada na lista:

- **Model-agnostic** (LiteLLM por baixo, aceitam qualquer `provider/modelo`): `mini-swe-agent`,
  `terminus`/`-1`/`-2`, `aider`, `opencode`, `openhands`, `openhands-sdk`, `swe-agent`,
  `goose`, `langgraph`, `cline-cli`, `dspy-rlm`, `deerflow`, `trae-agent`. São os únicos com
  que faz sentido rodar "mesmo agent, dois providers diferentes".
- **CLIs de um fornecedor**: `claude-code`, `codex`, `gemini-cli`, `cursor-cli`,
  `copilot-cli`, `qwen-coder`, `kimi-cli`, etc. — falam a API do próprio fornecedor.
- `oracle` e `nop` não gastam API — bons pra testar o kit sem custo (ver seção 11).

Validado em 2026-09-06: `mini-swe-agent` + `deepseek/deepseek-chat` rodou uma task real
(`evals/python/soma-fracoes`) com reward 1.0, custo $0,0017, 63,5s.

### 10.6 Criteria
Um critério reutilizável que um juiz LLM usa pra avaliar uma run: `name` (identificador),
`description` (pergunta objetiva), `guidance` (instrução detalhada, incluindo o que conta
como PASS/FAIL/N-A). O template segue o formato real que o próprio Harbor usa internamente
(achado em `harbor/analyze/prompts/analyze-rubric.toml` do pacote instalado).

### 10.7 Judge Rubrics
Agrupa Criteria por checkbox — mesma relação Skill→Skillset. Materializado sob demanda como
`.toml` (`serializeRubricToml`) no schema exato que `harbor analyze --rubric` espera.

### 10.8 Judges

**Modo validação (escape hatch explícito do gate de model).** O dropdown de model do Judge só
mostra a lista curada high-tier, o que é o comportamento certo pra avaliação de verdade — mas
torna caro só *conferir se o Analyze funciona nesta máquina*. Por isso existe um checkbox
"Modo validação" em dois pontos que precisam concordar: aqui, que passa a listar **todos** os
models cadastrados (cada um fora da lista marcado com `⚠ fora da lista curada`), e no painel
Analisar do Compare, que envia `validationMode: true` na chamada. Faltando qualquer um dos
dois, `POST /api/analyze` recusa com a mensagem do gate — **não existe afrouxamento
silencioso**. Quando aceita, a resposta volta com `validationMode: true` + `judgeModel`, e a
tela carimba "não vale como avaliação". Validado em 2026-09-06 com `deepseek/deepseek-chat`
julgando uma run real: `clean_code: pass`, `no_prolixity: pass`, `analysis.json` gravado e
renderizado — por centavos, em vez do custo de um Opus.

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
**O que é**: um pacote de tasks já prontas publicado por terceiros — o oposto de criar sua
própria task do zero na aba Tasks. **Quando usar**: pra comparar contra um benchmark
conhecido/validado em vez de uma task sua, ou pra ver exemplos de tasks bem escritas.
**Quando pular**: opcional inteira — se só for usar tasks próprias, não é pré-requisito de
nada. O botão "List registry datasets" só imprime um link pro Hub do Harbor (ainda não existe
um jeito de listar os nomes disponíveis direto no terminal nesta versão) — copie o nome de lá
pro campo de download. Depois de baixar (`harbor dataset download`) em `datasets/<nome>/`,
`listTasks()` escaneia essa pasta junto de `evals/`, então as tasks baixadas aparecem
automaticamente no picker do Compare — não virou um conceito ou fluxo separado.

### 10.11-b Logs (aba de acompanhamento)
**O que é**: um tail dos arquivos de log que o próprio `harbor` grava dentro do jobs dir —
`job.log` do job, `trial.log` de cada tentativa, a saída bruta do agent e a do verificador.
**Por que existe**: o Compare é síncrono (um POST que só responde no fim, ver seção 13), então
uma run de vários minutos parecia travada. Agora o painel **Log ao vivo** aparece dentro do
próprio Compare durante a run, e esta aba mostra o mesmo — inclusive depois que terminou, e
para runs iniciadas pelo CLI ou por um `gui-server` que já reiniciou (o estado vem do disco,
não da memória deste processo).

**Como funciona**: três rotas somente-leitura — `GET /api/logs/jobs` (lista os jobs, marcando
com `▶` o que ainda está rodando, lido do `finished_at: null` no `result.json` do próprio
job), `GET /api/logs/files` (os `.log`/`.txt` daquele job) e `GET /api/logs/tail`
(incremental por byte offset, então cada poll traz só o que é novo; teto de 200 KB por
resposta). Polling de 2s, e só enquanto a aba está visível. Os dois segmentos de caminho
(`job` e `file`) passam por `safeJoinUnderDir`, então um valor forjado não sai do jobs dir —
testado com `../../../../secrets.env`, que retorna 404.

**Diferença pra Trajectories**: lá é a trajetória estruturada do agent (turnos, ferramentas,
edições) no viewer do Harbor; aqui é o log cru de execução, incluindo build da imagem e
instalação do agent — que é onde falha de container/rede/dependência aparece.

### 10.12 Trajectories
**O que é**: um segundo servidor web, do próprio Harbor (`harbor view`, não desta GUI), que
mostra passo a passo tudo que o agent fez dentro do container numa run — comandos, arquivos
tocados, saída de cada ferramenta, resposta do modelo a cada turno. É a evidência bruta atrás
do número de reward. **Quando usar**: depois de uma run do Compare, quando o reward sozinho
não basta — reward baixo e você quer ver onde travou, reward alto e quer confirmar que não foi
um atalho, ou só quer entender o estilo de trabalho do agent. Complementa o Analyze: Analyze
dá um veredito resumido de um LLM juiz; aqui você vê a trajetória inteira direto, sem
intermediário. **Como usar**: aponte pro mesmo jobs-dir da run (o botão "Ver trajetórias" no
Compare já faz isso sozinho) e clique "Start viewer" — abre um link numa aba nova. É um
processo de vida longa (fica escutando numa porta) até clicar "Stop" na lista abaixo; a lista
de viewers ativos é só em memória e não sobrevive a um restart do `gui-server` (os processos
continuam de pé, só a lista que esquece deles — pare manualmente se precisar).

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

- Compare na GUI ainda é **síncrono** — um POST só responde quando todas as combinações
  terminam, então não há resultado parcial linha a linha nem como cancelar no meio. O que
  deixou de ser verdade (2026-09-06) é a *cegueira* durante a espera: o botão agora trava
  enquanto roda (antes dava pra clicar duas vezes e disparar duas `harbor run` no mesmo job
  name), aparece um cronômetro, e o painel "Log ao vivo" — mais a aba **Logs** (10.11-b) —
  mostram o que o `harbor` está escrevendo em disco naquele instante.
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
- A resolução de `DOCKER_HOST` pra macOS/Linux (`resolvePodmanDockerHost()`, seção 4) foi
  validada isoladamente (comandos `podman` certos, campos certos do template Go), mas todo o
  desenvolvimento deste kit aconteceu numa máquina Windows — só o branch Windows tem um
  `harbor run --env docker` real, ponta-a-ponta, repetido várias vezes. Se `podman info`/
  `podman machine inspect` reportarem algo fora do formato esperado no seu macOS/Linux, o
  status da GUI mostra "DOCKER_HOST não resolvido" (aba de status, `/api/status`) em vez de
  falhar silenciosamente — mas o valor resolvido em si pode precisar de ajuste manual.
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
scripts/lib/*.ts              lógica compartilhada, 11 módulos (ver docs/ENGENHARIA.md §3):
                               types, catalog, paths, naming, exec, secrets, materialize,
                               joblogs, tasks, litellm + harbor.ts (superfície pública)
                               materialização de skills/rubrics, DOCKER_HOST fix, telemetria
scripts/gui-server.ts         servidor HTTP + todas as rotas /api/*
scripts/compare-matrix.ts     CLI de sweep (produto cartesiano via flags repetíveis)
gui/index.html                frontend inteiro (HTML+CSS+JS num arquivo só, sem build)
scripts/harbor-eval.sh/.ps1   bootstrap/doctor originais (instalação do Podman+Harbor)
scripts/start-gui.sh/.ps1     confere harbor/podman prontos e sobe o gui-server (idempotente)
scripts/stop-gui.sh/.ps1      para o gui-server achando quem está na porta (não toca em podman)
scripts/test.sh/.ps1          roda a suíte inteira: node --test + scan de credenciais
scripts/scan-secrets.sh       detector de credencial (modo --staged usado pelo pre-commit)
scripts/setup-hooks.sh/.ps1   ativa .githooks/ neste clone (core.hooksPath)
scripts/lib/harbor.test.ts    testes unitários da lógica pura (node:test, sem framework)
.githooks/pre-commit          bloqueia commit que contenha credencial
.gitattributes                fixa LF nos .sh (CRLF quebraria o hook num clone Windows)
.claude/skills/               skills de projeto: ship-change, secret-guard, cross-platform
docs/ENGENHARIA.md            padrões de engenharia e o incidente que originou cada regra
docs/screenshots/             imagens usadas no README.md
~/.harbor-eval-kit/test-provider-key.py   script Python materializado pelo botão "Test" (Secrets)
```
