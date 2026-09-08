# Especificações e reprodução do produto

Este diretório descreve a baseline de 2026-09-08 no formato de desenvolvimento
orientado por especificações do [GitHub Spec Kit](https://github.com/github/spec-kit).
É uma **reconstrução documental retrospectiva**, não um histórico fictício de como
o código foi produzido. Os arquivos orientam a reconstrução e seus critérios de
aceitação; sua suficiência para uma reprodução independente ainda precisa ser
demonstrada. Não prometem gerar código byte a byte idêntico.

A [auditoria de suficiência](../docs/AUDITORIA_SDD_2026-09-08.md) mostrou que as
seis specs iniciais eram um mapa, não uma receita completa. Esta revisão contém
**12 capacidades**, cinco contratos adicionais e um [inventário de cobertura](coverage.json)
com 215 arquivos e 64 rotas de API. Contagem e mapeamento não provam equivalência.

O [fixture do catálogo](fixtures/catalog-reference.json) preserva dados públicos
dos providers/adapters/juízes da referência para uma implementação independente.
Ele não é config bundle de usuário e não contém credenciais.

## Mapa e ordem de implementação

| ID | Capacidade | Integração / contratos relacionados |
|---|---|---|
| 1 | [001 — Runtime local](001-local-runtime/spec.md) | Constituição |
| 2 | [002 — Catálogo e segurança](002-catalog-security/spec.md) | 001 para integração local |
| 3 | [003 — Experimentos](003-experiments/spec.md) | 001, 002 |
| 4 | [004 — Juízes e resultados](004-judging-results/spec.md) | 002, 003 |
| 5 | [005 — UI e onboarding](005-ui-onboarding/spec.md) | 001–004 |
| 6 | [006 — Demo e validação](006-demo-validation/spec.md) | 001–005 |
| 7 | [007 — Autoria de tasks e datasets](007-task-authoring/spec.md) | 001/002; pins de juiz integram 004 |
| 8 | [008 — Providers e gateway LiteLLM](008-provider-gateway/spec.md) | 002/011 |
| 9 | [009 — Operações, logs e viewer](009-operations-observability/spec.md) | 001/003/004 |
| 10 | [010 — Resultados e relatórios](010-results-reporting/spec.md) | 003/004/011 |
| 11 | [011 — Segurança local](011-local-security/spec.md) | transversal, desde a fundação |
| 12 | [012 — Entrega e prova de reconstrução](012-delivery-reconstruction/spec.md) | gates desde a fundação; aceitação após integração |

Os IDs identificam capacidades, não uma ordem estritamente numérica. Sequência:
fundação 001/011 e gates012 → catálogo002/providers008 → tasks007 e planner003 →
juiz004/operações009/resultados010 → integração UI005 e pins007 → demo006 e aceitação012.
Contratos compartilhados precedem consumidores; dependência de integração não exige
ciclo de imports. Em 001–005, leia também `contracts.md` antes de implementar.

Cada pasta contém `spec.md` (necessidade e aceitação), `plan.md` (decisões técnicas,
contratos e validação) e `tasks.md` (passos de implementação rastreáveis).
A [constituição](../.specify/memory/constitution.md) contém os invariantes comuns.
O plano AWS fica separado em [PLANO_AWS_CORPORATIVO.md](../docs/PLANO_AWS_CORPORATIVO.md),
sem tarefas executáveis de implantação nesta baseline.

## Como reconstruir

A proposta [013 — Spec de repositório, PR histórico e harness](013-repository-pr-evals/spec.md)
é **prospectiva, aprovada e implementada em parte; a aceitação integral continua rastreada nas tasks**. Seu
[plano](013-repository-pr-evals/plan.md) e suas
[tasks com prompt de continuidade](013-repository-pr-evals/tasks.md) ficam separados
da baseline retrospectiva de 12 capacidades e do inventário congelado acima.

1. Preserve este repositório como referência. Trabalhe em um diretório novo ou branch
   isolada; não apague o projeto para testar reprodução.
2. Leia constituição, README, auditoria e todas as specs antes de selecionar uma capacidade.
3. Leia o plan e implemente suas tasks em ordem, usando os contratos e testes citados
   como critérios observáveis. Para testar suficiência sem consultar código original,
   use o protocolo de [012](012-delivery-reconstruction/plan.md). Mantenha o Harbor 0.22.0 como dependência externa;
   a reprodução não inclui reimplementar o framework ou os modelos dos providers.
4. Execute o gate offline com `pwsh scripts/test.ps1` ou `bash scripts/test.sh`.
5. Em host provisionado, siga `docs/INSTALACAO_MANUAL.md` para os gates reais.
   Registre versões, plataforma, rewards e cleanup; deixe itens não exercitados abertos.
6. Confronte o produto com os cenários de aceitação de cada spec. Atualize spec, plan
   e tasks quando uma decisão mudar. Revise as jornadas na UI, além dos testes de lógica.

Os checkboxes são um roteiro para **uma nova reconstrução**, não uma alegação de
que todas as capacidades existentes estejam por fazer. Os documentos distinguem a
implementação encontrada e a validação ainda pendente. Para apenas instalar/usar,
siga [Instalação com Claude](../docs/INSTALACAO_CLAUDE.md), sem reconstruir código.

## Usar com Spec Kit ou sem ele

Os documentos podem ser lidos diretamente por Claude, Codex ou outro agente.
O CLI do Spec Kit e seus comandos não foram instalados neste clone; `.specify/`
contém a constituição, não uma distribuição completa do toolkit.
Para automatizar o workflow, siga o [quickstart oficial](https://github.com/github/spec-kit#sdd-quickstart)
em uma cópia isolada, fixe a versão do toolkit e preserve estes documentos ao
inicializar a integração Claude. Não execute init com sobrescrita no clone de trabalho.
O fluxo é constituição → especificação → plano → tasks → implementação → convergência.

## Evidência desta baseline

Em 2026-09-08, a suíte offline passou com **231/231 testes**, incluindo o catálogo
teste-live, a ablação de skills e a política dos dois juízes. O verificador de imports
aprovou **80 módulos TypeScript e 36 módulos da GUI**, sem ciclos. O scanner completo
de credenciais também passou. A nova skill
`harbor-setup` passou no validador de frontmatter/estrutura.
O gate foi repetido após a auditoria, com log local em
`jobs-test/sdd-audit-gates.log`; ele não acompanha clones.

Isso não comprova nova instalação via Claude Code, execução dos modelos da demo ou
smoke das três novas tasks em containers. As soluções oracle dessas tasks passaram
offline (5/5, 7/7 e 11/11 métodos), conforme [TESTE_LIVE.md](../docs/TESTE_LIVE.md).
Validações anteriores da UI e Podman Windows estão referenciadas no README do projeto.

## Prompt de continuidade para Claude

```text
Leia AGENTS.md, .specify/memory/constitution.md e specs/README.md.
Quero trabalhar na capacidade [informe 001 a 012]. Leia spec.md, plan.md, tasks.md
e contracts.md quando existir. Confira também docs/AUDITORIA_SDD_2026-09-08.md.
Inspecione a implementação atual e liste apenas os desvios
reais antes de editar. A baseline é retrospectiva: checkboxes de reconstrução abertos
não significam código faltante. Preserve alterações existentes e não reimplemente
o que já atende aos contratos. Faça testes e docs na mesma mudança. Não exporte
segredos, não instale Docker, não execute AWS e não faça chamadas pagas sem pedido.
Registre evidências e limitações; nunca marque validação por inferência.
```
