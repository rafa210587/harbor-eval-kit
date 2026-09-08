# Contratos de reconstrução — runtime e propriedade

Baseline auditada em 2026-09-08, baseada em `scripts/lib/{installation,podman,podman-smoke,cleanup}.ts`, `scripts/installation.ts` e `scripts/python/harbor_eval_kit/{managed,ownership}.py`. Não executa nem certifica hosts. Instalação e READY dependem também do runbook; presença de executável não é prontidão.

## Manifesto e transações

Snapshot v1 grava schema_version, created_at ISO, host `{platform,machine}`, preexisting, installed_by_kit, managed_resources e notes. preexisting possui `{present:boolean,path:string|null}` para podman, python, python3, py, uv, java, javac, mvn, gradle, node, npm, npx, harbor. managed_resources possui arrays containers/images/volumes/networks. Snapshot é criação exclusiva; instalação repetida valida o existente e não substitui descoberta original.

`mark` aceita somente harbor/uv, exige executable encontrado e preexisting[tool].present===false; grava `{installed:true,path,recorded_at}`. Não reivindicar ferramenta sem snapshot ou preexistente. Busca executável usa PATH e, no Windows, extensões vazia/.exe/.cmd/.bat. Manifesto inválido recusa. Esquema atual valida campos essenciais, não é schema JSON profundo de toda entrada; reconstrução não deve inventar permissões de remoção de campos ausentes.

Node e Python compartilham `<manifest>.runtime-lock` exclusivo modo0600, tentativa a cada50ms até30s. Reload acontece dentro do lock; update escreve temp exclusivo e substitui via rename/replace; finally remove lock. Lock abandonado não é apagado automaticamente após timeout: operador inspeciona processo primeiro. Python reserva `{name,jobPath}` antes de criar recurso, depois registra id; reserva duplicada ou ID divergente recusa. Prova estrita de runtime exige nome exato normalizado, label e id reconciliado no manifesto.

## Resolução e gates Podman

Resultado `{platform,dockerHost,connectionName,machineName,podmanUri,source}`. Ler `podman system connection list --format json` e `podman machine list --format json`. Campos JSON são reconhecidos sem distinção de caixa. Mais de uma conexão default recusa; selecionar pares máquina/conexão por nome da máquina ou `<nome>-root`; preferir par default único, senão exigir par único. Não adivinhar entre múltiplos.

Windows/macOS exigem máquina running. Windows usa `npipe:////./pipe/docker_engine`; macOS usa `ConnectionInfo.PodmanSocket.Path` da máquina inspecionada como unix://. Linux usa máquina quando houver running; senão Host.RemoteSocket.Path de `podman info --format json` como rootless. Falha de machine list só é tolerada no Linux.

Gate read-only: info da conexão selecionada, GET `/version` no socket com timeout5s, HTTP200 e identificação Podman por header libpod-api-version ou corpo; depois `podman compose version` e `podman compose up --help`, exigindo flags --wait e --pull. DOCKER_HOST é passado ao filho Compose; nunca substituir daemon por Docker. Estes gates não iniciam máquina e não criam recursos.

CLI interna: `node scripts/installation.ts snapshot|mark|gate|smoke <manifest> [harbor|uv]`. HARBOR_EVAL_PREFIX/LABEL diferentes dos valores oficiais são recusados. Wrappers públicos permanecem pareados `.sh`/`.ps1` com install/doctor/uninstall --dry-run. Oracle real é etapa de runbook antes de READY; os wrappers atuais não implementam uma certificação automática completa, conforme plan.md.

## Adapter gerenciado e limites suportados

Integração obrigatória em `managed-runtime.ts`/`exec.ts`: comando run troca env docker por `harbor_eval_kit.managed:ManagedPodmanEnvironment`; analyze mantém alias docker e executa Python do ambiente uv do Harbor com `-m harbor_eval_kit.cli analyze ...`. Outros comandos não são modificados. Reconhecer --env/--environment/-e separados, inline ou -edocker; recusar ambiente duplicado ou externo. Acrescentar --env se ausente. Exportar HARBOR_EVAL_MANIFEST (override do processo ou stateDir/installation-manifest.json) e prefixar PYTHONPATH com scripts/python, preservando PYTHONPATH herdado. Execução real cria snapshot se manifesto ausente, valida existente e roda gates; --print-config pula criação de manifesto/gates reais. DOCKER_HOST e CONTAINER_CONNECTION resolvidos pertencem ao filho.

Bootstrap Python de analyze verifica Harbor0.22.0 e contrato original do registry DockerEnvironment (módulo harbor.environments.docker.docker, classe DockerEnvironment, pip_extra=None), substitui somente entrada em memória por ManagedPodmanEnvironment e restaura em finally. Aceita somente analyze e alias docker. Não modificar pacote Harbor instalado nem criar alias global; falhar se contrato upstream mudar.

Exigir Harbor exatamente0.22.0 no preflight, Podman no PATH, info/Compose funcionais e HARBOR_EVAL_MANIFEST válido. Gerar namespace `harbor-eval-kit-<24hexUUID>`; container `<namespace>-main`, imagem `-image`, network `-network`. Label `io.harbor-eval-kit.managed=true` em todos os próprios. trial contém managed-compose.json; overlay de ambiente grava somente referências `${NOME}`, valores no ambiente filho, não em arquivo/argv. Redigir output por valores de env cujos nomes contêm KEY/SECRET/TOKEN/PASSWORD.

Suporte atual: Linux, serviço único, rede public, mounts gerenciados por Harbor. Rejeitar SO diferente, políticas restritas por fase ou globais, docker-compose.yaml de task ou extra_docker_compose antes de criação. Imagem prebuilt deve existir localmente, ser Linux e não declarar volumes anônimos. Build usa --pull=never --layers=false --force-rm e label, Compose up acrescenta --no-build --pull never. Bases preexistentes não viram propriedade do kit.

Análise conservadora de Dockerfile: exigir FROM, resolver aliases de estágios, ignorar scratch e deduplicar bases externas. Recusar FROM dinâmico com `$` ou opção --platform, VOLUME, ADD remoto HTTP/git@, COPY/RUN com from externo a estágios ou índice numérico. Verificar cada base local antes de construir. Não anunciar suporte genérico a todo benchmark Harbor: topologias recusadas são limites explícitos.

## Smoke e cleanup auditável

Smoke exige imagem **preexistente** docker.io/library/alpine:3.20; não faz pull oculto. Nome `harbor-eval-kit-doctor-<UUID>-<tipo>`, registrar intenção de4 recursos antes de criar. Construir imagem, volume/network labelados e container; comprovar arquivo de build, env sintético, leitura bind host→container, escrita container→host e escrita/leitura volume. Descobrir exatamente4 recursos, registrar IDs e executar plano limitado a esses recursos sem remover dependências; redescobrir após cada remoção para verificar efeito. Falha deixa propriedade registrada para cleanup; diretório temporário somente removido após verificar pai real esperado.

Cleanup planeja tudo antes da primeira mutação. Descobrir todos os IDs via ps -aq --no-trunc, images -q --no-trunc, volume/network ls -q; inspecionar cada ID, exigir array de um item e nomes válidos. Ordem: containers, volumes, networks, images. Normalizar `/` e `localhost/`; imagens podem casar :latest. Recurso relacionado por prefixo **ou** label **ou** manifesto só pode ser removido se cumprir os três. Todos os nomes/tags devem ter prefixo. Qualquer ambiguidade aborta plano inteiro, não apenas pula um item.

Actions são `{command,args}`: podman rm -f ID, volume rm ID, network rm ID, rmi ID. Recursos alheios não geram ação. Estratégia de uninstall aceita Harbor somente se instalado pelo kit, inexistente antes e realpath do executável coincide com manifesto; ação `uv tool uninstall harbor`. Podman/preexistentes preservados. uv é preservado porque footprint do instalador não foi completamente registrado; outro tool marcado instalado sem estratégia verificada aborta.

Execução grava uninstall_audit[] com id, started_at, plan, completed[], status running/complete/failed, finished_at. Primeira falha interrompe sequência; cada sucesso entra em completed; remoção Harbor marca installed=false. Não persistir output externo potencialmente sensível no audit. Dry-run exibe exatamente actions/preserved e não executa. Diferença intencional: prova do adapter é exata por nome+ID; cleanup também aceita entradas legadas string/nome. Não enfraquecer a prova do adapter para igualar formatos legados.

## Receita mínima de aceitação

1. Fixture de snapshot vazio → instalação repetida não muda preexisting; marcar ferramenta antiga falha; lock ocupado expira preservando manifesto.
2. Matriz fixtures Windows/macOS/Linux: conexão única/default/ambígua; endpoint Docker genuíno deve ser recusado; Compose sem --wait ou --pull falha.
3. Manifesto e discovery com apenas prefixo, apenas label, ID trocado, tag alheia adicional, Harbor em outro realpath: plano recusa sem executor chamado. Plano íntegro remove ordem exata; erro da segunda ação registra só primeira concluída.
4. Dockerfiles com volume/dynamic FROM/externo em COPY e task multisserviço/rede restrita falham antes da criação; imagem base permanece preexistente.
5. Separadamente, executar smoke+Oracle no host alvo e registrar SO/versões/conexão/efeitos de limpeza. Testes com mocks não dão READY.

Auditoria: as specs originais não diziam como reconciliar IDs, selecionar socket, validar identidade da API, calcular conjunto de exclusão ou recusar topologias. Estes contratos fecham essas omissões documentais. Não resolvem suporte ainda inexistente a redes restritas/multisserviço, remoção automática de uv ou certificação dos três SO; AWS segue apenas documentação.
