# Tarefas — segurança local

Checklist de reconstrução; caixas abertas não indicam ausência de código atual.

## Fundação

- [ ] T001 Ler constituição, spec/plan e definir fronteiras de confiança (US1–3).
- [ ] T002 Recriar `httpguard.test.ts` com Host/Origin aceitos/recusados (FR-001).
- [ ] T003 Recriar casos byte/UTF-8/abort em `http-body.test.ts` (FR-002).

## Implementação

- [ ] T004 Implementar guard e body em `scripts/lib/httpguard.ts` e `http-body.ts`.
- [ ] T005 Implementar `safeJoinUnderDir`/`managedPath` em `paths.ts` com testes de links e drives (FR-003).
- [ ] T006 Conectar guard antes do roteamento e restringir assets em `gui-server.ts` (FR-001/004/008).
- [ ] T007 Implementar parsing/names-only/escrita de segredos em `secrets.ts` com fixtures sintéticas (FR-005).
- [ ] T008 Recriar redator incremental e ambiente UTF-8/telemetria em `exec.ts`, cobrindo cortes Unicode (FR-006/007).
- [ ] T009 Integrar proteção das respostas e export gate antes de bytes/arquivos emitidos (FR-006/008; 010).

## Aceitação e entrega

- [ ] T010 Exercitar requisição cross-site recusada verificando ausência de mutação (SC-001).
- [ ] T011 Executar casos de limite, traversal e redaction, depois gate completo (SC-002–004).
- [ ] T012 Registrar limites ACL/TOCTOU/usuário local em docs; não declarar proteção multiusuário.

T002/T003 antecedem implementação; T005 antecede filesystem exposto por rotas;
T008/T009 antecedem qualquer consumidor que possa transmitir saída de provider.
