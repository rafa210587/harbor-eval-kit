# Exemplo completo de task, validado com run real

Carregue este arquivo quando precisar de um modelo concreto em vez da lista de regras.

A task **`evals/python/soma-fracoes/`** deste repositório é um exemplo completo e verificado:
`mini-swe-agent` + `deepseek/deepseek-chat` a resolveu com reward **1.0**, custo **$0,0017**,
em 63s (2026-09-06). Leia os arquivos reais dela — apontar para a task viva evita a
duplicação virar mentira quando um dos dois mudar.

## Por que essa task funciona

**`instruction.md`** — descreve exatamente o que o teste verifica, e nada além:

- Assinatura exata e onde o arquivo deve ficar (`/app/solution.py`).
- A regra que o teste realmente cobra: resultado **simplificado**, denominador **positivo**.
- Três exemplos concretos, incluindo o caso de numerador zero.
- A restrição ("sem bibliotecas externas") dita explicitamente, não subentendida.

Regra geral: **tudo que o teste verifica precisa estar na instrução.** Um teste que cobra algo
não pedido mede adivinhação, não capacidade.

**`environment/Dockerfile`** — mínimo e com versão pinada:

```dockerfile
FROM python:3.13-slim
WORKDIR /app
```

Nunca copie `tests/` nem `solution/` para dentro da imagem — o agent passaria a enxergar a
resposta. Dependência **de teste** se instala no `test.sh`, não aqui.

**`tests/test.sh`** — é ele que decide o reward:

- Grava `0` ou `1` (ou fração) em `/logs/verifier/reward.txt`. Sem isso não há nota.
- Cobre casos-limite que pegam implementação ingênua: fração negativa, numerador zero,
  denominador negativo — não só o caso feliz.
- Imprime o que falhou (`FALHOU <entrada> esperado <x> obtido <y>`), o que torna o log útil na
  aba Logs e para o juiz depois.
- Sai `0` sempre: quem comunica o resultado é o `reward.txt`, não o exit code do script.

**`solution/solve.sh`** — solução de referência usada pelo agent `oracle`:

- Demonstra o **processo** (usa `math.gcd` para reduzir), não ecoa respostas prontas. Uma
  solução que hard-codeia os valores esperados é reprovada pelo `harbor check`.

## O ciclo de validação, antes de gastar API

1. Rode a task com o agent **`oracle`** (aplica o `solve.sh`): tem que dar reward **1.0**.
   Se não der, o problema está na sua task, não no agent.
2. Rode com **`nop`** (não faz nada): tem que dar **0.0**. Se der 1.0, o teste passa sozinho e
   não está medindo nada.
3. Só então rode com um agent de verdade.

Esses dois agents não gastam API — é o jeito mais barato de descobrir que o teste está quebrado.

## Erros que esse ciclo pega

| Sintoma | Causa quase sempre |
|---|---|
| `oracle` dá 0.0 | `test.sh` cobra algo que a `instruction.md` não pede, ou caminho errado |
| `nop` dá 1.0 | teste não verifica nada de verdade (ex.: só checa se o arquivo existe) |
| reward vazio | `test.sh` não escreveu `/logs/verifier/reward.txt` |
| agent real falha sempre | instrução ambígua — leia a trajetória na aba Trajectories |
