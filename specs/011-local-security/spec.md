# Fronteiras de segurança da aplicação local

Baseline retrospectiva de 2026-09-08. Complementa 002 (dados do catálogo), 008
(providers) e 010 (relatórios). Esta feature é a autoridade para transporte HTTP,
caminhos e propagação/redação de segredos; não implementa identidade multiusuário.

## Histórias e aceitação

### US1 — Uma página externa não pode operar a instalação (P1)

Given servidor local ativo e nenhuma credencial de aplicação; When chega uma
requisição com Origin externo ou Host não loopback; Then responder 403 antes de
ler o body ou executar a rota, inclusive para métodos de leitura e arquivos estáticos.
Given cliente CLI sem Origin e Host loopback correto; When consulta API; Then aceitar.

### US2 — Entradas malformadas não escapam do diretório confiável (P1)

Given nome relativo com `..`, caminho absoluto, drive Windows, controle, segmento
vazio ou symlink/junction; When é resolvido sob uma fronteira gerenciada; Then recusar.
Given JSON UTF-8 dividido entre chunks; When o body termina dentro do limite; Then
decodificar uma única vez sem alterar caracteres. Acima do limite responder 413.

### US3 — Segredos não passam para observadores ou exports (P1)

Given segredo sintético dividido em dois chunks; When stdout é transmitido; Then
emitir o restante do texto sem expor nenhum fragmento que recomponha o segredo.
Given conteúdo exportável contaminado; When export é solicitado; Then bloquear o
download/escrita em vez de apenas mascarar o arquivo final.

## Requisitos

- **FR-001** Escutar em 127.0.0.1 e validar Host/Origin antes de toda rota.
- **FR-002** Ler body de POST/PUT com limite de 10.000.000 bytes, preservar UTF-8,
  rejeitar JSON inválido, erro de stream e requisição abortada.
- **FR-003** Resolver parâmetros e arquivos dentro de fronteiras explícitas,
  recusando traversal e links nos segmentos gerenciados.
- **FR-004** Expor somente index e assets CSS/JS do diretório GUI; não servir estado privado.
- **FR-005** Guardar segredos em secrets.env privado; listar somente nomes, rejeitar
  newline nos valores e nomes fora de UPPER_SNAKE_CASE.
- **FR-006** Redigir valores conhecidos e representações JSON em respostas e streams;
  exports usam recusa antes de serialização/escrita, conforme contrato 010.
- **FR-007** Desativar telemetria Harbor e forçar Python UTF-8 em processos filhos,
  mesmo quando a correção de DOCKER_HOST estiver desativada.
- **FR-008** Padronizar erros HTTP sem esconder a causa operacional e sem devolver segredos.

## Casos-limite e limites de confiança

Origin ausente é permitido intencionalmente: não equivale a autenticação. Um processo
local com acesso ao mesmo usuário continua confiável neste modelo. Guardas não são
RBAC, sandbox de host ou proteção contra um usuário local malicioso.
`secrets.env` solicita modo POSIX 0600 ao criar, mas isso não certifica ACL Windows
nem endurece permissões de um arquivo antigo. A checagem de symlink de `paths.ts`
não deve ser atribuída a todo acesso de filesystem: `secrets.ts` usa caminho direto.
Não prometer imunidade a corridas de filesystem entre checagem e abertura.

## Sucesso observável

- **SC-001** Requisição externa recusada não altera arquivos nem cria processos.
- **SC-002** Testes de body cobrem corte multibyte, limite, excesso e abort.
- **SC-003** Testes sintéticos de segredo cobrem chunks, Unicode e JSON escapado.
- **SC-004** Traversal/junction não lê nem escreve além da fronteira avaliada.

Contratos completos: [plan.md](plan.md). Reconstrução: [tasks.md](tasks.md).
