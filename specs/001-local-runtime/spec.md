# Runtime local gerenciado com Podman

Feature `001-local-runtime`. Baseline retrospectiva: **2026-09-08**. Derivada do código existente; não representa o histórico original nem certificação de todas as plataformas.

## Objetivo

Instalar, diagnosticar, executar e remover somente componentes pertencentes ao kit, preservando ferramentas preexistentes. Docker é nome do protocolo/backend usado pelo Harbor; o runtime é Podman. AWS está fora da implementação.

## User stories e aceitação

### US1 — Instalar sem substituir ferramentas (P1)

Como operador, quero Harbor isolado e um registro do que mudou.

- **Given** ferramentas preexistentes; **When** executo install duas vezes; **Then** o snapshot original permanece e só dependências elegíveis são registradas como instaladas pelo kit.
- **Given** Harbor preexistente incompatível; **When** inicio bootstrap; **Then** recebo diagnóstico antes de substituição silenciosa.

Teste independente: manifesto temporário e descoberta simulada de executáveis.

### US2 — Provar prontidão antes de avaliar (P1)

Como operador, quero detectar falhas de conexão e container antes de chamadas pagas.

- **Given** Podman e imagem Alpine disponíveis; **When** executo gates e smoke; **Then** build, exec, bind mount, rede, volume e limpeza são comprovados.
- **Given** smoke ou Oracle não executado; **When** consulto o resultado; **Then** não recebo READY.

Teste independente: diagnóstico sem credenciais; depois smoke real separado da suíte offline.

### US3 — Remover por propriedade comprovada (P2)

Como operador, quero inspecionar o conjunto exato de remoção.

- **Given** manifesto e recursos próprios; **When** peço uninstall --dry-run; **Then** vejo comandos/IDs sem remoção.
- **Given** recurso só com prefixo, sem label ou registro; **When** planejo cleanup; **Then** a operação aborta por ambiguidade.

## Requisitos funcionais

- **FR-001** Capturar presença e caminhos de dependências antes da instalação; preservar snapshot original.
- **FR-002** Exigir Node.js 24+ e instalar Harbor 0.22.0 isolado via uv; nunca instalar Docker.
- **FR-003** Resolver conexão por SO, comprovar API Podman e Compose compatível; limitar DOCKER_HOST ao processo filho.
- **FR-004** Executar smoke com Alpine preexistente e sem pull implícito, verificando efeitos e limpeza.
- **FR-005** Declarar READY somente com CLI, smoke Podman e task Oracle real aprovados.
- **FR-006** Todo recurso criado deve ter prefixo harbor-eval-kit-, label io.harbor-eval-kit.managed=true e propriedade registrada.
- **FR-007** Confrontar manifesto, identidade, prefixo e label antes de remover; preservar dependências preexistentes.
- **FR-008** Manter wrappers bash/PowerShell equivalentes; LiteLLM é opcional e permanece desligado por padrão.

## Casos-limite

- Múltiplas máquinas ou conexões Podman exigem seleção inequívoca.
- Alpine ausente exige provisionamento explícito, sem pull oculto.
- Manifesto inválido, lock ocupado e caminho Harbor divergente devem preservar recursos.
- Git Bash e bash 3.2 não compartilham todos os utilitários; verificar efeito de stop por SO.

## Critérios de sucesso

- **SC-001** Testes de instalação/cleanup não removem nenhuma ferramenta preexistente.
- **SC-002** Cada host declarado READY possui registro datado dos gates, smoke e Oracle naquele host.
- **SC-003** Dry-run corresponde ao conjunto de ações calculado para o inventário inspecionado.

## Aceitação complementar da auditoria

- Manifesto com ID trocado ou imagem com tag alheia adicional aborta cleanup antes da primeira remoção (FR-006/007).
- Endpoint compatível que não se identifica como Podman ou Compose sem --wait/--pull não passa gate (FR-003).
- Task multisserviço, rede restrita e imagem com volume anônimo são recusadas antes da criação; suporte Linux simples não deve ser apresentado como suporte irrestrito a Harbor (FR-004/006).
- Lock abandonado expira em30s sem apagamento automático; snapshot inicial permanece intacto (FR-001/007).

Fontes e limites: [plan.md](plan.md). Dados, algoritmos e erros: [contracts.md](contracts.md). Receita de reconstrução: [tasks.md](tasks.md). FR/US são locais a esta feature.
