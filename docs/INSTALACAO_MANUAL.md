# Instalação e operação manual

Para instalação assistida no Claude Code, use `/harbor-setup` conforme o
[guia de instalação com Claude](INSTALACAO_CLAUDE.md). Este documento é o fallback
manual e a referência dos comandos por sistema operacional.

Este guia leva um clone novo até uma avaliação local com Harbor 0.22.0 e Podman. O kit nunca
instala nem chama Docker Engine. Os comandos `status` são somente leitura; `doctor` executa um smoke
que cria e remove recursos próprios.

## Pré-requisitos comuns

- Git;
- Node.js 24 ou superior;
- Podman CLI e, em Windows/macOS, uma Podman machine criada;
- um provider para `podman compose` cujo `compose up --help` ofereça `--wait` e `--pull`;
- `uv`, ou permissão para o wrapper Bash instalá-lo no perfil do usuário;
- as imagens base das tasks já presentes no storage Podman. O doctor exige
  `docker.io/library/alpine:3.20`; a task `soma-fracoes` exige `python:3.13-slim`.

O kit não baixa imagens implicitamente: um pull cria um artefato fora do namespace gerenciado.
Peça ao responsável pela máquina para pré-provisionar as imagens aprovadas e registrar origem,
tag e digest. O doctor usa `--pull=never` e preserva essas imagens preexistentes.

Clone e entre no projeto:

```bash
git clone https://github.com/rafa210587/harbor-eval-kit.git
cd harbor-eval-kit
```

Ative o scanner local uma vez:

```bash
bash scripts/setup-hooks.sh
```

## Windows PowerShell

Confirme os pré-requisitos e crie a máquina apenas no primeiro uso:

```powershell
node --version
podman --version
podman machine init
podman machine start
```

Se a máquina já existir, ignore o erro de `machine init` e execute somente `machine start`.
Depois rode a instalação e os gates:

```powershell
pwsh -NoProfile -File scripts/harbor-eval.ps1 install
pwsh -NoProfile -File scripts/harbor-eval.ps1 doctor
```

O resolver lê `podman system connection list`, seleciona a máquina associada à conexão efetiva
e valida `npipe:////./pipe/docker_engine`. O valor entra apenas no processo filho. O nome da
conexão deve ser exatamente o nome da machine ou `<machine>-root`; uma conexão customizada sem
essa correspondência deve ser substituída por uma conexão padrão com um desses nomes. Colisões
entre nomes possíveis são recusadas como ambíguas.

## Windows Git Bash

Use o mesmo Podman/Node nativos do Windows. A ramificação de SO ocorre no helper Node, portanto
Git Bash não cai no procedimento Linux:

```bash
node --version
podman --version
bash scripts/harbor-eval.sh install
bash scripts/harbor-eval.sh doctor
```

O lifecycle também é executado pelo Node. Ao parar a GUI no Windows, ele enumera processos
nativos e chama `taskkill` somente depois de confirmar executável Node, caminho absoluto do
`gui-server.ts` neste clone e porta.

## macOS

Inspecione primeiro a instalação, sem modificar recursos:

```bash
podman --version
podman machine list --format json
podman system connection list --format json
podman compose version
```

Se ainda não existir uma máquina, crie-a com `podman machine init`. Inicie a máquina
existente selecionada com `podman machine start NOME_DA_MAQUINA`; se já estiver
rodando, não repita init/start. Substitua o nome pelo retornado em machine list.
Confirme `podman info` antes do bootstrap:

```bash
podman info
bash scripts/harbor-eval.sh install
```

O nome da máquina não é presumido: a conexão efetiva seleciona o nome passado a
`podman machine inspect`. O socket retornado vira `DOCKER_HOST=unix://...` apenas nos filhos.
Este ramo possui testes offline de resolução, mas ainda requer um smoke real em hardware macOS.

`install` já executa os gates e smoke do doctor; não precisa repetir imediatamente.
Para diagnosticar uma instalação existente, use `bash scripts/harbor-eval.sh doctor`.
Se Compose não for encontrado ou faltar `--wait`/`--pull`, o provider Compose precisa
ser provisionado conforme os requisitos abaixo; instalar só Podman não basta.

**Correção de 2026-09-08:** versões anteriores do kit chamavam `machine inspect`
com `--format json`, que imprime texto literal em vez do objeto JSON e impedia
resolver o socket no macOS. Atualize o clone. O comando correto é
`podman machine inspect NOME_DA_MAQUINA`, sem flag de formato. Detalhes e limites
de validação: [diagnóstico macOS](MACOS_VALIDACAO_2026-09-08.md).

## Linux rootless

Confirme que o serviço rootless responde. Em distribuições com systemd de usuário:

```bash
systemctl --user enable --now podman.socket
podman info
bash scripts/harbor-eval.sh install
bash scripts/harbor-eval.sh doctor
```

Sem systemd, use o mecanismo rootless documentado pela distribuição e só prossiga quando
`podman info --format json` reportar `Host.RemoteSocket.Path`. O kit não cria uma machine no
Linux automaticamente. Este ramo possui testes offline, mas ainda requer um smoke real em host
Linux.

## O que os gates comprovam

`doctor` preserva o snapshot inicial e executa, nesta ordem:

1. conexão Podman selecionada por nome;
2. GET `/version` no pipe/socket, recusando endpoint que não se identifique como Podman;
3. `podman compose version` e `podman compose up --help` com `DOCKER_HOST` escopado ao filho;
4. build com `--pull=never --layers=false --force-rm` e label gerenciada, seguido de run, exec,
variável sintética, bind mount nos dois sentidos, volume, rede, labels e remoção confirmada.

O provider pode ser um plugin Docker Compose CLI já existente, usado por `podman compose`, sem
Docker Engine. Não instale Docker para satisfazer o gate. Versões de `podman-compose` que não
ofereçam `--wait` e `--pull` são incompatíveis com o lifecycle usado nesta versão.

Isso ainda não substitui a task mínima. O adapter
`harbor_eval_kit.managed:ManagedPodmanEnvironment` suporta nesta etapa uma task Linux de serviço
`main` único, Dockerfile ou imagem local prebuilt e rede pública. Ele bloqueia antes da criação:

- task Windows;
- Compose próprio ou múltiplos serviços;
- política de rede restrita;
- imagem base ausente, `FROM` dinâmico ou pull implícito;
- volume anônimo declarado pela imagem.

Tasks suportadas são executadas por `podman build` e `podman compose`; os recursos recebem
prefixo `harbor-eval-kit-`, label `io.harbor-eval-kit.managed=true` e reserva no manifest antes
da criação.

Analyze também executa uma task interna. O kit o inicia no Python isolado do Harbor com um
bootstrap em memória para usar o mesmo adapter gerenciado. A versão e o contrato do Harbor
são conferidos antes disso; nenhum arquivo do pacote instalado é alterado. O juiz exige a
imagem Python local mesmo quando a task original usa outra linguagem.

## Iniciar, consultar e parar

Os launchers ficam em primeiro plano. Para uso interativo, deixe o terminal aberto:

```powershell
pwsh -NoProfile -File scripts/start-gui.ps1
pwsh -NoProfile -File scripts/harbor-eval.ps1 status
pwsh -NoProfile -File scripts/stop-gui.ps1
```

```bash
bash scripts/start-gui.sh
bash scripts/harbor-eval.sh status
bash scripts/stop-gui.sh
```

`start-gui` é idempotente e inicia somente a máquina ligada à conexão configurada. `status`
consulta GUI, Harbor e Podman sem snapshot, smoke, container ou mudança de serviço. `stop-gui`
preserva qualquer processo alheio na mesma porta.

## Credenciais e primeira avaliação

Abra `http://127.0.0.1:4173`, cadastre a chave em **Credenciais** e nunca a coloque no repositório.
Ela fica em `~/.harbor-eval-kit/secrets.env` e entra somente no ambiente do processo Harbor.

Antes de gastar API, valide `evals/python/soma-fracoes` com `oracle` e depois com `nop`. O
resultado esperado é reward 1 para oracle e 0 para nop. Pela CLI:

```powershell
pwsh scripts/harbor-eval.ps1 eval -- --path evals/python/soma-fracoes --agent oracle --env docker
pwsh scripts/harbor-eval.ps1 eval -- --path evals/python/soma-fracoes --agent nop --env docker
```

```bash
bash scripts/harbor-eval.sh eval --path evals/python/soma-fracoes --agent oracle --env docker
bash scripts/harbor-eval.sh eval --path evals/python/soma-fracoes --agent nop --env docker
```

Os wrappers convertem `--env docker` para o adapter gerenciado, carregam secrets pelo executor
comum e devolvem o código de saída real do Harbor. Quando o wrapper instala Harbor com `uv`, ele
adiciona o diretório de binários de `uv tool` somente ao `PATH` daquele processo e confirma a
versão 0.22.0 e o Python isolado correspondente. Uma instalação preexistente de outra versão ou
fora desse ambiente é preservada e bloqueia a conclusão de `install` e do gate READY até ser
corrigida pelo responsável.

O executor força `PYTHONUTF8=1` e `PYTHONIOENCODING=utf-8` no subprocesso, inclusive quando o
host herdou valores conflitantes. Isso cobre tanto stdout/stderr quanto leituras Python sem
`encoding=` explícito, como `Path.read_text()`. Em 07/09/2026, um smoke local no Python isolado
do Harbor leu sem perda uma fixture com `mínima`, `padrão`, `Não` e emoji. A saída também é
decodificada antes de mascarar valores secretos, inclusive quando um caractere ou segredo
atravessa limites de chunks. Em timeout ou cancelamento, encerra
somente a árvore derivada do processo que ele próprio iniciou: `taskkill /T /F` no Windows e um
snapshot PPID com `SIGKILL` nos descendentes no macOS/Linux. A limpeza posterior continua
dependendo das provas de propriedade do manifest.

## Atualização, reparo e backup

Antes de atualizar, copie para armazenamento seguro o diretório `~/.harbor-eval-kit/` e os
diretórios `.experiments/` e `jobs/` que queira preservar. O primeiro contém credenciais; não o
publique nem o coloque no Git.

Depois de atualizar o clone, mantenha Harbor em 0.22.0 e repita:

```bash
bash scripts/harbor-eval.sh doctor
bash scripts/test.sh
```

No PowerShell use os pares `.ps1`. Se um gate falhar, registre plataforma, conexão, endpoint e
comando exato. Não altere `DOCKER_HOST` globalmente e não instale Docker como correção.

## Remoção auditável

Veja a lista exata antes de qualquer remoção:

```powershell
pwsh scripts/harbor-eval.ps1 uninstall -DryRun
```

```bash
bash scripts/harbor-eval.sh uninstall --dry-run
```

Revise o manifest, prefixos, labels e identidades. Só então retire `-DryRun` no PowerShell ou
`--dry-run` no Bash. A limpeza
preserva dependências e imagens preexistentes e aborta quando a propriedade é ambígua.

Reservas, IDs de recursos e auditoria de remoção são atualizados por transação. Os escritores
Node e Python usam o mesmo arquivo `<manifest>.runtime-lock`, relêem o manifest depois de obter o
lock e fazem substituição atômica, preservando registros concorrentes. Se o lock continuar ocupado
por 30 segundos, a operação aborta; confirme primeiro se ainda existe um processo ativo antes de
tratar o arquivo como lock abandonado.
