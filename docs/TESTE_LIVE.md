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
comprovar saldo, quotas ou acesso atual de cada modelo na preparação inicial. Os dois
testes reais posteriores com DeepSeek estão registrados abaixo; Anthropic segue sem
completion de validação nesta rodada. Os aliases DeepSeek podem
receber atualizações no provider; registrar o identificador não congela os pesos.

### Skills

- **`codificacao-por-contrato-teste-live`**: ler a especificação, identificar
  invariantes, implementar uma solução geral e manter mudanças proporcionais.
- **`validacao-adversarial-teste-live`**: criar e executar testes próprios, procurar
  limites e invariantes, e relatar somente o que foi de fato verificado.

As skills não fornecem a solução oracle, nem autorizam alterar testes protegidos ou
reward. Harbor entrega os arquivos em `/harbor/skills`, mas o adapter Mini SWE 0.22
não os anuncia automaticamente. A revisão **1.0.1** das três tasks inclui a mesma
instrução explícita para ler os `SKILL.md` disponíveis antes de implementar; sem
skills, prossegue normalmente. Isso não altera os testes nem a API exigida. A leitura
ainda precisa ser conferida na trajetória: seleção não comprova uso pelo modelo. Não há instruções adicionais ocultas no perfil: desmarcar o conjunto na
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
   --ak cost_limit=1.00 --ak max_tokens=16384 --ak config='{"agent":{"step_limit":40}}'
   ```

   4096 tokens provocaram truncamentos repetidos no primeiro teste real com Flash.
   O limite maior permite mais espaço para raciocínio/saída e pode aumentar o custo.
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

Gate da preparação inicial: `pwsh -NoProfile -File scripts/test.ps1` passou com **231/231 testes**,
imports de **80 módulos TS e 36 módulos GUI**, sem ciclos, e scanner de credenciais
aprovado. Log local: `jobs-test/teste-live-gates.log`. O catálogo, as tasks e os guias
são artefatos versionáveis; cadastros da instância e evidências em `jobs-test/` são locais.

**Validação real pela UI em 08/09/2026:** duas execuções individuais da task
`simples-teste-live`, com um candidato, uma tentativa e nenhuma análise de juiz.
Resultados e limites estão na seção seguinte. Os pares Oracle/Nop em containers
para as três tasks e as execuções reais das tasks média/difícil continuam pendentes.

A instância original em `127.0.0.1:4173` estava desatualizada. Os testes usaram um
servidor atualizado, sem interromper a instância anterior. Reinicie o backend após
atualizar o clone; recarregar só a página não atualiza suas rotas.

O export foi renovado pela API, filtrado aos 23 registros `teste-live`, validado sem
credenciais e conferido contra o catálogo anterior: conteúdo idêntico, apenas data
de exportação atualizada. Os três vínculos task–juiz–rubrica foram relidos e conferem.
As tasks e os vínculos continuam nos caminhos já documentados, sem arquivos duplicados.
AWS e LiteLLM continuam sem ativação.

## Dois testes individuais reais pela UI — 08/09/2026

Ambos usaram a task simples **1.0.0** congelada no experimento, um candidato Mini
SWE, uma tentativa, concorrência 1, duas skills selecionadas, limite de 40 passos e
cost_limit=0.50. Foram iniciados pelo botão Executar experimento; resultados e
verifier/test-output.txt foram conferidos na própria UI. Nenhum botão Analisar
foi acionado: ambos os registros persistidos têm zero análises de juiz.

| Modelo | max_tokens | Reward | Custo USD reportado | Tokens entrada/saída | Duração |
|---|---:|---:|---:|---:|---:|
| DeepSeek V4 Flash | 4096 | 0 | 0.017402976 | 9450 / 12430 | 151.264 s |
| DeepSeek V4 Pro | 16384 | 1 | 0.094399800 | 122352 / 20793 | 405.941 s |

Flash terminou com RepeatedFormatError após respostas truncadas; não substituiu o
stub. O verificador executou cinco métodos e registrou os erros de NotImplementedError,
sem consultar LLM. Pro implementou a solução e passou nos cinco métodos. Harbor não
reportou exceções de infraestrutura nesses dois trials. “Concluído” descreve a execução;
o reward distingue aprovação/reprovação. A UI mostrou “Não analisado” na coluna do juiz.

Os limites diferentes e uma única tentativa impedem inferir superioridade de um modelo.
Custo total reportado: **US$ 0.111802776**; nenhuma chamada ao juiz.

IDs no histórico de `jobs/teste-live`:

- Flash: `4300a3f1-d274-4397-82a1-1314d2726e40`.
- Pro: `39665d81-efd3-4806-8544-9c18b07dd159`.

Durante a run Pro, os dois SKILL.md foram encontrados em /harbor/skills. Disponibilidade
não comprova leitura. A instrução explícita de descoberta foi acrescentada depois, na
revisão **1.0.1**, igual nas três tasks; sua leitura pelo agente ainda não foi validada
numa nova run. Os snapshots anteriores não foram alterados. Nenhuma solução/teste do
avaliador foi ajustado para favorecer os modelos.

O export também passou por importação em estado temporário vazio: 23 registros;
reimportação com zero novos registros; reexportação idêntica. O estado temporário foi
removido. O gate da rodada passou nos 247 testes e nos imports de 83 módulos TS e
38 módulos GUI. Evidências brutas permanecem locais e não integram o catálogo exportado.

## Continuidade

```text
Leia docs/TESTE_LIVE.md e AGENTS.md. O catálogo exportado contém os 23 registros
pedidos e os vínculos das três tasks foram conferidos. Em clone novo, importe
config/teste-live/catalogo-teste-live.json e aplique os vínculos deste guia.
As tasks estão versionadas no repo; o export JSON não inclui seus arquivos.
Dois testes individuais sem juiz foram executados pela UI na task simples 1.0.0.
A revisão 1.0.1 acrescenta descoberta explícita de skills, sem mudar o verificador;
a leitura das skills precisa ser confirmada numa próxima trajetória, antes de
alegar efeito das skills. Não repita chamadas pagas sem necessidade/autorização.
Oracle/Nop reais das três tasks, calibração de dificuldade, Anthropic e os juízes
continuam pendentes. Preserve resultados locais e não publique logs/credenciais.
```
