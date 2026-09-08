# Tasks de reconstrução — autoria

Checklists são roteiro para nova implementação, não afirmação de código ausente.

- [ ] T007-01 (FR-007-01/02) Implementar leitura/escrita UTF-8 de quatro campos e
  scan com marcadores, corte de profundidade e exclusões descritos no plano.
- [ ] T007-02 (US3) Testar árvore normal, stub, raiz inexistente, profundidade,
  diretórios ocultos, links e parada em task; nunca modificar alvo de link.
- [ ] T007-03 (US1/5) Implementar adaptadores CLI init/list/download, argv separados,
  validação de organização, timeouts e envelopes HTTP documentados.
- [ ] T007-04 (US4) Persistir pins com IDs seguros e substituição atômica; testar
  remoção, JSON corrompido, raiz inválida e nomes como `__proto__` sem poluir protótipo.
- [ ] T007-05 (US2) Construir formulário e editor com templates não aprovadores;
  executar verifier inicial em fixture: exit 1 e reward 0 devem ser observados.
- [ ] T007-06 (FR-007-03/05) Proteger respostas antigas, lock de save, fechar durante
  load, erro parcial arquivos/pins; testar preservação/limpeza de solve separadamente.
- [ ] T007-07 (US3/5) Integrar lista/picker Compare, preservar path após refresh e
  filtrar downloadedTasks com normalização de separadores e limite de prefixo.
- [ ] T007-08 (FR-007-06) Documentar três componentes de migração: task no repo,
  bundle de catálogo e pins locais reaplicados; não colocar secrets no bundle.
- [ ] T007-09 Executar gate offline; registrar smoke UI e Oracle/Nop à parte,
  inclusive diferenças plataforma/Harbor; não considerar scan uma validação de task.
- [ ] T007-10 Decidir explicitamente hardening futuro de paths, validação de entrada,
  pins normalizados e transação de arquivos. Manter como gap até implementação/testes.
