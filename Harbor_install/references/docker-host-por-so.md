# Resolver `DOCKER_HOST` para Podman, por sistema operacional

Referência compartilhada por `harbor-bootstrap` e `harbor-doctor`. Antes existia inline nos
dois, e as duas cópias já tinham começado a divergir — este arquivo é a fonte única.

## O problema

A execução local do Harbor é orientada a Docker. Podman fala o dialeto compatível, mas **como
chegar até ele muda por SO**, e o padrão do CLI/SDK do Docker não aponta para o Podman em
nenhum deles. Nunca assuma que `alias docker=podman` resolve.

Detecte o SO primeiro (`process.platform` no Node, `uname -s` num shell POSIX,
`$IsWindows`/`$IsMacOS`/`$IsLinux` no PowerShell 7+) e siga o ramo correspondente.

## Windows

O padrão do CLI/SDK do Docker aponta para o pipe do Docker Desktop **mesmo com ele parado**, e
o erro resultante ("Docker daemon is not running") não tem nada a ver com o Podman, que está
saudável.

A máquina Podman expõe um pipe nomeado **fixo** para compatibilidade com o CLI/SDK do Docker:

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
podman machine inspect --format '{{.ConnectionInfo.PodmanSocket.Path}}'
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
- Se houver uma máquina Podman ativa (incomum no Linux, mas suportado —
  `podman machine list --format json`), aplique o mesmo tratamento do macOS.

## Regras que valem nos três

1. Injete o valor resolvido como `DOCKER_HOST` **escopado ao processo filho** `harbor`/`podman`
   sendo executado. Nunca exporte no shell do usuário, nunca escreva em arquivo de perfil.
2. Ao reportar BLOCKED, diga **a plataforma exata, o endpoint resolvido (ou que não resolveu) e
   o comando exato que falhou** — nunca um genérico "Docker não acessível".
3. Valide com uma task mínima de verdade, não só com `podman info`.

## Implementação canônica neste kit

Mantida em sincronia em três linguagens — reutilize em vez de rederivar:

| Linguagem | Arquivo | Função |
|---|---|---|
| TypeScript | `scripts/lib/harbor.ts` | `resolvePodmanDockerHost` |
| PowerShell | `scripts/harbor-eval.ps1` | `Resolve-PodmanDockerHost` |
| Bash | `scripts/harbor-eval.sh` | `resolve_podman_docker_host` |

O valor resolvido aparece em `GET /api/status` e na barra de status da GUI, que avisa
explicitamente quando não conseguiu resolver — em vez de falhar em silêncio.

## Honestidade sobre cobertura

Este kit foi construído no Windows. Os ramos macOS e Linux são testados por lógica (comandos e
campos de template corretos), **sem** run real em hardware. Diga isso ao reportar, em vez de
implicar cobertura que não existe.
