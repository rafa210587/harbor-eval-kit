# Tarefas — UI e onboarding

Baseline retrospectiva **2026-09-08**. Checklist de reconstrução intencionalmente vazio.

Leia [contracts.md](contracts.md), incluindo as 16 abas e os oito cenários de aceitação.

## Fundação

- [ ] T001 Concluir contratos 001–004 e ler spec/plan/constituição.
- [ ] T002 Implementar checklist em `gui/app/start.js` e `start-domain.js` (US1, FR-001).

## Stories

- [ ] T003 Escrever introduções/hints em `gui/index.html` e `gui/app/field-help.js` (US2, FR-002/003).
- [ ] T004 Implementar loading/erro e guards de geração nos módulos *-live/*-domain (US3, FR-004/005).
- [ ] T005 Integrar import e sumário em `gui/app/config-bundle.js` (US2, FR-006).
- [ ] T006 Criar `.claude/skills/harbor-setup/SKILL.md` reutilizando bootstrap e configurar demo por acesso autorizado (US1, FR-007).
- [ ] T007 Escrever `docs/INSTALACAO_CLAUDE.md` e fallback por SO no README/DOCUMENTACAO (US1, FR-007).
- [ ] T008 Revisar `docs/GUIA_VISUAL.md` e procedência de screenshots (US2, FR-008).

## Validação

- [ ] T009 Recriar testes de hints, erros, respostas obsoletas e imports em `scripts/lib/ui-compare.test.ts` e `scripts/check-imports.mjs` (SC-001/002).
- [ ] T010 Executar `scripts/test.ps1` ou `scripts/test.sh`.
- [ ] T011 Navegar jornadas reais e registrar evidência; não tratar fixtures de DOM como teste de browser.
- [ ] T012 Executar walkthrough da skill dentro de Claude em clone limpo e fallback manual em host alvo; registrar pendências e versões (SC-003).

## Entrega

- [ ] T013 Revisar links, linguagem dos campos e coerência entre README/skills/guias; executar scanner antes de publicar.

Ordem: domínio → checklist/hints/estados → integração → walkthrough → entrega. Documentação da skill pode avançar em paralelo à UI após contratos operacionais definidos. Evidência atual e limites estão em plan.md. Nenhuma tarefa executa AWS.
