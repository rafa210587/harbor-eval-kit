# Plano — demo e validação

Baseline retrospectiva **2026-09-08**. Depende de 001–005; não iniciar API paga apenas para preparar catálogo.

## Tasks e contratos

Cada pasta `evals/python/<nome>-teste-live` contém instruction.md, task.toml, environment/Dockerfile, environment/solution.py, solution/solve.sh, tests/test.sh e tests/test_outputs.py. Ambiente usa python:3.13-slim e stdlib; Dockerfile copia apenas stub. Tests/oracle não entram na imagem inicial.

- Simples: `resumir_itens(itens)` valida código, quantidade e preço, agrupa código normalizado, ordena e soma dinheiro exatamente sem mutar input. Limites documentados: até 1000 itens, quantidade de até 10 dígitos e dinheiro de até 60 dígitos.
- Média: `resolver_ordem(grafo)` usa ordem lexicográfica; ausência precede ciclo. DependenciaAusenteError.ausentes e CicloError.envolvidos identificam causas. SCC distingue membros de ciclo de nós apenas bloqueados. Até 200 nós/1000 arestas.
- Difícil: `Ledger.aplicar`, `aplicar_lote`, `saldo`, `saldos`, `replay`; depósito/saque/transferência com esquema exato e quantias positivas. IDs iguais/conteúdo igual são idempotentes; conteúdo divergente conflita. Batch é atômico inclusive contas e IDs. Até 1000 eventos/200 contas/dinheiro de 60 dígitos.

Verificador grava reward inicial 0; somente teste aprovado grava 1. Copia /app/solution.py para /logs/artifacts/solution.py antes de testar. Coleta Harbor esperada: artifacts/logs/artifacts/solution.py; confirmar em smoke real, não inferir da cópia offline.

## Catálogo e vínculos

`config/teste-live/catalogo-teste-live.json` é ConfigBundle v1. Quatro perfis mini-swe-agent pinam `deepseek/deepseek-v4-flash`, `deepseek/deepseek-v4-pro`, `anthropic/claude-sonnet-5`, `anthropic/claude-haiku-4-5-20251001`. Quinto modelo: `anthropic/claude-opus-5`, usado no juiz. Pro é reutilizado pelo outro juiz.

Skills authored: codificacao-por-contrato-teste-live e validacao-adversarial-teste-live. Conjunto codificacao-e-validacao-teste-live é default dos quatro candidatos. Não há agent.instructions extra; [] em skillsetIds cria ablação limpa.

Rubrica engenharia-rigorosa-teste-live: contrato funcional, casos-limite, invariantes, integridade, qualidade proporcional, validação executada, reprodutibilidade e relato honesto. Juízes DeepSeek Pro e Opus usam mesmo prompt/rubrica; sucesso do verificador não aprova automaticamente todos os critérios.

`config/teste-live/vinculos-tasks-teste-live.json` descreve pins separados do bundle. Aplicar path retornado por GET /api/tasks, judgeId=juiz-opus-teste-live e rubricIds=[rubrica-engenharia-teste-live] por POST /api/tasks/rubric-default; reler para verificar. Não importar esse mapa como ConfigBundle. Em clone novo, seguir `docs/TESTE_LIVE.md` e skill harbor-setup.

## Protocolo de execução

1. Validar catálogo/referências e teste adversarial de export.
2. Executar oracles e stubs offline em processos separados.
3. Validar dry-run/plano: uma tentativa, concorrência 1 inicialmente; mesmos limites por candidato.
4. Executar Oracle/Nop real no host validado e conferir reward/artefatos.
5. Só então executar candidatos e juízes pagos mediante autorização, preservando mesmos inputs e custos realmente reportados.

## Testes e evidência

`scripts/lib/live-config.test.ts`: import/export seguro, plano das três tasks, ablação independente e dois juízes/rubrica. `scripts/lib/harbor.test.ts`: política de modelos. Cada task tem tests/test_outputs.py. Gate: scripts/test.ps1 ou scripts/test.sh.

Registro em `docs/TESTE_LIVE.md`: oracles offline 5/5, 7/7 e 11/11; três stubs falharam. Isso não equivale a reward em container. Evidência offline desta entrega está no índice SDD. Smoke/julgamento pago precisam de registro próprio; não foram comprovados por esta especificação. IDs documentados não comprovam saldo, quota ou acesso da conta; aliases podem atualizar pesos.

Constitution check: equivalência, segredos ausentes do bundle, Podman exclusivo, reward honesto e validação separada. AWS não é executada.
