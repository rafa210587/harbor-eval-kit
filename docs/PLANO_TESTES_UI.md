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

### T1.1 — Salvar uma chave pelo dropdown de provider ⬜
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

### T1.4 — Remove ⬜
1. Clique **Remove** numa chave de teste.
2. **Esperado:** some da lista; `GET /api/secrets` não lista mais o nome.

---

## 2. Models

### T2.1 — Cadastrar model manualmente ⬜
1. Aba **2. Models**. Label = `Teste`, provider/model = `deepseek/deepseek-v4-flash`.
2. **Esperado:** aparece na lista com badge indicando se `DEEPSEEK_API_KEY` já está cadastrada.

### T2.2 — Checklist de models descobertos ao vivo (via Secrets → Test) ⬜
1. Aba Secrets, clique **Test** numa chave válida com listagem ao vivo suportada.
2. Marque 1-2 checkboxes do checklist que aparece.
3. **Esperado:** os models marcados aparecem cadastrados na aba Models sem digitar nada.

### T2.3 — Editar e apagar ⬜
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

### T3.2 — Skill por pasta existente ⬜
1. Modo "Usar pasta existente", aponte pra um caminho real no disco.
2. **Esperado:** salva sem materializar nada (é só uma referência de caminho).

### T3.3 — Anexar `.md` via input de arquivo ⬜
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

### T5.2 — Anexar Instructions via `.md` ⬜
1. Em outro agent, use o `<input type=file>` abaixo do textarea de Instructions.
2. **Esperado:** textarea preenchido com o conteúdo do arquivo anexado.

### T5.3 — Editar e cancelar edição ⬜
1. Clique num agent existente pra editar; o formulário muda pra "Save changes" +
   "Cancel edit".
2. Clique **Cancel edit**.
3. **Esperado:** formulário volta ao estado de criação, nada foi alterado no agent.

---

## 6. Criteria

### T6.1 — Criar um critério ✅ (validado por clique real, em teste anterior)
1. Aba **6. Criteria**: name, description, guidance.
2. **Esperado:** aparece na lista; disponível no picker da aba Judge Rubrics.

### T6.2 — Editar e apagar (com uso em rubric) ⬜
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

### T8.3 — Editar as instruções do juiz (prompt customizado) ⬜
1. Edite o campo "Instruções do juiz", removendo um dos marcadores obrigatórios
   (`{trial_path}`, `{task_section}`, `{criteria_guidance}`).
2. Salve e rode um Analyze com esse Judge.
3. **Esperado:** o Harbor não quebra (ele só preenche o que existir no texto), mas o juiz fica
   sem parte da orientação — documentar o que de fato aconteceu.

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

### T9.4 — Steps > 0 (task multi-etapa) ⬜
1. Crie uma task com **Steps = 2**.
2. **Esperado:** gera `steps/step-1/` e `steps/step-2/`, cada um com seu próprio
   `instruction.md`/`test.sh`. **Nunca testado nesta sessão** — comportamento multi-step do
   Harbor em si não foi exercitado.

### T9.5 — Skip pytest/solution templates ⬜
1. Crie uma task marcando **Skip pytest template** e/ou **Skip solution template**.
2. **Esperado:** o esqueleto gerado não inclui esses arquivos de exemplo.

---

## 10. Compare (o núcleo)

### T10.1 — Adicionar entrada, override de model na linha ✅ (validado por clique real)
1. Aba **10. Compare**. Escolha um agent, clique **Adicionar**.
2. Na linha criada, troque o model no `<select class="entry-model">` pra outro cadastrado.
3. **Esperado:** a linha reflete o override sem alterar o agent original.

### T10.2 — Remover uma entrada ⬜
1. Clique **Remover esta entrada** numa linha.
2. **Esperado:** some da lista; contador de "N entradas adicionadas" atualiza.

### T10.3 — Estimativa de custo ao vivo ✅ (validado por clique real)
1. Com uma linha adicionada e uma task escolhida, observe **Custo estimado**.
2. Mude n-attempts de 1 pra 5.
3. **Esperado:** o texto atualiza sozinho (sem precisar rodar), multiplicando pelo histórico.

### T10.4 — Guarda de gasto: teto excedido bloqueia ✅ (validado por clique real, via API)
1. Configure um teto baixo (ex.: `0.001`) sabendo que a estimativa é maior.
2. Clique **Run comparison**.
3. **Esperado:** aparece um `confirm()` do navegador com a mensagem da guarda; cancelar não
   gasta nada; confirmar roda mesmo assim. **Fazer este teste clicando o botão de verdade, não
   só via curl** (a versão via API já foi validada; falta clicar `Run comparison` de propósito
   sobre um teto estourado e ver o `confirm()` nativo aparecer).

### T10.5 — Guarda de gasto: volume às cegas bloqueia ⬜
1. Use um agent+model **nunca rodado antes** (sem histórico), com n-attempts alto (ex.: 10).
2. Clique **Run comparison**.
3. **Esperado:** recusa por "às cegas" antes dos 5 trials pagos, mesmo sem teto configurado.

### T10.6 — Rodar de verdade (💰 gasta API) ✅ (validado por clique real, múltiplas vezes)
1. Task real + 1 linha com model barato, n-attempts=1. Clique **Run comparison**.
2. **Esperado:** botão trava, texto "Rodando…" com cronômetro, botão **Cancelar** aparece,
   log ao vivo popula, ao terminar a tabela mostra reward/custo/tokens reais.

### T10.7 — Cancelar uma run em andamento (💰 gasta um pouco de API) ⬜ desde o layout novo
1. Dispare uma run real, e **antes de terminar**, clique **Cancelar**.
2. **Esperado:** texto muda pra "Cancelando…", depois mostra quantos processos/containers
   foram parados; a linha na tabela final (se aparecer) mostra `error: cancelado pelo usuário`.
   **Validado por clique real numa sessão anterior ao layout de 2 colunas — repetir pra
   confirmar que a reestruturação do HTML não quebrou o botão/seu texto.**

### T10.8 — Dry run ⬜
1. Marque **Dry run**, rode.
2. **Esperado:** `harbor run --print-config`, sem container, sem custo. Confirmar que o painel
   de log ao vivo **não** aparece (só ativa quando `!dryRun`).

### T10.9 — Aviso de Judge faltando ✅ (validado por clique real)
1. Com rubrics cadastrados e **zero** Judges, olhe o painel "4. Analisar" após uma run.
2. **Esperado:** aviso `⚠ Você já tem rubrics cadastrados, mas nenhum Judge` em vez de um
   dropdown vazio sem explicação.

### T10.10 — Analisar uma linha (💰 gasta API do juiz) ✅ (validado por clique real)
1. Após uma run com `ok:true`, escolha um Judge (curado) + marque um rubric, clique
   **Analisar** na linha.
2. **Esperado:** painel de resultado com summary + checks (pass/fail/n-a) reais.

### T10.11 — Modo validação no painel Analisar (💰 gasta API do juiz, barato) ✅ (validado por clique real)
1. Use um Judge cadastrado em modo validação (T8.2), marque **Modo validação** no painel
   Analisar também, clique **Analisar**.
2. **Esperado:** resultado vem com aviso `⚠ Modo validação: julgado por <model>...`.

### T10.12 — Analisar sem marcar Modo validação, com Judge de validação ⬜
1. Mesmo Judge do T8.2, mas **sem** marcar Modo validação no painel Analisar.
2. **Esperado:** recusado (400/409) com a mensagem do gate — nunca deixa passar mesmo tendo
   marcado no cadastro do Judge.

### T10.13 — Analisar todas ⬜
1. Com 2+ linhas `ok:true`, clique **Analisar todas**.
2. **Esperado:** roda o mesmo Judge+rubrics em cada linha, uma de cada vez (sequencial, não
   paralelo).

### T10.14 — Ordenar por avaliação ⬜
1. Após analisar algumas linhas (com `passRate` diferente), clique **Ordenar por avaliação**.
2. **Esperado:** tabela reordena por `passRate` desc.

### T10.15 — Ver trajetórias a partir do Compare ✅ (validado por clique real)
1. Após uma run, clique **Ver trajetórias**.
2. **Esperado:** abre uma nova aba com o `harbor view` daquele jobs dir.

### T10.16 — Layout responsivo (colapso de 2 colunas) ⬜
1. Redimensione a janela do navegador pra menos de 1100px de largura.
2. **Esperado:** `.compare-layout` colapsa pra uma coluna só (config em cima, resultado embaixo).

---

## 11. Datasets

### T11.1 — Listar link do Hub ⬜
1. Aba **Datasets**, clique **List registry datasets**.
2. **Esperado:** imprime um link pro Hub do Harbor (não uma lista navegável — limitação
   conhecida do Harbor, não desta UI).

### T11.2 — Baixar um dataset real ⬜ **nunca testado em nenhuma sessão**
1. Pegue um nome real de dataset no link do Hub, cole no form, clique **Download**.
2. **Esperado:** baixa em `datasets/<nome>/`, e as tasks de lá aparecem sozinhas na aba Tasks e
   no picker do Compare. **Requer decidir com o usuário qual dataset baixar antes de rodar —
   pode ser grande/demorado.**

---

## 12. Config Bundle

### T12.1 — Exportar clicando o botão de verdade ⬜ desde o layout novo
1. Aba **Config**, clique **Exportar bundle (.json)**.
2. **Esperado:** o navegador baixa um arquivo `harbor-eval-kit-config-<data>.json`; o texto de
   status mostra a contagem por registry. **Só validado via `fetch()` direto depois do layout
   novo — falta clicar o botão de verdade e confirmar que o download realmente cai no disco.**

### T12.2 — Importar clicando o botão de verdade ⬜ desde o layout novo
1. Use o `<input type=file>` da aba Config pra selecionar o `.json` baixado no T12.1 (ou peça
   pro usuário escolher manualmente, já que scripts não conseguem simular escolha de arquivo
   real do SO).
2. **Esperado:** status mostra "Importado -- N novo(s), M atualizado(s)" e a lista reflete.

### T12.3 — Idempotência: apagar um item e reimportar ✅ (validado por clique real, antes do layout novo)
1. Apague um critério; importe o bundle exportado antes de apagar.
2. **Esperado:** o item volta, sem duplicar nada mais.

---

## 13. Logs

### T13.1 — Auto-popular ao trocar de aba ✅ (validado por clique real)
1. Durante uma run, clique na aba **Logs**.
2. **Esperado:** job picker já vem preenchido (marcando `▶` o que está rodando), arquivo
   preferencial é o `trial.log` (não o `reward.txt` de 1 byte), conteúdo aparece sozinho.

### T13.2 — Trocar de job/arquivo manualmente ⬜
1. Com jobs antigos no histórico, troque o **Job** e o **Arquivo de log** nos selects.
2. **Esperado:** conteúdo atualiza pro arquivo escolhido, offset reseta (não mistura conteúdo
   de dois arquivos diferentes).

### T13.3 — Desmarcar "Seguir" ⬜
1. Durante uma run, desmarque o checkbox **Seguir**.
2. **Esperado:** o conteúdo para de atualizar sozinho (polling continua rodando em background,
   mas o texto não se move) — confirmar que voltar a marcar retoma sem perder o que já tinha.

### T13.4 — Botão "Atualizar lista" manual ⬜
1. Clique **Atualizar lista** sem trocar de aba.
2. **Esperado:** relista os jobs (útil se uma run nova começou enquanto você já estava na aba).

---

## 14. Trajectories

### T14.1 — Iniciar viewer direto nesta aba (sem vir do Compare) ⬜
1. Aba **Trajectories**, preencha **Jobs dir** manualmente, clique **Start viewer**.
2. **Esperado:** mesmo comportamento do T10.15, mas iniciado daqui.

### T14.2 — Múltiplos viewers simultâneos ⬜
1. Inicie 2 viewers pra jobs dirs diferentes.
2. **Esperado:** lista mostra os 2, cada um com seu próprio **Stop**; parar um não afeta o outro.

---

## 15. Analyze (standalone)

### T15.1 — Analisar um path digitado à mão ⬜
1. Aba **Analyze**, cole um path de trial já existente (ex.: de uma run anterior), escolha
   Judge, clique o botão de analisar.
2. **Esperado:** mesmo resultado que analisar pela tabela do Compare, mas sem precisar ter
   acabado de rodar naquela sessão.

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

## Resumo de cobertura (antes de rodar este plano)

| Categoria | Quantidade |
|---|---|
| ✅ Já validado por clique real | 20 |
| 🔶 Só validado por API | 2 |
| ⬜ Nunca testado | 27 |
| **Total de cenários mapeados** | **49** |

Maiores lacunas concentradas em: **Tasks** (multi-step, skip templates), **Datasets**
(nunca baixou nada de verdade), **Config Bundle** (export/import pós-layout-novo), e
**Logs/Trajectories** (interações manuais, fora do fluxo automático do Compare).
