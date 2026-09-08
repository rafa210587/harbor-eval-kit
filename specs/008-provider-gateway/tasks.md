# Tasks de reconstrução — providers

Checklist para reconstrução; validações reais continuam separadas da implementação.

- [ ] T008-01 (FR-008-01) Definir catálogo canônico e API; consumir metadados na GUI
  de modelos/credenciais sem lista duplicada. Testar provider desconhecido e sem key.
- [ ] T008-02 (FR-008-02/US1) Implementar armazenamento write-only, nome/valor validados,
  lista ordenada, remoção idempotente e reset do formulário; testar sem segredo real.
- [ ] T008-03 (FR-008-03) Implementar validação prefixo/regex e resolver Python Harbor;
  distinguir falha de instalação, credencial ausente e erro do provider.
- [ ] T008-04 (US2/3) Implementar modos Python separados, argv sem segredo, timeout,
  redaction antes de parse, envelopes e limites de diagnóstico descritos no plano.
- [ ] T008-05 (FR-008-06) Implementar descoberta normalizada, seleção explícita,
  deduplicação, registro sequencial, lock e status sobrevivendo ao refresh da UI.
- [ ] T008-06 (US3) Mostrar aviso pago e exigir escolha antes de teste; teste unitário
  prova rejeição antes de spawn. Não incluir completion real no gate.
- [ ] T008-07 (US4) Implementar parser gateway OFF/ON e schema estrito ON; cobrir JSON
  corrompido, campo desconhecido, endpoints inválidos e placeholders incompletos.
- [ ] T008-08 (US5) Implementar lookup/expansão/merge e filtro master; testar precedence,
  ausência de inferência, infraestrutura intacta e não propagação de extras process.env.
- [ ] T008-09 Expor status sem chave; documentar configuração manual de host/container,
  desligado por padrão e distinção SDK direto/proxy. Não instalar proxy nesta etapa.
- [ ] T008-10 Executar testes offline e scanner; depois, somente com autorização,
  validar descoberta, teste explícito e proxy em cada plataforma, registrando limitações.
- [ ] T008-11 Resolver deliberadamente aliases como google/gemini e eventual rollback
  de cadastro parcial; escrever novos testes antes de declarar essas melhorias prontas.
