# Plano — catálogos e segurança

Baseline retrospectiva **2026-09-08**. Depende de `001-local-runtime` para estado/execução local. Proteção de segredos é transversal desde a primeira rota.

## Arquitetura

`scripts/lib/types.ts` define entidades. `registry-validation.ts` valida entrada e referências; `registry-service.ts` aplica operações; `paths.ts` persiste sob ~/.harbor-eval-kit. `bundle.ts` implementa import/export. `export-safety.ts` é gate comum de catálogo e relatórios. `secrets.ts` fornece ambiente privado e `exec.ts` redige processos. `gui/app/config-bundle.js` envia o arquivo escolhido à API.

## Dados

Persistência: `~/.harbor-eval-kit/registries/<registry>.json`, uma lista por registry. Campos base são id e label para modelos/agentes/skills/conjuntos/rubricas/juízes; critérios usam id e name.

| Entidade | Campos para reconstrução |
|---|---|
| ModelEntry | id, label, value (identificador provider/model) |
| AgentEntry | id, label, agentValue (adapter Harbor), modelId?, instructions?, defaultSkillsetIds?, notes? |
| SkillEntry | id, label, mode authored/path, instructions?, path?, extraFiles?: [{name,content}] |
| SkillsetEntry | id, label, skillIds[] |
| CriterionEntry | id, name, description, guidance |
| RubricEntry | id, label, criterionIds[] |
| JudgeEntry | id, label, agentValue, modelId?, promptTemplate?, defaultRubricIds?, notes? |

promptTemplate admite `{trial_path}`, `{task_section}` e `{criteria_guidance}` do Harbor. IDs são referências estáveis, labels são apresentação e não substituem identificadores oficiais de modelos/adapters.

- AgentEntry: modelId, instructions e defaultSkillsetIds.
- SkillsetEntry → skillIds; RubricEntry → criterionIds; JudgeEntry → modelId/defaultRubricIds.
- SkillEntry authored: instructions e extraFiles(name,content); path: diretório externo.
- ConfigBundle: version=1, exportedAt, registries. ImportSummary: added, updated, byRegistry, warnings.
- Importação valida o snapshot mesclado inteiro; substituições individuais são atômicas, conjunto de arquivos não é transação de filesystem.

## Contratos

- GET `/api/config/export`: validar snapshot e segurança antes de serializar download.
- POST `/api/config/import`: validar v1, fazer upsert e retornar sumário.
- CRUD `/api/agents`, `/api/models`, `/api/skills`, `/api/skillsets`, `/api/criteria`, `/api/rubrics`, `/api/judges`.
- `/api/secrets` expõe nomes/estado, não valores.
- Import na GUI acontece no change do input file; limpar input permite selecionar o mesmo arquivo de novo.

## Reconstrução e testes

### Providers e LiteLLM opcional

`scripts/lib/provider-probe.ts` invoca `scripts/python/probe_provider.py` usando o Python isolado do Harbor (`harbor-python.ts`). Descoberta e teste pago são modos distintos. GET `/api/providers/:provider/models` descobre modelos; teste pago exige escolha explícita de modelo com prefixo do provider. Resultado: ok, testedModel (string/null), discoveredModels[], error (string/null). Timeout é 30 segundos; credencial entra por ambiente e stdout/stderr são redigidos. Descobrir IDs não comprova que uma completion específica tenha saldo/quota/acesso.

`scripts/lib/litellm.ts` configura somente ambiente opcional de proxy; não instala nem inicia o serviço. LitellmGatewayConfig: enabled=false por padrão, hostBaseUrl?, containerBaseUrl?, inferenceKeyEnv?, masterKeyEnv?, env (mapa de templates). URLs são HTTP(S) sem credenciais embutidas. Templates admitem `{hostBaseUrl}`, `{containerBaseUrl}`, `{inferenceKey}`. Variáveis de infraestrutura (DOCKER_HOST, PATH, HOME e HARBOR_*, entre outras) são bloqueadas. Nomes de variáveis sensíveis exigem placeholder de inferenceKey. Master key não é enviada aos agentes; inferenceKeyEnv referencia segredo privado de inferência. Teste direto pelo SDK e proxy opcional são integrações distintas.

Suítes adicionais: `scripts/lib/provider-probe.test.ts`, `provider-domain.test.ts`, `litellm.test.ts`. Testes reais de provider/proxy ficam fora do gate offline e exigem evidência específica; manter proxy desligado nesta preparação.

Implementar tipos → paths/validação → CRUD → materialização → secrets/redaction → gate export → bundle → GUI. Não copiar estado privado do desenvolvedor para fixtures.

Fontes adicionais: `scripts/lib/materialize.ts`, `httpguard.ts`, `http-body.ts`, `scripts/gui-server.ts` e `scripts/experiment-routes.ts`.

Suítes sob `scripts/lib`: `registry-validation.test.ts`, `registry-service.test.ts`, `bundle.test.ts`, `export-safety.test.ts`, `export-route-security.test.ts`, `httpguard.test.ts`, `http-body.test.ts`. Executar gate `scripts/test.ps1` ou `scripts/test.sh`.

## Evidência e limites

Evidência offline desta entrega está registrada no índice SDD; validação real de UI/runtime é separada. Bundle não leva tasks, resultados, credenciais ou pins de task. Falhas de I/O exigem diagnóstico do estado após import, sem prometer rollback global. API local não é serviço corporativo multiusuário autenticado. Scanner reconhece valores conhecidos/padrões, não toda forma imaginável de segredo desconhecido.

Constitution check: credenciais fora de repo/argv/logs/exports, paths seguros, domínio fora do HTML, testes de cada guard e documentação junto da mudança. AWS somente documentação.
