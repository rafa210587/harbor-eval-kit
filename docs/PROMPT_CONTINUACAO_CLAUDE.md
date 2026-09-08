# Prompt pronto para continuar com Claude

Este prompt descreve a primeira rodada. Para o pedido mais recente de auditoria e publicação,
use o [prompt e estado da auditoria de entrega](AUDITORIA_ENTREGA_2026-09-07.md#prompt-de-continuidade).

Copie o texto abaixo em uma sessão aberta na raiz deste repositório:

```text
Continue as correções do Harbor Eval Kit iniciadas pelo Codex em 2026-09-07.
O usuário já autorizou implementar as correções; não pare para pedir confirmação rotineira.

Leia primeiro AGENTS.md, docs/ENGENHARIA.md, .claude/skills/ship-change/SKILL.md e
docs/PLANO_CORRECOES_2026-09-07.md. Este último contém escopo, checklist, estado e validações.
Se o plano estiver concluído, não reimplemente correções nem inicie o backlog sem novo pedido.
Inspecione git status --short e git diff antes de editar: preserve e complete as mudanças
existentes. Não reinicie a implementação nem sobrescreva trabalho feito.

Objetivo: comparações confiáveis de modelos, agentes e skills sobre Harbor, com GUI e CLI
coerentes. Complete as etapas pendentes do plano: segurança de import/materialização,
cleanup orientado por manifest, plano compartilhado com identidade única e custo por dataset,
resultados de todos os trials, persistência/snapshots/reabertura e documentação/onboarding.
Os detalhes da auditoria estão no plano. Estatística avançada/calibração são backlog separado.

Não instale Docker, não leia/imprima secrets, não rode avaliações pagas nem containers ou
cleanup real. Teste offline com fixtures e executores falsos. Mantenha .sh e .ps1 equivalentes.
Se uma validação precisar de infraestrutura real, registre que não foi feita.
Atualize o plano a cada etapa (arquivos, testes, limitações, próximo passo), para sobreviver
a outra interrupção. Não declare concluído algo que apenas foi planejado.

No Windows, bash do PATH pode ser WSL sem Node. Use no PowerShell:
pwsh -NoProfile -File scripts/test.ps1
O scanner no Git Bash pode ser lento. Não contorne hooks com --no-verify.
Finalize com suíte offline, checker de imports e scanner; revise o diff e documente resultados.
Não faça push. Informe claramente o que foi concluído e qualquer trabalho restante.
```
