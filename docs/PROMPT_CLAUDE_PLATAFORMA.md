# Continuidade com Claude — plataforma de avaliações

O pedido posterior de auditoria, commit e push está no
[relatório de entrega](AUDITORIA_ENTREGA_2026-09-07.md), que deve ser lido primeiro.

Cole o texto abaixo numa sessão aberta na raiz do clone. O relatório e o Git são a fonte do
estado atual; este prompt não depende do histórico da conversa.

```text
Continue o Harbor Eval Kit a partir do estado existente, sem reiniciar a implementação.

Leia AGENTS.md, docs/ENGENHARIA.md, .claude/skills/ship-change/SKILL.md,
docs/PLANO_PLATAFORMA_2026-09-07.md e docs/VALIDACAO_PLATAFORMA_2026-09-07.md.
Inspecione git status, log e diff. Preserve alterações existentes. O usuário posteriormente
autorizou commit e push completos; confira o relatório de auditoria antes de publicar ou repetir trabalho.
O plano foi documentado antes das mudanças no commit 7b9a886; o usuário autorizou executar
as correções e fazer commit local, depois ampliou a autorização para push. Não peça novamente
confirmação rotineira para isso.

Objetivo: plataforma local simples de pilotar pela UI para comparar models, agents e skills
sobre Harbor. Já foram implementados Começar, modos de experimento, baseline/duplicação,
prévia efetiva, dicas por campo, histórico/exportação, correções do juiz, scanner fail-closed,
operação portátil, README, manual e skills. A entrega local foi concluída; confira o relatório
e o Git antes de decidir se existe trabalho restante.

AWS: SOMENTE plano corporativo e menção no README. O usuário reiterou NÃO EXECUTAR AWS.
Não provisionar, implantar ou criar infraestrutura cloud. LiteLLM proxy continua OFF;
schema/ambiente foram preparados e testados offline. Não ativar como efeito colateral.

Podman somente; nunca instalar Docker, fazer prune global ou remover preexistentes.
Recursos precisam de prefixo harbor-eval-kit-, label io.harbor-eval-kit.managed=true,
reserva no manifest e identidade conciliada. Cleanup ambíguo é recusado.
O runtime Python está em scripts/python/harbor_eval_kit/managed.py e ownership.py.
Suporta Harbor0.22.0, task Linux/main único, rede pública, imagem base local preexistente.
Compose customizado, rede restrita e pulls implícitos são bloqueados explicitamente.

Analyze também cria containers: não usar o comando upstream diretamente. execHarbor lança
python -m harbor_eval_kit.cli, que valida versão/registro e aplica o adapter somente na
memória do subprocesso. Não alterar o pacote do Harbor instalado globalmente.

Já houve smoke real Windows e oracle=1/nop=0. Os três candidatos DeepSeek pela UI deram
reward1, zero erros e total reportado US$0.007972688. Experimento:
be1ad9f4-8b6f-4997-8c26-efc0eb1ed8ba, em jobs-test/platform-ui.
A/B variam Flash/Pro; C repete Flash com uma skill. Não repetir essas chamadas sem motivo.
O relatório discrimina julgamentos iniciais e a validação do runtime corrigido. O total
reportado de candidatos e quatro julgamentos foi US$0.060341712. A suíte passou 163/163,
Python 14/14, imports e scanner sem falhas. Não refaça chamadas pagas para confirmar isso.
Juiz Flash usa validationMode=true; não vale como avaliação nem entra em ranking.
Billing só do Harbor; ausente permanece ausente. Nunca logar secrets nem colocá-los em argv.

Windows usa PowerShell e Git Bash. test.ps1 seleciona Git Bash --login; não usar o bash.exe
do WSL por acidente. Suíte offline: pwsh -NoProfile -File scripts/test.ps1.
Python adicional: definir PYTHONPATH=<repo>/scripts/python e usar o Python do ambiente uv
do Harbor com -m unittest discover -s scripts/python -p 'test_*.py'. Não instalar toolchain
extra só para rodar esses testes. Import checker: node scripts/check-imports.mjs.
Não burlar hooks com --no-verify. Registre o commit e deixe git status limpo.

macOS/Linux têm testes de lógica e runbook, mas precisam de smoke em host real antes de
afirmar compatibilidade comprovada. Não há autenticação multiusuário, RBAC, filas distribuídas,
auto-resume ou estatística avançada nesta rodada. Não expandir o escopo silenciosamente.

Se o relatório já marcar a entrega concluída e o Git contiver o commit, informe isso e
trate apenas uma nova solicitação explícita. Se ainda faltarem checks/commit, complete-os,
atualize relatório e plano, e informe resultado e limitações honestamente.
```
