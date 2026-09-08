# Entrega verificável e aceitação da reconstrução

Baseline retrospectiva de 2026-09-08. A quantidade de specs não prova reprodução.
Esta feature define distribuição dos scripts, gates e evidências para aceitar uma
implementação reconstruída das capacidades 001–011.

## Histórias

### US1 — Um clone novo recebe arquivos executáveis no SO alvo (P1)

Given clone em Windows com autocrlf; When executo scripts de task e hooks em Bash;
Then os arquivos shell permanecem LF. Given macOS/Linux; When uso wrappers Bash;
Then não dependo do PowerShell Windows nem de utilitários exclusivos de Git Bash.

### US2 — Toda entrega valida lógica e segredos sem gastar com modelos (P1)

Given alteração em uma fronteira de segurança; When executo gate ou commit; Then
falha detectada impede sucesso, inclusive se uma ferramenta do scanner estiver ausente.
Given CI verde; When reporto compatibilidade; Then distingo testes offline de
smoke Podman e de execução paga.

### US3 — Reconstruir sem consultar implementação para adivinhar comportamento (P1)

Given specs/contratos e fixtures de aceitação; When um implementador encontra decisão
observável não definida; Then registra lacuna antes de inventar equivalência.
Given só referências de arquivos; When audito cobertura; Then isso conta como
rastreabilidade, não como prova de suficiência semântica.

## Requisitos

- **FR-001** Entregar pares .sh/.ps1 para operação local e política LF/CRLF explícita.
- **FR-002** Executar Node tests, verificação de imports/ciclos e scanner no gate local.
- **FR-003** Ativar hook versionado por core.hooksPath=.githooks, sem bypass.
- **FR-004** Executar CI Node 24 em Windows/macOS/Linux e contrato Python separado.
- **FR-005** Manter inventário de fontes/rotas e responsabilidades das specs auditável.
- **FR-006** Fornecer ordem de reconstrução, fixtures, cenários de aceitação e registro de lacunas.
- **FR-007** Separar evidências: estrutura documental, testes existentes, nova implementação,
  instalação limpa, smoke real e resultados pagos.
- **FR-008** Preservar onboarding Claude/manual e AWS somente como plano externo ao runtime entregue.

## Critérios de sucesso

- **SC-001** Shell scripts clonados têm LF e comportamento de saída coerente nos wrappers.
- **SC-002** Erros em teste/import/scanner tornam o gate não zero; nenhum teste do gate gasta API.
- **SC-003** Todo arquivo executável e rota do inventário tem spec responsável ou exclusão motivada.
- **SC-004** Uma reconstrução independente satisfaz os cenários de aceitação no host alvo.

SC-004 ainda não foi executado: expansão documental não equivale a reconstruir o
produto do zero. Evidências da baseline original não podem ser atribuídas à reconstrução.
Leia [plan.md](plan.md) e [tasks.md](tasks.md).
