# Plano — entrega e reprodução

## Toolchain e arquivos

Node 24 executa TypeScript nativo: não adicionar dependência de bundler/transpilador
para rodar scripts atuais. GUI usa HTML/CSS e módulos ES diretamente. Harbor 0.22.0
é dependência externa, instalado via uv; código Python gerenciado vive em scripts/python.
Preservar adaptadores/formatos dessa versão antes de atualizar o framework.

`.gitattributes`: *.sh e .githooks/* sempre LF; Dockerfile/task shell sempre LF;
*.ps1 CRLF; Markdown/JSON/TS/HTML/TOML normalizados como texto; imagens binárias.
`.gitignore` exclui jobs/, jobs-test/, node_modules/, caches Python, logs e arquivos
de segredo; `.env.example` é permitido como template, sem valores reais.

Pares de operação: harbor-eval, start-gui, stop-gui, setup-hooks e test sob scripts/.
Helpers Node/Python são compartilhados pelos wrappers, não cópias de domínio por SO.
No PowerShell o test runner procura Git Bash instalado; bash.exe do WSL não é substituto.

## Gates exatos da baseline

Local: `pwsh -NoProfile -File scripts/test.ps1` ou `bash scripts/test.sh`.
Executar `node --test` em todos `scripts/lib/*.test.ts`; executar
`node scripts/check-imports.mjs`; executar scanner sobre versionados e novos não ignorados.
Falha em qualquer etapa deve resultar em exit não zero. O scanner falha fechado quando
grep/git/sed/cat obrigatório está ausente. O checker verifica imports estáticos locais
e ciclos; não é prova de cobertura dinâmica, tipos ou comportamento do navegador.

Hook: `scripts/setup-hooks.*` configura `core.hooksPath=.githooks`.
`.githooks/pre-commit` roda scanner --staged: examina nomes de arquivos e linhas
adicionadas do índice, não o working tree. Não usar --no-verify. Remoção de segredo
não deve ser bloqueada por examinar a linha removida como se estivesse entrando.
Scanner não substitui os gates de export em runtime nem certifica imagens visuais.

CI `.github/workflows/ci.yml`: push em main e pull_request; jobs Node 24 em
ubuntu-latest/windows-latest/macos-latest, fail-fast=false; passos tests/imports/scanner.
Job python-contract Ubuntu usa Python 3.12, instala Harbor 0.22.0 e executa
`python -m unittest discover -s scripts/python -p 'test_*.py'` com PYTHONPATH=scripts/python.
Esses jobs não executam smoke Podman nem modelos pagos. A instalação do Harbor em CI
usa rede para dependências; isso não é uma execução de avaliação de modelo.

## Receita independente e oráculo de aceitação

1. Congelar revisão de referência e copiar specs, configuração pública de demo e fixtures
   de aceitação para diretório separado. Não copiar estado do usuário, jobs privados ou segredos.
2. Implementar pela ordem do índice, registrando perguntas não resolvidas em um diário.
   Para uma prova estrita, o implementador não consulta scripts/gui originais; um
   revisor separado usa a referência apenas para comparar resultados observáveis.
3. Usar os contratos de cada capacidade para reconstruir DTOs, arquivos, erros e defaults.
   Exemplos da demo/instruction.md especificam tarefas benchmark; seus stubs e testes
   são fixtures de entrada, não solução da plataforma.
4. Executar primeiro aceitação offline (matriz abaixo), depois novo clone no host alvo
   com skill/manual, doctor e oracle/nop; registrar versão/OS/efeitos de cleanup.
5. Comparar comportamento; se for preciso ler a implementação para descobrir regra,
   registrar e corrigir spec/contrato antes de aceitar a reprodução.

| Camada | Aceitação mínima |
|---|---|
| Runtime | snapshot preservado, API Podman identificada, smoke e cleanup exato |
| Catálogo | CRUD referenciado, import inválido sem escrita, reimport idempotente |
| Tasks | template válido, edição protegida, descoberta e política de datasets |
| Experimento | mesmo plano CLI/HTTP, ablação, snapshots, guardas, cancelamento |
| Juiz | defaults explícitos, sessão congelada, locks, validação fora do ranking |
| Resultados | zero vs ausente, incompleto vs completo, denominadores e export seguro |
| UI/ops | campos úteis, polling sem resposta obsoleta, log correto e viewer gerenciado |
| Segurança | Host/Origin/body/path, secrets env-only e redaction entre chunks |
| Providers | descobrir vs testar, seleção explícita, gateway OFF e chaves separadas |

## Rastreabilidade e limitações

`specs/coverage.json` registra inventário em revisão conhecida; o relatório de auditoria
explica classificação e exclusões. Um item mapeado comprova que ganhou dono documental,
não que cada linha/função esteja correta. Auditar também casos negativos e contratos.
Quando o código muda, atualizar inventário/specs na mesma entrega. Não usar contagem
de arquivos como porcentagem de produto reproduzido.

Constitution check: testes com guardas, zero chamadas pagas no gate, paridade real,
segredos fora de artifacts, evidências separadas e nenhum deploy AWS.
