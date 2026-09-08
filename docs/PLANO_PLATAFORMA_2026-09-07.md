# Plano de evolução da plataforma — 2026-09-07

## Estado e pedido

**Implementação concluída no escopo local, autorizada após a entrega do plano.** AWS permanece somente documental.
Base da auditoria: commit `92deb67`, com árvore limpa no início. A rodada anterior está concluída
em `PLANO_CORRECOES_2026-09-07.md`; este é um novo escopo, não a reabertura daquela entrega.

O usuário quer uma plataforma fácil de pilotar pela UI para avaliar e comparar **agentes,
modelos e skills** sobre Harbor. Pediu revisão de design, capacidades, README, guias e skills;
fallback manual completo; LiteLLM proxy preparado e desligado; Podman no Windows, macOS e Linux;
testes reais pela UI com dois modelos DeepSeek econômicos e juiz DeepSeek; commits locais.
Acrescentou: **AWS será corporativa, somente plano e menção no README**. Cada campo da UI deve
explicar o que faz e trazer dicas de uso.

Continuidade: [prompt para Claude](PROMPT_CLAUDE_PLATAFORMA.md).
Infraestrutura futura: [plano AWS corporativo](PLANO_AWS_CORPORATIVO.md).

## Avaliação do objetivo

A divisão atual é adequada: Harbor executa os trials e verificadores; o kit configura o
experimento, protege as entradas, acompanha resultados e organiza comparação e análise.
O domínio compartilhado de Compare, snapshots e histórico deve ser preservado. A próxima
refatoração deve completar os caminhos que ainda o contornam, sem trocar o framework da UI
ou reimplementar Harbor.

A oportunidade principal é transformar quinze abas de configuração em jornadas de uso.
Um iniciante deve conseguir escolher uma task pronta, dois modelos e um agente, revisar o
que vai rodar e executar sem entender diretórios internos, Compose ou o formato dos kwargs.
O usuário avançado continua tendo acesso a essas opções, com explicações e prévia efetiva.

## Evidências da auditoria

Referências abaixo são do commit-base; as linhas mudarão durante a implementação.

| Prioridade | Achado confirmado | Evidência / efeito |
|---|---|---|
| P0 | Ownership incompleto nas execuções normais do Harbor | `scripts/lib/experiment-runner.ts:45`, `naming.ts:53`, `podman-smoke.ts:18`. Prefixo, label e manifest cobrem o smoke próprio, mas não todos os recursos do Harbor. Renomear o job não basta: Harbor 0.22.0 gera imagens `hb__...` e projetos Compose próprios. Resolver antes de qualquer teste com containers. |
| P0 | Scanner pode terminar com sucesso sem ferramentas necessárias | Na auditoria, Git Bash sem PATH de login repetiu `grep: command not found` e saiu com 0. `scripts/scan-secrets.sh:77` precisa recusar dependências ausentes e erros do scanner. Um exit 0 sozinho não comprova a inspeção. |
| P1 | Entradas de execução divergem | `harbor-eval.sh:143` e `.ps1:116` chamam Harbor diretamente, sem o caminho comum de Secrets, UTF-8, telemetria e LiteLLM. Bash no Windows cai no ramo Linux; PowerShell precisa propagar falha nativa. |
| P1 | Diagnóstico e parada têm efeitos inesperados | `status` chama doctor e cria/remove recursos; `stop-gui.sh:30` e `.ps1:8` escolhem processo só pela porta. Separar status de smoke e verificar identidade antes de parar. |
| P1 | Compatibilidade Podman não é provada pelo socket descoberto | `exec.ts:68–84`: pipe fixo Windows; inspect sem selecionar máquina ativa no macOS; Linux sem confirmar API escutando. Smoke próprio não cobre bind mount/env sintética. CI dos três SOs é offline. |
| P1 | Judge DeepSeek falha na aba Analyze | `gui/app/misc.js:33` envia checkbox como string; `gui-server.ts:477` exige boolean. Botão também permite chamadas duplicadas durante a operação. |
| P1 | Configuração do juiz muda no meio de um lote | `compare-analysis.js:6–28`, `compare.js:177`: controles relidos durante execução. Congelar juiz/rubrics/modo e bloquear edição do lote. Editar judge em validação pode apagar modelo por filtragem (`judging.js:86–130`). |
| P1 | Template do verificador pode dar resultado enganoso | `tasks.js:114–132`: `set -e` pode sair antes de gravar reward=0; template sem teste efetivo pode gravar 1. Stub deve falhar explicitamente. |
| P1 | LiteLLM ON inválido se comporta como OFF ou perde a chave | `litellm.ts:61–90`, `exec.ts:125–129`: JSON inválido vira OFF, chave ausente vira vazia, secrets extras podem sobrescrever chave do proxy. Endereço localhost não tem o mesmo significado no host e no container. |
| P1 | Primeiro uso manual não corresponde às skills | README instala Harbor fora do manifest; guia detalhado é majoritariamente Windows; falta preparação coerente da imagem exigida no bootstrap; referência ainda altera DOCKER_HOST globalmente. |
| P2 | Reload de execução ativa perde controles | Histórico recebe `canCancel`, mas não reconecta log/cancelamento; polling antigo pode sobrescrever resultado novo (`compare.js:312–347`). |
| P2 | Ajuda e controles não refletem a configuração efetiva | UI sugere skills obrigatórias, descreve defaults como sempre aditivos, mostra `docker` editável e texto de implementação em destaque. Instruções do perfil são skills efetivas mesmo quando aparece “none”. |
| P2 | Modo compacto esconde avisos | `styles.css:120` oculta `.hint` inclusive aviso de gasto e marca de juiz em validação. |
| P2 | “Testar no modelo mais barato” não ordena preços | `harbor.ts:108–151` usa descoberta/lista, não tabela de preços. Separar descoberta de modelos do teste pago e mostrar exatamente o modelo escolhido. |

## Sequência de implementação

Cada etapa deve registrar arquivos alterados, testes, limitações e próximo passo. O plano
foi commitado antes das mudanças; a implementação integrada reúne UI, runtime e documentação
no commit de entrega, sem push e sem ignorar hooks.

| Etapa | Entrega | Aceite | Estado |
|---|---|---|---|
| 1. Base operacional | Ownership Harbor, scanner fail-closed, executor comum, status somente leitura e start/stop com identidade | Nenhum recurso sem propriedade comprovada; nenhum processo alheio interrompido; erro nativo propagado; scanner detecta ausência de ferramentas; fixtures preservam dados preexistentes | Implementada; ver registro de validação |
| 2. Instalação e portabilidade | Resolver único de conexão Podman; gates CLI/API/Compose; smoke completo; wrappers equivalentes | Windows/Git Bash, Windows/PowerShell, macOS e Linux têm procedimentos e testes; READY só com smoke real registrado | Implementada; ver registro de validação |
| 3. Correções funcionais | Analyze boolean/duplicidade/lotes; edição de judge; templates; reload ativo; polling obsoleto | Mesmos inputs durante lote; verificador escreve reward correto; recarregar recupera acompanhamento real; nenhuma chamada duplicada | Implementada; ver registro de validação |
| 4. Jornada e design | Começar, Compare guiado, prévia, ajuda por campo, resultados/histórico legíveis | Primeira comparação sem cadastros opcionais; diferenças efetivas explícitas; teclado e layout responsivo; avisos sempre visíveis | Implementada; ver registro de validação |
| 5. LiteLLM preparado | Configuração validada, env sem colisão, topologias host/container, instruções e rollback | OFF é no-op; ON inválido bloqueia antes da chamada; testes de contrato sem gasto; proxy permanece desligado | Implementada; ver registro de validação |
| 6. Documentação e skills | README revisado, instalação manual por SO, primeiro uso, receitas de eval, LiteLLM, skills alinhadas | Todo comando tem pré-requisito e resultado esperado; skills e manual seguem a mesma sequência; afirmações correspondem à validação | Implementada; ver registro de validação |
| 7. Validação do produto | Suíte offline, UI real, oracle/nop, DeepSeek Compare e juiz; evidências e commit | Artefatos e custos reportados registrados; histórico/exportação conferidos; limitações por SO explícitas | Implementada; ver registro de validação |

A ponte de ownership e o diagnóstico das etapas 1–2 precedem o primeiro smoke com containers.
A validação do ambiente e as correções da etapa 3 precedem chamadas pagas. O plano AWS é
apenas documental nesta rodada e não é dependência do uso local.

### 1–2. Operação e Podman

- Inspecionar as extensões suportadas pelo Harbor pinado: compose adicional/backend adapter.
  Implementar a menor ponte verificável dentro do kit, sem editar a instalação global do
  Harbor, instalar Docker ou depender de alias que subprocessos não enxergam.
- Predeclarar e conciliar containers, imagens, redes e volumes, inclusive builds/pulls
  implícitos. Prefixo `harbor-eval-kit-`, label `io.harbor-eval-kit.managed=true`, identidade
  e manifest são obrigatórios. Se não houver mecanismo seguro, bloquear antes da criação
  e registrar o recurso incompatível; não tratar recurso sem metadados como gerenciado.
- Preservar tasks originais. Qualquer overlay de infraestrutura só entra no snapshot,
  com diff/hashes registrados e comportamento equivalente entre candidatos. Nomes, IDs e
  paths de isolamento serão únicos; instruções, verificador, versões, limites e política
  de rede não podem mudar para favorecer um modelo.
- Resolver máquina/conexão selecionada, inclusive máquina macOS com nome não padrão;
  verificar que a API pertence ao Podman. Linux rootless precisa de socket ativo;
  Windows precisa tratar colisão de pipe. Invalidar cache quando o ambiente mudar.
- Separar status sem efeitos, doctor de diagnóstico e smoke explícito. Validar build,
  exec, bind mount com escrita/leitura, env sintética, rede, volume e cleanup efetivo.
- Bootstrap de clone novo precisa resolver a imagem pré-requisito respeitando as mesmas
  regras, e seguir snapshot → instalação faltante → gates → manifest final.
- Start idempotente identifica servidor existente; stop verifica processo, projeto e
  efeito. Ambos os wrappers delegam domínio a Node e mantêm sintaxe nativa por SO.

### 3–4. Interface e capacidades

**Navegação proposta:** Começar; Experimentos (novo/histórico); Catálogo (modelos, agentes,
skills, tasks e juízes); Ambiente e ajuda (credenciais, diagnóstico, importação, logs).
Reaproveitar as telas atuais agrupadas; não remover capacidades nem exigir um novo framework.

**Novo experimento:** escolher objetivo → escolher task/dataset → montar candidatos →
revisar plano/custo → executar e acompanhar. Modos “Comparar modelos”, “Comparar agentes”,
“Avaliar skills” e “Livre” preenchem o mesmo domínio. Duplicar candidato e marcar baseline
reduz repetição. Diferenças em mais de uma dimensão são mostradas claramente.

**Contrato dos campos, pedido explícito do usuário:** label em português, finalidade,
exemplo válido, padrão e indicação de opcional/quando ignorar. Ajuda curta junto ao campo,
detalhe adicional expansível quando necessário, ligada por `aria-describedby`. Defaults e
herança devem ser explicados com o valor efetivo. Alertas, erros, gasto, operação ativa e
marca de validação nunca somem no modo compacto. Evitar tooltip dependente de hover.

**Configuração avançada:** agrupar pasta de jobs, prefixo, concorrência e kwargs. Mostrar
Podman como ambiente operacional e explicar o nome interno do backend apenas na ajuda técnica.
Modelo e instruções de perfil devem ser explícitos na prévia; templates não devem inserir
instruções extras silenciosamente numa baseline “sem skills”.

**Resultados:** priorizar candidato, estado, reward, custo reportado e duração. Tokens,
checks, erros reais, nomes internos e inputs congelados ficam nos detalhes. “Não reportado”
não é zero. Separar falha do agente de falha de infraestrutura e validação de juiz de ranking.
Título/descrição opcionais, histórico identificável, CSV/JSON para baixar pela UI, reexecução
com novo ID. Reconectar execução ativa após reload; reinício do servidor sem processo
confirmado continua como atividade incerta, sem prometer retomada automática.

**Qualidade da avaliação:** informar task incompleta antes do gasto; oracle=1 e nop=0 na
task de smoke. Mostrar skills efetivas, repetições e compatibilidade conhecida agent/model.
Não chamar média simples de “melhor modelo” nem usar juiz barato de validação como prova.
Estatística avançada e calibração empírica ficam fora deste incremento.

**Design:** hierarquia visual clara, tipografia legível, botões primários consistentes,
menos colunas técnicas, estados vazios com ação para o próximo passo. Verificar temas,
foco/teclado, zoom e larguras de desktop/notebook/mobile; rolagem horizontal só nas tabelas.

### 5. LiteLLM

Preservar a distinção entre SDK usado pelos adapters e proxy opcional. O proxy fica **OFF**.
Config ausente/OFF não altera tráfego; ON inválido produz erro claro. Validar URL, nomes de
variáveis, placeholders e credencial necessária, recusando colisões de precedência.
Chave administrativa pertence ao gateway; clientes devem usar credencial de inferência.

Documentar quais adapters realmente recebem os envs, endereço visto no host e dentro do
container, TLS/rede corporativa e retorno ao modo direto. `127.0.0.1` dentro do container não
é o host. Validar contratos com endpoint local falso; integração com proxy real tem etapa
separada antes de ser declarada suportada. Não ativar proxy durante os testes DeepSeek desta
rodada. Fallback/cache que mudam o experimento devem ser desligados ou declarados como variável.

### 6. Documentação e skills

- README: proposta da plataforma, divisão Harbor/kit, capacidades atuais, primeiro uso,
  três receitas (modelos/agentes/skills), screenshot atual, compatibilidade com evidência,
  mapa de guias e plano AWS corporativo. Manter uma língua consistente por documento.
- Guia manual: Windows PowerShell e Git Bash; macOS Podman machine; Linux rootless.
  Dependências, clone, instalação, gates, iniciar/parar, credenciais, primeira comparação,
  atualização/reparo, backups e uninstall dry-run. Comandos copiáveis por SO, sem alterar
  DOCKER_HOST global nem exigir conhecimentos implícitos de agente.
- Revisar `DOCUMENTACAO.md`, `COMO_FUNCIONA.md`, `FLUXO_RUN_COMPARE_ANALYZE.md`,
  `PODMAN_COMPATIBILITY.md` e `PLANO_TESTES_UI.md` no lugar das passagens incorretas.
- Validar nove skills: bootstrap, doctor, up, status, down, eval-designer, eval-runner,
  result-analyzer e cleanup, suas referências e o roteamento no `CLAUDE.md`.
- Distinguir skills que configuram o kit das skills avaliadas nos experimentos.
  Explicar descoberta: runbook Markdown pode ser lido por qualquer agente, mas a pasta
  `Harbor_install/skills` não é automaticamente reconhecida por todos os clientes.

| Jornada | Skill | Fallback manual / prova exigida |
|---|---|---|
| Instalar | harbor-bootstrap | Mesma sequência de snapshot e gates; manifest; não substituir preexistentes |
| Diagnosticar | harbor-doctor | Checks e smoke diferenciados; comando e remediação no erro |
| Iniciar / consultar / parar | harbor-up, harbor-status, harbor-down | Wrappers equivalentes; status sem mutação; processo próprio e efeito verificado |
| Criar task | harbor-eval-designer | Editor ou arquivos; oracle/nop; stub nunca aprovado |
| Comparar | harbor-eval-runner | Receita GUI/CLI, uma dimensão variável, prévia, gasto, snapshot |
| Interpretar | harbor-result-analyzer | Todos os trials, erros e billing; judge opt-in e marca de validação |
| Remover | harbor-cleanup | Manifest → descoberta → dry-run exato → remoção → auditoria |

### 7. Testes reais pela UI

1. Antes de qualquer container: gates de ownership e ambiente da etapa 1–2. Executar oracle
   e nop sem API para validar a task e o caminho completo. Não remover recursos preexistentes.
2. Consultar novamente catálogo/preços oficiais e compatibilidade do adapter instalado.
   Seleção proposta: `deepseek-v4-flash` e `deepseek-v4-pro`, dois modelos de texto estáveis
   mais econômicos na tabela consultada em 2026-09-07. Há variante vision experimental
   empatada com Flash; ela não foi escolhida para este teste de coding. Revalidar no dia.
   [Tabela oficial](https://api-docs.deepseek.com/quick_start/pricing/).
3. Pela UI: cadastrar modelos e perfil `mini-swe-agent`; escolher `soma-fracoes`, uma
   tentativa e concorrência 1; fazer dry-run. A/B variam só o modelo; C repete A com uma
   skill adicional neutra. São três trials pagos, cobrindo modelos e ablação de skills.
4. Usar teto conservador de **US$ 1** na execução autorizada. Antes da execução, confirmar limite do adapter/provider
   e limitar passos/tokens; a guarda histórica é pré-voo, não hard cap. Não repetir runs
   indefinidamente; interromper novas chamadas quando o saldo do teto for insuficiente ou
   o gasto não puder ser acompanhado. Não comprar créditos nem ativar recarga automática.
5. Judge Flash, rubric curto, modo validação explícito: analisar A/B pelo Compare e cobrir
   Analyze standalone em uma chamada adicional somente se necessária. Congelar o lote,
   impedir clique duplo, manter aviso de validação e ausência de ranking de judge.
6. Testar pela UI de verdade: setup/cadastros, dicas, prévia, validações, execução, logs,
   reload durante execução, histórico, exportação e reabertura. Cancelamento pode usar
   fixture/oracle apropriado para não desperdiçar chamada paga. Não chamar teste API de clique.
7. Registrar IDs exatos, versões, data, host, arquitetura, task/hash, experimento/jobs,
   resultados, erros, tokens e custos reais reportados pelo Harbor. Billing ausente fica
   ausente; não substituir por cálculo de tabela. Separar gasto do agente e do juiz.

Este roteiro testa funcionalidades, não demonstra superioridade geral de nenhum modelo.
Um segundo adapter pago só entra se necessário para um gap específico; seleção/planejamento
entre agentes e casos negativos podem ser cobertos offline e com adapters sem API.

## Matriz de comprovação

| Camada | Windows | macOS | Linux |
|---|---|---|---|
| Lógica, imports, scanner e wrappers | Passaram; PowerShell + Git Bash exercitados | Resolução offline; shell/host real pendentes | Resolução offline; shell/host real pendentes |
| Podman/Harbor reais | Smoke e tasks passaram em Linux/amd64 na machine Windows | Host macOS necessário; Apple Silicon/amd64 explícitos | Host Linux rootless necessário |
| UI com DeepSeek | Compare e Analyze passaram; ver relatório | Smoke gratuito e UI quando houver host | Smoke gratuito e UI quando houver host |

Testes parametrizados de OS e CI não substituem execução real. Sem Mac/Linux acessível,
entregar runbook e relatório de smoke reproduzível, mantendo a linha **pendente**. Não afirmar
compatibilidade comprovada ou READY só porque a lógica passou. Builds ARM e amd64 não são
automaticamente equivalentes; registrar arquitetura e digest.

## Registro da implementação

O plano foi entregue e commitado em 7b9a886 antes da autorização de execução. As frentes
operacional, UI, LiteLLM e documentação foram implementadas. O relatório
[Validação da plataforma](VALIDACAO_PLATAFORMA_2026-09-07.md) registra comandos, execuções,
custos e limitações. Ele é a referência para continuar, junto com git status/diff.

Passaram: 163 testes da suíte, 14 testes Python, imports e scanner; smoke Podman real,
oracle/nop, três candidatos DeepSeek pela UI, juiz e análise avulsa. A revisão real encontrou
o caminho próprio de Analyze; ele agora recebe o ambiente gerenciado por bootstrap isolado,
validado em smoke gratuito e duas análises pagas. Histórico, exportações e layout de 390 px
foram conferidos. Total reportado: US$0,060341712. Os 21 recursos identificados desta rodada
foram confirmados ausentes ao final. Mac/Linux reais e proxy real permanecem não validados.
Não executar AWS. Não repetir chamadas pagas já concluídas.

## Fora desta rodada

Implantação AWS, autenticação multiusuário, RBAC, filas distribuídas, EKS/ECS, bancos externos,
auto-resume de processos interrompidos, estatística avançada e calibração do juiz. Esses itens
não devem ser iniciados silenciosamente a partir deste plano.
