Crie `/app/solution.py` e implemente:

    resumir_itens(itens: list[dict]) -> list[dict]

Cada item possui exatamente `codigo`, `quantidade` e `preco_unitario`:

- `codigo` e uma string: remova espacos nas pontas e converta para maiusculas;
- `quantidade` e um inteiro positivo (bool nao e aceito);
- `preco_unitario` e uma string decimal nao negativa no formato exato
  `^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$`.

Agrupe itens com o mesmo codigo normalizado. O resultado deve ser ordenado por
codigo e conter dicionarios com `codigo`, `quantidade` (soma das quantidades) e
`total` (quantidade vezes preco, somado exatamente), nesta ordem de chaves. `total`
deve ser uma string com exatamente duas casas decimais. Use `decimal.Decimal`; nao
use float nem bibliotecas externas.

A exatidao deve ser preservada mesmo se o chamador reduzir
`decimal.getcontext().prec`; nao altere o contexto do chamador. As entradas validas
desta avaliacao possuem ate 1000 itens, quantidades de ate 10 digitos e precos de
ate 60 digitos na parte inteira. Esses limites definem o escopo dos testes, nao
exigem rejeitar valores maiores.

Se `itens` nao for lista, um item nao tiver exatamente essas tres chaves, ou algum
campo for invalido, levante `ValueError`. Codigo vazio e invalido. A funcao nao
pode alterar a lista, os dicionarios nem seus valores.

Exemplo:

    resumir_itens([
        {"codigo": " ab ", "quantidade": 2, "preco_unitario": "1.10"},
        {"codigo": "AB", "quantidade": 1, "preco_unitario": "0.80"},
    ]) == [{"codigo": "AB", "quantidade": 3, "total": "3.00"}]
