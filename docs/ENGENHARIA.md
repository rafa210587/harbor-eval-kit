# Padrões de engenharia deste repositório

As regras curtas e sempre válidas estão no [`AGENTS.md`](../AGENTS.md). Este documento é o
**porquê** de cada uma, com o exemplo real que a originou — quase toda regra aqui existe porque
a ausência dela custou alguma coisa nesta base de código.

Vale para humanos e para agentes de coding igualmente.

---

## 1. Credenciais: mecanismo, não disciplina

**Regra:** nenhuma credencial entra no repositório, e isso é garantido por um hook, não por
lembrança.

- As chaves vivem em `~/.harbor-eval-kit/secrets.env`, **fora** da árvore do projeto, e só
  entram no ambiente do processo filho (`harbor`/`podman`) no instante da chamada.
- Chave nunca vai por **argumento de linha de comando** (visível a outros processos e ao
  gerenciador de tarefas) — só por variável de ambiente do filho.
- Nenhuma rota da API devolve o valor de uma secret; a listagem devolve apenas os **nomes**.
- `.githooks/pre-commit` roda `scripts/scan-secrets.sh --staged` e **bloqueia** o commit.
  Ative com `bash scripts/setup-hooks.sh` (ou `pwsh scripts/setup-hooks.ps1`) — o git não
  distribui hooks sozinho, então todo clone precisa fazer isso uma vez.

**Por que assim, e a lição que ficou:** a primeira versão do scanner detectava a chave,
imprimia o alerta em vermelho… e **deixava o commit passar**. `scan_text` rodava como último
estágio de um pipeline, e o bash executa cada estágio em subshell — o `fail=1` morria junto com
o subshell. Só foi descoberto porque o teste tentou commitar uma chave falsa de verdade em vez
de conferir a saída do script. Um hook que avisa mas não bloqueia é pior que hook nenhum: ele
gera confiança sem entregar proteção.

**Se um falso positivo aparecer**, ajuste o padrão ou a allowlist em `scan-secrets.sh` — nunca
crie o hábito de `--no-verify`. O hook só protege enquanto ninguém o contorna por rotina.

**Se uma chave vazou de fato**, tirá-la do arquivo não desfaz nada: **revogue no painel do
provider** primeiro.

---

## 2. Conviver com macOS, Linux e Windows

**Regra:** todo caminho executável existe nas três plataformas, e diferença de SO é resolvida
em **um** lugar, com o nome do SO explícito.

- **Um script, duas linguagens**: cada entrada tem `.sh` (bash — cobre macOS, Linux e o Git Bash
  do Windows) e `.ps1` (PowerShell). Os dois fazem a mesma coisa e são mantidos juntos, na mesma
  mudança.
- **Hooks são bash**: o Git for Windows executa hooks com o Git Bash que ele mesmo instala, então
  um `pre-commit` em bash cobre as três plataformas sem uma segunda implementação para manter em
  sincronia.
- **Nunca assuma que uma ferramenta Unix existe.** `lsof` e `fuser` **não** existem no Git Bash;
  `python` pode não estar no PATH. Sempre tenha fallback e detecte com `command -v`.
- **`kill` do MSYS não mata processo nativo do Windows.** Ele retorna sucesso e o processo
  continua vivo. No Windows a ferramenta certa é `taskkill //PID <pid> //F` (barra dupla evita a
  conversão de caminho do MSYS).
- **Verifique o efeito, não o código de retorno**, quando o mecanismo é dependente de SO: depois
  de parar um processo, confira se a porta ficou livre — foi assim que o bug acima apareceu.
- **A resolução de `DOCKER_HOST` por SO** é o exemplo canônico: uma função por linguagem
  (`resolvePodmanDockerHost` / `Resolve-PodmanDockerHost` / `resolve_podman_docker_host`),
  cada uma ramificando explicitamente em win32/darwin/linux, e o valor resolvido aparece no
  `/api/status` para ser auditável.
- **Honestidade sobre o que foi testado onde:** este kit foi construído no Windows. Os ramos
  macOS/Linux são testados por lógica, não por execução real — e a documentação diz isso, em vez
  de fingir cobertura.

---

## 3. Pouco código por arquivo (contexto de LLM é recurso escasso)

**Regra:** um arquivo deve caber na cabeça — humana ou de modelo — de uma vez só.

- Alvo: **≤ 400 linhas** por módulo novo. Acima disso, separe por responsabilidade.
- Uma função faz uma coisa e o nome diz qual. Se o nome precisa de "e", são duas funções.
- Agrupe por **domínio**, com um cabeçalho de seção (`// ---------- Job logs ----------`), não
  por tipo técnico ("utils", "helpers", "misc" — nomes que atraem entulho).
- Evite indireção sem ganho: uma camada a mais custa contexto tanto quanto código a mais.

**Estado atual:** `scripts/lib/` foi quebrado (2026-09-06) de um arquivo de 1.296 linhas em 11
módulos, todos abaixo do alvo:

| Módulo | Responsabilidade |
|---|---|
| `types.ts` | interfaces compartilhadas, sem nenhuma dependência |
| `catalog.ts` | as listas fixas: `PROVIDERS`, `JUDGE_MODELS`, `HARBOR_AGENTS` |
| `paths.ts` | state dir, geração de id, `safeJoinUnderDir` |
| `naming.ts` | `sanitize`/`jobName`/`buildHarborRunArgs` |
| `exec.ts` | spawn de harbor/podman e montagem do ambiente deles |
| `secrets.ts` | leitura/escrita do `secrets.env` |
| `materialize.ts` | escrever skills/rubrics/prompts autorados na GUI em disco |
| `joblogs.ts` | tail incremental dos logs do Harbor |
| `tasks.ts` | tasks em disco, descoberta, pin de judge/rubric |
| `litellm.ts` | o encaixe (desligado) do gateway LiteLLM |
| `harbor.ts` | superfície pública: re-exporta tudo + o que ainda não foi separado |

`harbor.ts` continuar sendo o ponto único de import (via `export *`) foi deliberado: a quebra
não obrigou a tocar em `gui-server.ts` nem em `compare-matrix.ts`, então cada módulo pôde ser
extraído e verificado isoladamente. **Ao escrever algo novo, importe do módulo específico e
prefira engordar ele a engordar o `harbor.ts`.**

**Dívida que continua:** `gui/index.html` (~1.900 linhas) ainda concentra HTML, CSS e JS. É a
próxima fronteira — exige servir estáticos com guarda de path traversal e quebrar o JS em
módulos ES nativos.

**Lição da quebra:** cortar por faixa de linha é rápido e exato, mas erra em silêncio quando a
faixa parte um comentário de bloco ao meio (aconteceu: o `/**` de uma função foi para um módulo
e o `*/` ficou no outro). Importar cada módulo isoladamente (`node -e "import('./x.ts')"`)
localiza isso em segundos; a suíte inteira só diz que algo quebrou.

---

## 4. SOLID e desacoplamento, na prática desta base

Sem cerimônia de framework — o que estas siglas significam aqui concretamente:

- **Responsabilidade única**: `harbor.ts` conhece Harbor/Podman/estado; `gui-server.ts` só
  traduz HTTP para essas funções; `gui/index.html` só desenha. Uma rota que começar a fazer
  regra de negócio deve empurrar essa regra para `lib/`.
- **Aberto/fechado por dados, não por herança**: adicionar um provider, um judge model ou um
  adapter é **acrescentar uma entrada num array** (`PROVIDERS`, `JUDGE_MODELS`,
  `HARBOR_AGENTS`), não escrever um `if` novo.
- **Uma fonte de verdade**: a lista de providers morava duplicada no servidor e no frontend, e
  as duas divergiram. Hoje existe só no servidor, servida por `GET /api/providers`. Vale igual
  para `HARBOR_AGENTS` (`GET /api/harbor-agents`).
- **Injeção pela borda**: nada de `lib/` lê `process.env` por conta própria para descobrir
  segredo — quem chama passa `extraEnv`. É isso que torna o caminho da secret auditável.
- **Dependa do que o Harbor expõe de fato**, não do que parece existir: `harbor agent list` não
  existe (duas skills mandavam rodá-lo). Quando não há fonte legível por máquina, mantenha um
  espelho **declarado como espelho**, com instrução de revalidar na atualização.

---

## 5. Testes em cada feature

**Regra:** toda feature nova sai com teste na mesma mudança. Rodar: `bash scripts/test.sh` (ou
`pwsh scripts/test.ps1`).

- Infra: `node --test` com `node:test`, sem framework, sem `node_modules`, sem build — os `.ts`
  rodam direto pelo type stripping nativo do Node, igual ao resto do kit.
- Arquivos `*.test.ts` ao lado do módulo que testam.
- **O que sempre tem teste**: lógica pura (formatação, parsing, resolução), **qualquer guarda de
  segurança** (path traversal, gate de model do juiz), e todo bug corrigido — o teste é o que
  impede a volta dele.
- **O que não vai para a suíte**: qualquer coisa que gaste API, suba container ou dependa de
  rede. Isso é validado por run real, com o resultado registrado na documentação
  (`docs/COMO_FUNCIONA.md`), porque custa dinheiro e minutos.
- **Teste o efeito real, não o relato.** O bug do hook passou por checar a saída impressa em vez
  de tentar o commit de verdade. Prefira o teste que falharia se o mecanismo inteiro estivesse
  quebrado.

---

## 6. UI que explica em vez de exigir manual

**Regra:** quem abre a tela deve entender o que fazer sem sair dela.

- Cada aba diz **o que é**, **quando usar** e **quando pular**.
- Todo campo cujo valor não é óbvio traz uma `hint` com um exemplo concreto.
- **Beco sem saída tem que se explicar**: ter rubrics e nenhum Judge mostrava apenas um dropdown
  vazio; hoje diz qual é o único passo que falta e onde.
- **Operação longa dá sinal de vida**: botão trava (evita disparo duplicado), cronômetro corre e
  o log ao vivo mostra o que está acontecendo. Antes, uma run de minutos parecia travada.
- **Estados não se contradizem**: dois widgets que representam o mesmo valor (o seletor de task e
  o campo de caminho) precisam concordar depois de qualquer re-render.
- **A UI não esconde o gate — ela o explica.** Modelo de juiz fora da lista curada aparece
  marcado com `⚠`, exige opt-in explícito em dois lugares, e o resultado sai carimbado como não
  válido para avaliação. Guarda-corpo com porta rotulada, nunca porta escondida.

---

## 7. Observabilidade

**Regra:** dá para responder "o que está acontecendo agora?" e "por que aquilo falhou?" sem
adivinhar.

- `GET /api/status` expõe versões de Harbor/Podman, plataforma, `DOCKER_HOST` resolvido e o
  diretório de estado — e a barra de status mostra isso o tempo todo.
- Estado de execução é lido **do disco** (`result.json`, `finished_at`), não da memória do
  servidor: assim vale para run iniciada pelo CLI e sobrevive a restart do `gui-server`.
- Aba **Logs** + log ao vivo no Compare: tail incremental por byte offset dos logs que o próprio
  Harbor grava. Distinção que importa: **Logs** = execução crua (build da imagem, instalação do
  agent, teste) — onde falha de container/rede aparece; **Trajectories** = o que o agent fez.
- Números de custo/token vêm do `result.json` do Harbor (billing real), nunca de estimativa
  própria — e ficam em branco quando o adapter não reporta, em vez de exibir um número inventado.
- Erro é mostrado com **a mensagem real** e o que fazer a respeito. Nada de "algo deu errado".
- **Nunca logar segredo**, em nenhum nível.

---

## 8. Documentação atualizada junto com a mudança

**Regra:** documentação entra no **mesmo commit** da mudança, nunca depois.

O repositório é público e serve de runbook para outros agentes de coding — mudança não
documentada é mudança invisível para o próximo, e um runbook errado é pior que ausente (duas
skills mandavam rodar `harbor agent list`, que não existe: um agente seguindo aquilo trava).

Quando uma ressalva escrita antes se provar errada, **corrija aquela passagem**, não acrescente
um parágrafo novo em outro lugar deixando a versão errada de pé. Foi o caso do "talvez
`claude-code` funcione com DeepSeek", substituído por "use um adapter model-agnostic" depois que
a run real respondeu.

Mapa: `README.md` (visão geral) · `DOCUMENTACAO.md` (referência completa, aba a aba) ·
`docs/COMO_FUNCIONA.md` (diagramas + história) · `docs/FLUXO_RUN_COMPARE_ANALYZE.md`
(pré-requisitos) · **este arquivo** (padrões) · `Harbor_install/skills/` (runbooks operacionais).

Registre também o que **não** foi validado. "Testado por lógica, sem run real em hardware" é uma
informação útil; omitir isso vira promessa falsa.
