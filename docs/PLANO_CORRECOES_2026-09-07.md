# Correções da auditoria — 2026-09-07

## Estado da entrega

**Concluído e verificado em 2026-09-07.** Este arquivo é o registro de continuidade, escrito antes das mudanças de código.
Pedido do usuário: corrigir os problemas encontrados na auditoria, documentar o plano antes,
deixar um prompt para Claude continuar se a sessão acabar. Não publicar/push nem executar
avaliações pagas, containers ou cleanup real nesta rodada. Preservar os dados locais.

Baseline: árvore limpa; 85 testes unitários e checker de imports passaram na auditoria.
`bash` no PATH do Windows aponta ao WSL (sem Node). Para a suíte completa, usar
`pwsh -NoProfile -File scripts/test.ps1`: Node roda no Windows e o scanner no bash/WSL.
O scanner no Git Bash também funciona, mas foi mais lento neste ambiente.

## Escopo e ordem

| Etapa | Estado | Entrega / critério de conclusão |
|---|---|---|
| 1. Segurança de dados | Concluído | Validar IDs, schema e referências de bundles/cadastros; validar tudo antes de escrever; conter caminhos de materialização, inclusive links; testes de recusa preservando arquivos externos. |
| 2. Cleanup | Concluído | Manifest obrigatório; conciliar prefixo + label + manifest; plano exato incluindo dependências; mesma lógica `.sh`/`.ps1`; auditoria persistida; abortar propriedade ambígua; testes com executor falso, nunca Podman real. |
| 3. Plano de experimento | Concluído | Resolver candidatos em domínio compartilhado; IDs únicos por execução/linha; GUI e CLI usam mesma guarda/normalização; CLI injeta secrets; contabilizar tasks no dataset; validar argumentos extras que alteram o plano. |
| 4. Resultados/Analyze | Concluído | Extrair parsing de resultados do barrel; preservar todos os trials; agregar checks/custos corretamente; testes de resultados ausentes/malformados/múltiplos trials; preservar marca de validação. |
| 5. Persistência | Concluído | Salvar plano efetivo e snapshots/hashes por execução; preservar resultados e análises; API/UI permitem reabrir comparação após refresh; evitar diretórios mutáveis de skills durante execução. |
| 6. Docs e onboarding | Concluído | Primeiro fluxo mínimo e task executável; distinguir bundle e experimento; corrigir cancelamento/telemetria/juiz e atualizar skills operacionais afetadas. |
| 7. Verificação final | Concluído: 121 testes + imports + scanner + sintaxe | Testes offline + imports + scanner, revisão do diff, atualizar este documento com números e limitações reais. |

Refatoração incremental: módulos pequenos por domínio; servidor só adapta HTTP; manter frontend
ES modules sem trocar framework. Plano e resultados do kit complementam os artefatos do Harbor.
Não estimar billing: números finais vêm dos resultados do Harbor, desconhecidos ficam ausentes.

Evoluções posteriores (fora das correções desta rodada): intervalos de confiança, testes
estatísticos pareados, ranking multi-task sofisticado, calibração empírica de juízes. Documentar
como backlog; não afirmar que uma lista curada prova a qualidade de um juiz.

## Achados e referências iniciais

- `naming.ts:jobName` ignora task/perfil/instruções e colide entre linhas e execuções.
- `harbor.ts:resolveAnalysisJson` devolve somente `results[0]`.
- `bundle.ts` aceita IDs arbitrários; `materialize.ts` concatena IDs antes de `rmSync`.
- CLI não passa `loadSecretsEnv`; custo recebe modelo cru enquanto GUI sanitiza.
- `/api/compare/estimate` aplica modelo default do perfil, `/api/compare` usa default do Harbor.
- `cost.ts` multiplica apenas linhas × tentativas, sem quantidade de tasks.
- `.sh/.ps1 uninstall` removem por label sem reconciliar manifest antes; dry-run omite Harbor.
- Comparação e análises agregadas vivem parcialmente na memória do browser.
- `withTelemetryDisabled` preserva valor ambiente, contrariando promessa incondicional.
- README manda percorrer 10 abas, usa stub em exemplo; DOCUMENTACAO §13 nega cancelamento.

## Registro de execução

- Plano criado antes das alterações; prompt de continuidade salvo separadamente.
- Segurança: registry-validation/service, bundle pré-validado, caminhos de materialização protegidos;
  testes de junction e preservação de dados externos. Importação entre arquivos não é uma transação
  de filesystem: falha de validação não escreve nada, falha de I/O pode exigir reimportar o bundle.
- Cleanup: módulos cleanup/installation/podman-smoke, wrappers .sh/.ps1, manifest antes de mutações,
  plano completo, auditoria atômica, recusa de ambiguidade. uv explicitamente preservado: footprint
  do instalador não é conhecido integralmente. Imagem base Alpine 3.20 deve ser preexistente.
- Plano/runner/store: identidade única, custo linhas × tasks × tentativas, extras limitados,
  secrets em env, snapshot de tasks/skills com hashes, histórico e análises persistidas.
- HTTP Compare extraído para experiment-routes.ts; GUI tem Reabrir experimento; logs filtram
  jobs do experimento atual. Analyze usa todos os trials e inputs customizados congelados.
- Última suíte completa: pwsh -NoProfile -File scripts/test.ps1 — 121 testes passaram,
  checker 44 módulos TS + 16 módulos GUI passou, scanner passou incluindo arquivos novos.
  Scanner executado pelo bash/WSL; aviso systemd do WSL não afetou o exit 0.
- Não houve instalação, chamadas pagas, containers ou cleanup real. UI conferida por clique em servidor com estado temporário isolado: histórico e
  recuperação após refresh funcionaram, sem erros de JavaScript. A integração HTTP foi testada com handlers/fixtures, runner com executor falso.
- Parser verificado contra 24 result.json locais concluídos: zero erros de leitura.
- Dry-run real do Harbor 0.22.0 com oracle + soma-fracoes pelo runner compartilhado: passou;
  --print-config apenas, sem trials/containers/chamadas pagas. Entradas e saídas temporárias removidas.
- Casos adicionais cobertos: lotes de análise incompletos/validação não recebem ranking,
  resultados cancelados/vazios não são sucesso, scanner bloqueia sem ecoar valor.
- Verificação final: 121/121 testes, 44 módulos TS + 16 módulos GUI no checker, scanner incluindo
  arquivos novos, sintaxe PowerShell/bash/JS e git diff --check passaram.
- Implementação encerrada. Não há correção pendente neste escopo. Estatística/calibração e
  execução real com containers permanecem fora desta rodada; as limitações estão no README.
- Nenhum push realizado. Use git log -1 e git status para identificar o commit/estado de entrega.

## Como retomar

Leia `docs/PROMPT_CONTINUACAO_CLAUDE.md`. Antes de agir, confira `git status --short` e `git diff`:
uma interrupção pode acontecer entre a implementação e a atualização desta tabela. Não descarte
mudanças por parecerem incompletas. Use testes para estabelecer o estado real.
