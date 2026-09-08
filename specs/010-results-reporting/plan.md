# Plano — normalização e exportação

Contratos da implementação auditada em 2026-09-08; não são promessa de reconstruir
Harbor ou reexecutar modelos. A especificação 004 fica responsável pelo julgamento;
este plano define precisamente sua leitura e apresentação quantitativa.

## Leitura de execução

`parseResult(jobDir)` lê `<jobDir>/result.json` e retorna `Partial<ResultRow>`.
Arquivo inexistente: error=`result.json not found`; JSON inválido: erro do parser;
objeto/stats inválidos: `no valid 'stats' in result.json`; contagens obrigatórias
inválidas: `invalid trial counts in result.json`.

`stats.n_completed_trials` e `n_errored_trials` devem ser inteiros >=0. Inconsistência
ocorre se erros > concluídos, se `n_total_trials` presente não é inteiro >=0 ou é
diferente de concluídos, ou se pending/running/cancelled presentes não são contagens
válidas. Depois verificar finished_at como string não vazia e pending/running/
cancelled não positivos; depois exigir ao menos um concluído. Ordem das mensagens:
contagens inconsistentes → job incompleto/cancelado → nenhum trial concluído.
O leitor não interpreta a string finished_at como data ISO; isso é limite atual.

Campos retornados: `nTrials`, `nErrors`, `meanReward`, `costUsd`, `nInputTokens`,
`nOutputTokens`, `error`. `meanReward = soma(mean*n_trials)/soma(n_trials)`, usando
apenas grupos objeto em `stats.evals` com `metrics[0].mean` finito e n_trials inteiro
positivo. Sem grupos válidos: ausente. Não exigir cobertura desses grupos igual
a n_completed_trials nem restringir mean a [0,1] na baseline.
costUsd aceita número finito de stats.cost_usd; tokens exigem contagem inteira >=0.
O parser atual não rejeita custo negativo finito: documentar como dívida de validação,
não alegar proteção inexistente. O chamador decide `ok` usando erro/exit da execução.

GET `/api/jobs?dir=jobs` enumera diretórios não ocultos e retorna
`[{jobName,...parseResult}]`; raiz ausente retorna []. Não é endpoint de ranking
nem substitui os registros persistidos dos experimentos.

## Análise e denominadores

`normalizeAnalysis` aceita objeto com `results` array de objetos, ou objeto único
com checks objeto ou summary string (normalizado para results de um elemento).
Outro formato retorna null. Preserva campos/objetos por trial e adiciona aggregate.
Para cada check: outcome exatamente `pass`, `fail`, `not_applicable`; demais valores
contam unknown. Trial sem checks, ou com error/exception_info truthy, conta uma vez
em incompleteTrials. `applicable=pass+fail`; passRate só existe quando applicable>0,
unknown=0 e incompleteTrials=0. N/A não é aprovação e não entra no denominador.

Por trial usar cost_usd finito, senão estimated_cost_usd finito; valor >=0 conta.
Um cost_usd negativo finito não faz fallback para estimated_cost_usd. `costComplete`
requer pelo menos um trial e todos com custo reportado. Aggregate contém nTrials,
pass/fail/notApplicable/unknown/incompleteTrials/applicable/passRate, costComplete,
costReportedTrials, reportedCostUsd (ausente se nenhum reportou) e costUsd (somente
completo). Top-level estimated_cost_usd também só existe com custo completo. Esse
nome legado pode carregar total reportado por Harbor; não é estimativa criada pelo kit.

`summarizeAnalysisRecords` escolhe último registro por ordem do array; se possui
analysisBatchId agrega todos com esse ID, senão somente ele. Se último informa
analysisBatchSize, exigir tamanho igual e índices distintos na mesma quantidade.
Para score, todos precisam ok!=false, validationMode falso/ausente, aggregate sem
unknown/incompleteTrials. Soma passes/soma applicable; nenhum applicable omite score.
judgeCostUsd exige lote completo, ok!=false e costUsd numérico de todos. Custo pode
existir em validationMode mesmo quando score é omitido; não confundir custo com rank.
Índices na faixa/tamanho válido são responsabilidade da validação de entrada da API;
este agregador não revalida todos esses campos em artefatos arbitrários.

Artefato canônico: se entrada contém trial.log, `<entrada>/analysis.json`; senão
`<jobsDir>/<jobNameDaInvocação>/analysis.json`. Ausência, JSON inválido ou formato
não normalizável retorna null. Não usar analysis.json antigo da entrada de job nem
extrair path por regex da saída do terminal.

## Contrato do relatório e segurança

GET `/api/experiments/:id/report?jobsDir=jobs&format=json` aceita json (default) ou
csv; outro formato gera erro `formato de exportação deve ser csv ou json` antes
do download. Lê record.rows do experimento persistido; JSON é array indentado em
dois espaços. CSV tem esta ordem fixa:

```text
jobName,agent,model,skillset,ok,nTrials,nErrors,meanReward,durationSec,costUsd,nInputTokens,nOutputTokens,passRate,judgeCostUsd,error
```

Ausente/null vira célula vazia; strings começadas por whitespace e =,+,@,- ou por
tab/CR/LF recebem apóstrofo inicial. Números negativos permanecem numéricos. Vírgula,
aspas ou newline exigem aspas externas e duplicação de aspas internas. Final newline.
Headers: Content-Type application/json ou text/csv com charset=utf-8,
Content-Disposition attachment filename `experiment-<id>.<format>`, Cache-Control
no-store. Validar conteúdo antes de writeHead/end. `writeReport(rows,prefix)` valida
antes de gravar `<prefix>.json` e `.csv`; não há transação de rollback para falha
de filesystem após primeira gravação, apenas bloqueio de segurança antes de ambas.

`assertSafeExport` percorre recursivamente chaves e valores; recusa ciclos,
campos de credencial (secret/password/token/authorization e variantes API/access/
refresh/private/client key/token/secret), nomes de arquivo secrets.env/.env*/
credentials.json e extensões pem/pfx/p12 quando no campo name. Strings são comparadas
com segredos atualmente cadastrados e representação JSON escapada, padrões de
chaves conhecidas, private-key header, Bearer e atribuições de variáveis de segredo.
Erro genérico não imprime o conteúdo ofensivo e informa que nada foi exportado.
O endpoint ainda aplica redaction ao conteúdo aprovado antes de enviar. O teste
deve provar recusa antes dos headers, não apenas ausência no texto final.

Credenciais nunca são fonte de dados exportáveis. Detecção de texto arbitrário é
heurística adicional e não uma prova matemática contra todo segredo desconhecido;
novos campos devem permanecer fora do schema exportável se puderem portar segredos.
Metadados inofensivos também podem gerar falso positivo; recusa conservadora é intencional.

## Evidência e limites de validação

Implementação: `scripts/lib/results.ts`, `export-safety.ts`, `scripts/experiment-routes.ts`.
Testes reais existentes: results.test.ts (ponderação, parcialidade, lotes, artefato,
CSV), export-safety.test.ts (aninhamento, bundle e arquivos), export-route-security.test.ts
(JSON/CSV recusados antes dos headers), experiment-routes.test.ts. Para reconstrução,
usar fixtures independentes dessas implementações e depois gate completo offline.
Testes não comprovam calibração estatística nem custos reais dos providers. Segurança
de exportação deve ser reavaliada sempre que acrescentar campos ou formato.
