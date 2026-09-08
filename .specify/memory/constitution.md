# Constituição do Harbor Eval Kit

Versão: 1.0.0 | Ratificação documental: 2026-09-08

Baseline retrospectiva do produto existente. Esta data não representa a adoção
histórica de SDD durante sua implementação. Em conflito, prevalecem a instrução
explícita do usuário e `AGENTS.md`.

## I. Avaliações comparáveis

Congelar entradas efetivas de task, agent, modelo, skills e tentativas. Expor diferenças
antes de executar; não atribuir a uma dimensão efeitos de mudanças simultâneas.
Reward determinístico e julgamento são sinais distintos. Não inventar custo ou tokens.

## II. Segredos fora dos artefatos

Credenciais ficam no estado local, entram somente no ambiente de processos filhos e
nunca em argv, logs, respostas da API, exports, snapshots, exemplos ou commits.
Toda fronteira de exportação requer teste de ausência de segredos. Nunca ignorar hooks.

## III. Ownership e Podman

Somente Podman no runtime local. Recursos criados recebem prefixo
`harbor-eval-kit-` e label `io.harbor-eval-kit.managed=true`. Manifest com snapshot
precede mutações; cleanup inspeciona ownership, expõe dry-run e aborta em ambiguidade.
Preservar dependências preexistentes. READY exige smoke e task real no host.

## IV. Domínio independente e operação explicável

`scripts/lib/` concentra domínio; servidor mapeia HTTP; GUI renderiza. Catálogos têm
uma fonte de verdade. Preferir módulos até 400 linhas. Cada jornada explica campos,
pré-requisitos, operação em andamento, erro real e próximo passo.
Execuções e resultados persistem em disco para sobreviver ao reinício.

## V. Paridade e validação

Entradas de host em Bash e PowerShell evoluem juntas. Detectar SO explicitamente.
Testar lógica, guardas e regressões sem chamadas pagas ou containers na suíte.
Registrar separadamente testes reais, custos medidos e plataformas não validadas.

## VI. Entrega e escopo

Specs, planos, tasks, código, testes e documentação devem convergir na mesma mudança.
AWS corporativa é somente plano: não criar infraestrutura como parte do setup local.
LiteLLM é opcional e permanece desligado por padrão. Não presumir autenticação,
RBAC, licença de distribuição ou prontidão corporativa ausentes no produto.

## Governança

Cada plan.md apresenta um constitution check. Mudanças que alterem estes princípios
devem justificar a decisão e atualizar os documentos afetados. Incremente major para
mudança incompatível, minor para princípio novo e patch para esclarecimento.
Checklist de reconstrução não é prova de validação; associe evidência observável ao
marcar qualquer tarefa concluída. Veja `specs/README.md` para ordem e rastreabilidade.
