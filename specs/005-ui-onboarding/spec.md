# UI explicativa e instalação pelo Claude

Contrato de jornadas e apresentação: [contracts.md](contracts.md).

Feature `005-ui-onboarding`. Baseline retrospectiva **2026-09-08**.

## Objetivo

Permitir que uma pessoa instale e pilote avaliações sem conhecer flags Harbor, usando skill no Claude ou fallback manual documentado. A UI consome operações reais, sem duplicar regras de domínio.

## User stories

### US1 — Chegar ao primeiro experimento (P1)

- **Given** clone aberto no Claude; **When** invoco harbor-setup ou peço leitura explícita do runbook; **Then** o agente segue diagnóstico, instalação preservadora, smokes e configuração local.
- **Given** skill indisponível; **When** sigo fallback manual; **Then** encontro comandos equivalentes por SO e critérios de prontidão.

Como novo usuário, quero instalar sem descobrir procedimentos dispersos. Teste independente: walkthrough em clone limpo, sem copiar estado privado.

### US2 — Entender campos e próximos passos (P1)

- **Given** aba/formulário aberto; **When** leio hints; **Then** encontro finalidade, exemplo, padrão e obrigatoriedade.
- **Given** pré-requisito ausente; **When** tento continuar; **Then** a UI nomeia o próximo passo concreto.

Como operador, quero saber o efeito das opções. Teste independente: contratos de campo e checklist com fixtures.

### US3 — Acompanhar sem perder contexto (P2)

- **Given** operação longa; **When** observo a tela; **Then** há bloqueio apropriado, erro/progresso, tempo e log quando aplicável.
- **Given** consultas resolvem fora de ordem; **When** troco task/log/histórico; **Then** resposta antiga não substitui a seleção atual.

Como operador, quero retorno confiável e recuperação de falhas.

## Requisitos

- **FR-001** Oferecer checklist de início e primeiro experimento, incluindo Oracle/Nop sem credencial de modelo.
- **FR-002** Explicar finalidade, quando usar/pular cada aba; modo compacto preserva avisos essenciais.
- **FR-003** Associar ajuda acessível aos campos com finalidade/exemplo/padrão/obrigatoriedade.
- **FR-004** Gerenciar loading, bloqueio, erro e recuperação sem controles presos.
- **FR-005** Ignorar respostas obsoletas após mudança de seleção ou geração de polling.
- **FR-006** Importar JSON na aba Configuração com sumário e refresh de cadastros.
- **FR-007** Disponibilizar skill Claude de setup, leitura explícita como fallback e comandos manuais equivalentes.
- **FR-008** Manter README, DOCUMENTACAO e guias/prints coerentes, identificando limites e capturas históricas.

## Casos-limite

- Oracle/Nop dispensa API key, mas não task nem runtime.
- Falha parcial de inicialização nomeia áreas que não carregaram.
- Reimportar mesmo arquivo precisa funcionar; limpar input após operação.
- Viewer não pronto/URL não loopback não vira navegação insegura.

## Critérios de sucesso

- **SC-001** Todo controle estático visível passa teste de ajuda específica ou descrição compartilhada explícita.
- **SC-002** Erro de CRUD libera controles e mostra mensagem acionável.
- **SC-003** Clone limpo pode seguir skill ou manual sem credenciais no repo.

Ver [plan.md](plan.md) e [tasks.md](tasks.md). Esta feature não afirma teste de instalação dentro de uma sessão Claude nova.
