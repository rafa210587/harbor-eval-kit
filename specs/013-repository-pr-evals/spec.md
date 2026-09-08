# 013 — Avaliar implementação de specs com gabarito de PR

Status: **APROVADA em 2026-09-08 — implementação iniciada; ainda não disponível**.
Data: 2026-09-08. Dependências: 002, 003, 004, 007, 008, 009 e 011.
Leia [plan.md](plan.md) e [tasks.md](tasks.md) antes de implementar.

## Objetivo e viabilidade

Adicionar um modo de avaliação que entrega uma especificação e um repositório
inicial completo ao candidato, executa verificações determinísticas e, opcionalmente,
compara semanticamente o diff da solução com o diff de um PR já integrado. O juiz
não recebe o repositório completo. Preservar o modo de
tasks Harbor existente, inclusive execução individual, Compare e Analyze.

É viável sem reescrever o produto. A extensão tem porte moderado: aquisição e
congelamento de repositórios, preparação de uma task Harbor, isolamento do
gabarito, evidências para o juiz e configuração de integrações. Não é apenas
adicionar campos: autenticação, fronteiras do PR e isolamento exigem testes próprios.

## Situação confirmada no código

| Área | Hoje | Extensão proposta |
|---|---|---|
| Tasks | Diretórios Harbor; editor de instrução, Dockerfile, solução e verifier | Fonte de documentos e código por repositório, convertida em task Harbor |
| Determinístico | `tests/test.sh` customizável; timeout/env no `task.toml`; reward sem juiz | Checks estruturados na UI, resultado individual e política de aprovação |
| Candidatos | Profiles com modelo e skills; snapshots por experimento | Reutilizar os mesmos IDs e adicionar vínculo opcional com integração |
| Harness | Catálogo contém `claude-code`, `codex`, `cursor-cli`, `opencode` | Configuração, diagnóstico e matriz de capacidades por versão |
| Modelos | Cadastro direto e descoberta via providers/LiteLLM | Origem adicional no CLI, quando suportada |
| Juiz | Prompt/rubricas congelados, pins de juiz/rubrica | Contexto histórico de referência e cobertura das evidências |
| Export | Catálogo sem credenciais; não empacota tasks | Receita portátil versionada, import com preview e reautenticação local |

Referências locais: `scripts/lib/tasks.ts`, `experiment-plan.ts`,
`experiment-store.ts`, `catalog.ts`, `analysis-inputs.ts`, `litellm-probe.ts`.
Listar um adapter não comprova seu funcionamento com qualquer modelo ou login.

## Jornadas

### US1 — Preparar uma avaliação reproduzível (P1)

Em Tasks, escolher **Task Harbor existente** ou **Spec de repositório + PR**.
Informar fonte do código, documento principal, documentos auxiliares, repositório
GitHub do gabarito e número do PR. Fonte documental pode ser diferente da fonte do
código. Revisar o manifesto resolvido antes de preparar a avaliação.

- FR01: aceitar repositório GitHub público/privado, Git remoto HTTPS/SSH e
  repositório/diretório local. Caminho de compartilhamento já montado no host é
  tratado como local. Não executar comandos de uma máquina remota via SSH nesta versão.
- FR02: autenticação GitHub pertence ao usuário local do sistema operacional.
  Esta extensão não introduz contas web, multiusuário ou RBAC.
- FR03: resolver ref documental em SHA; para diretórios sem Git, congelar arquivos
  com hashes. Nunca alterar o checkout original. Mudanças locais não commitadas
  só entram mediante seleção explícita e aparecem como snapshot sem commit.
- FR04: a spec principal pode referenciar plan, tasks e outros Markdown relativos.
  Mostrar lista, origem, tamanho e hash; usuário confirma quais entram. Detectar
  ciclos e impedir escapes de raiz, links simbólicos e inclusão remota automática.
  Referência a outro repo exige fonte cadastrada e seleção explícita.
- FR05: congelar código inicial, documentação, checks, ambiente, integração,
  modelo, skills e rubrica para todos os candidatos. Edição posterior cria revisão.

### US2 — Usar o PR correto como referência (P1)

- FR06: exigir PR mergeado no repositório informado. Resolver e persistir SHAs
  inicial e final, método de merge, head original, número e data de integração.
  Nunca usar o HEAD atual da branch como substituto do estado histórico.
- FR07: para merge comum, usar primeiro pai do merge como início e árvore do merge
  como final; para squash, pai do squash e árvore do squash. Para rebase, resolver
  o intervalo integrado completo, não apenas o último commit. Ambiguidade exige
  SHA inicial explícito, validado contra as evidências; sem prova, bloquear.
- FR08: o gabarito apresentado ao juiz é o diff agregado completo do intervalo
  histórico, inclusive resoluções de conflito, não a árvore final nem uma sequência
  de commits. Alterações posteriores ao PR ficam fora. Paginação/truncamento de APIs
  não pode reduzir silenciosamente o diff. Árvores completas permanecem internas
  à preparação e à validação determinística, sem acesso pelo juiz.
- FR09: candidato recebe o repositório inicial completo, com todos os arquivos
  seguros necessários para implementar e testar, e a documentação selecionada. Não
  recebe referência, diff do PR, histórico Git original, comentários de solução,
  credencial Git nem acesso à pasta de evidências do juiz. Documentação extraída
  do PR precisa ser revisada para não incluir a implementação-resposta.
- FR10: referências somente leitura e isoladas também durante build, preparação
  da imagem e verificação. Não colocar gabarito em camada de imagem do candidato.
  Escopo aprovado após a análise de viabilidade: modo para repositórios confiáveis.
  Candidato usa rede pública de inferência; não há garantia contra busca de respostas
  públicas nem isolamento adversarial da credencial CLI. Git do host e gabarito
  local permanecem separados. Verifier usa ambiente separado sem rede. Uma futura
  execução adversarial exige broker/egress e constitui capacidade ainda não entregue.

### US3 — Configurar verificações sem LLM (P1)

- FR11: formulário permite comando/argumentos, diretório relativo, timeout,
  códigos de saída aceitos, parser de relatório, peso e indicação de obrigatório.
  Exemplos: testes, build, lint e typecheck. Shell script avançado é explícito,
  executado somente no sandbox e nunca interpolado no shell do host.
- FR12: verificações ocorrem antes do juiz; distinguir aprovado, reprovado,
  erro de infraestrutura, timeout e não executado. Regra padrão: todos os checks
  obrigatórios passam; score ponderado não mascara falha obrigatória. Sem checks
  executados não há aprovação. Pesos positivos e limiar entre 0 e 1.
- FR13: validar os checks no código inicial e no gabarito antes de liberar a receita.
  Gabarito deve passar os checks obrigatórios. Um check de comportamento novo deve
  falhar na base quando aplicável; mudança só documental pode justificar exceção.
  Não exigir que todos os testes existentes falhem no código inicial.
- FR14: verifier e decisão do reward ficam fora do controle de escrita do candidato.
  Testes privados são injetados depois da implementação em ambiente separado.
  Ausência de relatório, erro de parser ou reward forjado nunca contam como sucesso.
- FR15: juiz permanece opcional. Com juiz, padrão é executar após aprovação dos
  checks obrigatórios; opção visível permite julgar também falhas para diagnóstico.
  Mostrar reward determinístico e nota do juiz separadamente.

### US4 — Julgar a implementação contra a referência (P1)

- FR16: escolher juiz e rubrica existentes, respeitando seus pins e a política de
  modelos elegíveis. Congelar critérios/pesos e mostrar o vínculo efetivo no preview.
- FR17: fornecer spec/plan/tasks aprovados, diff agregado do candidato contra a base,
  diff agregado do PR de referência e relatórios dos checks. Quanto ao código, o
  juiz só recebe os diffs, com contexto dos próprios hunks; não recebe árvores,
  arquivos inteiros fora do diff nem ferramentas para consultar o repo. Incluir
  adições, exclusões, renomes e arquivos novos do candidato, inclusive não commitados.
  Tratar o conteúdo como evidência, nunca como instruções para alterar a rubrica.
- FR18: comparar atendimento dos requisitos, comportamento, regressões, segurança,
  testes e manutenção. O PR é uma solução de referência, não a única correta:
  implementação diferente mas equivalente não perde pontos por diferença textual.
- FR19: resultado cita requisito e arquivo/trecho para cada critério, com cobertura
  da evidência. Diffs grandes exigem leitura em partes com índice completo; binários
  ou informação insuficiente ficam explicitamente não avaliados pelo juiz, apoiando-se
  nos checks determinísticos. Limite excedido produz avaliação incompleta, nunca
  alegação de leitura integral ou busca silenciosa de arquivos fora do diff.

### US5 — Configurar harness e modelos na UI (P1)

- FR20: seção **Integrações** dentro de Agents permite perfil para Claude Code,
  Codex CLI, Cursor CLI e OpenCode, reutilizando adapters Harbor. Configurar versão,
  instalação no ambiente de execução, autenticação e opções suportadas tipadas.
  Diagnóstico não roda o binário do projeto nem aceita um comando arbitrário do repo.
- FR21: separar credencial de repositório, autenticação de harness e credenciais
  de inferência. Login existente só pode ser reutilizado por mecanismo suportado
  e explícito; não copiar automaticamente sessões do host para containers.
  Conforme confirmação do usuário, a integração deve contemplar tanto chaves de API
  quanto login/assinatura nativa; compatibilidade é específica de cada CLI, sem
  tratar OpenCode como se necessariamente tivesse uma assinatura própria.
- FR22: modelos podem vir do CLI, provider direto, LiteLLM ou cadastro manual.
  Validar compatibilidade do protocolo, adapter e autenticação antes de executar.
  Cadastro não garante acesso. Não prometer que qualquer CLI aceita qualquer gateway.
- FR23: botão **Descobrir modelos** só lista; **Testar conexão** é ação separada,
  com aviso de possível custo. Onde não há descoberta suportada, explicar e permitir
  ID manual. Persistir origem, versão consultada e identificador exato; não fazer
  fallback silencioso de modelo. Alias não resolvido aparece como não fixado.
- FR24: verificar entrega e leitura das skills por adapter; não presumir uso apenas
  porque foram copiadas. Preservar equivalência de instruções entre candidatos e
  registrar limitações. O gap conhecido do Mini SWE não pode ser ocultado nesta jornada.

### US6 — Operar, compartilhar e retomar (P1)

- FR25: cada campo explica função e exemplo. Etapas: Fonte → Spec → PR → Checks →
  Integração/candidatos → Juiz → Revisão. Impedimentos indicam o próximo passo.
  Operações longas têm botão travado, tempo, cancelamento e log redigido.
- FR26: persistir manifesto e eventos de aquisição/preparação/execução/verificação/
  julgamento em disco, acessíveis por experimento/trial na UI. Reinício conserva
  histórico; processo interrompido não aparece como concluído nem é repetido com custo.
- FR27: exportar/importar receita e vínculos por schema versionado com preview,
  remapeamento e conflitos. Nunca exportar credenciais, sessões, ambiente do host,
  configuração Git ou caminhos absolutos privados. Código privado e gabarito não
  integram o export padrão; import reobtém SHAs com credenciais locais. Fonte local
  precisa ser remapeada. Ausência de acesso é erro acionável, não fallback para HEAD.
- FR28: não adicionar uma aba principal por integração nem exibir todos os campos
  simultaneamente. Tasks mantém escolha simples de modo; o novo assistente mostra
  uma etapa por vez. Campos avançados ficam em disclosure com resumo dos valores
  efetivos. Agents mantém uma seção recolhível de integrações e edição em painel.
  Hints curtos junto aos campos, detalhes sob demanda; erros nunca ficam escondidos.
- FR29: configuração de harness mostra um fluxo único: escolher CLI → verificar
  versão/ambiente → vincular autenticação → selecionar origem/modelo → testar.
  Exibir capacidades e incompatibilidades no mesmo painel; não duplicar a aba de
  Credenciais. Conexão salva pode ser reutilizada por vários profiles de agente.
- FR30: entregar atualização dos guias de instalação, operação, fallback manual e
  skills de setup junto do código. Renovar imagens da UI no repo para as jornadas
  alteradas com dados de demonstração sem credenciais. Capturas devem representar
  a UI real entregue, não mockups, e explicar os passos sem poluir a aplicação.
- FR31: manter todas as capacidades existentes. Novos campos opcionais não mudam
  defaults, snapshots, resultados ou comportamento de receitas antigas. Antes de
  habilitar a nova jornada, passar a suíte completa e testar regressão de Tasks,
  execução individual, Compare, Analyze/pins/rubricas, skills, credenciais diretas,
  LiteLLM desligado/ligado, import/export sem segredos, logs, cancelamento e retomada.
  Mudança de schema exige fixture de leitura de dados anteriores e migração segura.
  Testes reais pagos e suporte por SO são evidências separadas, nunca inferidas de mocks.

## Aceitação mínima

1. Repo fixture tem PR com vários commits e um commit posterior sentinela: base e
   gabarito reproduzem o intervalo aprovado e não contêm a sentinela posterior.
2. Repetir para merge, squash e rebase; rebase ambíguo bloqueia até resolução provada.
3. Spec liga plan/tasks recursivamente; ciclo, escape e arquivo ausente geram preview
   claro. Só arquivos escolhidos chegam ao candidato; nova ref não muda run congelado.
4. Uma solução correta diferente do PR passa; solução incompleta falha checks e/ou
   critérios, com evidência. Sem juiz há resultado determinístico completo.
5. Candidato tenta ler gabarito, buscar PR por rede, alterar verifier e forjar reward:
   nenhuma tentativa permite obter resposta ou fabricar aprovação.
6. Autenticar repo privado, descobrir modelos e testar erro/cancelamento: credenciais
   ausentes em logs, API, argv, export, snapshots, relatórios e contexto do juiz.
7. Rodar individual e Compare pela UI com os mesmos profiles/modelos/skills do modo
   atual. Importar receita em estado vazio exige somente remapeamento e autenticação.
8. Para cada harness, comprovar versão, modelo efetivo, entrega de skills, execução,
   cancelamento e artefatos. Capacidade não exercitada fica marcada como não validada.
9. Arquivo auxiliar não alterado está disponível ao candidato para implementar, mas
   ausente do pacote de código do juiz. Capturar a entrada efetiva do juiz e provar
   que contém somente os dois diffs, além dos documentos, rubrica e checks previstos.

## Fora desta aprovação

Criar/alterar/mergear PRs; deploy AWS; serviço multiusuário; execução sem isolamento
diretamente no checkout do usuário; automação de desktop/login; filesystem remoto
por comandos SSH; promessa de portabilidade de assinatura entre CLIs.
Docs e testes offline não certificam macOS/Podman nem integração real com todos os CLIs.
