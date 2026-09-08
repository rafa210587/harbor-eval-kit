# Plano técnico — tasks

## Dependências e fronteiras

001 fornece Harbor/execução privada; 002 fornece IDs/registries; 003 consome paths;
004 fornece picker de juiz/rubricas. `tasks.ts` possui filesystem e pins;
`gui-server.ts` adapta HTTP; `tasks.js`, `task-domain.js`, `task-template.js` possuem
formulário, controle de seleção e templates. Dataset não constitui outro formato
de task: conteúdo baixado segue contrato Harbor.

## API reproduzível

| Método/path | Entrada e resultado |
|---|---|
| POST `/api/tasks/init` | JSON `name`, opcionais `org`, `outputDir`, `description`, `author`, `noPytest`, `noSolution`, `steps`; 200/500 `{ok,...ExecResult}` |
| GET `/api/tasks` | lista `{path:string,stub:boolean,source:"evals"|"datasets"}` |
| GET `/api/tasks/detail?path=...` | 200 `{instruction,dockerfile,solveSh,testSh}` strings; arquivo individual ausente resulta `""` |
| POST `/api/tasks/detail` | `{path,instruction?,dockerfile?,solveSh?,testSh?}`; 200 `{ok:true}`; `undefined` não escreve, string vazia limpa |
| GET `/api/tasks/rubric-default?path=...` | objeto `{judgeId?,rubricIds?}`, `{}` se não cadastrado |
| POST `/api/tasks/rubric-default` | `{path,judgeId?,rubricIds?}`; 200 `{ok:true}` |
| GET `/api/datasets` | `{ok,stdout,stderr}`, status HTTP 200 inclusive CLI não-zero |
| POST `/api/datasets/download` | `{name,outputDir?}`; 200/500 `{ok,outputDir,...ExecResult}` |

Detail/pins sem path retornam 400; detail em diretório inexistente retorna 404.
Init sem name e download sem name retornam 400. Erros inesperados usam tratamento
geral HTTP, sem mascarar como sucesso. Aplicar guard de origem/Host da spec 011.

Init constrói argv separado: `init <name> --task`, seguido por `--org`, `-o`,
`--description`, `--author`, flags `--no-pytest`, `--no-solution`, `--steps`, somente
quando seus valores são truthy. Timeout 60.000 ms. GET datasets executa
`dataset list` com 60.000 ms; download executa `dataset download <name> -o <dir>`
com 120.000 ms, dir padrão `datasets`. Não adicionar shell interpolation.

## Algoritmos e persistência

1. Descobrir em `evals` e depois `datasets`, relativos ao cwd. Raiz ausente/link é
   lista vazia. Para cada diretório, testar marcadores antes de testar profundidade;
   uma task na profundidade 12 é reconhecida. Não ordenar artificialmente resultados.
2. Ler cada arquivo mapeado em UTF-8 ou vazio; escrever somente chaves presentes,
   criando diretórios pais. Não reformatar conteúdo recebido.
3. Pins são objeto JSON em `<stateDir>/task-rubric-defaults.json`, chave path literal.
   Exemplo de forma (IDs precisam existir para uso posterior):
   `{"evals/python/demo":{"judgeId":"juiz-demo","rubricIds":["rubrica-demo"]}}`.
   Raiz inválida/JSON truncado falham preservando original. Salvar com arquivo
   temporário exclusivo `<arquivo>.<id>.tmp` e rename; sem preferência, remover chave.
4. No editor, emitir token de geração ao abrir, limpar dataset.path e desabilitar
   salvar. Após cada await validar token; somente depois de arquivos+pins preencher
   campos e habilitar. Fechar invalida token. Templates substituem instrução,
   Dockerfile e verifier vazios; solve usa vazio sem template.
5. Guardar se solve tinha conteúdo ao abrir. Enviar solve se tinha conteúdo ou novo
   valor não vazio; omitir caso contrário. Escrita explícita vazia limpa anterior.
6. Salvar primeiro detail e depois pins; lock até finally. UI deve diferenciar
   falha total de falha de pins após arquivos salvos. Refresh lista após sucesso.
7. Download filtra tasks descobertas por fonte datasets e prefixo `<outputDir>/`,
   normalizando barras e `./`; `qa-other` não corresponde a `qa`.

## Verificação e dívida

`scripts/lib/tasks.test.ts`: árvores aninhadas, links raiz/filho, pins atômicos e
preservação de corrupção. `task-template.test.ts`: executa shell seguro e observa
status/reward reais em fixture. `ui-compare.test.ts`: corrida de carregamento e
preservação de solve ausente. Gate completo `scripts/test.ps1`/`scripts/test.sh`.
Smoke manual: criar com org, reabrir, editar, selecionar no Compare, baixar dataset
em destino autorizado e conferir paths. Não há teste E2E offline que prove todas
as rotas de criação/download. Adicionar contrato de confinamento de paths, schema
rigoroso e normalização de pins exige decisão de compatibilidade e novos testes.
