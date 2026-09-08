# Especificações e reprodução do produto

Este diretório descreve a baseline de 2026-09-08 no formato de desenvolvimento
orientado por especificações do [GitHub Spec Kit](https://github.com/github/spec-kit).
É uma **reconstrução documental retrospectiva**, não um histórico fictício de como
o código foi produzido. Os arquivos permitem reconstruir as capacidades e verificar
sua equivalência; não prometem gerar código byte a byte idêntico.

## Mapa e ordem de implementação

| Ordem | Capacidade | Dependências |
|---|---|---|
| 1 | [001 — Runtime local](001-local-runtime/spec.md) | Constituição |
| 2 | [002 — Catálogo e segurança](002-catalog-security/spec.md) | 001 para integração local |
| 3 | [003 — Experimentos](003-experiments/spec.md) | 001, 002 |
| 4 | [004 — Juízes e resultados](004-judging-results/spec.md) | 002, 003 |
| 5 | [005 — UI e onboarding](005-ui-onboarding/spec.md) | 001–004 |
| 6 | [006 — Demo e validação](006-demo-validation/spec.md) | 001–005 |

Cada pasta contém `spec.md` (necessidade e aceitação), `plan.md` (decisões técnicas,
contratos e validação) e `tasks.md` (passos de implementação rastreáveis).
A [constituição](../.specify/memory/constitution.md) contém os invariantes comuns.
O plano AWS fica separado em [PLANO_AWS_CORPORATIVO.md](../docs/PLANO_AWS_CORPORATIVO.md),
sem tarefas executáveis de implantação nesta baseline.

## Como reconstruir

1. Preserve este repositório como referência. Trabalhe em um diretório novo ou branch
   isolada; não apague o projeto para testar reprodução.
2. Leia constituição, README e todas as specs antes de selecionar uma capacidade.
3. Leia o plan e implemente suas tasks em ordem, usando os contratos e testes citados
   como critérios observáveis. Mantenha o Harbor 0.22.0 como dependência externa;
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
O log local está em `jobs-test/sdd-delivery-gates.log` e não acompanha clones.

Isso não comprova nova instalação via Claude Code, execução dos modelos da demo ou
smoke das três novas tasks em containers. As soluções oracle dessas tasks passaram
offline (5/5, 7/7 e 11/11 métodos), conforme [TESTE_LIVE.md](../docs/TESTE_LIVE.md).
Validações anteriores da UI e Podman Windows estão referenciadas no README do projeto.

## Prompt de continuidade para Claude

```text
Leia AGENTS.md, .specify/memory/constitution.md e specs/README.md.
Quero trabalhar na capacidade [informe 001 a 006]. Leia spec.md, plan.md e tasks.md
da pasta correspondente, inspecione a implementação atual e liste apenas os desvios
reais antes de editar. A baseline é retrospectiva: checkboxes de reconstrução abertos
não significam código faltante. Preserve alterações existentes e não reimplemente
o que já atende aos contratos. Faça testes e docs na mesma mudança. Não exporte
segredos, não instale Docker, não execute AWS e não faça chamadas pagas sem pedido.
Registre evidências e limitações; nunca marque validação por inferência.
```
