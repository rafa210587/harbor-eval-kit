# Contratos de reconstrução — experimentos

Baseline auditada em 2026-09-08. Estes contratos complementam spec/plan/tasks; descrevem a implementação, incluindo limites, sem afirmar execução real. Fontes: `scripts/lib/experiment-{plan,store,runner}.ts`, `cost.ts`, `naming.ts`, `scripts/experiment-routes.ts` e `scripts/compare-matrix.ts`.

## Entrada, resolução e identidade

HTTP estimate/compare recebe `{path, entries:[{agentId,modelId?,skillsetIds?}], jobsDir?,jobPrefix?,runId?,nAttempts?,concurrency?,dryRun?,env?,extra?,title?,description?,baselineIndex?}`. `entries` deve ser lista não vazia; referências inexistentes abortam antes de executar. Não há produto cartesiano implícito na UI. CLI constrói produto cartesiano, em ordem agent → model → skillset, com flags repetíveis `--agent`, `--model`, `--skillset`; skills separadas por vírgulas compõem uma variante. Modelo CLI omitido vira null; skillset omitido ou vazio vira `none`.

1. modelId omitido herda agent.modelId; vazio remove override e omite `--model`.
2. skillsetIds omitido herda defaultSkillsetIds; [] remove conjuntos. União preserva primeira ocorrência de skillId. `agent.instructions` não vazio é inserido antes das skills como authored `agent-<agentId>`; portanto remover conjuntos não remove instruções do perfil.
3. path é absoluto: task local com task.toml ou dataset de filhos imediatos contendo task.toml, ordenados por caminho. Não faz busca recursiva. Diretório raiz simbólico ou qualquer filho simbólico do dataset é recusado.
4. Defaults: jobsDir=jobs, prefix=cmp, UUID para runId, attempts=concurrency=1, dryRun=false, env=docker. Apenas docker conectado ao Podman é aceito. Inteiros são convertidos por Number e precisam ser safe integer positivo. Volume `tasks × attempts × candidates` também deve ser seguro. Concurrency limita processos `harbor run`, não é multiplicador de trials.
5. title/description aceitam até 120/1000 caracteres antes de trim. baselineIndex é inteiro zero-based no intervalo de candidatos; não altera execução ou custo.
6. runId: `[A-Za-z0-9][A-Za-z0-9_-]{0,127}`. IDs de candidatos: candidate-1, candidate-2… Job: `<prefix-sanitizado-até16>-<runId>-c<índice1based>`. Limite70 caracteres; runId longo é substituído pelos primeiros16 hex SHA256 quando excede orçamento do nome. Sanitizar troca caracteres fora de letras/dígitos/`.`/`_`/`-` por `-`, remove hífens das pontas e usa x se vazio.
7. Validar limite240 caracteres para diretório de job, `.experiments/<id>/experiment.json` e caminho projetado `<job>/<taskMaisLonga>__XXXXXXX/artifacts/logs/artifacts`. Falha deve instruir encurtar jobsDir/task antes de qualquer trial.

`extra` tokeniza espaços e aspas simples/duplas (sem shell e sem interpretação de escapes). Aceita somente `--timeout-multiplier`, `--ak`, `--agent-kwarg`, com valor separado ou `=`. Rejeita aspas abertas, valor vazio/iniciado por hífen, multiplicador não finito/não positivo, kwarg sem `=` e chaves de credenciais; max_tokens exige inteiro positivo. Valores iniciados por `{`/`[` exigem JSON válido e busca recursiva de chaves api-key/secret/password/credential/authorization/access-token/auth-token/bearer. Não aceitar flags de task/model/retries/config que contornem o plano.

## Persistência e execução

ExperimentPlan v1 guarda id, createdAt ISO, taskPath, tasks[], jobsDir, nAttempts, concurrency, dryRun, env, extra[], metadados e candidates[]. Cada candidato guarda id, label, profileId opcional, agent, model string/null, skills[], skillset `{label,paths}`, jobName.

Reservar `jobsDir/.experiments/<id>` com mkdir exclusivo. Snapshot clona plano, copia tasks para `inputs/tasks/<basename>` e reescreve taskPath para cópia (tasks[] mantém caminhos de origem). Skills ficam em `inputs/<candidateId>/skills/<basename-ou-skill-id>/`; authored gera SKILL.md e extraFiles, path exige SKILL.md. Preservar bytes e permissões dos arquivos; SHA256 por arquivo com path relativo em barras `/`. Diretórios de skills duplicados ignorando caixa são recusados por candidato. Recusar `.git`, links/junctions, arquivos especiais, snapshot dentro de sua entrada, nomes de arquivos `.env*`, secrets.env, credentials.json, pem/pfx/p12. Este filtro por nome não é scanner completo do conteúdo de toda task: não prometer essa garantia adicional.

Record: `{plan,status,nodeVersion,testedHarborVersion,harborVersion?,inputs:[{path,sha256}],rows:[],analyses:{},finishedAt?,error?}`. Escrita JSON usa arquivo temporário exclusivo e rename. Falha parcial de snapshot persiste status failed e erro genérico “nenhum trial iniciado”; reserva permanece para inspeção, não é reutilizada silenciosamente.

Runner verifica valores secretos conhecidos no JSON do plano antes da guarda/snapshot; secrets entram somente no ambiente de subprocessos e são redigidos dos outputs. Sequência: guarda → reserva/snapshot → running → `harbor --version` (10s) → pool de candidatos → relatório. Cada candidato executa argv:

```text
run --path <snapshot> --agent <adapter> --env docker --jobs-dir <dir>
--job-name <nome> --n-attempts <n> [--model <valor>] [--skill <cópia>]... -y
[--print-config] [extras permitidos]
```

Dry-run ainda cria experimento/snapshot/logs, consulta Harbor e roda `--print-config`; não inicia trials. Não é “não escreve nada”. Diretório de job já existente impede execução. Código não zero guarda stderr redigido (últimos4000 caracteres) ou exit code; código zero em execução real exige parseResult válido e nErrors=0 para row.ok. Cada conclusão persiste row; resultado final ordena filas na ordem dos candidatos. Cancelled vence failed/finished; exceção externa grava failed/error/finishedAt.

Leitura de record running reconcilia resultados terminados em disco; não sobrescreve cancelamento com finished_at:null. Se todas as rows disponíveis, deriva finished/failed sem adotar handle antigo. GET inclui canCancel somente se ativo neste servidor e executionUncertain se running sem handle. Não há retomada automática de processo nem lock global entre múltiplos servidores para um mesmo experimento.

## Custo reproduzível

Histórico aceita somente result.json terminado com stats.cost_usd finito **>0** e n_total_trials inteiro positivo. Lê nomes legados e planos novos, deduplicando caminho do resultado. Primeira escolha: mesmo agent+model sanitizados; fallback: mesmo modelo com qualquer agent (exceto `(default)`). Média ponderada = soma custos / soma trials; estimativa por row = média × attempts × tasks. Skills/task não filtram amostras. Oracle/Nop têm custo estimado0, sem amostras; modelo desconhecido tem null. Total soma somente conhecidos e permanece null se nenhum conhecido; unknown[] denuncia estimativa parcial.

Guarda: acknowledgeCost=true libera este pré-voo; dryRun também. Se qualquer desconhecido e volume de rows potencialmente pagas >5 trials, recusar mesmo com teto ausente. Depois, teto positivo menor que estimativa recusa. Teto0/null desliga comparação com teto, **não** guarda de volume desconhecido. Teto inválido/negativo recusa. Concurrency não multiplica orçamento. Não é limite financeiro em tempo real; kwargs de custo dependem do adapter e juízes têm custos separados.

## HTTP/CLI e exemplos mínimos

POST `/api/compare/estimate` retorna200 com estimateUsd, rows, unknown, totalTrials, nTasks, plan. POST `/api/compare` permanece aberto até conclusão, retornando `{ok:true,experimentId,cancelled,rows,reportJson,reportCsv}`; ok do envelope não significa todas as rows aprovadas. Guarda/runId duplicado retornam409; guarda inclui estimate e needsAcknowledge. POST `/api/compare/cancel` com runId retorna404 sem handle local; com handle marca cancelled, termina árvores de subprocessos e tenta parar containers de propriedade comprovada. GET `/api/experiments?jobsDir=...` lista do disco; registros ilegíveis aparecem unreadable. Detalhes/export são descritos também em 010.

```json
{"path":"evals/python/simples-teste-live","runId":"demo-contract","dryRun":true,"nAttempts":1,"concurrency":1,"entries":[{"agentId":"agente-flash-teste-live","skillsetIds":[]}]}
```

CLI equivalente de dimensão (sem referência ao catálogo): `node scripts/compare-matrix.ts --path evals/python/simples-teste-live --agent mini-swe-agent --model deepseek/deepseek-v4-flash --skillset "" --dry-run`. `--interactive` é recusado antes de spawn porque stdin é fechado; `--yes-spend` reconhece guarda; `--out-prefix` cria export adicional; rows com falha produzem exit1.

## Auditoria e casos que a baseline anterior omitia

Recriar testes independentes para nomes compactos/limite240, snapshot parcial reservado, instruções persistindo na ablação, média ponderada/fallback, 5 versus6 trials desconhecidos e concorrência não multiplicando trials. Verificar dry-run com executor fake (nenhum container), cancelamento antes de começar, reinício sem controle e exit0 com resultado inconsistente. Precedências e algoritmos acima estavam ausentes ou resumidos demais nas seis specs originais. Este documento reduz adivinhação; não equivale a reprodução bit a bit dos pesos/API do provedor nem certificação de runtime.
