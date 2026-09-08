# Demo teste-live e validação progressiva

Feature `006-demo-validation`. Baseline retrospectiva **2026-09-08**.

## Objetivo

Entregar um piloto de três dificuldades para comparar quatro modelos e fazer ablação de skills, com dois juízes sob critérios fortes. Preparar a demo não deve iniciar chamadas pagas.

## User stories

### US1 — Carregar configuração reutilizável (P1)

- **Given** clone com tasks/bundle; **When** importo catálogo teste-live; **Then** obtenho quatro perfis candidatos, skills, critérios e juízes.
- **Given** instalação nova; **When** aplico mapa de pins com paths locais; **Then** as tasks recebem juiz/rubrica sem transportar credenciais.

Como demonstrador, quero evitar reconstruir cadastros. Teste independente: importar em registry temporária e reler vínculos.

### US2 — Validar benchmark antes dos modelos (P1)

- **Given** oracle de cada task; **When** executo verificador isolado; **Then** os testes comportamentais passam.
- **Given** stub inicial; **When** executo o mesmo verificador; **Then** falha, sem aprovação vazia.

Como autor, quero separar erro da task de erro do candidato. Teste independente: processos Python distintos para oracle/stub.

### US3 — Comparar sob condições iguais (P2)

- **Given** mesma task/adapter/skills/limites; **When** altero apenas modelo; **Then** o plano mostra essa única dimensão variada.
- **Given** mesmo resultado/rubrica; **When** analiso com os dois juízes; **Then** comparo evidências e discordâncias sem presumir consenso.

Como avaliador, quero interpretar a diferença entre candidatos com controle experimental.

## Requisitos

- **FR-001** Entregar três tasks em evals/python: simples-teste-live, media-teste-live e dificil-teste-live, com instrução, TOML, ambiente, stub, oracle e testes.
- **FR-002** Definir contratos e limites de agregação monetária, grafo determinístico/SCC e ledger transacional.
- **FR-003** Manter testes/oracle fora da imagem inicial; verificador começa em reward zero e preserva solution.py como artefato.
- **FR-004** Bundle v1 contém 23 registros: 5 modelos, 4 agentes, 2 skills, 1 skillset, 8 critérios, 1 rubrica, 2 juízes.
- **FR-005** Perfis usam mesmo mini-swe-agent/conjunto de skills, modelos pinados e sem instruções extras que prejudiquem ablação.
- **FR-006** Juízes Pro/Opus compartilham rubrica e prompt em português com PASS/FAIL e evidência exigida.
- **FR-007** Entregar mapa portátil de pins e roteiro de aplicação local; credenciais não integram bundle/repo.
- **FR-008** Separar offline, smoke real Oracle/Nop e chamadas pagas; registrar pendências e custos reportados.

## Casos-limite

- Nomes/IDs da demo têm sufixo teste-live; identificadores oficiais de API não recebem esse sufixo.
- Dificuldade projetada não equivale a taxa empírica de sucesso calibrada.
- Decimal global alterado não pode mudar valores; bool não substitui inteiro positivo.
- Batch reverte saldos, contas e IDs; nó bloqueado por ciclo não é necessariamente membro do ciclo.

## Critérios de sucesso

- **SC-001** Três oracles passam e três stubs falham em processos separados.
- **SC-002** Reimportar mantém 23 IDs e referências válidas.
- **SC-003** Cada task produz quatro candidatos equivalentes; ablação altera só a linha escolhida.

Ver [plan.md](plan.md) e [tasks.md](tasks.md). Piloto de três tasks não é benchmark amplo de engenharia.
