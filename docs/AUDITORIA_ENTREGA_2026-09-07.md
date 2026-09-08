# Auditoria de entrega — 2026-09-07

## Estado e continuidade

Auditoria e gates locais concluídos. Base: `42a3cec`, árvore limpa no início. O usuário pediu revisão profunda de
código, features, testes e documentação, sobretudo README; autorizou corrigir problemas,
remover código comprovadamente sem uso, fazer commit e push. Materiais/documentos devem ser
listados como sugestões de remoção, sem exclusão nesta rodada. AWS permanece somente plano;
LiteLLM continua OFF. Não repetir os testes pagos já registrados sem um defeito que exija isso.

Este arquivo reúne plano e relatório para evitar mais documentos de acompanhamento.
Para continuar em outra sessão: leia AGENTS.md, docs/ENGENHARIA.md, a skill
`.claude/skills/ship-change/SKILL.md`, este relatório e o estado do Git. Não refaça trabalho
concluído; termine apenas os itens pendentes abaixo e preserve alterações existentes.

## Método e escopo

1. Inventariar código, arquivos versionados, documentação e CI; verificar o remoto antes do push.
2. Revisar fluxos completos: entrada HTTP/CLI → validação → snapshot → execução → persistência
   → observabilidade → cancelamento/limpeza. Examinar casos de erro e fronteiras de confiança.
3. Revisar todos os módulos da UI, consistência de seleção/edição/histórico, acessibilidade e
   fidelidade do que a UI promete. Confrontar README, manual, skills e exemplos com o código.
4. Registrar achados reproduzíveis, prioridade, evidência e aceite. Corrigir defeitos concretos
   e eliminar somente código cujo desuso possa ser demonstrado; não expandir features sem limite.
5. Executar testes apropriados, imports e scanner; conferir mudanças e docs; commit e push sem
   force ou bypass de hooks. Conferir o remoto e o resultado do CI quando disponível.
6. Entregar parecer: piloto local, distribuição geral e uso corporativo têm critérios distintos.
   Testes offline não comprovam smoke real em macOS/Linux nem integração com proxy real.

## Achados e correções

Confirmados por execução offline, antes da correção:

| Prioridade | Achado | Evidência inicial | Ação |
|---|---|---|---|
| P1 | Resultado incompleto pode parecer concluído | `parseResult`: `stats` com 1 trial e sem `finished_at` retorna sem erro | Exigir término explícito e conferir contagens disponíveis |
| P1 | Análise parcial pode receber nota perfeita | `normalizeAnalysis` com um trial PASS e outro `{}`; `summarizeAnalysisRecords` retorna passRate=1 | Marcar trials sem checks como incompletos e excluí-los do ranking |
| P1 | Credencial aninhada pode ir para argv/snapshot | `parseExperimentExtra` aceita `--ak config` com `model.api_key` | Rejeitar credenciais em configuração estruturada e valores conhecidos antes de persistir |
| P2 | CSV interpreta conteúdo como fórmula | `csvEscape('=1+1')` devolve `=1+1` | Exportar células textuais potencialmente executáveis como texto |
| P2 | Código de skills sem uso em produção | `resolveSkillPath`, `resolveSkillsetPaths`, `resolveAgentInstructionsPath` só têm referências em testes/docs; executor usa `prepareExperiment` | Retirar ramo antigo e testar a proteção no snapshot efetivamente executado |

Outros achados confirmados na revisão dos fluxos completos:

| Prioridade | Achado | Correção e evidência |
|---|---|---|
| P1 | Analyze em lote congelava apenas IDs; alterações no catálogo podiam trocar juiz ou critérios entre candidatos | Sessão persistida congela modelo, adapter, prompt e rubrics antes do primeiro Analyze; teste altera/remove catálogos e recupera os inputs originais |
| P1 | Requisições simultâneas de Analyze podiam sobrescrever o mesmo `analysis.json` | Lock por caminho real, incluindo sobreposição job/trial; teste de concorrência e liberação após erro. Limite: um processo de servidor |
| P1 | Escritores Node e Python podiam perder registros de ownership no manifesto | Transações usam o mesmo `.runtime-lock`, releem após adquirir o lock e mesclam a auditoria de cleanup sem apagar reservas concorrentes |
| P1 | Echo do subprocesso expunha valores de credenciais antes da sanitização final | Redação incremental de stdout/stderr com retenção entre chunks; valores explícitos do ambiente sensível entram no filtro |
| P1 | Tail de logs podia expor partes de um segredo entre offsets/janelas | Mascaramento em bytes preserva offsets, lê contexto e retém prefixos incompletos; testes de append, offset no meio da chave e janela de 200 KB |
| P1 | Tail aceitava arquivos arbitrários dentro do caminho solicitado | Lista de nomes de logs permitidos e recusa de arquivos não regulares, symlinks e credenciais; testes de recusa e preservação da leitura legítima |
| P1 | Timeout/cancelamento atuava só no filho imediato | Encerramento da árvore identificada a partir do ChildProcess; tratamento separado Windows/Unix e testes offline |
| P1 | Edição de duas tasks em sequência podia salvar conteúdo A no caminho B | Geração da requisição controla aceitação da resposta; botão Salvar fica desabilitado até carregar a task atual |
| P1 | Ausência intencional de `solution/solve.sh` virava template no editor | Editor preserva ausência/vazio, sem criar uma solução ao salvar outros arquivos |
| P2 | Falha de Compose entre criação e gravação do ID deixava recurso sem conciliação | Runtime concilia apenas reserva, nome e label exatos antes de provar ownership; caso de falha parcial coberto no contrato Python |
| P2 | Machine `work` podia capturar conexão de `work-dev` por prefixo | Resolver aceita nome exato ou alias padrão `-root`; colisões desse alias abortam em vez de escolher a primeira machine |
| P2 | Bootstrap não colocava o diretório de executáveis do uv no PATH corrente | Ambos wrappers passam a incluir `uv tool dir --bin`; Harbor incompatível ou sem venv uv é diagnosticado e preservado |
| P2 | Build do smoke podia deixar intermediários | Flags `--layers=false --force-rm`, com label e política sem pull, alinhadas ao runtime |
| P2 | Cancelar edição mantinha defaults dinâmicos do registro anterior | Campos de modelos e conjuntos de skills são reinicializados explicitamente; conferência real pela UI |
| P2 | Polling de logs misturava respostas antigas ou duplicadas | Identidade inclui pasta, job, arquivo, geração e exclusão de polling sobreposto; testes com respostas atrasadas |
| P2 | Ordenação dos jobs não reagia ao append do log | `mtimeMs` passa a usar o arquivo de log mais recente; regressão comprova reordenação após atualização |
| P2 | Ranking do juiz era invisível e reabrir exibia somente JSON bruto | Coluna de avaliação, estados sem nota e apresentação humana dos checks preservados no histórico |
| P2 | Guarda de gasto dependia do texto do erro em português | API cliente preserva `needsAcknowledge`; decisão usa o campo estruturado |
| P2 | Preferências de task corrompidas eram tratadas como vazias e sobrescritas | Leitura falha explicitamente, escrita atômica e validação de IDs; regressão preserva o arquivo original |
| P2 | JSON HTTP com UTF-8 dividido entre chunks podia alterar texto | Contagem em bytes e decodificação após buffering; teste fragmenta cada byte de texto acentuado/emoji e verifica limite de tamanho |
| P2 | CI não exercitava o contrato Python com Harbor pinado | Job dedicado instala `harbor==0.22.0` e executa testes offline; matriz Node nos três sistemas preservada |
| P2 | Guia e skill de portabilidade apontavam para módulos/garantias antigos | Fontes atuais, pin do Harbor, limitações e responsabilidades revisadas no README, manual e skills |

Há ainda correções de diagnóstico da inicialização, exclusões recusadas pelo catálogo,
primeiro uso gratuito com oracle/nop e ajuda de campos dinâmicos. Nenhuma API paga foi chamada
nesta auditoria. Os testes da UI usam estado separado e dados explicitamente sintéticos.

### Código removido

- Materializador antigo de skills e instruções de agentes; o caminho real é o snapshot em
  `experiment-store.ts`. Seus testes foram transferidos para esse caminho, incluindo junctions,
  travessia e remoção/edição de arquivos entre snapshots.
- Tipo `HarborResultJson` sem consumidores.
- Variáveis `PREFIX`/`LABEL` não utilizadas nos dois wrappers. As regras continuam nas fontes
  de ownership realmente executadas.
- Duplicação da lista de agentes gratuitos: a guarda de custo usa o catálogo canônico.

Não foram apagados fixtures de benchmark, runbooks, planos ou evidências históricas.

## Features e prioridades

### O que está bem alinhado ao objetivo

O núcleo está correto para um kit de evals: Harbor fornece execução e verifier, enquanto o kit
organiza os fatores do experimento. Perfis de agente, modelo, skillsets, baseline explícita,
repetições, snapshots e histórico em disco dão uma base útil para comparar modelos, agentes
e skills. Reward e julgamento são separados; custo não reportado não vira zero; juiz barato
em modo validação não vira evidência de qualidade. A alternativa manual às skills está documentada.

O runtime gerenciado tem valor operacional real: consegue provar ownership, recusa construção
ambígua e preserva recursos preexistentes. A ausência de dependências frontend e build simplifica
o clone e a manutenção. A UI já cobre criação, execução, logs, histórico, exportação e análise.

### Próximas melhorias recomendadas

| Ordem | Melhoria | Por que importa | Critério de aceite |
|---|---|---|---|
| Antes de anunciar suporte completo | Smoke real macOS/Podman e Linux rootless em hosts limpos | A matriz de lógica não exercita VM, socket, Compose e lifecycle desses ambientes | Doctor, oracle=1, nop=0, run/analyze e cleanup comprovados, com versões e recursos preservados registrados |
| Antes de uso externo amplo | Decidir licença, política de versão e processo de release | Repositório público não equivale a licença de uso/distribuição; pin do Harbor precisa de atualização controlada | Decisão do proprietário, notas de release e teste explícito de migração |
| Alta | Pré-voo por experimento com capacidade de cada adapter | Usuário precisa saber se modelo, skills, imagem, task e ambiente são compatíveis antes de gastar | Checklist baseado em verificações reais; indisponibilidade aponta o passo exato; catálogo não promete que todos os adapters foram validados |
| Alta | Clonar/reexecutar a partir dos inputs preservados | Reabrir hoje é consulta; reconstruir pelo catálogo pode introduzir mudanças | Novo ID com origem vinculada, opção explícita snapshot versus catálogo atual e prévia das diferenças |
| Alta | Captura automática de versão Git, Harbor, digest de imagem e versão do provider | Hashes locais já ajudam, mas imagens/ambiente e versões ainda exigem registro manual | Metadados no experimento/exportação sem credenciais e com “não disponível” explícito |
| Alta | Livro de custos da avaliação inteira | Comparar só o custo do candidato esconde juiz, reanálises e tentativas com falha | Totais por experimento e sessão, parcelas reportadas/ausentes, exportação e limites reais quando o provider/adapter oferecer |
| Média | Estatística pareada e calibração de juiz | Uma task e uma tentativa não sustentam declaração de superioridade | Repetições/datasets, incerteza e tamanho de efeito visíveis; comparação cega, calibração humana e acordo entre juízes |
| Média | Resultados com filtros e visão resumida por dimensão | A tabela atual fica longa para muitas combinações | Filtrar por task/modelo/agente/skill, comparar baseline, navegar até erro/trajectory sem remontar o experimento |
| Média | Acessibilidade e primeiro uso com roteiro completo | Hints ajudam, mas muitos controles ainda exigem familiaridade com evals | Teste com teclado/leitor de tela, foco e contraste; roteiro com operador sem conhecimento prévio e mensagens de recuperação |
| Média | Recuperação coordenada após crash e múltiplos processos | Locks locais não coordenam duas instâncias ou CLI concorrente sobre o mesmo alvo | Ownership de operação persistido, reconciliação verificável e política clara para locks abandonados |
| Posterior | Estado multiusuário, fila e isolamento de workers | Necessários para operação corporativa compartilhada | Autenticação, autorização, auditoria, quotas, backup/restauração e acesso de rede definidos antes de expor o serviço |

A última linha pertence ao [plano AWS corporativo](PLANO_AWS_CORPORATIVO.md). Nesta entrega não
se cria infraestrutura nem se executa deploy AWS. LiteLLM permanece desligado: seu contrato de
configuração tem testes, mas faltam provas com um proxy real, incluindo erros, retries e custos.

### Refatoração recomendada

Refatorar por fronteiras de comportamento, em etapas: extrair rotas de Analyze e catálogo de
`gui-server.ts`, reduzir o documento único de `gui/index.html` e centralizar ciclos de edição/
erro dos formulários. Os módulos novos desta rodada isolam sessão, lock, body HTTP e polling,
sem reescrever o sistema. Migrar toda a UI para um framework agora adicionaria distribuição,
build e dependências antes de resolver os principais gaps de uso e reprodutibilidade.

O estado local usa arquivos JSON e execução no processo: adequado ao piloto de um operador,
mas sem transação global de importação, fila durável ou coordenação distribuída. Não é uma
base pronta para publicar a GUI diretamente na internet.

## Materiais candidatos a remoção ou consolidação

Nenhum dos materiais abaixo foi apagado. Sugestões para decisão do proprietário:

| Material | Sugestão | Motivo e condição |
|---|---|---|
| `docs/PLANO_CORRECOES_2026-09-07.md` e `docs/PLANO_PLATAFORMA_2026-09-07.md` | Mover para uma área de histórico ou consolidar | São contexto da execução, não instruções atuais; preservar decisões e links antes de retirar duplicação |
| `docs/PROMPT_CONTINUACAO_CLAUDE.md` e `docs/PROMPT_CLAUDE_PLATAFORMA.md` | Manter um ponto de continuidade atual e arquivar os anteriores | Prompts antigos podem induzir a repetir trabalho concluído; este relatório identifica a auditoria atual |
| `docs/PLANO_TESTES_UI.md` | Separar checklist vigente das evidências antigas | O leitor precisa distinguir procedimento reexecutável de resultado de um host/data |
| `docs/PENDENCIAS.md` | Consolidar backlog com o roadmap deste relatório | Evitar duas listas concorrentes; manter uma fonte normativa e o relatório como evidência datada |
| `config/defaults.env` | Remover se não houver consumidor externo, ou implementar a fonte única | Não há consumidor de runtime identificado no repositório; aparência de configuração ativa pode confundir |
| `Harbor_install/agents/*.md` | Avaliar consolidação com skills, mantendo o propósito | São papéis/runbooks humanos referenciados por AGENTS.md; ausência de import de código não prova inutilidade |
| `docs/screenshots/compare-tab.jpg` | Atualizar ou retirar da distribuição após conferir referências externas | Screenshot da interface anterior; não representa a jornada atual |

Manter `AGENTS.md`, `CLAUDE.md`, `.claude/skills` e `Harbor_install/skills`: são materiais de
operação e contribuição, não código morto. Uma futura imagem de runtime pode excluí-los do
pacote sem removê-los do repositório. Arquivos ignorados de jobs/QA não devem entrar no commit.

## Validação e parecer

### Evidências desta auditoria

- Suíte Node: **192 testes passaram, 0 falhas, 0 skips**. Imports de **68 módulos TS e 29
  módulos GUI** resolvidos, sem ciclos. Contrato Python com Harbor 0.22.0: **15/15 passou**.
  `pwsh -NoProfile -File scripts/test.ps1` terminou com **TUDO VERDE**, incluindo scanner
  completo de credenciais. Syntax checks de GUI e wrappers passaram; os links relativos de
  28 documentos foram conferidos sem destinos ausentes.
- UI real em `127.0.0.1:44177`, estado isolado em `jobs-test/audit-ui-state`: edição/cancelamento
  de perfil limpou modelo/skills; histórico reabriu dois candidatos e recuperou 100%/0% PASS com
  justificativas humanas; prévia mostrou task congelada e `--ak max_tokens=100`; ordenação
  permaneceu coerente. Esses resultados são fixtures, não execuções de modelo.
- Após reload, o histórico foi restaurado automaticamente. Cadastro de perfil oracle e
  seleção de task pela UI liberaram a jornada gratuita sem credenciais. A inspeção em largura
  de 734 px não encontrou overflow de página ou controles visíveis sem descrição de ajuda;
  checkboxes preservaram sua largura e hints ficaram abaixo da linha de seleção.
- Endpoint HTTP real de criação de sessão devolveu ID, modelo, rubrics e modo de validação
  congelados, sem chamar Analyze/provedor. Exportação JSON retornou os dois registros.
- Releitura das três execuções e análises pagas da rodada anterior passou com o parser novo:
  três candidatos completos, reward 1, análises sem trials incompletos e dois checks cada.
- Nenhuma chamada paga, instalação, recurso de container ou ação AWS nesta auditoria.

Evidências pagas e de Podman da rodada anterior: [validação da plataforma](VALIDACAO_PLATAFORMA_2026-09-07.md).
O custo total registrado naquela validação foi **US$ 0,060341712**, incluindo candidatos e juiz.
O valor não deve ser atribuído à auditoria offline atual. Aquela execução validou Windows e os
adapters exercitados, não todo o catálogo de modelos/agentes.

### Parecer

**Apto para piloto local controlado no escopo Windows já exercitado.**
O projeto atende ao objetivo central e ganhou proteções importantes contra comparações falsas,
mudança de inputs entre candidatos, perda de estado e uso confuso da UI. O README passa a
explicar produto, pré-requisitos, primeiro experimento gratuito, operação manual, skills e limites.

**Ainda não declarar entrega geral multiplataforma ou plataforma corporativa pronta.** Faltam
smokes reais macOS/Linux, proxy LiteLLM real, validação de mais adapters, acessibilidade completa,
decisão de licença e os controles de operação compartilhada. Ausência de defeitos encontrados
nos testes não certifica ausência de outros defeitos. A revisão cobriu os fluxos de domínio,
UI, runtime Python, wrappers, testes, CI e documentação; não foi um pentest externo.

Publicação autorizada: commit e push das correções e documentação, mantendo os hooks ativos.
O SHA desta entrega é verificável no histórico Git; o resultado por plataforma fica no
[workflow CI](https://github.com/rafa210587/harbor-eval-kit/actions/workflows/ci.yml), associado
ao commit publicado. Consulte o estado remoto antes de repetir uma publicação. O CI de lógica
em macOS/Linux não substitui os smokes reais pendentes descritos acima.

### Prompt de continuidade

> Continue a auditoria do Harbor Eval Kit a partir de `docs/AUDITORIA_ENTREGA_2026-09-07.md`.
> Leia AGENTS.md e docs/ENGENHARIA.md, confira `git status` e commits antes de editar.
> As correções e a documentação já foram aplicadas: execute apenas os gates ainda pendentes,
> trate falhas reproduzíveis e atualize o estado deste relatório. Preserve dados/recursos
> preexistentes e nunca exponha credenciais. Não execute AWS, não ligue LiteLLM nem repita
> chamadas pagas sem uma necessidade concreta. Materiais estão apenas sugeridos para remoção;
> não os apague. O usuário autorizou commit e push completos, sem force e sem bypass dos hooks.
> Se os gates já estiverem verdes e a branch sincronizada, entregue o parecer e roadmap,
> distinguindo piloto Windows validado de suporte multiplataforma/corporativo ainda pendente.
