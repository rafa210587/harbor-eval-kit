# Avaliar uma spec de repositório contra um PR

Este modo acrescenta uma fonte de tasks ao fluxo existente. Em **Tasks → Spec de
repositório + PR**, selecione o código inicial, documentos Markdown, PR mergeado e
checks. Depois da calibração, use a task em **Novo experimento**, com um ou vários
candidatos e os mesmos perfis, modelos e skills das avaliações tradicionais.

## Preparar pela UI

1. **Fonte:** URL Git HTTPS/SSH sem credenciais ou pasta local. Git local usa a
   revisão selecionada; sem revisão, procura a base histórica do PR. O checkout
   original não é alterado. Pastas sem Git precisam corresponder à árvore inicial.
2. **Documentos:** informe caminhos relativos de spec/plan/tasks Markdown. Pode usar
   uma fonte separada, inclusive uma pasta local. Links encontrados são sugestões;
   só documentos selecionados entram na instrução. Revise se contêm a solução.
3. **PR:** informe `owner/repo` e número de um PR mergeado no GitHub.com. O intervalo
   exclui alterações posteriores. Merge/squash são resolvidos automaticamente quando
   comprováveis; rebase exige SHA inicial explícito e verificação dos patches.
   Histórico ambíguo é recusado, sem adivinhar a base.
4. **Checks:** cada comando é um array JSON de argumentos, por exemplo
   `["python3","-m","unittest","discover"]`. Configure diretório relativo, timeout,
   códigos aceitos, peso e obrigatoriedade. Shell só quando declarado explicitamente
   no comando. Nunca coloque segredos nos argumentos ou nos scripts.
5. **Revisão:** confirme fontes confiáveis e resolva a prévia. Ambiente, preparação
   de dependências e pins de juiz/conjuntos de critérios ficam nas opções avançadas.
   Qualquer edição exige resolver outra prévia. Confira os SHAs no manifesto.
6. **Preparar Task Harbor:** executa base e referência sem LLM, em Podman. A referência
   precisa ser aprovada; a base deve ser reprovada pela regra determinística. Mudança documental pode ter
   exceção justificada. O painel mostra log persistido e permite cancelar.
7. **Usar esta task em Novo experimento:** escolha candidatos, tentativas, skills e
   teto de gasto. `nop` permite testar o fluxo sem inferência. O juiz é opcional.

A imagem deve existir no Podman e fornecer Bash, Python 3 e usuário `nobody`.
O padrão é `docker.io/library/python:3.13-slim`. O script de preparação instala
dependências durante o build; os checks executam depois, sem rede, em verifier
separado. O processo do check não pode escrever o arquivo que decide o reward.
O backend aceita relatório JUnit por check; o formulário inicial usa código de
saída. O limiar padrão é 1: todos os checks precisam passar. Em **Checks → Opções avançadas de aprovação**, um limiar como 0,8 permite falhas opcionais que somem até 20% do peso. Falhas obrigatórias, timeout, erro de infraestrutura e resultado incompleto sempre bloqueiam. O juiz recalcula a mesma regra a partir da receita congelada.

## O que o juiz recebe

Somente `candidate.diff`, `reference.diff`, documentos aprovados e resumo sanitizado
dos checks, além da rubrica e instruções do juiz. Não recebe árvore completa,
trajetória, configuração bruta nem histórico Git. Arquivos novos e removidos entram
no diff. Implementação diferente da referência pode estar correta.

Por padrão, reprovação determinística impede a chamada paga. Para investigar uma falha,
use **Análise avulsa → Julgar falhas para diagnóstico**. Isso não altera o reward.
Diff binário, acima de 10 MiB ou evidência incompleta bloqueiam a análise; não há
truncamento silencioso. Tasks tradicionais mantêm sua forma anterior de análise.

## Conectar um harness

Em **Agentes → Integrações de CLI e harness**, cadastre uma conexão e vincule-a ao
perfil de agente. A integração seleciona a credencial explicitamente; os demais
segredos do ambiente não são repassados ao processo dessa execução. Versão, adapter,
modo e endpoint públicos ficam registrados no snapshot. O valor da credencial e o
caminho de sessão nativa não entram no snapshot público ou no export.

| Adapter Harbor | API | Login nativo | Modelos |
|---|---|---|---|
| Claude Code | variável Anthropic; endpoint compatível opcional | token OAuth dedicado vinculado em Credenciais | ID manual do protocolo Anthropic |
| Codex | variável OpenAI; endpoint compatível opcional | `auth.json` dedicado, selecionado explicitamente | ID manual OpenAI ou sem prefixo; aliases aninhados recusados |
| Cursor CLI | variável Cursor, sem endpoint customizado | bloqueado no adapter atual | ID manual; sem pin de versão |
| OpenCode | providers suportados pelo adapter | bloqueado no adapter atual | descoberta somente no host com OpenCode 1.x; fallback manual |

**Diagnosticar** consulta a versão do CLI no host, sem instalar ou inferir. Isso não
certifica o CLI do container, a sessão ou acesso ao modelo. **Descobrir modelos** não
faz inferência nem cadastra automaticamente modelos. Copie o ID exato para Modelos.
Um modelo listado por LiteLLM ou pelo provider não torna seu protocolo compatível
com qualquer CLI. LiteLLM continua opcional e desligado por padrão; veja
[o guia do gateway](LITELLM.md).

API e login nativo deste modo são para **repositórios confiáveis**: o CLI precisa
da identidade de inferência no seu ambiente, e o código executado pode acessá-la.
Não existe broker nem isolamento adversarial dessa identidade. O candidato tem
rede pública para inferência; portanto, não há garantia contra busca de respostas
públicas. Credenciais Git e o gabarito local não são montados no candidato. Não use
este modo para executar repositórios hostis com uma sessão pessoal privilegiada.

## Instalação e fallback manual

Primeiro siga [a skill do Claude](INSTALACAO_CLAUDE.md) ou
[a instalação manual](INSTALACAO_MANUAL.md), incluindo doctor e smoke Podman.
Para GitHub privado, configure `gh auth login` no host com a sua identidade autorizada
e confira `gh auth status`. Para fonte SSH, use a autenticação SSH já configurada.
Não cole token em URL ou receita. Nenhuma autenticação é criada automaticamente.

Sem skill: inicie a GUI, cadastre somente as chaves necessárias em Credenciais,
configure a conexão na seção de Agentes e siga o assistente acima. Login nativo
requer vínculo explícito de sessão dedicada; o kit não procura nem copia uma sessão
pessoal por conta própria. Se um arquivo vinculado ficar inválido, restaure-o ou
corrija/remova o vínculo local antes de consultar/exportar dados. A proteção contra
segredos recusa saídas quando não consegue validar esse arquivo.

## Export, import e arquivos locais

**Tasks → Spec de repositório + PR → Exportar receita** gera um envelope separado
do bundle de catálogo. **Importar receita** preenche uma prévia; revise caminhos e
pins, salve e resolva novamente. Não importa automaticamente agentes ou credenciais:
use também o bundle de Configuração quando quiser transportar esses cadastros.
Fontes locais viram placeholders. Código, gabarito e sessões não entram no export.

Receitas e previews ficam em `~/.harbor-eval-kit/repository-evals/` e
`repository-previews/`. Tasks geradas ficam em `evals/repositories/` (ignoradas pelo
Git). Logs de preparação: `~/.harbor-eval-kit/operations/<id>/operation.log`;
calibração: `jobs/repository-calibration/`. Execuções usam o mesmo `jobs/`, histórico,
Logs e Trajetórias do fluxo atual. Evidências do juiz ficam em `repository-analysis/`
no estado local; só a análise concluída é copiada de volta ao trial.

## Evidência e limites desta implementação

Em 08/09/2026, Windows + Harbor 0.22.0 + Podman 6.0.2: preparação real pela UI de
`octocat/Hello-World#6`, base reward 0 e referência reward 1; execução unitária com
Nop, reward 0, zero exceções, 50,3 s reportados pelo runner. A UI bloqueou o juiz
após a falha determinística, antes de inferência. Corrigidos dois bugs encontrados
nesses testes: cópia de `test.sh` para o verifier e criação entre discos C: e D:.

Também foi exercitada Análise avulsa com diagnóstico de falha e DeepSeek V4 Flash:
concluiu com referências a candidate.diff/reference.diff/documents.md/verification.json,
custo reportado de US$ 0,007408 e marca explícita de validação. Regressão tradicional
pela UI: `soma-fracoes`, Oracle reward 1 (27,8 s), Nop reward 0 (26,7 s), sem juiz.
Logs abriram o job correto. Export/import de receita, reabertura, edição da conexão,
diagnóstico Codex 0.153.4 no host e fallback manual de modelos foram exercitados.
Assistente em viewport de 390 px não apresentou overflow horizontal.

Comparação real da task de PR com Mini SWE e duas skills iguais:

| Modelo | Reward | Custo reportado (USD) | Duração | Tokens entrada / saída |
|---|---:|---:|---:|---:|
| DeepSeek V4 Flash | 1 | 0,00283164 | 96,302 s | 14.637 / 984 |
| DeepSeek V4 Pro | 1 | 0,004849768 | 99,855 s | 7.859 / 626 |

Experimento `c3848ffe-2cd1-4b54-aee6-81848604d0c6`, uma tentativa por modelo,
`cost_limit=0.10` e `step_limit=12`. A trajetória Flash mostra leitura dos dois
SKILL.md em `/harbor/skills`. A trajetória Pro não mostra leitura das skills;
entrega dos arquivos não comprova que o modelo as seguiu. Ambos corrigiram o README
histórico e passaram no verifier. Este é um smoke da plataforma, não um benchmark
suficiente para comparar qualidade dos modelos.

Essa evidência ainda não certifica login real dos quatro CLIs, todas as jornadas
com juiz pago, macOS/Linux, merge queues ou repositórios arbitrários. Submodules,
symlinks e arquivos sensíveis são recusados; há limites de tamanho. A aceitação e
as pendências continuam na [spec 013](../specs/013-repository-pr-evals/tasks.md).


A preparação também foi cancelada pela UI (operação
`74fa923f-ab17-4da3-8e85-427668ec23e3`), com estado persistido e nenhum container
gerenciado em execução ao final. Um smoke sem LLM do verifier, em Podman, executou
um check que comprovou usuário não root, ausência de rota de rede e impossibilidade
de sobrescrever `/logs/verifier/reward.txt`: reward 1, zero exceções, 51,282 s.
A conexão temporária de diagnóstico foi removida; nenhum cadastro preexistente foi apagado.

Aprovação ponderada também foi exercitada pela UI, sem LLM, na operação
`73714e47-7f8d-47b4-bf26-bfe3f077331e`: limiar 0,8, check obrigatório com peso 4
mais um opcional com peso 1 e falha controlada. A base teve score 0/reprovada;
a referência teve score 0,8/aprovada. A receita salva anterior permaneceu intacta.
