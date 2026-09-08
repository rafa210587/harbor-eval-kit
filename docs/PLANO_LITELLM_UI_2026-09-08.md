# LiteLLM na aba Credenciais

Objetivo: manter credenciais diretas e acrescentar descoberta/teste explícitos do proxy,
sem ligar o gateway desta instalação ou consumir APIs reais.

1. Criar cliente do contrato OpenAI do proxy: GET /v1/models e POST /v1/chat/completions.
2. Usar exclusivamente a chave de inferência salva; nunca a chave administrativa.
   Não devolver respostas brutas, credenciais ou conteúdo gerado. Bloquear redirects.
3. Expor status seguro e ações separadas na aba Credenciais; registrar aliases como
   openai/<alias> preservando o identificador completo do proxy. Explicar custo e campos.
4. Validar com servidor HTTP local simulado: autorização, aliases, erros, OFF e ausência
   de chave. Rodar suíte, imports e scanner; atualizar README, guias e contrato SDD.
5. Commit e push. Não declarar proxy real ou todos os adapters certificados por mocks.

Continuação no Claude: leia este plano, docs/LITELLM.md e o git diff. Conclua os passos
pendentes, execute scripts/test.sh (ou test.ps1), mantenha o gateway real desligado e
não use credenciais reais nos testes. Registre a evidência e os limites antes de publicar.
