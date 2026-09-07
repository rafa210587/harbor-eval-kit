# Plano de testes de UI — validação manual, um por um

Checklist executável pra validar a GUI clicando de verdade nos elementos (não chamando a API
direto), aba por aba. Cada teste tem: pré-condição, passos exatos (com o `id`/texto do elemento
real, pra não depender de adivinhar onde clicar), resultado esperado, e um status honesto do que
já foi validado nesta base de código antes deste plano existir.

**Legenda de status:**
- ✅ **Validado por clique real** — já testado clicando/selecionando de verdade na UI.
- 🔶 **Validado só por API** — o mecanismo foi chamado direto (`fetch`/`curl`), não o botão.
- ⬜ **Nunca testado** — nem por API, nem por clique.

Ao rodar um teste, troque o status pra ✅ (ou anote o que quebrou) — este arquivo é vivo.

---

## Como usar este plano

1. Suba a GUI (`bash scripts/start-gui.sh` / `.ps1`) e abra `http://127.0.0.1:4173`.
2. Siga os testes **na ordem** dentro de cada seção — muitos dependem de cadastro feito no
   teste anterior (ex.: não dá pra testar Skill Set sem uma Skill cadastrada antes).
3. Testes marcados **💰 gasta API** custam centavos de verdade (DeepSeek). Os demais são de
   graça (`oracle`/`nop`, ou puro CRUD local).
4. Se algo quebrar, isso é um teste bem-sucedido (achou um bug) — documente o que aconteceu em
   vez de só marcar "falhou".

---

## 1. Secrets

### T1.1 — Salvar uma chave pelo dropdown de provider ✅ (validado por clique real)
1. Aba **1. Secrets**. Provider = `DeepSeek`.
2. Confirme que **Name** se preencheu sozinho com `DEEPSEEK_API_KEY`.
3. Cole um valor qualquer em **Value**, clique **Save key**.
4. **Esperado:** a chave aparece na lista abaixo, só o nome (nunca o valor).

### T1.2 — Test com chave válida 🔶 (validado só por API)
1. Na linha `DEEPSEEK_API_KEY`, clique **Test**.
2. **Esperado:** `✓ Key funciona — chamada de teste no model <algo> respondeu normalmente.`
   (Nota: nomes de model do DeepSeek mudam — se a chave for boa mas o model testado não existir
   mais, o erro cita *model*, não autenticação; isso é esperado, ver `docs/COMO_FUNCIONA.md`.)

### T1.3 — Test com chave inválida ✅ (validado por clique real)
1. Cadastre uma chave falsa qualquer, clique **Test**.
2. **Esperado:** erro real da API do provider (ex.: `AuthenticationError`), não um erro genérico.

### T1.4 — Remove ✅ (validado por clique real)
1. Clique **Remove** numa chave de teste.
2. **Esperado:** some da lista; `GET /api/secrets` não lista mais o nome.

---

## 2. Models

### T2.1 — Cadastrar model manualmente ✅ (validado por clique real)
1. Aba **2. Models**. Label = `Teste`, provider/model = `deepseek/deepseek-v4-flash`.
2. **Esperado:** aparece na lista com badge indicando se `DEEPSEEK_API_KEY` já está cadastrada.

### T2.2 — Checklist de models descobertos ao vivo (via Secrets → Test) ✅ (validado por clique real)
1. Aba Secrets, clique **Test** numa chave válida com listagem ao vivo suportada.
2. Marque 1-2 checkboxes do checklist que aparece.
3. **Esperado:** os models marcados aparecem cadastrados na aba Models sem digitar nada.
   **Confirmado 2026-09-07**: `Test` em `ANTHROPIC_API_KEY` → "✓ Key funciona — chamada de
   teste no model anthropic/claude-fable-5-1 respondeu normalmente", checklist ao vivo
   apareceu (já cadastrados aparecem cinza/desabilitados e marcados). Marquei
   `anthropic/claude-fable-5` e `anthropic/claude-opus-4-8`, cliquei **Cadastrar marcados** →
   ambos apareceram na aba Models sem digitar nada. (Nota: `Test` em `DEEPSEEK_API_KEY` bateu
   no limitante já documentado no T1.2 — a lista estática de fallback do LiteLLM instalado tem
   `deepseek-r1`, que a API real do DeepSeek já não aceita; não impede validar este teste com
   outro provider.)

### T2.3 — Editar e apagar ✅ (validado por clique real)
1. Clique num item da lista de Models pra editar; mude o label; salve.
2. Apague um model de teste.
3. **Esperado:** edição reflete na lista; apagar remove e não quebra Agents que o referenciam
   (o Agent deve mostrar "— nenhum —" ou algo tratável, não travar).

---

## 3. Skills

### T3.1 — Skill autorada com arquivo extra ✅ (validado por clique real)
1. Aba **3. Skills**, modo "Escrever instruções", preencha o texto.
2. Clique **Adicionar arquivo em branco**, dê um nome tipo `examples/bom.py`, preencha conteúdo.
3. Salve.
4. **Esperado:** skill aparece na lista com o arquivo extra registrado.

### T3.2 — Skill por pasta existente ✅ (validado por clique real)
1. Modo "Usar pasta existente", aponte pra um caminho real no disco.
2. **Esperado:** salva sem materializar nada (é só uma referência de caminho).

### T3.3 — Anexar `.md` via input de arquivo ✅ (validado por clique real)
1. No modo "Escrever instruções", use o `<input type=file accept=".md">` pra carregar um
   arquivo `.md` local.
2. **Esperado:** o textarea de instructions é preenchido com o conteúdo do arquivo.

---

## 4. Skill Sets

### T4.1 — Criar Skill Set com 1 skill ✅ (validado por clique real)
1. Aba **4. Skill Sets**, Label = `Qualidade Python`, marque a skill do T3.1.
2. **Esperado:** salva e aparece na lista com a contagem de skills certa.

### T4.2 — Filtro do checkboxGroup com >8 itens ✅ (validado por clique real, com dados plantados)
1. Cadastre 9+ skills de teste (ou use o script de teste que já existe nesta sessão).
2. Abra o picker de skills do Skill Set.
3. **Esperado:** aparece uma caixa de busca acima da lista; filtrar esconde os que não batem;
   marcar um, filtrar por outro termo, limpar o filtro — o marcado continua marcado.

---

## 5. Agents

### T5.1 — Criar agent model-agnostic com model + skillset ✅ (validado por clique real)
1. Aba **5. Agents**. Label = `DeepSeek barato`. `--agent value` = `mini-swe-agent` (comece a
   digitar e confirme que o `<datalist>` sugere — 42 opções).
2. Model padrão = um `deepseek/...` cadastrado. Marque o Skill Set do T4.1.
3. **Esperado:** salva; ao adicionar esse agent no Compare depois, model e skillset vêm
   pré-marcados na linha.

### T5.2 — Anexar Instructions via `.md` ✅ (validado por clique real)
1. Em outro agent, use o `<input type=file>` abaixo do textarea de Instructions.
2. **Esperado:** textarea preenchido com o conteúdo do arquivo anexado.

### T5.3 — Editar e cancelar edição ✅ (validado por clique real)
1. Clique num agent existente pra editar; o formulário muda pra "Save changes" +
   "Cancel edit".
2. Clique **Cancel edit**.
3. **Esperado:** formulário volta ao estado de criação, nada foi alterado no agent.

---

## 6. Criteria

### T6.1 — Criar um critério ✅ (validado por clique real, em teste anterior)
1. Aba **6. Criteria**: name, description, guidance.
2. **Esperado:** aparece na lista; disponível no picker da aba Judge Rubrics.

### T6.2 — Editar e apagar (com uso em rubric) ✅ (validado por clique real)
1. Apague um critério que **já está marcado** num Judge Rubric existente.
2. **Esperado:** não trava; o rubric deve continuar existindo (com os critérios restantes) —
   confirme que `resolveRubricCriteria` filtra o id inexistente sem quebrar a análise.

---

## 7. Judge Rubrics

### T7.1 — Criar rubric com critérios ✅ (validado por clique real)
1. Aba **7. Judge Rubrics**: Label, marque 1+ critérios.
2. **Esperado:** salva; disponível nos pickers de Compare/Analyze/Judges.

### T7.2 — Filtro do picker de critérios com volume ✅ (validado por clique real, dados plantados)
1. Com 9+ critérios cadastrados, abra o picker de critérios do rubric.
2. **Esperado:** caixa de busca aparece, filtra, seleção sobrevive ao filtro (mesmo teste do
   T4.2, aplicado aqui — era o cenário que você apontou originalmente).

---

## 8. Judges

### T8.1 — Criar Judge com model curado ✅ (validado por clique real, em teste anterior)
1. Aba **8. Judges**: Label, `--agent value` (datalist), Judge model = um `anthropic/...`/
   `openai/...`/`gemini/...` da lista curada. Marque rubrics padrão.
2. **Esperado:** salva; some da lista suspeita se o dropdown de model estiver vazio (nesse caso,
   cadastre um model curado na aba Models primeiro).

### T8.2 — Modo validação libera models fora da lista curada ✅ (validado por clique real)
1. Marque **Modo validação** no formulário de Judge.
2. **Esperado:** o dropdown de model passa a listar TODOS os models cadastrados, cada um fora
   da lista curada marcado com `⚠ fora da lista curada`.
3. Salve um Judge assim (ex.: com um model DeepSeek).

### T8.3 — Editar as instruções do juiz (prompt customizado) ✅ (validado por clique real)
1. Edite o campo "Instruções do juiz", removendo um dos marcadores obrigatórios
   (`{trial_path}`, `{task_section}`, `{criteria_guidance}`).
2. Salve e rode um Analyze com esse Judge.
3. **Esperado:** o Harbor não quebra (ele só preenche o que existir no texto), mas o juiz fica
   sem parte da orientação — documentar o que de fato aconteceu.
   **Confirmado 2026-09-07**: removido `{criteria_guidance}` do prompt do Judge "VALIDACAO —
   DeepSeek chat" (via Edit real na aba Judges), salvo, rodado Analyze de verdade (aba Analyze
   standalone) contra o job já existente com esse Judge + rubric Python Quality + Modo
   validação. Harbor não quebrou: rodou normalmente e devolveu `checks` reais (no_prolixity,
   clean_code, ambos "pass") — a seção "Guidance:" do prompt só ficou vazia (sem o texto dos
   critérios), sem afetar a capacidade do juiz de avaliar via as `guidance` que já estavam
   embutidas nos textos dos próprios critérios (aba 6) mesmo sem o marcador. Prompt original
   restaurado ao final (via Edit + Save changes de novo) pra não deixar o Judge compartilhado
   quebrado pros próximos testes.

---

## 9. Tasks

### T9.1 — Criar task nova pelo wizard ✅ (validado por clique real)
1. Aba **9. Tasks**: Name, Org, Output dir, clique **Create task**.
2. **Esperado:** o editor abre sozinho (scroll automático) com os 4 arquivos prontos.

### T9.2 — Editar e salvar os 4 arquivos ✅ (validado por clique real)
1. Preencha `instruction.md`, `Dockerfile`, `solve.sh`, `test.sh` reais.
2. Clique **Save files**.
3. **Esperado:** grava em disco de verdade (confirmar com `cat` no arquivo).

### T9.3 — Pin de Judge/Rubric na task ✅ (validado por clique real)
1. No editor da task, escolha um Judge e marque rubrics padrão.
2. **Esperado:** ao usar essa task no Compare depois, o painel Analisar já abre com esse
   Judge/rubrics pré-marcados.

### T9.4 — Steps > 0 (task multi-etapa) ✅ (validado por clique/curl real — achou e corrigiu um bug)
1. Crie uma task com **Steps = 2**.
2. **Esperado:** gera `steps/step-1/` e `steps/step-2/`, cada um com seu próprio
   `instruction.md`/`test.sh`.

**Bug real encontrado e corrigido (2026-09-07):** criar uma task pelo formulário com **Org em
branco** e Name **sem `/`** travava por **60 segundos inteiros**, terminando em
"Internal Server Error". Causa: sem `--org`, o `harbor init --task` **pergunta
interativamente** "Organization: " no stdin — e como o processo filho nunca recebe resposta,
fica pendurado até o timeout do servidor matar ele. Corrigido em duas camadas:
1. `POST /api/tasks/init` agora recusa na hora (400, ~0.1s) quando falta `org` e o `name` não
   tem `/` — mensagem explica exatamente o motivo.
2. `execCommand` (`scripts/lib/exec.ts`) fecha o **stdin** de todo processo filho
   (`stdio: ["ignore", ...]`) — defesa extra: se outro comando do Harbor perguntar algo no
   futuro, falha na hora com EOF em vez de travar por um minuto.

Confirmado depois da correção: sem org + sem barra → 400 em 0,135s; com org → 200 em 0,8s; name
com `/` embutido sem org → 200 em 0,7s; multi-step com org → gerou `steps/step-1/` e
`steps/step-2/` corretamente.

### T9.5 — Skip pytest/solution templates ✅ (validado por API real)
1. Crie uma task marcando **Skip pytest template** e/ou **Skip solution template**.
2. **Esperado:** o esqueleto gerado não inclui esses arquivos de exemplo. **Confirmado**: com
   `noSolution:true` a pasta `solution/` não é criada; com `noPytest:true` o `tests/test.sh`
   ainda existe (é onde o reward é escrito, sempre existe) mas vem como esqueleto genérico sem
   exemplo baseado em pytest.

---

## 10. Compare (o núcleo)

### T10.1 — Adicionar entrada, override de model na linha ✅ (validado por clique real)
1. Aba **10. Compare**. Escolha um agent, clique **Adicionar**.
2. Na linha criada, troque o model no `<select class="entry-model">` pra outro cadastrado.
3. **Esperado:** a linha reflete o override sem alterar o agent original.

### T10.2 — Remover uma entrada ✅ (validado por clique real)
1. Clique **Remover esta entrada** numa linha.
2. **Esperado:** some da lista; contador de "N entradas adicionadas" atualiza.
   Confirmado: "2 entradas adicionadas" → "1 entrada adicionada" após remover uma.

### T10.3 — Estimativa de custo ao vivo ✅ (validado por clique real)
1. Com uma linha adicionada e uma task escolhida, observe **Custo estimado**.
2. Mude n-attempts de 1 pra 5.
3. **Esperado:** o texto atualiza sozinho (sem precisar rodar), multiplicando pelo histórico.

### T10.4 — Guarda de gasto: teto excedido bloqueia ✅ (validado por clique real, achou e corrigiu 2 bugs)
1. Configure um teto baixo (ex.: `0.001`) sabendo que a estimativa é maior.
2. Clique **Run comparison**.
3. **Esperado:** aparece um `confirm()` do navegador com a mensagem da guarda; cancelar não
   gasta nada; confirmar roda mesmo assim.

**Confirmado 2026-09-07**: clicar o botão real dispara `POST /api/compare` → `409`, o app
chama `confirm("Guarda de gasto:\n\nestimativa de $0.0024 passa do teto de $0.0010...")`,
cancelar mostra "Cancelado pela guarda de gasto — nada foi executado." e não roda nada
(confirmado sem novo job/container em disco).

**Bug 1 (real, corrigido)**: o `<input type="number" name="costCapUsd">` tinha
`step="0.01"` — qualquer teto sub-centavo (ex.: `0.0001`, útil pra testar a guarda contra
custos reais tipicamente < $0.01) falhava a validação HTML5 nativa **silenciosamente**: o
clique no botão disparava o evento `click` mas o navegador nunca disparava `submit` no form
(bloqueado por constraint validation), e o app nunca chama `reportValidity()` — do ponto de
vista do usuário, o botão simplesmente não fazia nada, sem nenhum feedback visual. Corrigido
em `gui/index.html`: `step="0.0001"` (mesma precisão que a própria estimativa já exibe, ex.
"~$0.0024").

**Bug 2 (real, corrigido)**: a mensagem da guarda formatava o teto com `capUsd.toFixed(2)`
enquanto a estimativa usa `toFixed(4)` — um teto sub-centavo (ex. `0.001`, exatamente o tipo
de valor que o Bug 1 passou a permitir) aparecia como "teto de $0.00" na mensagem, indistinguível
do "0 = sem teto" que a própria UI documenta ao lado do campo — o usuário não teria como saber
se o teto que digitou foi realmente aplicado. Corrigido em `scripts/lib/cost.ts`: `capUsd.toFixed(4)`.

Ambos exigiram restart do processo `node scripts/gui-server.ts` (roda TS nativo, sem hot-reload)
pra pegar a mudança em `cost.ts` — `gui/index.html` é servido estático, pegou a mudança só com
reload da página.

### T10.5 — Guarda de gasto: volume às cegas bloqueia ✅ (validado por clique real)
1. Use um agent+model **nunca rodado antes** (sem histórico), com n-attempts alto (ex.: 10).
2. Clique **Run comparison**.
3. **Esperado:** recusa por "às cegas" antes dos 5 trials pagos, mesmo sem teto configurado.

**Confirmado 2026-09-07**: agent DeepSeek v4-flash com model override `deepseek-reasoner`
(0 samples de histórico), n-attempts=10, teto=1.00 (sem relação — a guarda de volume às
cegas roda antes da checagem de teto). Estimativa mostrou "não estimável ainda (10
trial(s)) — rode uma vez para aprender o custo"; clicar **Run comparison** disparou
`confirm("...sem histórico para estimar o custo de mini-swe-agent + deepseek-deepseek-reasoner,
e isto dispararia 10 trials pagos (limite às cegas: 5)...")`; cancelar não rodou nada.

### T10.6 — Rodar de verdade (💰 gasta API) ✅ (validado por clique real, múltiplas vezes)
1. Task real + 1 linha com model barato, n-attempts=1. Clique **Run comparison**.
2. **Esperado:** botão trava, texto "Rodando…" com cronômetro, botão **Cancelar** aparece,
   log ao vivo popula, ao terminar a tabela mostra reward/custo/tokens reais.

### T10.7 — Cancelar uma run em andamento (💰 gastou $0,0009) ✅ (validado por clique real, pós-layout)
1. Dispare uma run real, e **antes de terminar**, clique **Cancelar**.
2. **Esperado:** texto muda pra "Cancelando…", depois mostra quantos processos/containers
   foram parados; a linha na tabela final (se aparecer) mostra `error: cancelado pelo usuário`.
   **Confirmado 2026-09-07**: container `soma-fracoes__ldwd4rj__env-main-1` parado de verdade
   (`podman ps` ficou vazio), linha final: `error: "cancelado pelo usuário -- [killed: signal
   SIGTERM]"`, botão destravou, Cancelar sumiu de novo. Achado no caminho: uma aba do Chrome
   que já sofreu vários reloads/timeouts do CDP acumula requests "pending" fantasmas (network
   panel mostrava `/api/compare` e `/api/compare/estimate` presos, mas o mesmo request via
   `curl` direto respondia em 4ms) — não é bug do app, é estado da aba. Abrir uma aba nova
   resolveu. Também descoberto: **recarregar a página no meio de uma run NÃO aborta o processo
   no servidor** — o `harbor` continua rodando órfão até terminar sozinho (sem jeito de
   cancelar pela UI depois do reload). Vale documentar como limitação conhecida.

### T10.8 — Dry run ✅ (validado por clique real)
1. Marque **Dry run**, rode.
2. **Esperado:** `harbor run --print-config`, sem container, sem custo. Confirmar que o painel
   de log ao vivo **não** aparece (só ativa quando `!dryRun`). Confirmado: rodou em 0,7s,
   painel de log ao vivo ficou escondido, `ok:true` sem reward/custo (não é run de verdade).

### T10.9 — Aviso de Judge faltando ✅ (validado por clique real)
1. Com rubrics cadastrados e **zero** Judges, olhe o painel "4. Analisar" após uma run.
2. **Esperado:** aviso `⚠ Você já tem rubrics cadastrados, mas nenhum Judge` em vez de um
   dropdown vazio sem explicação.

### T10.10 — Analisar uma linha (💰 gasta API do juiz) ✅ (validado por clique real — achou e corrigiu um bug, ver T10.13)
1. Após uma run com `ok:true`, escolha um Judge (curado) + marque um rubric, clique
   **Analisar** na linha.
2. **Esperado:** painel de resultado com summary + checks (pass/fail/n-a) reais.
   **Nota 2026-09-07**: esta marcação ✅ original (de uma sessão anterior) provavelmente só
   viu o *fallback* de stdout bruto, não checks estruturados de verdade — ver o bug real
   descoberto e corrigido em **T10.13**, que afeta exatamente este botão. Reconfirmado
   funcionando (checks reais) depois do fix.

### T10.11 — Modo validação no painel Analisar (💰 gasta API do juiz, barato) ✅ (validado por clique real)
1. Use um Judge cadastrado em modo validação (T8.2), marque **Modo validação** no painel
   Analisar também, clique **Analisar**.
2. **Esperado:** resultado vem com aviso `⚠ Modo validação: julgado por <model>...`.
   **Reconfirmado 2026-09-07** depois do fix do T10.13: aviso aparece, e agora vem acompanhado
   de checks reais (antes só do fallback de stdout bruto).

### T10.12 — Analisar sem marcar Modo validação, com Judge de validação ✅ (validado por clique real)
1. Mesmo Judge do T8.2, mas **sem** marcar Modo validação no painel Analisar.
2. **Esperado:** recusado (400/409) com a mensagem do gate — nunca deixa passar mesmo tendo
   marcado no cadastro do Judge.
   **Confirmado 2026-09-07**: Judge "VALIDACAO — DeepSeek chat" escolhido, checkbox "Modo
   validação" do painel Analisar deixado desmarcado, clique real em **Analisar** numa linha
   `ok:true` → painel mostrou "Erro: the judge's model must be one of the curated high-tier
   judge models (...), or pass validationMode to smoke-test the pipeline with a non-curated
   model" — o gate nunca deixa passar mesmo o Judge já tendo sido cadastrado em modo validação.

### T10.13 — Analisar todas ✅ (validado por clique real, achou e corrigiu um bug grande)
1. Com 2+ linhas `ok:true`, clique **Analisar todas**.
2. **Esperado:** roda o mesmo Judge+rubrics em cada linha, uma de cada vez (sequencial, não
   paralelo).

**Confirmado 2026-09-07**: 2 linhas `ok:true` (DeepSeek v4-flash duas vezes), **Analisar
todas** disparou 2 chamadas reais ao juiz, uma depois da outra (confirmado pelo
`read_network_requests`: 1 request completa antes da 2ª começar) — sequencial, como esperado.

**Bug real (grande) encontrado e corrigido**: o painel de análise do Compare sempre caiu no
fallback de stdout bruto (`<pre>...Analyzing trial(s)... Mean: 1.000...</pre>`) em vez de
mostrar os checks estruturados (PASS/FAIL/N-A por critério) — e a coluna `passRate` da
tabela sempre ficava vazia. Isso provavelmente **nunca funcionou de verdade** desde que a
feature foi escrita, porque ficava mascarado: o stdout bruto ainda parecia informativo o
bastante pra não levantar suspeita.

Causa raiz: `parseAnalysisJson(path)` (em `scripts/lib/harbor.ts`) sempre procurou
`<path>/analysis.json` diretamente. Isso é verdade quando `harbor analyze` recebe o caminho
de um trial isolado — mas o Compare **sempre** passa o caminho do **job** (`jobsDir/jobName`),
já que uma linha da matriz é um job inteiro (pode ter mais de 1 trial se n-attempts > 1). Ao
receber um caminho de job, o Harbor instalado (0.22.0) cria uma pasta de saída nova, com
timestamp (`jobs/2026-09-07__15-07-23/`), grava lá um `analysis.json` com um formato
diferente (`{"results": [{"trial_name", "checks", "cost_usd", ...}]}` em vez do formato
plano `{"summary", "checks", "estimated_cost_usd"}`), e só informa onde na última linha do
stdout: `Report: jobs\2026-09-07__15-07-23\analysis.json`. `parseAnalysisJson` nunca olhava
pra essa linha nem sabia desse segundo formato — resultado: `analysis: null` na resposta da
API sempre que chamado a partir do Compare, silenciosamente, apesar do `harbor analyze` em si
ter rodado com sucesso e produzido dados reais.

**Fix** (`scripts/lib/harbor.ts` + `scripts/gui-server.ts`): nova função
`resolveAnalysisJson(trialPath, stdout)` — tenta `parseAnalysisJson` primeiro (compatível com
o comportamento antigo/caminho de trial isolado); se vier vazio, extrai o caminho da linha
`Report: <path>` do stdout, lê esse arquivo, e se o formato for o `{results: [...]}` de
job, "achata" pro formato plano que o cliente já sabe ler (pegando o primeiro resultado —
cobre o caso comum de n-attempts=1; um job com mais de 1 trial por linha ainda descarta os
demais resultados, ver limitação abaixo). `/api/analyze` agora chama
`resolveAnalysisJson(trialPath, result.stdout)` em vez de `parseAnalysisJson(trialPath)`.

**Verificado depois do fix**: reiniciado o `gui-server`, `curl` direto confirmou
`analysis.checks` populado com `no_prolixity`/`clean_code` reais; depois **reconfirmado via
clique de verdade** na aba Analyze standalone (T15.1) apontando pro mesmo job — painel
mostrou o JSON estruturado completo, não mais o fallback. `bash scripts/test.sh` e
`node scripts/check-imports.mjs` verdes depois do fix.

**Limitação conhecida (não corrigida, fora de escopo deste fix)**: se uma linha do Compare
tiver n-attempts > 1 (múltiplos trials no mesmo job), `resolveAnalysisJson` hoje só devolve o
primeiro resultado do array — os `checks` dos outros trials daquela linha são calculados pelo
Harbor mas descartados na resposta da API. Não teve teste desta sessão com n-attempts > 1
analisado, então o impacto prático não foi observado, só inferido lendo o código.

**Achado incidental**: adicionar o **mesmo agent+model+skillset sem nenhum override**
duas vezes na matriz gera o mesmo `jobName` para as duas linhas — a 2ª entrada não roda um
trial novo de verdade, só reaproveita/relê o job já criado pela 1ª (confirmado: 2ª linha
terminou em ~1s, contra ~60s da 1ª, e só existe 1 pasta de trial em disco). Pra 2 trials
genuinamente independentes da mesma combinação, seria preciso variar algo (model, skill set,
ou rodar em jobs dirs diferentes) — a UI já avisa "overrides diferentes" no texto de ajuda,
então isso é uso incorreto do recurso, não um bug, mas vale documentar pra não confundir
resultados no futuro.

### T10.14 — Ordenar por avaliação ✅ (validado por clique real)
1. Após analisar algumas linhas (com `passRate` diferente), clique **Ordenar por avaliação**.
2. **Esperado:** tabela reordena por `passRate` desc.
   **Confirmado 2026-09-07**: com o fix do T10.13, as 2 linhas (Oracle e DeepSeek v4-flash)
   ficaram com `passRate` real (1.00 as duas — ambas passaram nos 2 critérios). Clicar
   **Ordenar por avaliação** re-renderizou a tabela sem erro; como as duas ficaram empatadas
   em 1.00, a ordem visível não mudou (esperado — o comparator `(b.passRate ?? -1) -
   (a.passRate ?? -1)` é estável para empates). Não foi observada uma reordenação visível de
   verdade por falta de linhas com `passRate` diferente nesta sessão, mas o mecanismo (clique
   → sort → re-render, sem exceptions) foi exercitado com dados reais.

### T10.15 — Ver trajetórias a partir do Compare ✅ (validado por clique real)
1. Após uma run, clique **Ver trajetórias**.
2. **Esperado:** abre uma nova aba com o `harbor view` daquele jobs dir.

### T10.16 — Layout responsivo (colapso de 2 colunas) 🔶 (regra CSS confirmada, viewport real não testado)
1. Redimensione a janela do navegador pra menos de 1100px de largura.
2. **Esperado:** `.compare-layout` colapsa pra uma coluna só (config em cima, resultado embaixo).
   **Nota:** confirmei que a regra `@media (max-width: 1100px) { .compare-layout {
   grid-template-columns: 1fr; } }` existe no CSS carregado, exatamente como escrita. Não
   consegui forçar o viewport real a encolher com as ferramentas de automação disponíveis
   (`resize_window` redimensiona a janela do SO, não o viewport de renderização neste
   ambiente). **Pendente confirmação visual manual** — redimensione a janela de verdade uma
   vez e confirme que o layout colapsa como esperado.

---

## 11. Datasets

### T11.1 — Listar link do Hub ✅ (validado por clique real)
1. Aba **Datasets**, clique **List registry datasets**.
2. **Esperado:** imprime um link pro Hub do Harbor (não uma lista navegável — limitação
   conhecida do Harbor, não desta UI).
   **Confirmado 2026-09-07**: `View registered datasets at https://hub.harborframework.com/datasets`.

### T11.2 — Baixar um dataset real ⬜ **nunca testado em nenhuma sessão**
1. Pegue um nome real de dataset no link do Hub, cole no form, clique **Download**.
2. **Esperado:** baixa em `datasets/<nome>/`, e as tasks de lá aparecem sozinhas na aba Tasks e
   no picker do Compare. **Requer decidir com o usuário qual dataset baixar antes de rodar —
   pode ser grande/demorado.**

---

## 12. Config Bundle

### T12.1 — Exportar clicando o botão de verdade ✅ (validado por clique real, pós-layout)
1. Aba **Config**, clique **Exportar bundle (.json)**.
2. **Esperado:** o navegador baixa um arquivo `harbor-eval-kit-config-<data>.json`; o texto de
   status mostra a contagem por registry. **Confirmado 2026-09-07**: arquivo apareceu de
   verdade em `Downloads/harbor-eval-kit-config-2026-09-07.json`, status mostrou
   `skills: 1, skillsets: 1, models: 9, agents: 4, criteria: 2, rubrics: 1, judges: 1`.

### T12.2 — Importar clicando o botão de verdade ✅ (validado por clique real, pós-layout)
1. Use o `<input type=file>` da aba Config pra selecionar o `.json` baixado no T12.1.
2. **Esperado:** status mostra "Importado -- N novo(s), M atualizado(s)" e a lista reflete.
   **Confirmado 2026-09-07** (via `DataTransfer` simulando a escolha real de arquivo, disparando
   o `change` real do input): `0 novo(s), 19 atualizado(s)` — idempotente, nada duplicou.

### T12.3 — Idempotência: apagar um item e reimportar ✅ (validado por clique real, antes do layout novo)
1. Apague um critério; importe o bundle exportado antes de apagar.
2. **Esperado:** o item volta, sem duplicar nada mais.

---

## 13. Logs

### T13.1 — Auto-popular ao trocar de aba ✅ (validado por clique real)
1. Durante uma run, clique na aba **Logs**.
2. **Esperado:** job picker já vem preenchido (marcando `▶` o que está rodando), arquivo
   preferencial é o `trial.log` (não o `reward.txt` de 1 byte), conteúdo aparece sozinho.

### T13.2 — Trocar de job/arquivo manualmente ✅ (validado por clique real)
1. Com jobs antigos no histórico, troque o **Job** e o **Arquivo de log** nos selects.
2. **Esperado:** conteúdo atualiza pro arquivo escolhido, offset reseta (não mistura conteúdo
   de dois arquivos diferentes).

### T13.3 — Desmarcar "Seguir" ✅ (validado por clique real)
1. Durante uma run, desmarque o checkbox **Seguir**.
2. **Esperado:** o conteúdo para de atualizar sozinho (polling continua rodando em background,
   mas o texto não se move) — confirmar que voltar a marcar retoma sem perder o que já tinha.

### T13.4 — Botão "Atualizar lista" manual ✅ (validado por clique real)
1. Clique **Atualizar lista** sem trocar de aba.
2. **Esperado:** relista os jobs (útil se uma run nova começou enquanto você já estava na aba).

---

## 14. Trajectories

### T14.1 — Iniciar viewer direto nesta aba (sem vir do Compare) ✅ (validado por clique real)
1. Aba **Trajectories**, preencha **Jobs dir** manualmente, clique **Start viewer**.
2. **Esperado:** mesmo comportamento do T10.15, mas iniciado daqui.

### T14.2 — Múltiplos viewers simultâneos ✅ (validado por clique real)
1. Inicie 2 viewers pra jobs dirs diferentes.
2. **Esperado:** lista mostra os 2, cada um com seu próprio **Stop**; parar um não afeta o outro.

---

## 15. Analyze (standalone)

### T15.1 — Analisar um path digitado à mão ✅ (validado por clique real — achou e corrigiu um bug)
1. Aba **Analyze**, cole um path de trial já existente (ex.: de uma run anterior), escolha
   Judge, clique o botão de analisar.
2. **Esperado:** mesmo resultado que analisar pela tabela do Compare, mas sem precisar ter
   acabado de rodar naquela sessão.

**Bug real encontrado e corrigido (2026-09-07):** a aba Analyze standalone **não tinha o
checkbox "Modo validação"** que o painel de Analyze do Compare tem — então era **impossível**
usar um Judge cadastrado em modo validação (ex.: DeepSeek) a partir desta aba: o gate do
servidor sempre recusava por faltar o flag, sem essa aba ter como enviá-lo. Corrigido
adicionando o mesmo checkbox (`gui/index.html`); `FormData` já lida sozinha com o
`Boolean("on")`/ausente, então nenhum JS extra foi necessário. Confirmado rodando de verdade
com o Judge de validação DeepSeek sobre um trial já existente em disco: `analysis.json`
gerado, resumo real da trajetória, renderizado corretamente em `#analyze-output`.

---

## Transversais (afetam várias abas)

### TX.1 — Modo compacto ✅ (validado por clique real)
1. Marque **Modo compacto** no cabeçalho.
2. **Esperado:** hints somem, `#cost-estimate`/`#logs-status`/`#config-bundle-status`
   continuam visíveis. Recarregar a página mantém marcado (localStorage).

### TX.2 — Clique no texto do label foca o campo (amostra de acessibilidade) ✅ (validado por clique real, 4 amostras)
1. Clique no texto de um label qualquer (não no campo em si) em 3-4 abas diferentes.
2. **Esperado:** o campo correspondente recebe foco.

### TX.3 — Tema claro (requer DevTools) ⬜
1. Chrome DevTools → ⋮ → More tools → **Rendering** → "Emulate CSS media feature
   prefers-color-scheme" → `light`.
2. **Esperado:** fundo claro, texto escuro, **inputs não ficam pretos** (bug já corrigido, mas
   nunca verificado com a emulação real do Chrome — só com override manual de variável CSS via
   JS, que é mais fraco como teste porque não passa pela media query de verdade).

### TX.4 — Navegação agrupada / responsiva ⬜
1. Redimensione a janela pra ~1300px e depois ~1024px de largura.
2. **Esperado:** os `<span class="nav-divider">` continuam visíveis; os botões quebram linha
   de forma legível, sem sobrepor texto.

---

## Resumo de cobertura

O total abaixo foi recontado direto dos cabeçalhos `### T*` deste arquivo em 2026-09-07 — a
tabela anterior dizia 49, que era uma contagem errada desde que o plano foi escrito (nunca
foram 49 cenários; sempre foram 59).

| Categoria | Antes de rodar o plano | Agora |
|---|---|---|
| ✅ Validado por clique real | 20 | **54** |
| 🔶 Só validado por API | 2 | 2 |
| ⬜ Nunca testado | 37 | **3** |
| **Total de cenários mapeados** | **59** | **59** |

Os 3 que sobraram não são esquecimento — cada um depende de algo que a automação não alcança:

- **T11.2** (baixar dataset real) — precisa de um nome real de dataset do Hub, escolha do dono.
- **TX.3** (tema claro) — precisa da emulação de `prefers-color-scheme` do DevTools de verdade.
- **TX.4** (nav responsiva) — precisa redimensionar a janela real do navegador.

Como conferir estes números sem confiar nesta tabela:

```bash
grep -c '^### T[0-9X]*\.[0-9]*' docs/PLANO_TESTES_UI.md              # total
grep -c '^### T[0-9X]*\.[0-9]*.*✅' docs/PLANO_TESTES_UI.md          # validados por clique
```
