# Continuidade com Claude — evolução da plataforma

Cole este prompt numa sessão aberta na raiz do repositório. O estado atual está no plano;
não dependa da memória de uma conversa anterior.

```text
Continue a evolução do Harbor Eval Kit planejada em 2026-09-07.

Leia AGENTS.md, docs/ENGENHARIA.md, .claude/skills/ship-change/SKILL.md,
docs/PLANO_PLATAFORMA_2026-09-07.md e docs/PLANO_AWS_CORPORATIVO.md.
Inspecione git status, git log e git diff antes de editar; preserve alterações existentes.
O commit 92deb67 encerrou a rodada anterior. PLANO_CORRECOES_2026-09-07.md e o prompt antigo
são históricos concluídos; não reinicie aquele trabalho. Este plano é um novo pedido.

Objetivo autorizado: plataforma de eval e comparação de agents/models/skills sobre Harbor,
fácil de pilotar pela UI. Corrigir operação/portabilidade, melhorar jornadas/design,
revisar README/guias e validar skills de instalação com fallback manual por SO.
Cada campo deve explicar finalidade, exemplo, padrão e quando pode ser ignorado.
Modo compacto nunca esconde gasto, alertas, erros, estado ou marca de judge em validação.

O usuário pediu ver o plano ANTES de executar melhorias. Confira se o plano já foi entregue
na conversa; se esta sessão foi aberta para implementá-lo, prossiga nas etapas pendentes,
sem pedir confirmações rotineiras já cobertas pelo pedido. Atualize checklist e registro
a cada etapa, incluindo arquivos, testes, limitações e próximo passo exato.

AWS é para uso CORPORATIVO, mas nesta rodada SOMENTE plano e menção no README.
Não provisionar recursos, escrever um deploy inteiro ou implementar multiusuário/RBAC.
LiteLLM proxy deve continuar OFF; validar schema/env/topologia com testes locais e explicar
como ativar/voltar no futuro. Não afirmar integração real testada sem evidência.

Antes de containers, resolver ownership nas execuções normais do Harbor: nome de job não
resolve imagens/projetos Compose. Todo recurso criado precisa prefixo, label e manifest.
Preservar tudo preexistente. Nunca instalar Docker, fazer prune ou editar a instalação
global do Harbor. Aplicar qualquer overlay só em snapshots, com equivalência entre candidatos.
Doctor e oracle/nop reais precisam passar antes de declarar Podman READY.

Testes reais pela UI foram pedidos com os dois modelos DeepSeek mais baratos adequados
ao coding e judge DeepSeek. O plano propõe Flash/Pro de texto estáveis, sujeito a catálogo
e preços oficiais atuais e compatibilidade no adapter instalado. Não usar aliases antigos
ou chamar “modelo mais barato” só porque foi o primeiro encontrado numa lista.
Proposta econômica: 3 trials (A/B mudam modelo; C repete A com skill), concorrência 1,
1 tentativa, depois judge Flash com rubric curto em modo validação. Ler no plano se o teto
de gasto já foi definido; US$1 é proposta, não uma resposta do usuário. Não comprar créditos.
Não imprimir nem copiar secrets para repo/log/argv. Chaves só no ambiente do subprocesso.
Usar UI de verdade para testar; registrar separadamente clique, API, fixture e execução real.
Custos finais são os reportados pelo Harbor; ausentes continuam ausentes.

Validação mínima: suíte offline, checker, scanner, wrappers bash/PowerShell, UI com reload,
histórico/exportação e contratos corrigidos do Analyze. macOS/Linux precisam de smoke em
host real; se não houver host acessível, entregar testes/runbook e marcar pendente,
nunca converter CI offline em alegação de compatibilidade real.

Ambiente desta auditoria: Windows/PowerShell; bash no PATH aponta ao WSL e pode falhar por
permissão. Testes Node e imports passaram (121). Git Bash precisa PATH com suas ferramentas;
a invocação sem login expôs bug do scanner que retorna 0 mesmo sem grep. Corrija fail-closed.
Não contorne hooks com --no-verify. Use a suíte test.ps1 e, quando necessário, Git Bash
com ambiente de login para o scanner. Leia o registro final do plano antes de repetir checks.

Faça commits locais pequenos por etapa, com documentação na mesma mudança. Não faça push.
Não iniciar estatística avançada, calibração, auto-resume ou infraestrutura distribuída.
Ao parar, deixe o próximo passo concreto no plano e informe claramente o que ficou pendente.
```
