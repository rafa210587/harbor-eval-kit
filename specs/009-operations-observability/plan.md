# Plano — operações e observabilidade

Baseline retrospectiva, contratos lidos no código em 2026-09-08. Nenhuma chamada
paga, container ou AWS é necessária para reconstruir os contratos offline.

## Persistência e transições

`OperationRecord` contém `version:1`, `id` UUID, `type:analyze|view`,
`status:starting|running|succeeded|failed`, `createdAt`, `updatedAt`, `targetPath`,
`jobsDir`; opcionais `finishedAt`, `harborJobName`, `artifactPath`, `error`, `result`.
Diretório `~/.harbor-eval-kit/operations/<id>/`, arquivos `operation.json` e
`operation.log`. UUIDs aceitos têm versão 1–5 e variante RFC; duplicata na criação
é 409. Estado usa arquivo temporário exclusivo e rename; log é append síncrono.
Atualização preserva id/version; o chamador controla transições e finishedAt.
Não existe validação de máquina de estados que proíba toda transição regressiva.

O writer alterna prefixos `[stdout]`/`[stderr]` ao mudar canal. Valores conhecidos,
inclusive representação JSON escapada, são substituídos por `[REDACTED]`. O executor
deve entregar chunks já tratados pelo redator de streaming: o scrub isolado de
um writer não protege segredo dividido em chunks. Leituras de operações redigem
novamente o JSON e usam tail com os segredos atualmente cadastrados.

`hasHarborJob` só é true se harborJobName resolver seguramente a diretório existente
sob jobsDir. `executionUncertain = status em {starting,running} e id fora do conjunto
ativo deste servidor`; PID gravado não concede propriedade.

## HTTP e arquivos

| Rota | Entrada/default | Resposta e erros |
|---|---|---|
| GET `/api/operations/:id` | offset=0, inteiro seguro não negativo | Registro + operationStatePath, operationLogPath, hasHarborJob, executionUncertain, log; offset inválido 400, ausente 404 |
| GET `/api/logs/jobs` | jobsDir=`jobs` | `[{name,mtimeMs,running}]`, mais recente primeiro; diretório inexistente retorna [] |
| GET `/api/logs/files` | jobsDir=`jobs`, job obrigatório | Caminhos relativos ordenados por mtime; sem job 400; caminho inválido/ausente [] |
| GET `/api/logs/tail` | jobsDir=`jobs`, job/file obrigatórios, offset=0 | LogTail; faltantes 400; arquivo proibido/ausente 404 |
| GET `/api/experiments/:id/logs/:candidateId` | jobsDir=`jobs`, offset=0 | experimentId, candidateId e LogTail; candidato fora do plano 404; log ainda inexistente retorna conteúdo vazio/offset 0 |

O tail comum exige inteiro seguro não negativo. A rota legacy `/api/logs/tail`
converte com `Number(value) || 0`, portanto texto inválido vira zero; a rota de
operações valida explicitamente antes do domínio. Não prometer uniformidade de
status HTTP para todos os parâmetros inválidos na baseline; padronização é dívida.

Logs nativos: `<jobsDir>/<job>/<arquivo>`; listar apenas diretórios não ocultos,
ignorar symlinks, descer até profundidade 3 inclusiva. Aceitar `.log`, nomes
stdout/stderr/test-stdout/test-output/reward/exception com prefixo opcional `agent-`
e extensão opcional `.txt`, além de `agent/<nome>.txt`. Não oferecer configuração,
JSON arbitrário ou secrets.env. `running` é exatamente `finished_at === null` no
result.json do job; arquivo ausente/malformado significa false, não sucesso.

Logs iniciais: `<jobsDir>/.experiments/<experimentId>/logs/<candidateId>.log`.
Criar com `wx` antes do spawn, IDs e fronteiras sem symlink. Reader desses arquivos
usa tail sem lista de segredos: a segurança depende da redaction antes da gravação.

`LogTail={content,nextOffset,size,truncated}`. Offset e size são bytes originais;
se offset ultrapassa tamanho atual, recomeçar em zero. Se exceder 200.000 bytes,
mostrar cauda e truncated=true. Ler contexto anterior de até maior segredo menos
um byte; mascarar matches com asteriscos de mesmo comprimento. Reter sufixos que
podem ser início de segredo e final UTF-8 incompleto, sem avançar nextOffset por
eles. Um segredo incompleto pode retardar a exibição até novo append.

`safeJoinUnderDir` rejeita absoluto, drive, controles, dois-pontos, componentes
vazios, `.`/`..` e symlink/junction da fronteira para baixo. Antecessores acima da
fronteira pertencem à configuração do host, p.ex. `/var` no macOS.

## Ciclo do viewer

POST `/api/view` exige jobsDir (400 se ausente), cria UUID/operação e executa
`harbor view <jobsDir>` com env preparado. Mantém handle apenas no servidor atual.
Retém últimos 16.000 caracteres de saída para descobrir URL HTTP(S) com hostname
localhost/127.0.0.1/[::1] e porta explícita 1–65535. Não aceitar endereço externo.
Retorna `{ok,id,url,status,error}` quando descobre URL, termina ou passam 8s;
starting sem URL retorna 200, failed retorna 500. Descoberta posterior muda running.
Erro de spawn e saída não solicitada (inclusive código zero) marcam failed.

GET `/api/view` retorna registros em memória `{id,url,jobsDir,status,error}`.
POST `/api/view/:id/stop`: desconhecido 404; já terminado remove registro/200;
senão solicita parada, aguarda exit ou 2s e só retorna ok quando exitCode/signalCode
confirma. Sem confirmação: 500. Exit solicitado fecha operação succeeded.
Windows termina árvore do handle via taskkill `/PID /T /F`, fallback child.kill;
Unix coleta descendentes por PPID, SIGKILL filhos e pai. Nunca selecionar por
nome de processo ou varrer portas para matar recursos alheios.

## Status e lifecycle da própria GUI

GET `/api/status` responde 200 com:

| Campo | Fonte e ausência |
|---|---|
| harbor.available | disponibilidade do executável Harbor |
| harbor.version | stdout de `harbor --version` trim, ou null se não disponível |
| harbor.testedVersion / versionMatchesTested | versão de contrato do catálogo / comparação com versão reportada |
| podman.available / version | exit zero de `podman --version`; stdout trim ou null |
| podman.infoOk | exit zero de `podman info` |
| podman.dockerHost | resolução de socket/API compatível Podman, null quando não resolvido |
| platform / stateDir | process.platform / diretório de estado configurado |
| litellmGateway.enabled | configuração do gateway, desativado por padrão |
| litellmGateway.baseUrl | quando enabled, hostBaseUrl ou containerBaseUrl; quando desligado null |
| litellmGateway.configPath | caminho local da configuração do gateway |

Executar consultas de versão/info em paralelo; status não instala software, cria
container, inicia máquina, ativa gateway nem devolve valores de credenciais. Harbor
de versão diferente é reportado, não recusado por esse endpoint. Disponibilidade
da GUI, saúde Podman e validação de compatibilidade completa são estados distintos.

`readGuiStatus(port)` faz somente GET `http://127.0.0.1:<port>/api/status`, com
AbortSignal de 1500ms. Resposta não-2xx, falha de rede, timeout, JSON inválido ou
forma incompatível => `{gui:"down",url}`. Forma aceita exige harbor e podman truthy
e platform/stateDir strings; então `{gui:"up",url,payload}`. Não é autenticação nem
prova de que responde o clone atual, e não valida saúde de cada dependência. Um
endpoint lento pode gerar down apesar de servidor vivo: nunca usar isso sozinho
para decidir matar listener. O timeout de 1500ms pertence ao cliente lifecycle,
não implica cancelamento dos subprocessos de status no servidor.

CLI `node scripts/gui-lifecycle.ts [status|preflight|stop] [--port N] [--root PATH]`
tem comando default status, porta default 4173 e root default raiz do script. Porta
deve ser inteiro 1–65535. Status imprime JSON. Preflight consulta status: se up,
imprime endereço e sai 20, código que launchers traduzem para sucesso sem spawn.
Se down, exige `harbor --version` e verifica `podman info --format json`. Se info
funciona, não faz start. Se falha no Linux, propaga erro; no Windows/macOS consulta
connections/machines JSON, seleciona máquina explicitamente configurada, executa
`podman machine start <nome>` e verifica `podman --connection <nome> info --format json`.
Não escolher VM arbitrária nem criar/instalar Docker. Ambiguidade e ausência de
máquina/configuração seguem os erros do domínio Podman; preflight não declara
READY para benchmark nem substitui doctor/smoke.

`scripts/start-gui.sh` e `.ps1` aceitam `--port N`/`--port=N`, exigem Node major>=24,
fazem preflight, mudam cwd para raiz e executam Node com caminho absoluto de
gui-server.ts repassando argumentos. Bash usa exec; PowerShell mantém foreground e
retorna exit code do Node. `stop-gui.sh [porta]` usa argumento posicional default4173;
`stop-gui.ps1 -Port N` usa parâmetro default4173. Ambos chamam CLI stop com root exato.
Não há daemon instalado nem janela background automática nesses wrappers.

Prova de identidade para stop: tokenizar linha de comando preservando aspas;
executável basename deve ser node/node.exe, segundo token deve ser caminho absoluto
`<root>/scripts/gui-server.ts`, e porta deve corresponder (--port=, --port ou default
4173). Normalizar separadores; no Windows comparar caminhos sem diferença de caixa.
Mencionar script em argumento de outro programa não é prova. Windows enumera via
PowerShell CIM ProcessId/CommandLine; Unix via `ps -axo pid=,command=`. Falha de
enumeração não autoriza fallback destrutivo. Zero matches: stop imprime que não
está rodando e retorna sem kill; mais de um: erro e nenhum escolhido.

Um match: Windows executa `taskkill /PID <pid> /F` (aqui sem /T, diferente do stop
de viewer); Unix envia SIGTERM ao PID. Verificar até 20 vezes a cada 100ms que
esse PID não aparece mais como processo identificado; só então confirmar parada.
Persistindo após aproximadamente 2s, lançar erro. Isso comprova desaparecimento
do servidor, não término de todos os viewers/jobs filhos: esses têm lifecycle
próprio. Nunca usar kill por porta/nome ou encerrar listener estrangeiro.

Fontes adicionais: `scripts/lib/gui-lifecycle.ts`, `scripts/gui-lifecycle.ts`,
wrappers start-gui/stop-gui em ambos shells. `gui-lifecycle.test.ts` contém fixtures
de identidade exata, parsing Windows/Unix, status sem mutação, seleção da máquina,
preservação de processo alheio e confirmação de parada. Não equivalem a testar
launch/stop real em três sistemas; esses gates permanecem separados.

## Integração visual e evidências

`operation-live.js` faz polling a cada 1s; guarda no localStorage `hek-active-operations`
os últimos oito descritores id/targetPath. Resultados persistidos podem ser renderizados
após recarga. 404 durante POST pendente é transitório; depois de recusa encerra o
monitor. Incerteza interrompe polling preservando descritor. Texto mostrado limita
200.000 caracteres (distinto do limite de bytes do servidor).
`viewer-live.js` mostra elapsed, trava lançar enquanto inicializa, valida URL também
no cliente, oferece link manual e abre uma vez com noopener; não relança processo
durante polling. Não há garantia de recuperar lista de viewers após restart.

Referências de implementação: `scripts/lib/{operations,joblogs,experiment-logs,viewer-process,exec,paths}.ts`,
`scripts/{gui-server,experiment-log-routes}.ts`, `gui/app/{operation-live,operation-domain,viewer-live,viewer-domain}.js`.
Testes existentes operations/joblogs/experiment-logs/viewer-process cobrem contratos
puros, redaction, UTF-8, symlinks e incerteza. A existência desses testes não comprova
novo stop real em cada OS nem jornada visual; registrar esses gates separadamente.
