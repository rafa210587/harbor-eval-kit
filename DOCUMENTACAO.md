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

- **Node.js 24+** — roda os scripts `.ts` direto, sem `tsc`/`ts-node`;
- **Podman CLI** e API rootless ou Podman machine;
- provider de `podman compose` com `--wait` e `--pull`;
- [`uv`](https://docs.astral.sh/uv/) para o Harbor isolado;
- imagens base aprovadas já presentes, pois o kit bloqueia pull implícito.

O passo a passo copiável para Windows PowerShell, Windows Git Bash, macOS e Linux rootless
está em `docs/INSTALACAO_MANUAL.md`.

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

O doctor reporta `podman`, `uv`, `node`, `harbor` (versão ou "missing"), seleciona a conexão
Podman efetiva, valida API e Compose e só então roda o smoke mutável. Se a máquina Podman nunca
foi criada, ele vai falhar antes de criar recursos — resolver no Windows/macOS com:
```powershell
podman machine init
podman machine start
```

`status` é o diagnóstico básico e somente leitura. `doctor` é deliberadamente mais profundo e
mutável; mesmo assim, uma task oracle/nop real ainda é exigida antes de declarar READY.

O smoke primitivo comum aos wrappers exige Node 24+ e a imagem base **preexistente**
`docker.io/library/alpine:3.20`; usa `--pull=never`. Recursos novos recebem nome único, label
e registro no manifest antes da criação. O teste não declara compatibilidade Harbor nem READY.

### 2.3 Instalar o Harbor

```powershell
.\scripts\harbor-eval.ps1 install
```
Por baixo, isso roda `uv tool install harbor` — instala como CLI Python isolada (`uv`
gerencia seu próprio Python, não mexe no Python do sistema, que pode nem existir). Ou peça
pro Claude Code carregar `Harbor_install/skills/harbor-bootstrap/SKILL.md`, que segue a mesma
sequência com validação em cada passo.

### 2.4 Validar a compatibilidade de verdade (gate Podman↔Harbor)

Ver seção 4 pros detalhes técnicos. O gate read-only é:
```powershell
node scripts/installation.ts gate "$HOME\.harbor-eval-kit\installation-manifest.json"
```
Ele não instala/chama Docker nem altera `DOCKER_HOST` na sessão. Depois disso, `doctor` roda as
primitivas e uma task mínima real precisa passar. Em 2026-09-07, `soma-fracoes` retornou reward
1 com oracle e 0 com nop no adapter gerenciado, sem API de modelo.

### 2.5 Persistir o manifest de instalação

Tudo que foi instalado (vs. o que já existia antes) fica registrado em
`~/.harbor-eval-kit/installation-manifest.json` — inclui versões, decisões tomadas, e um
histórico de notas de cada mudança feita no kit. Consulte esse arquivo se quiser reconstruir
o histórico completo de decisões desta instalação.

### 2.6 Subir a interface gráfica

Use `scripts/start-gui.sh` (macOS/Linux/Git Bash) ou `scripts\start-gui.ps1` (PowerShell). O
lifecycle Node reconhece uma instância existente pela resposta da API e não duplica o servidor.
Se necessário, inicia pelo nome somente a Podman machine associada à conexão configurada:

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

### 2.7 Primeiro uso — caminho mínimo

Comece em **Começar** e siga **Credenciais → Modelos → Agentes → Novo experimento**, escolhendo a task executável
`evals/python/soma-fracoes`. Para variar modelos entre providers, use um adapter compatível,
como `mini-swe-agent`. Skills e a configuração do juiz são opcionais. As abas numeradas
abaixo são o mapa completo de recursos; não são dez pré-requisitos obrigatórios:

1. **Credenciais** — cadastre a key de cada provider que for usar (o dropdown lista providers
   curados). Sem isso, só dá pra testar com os agents `oracle`/`nop` (gratuitos, sem LLM).
2. **Modelos** — cadastre `provider/modelo` (ex.: `anthropic/claude-sonnet-5`). O badge avisa
   se a key esperada já está em Credenciais.
3. **Skills** — escreva ou aponte pra instruções que um agent deve seguir (opcional).
4. **Skill Sets** — agrupe Skills num pacote nomeado (opcional, só se for usar Skills).
5. **Agentes** — monte um "perfil de uso": `agentValue` do Harbor + model padrão +
   instructions + default skill sets.
6. **Criteria** — critérios de avaliação qualitativa, reutilizáveis (opcional, só necessário
   se for usar o Analyze/juiz).
7. **Judge Rubrics** — agrupe Criteria num rubric nomeado (opcional).
8. **Judges** — monte o "perfil de uso" do avaliador: `agentValue` + judge model (só os da
   lista curada, cadastrado antes em Modelos) + instruções custom (opcional) + Judge Rubrics
   padrão (opcional, só necessário se for usar o Analyze/juiz).
9. **Tasks** — crie uma task real (`harbor init --task`) e preencha os 4 arquivos direto no
   editor da própria aba. **Os `evals/*/seed-task` de exemplo são stubs vazios** — não dá pra
   comparar contra eles sem preencher primeiro.
10. **Novo experimento** — escolha um Agent, clique "Adicionar" (repita pra cada combinação que quiser),
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

O resolver único `scripts/lib/podman.ts` lê conexões e máquinas e recusa seleção ambígua. No
Windows ele valida o pipe `npipe:////./pipe/docker_engine` somente depois de identificar a
máquina em execução. No macOS inspeciona a máquina selecionada pelo nome. No Linux rootless usa
o socket retornado por `podman info`; uma machine Linux ativa segue o ramo macOS.

Antes de criar recursos, `installation.ts gate` comprova a conexão via Podman CLI, consulta
`/version` no endpoint e exige identidade Podman, e verifica o provider `podman compose`,
inclusive `--wait` e `--pull`. O provider pode ser um plugin Docker Compose CLI preexistente;
Docker Engine não é necessário nem chamado. O `DOCKER_HOST` resolvido existe só no filho.

Depois, o smoke comprova build, run, exec, variável sintética, bind mount com leitura e escrita,
volume, rede, labels e cleanup. A imagem Alpine precisa preexistir e o build usa `--pull=never`.

Execuções passam por `execHarbor`, que converte o ambiente local no adapter
`harbor_eval_kit.managed:ManagedPodmanEnvironment`. Ele preserva o lifecycle do Harbor, mas
executa Podman diretamente, reserva nomes/identidades no manifest antes da criação e bloqueia
topologias ainda sem prova: apenas Linux, um serviço `main`, rede pública e Dockerfile ou imagem
local prebuilt são suportados nesta etapa.

**Validação**: no Windows com Podman 6.0.2, gate CLI/API/Compose e smoke completo passaram; a
task real retornou oracle=1 e nop=0, com seis recursos registrados e nenhum remanescente. Os
ramos macOS/Linux têm testes de lógica, sem execução real nesses hosts.

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

O kit usa LiteLLM em dois contextos distintos. O teste de credencial usa o **SDK**, dentro do
processo de probe, e a integração preparada abaixo usa um **proxy** separado. SDK e proxy não
são o mesmo caminho de tráfego.

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
`~/.harbor-eval-kit/litellm-gateway.json` e ponha `enabled: true`. Ausente ou `enabled: false`
é no-op. Uma configuração `enabled: true` ausente, ilegível ou inválida falha com diagnóstico
explícito; nunca redireciona tráfego em silêncio. O arquivo de configuração não pode conter
credenciais nem variáveis de infraestrutura. Sem gateway ativo, `buildHarborEnv()` mantém o
ambiente normal — há teste fixando isso.
`GET /api/status` reporta `litellmGateway.enabled`, pra responder "meu tráfego está passando por
proxy agora?" sem abrir arquivo.

**O mapeamento de variáveis é declarado, não adivinhado**: a configuração estrita declara
`hostBaseUrl`, `containerBaseUrl`, `inferenceKeyEnv`, `masterKeyEnv` e os nomes de ambiente do
proxy. URLs usam placeholders de host/container quando forem diferentes. A credencial de
inferência é resolvida pela combinação do ambiente do processo e dos extras do provider; a
master key autentica o proxy e é excluída do ambiente do executor filho. O helper do gateway
aplica seus nomes mapeados depois dos extras do provider, preserva extras não mapeados e não
absorve variáveis arbitrárias do processo.

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
- **E também recusa requisição que não veio da própria página dele.** Escutar só em
  `127.0.0.1` barra a rede, mas *não* barra o seu próprio navegador: qualquer site aberto
  numa aba podia mandar um POST com `Content-Type: text/plain` pra `http://127.0.0.1:4173`
  — isso é "simple request" no CORS, então não tem preflight pra recusar — e mesmo sem
  conseguir ler a resposta, o efeito colateral acontecia. Foi reproduzido de verdade contra
  este servidor antes da correção: um POST com `Origin: https://evil.example.com` criou uma
  entrada de registry e ela persistiu em disco. Dava pra gastar API key de verdade via
  `/api/compare`, trocar o model de um Judge (corrompendo a avaliação em silêncio) ou apagar
  registries. Agora toda requisição passa por duas checagens independentes
  (`scripts/lib/httpguard.ts`): o `Origin`, quando presente, tem que ser a própria página
  local (ausente é permitido — curl e os scripts do kit não mandam `Origin`), e o `Host` tem
  que ser loopback na porta certa, que é o que pega **DNS rebinding** — o ataque em que a
  página já *é* same-origin na hora do disparo e só o `Host` denuncia.
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
| 1 | Credenciais | — |
| 2 | Modelos | Credenciais (badge de key) |
| 3 | Skills | — |
| 4 | Skill Sets | Skills |
| 5 | Agentes | Modelos, Skill Sets |
| 6 | Criteria | — |
| 7 | Judge Rubrics | Criteria |
| 8 | Judges | Models (model do juiz), Judge Rubrics (defaults) |
| 9 | Tasks | — |
| 10 | Novo experimento | Agentes, Tasks, Judges (opcional, pro painel Analisar) |

`Datasets`, `Trajectories` e **Análise avulsa** são áreas de apoio usadas quando preciso; não
fazem parte do fluxo linear de **Novo experimento**.

---

## 10. Cada aba em detalhe

### 10.1 Credenciais
Cadastra chaves de provider. Dropdown com 15 providers curados (Anthropic, OpenAI, Azure,
DeepSeek, Gemini, Vertex AI, OpenRouter, Groq, Mistral, Cohere, xAI, Together AI, Fireworks,
Ollama, Bedrock) — escolher um preenche o `Name` certo automaticamente. A lista canônica
(`PROVIDERS`) mora no servidor (`scripts/lib/catalog.ts`) e é buscada via `GET /api/providers`
— a GUI não mantém mais uma cópia própria, pra não ter duas listas divergindo com o tempo.
"outro/customizado" deixa digitar qualquer nome. Ver seção 7 pra garantias de segurança.

**Como usar**: escolha o provider no dropdown (ou "outro"), cole o valor da key e clique
**Salvar credencial**.
A lista abaixo mostra só os *nomes* já cadastrados, nunca os valores.

**Botão "Testar modelo escolhido"**: depois de salvar, selecione um Model compatível já
cadastrado e clique no botão. A chamada real usa exatamente o `provider/model` selecionado,
com `max_tokens: 8`; salvar a credencial não faz teste automático. A rota recebe
`POST /api/secrets/test` com `{name, model}` e executa `scripts/python/probe_provider.py`.
A credencial entra somente por variável de ambiente, nunca por argumento ou resposta.

**Botão "Descobrir modelos"**: é uma operação separada, feita sob demanda pela rota
`GET /api/providers/:provider/models`. Consulta o catálogo do provider e não faz completion.
Se retornar modelos, a UI permite marcar quais cadastrar na aba Modelos; nada é cadastrado sem
essa ação explícita. Catálogo vazio não prova nem invalida a credencial.

Testar faz uma chamada paga no modelo exato; descobrir consulta o catálogo e pode depender do
suporte do provider. O kit não escolhe o modelo mais barato e não testa automaticamente ao
salvar.

### 10.2 Modelos
Atalho de label → `provider/modelo` (ex.: `anthropic/claude-sonnet-5`). O prefixo antes da
`/` é a convenção que o Harbor/LiteLLM usa pra decidir qual API key ler — por isso cada model
mostra um badge dizendo se a key esperada já está em Credenciais (`guessProviderKey`).

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

### 10.5 Agentes
Um agent aqui é um **perfil de uso**, não só o nome cru do Harbor: junta
`agentValue` (`claude-code`, `codex`, `oracle`, `nop`, ...) + um **model padrão** + umas
**instructions** próprias (viram uma skill implícita, sempre anexada — `resolveAgentInstructionsPath`)
+ **default skill sets**. Isso é o que **Novo experimento** usa pra pré-preencher cada linha.

**Valores de `agentValue` aceitos** pelo Harbor instalado: **42**, com autocomplete no próprio
campo (`<datalist>` alimentado por `GET /api/harbor-agents`, cuja fonte é a constante
`HARBOR_AGENTS` em `scripts/lib/catalog.ts` — espelho mantido à mão de `harbor run --help`,
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
mostra a lista curada por política operacional; isso não prova a qualidade de um veredito.
Para *conferir se a Análise avulsa funciona nesta máquina*, existe um checkbox
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
`claude-code`), **com qual model** (dropdown filtrado só pros models cadastrados em **Modelos** cujo
`provider/modelo` bate com a lista curada high-tier do kit — nunca o padrão barato do próprio
Harbor, `claude-haiku-4-5`), **instruções customizadas** (opcional) e **quais Judge Rubrics
marcar por padrão**. Depois de cadastrado, escolha esse Judge no painel Analisar de **Novo
experimento**, em **Análise avulsa**, ou no pin de uma Task — em vez de escolher
model/agent/rubric soltos toda run.

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
Judges) e "Judge rubrics padrão desta task" (checkbox, pode marcar **N rubrics**, não
só um; escolher um Judge pré-marca os rubrics padrão dele aqui, ainda editável). Isso não roda
nada sozinho — é só um "lembrete pinado": quando essa task é usada numa run do Compare, o
painel Analisar já abre com esse Judge e esses rubrics pré-selecionados, prontos pra clicar em
"Analisar" (ver 10.10 e 11). Fica salvo em
`~/.harbor-eval-kit/task-rubric-defaults.json`, indexado pelo path da task — não dentro da
pasta da task, pra não misturar preferência de UI com o conteúdo da task em si.

### 10.10 Novo experimento — o núcleo do kit
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
painel opcional **Analisar** por linha (ou "Analisar todas") usando um **Judge** +
**um ou mais Judge Rubrics** (checkbox — cada um marcado dispara uma chamada de análise
separada, os resultados aparecem empilhados, cada um com o custo daquela análise). Se a task
rodada tiver Judge/rubrics pinados (seção 10.9), o painel já abre com eles pré-selecionados —
pode ajustar antes de clicar.

### 10.10-b Guarda de gasto (teto + estimativa)

O Compare mostra o **custo estimado** enquanto você monta a comparação, e o servidor **recusa a
run (409) antes de spawnar qualquer coisa** se ela passar do teto.

A estimativa vem do histórico **desta máquina**: custo por trial já medido para aquele
`agent + model` (lido do `result.json` que o próprio Harbor grava), × n-attempts × linhas × tasks
descobertas no caminho informado. Sem
histórico do par exato, cai para o mesmo model sob outro agent. `oracle`/`nop` são zero por
definição. Job que não reportou custo é tratado como **desconhecido**, nunca como gratuito —
entrar como zero na média subestimaria toda run futura.

Duas recusas independentes, ambas liberadas por confirmação explícita (válida só para aquela
run, nunca memorizada):

1. estimativa **conhecida** acima do teto;
2. estimativa **desconhecida** acima de 5 trials pagos — porque não saber o preço não é motivo
   pra pular a checagem, é motivo pra limitar o volume. Sem essa segunda regra, "model novo +
   n-attempts 30" passava batido (aconteceu de verdade em teste; ver `docs/ENGENHARIA.md` §6.1).

**Limitação, dita na própria tela:** é guarda **pré-voo**, não limite rígido. O `harbor run`
desta versão não expõe flag de custo, então depois que a run começa nada aqui a interrompe. Para
limite real em execução, use o kwarg do próprio adapter no campo "Extra harbor run args" — ex.:
`--ak cost_limit=0.50` com o `mini-swe-agent`.

Os argumentos extras aceitos são `--ak`/`--agent-kwarg` e `--timeout-multiplier`. Flags que
alterariam task, modelo, quantidade ou diretório não podem contornar o plano nem a guarda.

Teto `0` = sem teto. Rotas: `POST /api/compare/estimate` (prévia) e o mesmo estimador dentro do
`POST /api/compare` (enforcement) — o número mostrado é o número aplicado.

### 10.10-c Cancelar uma run

Botão **Cancelar** aparece ao lado de "Run comparison" assim que uma run de verdade (não dry
run) começa. Envia `POST /api/compare/cancel { runId }` — o `runId` é gerado no **navegador**
(`crypto.randomUUID()`) e mandado junto no `POST /api/compare` original, porque o cliente
precisa conhecê-lo antes daquele POST responder.

**É melhor esforço, dito na própria tela.** O cancelamento mata o processo `harbor` (SIGTERM) e
tenta parar os containers Podman daquela run, mas o Harbor limpa containers como parte do
término **normal** de uma run (`--delete` por padrão) — um processo morto no meio nunca chega
lá. Por isso existe `stopContainersForJob()` (`scripts/lib/exec.ts`): lê os diretórios de trial
já criados em disco sob `<jobsDir>/<jobName>` e para qualquer container Podman cujo nome comece
com o nome de um desses diretórios.

**Achado testando de verdade**: a primeira versão comparava os nomes com case sensível e nunca
batia nada — Podman/Compose **normalizam o nome do container pra minúsculas**
(`soma-fracoes__ntpdigk__env-main-1`), enquanto o diretório do trial no disco mantém o id
mixed-case original que o Harbor gerou (`soma-fracoes__ntPdiGK`). Corrigido comparando em
minúsculas dos dois lados; validado matando uma run real em andamento e confirmando via
`podman ps` que o container específico (não outro) foi parado.

O cancelamento automático de containers exige identidade completa, prefixo, label e registro no
manifest. Recursos do Harbor que ainda não possuam esses metadados são preservados para inspeção
manual. O uninstall também recusa propriedade ambígua; seu dry-run mostra o conjunto exato,
incluindo Harbor quando comprovadamente instalado pelo kit. uv é explicitamente preservado
porque o footprint completo do instalador não foi inventariado. A auditoria fica no manifest.

### 10.10-d Config Bundle — compartilhar configuração entre máquinas

Aba **Configuração**. Agentes, Modelos, Skills, Skill Sets, Criteria, Judge Rubrics e Judges vivem em
`~/.harbor-eval-kit/`, por máquina — sem isso um time não versiona essa configuração em git nem
revisa em PR. **Exportar** baixa um `.json` com todas as registries (`GET /api/config/export`);
**Importar** aplica um bundle (`POST /api/config/import`, `scripts/lib/bundle.ts`).

**Nunca inclui secret** — um Model é só `label` + `provider/modelo`, nunca uma chave; testado
explicitamente (`bundle.test.ts`, "nunca inclui nada parecido com secret").

**Idempotente por id**: o bundle preserva o id original de cada item, e importar faz *upsert*
(atualiza se o id já existe localmente, insere se não existe) — importar o mesmo bundle duas
vezes não duplica nada, e um item que só existe naquela máquina (não veio do bundle) nunca é
apagado. Isso é o que torna o fluxo "commita no repo do time, todo mundo importa" seguro de
repetir.

O import valida IDs, tipos e referências antes de escrever. Um bundle inválido é recusado;
ele não pode usar IDs como caminhos para escrever fora dos diretórios gerenciados.
O bundle compartilha **definições editáveis**: não inclui tasks, diretórios externos de skills,
credenciais nem histórico. Para auditar uma execução, use o registro de experimento.

### 10.10-e Experimentos persistidos

GUI e CLI usam um plano comum e atribuem uma identidade nova a cada execução e candidato.
O mesmo Job prefix não reaproveita um job antigo nem faz duas linhas disputarem o diretório.
Retomada automática de um job anterior não é suportada.

O snapshot recusa links/junctions, `.git` e nomes de arquivos de credenciais. Copia arquivos
regulares de tasks e skills; tags de imagens, downloads externos e aliases de modelos precisam
de pins próprios para repetibilidade além da cópia. Não há retomada automática de processos
após reiniciar o servidor: a tela distingue resultado em disco de atividade não confirmada.

`<jobsDir>/.experiments/<id>/` guarda plano efetivo, snapshots e hashes de inputs locais,
resultados e análises vinculadas. A GUI permite reabrir esses registros após refresh.
As skills usadas na execução ficam isoladas das edições posteriores nos cadastros.
Isso preserva os inputs locais, mas não congela o comportamento do provider nem o conteúdo
de imagens remotas sem digest. Reiniciar o servidor não retoma automaticamente processos.

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

### 10.13 Análise avulsa
Uso ad-hoc do `harbor analyze` num path específico, escolhendo um Judge já cadastrado. No
fluxo normal, use o botão **Analisar** direto na tabela de resultados de **Novo experimento**
(seção 10.10); esta área existe quando você já tem um path exato em mente.

O bootstrap é process-local: `execHarbor` detecta `analyze` e executa o Python do Harbor com
`-m harbor_eval_kit.cli`. O módulo verifica o gate do Harbor **0.22.0**, valida a entrada
`--env docker` e substitui temporariamente, apenas no registry em memória daquele processo, a
entrada Docker pelo `ManagedPodmanEnvironment`. Ao terminar, restaura a entrada original; o
pacote instalado do Harbor nunca é editado.

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
iteração exploratória. O padrão usa uma **lista curada de modelos**
(`JUDGE_MODELS`/`isJudgeModelAllowed` em `scripts/lib/catalog.ts`). É uma política operacional,
não prova de qualidade: calibre o juiz com exemplos de veredito conhecido. O modo validação
continua explícito e marcado nos resultados. Confira os IDs reais no provider antes de usar.

**Quem é o juiz é registrado como um Judge**, não escolhido solto toda vez: um Judge
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
própria GUI (`analyzeRow`/`compare-sort-btn` em `gui/app/compare.js`).

**Um resultado pode ser analisado por N rubrics ao mesmo tempo.** O checkbox-picker do painel
Analisar (seção 10.10) aceita marcar mais de um Judge Rubric; `analyzeRow` faz **uma chamada
`/api/analyze` por rubric marcado** (sequencial, não em paralelo), cada uma gerando seu
próprio `analysis.json`/veredito, exibidos empilhados sob o nome do rubric. O `passRate`
usado pra ordenar soma pass/aplicável de **todos** os rubrics analisados naquele resultado —
então rodar 2 rubrics (ex.: "Python Quality" + "Reward Hacking Check") sobre o mesmo job conta
os critérios dos dois juntos, não substitui um pelo outro. Se nenhum rubric for marcado, cai
no rubric padrão do próprio Harbor (`reward_hacking` + `task_specification`).

O parser mantém **todos os trials** retornados pelo Harbor. Cada critério de cada trial
conta separadamente: `passRate = pass / (pass + fail)`; N/A e outcomes desconhecidos são
contabilizados à parte. Ausência de checks não vira zero nem aprovação. Reanalisar mantém
o histórico, mas o indicador exibido representa o lote de rubrics daquela análise.
`validationMode` e o modelo do juiz acompanham os registros persistidos.

Pra não ter que marcar isso toda vez: uma Task pode ter um Judge + rubrics **pinados**
(seção 10.9) — o painel Analisar detecta que a run atual usou aquela task e já vem com esse
Judge e esses rubrics pré-selecionados, sem rodar nada sozinho (o clique em "Analisar"
continua manual).

### Custo, tokens e velocidade

Dois custos diferentes existem e não devem ser somados como se fossem um só:

- **Custo do agent que resolveu a task** — aparece direto na tabela do Compare (`custo agent
  (USD)`, `tokens in/out`), lido de `stats.cost_usd`/`n_input_tokens`/`n_output_tokens` no
  `result.json` do job (`parseResult` em `scripts/lib/results.ts`). São os números reais de
  billing que o próprio Harbor calculou (mesmo `compute_token_cost_totals()` que o `harbor
  check`/`harbor analyze` usam para as próprias contas) — não é uma estimativa deste kit.
  Fica em branco quando o adapter do agent usado não reporta isso.
- **Custo do Judge** — só existe depois de clicar "Analisar"; aparece como "custo juiz (USD)"
  na tabela (soma de todos os rubrics analisados naquela linha) e como uma linha por rubric no
  painel de resultado, lido de `cost_usd`/`estimated_cost_usd` nos trials do `analysis.json`.
  O total fica ausente se qualquer trial não reportar custo; `reportedCostUsd` identifica
  explicitamente uma soma parcial. É o custo de o Judge *ler* o resultado, separado do de produzi-lo.

**Velocidade**: `durationSec` na tabela do Compare é o tempo de parede da chamada `harbor run`
inteira daquela linha (medido pelo próprio kit, em `execCommand`) — inclui subir o
container/ambiente, não só o agente "pensando". O Harbor grava timing mais fino por trial
(`agent_execution`/`verifier` em `TrialResult`, com `started_at`/`finished_at`), mas este kit
não lê esses campos hoje; `durationSec` é a métrica de velocidade disponível na GUI.

---

## 12. `compare-matrix.ts` (CLI) vs. GUI — quando usar cada um

`compare-matrix.ts` é a ferramenta de linha de comando, pra scriptar/automatizar: sweep
completo via `--agent`/`--model`/`--skillset` repetíveis (produto cartesiano de verdade, ao
contrário da GUI). Use quando quiser rodar de um script, CI, ou preferir terminal.

A GUI (`gui-server.ts`) é pra uso interativo — registries persistentes, editor de arquivos,
Compare por entradas com override por linha, Analyze integrado. As duas falam com o mesmo
Harbor por baixo e compartilham planejamento, normalização e guarda. Ambas carregam
`secrets.env` apenas para o ambiente dos filhos e persistem os experimentos. A CLI recusa
`--interactive`: o executor não oferece stdin interativo; use o Harbor diretamente se precisar.

---

## 13. Limitações conhecidas (decisões conscientes, não esquecimento)

- Compare mantém um POST síncrono, cronômetro, logs e botão **Cancelar** durante a execução.
  O registro persistido permite reabrir a comparação após refresh; reiniciar o servidor não
  oferece retomada automática de uma execução interrompida.
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
- A resolução de `DOCKER_HOST` pra macOS/Linux (`resolvePodmanConnection()`, seção 4) foi
  validada isoladamente (comandos `podman` certos, campos certos do template Go), mas todo o
  desenvolvimento deste kit aconteceu numa máquina Windows — só o branch Windows tem um
  adapter gerenciado real, ponta-a-ponta. Se `podman info`/`podman machine inspect` reportarem
  outro formato no macOS/Linux, o gate bloqueia antes de criar recursos.
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
scripts/lib/*.ts              lógica compartilhada modular (ver docs/ENGENHARIA.md §3), incluindo
                               podman, managed-runtime, gui-lifecycle e harbor-cli
                               types, catalog, paths, naming, exec, secrets, materialize,
                               joblogs, tasks, litellm, cost, bundle + harbor.ts (superfície
                               pública) -- materialização de skills/rubrics, DOCKER_HOST fix,
                               telemetria, guarda de gasto, export/import de config
scripts/gui-server.ts         servidor HTTP + todas as rotas /api/*
scripts/compare-matrix.ts     CLI de sweep (produto cartesiano via flags repetíveis)
scripts/harbor-cli.ts         status read-only e eval pelo executor comum
scripts/gui-lifecycle.ts      preflight/status/stop usados pelos pares de wrappers
gui/index.html                markup das áreas da GUI (só HTML)
gui/styles.css                estilos
gui/app/*.js                  módulos ES nativos, sem build; a lista acompanha a separação
                               por responsabilidade (ver docs/ENGENHARIA.md §3)
scripts/harbor-eval.sh/.ps1   bootstrap/doctor originais (instalação do Podman+Harbor)
scripts/start-gui.sh/.ps1     confere harbor/podman prontos e sobe o gui-server (idempotente)
scripts/stop-gui.sh/.ps1      para só o processo Node deste projeto e verifica o efeito
scripts/test.sh/.ps1          roda a suíte inteira: node --test + scan de credenciais
scripts/scan-secrets.sh       detector de credencial (modo --staged usado pelo pre-commit)
scripts/setup-hooks.sh/.ps1   ativa .githooks/ neste clone (core.hooksPath)
scripts/check-imports.mjs     checa builtins/nomes usados sem import e ciclos (backend + GUI)
scripts/lib/*.test.ts         testes unitários (node:test, sem framework), incluindo catálogo,
                               probe, gateway, custo, bundle e templates
docs/PENDENCIAS.md            próximos passos, escrito pra qualquer agente pegar (não só Claude)
docs/INSTALACAO_MANUAL.md     instalação/operação por Windows, Git Bash, macOS e Linux rootless
.githooks/pre-commit          bloqueia commit que contenha credencial
.gitattributes                fixa LF nos .sh (CRLF quebraria o hook num clone Windows)
.claude/skills/               skills de projeto: ship-change, secret-guard, cross-platform
docs/ENGENHARIA.md            padrões de engenharia e o incidente que originou cada regra
docs/screenshots/             imagens usadas no README.md
scripts/python/probe_provider.py  probe explícito de descoberta/teste de provider (Credenciais)
```
