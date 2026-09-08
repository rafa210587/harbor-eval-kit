# Plano — UI e onboarding

Baseline retrospectiva **2026-09-08**. Depende de 001–004. Aplicar constituição e regras de UI explicativa de AGENTS.md.

## Arquitetura e contratos

`gui/index.html` define estrutura; `gui/app/main.js` importa módulos ES. `state.js` centraliza refresh e `core.js` fornece API/DOM. `field-help.js` associa contratos via aria-describedby. Módulos *-domain isolam lógica testável e *-live realizam polling. Estado do formulário não substitui estado do experimento persistido.

Contrato de campo usa label, placeholder, value, required, type e checked. Hints descrevem finalidade/exemplo/padrão/obrigatoriedade; grupos dinâmicos usam descrição compartilhada. Identificadores de geração/seleção invalidam respostas antigas. Modo compacto oculta introduções, preservando avisos operacionais.

UI consome `/api/status`, registries e rotas de domínio. Providers e política de juízes permanecem no servidor. Configuração possui Exportar bundle e input Importar bundle; change envia POST /api/config/import, exibe added/updated/warnings e chama refreshAll.

## Instalação no Claude

`.claude/skills/harbor-setup/SKILL.md` é o ponto de entrada específico do Claude, reutilizando `Harbor_install/skills/harbor-bootstrap/SKILL.md` e runbooks operacionais. `docs/INSTALACAO_CLAUDE.md` documenta invocação e fallback. A pasta Harbor_install/skills isoladamente não implica descoberta automática de slash commands.

Sequência: detectar SO → ler regras → diagnosticar/snapshot → instalar somente faltantes → gates Podman → Oracle/Nop → GUI → credenciais privadas → demo opcional. Setup de demo usa UI ou API local autorizada: importar bundle, obter paths via GET /api/tasks, aplicar POST /api/tasks/rubric-default e reler. Restrições de acesso não podem ser contornadas; sem acesso autorizado, informar fallback manual.

README e DOCUMENTACAO devem mostrar comandos bash/PowerShell equivalentes. `docs/GUIA_VISUAL.md` explica abas e procedência de screenshots. Não afirmar instalação de Spec Kit CLI ou validação em Claude novo sem evidência.

## Reconstrução e verificação

Fontes centrais: `gui/app/start.js`, `start-domain.js`, `task-domain.js`, `field-help.js`, `config-bundle.js`, `ui-actions.js`; skill e guias acima.

Testes: `scripts/lib/ui-compare.test.ts`, `provider-domain.test.ts`, `task-template.test.ts`, `gui-lifecycle.test.ts`; imports: `scripts/check-imports.mjs`. Gate: `scripts/test.ps1` ou `scripts/test.sh`. Navegação real deve cobrir início, cadastro, import, compare, análise, logs, viewer e erro recuperável; registrar cenário e evidência separadamente.

## Evidências e limites

Evidência offline desta entrega está no índice SDD. Testes de lógica/markup não substituem acessibilidade humana ou navegação real. Capturas antigas não comprovam estado atual. Nova skill de setup precisa de walkthrough futuro dentro de Claude em clone limpo; documentação não declara isso realizado. Não há autenticação multiusuário ou implantação AWS nesta baseline.

Constitution check: domínio fora do HTML, dicas acessíveis, erros reais, defaults claros, segredos privados e wrappers pareados.
