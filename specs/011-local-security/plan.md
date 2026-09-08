# Plano — segurança local

## Contrato HTTP

Fonte: `scripts/lib/httpguard.ts`, `http-body.ts`, `scripts/gui-server.ts`.

| Entrada | Resultado |
|---|---|
| Host ausente | 403 |
| Host fora de `127.0.0.1`, `localhost`, `[::1]` | 403, defesa de DNS rebinding |
| Host loopback com porta diferente da escutada | 403 |
| Host loopback sem porta | permitido pelo guard |
| Origin omitido ou vazio | permitido após validar Host |
| Origin `http://<loopback>:<porta-efetiva>` exato | permitido |
| Qualquer outro Origin, inclusive `null` ou HTTPS | 403 |

Porta padrão 4173. A aceitação de um cabeçalho IPv6 não altera o bind real IPv4.
Não adicionar CORS permissivo como atalho para proxy. O dispatcher resolve pathname,
compara método/regex de rota, faz decodeURIComponent de parâmetros e lê JSON apenas
em POST/PUT. Body vazio vira `{}`. Acumular Buffers e contar bytes antes de concatenar;
ao exceder 10.000.000 liberar chunks acumulados e drenar request. Erro carrega
statusCode=413; JSON inválido e abort chegam como erros de entrada.

Respostas JSON têm Content-Type UTF-8 e Content-Length do texto já redigido.
Guard falho retorna `{ok:false,error}`. Rota ausente retorna 404. Exceções usam
statusCode explícito, senão RegistryNotFoundError→404, demais→400; campos opcionais
estimate e needsAcknowledge preservam a guarda de custo. Sucesso depende da rota:
CRUD create=201, demais operações de cadastro=200; não envelopar automaticamente
listas/objetos em um formato novo. Operações assíncronas têm contratos em 009.

GET `/` lê index.html. Assets permitem apenas `.css` e `.js`, resolvidos sob gui/,
com Cache-Control=no-cache. Extensão ou arquivo ausente cai no 404. Não montar um
servidor genérico da raiz do projeto.

## Fronteira de caminhos

`safeJoinUnderDir(dir,name)` retorna caminho ou null. Recusar nome vazio, absoluto,
prefixo de drive, barras iniciais, caracteres 0x00–0x1f e dois-pontos. Separar com
barras de ambos os SOs; recusar segmentos vazios, `.` e `..`. Conferir relative()
após join e lstat da fronteira e de cada descendente existente, inclusive links
pendentes. Ancestros acima da fronteira são configuração do host (por exemplo
`/var` no macOS) e não são recusados por essa função.
`managedPath` aplica a regra sob HARBOR_EVAL_STATE_DIR ou `~/.harbor-eval-kit` e
lança erro em vez de retornar null. Não confundir com validação específica de task,
job ou snapshot: esses contratos estão em 001/003/007/009.

## Segredos, ambiente e redação

`secrets.ts` lê linhas não vazias/não comentadas, separando no primeiro `=`.
Não é parser de shell: não executar expansão nem remover aspas automaticamente.
Nomes são ordenados ao listar. Escrita representa pares NAME=value com newline final;
nome deve casar `^[A-Z][A-Z0-9_]*$`, valor não pode conter CR/LF. Não reproduzir
valores reais em exemplos, logs ou testes. O armazenamento atual não oferece
transação multi-arquivo, cofre criptográfico ou gestão corporativa de chaves.

`exec.ts` injeta ambiente por spawn sem shell; stdin fica fechado. Aplicar sempre
HARBOR_TELEMETRY=disabled, PYTHONIOENCODING=utf-8 e PYTHONUTF8=1. O ramo que pula
DOCKER_HOST também recebe essas três definições. Política de gateway e exclusão da
master key pertencem a 008; validação de argumentos experimentais pertence a 003.

Redator de stream: deduplicar valores conhecidos e suas formas JSON escapadas,
ordenar por comprimento decrescente, reter sufixo de tamanho máximo (len−1).
Antes de emitir, recuar corte que atravessaria uma ocorrência completa ou par
surrogate UTF-16; substituir ocorrências por `[REDACTED]`, emitir e reter restante.
Ao terminar, redigir e liberar pendência. Não emitir cada chunk cru para depois
redigir o log final. A proteção cobre valores conhecidos; detecção de qualquer
segredo arbitrário não é demonstrável por regex.

## Implementação e validação

Dependências: tipos/paths de 002; aplicar antes de consumidores 003–010.
Constitution check: sem autenticação inventada, zero segredo em argv/export,
guardas testados antes de mutação, mesma semântica nos três SOs.
Suítes: `httpguard.test.ts`, `http-body.test.ts`, `state.test.ts`,
`export-safety.test.ts`, `export-route-security.test.ts`, `experiment.test.ts`,
`harbor.test.ts` em scripts/lib. Leia os casos reais e preserve recusas, não apenas
mensagens. Teste com segredos sintéticos e servidor em porta isolada.
Nada nesta spec autoriza abrir a GUI na rede, executar AWS ou ler chaves reais.
