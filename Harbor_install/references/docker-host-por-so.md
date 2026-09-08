# Resolver `DOCKER_HOST` para Podman, por sistema operacional

Referência compartilhada por `harbor-bootstrap` e `harbor-doctor`. Antes existia inline nos
dois, e as duas cópias já tinham começado a divergir — este arquivo é a fonte única.

## O problema

A execução local usa o adapter gerenciado do kit sobre Podman. A API compatível continua sendo
necessária para o Compose, mas **como chegar até ela muda por SO**. O kit não exige nem chama o
CLI `docker`. Nunca assuma que `alias docker=podman` resolve.

Detecte o SO primeiro (`process.platform` no Node, `uname -s` num shell POSIX,
`$IsWindows`/`$IsMacOS`/`$IsLinux` no PowerShell 7+) e siga o ramo correspondente.

## Windows

O padrão do CLI/SDK do Docker aponta para o pipe do Docker Desktop **mesmo com ele parado**, e
o erro resultante ("Docker daemon is not running") não tem nada a ver com o Podman, que está
saudável.

Depois de selecionar uma máquina em execução pela conexão efetiva de `podman system connection
list`, o kit valida o pipe nomeado compatível:

```
DOCKER_HOST=npipe:////./pipe/docker_engine
```

Esse nome é fixo, **não** derivado do nome da máquina. `podman machine inspect` reporta um pipe
*diferente*, dependente do nome da máquina, para a API nativa dele — esse **não** é o que serve
aqui.

Este é o único ramo com execução real ponta a ponta repetida.

## macOS

Não existe pipe do Docker Desktop para colidir, mas o Podman roda dentro de uma VM cujo socket
compatível depende do nome da máquina:

```bash
podman machine inspect <nome-selecionado> --format json
# DOCKER_HOST=unix://<caminho retornado>
```

## Linux

Podman rootless normalmente expõe a API direto, sem VM, e esse mesmo socket já fala o dialeto
compatível com Docker:

```bash
podman info --format '{{.Host.RemoteSocket.Path}}'
```

Use como está. Duas checagens antes de concluir:

- Resultado **vazio** significa que o caminho não foi resolvido — reporte BLOCKED, não siga.
- Se houver uma máquina Podman ativa (incomum no Linux, mas suportado), selecione-a pela
  conexão efetiva e passe seu nome explicitamente ao inspect, como no macOS.

## Regras que valem nos três

1. Injete o valor resolvido como `DOCKER_HOST` **escopado ao processo filho** `harbor`/`podman`
   sendo executado. Nunca exporte no shell do usuário, nunca escreva em arquivo de perfil.
2. Ao reportar BLOCKED, diga **a plataforma exata, o endpoint resolvido (ou que não resolveu) e
   o comando exato que falhou** — nunca um genérico "Docker não acessível".
3. Antes de criar recursos, prove três interfaces: `podman --connection <nome> info`, GET
   `/version` no socket/pipe com identidade Podman e `podman compose version` com
   `DOCKER_HOST` escopado ao filho.
4. Depois dos gates read-only, rode o smoke de primitivas e uma task oracle mínima real.

## Implementação canônica neste kit

Existe uma fonte única em `scripts/lib/podman.ts`:

- `resolvePodmanConnection()` resolve plataforma, conexão, máquina, URI Podman e `dockerHost`;
- `validatePodmanInterfaces()` executa os três gates read-only;
- os wrappers Bash e PowerShell delegam ao Node, inclusive no Git Bash sobre Windows.

O valor resolvido aparece em `GET /api/status` e na barra de status da GUI, que avisa
explicitamente quando não conseguiu resolver — em vez de falhar em silêncio.

## Honestidade sobre cobertura

O resolver e os gates CLI/API/Compose foram executados no Windows com Podman 6.0.2 em
2026-09-07. Os ramos macOS e Linux são testados por lógica, **sem** run real em hardware.
Diga isso ao reportar, em vez de implicar cobertura que não existe.
