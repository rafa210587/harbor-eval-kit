# Run, Compare e Analyze — o que precisa estar cadastrado, e por quê

Este documento responde uma pergunta específica: **"o que eu preciso ter cadastrado antes de
conseguir rodar isso?"** — para cada uma das três operações do kit, com exemplos preenchidos e
as mensagens de erro reais que aparecem quando falta alguma coisa.

- Explicação de cada aba isoladamente: [`DOCUMENTACAO.md` §10](../DOCUMENTACAO.md#10-cada-aba-em-detalhe).
- História ponta a ponta com diagramas: [`COMO_FUNCIONA.md`](./COMO_FUNCIONA.md).
- **Aqui**: a cadeia de pré-requisitos, o *porquê* de cada cadastro existir, e o que quebra se
  ele faltar.

## 1. As três operações

| Operação | O que é | Comando Harbor por trás |
|---|---|---|
| **Run** | uma execução: um agent tenta resolver uma task dentro de um container, e o `test.sh` dá o reward | `harbor run` |
| **Compare** | N runs em sequência (uma por combinação agent+model+skillset), lado a lado na mesma tabela | N × `harbor run` |
| **Analyze** | um juiz LLM lê uma run **já terminada** e responde PASS/FAIL/N-A por critério | `harbor analyze` |

Não existe "run" isolada na GUI: **a aba Compare é como você roda**. Uma run só é uma Compare
com uma linha só. O CLI (`compare-matrix.ts`) segue a mesma ideia.

O argv real montado para cada linha (de `buildHarborRunArgs`, em `scripts/lib/harbor.ts`):

```bash
harbor run \
  --path <task> --agent <agentValue> --env docker \
  --jobs-dir <jobs> --job-name <nome-gerado> --n-attempts <N> \
  [--model <provider/modelo>] [--skill <pasta>]...
```

Repare: `--model` e `--skill` são **condicionais**. É isso que torna Model e Skill opcionais
em vez de obrigatórios — o que a tabela abaixo detalha.

## 2. Tabela mestre de pré-requisitos

| Cadastro | Run/Compare | Analyze | Por que existe |
|---|---|---|---|
| **1. Secret** (chave do provider) | **obrigatório** se o model usado for de API paga | **obrigatório** (o juiz é sempre um model pago) | é o que autentica a chamada; injetado só no processo filho, na hora |
| **2. Model** | opcional | **obrigatório** | sem ele o Harbor usa o model padrão dele; com ele você controla e compara |
| **3. Skill** | opcional | ignorado | instruções extras entregues ao agent (`--skill`) |
| **4. Skill Set** | opcional | ignorado | agrupa skills pra tratar como uma unidade comparável |
| **5. Agent** | **obrigatório** | opcional | é a linha do Compare; define quem resolve, com que model padrão |
| **6. Criteria** | não usado | opcional | as perguntas individuais que o juiz responde |
| **7. Judge Rubric** | não usado | opcional | agrupa critérios; sem rubric, o Harbor usa o padrão dele |
| **8. Judge** | não usado | **obrigatório na prática** | quem julga: agent + model high-tier + instruções |
| **9. Task** | **obrigatório** | herdado da run | o problema em si + o teste que gera o reward |
| **Run terminada** | — | **obrigatório** | o Analyze lê o trial no disco; não existe julgar o que não rodou |

> **A regra que mais confunde:** Criteria/Rubrics/Judges **não participam da Run**. Eles só
> existem para o Analyze, que é uma etapa *posterior e opcional*. Se você só quer saber
> "passou ou não passou", o reward do `test.sh` já responde — não precisa cadastrar nada das
> abas 6, 7 e 8.

## 3. A cadeia de dependências

```mermaid
flowchart TD
    Secret["1. Secret<br/>(ANTHROPIC_API_KEY)"] --> Model["2. Model<br/>(anthropic/claude-opus-5)"]
    Model -.opcional.-> Agent["5. Agent<br/>(perfil de quem resolve)"]
    Skill["3. Skill"] --> SkillSet["4. Skill Set"]
    SkillSet -.opcional.-> Agent
    Task["9. Task<br/>(instruction + test.sh)"] --> Compare["10. Compare = a Run"]
    Agent --> Compare
    Compare --> Trial["Run terminada<br/>(jobs/.../trial)"]
    Trial --> Analyze["Analyze"]
    Model --> Judge["8. Judge<br/>(model DEVE ser high-tier)"]
    Criteria["6. Criteria"] --> Rubric["7. Judge Rubric"]
    Rubric -.opcional.-> Analyze
    Judge --> Analyze
```

Linha cheia = obrigatório. Linha pontilhada = opcional.

## 4. Caminho mínimo — sua primeira run sem gastar 1 centavo de API

Serve para validar que o kit inteiro funciona antes de envolver dinheiro.

1. **Aba 9 — Tasks**: crie uma task (`harbor init --task`), preencha `instruction.md` e
   `tests/test.sh`. Preencha também `solution/solve.sh`, porque o passo 3 depende dele.
2. **Aba 5 — Agents**: cadastre um agent com `agentValue = oracle` e **sem model**.
   - `oracle` não chama LLM nenhuma: ele aplica a `solution/solve.sh` da própria task.
   - Serve para responder *"meu `test.sh` está correto?"* — se o oracle não tira reward 1.0,
     o problema está na sua task, não no agent.
   - (`nop` é o oposto: não faz nada, deve tirar 0.0. Confirma que o teste não passa sozinho.)
3. **Aba 10 — Compare**: escolha a task, adicione a linha do agent `oracle`, **Rodar**.

Nenhum Secret, nenhum Model, nenhum Criteria, nenhum Judge foi necessário aqui.

## 5. Caminho completo — um Compare de verdade (DeepSeek vs Claude)

### 5.1 Secret (aba 1) — porque sem chave não há chamada

Cadastre `ANTHROPIC_API_KEY` e `DEEPSEEK_API_KEY` e clique **Test** em cada uma. O Test faz
uma chamada real (`"hi"`, `max_tokens: 5`) — não é validação de formato.

Se faltar a chave do provider do model que você escolheu, a run falha **dentro do container**,
depois de já ter subido tudo — por isso testar aqui economiza tempo.

### 5.2 Models (aba 2) — porque é o que você quer comparar

| Label | Value |
|---|---|
| `claude-sonnet-5` | `anthropic/claude-sonnet-5` |
| `deepseek-chat` | `deepseek/deepseek-chat` |

O prefixo antes da `/` é o que decide qual Secret será lido — convenção do LiteLLM, não uma
escolha separada. O badge na lista mostra se a chave esperada já existe.

### 5.3 Agents (aba 5) — porque é a unidade de comparação

| Label | agentValue | Model padrão |
|---|---|---|
| `resolvedor-claude` | `claude-code` | `claude-sonnet-5` |
| `resolvedor-deepseek` | `claude-code` | `deepseek-chat` |

Você **pode** cadastrar um agent só e sobrescrever o model direto na linha do Compare — o
resultado é idêntico. Dois perfis só evitam repetir o override toda vez.

### 5.4 Compare (aba 10)

Task + duas linhas + `n-attempts = 3` (reduz ruído de amostra pequena) → **Rodar**.

Resultado: uma linha por combinação, com reward, custo (USD), tokens in/out e duração.

**Esse reward já é a comparação real.** Determinístico, sem LLM opinando. O Analyze abaixo é
uma camada extra e opcional.

## 6. Caminho do Analyze — e por que ele exige Judge

O Analyze responde o que o reward não consegue: *"passou, mas passou honestamente?"* e
*"entre dois que passaram, qual fez melhor?"*.

### 6.1 Por que um Judge precisa ser cadastrado

O endpoint recusa qualquer model que não esteja na lista curada high-tier:

```
the judge's model must be one of the curated high-tier judge models (see GET /api/judge-models)
```

A lista (`JUDGE_MODELS` em `scripts/lib/harbor.ts`) é hoje:

| Label | Value |
|---|---|
| Claude Opus 5 | `anthropic/claude-opus-5` |
| Claude Fable 5.1 | `anthropic/claude-fable-5-1` |
| GPT-5.1 | `openai/gpt-5.1` |
| Gemini 3 Pro | `gemini/gemini-3-pro` |

**Motivo:** o juiz existe justamente para pegar o que o teste barato não pegou. Um juiz barato
derrota o propósito — por isso o padrão do próprio Harbor (`claude-haiku-4-5`) é bloqueado aqui
de propósito.

**Consequência prática — a cadeia inteira que um Judge exige:**

```
Secret (ANTHROPIC_API_KEY)  →  Model (anthropic/claude-opus-5)  →  Judge
```

Ou seja: você **não consegue** cadastrar um Judge útil sem antes registrar, na aba Models, um
model cujo value seja exatamente um dos quatro acima. É o erro de ordem mais comum — o dropdown
de model do Judge aparece vazio e não fica óbvio o porquê.

### 6.2 Criteria e Rubrics são opcionais — e por que existem mesmo assim

Sem rubric marcado, o Harbor usa o rubric padrão dele (`reward_hacking` +
`task_specification`) — já resolve o caso "alguém hackeou o teste?".

Você cadastra Criteria próprios quando quer julgar algo específico do **seu** contexto:

```
name:        no_prolixity
description: O código resolve o problema sem complexidade desnecessária?
guidance:    PASS se a solução é direta e legível. FAIL se há funções/imports não usados,
             abstração prematura, ou comentários que apenas repetem o código.
             N-A se a task não envolve escrever código novo.
```

E o Rubric existe para **reuso**: `no_prolixity` entra tanto num rubric "Python Quality"
quanto num "TypeScript Quality" sem você reescrever o texto. Editou o critério uma vez, todos
os rubrics que o usam já refletem.

Se você marcar um rubric vazio ou com critérios inválidos:

```
rubric has no valid criteria
```

### 6.3 Rodando

Na tabela de resultados do Compare, botão **Analisar** na linha desejada → escolha o Judge →
marque zero ou mais rubrics → cada rubric marcado vira uma chamada separada, com o custo
daquela análise mostrado individualmente.

O juiz é um agente Harbor de verdade, com acesso a arquivo: ele lê `result.json`,
`agent/trajectory.json` e `test-stdout.txt` dentro do trial antes de responder — não é uma
chamada de LLM crua em cima de um resumo.

## 7. Exemplos de payload (para quem for automatizar)

**Compare** — `POST /api/compare`:

```json
{
  "path": "evals/python/minha-task",
  "entries": [
    { "agentId": "<id-do-resolvedor-claude>" },
    { "agentId": "<id-do-resolvedor-claude>", "modelId": "<id-do-deepseek-chat>" }
  ],
  "env": "docker",
  "jobsDir": "jobs",
  "nAttempts": "3",
  "concurrency": 2
}
```

A segunda entrada mostra o override: mesmo agent, model diferente, só naquela linha.

**Analyze** — `POST /api/analyze`:

```json
{
  "path": "jobs/cmp__agent-claude-code__model-deepseek-deepseek-chat__skill-none/<trial>",
  "judgeId": "<id-do-judge>",
  "rubricId": "<id-do-rubric>"
}
```

`rubricId` pode ser omitido ou `"__default__"` para usar o rubric padrão do Harbor.

**Equivalente em CLI** (produto cartesiano, não lista explícita — ver
[`DOCUMENTACAO.md` §12](../DOCUMENTACAO.md#12-compare-matrixts-cli-vs-gui--quando-usar-cada-um)):

```powershell
node .\scripts\compare-matrix.ts `
  --path .\evals\python\minha-task `
  --agent claude-code `
  --model anthropic/claude-sonnet-5 --model deepseek/deepseek-chat
```

## 8. Erros reais e o que significa cada um

| Mensagem | Causa | Onde resolver |
|---|---|---|
| `path and at least one entry are required` | rodou o Compare sem task ou sem nenhuma linha | aba 10 |
| `unknown agentId` | o agent foi deletado depois de montar a linha | aba 5, recadastre |
| `no secret named X is saved yet` | clicou Test numa chave que não foi salva | aba 1 |
| `no known provider maps to the secret name 'X'` | nome de secret customizado, fora dos 15 providers curados | aba 1 (use o dropdown) |
| `the judge's model must be one of the curated high-tier judge models` | Judge sem model, ou com model fora da lista curada | aba 2 → cadastre um high-tier → aba 8 |
| `rubric has no valid criteria` | rubric criado sem marcar nenhum critério válido | abas 6 e 7 |
| `unknown rubricId` / `unknown judgeId` | cadastro deletado após ter sido pinado numa task | aba 9 (repin) |
| `Authentication Fails, Your api key: ****NNNN is invalid` | a chave é real mas foi revogada/rotacionada no provider | painel do provider → aba 1 |

## 9. Resumo em uma frase

**Para rodar**: Task + Agent (e Secret+Model se o agent usar LLM paga).
**Para comparar**: a mesma coisa, com duas ou mais linhas.
**Para julgar**: uma run terminada + Secret → Model high-tier → Judge (Criteria e Rubric só se
quiser perguntas próprias em vez do padrão do Harbor).
