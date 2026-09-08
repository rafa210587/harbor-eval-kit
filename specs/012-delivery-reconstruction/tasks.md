# Tarefas — entrega e reprodução

Checklist futuro; somente marcar com evidência da implementação reconstruída.

## Fundação

- [ ] T001 Fixar revisão de referência e ler constituição/inventário (FR-005).
- [ ] T002 Recriar `.gitattributes`, `.gitignore` e pares de wrappers conforme plan (FR-001).
- [ ] T003 Separar fixtures públicas de aceitação de dados privados (FR-006).

## Gates e distribuição

- [ ] T004 Recriar `scripts/test.sh`/`.ps1` e checker de imports/ciclos (FR-002).
- [ ] T005 Recriar scanner e seus testes de recusa, incluindo falha de ferramenta (FR-003).
- [ ] T006 Recriar setup-hooks pareado e `.githooks/pre-commit`; testar efeito no índice Git (FR-003).
- [ ] T007 Recriar matriz CI e contrato Python conforme versões do plan (FR-004).
- [ ] T008 Integrar `CLAUDE.md`, harbor-setup e fallback manual, sem instalar Spec Kit como requisito de uso (FR-008).

## Aceitação

- [ ] T009 Conferir cobertura de fontes/rotas e registrar exclusões motivadas (SC-003).
- [ ] T010 Executar gate local e CI, preservar resultados e falhas reais (SC-001/002).
- [ ] T011 Realizar reconstrução independente conforme plan, sem consultar fontes originais para adivinhar contratos (SC-004).
- [ ] T012 Executar instalação limpa e smokes reais por SO; não atribuir resultados da baseline à reconstrução (FR-007).
- [ ] T013 Corrigir specs com cada pergunta não respondida no ensaio e repetir casos afetados.

T011 depende de 001–011; T012 exige pré-requisitos do host e recursos gerenciados.
Avaliações pagas e infraestrutura AWS não fazem parte deste checklist.
