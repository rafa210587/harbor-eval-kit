# Juízes, rubricas e observabilidade

Feature `004-judging-results`. Baseline retrospectiva **2026-09-08**.

## Objetivo

Separar aprovação do verificador de julgamento qualitativo e permitir auditar evidências, custos reportados e falhas de análise. Um juiz curado não é automaticamente um juiz calibrado.

## User stories

### US1 — Reutilizar juiz e critérios (P1)

- **Given** juiz com defaultRubricIds; **When** seleciono seu perfil; **Then** a UI pré-marca as rubricas associadas.
- **Given** task com juiz/rubricas pinados; **When** seleciono a task; **Then** carrego os padrões locais e posso revisá-los antes da análise.

Como avaliador, quero padrões reutilizáveis sem redigitar critérios. Teste independente: catálogo e pins temporários.

### US2 — Congelar uma avaliação comparável (P1)

- **Given** sessão iniciada; **When** edito prompt/critérios no catálogo; **Then** os candidatos restantes usam conteúdos congelados.
- **Given** modelo fora da lista curada; **When** analiso sem modo validação; **Then** a chamada é recusada.

Como avaliador, quero a mesma configuração de julgamento para toda a comparação. Teste independente: sessão em disco e edição posterior do catálogo.

### US3 — Investigar o que ocorreu (P2)

- **Given** análise produz stdout/stderr; **When** abro monitor; **Then** vejo progresso redigido e caminhos duráveis.
- **Given** resultado incompleto ou outcomes desconhecidos; **When** consulto ranking; **Then** não vejo aprovação nem custo zero fabricados.

Como operador, quero chegar aos logs e trajetórias reais. Teste independente: fixtures de analysis.json e operation.log.

## Requisitos

- **FR-001** Persistir defaultRubricIds no juiz e juiz/rubricas por task local.
- **FR-002** Materializar critérios em TOML e prompt opcional com placeholders Harbor.
- **FR-003** Congelar modelo, adapter, prompt, rubricas e validationMode em AnalysisSession antes de chamadas pagas.
- **FR-004** Aplicar política server-side de modelos curados; validationMode é booleano explícito e deve ser distinguido no resultado.
- **FR-005** Preservar pass/fail/not_applicable, desconhecidos, erros e metadados por trial na normalização.
- **FR-006** Exibir custos/tokens reportados, distinguindo ausência, parcialidade e zero real.
- **FR-007** Persistir estado/log de analyze/view e oferecer leitura incremental e incerteza após reinício.
- **FR-008** Navegar a Logs/Trajetórias somente quando destino real existir e validar caminhos/URLs locais.

## Casos-limite

- Rubrica vazia ou duplicada é inválida; __default__ representa padrão Harbor.
- Harbor analyze não injeta SKILL.md no juiz; promptTemplate é o mecanismo real.
- Análise de trial e de job têm destinos distintos de analysis.json.
- Operação running sem handle ativo após reinício fica incerta, sem sucesso presumido.

## Critérios de sucesso

- **SC-001** Edição após criar sessão não altera conteúdo utilizado pela sessão.
- **SC-002** Cada análise possui ID, estado/log persistidos e saída redigida.
- **SC-003** Análises incompletas ou de validação não viram ranking conclusivo.

## Aceitação complementar da auditoria

- Criar sessão sem rubricIds usa padrão Harbor; seleção dos defaults de perfil ocorre explicitamente na UI, não por herança invisível no endpoint (FR-001/003).
- Job e trial filho não podem ser analisados simultaneamente neste servidor; targets irmãos são independentes. Lock é liberado também após erro (FR-003/007).
- Exit0 sem analysis.json canônico válido retorna falha, e experimento dry-run não pode ser enviado ao juiz (FR-005/007).
- Sessão prevalece sobre perfil/ad hoc; judgeId ou validationMode conflitantes são recusados (FR-003/004).

Contratos detalhados em [contracts.md](contracts.md), arquitetura em [plan.md](plan.md); reconstrução em [tasks.md](tasks.md). Não há consenso automático entre juízes.
