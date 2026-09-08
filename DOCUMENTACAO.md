# Harbor Eval Kit — Documentação completa

Para instalar com Claude Code, comece por
[Instalação com Claude e `/harbor-setup`](docs/INSTALACAO_CLAUDE.md).
Para reconstruir ou evoluir o produto, use a
[baseline SDD: specs, planos e tasks](specs/README.md).
Ela inclui 12 capacidades e contratos auditados; leia também a
[auditoria de suficiência e limitações](docs/AUDITORIA_SDD_2026-09-08.md).
Para falhas de instalação no Mac, consulte a
[correção do comando inspect e validação macOS](docs/MACOS_VALIDACAO_2026-09-08.md).

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
9. [Ordem cognitiva das áreas](#9-ordem-cognitiva-das-áreas)
10. [Cada área em detalhe](#10-cada-área-em-detalhe)
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
   o Harbor em si (não confundir com as áreas "Skills"/"Agentes" da GUI — são conceitos
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
Por baixo, isso roda `uv tool install harbor==0.22.0` — instala como CLI Python isolada (`uv`
gerencia seu próprio Python, não mexe no Python do sistema, que pode nem existir). O kit verifica
essa versão pinada antes de executar e recusa outra versão. Ou peça
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

Comece em **Começar**. O checklist só libera **Criar novo experimento** depois que uma task
foi escolhida e existe um perfil de agente. Para um agente gratuito informado pelo catálogo
do servidor (por exemplo, `oracle`/`nop`), modelo e credencial são dispensados; para agentes
pagos, o checklist também aponta **Modelos** e **Credenciais**. Para variar modelos entre
providers, use um adapter compatível, como `mini-swe-agent`. Skills e a configuração do juiz
são opcionais. As áreas abaixo são o mapa funcional da GUI, não uma lista de pré-requisitos
obrigatórios:

- **Credenciais** — cadastre a key de cada provider que for usar. Sem isso, só dá pra testar
  com os agents `oracle`/`nop` (gratuitos, sem LLM).
- **Modelos** — cadastre `provider/modelo` exato; o badge avisa se a key esperada já está em
  Credenciais.
- **Skills** e **Skill Sets** — escreva instruções ou agrupe Skills (opcionais).
- **Agentes** — monte um perfil com `agentValue` do Harbor, modelo padrão, instructions e
  skill sets padrão.
- **Critérios**, **Conjuntos de critérios** e **Juízes** — configure avaliação qualitativa
  (opcional; o Harbor chama cada conjunto de `rubric`).
- **Tasks** — crie uma task real (`harbor init --task`) e preencha os arquivos no editor.
  Os `evals/*/seed-task` são stubs de template e precisam ser preenchidos antes de comparar.
- **Novo experimento** — escolha agentes, task e volume, revise a prévia e execute. Reward,
  custo e tokens aparecem no resultado; **Analisar** e **Ver trajetórias** ficam disponíveis
  depois da execução.

Cada campo visível tem uma ajuda acessível com finalidade, exemplo, padrão e quando é opcional,
inclusive filtros e arquivos extras criados dinamicamente. No modo compacto, avisos, custo,
validação, erros e estado de operações continuam visíveis. Se um carregamento inicial falhar,
a área **Começar** identifica qual parte ficou indisponível em vez de deixar listas vazias sem
explicação.

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
processo `harbor` que o kit dispara (`withTelemetryDisabled()` em `scripts/lib/exec.ts`,
aplicado tanto em `buildHarborEnv()` quanto em `execCommand()` — de propósito, isso **não**
depende do fix de `DOCKER_HOST`, porque são preocupações diferentes: uma é sobre onde o
Podman escuta, a outra é sobre nada vazar). Verificado rodando `buildHarborEnv()` e
inspecionando o valor, e confirmando reward correto numa run real depois da mudança.

A lib LiteLLM (que o Harbor usa por baixo pra falar com os providers) tem um flag
`telemetry = True`, mas vasculhando o pacote inteiro não achamos nenhum código que realmente
leia esse flag e dispare um envio — parece resquício sem uso ativo nesta versão. A integração
com PostHog que existe ali é opt-in (só ativa se você mesmo configurar sua própria conta).

### 5.1-b Gateway LiteLLM — opcional, desligado por padrão

A aba **Credenciais** continua útil com proxy: guarde nela a chave virtual de inferência
indicada por `inferenceKeyEnv`. Chaves dos providers e chave administrativa ficam no proxy.
Os controles de cada provider usam SDK direto; o cartão separado **Gateway LiteLLM** consulta
os aliases do proxy e permite registrá-los e testar um alias escolhido explicitamente.
Descoberta não chama completion; o teste pago é limitado a 8 tokens e preserva o alias exato.
O registro OpenAI compatível usa `openai/<alias>`, inclusive quando o alias contém barras.

**Como ligar**: configure `~/.harbor-eval-kit/litellm-gateway.json` a partir do exemplo do repo,
preencha host/container e mapeamentos do adapter, salve a chave de inferência e defina
`enabled: true`. Ausente/OFF não injeta ambiente nem consulta o proxy. ON inválido falha com
diagnóstico. O kit não instala nem inicia LiteLLM. Endpoints não aceitam credenciais, query
string ou fragmento. A UI precisa de `hostBaseUrl`, mesmo se o agent usa `containerBaseUrl`.

`GET /api/litellm/status` informa configuração e presença de chave, nunca valores. `configured`
significa ON com endpoint de host presente, não tráfego confirmado. Os endpoints de descoberta
e teste usam Bearer, recusam redirects e limitam timeout a 15s e respostas a 1 MiB. Não devolvem
metadados ou erros brutos do proxy. O status geral `litellmGateway.enabled` também indica
configuração, não prova que todos os adapters estejam usando o proxy.

**O mapeamento é declarado**: cada adapter precisa reconhecer as variáveis de `env`; o gateway
não intercepta universalmente todo tráfego. A inferência usa extras da run, depois chave salva,
depois ambiente do processo. Somente a referência de inferência é buscada no arquivo para esse
lookup. Os mapeamentos vencem extras homônimos e a master key é removida do filho Harbor.
Aliases descobertos não ampliam automaticamente a lista permitida de modelos de juiz.

**Validação**: testes com HTTP local simulado cobrem descoberta, inferência explícita e
segurança; a UI também foi exercitada com dois aliases sintéticos, registro, bloqueio sem
seleção e gateway OFF. Isso não certifica um proxy real nem a rede host/container de cada SO.
O gateway real permanece desligado. Veja [guia de uso e limites](docs/LITELLM.md).

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
encontrado testando os Juízes/`/api/analyze`: `harbor analyze` imprime um emoji
(`\U0001f50d`, antes de "Analyzing trial(s)...") logo na primeira linha do comando, via
`rich`. Rodado como processo filho no Windows, o Python herda o code page do console
(`cp1252`) em vez de UTF-8 pra `stdout`, e aquele emoji não existe em `cp1252` —
`UnicodeEncodeError`, comando morre antes de fazer qualquer validação, **mesmo com todos os
argumentos corretos**. Reproduzido e confirmado neste kit; não é específico de nenhum
`--agent`/`--model`/`--prompt` em particular, acontece com qualquer chamada de
`harbor analyze` no Windows.

**Correção**: `PYTHONIOENCODING=utf-8` injetado incondicionalmente em todo processo `harbor`
que o kit dispara (`withPythonUtf8()` em `scripts/lib/exec.ts`, mesmo padrão de
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
├── analysis-sessions/                     sessão congelada de cada lote de Analyze
│   └── <sessionId>/session.json           modelo, adapter, prompt e todos os Rubrics escolhidos
└── ...                                    outros artefatos gerenciados, quando necessários

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
projeto, mas isso colide de nome com as áreas "Skills" e "Agentes" da GUI (que são um conceito
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

| Conceito | O que é | Referenciado por | Persistência |
|---|---|---|---|
| **Skill** | Instruções que um agent pode receber | Conjunto de skills e Agent | registry; snapshot da execução |
| **Skill Set** | Pacote nomeado de 1+ Skills | Agent (`defaultSkillsetIds`), linha do Compare | — (é só uma lista de ids) |
| **Critério** | Uma pergunta de avaliação: `name`+`description`+`guidance` | Conjunto de critérios (`criterionIds`) | vira um bloco `[[criteria]]` no `.toml` do `rubric` |
| **Conjunto de critérios** | Pacote nomeado de 1+ Critérios; chamado de `rubric` pelo Harbor | Analyze / botão "Analisar" do Compare | definição no registry; conteúdo serializado para a chamada |
| **Juiz** | Perfil de uso do avaliador: `agentValue`, modelo, instruções custom (opcional) e Conjuntos de critérios padrão | Compare, Analyze, preferência de Task | registry; sessão de Analyze congelada |
| **Model** | Atalho de label → `provider/modelo` | Agent (`modelId`), linha do Compare (override) | passado direto como `--model` pro Harbor |
| **Agent** | "Perfil de uso": `agentValue` do Harbor + model padrão + instructions + default skill sets | linha do Compare | passado como `--agent`/`--model`/`--skill` pro Harbor |
| **Task** | O problema em si: `task.toml` + `instruction.md` + `Dockerfile` + `solve.sh` + `test.sh` | Compare (`path`) | `evals/<lang>/<nome>/` ou `datasets/<nome>/<nome>/` |
| **Job** | Uma execução do `harbor run` (uma linha do Compare = um job) | — | `<jobs-dir>/<job-name>/result.json` |
| **Trial** | Uma tentativa dentro de um job (normalmente 1, a menos que `n-attempts` > 1) | — | `<jobs-dir>/<job-name>/<trial>/` |
| **Reward** | Número (0/1 ou fração) que `tests/test.sh` escreve em `/logs/verifier/reward.txt` | — | dentro do `result.json` do job |
| **Analysis** | Veredito PASS/FAIL/N-A por critério, gerado pelo juiz LLM sobre um job já rodado | — | `analysis.json` dentro do diretório analisado |
| **Padrão de análise da Task** | 0+ Conjuntos de critérios + 1 Juiz guardados numa Task, para pré-marcar o painel Analisar | Task (editor, seção "Juiz padrão desta task") | `~/.harbor-eval-kit/task-rubric-defaults.json`, chaveado pelo path da task |

**Agent (Harbor_install) ≠ Agent (GUI)**: `Harbor_install/agents/*.md` são papéis pro Claude
Code operar o kit (`environment-doctor`, `harbor-installer`, ...). A área "Agentes" da GUI é
outra coisa — perfis de agente **pra rodar dentro das evals** (`claude-code`, `codex`,
`oracle`, `nop`, ...). Mesma lógica pra `Skills`: `Harbor_install/skills/*` são skills do
Claude Code pra instalar/diagnosticar; a área "Skills" da GUI é sobre o que os agentes
**sob teste** recebem de instrução.

---

## 9. Ordem cognitiva das áreas

A GUI é organizada pra guiar um uso de primeira vez, mas cada aba funciona isolada depois:

| Área da UI | Depende de |
|---|---|
| **Começar** | — |
| **Credenciais** | — |
| **Modelos** | Credenciais (badge de key) |
| **Skills** e **Conjuntos de skills** | —; conjuntos usam Skills |
| **Agentes** | Modelos, Conjuntos de skills |
| **Critérios**, **Rubrics** e **Juízes** | —; Rubrics usam Critérios e Juízes usam Modelos/Rubrics |
| **Tasks** | — |
| **Novo experimento** | Agentes e Tasks; Juiz opcional para Analisar |
| **Configuração**, **Datasets**, **Logs**, **Trajetórias** e **Análise avulsa** | áreas de apoio |

`Datasets`, `Trajetórias` e **Análise avulsa** são áreas de apoio usadas quando preciso; não
fazem parte do fluxo linear de **Novo experimento**.

---

## 10. Cada área em detalhe

Para uma orientação rápida antes dos detalhes, consulte o
[guia visual das 16 abas](docs/GUIA_VISUAL.md), com a sequência de primeiro uso e
exemplos de como comparar modelos, agentes e skills.

### 10.1 Credenciais
Cadastra chaves de provider. O dropdown lista providers curados (Anthropic, OpenAI, Azure,
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
Uma Skill é uma definição de instruções. Duas origens: **escrever instruções** ou
**apontar pra uma pasta existente**. A definição fica no registry; quando um experimento é
preparado, `scripts/lib/experiment-store.ts` copia a pasta ou o conteúdo autorizado para o
snapshot daquela execução e calcula os hashes dos arquivos. Alterar o cadastro depois não
muda uma execução já preparada.
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
disco, bota o que quiser nela). Arquivos extras autorizados acompanham o snapshot da
execução; nomes relativos passam por `safeJoinUnderDir`, então um nome como `../../etc/x` é
recusado antes de escrever fora da entrada da Skill.

### 10.4 Conjuntos de skills
Agrupa uma ou mais Skills por checkbox — mesma referência por `id`, sem duplicar texto (se
você editar uma Skill, todo Skillset que a usa já reflete a mudança).

### 10.5 Agentes

Cadastre a conexão em **Credenciais → Integrações de CLI e harness** e selecione-a
no perfil de Agentes ou Juízes. API e assinatura têm campos separados; diagnóstico no
host não certifica o container. Veja [configuração e limites](docs/REPOSITORIOS_E_HARNESSES.md#conectar-um-harness).
Um agent aqui é um **perfil de uso**, não só o nome cru do Harbor: junta
`agentValue` (`claude-code`, `codex`, `oracle`, `nop`, ...) + um **model padrão** + instruções
próprias + **default skill sets**. Isso é o que **Novo experimento** usa pra pré-preencher
cada linha. As instruções e Skills resolvidas entram no snapshot pelo
`scripts/lib/experiment-store.ts`; não há uma Skill implícita compartilhada entre execuções.

**Valores de `agentValue` aceitos** pelo Harbor instalado aparecem no autocomplete do próprio
campo (`<datalist>` alimentado por `GET /api/harbor-agents`, cuja fonte é a constante
`HARBOR_AGENTS` em `scripts/lib/catalog.ts` — espelho mantido à mão do `AgentFactory` do
Harbor 0.22.0, porque `harbor agent list` não existe neste Harbor). O campo continua **livre**: o Harbor
também aceita um import path customizado (`module.path:ClassName`) e atalhos ACP
(`acp:opencode@1.3.9`), que um `<select>` fechado impediria.

A distinção que mais importa na hora de comparar models está marcada na lista:

- **Model-agnostic** (LiteLLM por baixo, aceitam qualquer `provider/modelo`): `mini-swe-agent`,
  `terminus-2`, `aider`, `opencode`, `openhands`, `openhands-sdk`, `swe-agent`,
  `goose`, `langgraph`, `cline-cli`, `dspy-rlm`, `deerflow`, `trae-agent`. São os únicos com
  que faz sentido rodar "mesmo agent, dois providers diferentes".
- **CLIs de um fornecedor**: `claude-code`, `codex`, `gemini-cli`, `cursor-cli`,
  `copilot-cli`, `qwen-coder`, `kimi-cli`, etc. — falam a API do próprio fornecedor.
- `oracle` e `nop` não gastam API — bons pra testar o kit sem custo (ver seção 11).

Validado em 2026-09-06: `mini-swe-agent` + `deepseek/deepseek-chat` rodou uma task real
(`evals/python/soma-fracoes`) com reward 1.0, custo $0,0017, 63,5s.

### 10.6 Critérios
Um critério reutilizável que um juiz LLM usa pra avaliar uma run: `name` (identificador),
`description` (pergunta objetiva), `guidance` (instrução detalhada, incluindo o que conta
como PASS/FAIL/N-A). O template segue o formato real que o próprio Harbor usa internamente
(achado em `harbor/analyze/prompts/analyze-rubric.toml` do pacote instalado).

### 10.7 Conjuntos de critérios
Agrupa Critérios por checkbox — mesma relação Skill→Conjunto de skills. O Harbor chama esse
pacote de `rubric`; a GUI usa **Conjunto de critérios** para deixar clara a diferença entre uma
pergunta individual e o grupo reutilizável. O conteúdo é
serializado temporariamente por `serializeRubricToml` no schema exato que
`harbor analyze --rubric` espera; o cadastro e os inputs de uma execução permanecem no
registry e no snapshot do experimento, respectivamente.

### 10.8 Juízes

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
Harbor, `claude-haiku-4-5`), **instruções customizadas** (opcional) e **quais Conjuntos de
critérios marcar por padrão**. Esse vínculo aparece junto do modelo, antes do editor longo de
instruções, e a lista do juiz salvo mostra os nomes vinculados. Depois de cadastrado, escolha
esse Juiz no painel Analisar de **Novo experimento**, em **Análise avulsa**, ou no padrão de
uma Task.

Os conjuntos do Juiz são uma **pré-seleção**, não uma regra escondida. No Novo experimento e
na Análise avulsa, podem ser alterados antes de executar. Uma Task pode guardar sua própria
seleção, que substitui a pré-seleção do Juiz quando aquela Task é usada. No Compare, a sessão
de análise congela a escolha final do operador antes da primeira chamada, por isso editar o
cadastro depois não muda um lote em andamento.

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
`scripts/lib/materialize.ts`). O prompt é um insumo da chamada Analyze e o registro do
experimento preserva a definição usada. O textarea já vem preenchido com o texto padrão real do Harbor como template
editável — troque o que quiser, mas mantenha os marcadores `{trial_path}`, `{task_section}` e
`{criteria_guidance}` em algum lugar, porque é ali que o Harbor injeta o caminho do trial e a
orientação de cada critério; sem eles o juiz fica sem saber o que examinar.

### 10.9 Tasks

O assistente opcional **Spec de repositório + PR** prepara uma task a partir da base
histórica, requisitos Markdown e PR mergeado. Calibra checks sem LLM e reutiliza
Novo experimento. Receitas têm export/import próprio, sem credenciais ou código.
Veja o [guia completo](docs/REPOSITORIOS_E_HARNESSES.md).
Wizard fino sobre `harbor init --task`, **com editor de arquivos direto no navegador**
(instruction.md, Dockerfile, solve.sh, test.sh — `GET`/`POST /api/tasks/detail`). Templates
elaborados alinhados ao rubric de qualidade que o próprio `harbor check` usa
(`harbor/cli/quality_checker/default-rubric.toml`): tudo que os testes verificam precisa
estar na instrução, nunca copiar `tests/`/`solution/` pra dentro da imagem, dependência de
teste vai no `test.sh` (não no Dockerfile), a solução de referência precisa **demonstrar o
processo**, não só ecoar a resposta final ("hardcoded solution").

**Como usar**: preencha nome/org/output dir, clique **Criar task** — o editor abre sozinho
logo em seguida com os 4 arquivos prontos pra editar. **Salvar arquivos** grava direto no disco.
Uma linha da lista informa apenas se `task.toml` foi detectado; ela não chama a task de
"pronta", porque esse sinal não valida instrução, imagem ou teste. Se a task foi criada com
`--no-solution`, abrir e salvar o editor sem escrever uma solução preserva a ausência de
`solution/solve.sh`; digitar conteúdo passa a criá-lo. Trocar rapidamente de task invalida a
resposta atrasada da anterior, e **Salvar** só é habilitado quando o path e os padrões da task
visível terminaram de carregar.

O campo "Steps" do formulário de criação decide entre task de **um passo só** (0, o normal —
1 `instruction.md` + 1 `test.sh`) e task de **N passos sequenciais** (gera
`steps/step-1/`, `steps/step-2/`, ... — cada um com sua própria instrução e teste, rodando em
ordem; se um passo falhar, os seguintes são pulados). Use N>0 só quando a task modela um fluxo
de várias etapas dependentes entre si.

**Juiz e conjuntos de critérios padrão da task**: o editor também tem "Juiz padrão desta task"
(dropdown de Juízes) e "Conjuntos de critérios padrão desta task" (checkbox, pode marcar
**vários conjuntos**, não só um; escolher um Juiz pré-marca os padrões dele aqui, ainda
editáveis). Isso não roda
nada sozinho — é só um "lembrete pinado": quando essa task é usada numa run do Compare, o
painel Analisar já abre com esse Juiz e esses conjuntos pré-selecionados, prontos pra clicar em
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

**Concorrência** controla quantos processos Harbor de candidatos o kit inicia ao mesmo tempo.
Não é uma contagem direta de trials: cada processo Harbor pode paralelizar tasks internamente.

A tabela de resultado também traz `durationSec`, `custo agent (USD)` e `tokens in/out` lidos
direto de `stats.cost_usd`/`n_input_tokens`/`n_output_tokens` no `result.json` que o próprio
Harbor grava — ver seção 11 pra detalhes de onde vem cada número.

Depois do resultado: botão **Ver trajetórias** (abre `harbor view` já no jobs-dir certo) e um
painel opcional **Analisar** por linha (ou "Analisar todas") usando um **Judge** +
**um ou mais Conjuntos de critérios** (checkbox — cada um marcado dispara uma chamada de análise
separada, os resultados aparecem empilhados, cada um com o custo daquela análise). Antes do
lote, a GUI cria uma sessão de análise (`POST /api/analysis-sessions`) que congela o adaptador,
modelo, prompt e todos os conjuntos escolhidos. Cada chamada do lote leva esse ID, então edições
posteriores no cadastro não alteram a análise em andamento; o ID também fica persistido junto
ao resultado. **Análise avulsa** também cria uma sessão antes de percorrer os conjuntos marcados,
para que todas as chamadas daquele clique usem os mesmos conteúdos e modelo.
Se a task
rodada tiver Juiz/conjuntos guardados (seção 10.9), o painel já abre com eles pré-selecionados —
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

Aba **Configuração**. Agentes, Modelos, Skills, Conjuntos de skills, Critérios, Rubrics do juiz e Juízes vivem em
`~/.harbor-eval-kit/`, por máquina — sem isso um time não versiona essa configuração em git nem
revisa em PR. **Exportar** baixa um `.json` com todas as registries (`GET /api/config/export`);
**Importar** aplica um bundle (`POST /api/config/import`, `scripts/lib/bundle.ts`).

**Nunca inclui secret** — um Model é só `label` + `provider/modelo`, nunca uma chave. Antes de
devolver o bundle, iniciar uma resposta de relatório ou gravar um relatório local, o guard
fail-closed percorre campos e textos aninhados, procurando valores de secrets conhecidos, nomes
de arquivos sensíveis e padrões de credencial. Ao detectar suspeita, recusa a operação antes
dos headers ou dos bytes do arquivo; o contrato é coberto por `export-safety.test.ts` e
`export-route-security.test.ts`.

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
Ao reabrir, a tabela restaura a avaliação do juiz (incluindo 100% ou 0% PASS) e cada análise
volta em formato legível por trial/check; o JSON completo fica recolhido em detalhes técnicos.
Resultados de validação, checks desconhecidos e trials incompletos aparecem como sem nota e não
entram num ranking como se fossem avaliações completas.
`scripts/lib/experiment-store.ts` é o único responsável por preparar os snapshots: copia tasks,
Skills e instruções autorizadas para a execução e calcula automaticamente o SHA-256 de cada
arquivo. Alterações posteriores nos cadastros não mudam esse registro.

Commit Git e digest de dataset/imagem **não são metadados capturados automaticamente** pelo kit;
quando forem necessários, o operador deve registrar ou fixar esses valores no próprio fluxo.
Isso preserva os inputs locais, mas não congela o comportamento do provider nem o conteúdo de
imagens remotas sem digest. Reiniciar o servidor não retoma automaticamente processos.

Os diretórios de candidatos têm nomes curtos (`prefixo-runId-cN`) para preservar margem no
limite de caminho do Windows. O `experiment.json` mantém o agente, modelo e conjunto de skills
completos usados na linha, então essa informação continua legível na GUI e na CLI. O
planejamento verifica também um caminho representativo de trial/artefatos antes de preparar
qualquer trial; se exceder o limite conservador, informa para encurtar `jobs-dir` ou a task.

Os relatórios podem ser baixados em JSON ou CSV pela área **Novo experimento**. A mesma guarda
fail-closed é aplicada ao conteúdo do relatório antes de iniciar a resposta HTTP ou gravar os
arquivos locais; ela também cobre texto de erro, saída do juiz e estruturas aninhadas. O
exportador CSV neutraliza células que começariam com `=`, `+`, `-` ou `@`, para que abrir o
arquivo numa planilha não interprete texto de resultado como fórmula. Isso detecta os padrões e
valores conhecidos no momento da exportação; não substitui a revisão de artefatos externos que
o operador escolha compartilhar.

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
próprio Compare durante a run. Ele mostra primeiro o `stdout`/`stderr` capturado pelo kit e,
assim que existir um job real, passa a acompanhar também os arquivos do Harbor. Esta aba lê os
arquivos persistidos do job — inclusive depois que terminou e para runs iniciadas pelo CLI.
Um dry run ainda mostra a saída capturada no Compare, mas pode não criar um job para listar aqui.

**Como funciona**: três rotas somente-leitura — `GET /api/logs/jobs` (lista os jobs, marcando
com `▶` o que ainda está rodando, lido do `finished_at: null` no `result.json` do próprio
job), `GET /api/logs/files` (os `.log`/`.txt` daquele job) e `GET /api/logs/tail`
(incremental por byte offset, então cada poll traz só o que é novo; teto de 200 KB por
resposta). Polling de 2s, e só enquanto a aba está visível. Os dois segmentos de caminho
(`job` e `file`) passam por `safeJoinUnderDir`, então um valor forjado não sai do jobs dir —
testado com `../../../../secrets.env`, que retorna 404.

Cada leitura fica vinculada à combinação exata de pasta, job e arquivo que a iniciou. Há no
máximo um tail em voo; se o usuário trocar a seleção enquanto a resposta anterior demora, ela
é descartada e uma nova leitura usa offset zero. Assim, jobs com o mesmo nome em pastas
diferentes não misturam seus logs.

**Diferença pra Trajetórias**: lá é a trajetória estruturada do agent (turnos, ferramentas,
edições) no viewer do Harbor; aqui é o log cru de execução, incluindo build da imagem e
instalação do agent — que é onde falha de container/rede/dependência aparece.

### 10.12 Trajetórias
**O que é**: um segundo servidor web, do próprio Harbor (`harbor view`, não desta GUI), que
mostra passo a passo tudo que o agent fez dentro do container numa run — comandos, arquivos
tocados, saída de cada ferramenta, resposta do modelo a cada turno. É a evidência bruta atrás
do número de reward. **Quando usar**: depois de uma run do Compare, quando o reward sozinho
não basta — reward baixo e você quer ver onde travou, reward alto e quer confirmar que não foi
um atalho, ou só quer entender o estilo de trabalho do agent. Complementa o Analyze: Analyze
dá um veredito resumido de um LLM juiz; aqui você vê a trajetória inteira direto, sem
intermediário. **Como usar**: aponte pro mesmo jobs-dir da run (o botão "Ver trajetórias" no
Compare já faz isso sozinho) e clique **Iniciar visualizador**. A tela trava o início duplicado,
mostra tempo, estado e o log redigido enquanto o Harbor prepara o servidor. Quando a URL HTTP
local (`localhost`, `127.0.0.1` ou `::1`) fica pronta, ela aparece como link e a GUI tenta abri-la
numa nova aba; endereços externos ou de outro protocolo são recusados. O botão do Compare leva
para esse mesmo painel, já com a pasta correta. É um
processo de vida longa (fica escutando numa porta) até clicar **Parar** na lista abaixo; a lista
de viewers ativos é só em memória e não sobrevive a um restart do `gui-server` (os processos
continuam de pé, só a lista que esquece deles — pare manualmente se precisar).

### 10.13 Análise avulsa
Uso ad-hoc do `harbor analyze` num path específico, escolhendo um Judge já cadastrado. No
fluxo normal, use o botão **Analisar** direto na tabela de resultados de **Novo experimento**
(seção 10.10); esta área existe quando você já tem um path exato em mente.

O formulário separa dois caminhos que têm funções diferentes:

- **Path do job ou trial a analisar** é o input já existente que o juiz lê. Ele pode apontar
  para um job inteiro ou para um trial específico e não é movido pela análise.
- **Pasta de trabalho da análise** é o `jobsDir` passado à nova invocação, com padrão `jobs`.
  É onde o Harbor grava o job interno determinístico, seus logs e, ao analisar um job inteiro,
  o relatório agregado. Alterar esse campo não troca o input analisado.

Use uma pasta de trabalho explícita quando quiser que o job interno fique ao lado de um conjunto
de jobs já organizado. O cartão persistente mostra separadamente o alvo, a pasta de trabalho,
o nome do job interno e o caminho final do artefato; use esses valores, sem deduzir um caminho a
partir do outro.

Ao escolher o Juiz, todos os Conjuntos de critérios padrão dele são pré-marcados e continuam
editáveis. Cada conjunto marcado produz uma chamada paga separada e um bloco de resultado
próprio; sem marcação, a chamada usa os critérios nativos `reward_hacking` e
`task_specification` do Harbor. Antes da primeira chamada, a GUI cria uma sessão que congela
juiz, modelo, prompt e o conteúdo de todos os conjuntos marcados. Assim, uma edição em outra aba
durante o processamento não muda as chamadas seguintes daquele clique.

A resposta é mostrada como resumo de checks e custo reportado, seguida dos trials com badges
PASS/FAIL/N-A/desconhecido e explicações; o JSON bruto fica em **Detalhes técnicos**. Modo
validação recebe badge explícito e não vale como avaliação. Um trial sem checks completos gera
aviso persistente e nenhuma nota é calculada. A operação trava o botão, mostra o tempo decorrido
e não dispara uma chamada automática depois de salvar credenciais.

Cada chamada também cria um cartão persistente de operação com o path analisado, pasta de
trabalho, estado, log incremental, caminho do artefato e atalho para abrir o job interno na aba
**Logs** quando esse diretório realmente existe. O nome de invocação permanece na auditoria; se
o diretório `<jobsDir>/<harborJobName>` tiver sido removido ou estiver ausente, o atalho fica
oculto e o `operation.log` continua disponível. Enquanto a
operação estiver ativa, recarregar a página retoma esse acompanhamento pelo registro em disco; os
oito cartões mais recentes também são reconstituídos após o término. Se o POST original se perder,
o resultado concluído é reexibido a partir desse registro. O mesmo
acompanhamento aparece nas análises iniciadas em **Novo experimento**.

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
incluindo DeepSeek V4 Pro e Claude Opus 5 no conjunto `teste-live`,
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

**Um resultado pode ser analisado por vários Conjuntos de critérios ao mesmo tempo.** O painel
Analisar (seção 10.10) aceita marcar mais de um conjunto; antes do lote, a sessão congela modelo,
adapter, prompt e todos os conjuntos. `analyzeRow` faz **uma chamada `POST /api/analyze` por
conjunto** (sequencial, não em paralelo), cada uma gerando seu próprio `analysis.json`/veredito,
exibidos empilhados sob o nome do conjunto. O `passRate`
usado pra ordenar soma pass/aplicável de **todos** os conjuntos analisados naquele resultado —
então rodar 2 conjuntos (ex.: "Python Quality" + "Reward Hacking Check") sobre o mesmo job conta
os critérios dos dois juntos, não substitui um pelo outro. Se nenhum rubric for marcado, cai
no rubric padrão do próprio Harbor (`reward_hacking` + `task_specification`).

O parser mantém **todos os trials** retornados pelo Harbor e só aceita um resultado concluído
(`finished_at`) com contagens consistentes. Cada critério de cada trial conta separadamente:
`passRate = pass / (pass + fail)`; N/A e outcomes desconhecidos são contabilizados à parte.
Trial sem checks completos impede o ranking do lote — não vira zero nem aprovação. Reanalisar
mantém o histórico, e `validationMode`, modelo, adapter e `analysisSessionId` acompanham os
registros persistidos.

O servidor recusa análises sobrepostas para o mesmo job/trial enquanto já existe uma análise
ativa naquele processo (`scripts/lib/analysis-lock.ts`). Esse bloqueio é local ao servidor e
não coordena processos em máquinas ou instâncias diferentes.

Pra não ter que marcar isso toda vez: uma Task pode guardar um Juiz + conjuntos de critérios
(seção 10.9) — o painel Analisar detecta que a run atual usou aquela task e já vem com esse
Juiz e esses conjuntos pré-selecionados, sem rodar nada sozinho (o clique em "Analisar"
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
                               podman, managed-runtime, gui-lifecycle, harbor-cli, experiment-plan,
                               experiment-store, results, types, catalog, paths, naming, exec,
                               secrets, materialize, joblogs, tasks, litellm, cost, bundle e
                               harbor.ts (superfície pública). O experiment-store prepara os
                               snapshots e hashes; materialize atende somente os arquivos
                               temporários necessários a rubrics/prompts do Analyze.
scripts/gui-server.ts         servidor HTTP; delega rotas de experimentos e repositórios
scripts/repository-routes.ts  endpoints de receitas, preparação e conexões CLI
scripts/lib/repository-*.ts   aquisição, snapshots, calibração e materialização
scripts/lib/reference-evidence.ts  pacote de diffs do juiz, sem árvore/trajectory
scripts/lib/harness-*.ts      bindings locais, capacidades e proteção de sessão
scripts/templates/repository-verifier.py  checks não root no verifier sem rede
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
scripts/test.sh/.ps1          roda a suíte Node, checker de imports e scan de credenciais
scripts/scan-secrets.sh       detector de credencial (modo --staged usado pelo pre-commit)
scripts/setup-hooks.sh/.ps1   ativa .githooks/ neste clone (core.hooksPath)
scripts/check-imports.mjs     checa builtins/nomes usados sem import e ciclos (backend + GUI)
scripts/lib/*.test.ts         testes unitários (node:test, sem framework), incluindo catálogo,
                               probe, gateway, custo, bundle e templates
scripts/python/test_*.py      contrato Python offline; exige ambiente com harbor==0.22.0
docs/PENDENCIAS.md            próximos passos, escrito pra qualquer agente pegar (não só Claude)
docs/INSTALACAO_MANUAL.md     instalação/operação por Windows, Git Bash, macOS e Linux rootless
.githooks/pre-commit          bloqueia commit que contenha credencial
.gitattributes                fixa LF nos .sh (CRLF quebraria o hook num clone Windows)
.claude/skills/               skills de projeto: ship-change, secret-guard, cross-platform
docs/ENGENHARIA.md            padrões de engenharia e o incidente que originou cada regra
docs/screenshots/             imagens usadas no README.md
scripts/python/probe_provider.py  probe explícito de descoberta/teste de provider (Credenciais)
```


Para specs longas, configure o prazo em horas na receita de repositório e no juiz
(padrão 8 h por agente; sem teto fixo de horas). As operações não são encerradas por
um timeout externo de poucos minutos. Para consultar repos/PRs privados, use
**Credenciais → Acesso ao GitHub** com o login local do `gh`; consulte o
[guia de acesso e SSO](docs/ACESSO_GITHUB.md). Tokens nunca entram no catálogo/export.
