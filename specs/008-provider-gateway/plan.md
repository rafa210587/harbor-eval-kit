# Plano técnico — providers e LiteLLM

## Interfaces e persistência

| API | Contrato |
|---|---|
| GET `/api/providers` | lista canônica `{id,label,prefixes,envKey}` |
| GET `/api/secrets` | array de nomes ordenados, sem valores |
| POST `/api/secrets` | `{name,value}`; 200 `{ok:true}`, validação 400 `{ok:false,error}` |
| DELETE `/api/secrets/:name` | remoção idempotente; 200 `{ok:true}` |
| POST `/api/secrets/test` | `{name,model}`; nome não mapeado ou não salvo: 400; resultado 200 ou 502 |
| GET `/api/providers/:provider/models?envKey=...` | envKey opcional precisa corresponder ao catálogo; provider precisa envKey; resultado 200 ou 502 |
| GET `/api/status` | `litellmGateway:{enabled,baseUrl,configPath}`; baseUrl nula OFF, host preferido a container ON |

Resultado probe: `{ok:boolean,testedModel:string|null,discoveredModels:string[],
error:string|null}`. Validações que lançam exceção usam handler HTTP geral. Não há
endpoint de salvar/iniciar gateway nesta baseline; editar JSON local é operação
de setup. Secrets: `<stateDir>/secrets.env`, nome `^[A-Z][A-Z0-9_]*$`, valor sem CR/LF.
Parser ignora linhas vazias/comentários/sem `=`, separa no primeiro `=` após trim
da linha. Escrita substitui arquivo com `KEY=value\n`, mode 0600 solicitado. Valor
vazio é aceito ao salvar, mas probe rejeita credencial vazia; mode não equivale a
auditoria ACL Windows. Estado vem de `paths.ts`, nunca pasta do clone por default.

## Catálogo congelado nesta baseline

O [fixture público](../fixtures/catalog-reference.json) contém os valores completos
da referência: 15 providers, 41 adapters, dois adapters gratuitos e cinco modelos
curados de juiz. É dado de aceitação, não cópia do estado local nem prova de
disponibilidade comercial. Reproduzir o catálogo server-side a partir desses dados.
GET `/api/harbor-agents` retorna `{agents:[{value,modelAgnostic}],freeAgents:[...]}`;
GET `/api/judge-models` retorna `[{label,value}]`. O campo de adapter continua texto
livre para import paths customizados; modelAgnostic é orientação, não instalação
automática nem certificação de qualquer par adapter/modelo. A lista reflete
AgentFactory do Harbor 0.22.0 e precisa ser revista numa atualização do Harbor.

| id | envKey | prefixes quando diferentes de `id/` |
|---|---|---|
| anthropic | ANTHROPIC_API_KEY | — |
| openai | OPENAI_API_KEY | — |
| azure | AZURE_API_KEY | — |
| deepseek | DEEPSEEK_API_KEY | — |
| gemini | GEMINI_API_KEY | gemini/, google/ |
| vertex_ai | VERTEXAI_API_KEY | — |
| openrouter | OPENROUTER_API_KEY | — |
| groq | GROQ_API_KEY | — |
| mistral | MISTRAL_API_KEY | — |
| cohere | COHERE_API_KEY | — |
| xai | XAI_API_KEY | — |
| together_ai | TOGETHERAI_API_KEY | — |
| fireworks_ai | FIREWORKS_AI_API_KEY | — |
| ollama | null | — |
| bedrock | null | — |

Nulo significa sem teste por chave simples; não significa adapter instalado ou
provider universalmente configurável somente com esses campos.

## Probe e UI

Validar modelo string com prefixo literal `<provider>/` e regex
`^[a-zA-Z0-9][a-zA-Z0-9_.:/-]{1,199}$` (2–200 caracteres). Python vem do ambiente
Harbor isolado; ausência retorna failed sem spawn. Passar script
`scripts/python/probe_provider.py`, modo, provider e modelo em argv; chave somente
`extraEnv`. Desativar ajuste Docker host, timeout 30.000 ms. Redigir stdout/stderr
com todos segredos conhecidos antes de parse; ler última linha JSON. Exit não-zero
retorna últimos 2.000 caracteres de stderr/stdout; parse inválido retorna diagnóstico
redigido. Python captura exceções em resultado `ok:false`, não depende de exit !=0.

Python discover: `litellm.get_valid_models(check_provider_endpoint=True,
custom_llm_provider=provider)`. Python test: `litellm.completion(model=model,
messages=[{role:"user",content:"Reply OK"}],max_tokens=8,timeout=20)`.
Suprimir debug do SDK. Não executar testes para validar esta documentação.

Normalizar descoberta: aceitar só strings não vazias, trim, prefixar provider
somente se não houver `/`, rejeitar lado vazio da barra, deduplicar depois de
prefixar. UI compara valores exatos existentes; cadastro selecionado chama POST
`/api/models` com `{label:value,value}` sequencialmente. Lock desde primeiro envio
até finally; refresh após todos; após refresh localizar nó de status vivo pelo
nome da credencial. Falha intermediária não reverte modelos já criados.

## Gateway: schema e algoritmo

`<stateDir>/litellm-gateway.json` ausente ou JSON objeto com `enabled` ausente/false
resulta OFF e env vazio. JSON malformado ou raiz não-objeto falha. OFF ignora demais
campos; ON exige `enabled:true` e aceita somente `_comment`, `enabled`, `hostBaseUrl`,
`containerBaseUrl`, `inferenceKeyEnv`, `masterKeyEnv`, `env`. `_comment` é string[].
Textos opcionais são trimmed não vazios ou null. URLs HTTP(S), sem credenciais ou
fragmento; pelo menos host ou container obrigatório. `inferenceKeyEnv` obrigatório;
`masterKeyEnv` opcional e diferente; nomes seguem `^[A-Za-z_][A-Za-z0-9_]*$`.

Env é objeto não vazio de strings não vazias; bloquear nomes `DOCKER_HOST`, `PATH`,
`HOME`, `PWD`, `PYTHONIOENCODING`, `PYTHONUTF8` e prefixo `HARBOR_`. Permitir somente
`{hostBaseUrl}`, `{containerBaseUrl}`, `{inferenceKey}` com fontes presentes; rejeitar
chaves não fechadas/placeholder desconhecido. Nome contendo key/secret/token/password/
credential (case-insensitive) exige `{inferenceKey}`. Literal residual com 24 ou mais
caracteres `[A-Za-z0-9_-]` consecutivos é rejeitado como possível credencial. Env não
pode mapear o nome de masterKeyEnv. Esses filtros são regras exatas, não detector
universal de segredos.

Construir lookup de segredos com process.env seguido de providerEnv (provider vence).
Exigir valor não vazio da referência inferenceKeyEnv; expandir placeholders; remover
masterKeyEnv de extras e aplicar gateway depois dos extras. Não copiar variáveis
process.env não relacionadas ao objeto retornado. OFF devolve cópia de providerEnv.
`exec.ts` mescla depois com ambiente do processo para lançar Harbor e remove de
novo `masterKeyEnv` quando ON; omitir essa segunda remoção vazaria uma master key
herdada do host, mesmo com o helper correto. O caminho de probe com
`dockerHostFix:false` é SDK direto e não recebe roteamento de gateway.
Não transformar host URL em container URL automaticamente: ambos são configuração
explícita e a acessibilidade Podman requer smoke separado por SO.

## Testes, fontes e riscos

`provider-probe.test.ts` cobre exigência de modelo explícito; `provider-domain.test.ts`
cobre normalização/registro/erro/locks; `litellm.test.ts` cobre OFF, ON inválido,
templates, inferência ausente, variáveis bloqueadas, merge e master key. Secrets e
redaction/export têm cobertura transversal na spec 002. Fontes normativas desta
baseline: `catalog.ts`, `secrets.ts`, `provider-probe.ts`, `litellm.ts`, Python probe,
`gui/app/secrets.js` e `provider-domain.js`. Rodar gate offline completo; mocks não
provam disponibilidade comercial, suporte de adapter ou rede host/container.
