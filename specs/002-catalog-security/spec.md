# Catálogos, credenciais e configuração portátil

Detalhes de validação, CRUD e import: [contracts.md](contracts.md). O cadastro
não comprova disponibilidade de modelos nem força qualidade de critérios.

Feature `002-catalog-security`. Baseline retrospectiva **2026-09-08**, derivada do código existente.

## Objetivo

Reutilizar agentes, modelos, skills e juízes por referência, transportando configurações sem transportar credenciais. Bundle não é backup integral da instalação.

## User stories

### US1 — Compor perfis consistentes (P1)

Como autor, quero cadastrar uma vez e reutilizar por ID.

- **Given** modelos/skills/conjuntos válidos; **When** salvo agente referenciando-os; **Then** os vínculos persistem após recarregar.
- **Given** referência inexistente; **When** salvo ou importo; **Then** a validação recusa a mutação.

Teste independente: registry temporária, sem modelo pago.

### US2 — Transportar sem segredos (P1)

Como operador, quero exportar e reimportar configuração segura.

- **Given** bundle v1 já importado; **When** importo novamente; **Then** os mesmos IDs são atualizados sem duplicação.
- **Given** segredo conhecido em instruções ou artefatos; **When** solicito exportação; **Then** nenhum arquivo/download é emitido.

Teste independente: segredos sintéticos e resposta HTTP capturada.

### US3 — Autenticar localmente (P1)

Como operador, quero cadastrar credenciais sem expô-las.

- **Given** credencial cadastrada; **When** consulto API/logs; **Then** vejo nomes/estado e saída redigida, sem valor.
- **Given** operação autenticada; **When** o filho inicia; **Then** recebe segredo por ambiente, nunca argv.

### US4 — Escolher provider e preparar proxy opcional (P2)

Como operador, quero distinguir descoberta de modelos de teste pago e configurar proxy sem expor sua chave administrativa.

- **Given** credencial cadastrada; **When** descubro modelos; **Then** não é feita completion paga disfarçada de descoberta.
- **Given** proxy desabilitado; **When** preparo ambiente de execução; **Then** não ativo o gateway; quando habilitado explicitamente, uso chave de inferência sem enviar master key ao agente.

Teste independente: respostas de provider simuladas e configuração de gateway temporária.

## Requisitos

- **FR-001** Definir sete registries: agents, models, skills, skillsets, criteria, rubrics e judges, com IDs e formas validados.
- **FR-002** Validar referências no snapshot completo antes de mutações.
- **FR-003** Suportar skills authored com instructions/extraFiles e path local, impedindo traversal na materialização.
- **FR-004** Exportar ConfigBundle v1 somente com registries; excluir secrets, tasks, jobs e pins por caminho.
- **FR-005** Bloquear export de catálogo/relatório diante de valores secretos conhecidos, campos/arquivos sensíveis ou padrões reconhecidos, antes de enviar/escrever.
- **FR-006** Importar por upsert de ID, validar estado mesclado antes de escrever e retornar added/updated/byRegistry/warnings.
- **FR-007** Guardar secrets.env no estado privado do usuário e nunca devolver valores por API, argv ou logs.
- **FR-008** Proteger corpo HTTP, origem local e caminhos; fonte de providers e política de juízes deve ser server-side.
- **FR-009** Separar descoberta de modelos de teste pago explícito, usando Python Harbor, timeout e redaction.
- **FR-010** Validar gateway LiteLLM opcional/desligado, separar URLs host/container e chave de inferência/administração e bloquear sobrescritas de infraestrutura por templates.

## Casos-limite

- ID duplicado no mesmo bundle é erro; registry desconhecida gera aviso e é ignorada.
- Falha de validação não escreve; falha de I/O entre arquivos não tem transação global.
- Skill path depende do diretório local; bundle não copia automaticamente seus arquivos.
- Detectores não provam reconhecimento de qualquer string secreta desconhecida. Nunca usar credenciais como conteúdo exportável.

## Critérios de sucesso

- **SC-001** Reimportar IDs existentes mantém cardinalidade e vínculos válidos.
- **SC-002** Testes adversariais bloqueiam export antes da resposta HTTP e antes de relatórios no disco.
- **SC-003** Credenciais sintéticas não aparecem em argv, respostas ou logs capturados.

Ver [plan.md](plan.md) e [tasks.md](tasks.md). AWS e autenticação multiusuário não integram esta feature local.
