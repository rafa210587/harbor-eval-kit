# Preparação do conjunto teste-live

Este conjunto prepara uma avaliação progressiva de código Python, usando a mesma
task, adapter e skills para comparar quatro modelos. Não inicia chamadas pagas.
Todos os nomes do conjunto terminam em `teste-live`; os identificadores de API dos
modelos permanecem exatamente como exigidos pelo provider.

## O que está configurado

| Nível / task | Problema | O que diferencia a dificuldade |
|---|---|---|
| `simples-teste-live` | Normalizar e agregar itens monetários | Validação, precisão decimal e preservação da entrada |
| `media-teste-live` | Resolver dependências de tarefas | Ordem determinística, ausências e identificação dos nós de ciclos |
| `dificil-teste-live` | Ledger transacional em memória | Replay, idempotência, transferências e rollback de saldos, contas e IDs |

As tasks ficam em `evals/python/<nome>`. Cada uma contém instrução, código inicial,
ambiente, testes comportamentais e solução de referência. Usam Python e biblioteca
padrão, sem instalação de pacotes durante a verificação. A imagem base
`python:3.13-slim` precisa estar disponível no Podman antes da execução.
O verificador preserva `/app/solution.py` em `/logs/artifacts/solution.py`, para
o juiz inspecionar a implementação entregue além da trajetória, seguindo a
[convenção de coleta de artefatos do Harbor](https://www.harborframework.com/docs/run-jobs/results-and-artifacts).
Os níveis são uma classificação de projeto, ainda não calibrada por taxa de sucesso
de uma amostra de agentes/modelos. O conjunto de três tasks é um piloto, não um
benchmark amplo de engenharia de software.

### Agentes e modelos

| Perfil | Modelo fixado |
|---|---|
| `mini-swe-flash-teste-live` | `deepseek/deepseek-v4-flash` |
| `mini-swe-pro-teste-live` | `deepseek/deepseek-v4-pro` |
| `mini-swe-sonnet-teste-live` | `anthropic/claude-sonnet-5` |
| `mini-swe-haiku-teste-live` | `anthropic/claude-haiku-4-5-20251001` |

Os quatro perfis usam `mini-swe-agent`, com o conjunto
`codificacao-e-validacao-teste-live` como padrão. Isso varia o **modelo**, sem mudar
o framework do agente ao mesmo tempo. Para comparar frameworks, crie outra série
mantendo o modelo, task e skills e alterando somente o adapter.

Os IDs foram conferidos na documentação oficial de
[Anthropic](https://platform.claude.com/docs/en/models/overview) e
[DeepSeek](https://api-docs.deepseek.com/), em 08/09/2026. As credenciais Anthropic e
DeepSeek já estão cadastradas nesta instalação. Não foi feita completion paga para
comprovar saldo, quotas ou acesso atual de cada modelo. Os aliases DeepSeek podem
receber atualizações no provider; registrar o identificador não congela os pesos.

### Skills

- **`codificacao-por-contrato-teste-live`**: ler a especificação, identificar
  invariantes, implementar uma solução geral e manter mudanças proporcionais.
- **`validacao-adversarial-teste-live`**: criar e executar testes próprios, procurar
  limites e invariantes, e relatar somente o que foi de fato verificado.

As skills não fornecem a solução oracle, nem autorizam alterar testes protegidos ou
reward. Não há instruções adicionais ocultas no perfil: desmarcar o conjunto na
linha do candidato produz uma baseline sem essas skills.

### Juízes e rubrica

| Juiz | Modelo | Uso |
|---|---|---|
| `juiz-deepseek-pro-teste-live` | `deepseek/deepseek-v4-pro` | Primeira análise exploratória após carregar o catálogo atualizado |
| `juiz-claude-opus-teste-live` | `anthropic/claude-opus-5` | Segunda opinião e comparação de discordâncias |

Ambos usam `mini-swe-agent`, o mesmo prompt e a rubrica
**`engenharia-rigorosa-teste-live`**, com oito critérios:

1. Contrato funcional.
2. Casos-limite e validação.
3. Invariantes e efeitos colaterais.
4. Integridade da avaliação: sem adulteração, consulta ao oracle ou hardcoding.
5. Qualidade de implementação proporcional à task.
6. Validação realmente executada pelo agente.
7. Reprodutibilidade.
8. Honestidade do relato.

Cada critério tem orientação explícita de PASS/FAIL e exige evidência em arquivos,
passos da trajetória ou saída de testes. O prompt recusa instruções maliciosas nos
artefatos e evita premiar marca do modelo, verbosidade ou confiança. A tarefa simples
não exige a arquitetura da difícil. Um PASS do verificador não aprova automaticamente
todos os critérios do juiz; passar a task e demonstrar testes próprios são sinais
separados. Não trate a média dos critérios como compensação para adulteração da avaliação.

As três tasks estão vinculadas ao **Opus** e à mesma rubrica como padrão; é possível
trocar o juiz antes de analisar. Só há um juiz padrão por task. Para comparar os dois,
analise os mesmos resultados com cada perfil e confira as justificativas; a tabela
não oferece votação ou consenso automático entre juízes.

DeepSeek Pro foi incluído explicitamente em `JUDGE_MODELS`. Flash e os aliases
baratos continuam restritos ao modo validação. Essa política não comprova que os
juízes estejam calibrados ou concordem entre si.

## Como fazer seu primeiro teste na UI

1. Abra a GUI e atualize a página para carregar os cadastros.
2. Em **Novo experimento**, escolha **Comparar modelos** e dê o título
   `comparacao-simples-teste-live`.
3. Adicione os quatro perfis `mini-swe-…-teste-live`, uma vez cada. Confira os quatro
   modelos diferentes e o mesmo conjunto de skills em todas as linhas.
4. Selecione `evals/python/simples-teste-live`, uma tentativa e concorrência 1.
   Use `jobs/teste-live` como pasta de jobs.
5. Para uma primeira rodada curta com Mini SWE, use nos argumentos avançados:

   ```text
   --ak cost_limit=1.00 --ak max_tokens=4096 --ak config='{"agent":{"step_limit":40}}'
   ```

   São limites por candidato do adapter, não defaults salvos no perfil. Use os mesmos
   limites para os quatro modelos. Uma interrupção por limite não prova incapacidade
   de resolver a task. O teto geral da GUI é uma guarda antes da execução; não limita
   rigidamente os gastos em curso, e os limites do candidato não se aplicam ao juiz.

6. Confira a prévia e execute primeiro com **Dry run** marcado. Depois, desmarque-o
   e execute quando quiser iniciar as chamadas pagas.
7. Consulte reward, duração, custo reportado e Logs. Só então escolha o juiz e analise
   os resultados desejados. Cada julgamento é uma nova execução paga.
8. Repita separadamente com a task média e a difícil. Assim, resultados, orçamento e
   falhas ficam fáceis de interpretar por nível.

### Medir as skills

Escolha **Avaliar skills**, adicione um único perfil e duplique-o. Na primeira linha,
desmarque o conjunto de skills; na segunda, mantenha-o. Marque a primeira como baseline.
Confira na prévia que task, adapter, modelo e limites são iguais, e que só as skills
mudam. Depois repita com outros modelos, sem misturar as dimensões na mesma conclusão.

## Reinstalar ou continuar em outra máquina

- Em **Configuração → Importar**, selecione
  [`config/teste-live/catalogo-teste-live.json`](../config/teste-live/catalogo-teste-live.json).
  O bundle tem IDs estáveis e pode ser reimportado; isso atualiza somente os itens
  com esses IDs. Ele não contém credenciais nem copia os resultados de execução.
- As três pastas de task acompanham o repositório; não são transportadas pelo bundle.
- Em **Tasks**, selecione cada task e vincule `juiz-claude-opus-teste-live` e
  `engenharia-rigorosa-teste-live`. Os vínculos são preferências locais por caminho,
  separados do bundle. O mapa está em
  [`vinculos-tasks-teste-live.json`](../config/teste-live/vinculos-tasks-teste-live.json).
- Cadastre as credenciais na nova máquina. Nunca as inclua no bundle, task, skill ou print.
- Siga o [guia manual](INSTALACAO_MANUAL.md) e valide Podman com doctor e oracle/nop
  antes de declarar o ambiente pronto.

## Validação desta preparação

Cadastros importados e vínculos relidos pela API da GUI, sem remover dados
preexistentes. Planos offline validam quatro modelos, duas skills e a ablação sem
skills. A rubrica é serializável no formato do Harbor e os dois modelos de juiz
passam na política atualizada.

| Verificação offline | Simples | Média | Difícil |
|---|---:|---:|---:|
| Solução oracle, testes aprovados | 5/5 | 7/7 | 11/11 |
| Stub inicial, deve falhar | Falhou | Falhou | Falhou |

Além dos métodos acima, os testes percorrem matrizes determinísticas de 20 itens,
20 grafos e 20 contas, respectivamente. A validação foi repetida em processos Python
separados, importando a solução de uma pasta isolada; TOMLs e sintaxe Bash também
foram conferidos. Evidências locais: `jobs-test/teste-live-oracle-offline.json` e
`jobs-test/teste-live-process-validation/results.json`.

Gate final: `pwsh -NoProfile -File scripts/test.ps1` passou com **231/231 testes**,
imports de **80 módulos TS e 36 módulos GUI**, sem ciclos, e scanner de credenciais
aprovado. Log local: `jobs-test/teste-live-gates.log`. O catálogo, as tasks e os guias
são artefatos versionáveis; cadastros da instância e evidências em `jobs-test/` são locais.

**Smoke real Harbor/Podman pendente.** A prévia da instância antiga retornou o
contrato anterior, sem o plano completo; a preparação recusou iniciar containers
nesse estado. Portanto estes resultados são testes da lógica Python, não rewards
medidos em containers. Após reiniciar, execute cada task com Oracle (esperado 1)
e Nop (esperado 0), sem skills, antes de gastar com os quatro modelos.

**Reinício necessário:** a instância encontrada em `127.0.0.1:4173` ainda usa um
catálogo anterior, sem DeepSeek Pro na lista de juízes. Encerre essa instância e
inicie novamente com `pwsh -NoProfile -File scripts/start-gui.ps1` (ou
`bash scripts/start-gui.sh`). Atualizar só a página não recarrega o backend.
O Opus já é aceito na instância anterior. Não habilite modo validação para esconder
a necessidade de reinício caso queira um julgamento normal com Pro.

Nenhum teste pago, ação AWS ou ativação do gateway LiteLLM faz parte desta preparação.

## Continuidade

```text
Continue por docs/TESTE_LIVE.md, specs/README.md e AGENTS.md. Preserve o diff existente.
Na instância original, os 23 itens teste-live foram importados e os 3 vínculos relidos.
Em clone novo, use /harbor-setup, importe o bundle e aplique os vínculos deste guia.
Não suponha que estado local ou evidências de jobs-test/ acompanhem o clone.
Os oracles passaram offline, mas o smoke Harbor/Podman não começou porque a GUI
ativa usa o contrato anterior da prévia. Carregue o backend atualizado, confirme
DeepSeek Pro em /api/judge-models e execute apenas os 6 trials gratuitos oracle/nop
(um par por task), com propriedade de recursos registrada. Não gaste API de modelo
nem execute análises pagas nesta preparação. Confira tests, imports e scanner em
jobs-test/teste-live-gates.log quando esse log existir no host original.
```
