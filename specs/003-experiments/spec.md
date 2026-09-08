# Comparações reproduzíveis

Feature `003-experiments`. Baseline retrospectiva **2026-09-08**, derivada do código.

## Objetivo

Comparar candidatos sobre as mesmas tasks, tentativas e condições, registrando plano efetivo, entradas e resultados. Reproduzir inputs não congela pesos nem garante resposta determinística de modelos.

## User stories

### US1 — Inspecionar antes de gastar (P1)

Como pesquisador, quero ver dimensões efetivas e volume antes da execução.

- **Given** quatro perfis com defaults; **When** peço estimativa; **Then** vejo modelos, skills, tasks e total de trials resolvidos.
- **Given** dry-run ativo; **When** envio comparação; **Then** não executo trials pagos.

Teste independente: planner com catálogo e tasks temporários, sem subprocesso.

### US2 — Congelar e controlar variáveis (P1)

Como pesquisador, quero que alterações posteriores não modifiquem o experimento.

- **Given** experimento preparado; **When** edito task ou skill original; **Then** a execução usa cópias e hashes do snapshot.
- **Given** skillsetIds vazio em um candidato; **When** resolvo o plano; **Then** somente essa linha perde os conjuntos padrão.

Teste independente: preparar snapshot, alterar fonte e comparar hashes/conteúdo.

### US3 — Recuperar e interromper (P2)

Como operador, quero reabrir resultados e cancelar trabalho sob meu controle.

- **Given** resultados persistidos; **When** reinicio GUI e abro histórico; **Then** dados vêm do disco.
- **Given** run ativa deste servidor; **When** cancelo; **Then** processos são interrompidos e recursos próprios recebem parada de melhor esforço.

## Requisitos

- **FR-001** Usar ExperimentPlan v1 comum à CLI, HTTP, estimativa e execução.
- **FR-002** Descobrir task local ou filhos imediatos com task.toml; rejeitar links e dataset vazio.
- **FR-003** Resolver overrides de modelo/skills distinguindo omissão de vazio explícito.
- **FR-004** Validar tentativas/concorrência positivas, caminhos de job/trial até 240 caracteres e kwargs permitidos.
- **FR-005** Calcular trials como tasks × tentativas × candidatos; expor estimativa histórica e guarda pré-voo explícita.
- **FR-006** Congelar tasks/skills, hashes SHA-256 e versões sob identidade exclusiva antes da execução.
- **FR-007** Persistir estado/rows em jobsDir/.experiments e ler métricas de result.json sem fabricar zero.
- **FR-008** Expor histórico/logs e cancelamento por propriedade conhecida; indicar incerteza após reinício.

## Casos-limite

- Instruções do perfil viram skill adicional: remover conjuntos não remove essas instruções.
- Snapshot recusa .git, links, arquivos especiais e nomes de credenciais; não omite conteúdo silenciosamente.
- Concorrência conta processos Harbor de candidatos; Harbor pode paralelizar tasks dentro de cada processo.
- ID repetido e caminho longo falham antes de trials. Reinício não recupera handles para cancelamento.

## Critérios de sucesso

- **SC-001** CLI e HTTP resolvem as mesmas dimensões para entradas equivalentes.
- **SC-002** Edição do catálogo/fonte após prepare não altera inputs usados na run.
- **SC-003** Histórico mantém ID/título/resultados da run sem confundir formulário atual.

Detalhes em [plan.md](plan.md), receita em [tasks.md](tasks.md). Guarda de custo não é limite rígido de faturamento.
