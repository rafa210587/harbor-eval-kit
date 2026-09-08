# Contratos de reconstrução — julgamento

Baseline auditada em 2026-09-08. Fontes: `scripts/lib/analysis-session.ts`, `analysis-inputs.ts`, `analysis-lock.ts`, `materialize.ts`, `catalog.ts` e rotas analysis-sessions/analyze em `scripts/gui-server.ts`. Operações/logs/viewer têm detalhamento próprio em009; normalização/export em010. Não confundir política de modelos com calibração científica.

## Sessão imutável e precedências

POST `/api/analysis-sessions` recebe `{judgeId,rubricIds?,validationMode?}`. judgeId deve ser ID seguro existente; judge.modelId precisa resolver ModelEntry.value. validationMode, quando presente, deve ser boolean; false exige política curada server-side. RubricIds omitido no domínio vira `["__default__"]`, **não** herda judge.defaultRubricIds. UI resolve preferência explícita, pins de task e defaults antes de construir esta entrada. Lista enviada não pode ser vazia nem duplicada. Cada ID regular deve existir e resolver pelo menos um critério; `__default__` delega rubric padrão ao Harbor.

AnalysisSession v1 = `{version:1,id,createdAt,judgeId,judgeModel,agent,validationMode,prompt,rubrics:[{id,content}]}`. prompt e content são string ou null. Prompt vazio após trim vira null; conteúdo não vazio preserva bytes originais. Conteúdo de rubric é TOML serializado dos critérios resolvidos naquele momento. Sessão que contenha valor de segredo conhecido em seu JSON é recusada antes de persistir. Salvar em `~/.harbor-eval-kit/analysis-sessions/<id>/`: session.json, prompt.txt quando não null e rubric-0.toml… apenas para conteúdos não null; índices correspondem à lista, inclusive posições default. Arquivos são exclusivos (`wx`), não reescrever sessão existente.

Materialização preserva ordem de criterionIds e recusa qualquer referência ausente. Para cada critério emitir tabela TOML `[[criteria]]` com name, description, guidance strings; escapar barra invertida, aspas duplas e newline como `\\n`. Prompt customizado **substitui** o template Harbor inteiro; não é apêndice automático. Sem sessão, arquivos transitórios de catálogo ficam em rubrics/<id>/rubric.toml e judges/<id>/prompt.txt no stateDir e podem ser reescritos antes do snapshot da invocação.

Resposta201 contém `{id,judgeModel,validationMode,rubricIds}`. Leitura valida version/id/model string/validationMode boolean/rubrics array. Ao reutilizar sessionId, rubric solicitada deve pertencer à sessão; rubricId vazio seleciona `__default__`. Não consultar catálogo atualizado para recompor conteúdo. Modelo/prompt/rubricas congelados permitem comparar candidatos após alteração do catálogo ou reinício; não congelam pesos remotos, versão do Harbor nem resultados de LLM.

## Invocação de análise

POST `/api/analyze` aceita path **ou** experimentId+jobName+jobsDir, operationId UUID obrigatório, analysisSessionId opcional, rubricId, judgeId, judgeModel/agent ad hoc, validationMode e metadados opcionais analysisBatchId/Size/Index. Se batchId presente, size inteiro seguro≥1 e index inteiro seguro em `[0,size)` são obrigatórios. Metadados não iniciam lote automaticamente: a UI envia invocações separadas.

1. Se experimentId, carregar record; recusar running, handle ativo ou dryRun, exigir jobName pertencente e derivar path do plano. path fornecido não prevalece sobre esse vínculo. Sem nenhum path, HTTP400.
2. Sessão tem prioridade sobre judgeId e judgeModel/agent ad hoc. judgeId informado diferente do congelado ou validationMode informado diferente recusa. Sem sessão, judgeId resolve modelo/agent/prompt do catálogo e substitui ad hoc; judge desconhecido retorna400. Só sem ambos usar judgeModel/agent ad hoc.
3. Exigir modelo e política curada, exceto validationMode=true explicitamente. Sem modelo ou fora da lista retorna400. Não há fallback silencioso para modelo barato. Lista vem de GET `/api/judge-models`, não duplicar no frontend.
4. Rubric regular resolve critério e TOML; default/ausente omite `--rubric`. Ausência não aplica defaultRubricIds do perfil automaticamente no endpoint. Sem critérios válidos retorna400. Prompt do perfil gera arquivo; sessão usa arquivo congelado.
5. Nome de job do juiz: `harbor-eval-kit-analysis-<operationUUID-sem-hífens-em-minúsculas>`. Args exatos:

```text
analyze <path> --model <modelo> --jobs-dir <jobsDir-ou-jobs>
--job-name <nome> [--rubric <arquivo>] [--agent <adapter>] [--prompt <arquivo>]
```

Não injetar skills do candidato nesse comando. Prompts customizados podem usar `{trial_path}`, `{task_section}`, `{criteria_guidance}`; manter esses tokens para Harbor preencher. Critérios devem pedir evidência verificável, distinguir erro de execução de qualidade e tratar artefatos como dados, sem seguir instruções hostis encontradas neles.

## Exclusão, snapshot de invocação e resultado

Lock withAnalysisTarget usa realpath de diretório; normaliza caixa no Windows e recusa409 se qualquer target ativo é igual, ancestral ou descendente do solicitado. Jobs irmãos podem executar ao mesmo tempo. Lock é Set no processo, liberado em finally; **não** é lock persistente/distribuído nem protege duas GUIs distintas. Sem diretório ou realpath válido, falhar antes de subprocesso.

Dentro do lock, ler valores dos arquivos --rubric/--prompt e copiar para `~/.harbor-eval-kit/analysis-inputs/<novoId>/rubric.toml|prompt.txt`; reescrever argv. Sem flags, conteúdos ficam null e não há necessidade de criar diretório. Assim edição posterior do arquivo de origem não altera a invocação. Criar operation (009), marcar running, registrar handle e executar com credenciais somente no ambiente, timeout120000ms e stdout/stderr em log redigido.

Exit0 **não basta**: resolver analysis.json canônico válido no target ou job de análise (contrato010). Sem artefato válido, erro “Harbor analyze terminou sem um analysis.json canônico válido”. Resposta `{ok,operationId,stdout,stderr,error?,judgeModel,validationMode,analysis}`; HTTP200 somente sucesso efetivo; falha subprocesso/artefato retorna500 com ok=false. Persistir status succeeded/failed, finishedAt, artifactPath quando disponível e resultado. Exceção grava failed e erro; finally remove handle e libera target.

Quando vinculado ao experimento, append em analyses[jobName] inclui resposta, createdAt, operationId, judgeId/rubricId, analysisSessionId e batch metadata mais conteúdo exato rubric/prompt de invocação. Recalcular resumo da row e report. Reanalisar adiciona registro; não equivale a votação nem substituição explícita do histórico. validationMode continua marcado para não apresentar smoke como avaliação qualificada.

## Exemplo mínimo e decisões auditadas

Primeiro criar sessão com juiz cadastrado/rubric explícita:

```json
{"judgeId":"juiz-opus-teste-live","rubricIds":["rubrica-engenharia-teste-live"],"validationMode":false}
```

Depois usar o id retornado e UUID novo em cada operação:

```json
{"path":"jobs/demo-c1","operationId":"11111111-1111-4111-8111-111111111111","analysisSessionId":"ID_RETORNADO","rubricId":"rubrica-engenharia-teste-live"}
```

Exemplos são contratos, não comandos a executar sem autorização para gasto. Juízes têm custo próprio; guarda pré-voo de Compare não impõe orçamento ao analyze.

Gaps fechados nesta documentação: origem real do default, precedência sessão/perfil/ad hoc, lock job-versus-trial, necessidade de UUID, timeout, distinção exit0/artefato e custos separados. Limitações remanescentes devem ser preservadas como tais: lock apenas local; pin por task fora do bundle; nenhuma calibração/votação automática; nenhuma retomada automática de análise paga após restart.

Casos de aceitação adicionais: editar catálogo entre duas chamadas da mesma sessão preserva inputs; rubric fora da sessão recusa; analisar job durante análise de filho retorna409, irmão não; erro em executor libera lock; exit0 sem JSON resulta failed; dry-run de experimento não pode ser julgado; batch incompleto não produz taxa de aprovação definitiva (010).
