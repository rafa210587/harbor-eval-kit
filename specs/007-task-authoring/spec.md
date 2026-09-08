# Autoria, descoberta e aquisição de tasks

Feature `007-task-authoring`. Baseline retrospectiva de 2026-09-08. Complementa 003
(execução) e 005 (UI), que não descreviam o editor nem a aquisição suficientemente
para reconstrução. Não implementa o framework Harbor; depende de Harbor 0.22.0.

## Histórias e aceitação

- **US1 (P1), criar sem editor externo:** fornecido `name=org/minha-task`, criar uma
  task e abrir os quatro arquivos após sucesso. Nome sem `/` e sem `org` recebe 400
  antes de subprocesso; nunca aguardar prompt interativo de organização.
- **US2 (P1), editar com segurança sem aprovar stub:** ler instrução, imagem, solução
  e verifier; preservar solução ausente quando campo vazio não foi alterado. Rodar
  template inicial de verifier deve terminar com status 1 e reward 0.
- **US3 (P1), encontrar tasks próprias e baixadas:** árvore aninhada aparece no mesmo
  picker de Compare, com fonte e indicador estrutural; subdiretórios da task não
  viram novas tasks. Indicador não significa conteúdo ou reward validado.
- **US4 (P2), persistir julgamento padrão:** salvar juiz e múltiplas rubricas por
  path; reabrir recupera escolhas. Corrupção do JSON existente bloqueia gravação e
  preserva bytes, com erro visível. Esvaziar ambos remove a preferência.
- **US5 (P2), baixar dataset:** listar catálogo Harbor, baixar para `datasets` por
  padrão e atualizar descoberta; saída customizada fora das raízes fixas não é
  automaticamente descoberta. Falha CLI mostra stdout/stderr redigidos.

## Requisitos normativos

- **FR-007-01:** editor cobre somente `instruction.md`, `environment/Dockerfile`,
  `solution/solve.sh`, `tests/test.sh`; arquivos auxiliares e `task.toml` continuam
  administrados no filesystem. Não prometer editor arbitrário de projeto.
- **FR-007-02:** descoberta recursiva percorre até profundidade 12, exclui links,
  diretórios ocultos e `node_modules`; para no primeiro diretório com `task.toml`
  ou `instruction.md`. `stub` é ausência de TOML ou ausência textual de `[task]`.
- **FR-007-03:** seleção do picker e campo path do Compare permanecem consistentes
  após refresh. Resposta antiga de carregamento não pode sobrescrever nova seleção.
- **FR-007-04:** solução não é fornecida como template aprovador. Dockerfile inicial
  orienta separar runtime de testes e nunca copiar `tests/`/`solution/` para imagem.
- **FR-007-05:** salvar arquivos e pins são duas operações; falha na segunda deve
  informar que os arquivos já foram salvos. Não alegar transação conjunta.
- **FR-007-06:** pins ficam no estado local, fora da task e do bundle de catálogo.
  Transferir demo exige pasta da task, bundle e reaplicação de pins.
- **FR-007-07:** chamadas de criação/download não são testes de modelo, mas podem
  acessar rede/disco; não misturar com gate offline ou gasto de inferência.

## Limites encontrados, não garantias desejadas

Rotas detail aceitam diretórios existentes fornecidos pelo cliente local, sem
confinamento explícito a `evals`/`datasets`. Escritas dos quatro arquivos são diretas,
sem rollback ou lock global. Pins usam path literal, portanto barras Windows/Unix
podem formar chaves diferentes; validam sintaxe dos IDs, não existência no catálogo.
POST de pins normaliza `rubricIds` não-array para ausência antes da validação de
domínio. Estes são gaps de hardening da implementação, não comportamentos a tornar
obrigatórios em uma futura API remota/multiusuário.

## Sucesso e evidência

Uma reconstrução deve passar cenários US1–US5, os testes listados no plano e smoke
Oracle/Nop separado em runtime autorizado. Inspeção desta spec é documental; não
afirma nova execução de containers nem validação do formulário por navegador.
