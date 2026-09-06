Crie o arquivo /app/solution.py contendo uma funcao:

    somar_fracoes(a: tuple[int, int], b: tuple[int, int]) -> tuple[int, int]

Cada fracao e uma tupla (numerador, denominador). A funcao deve somar as duas
fracoes e devolver o resultado JA SIMPLIFICADO (dividido pelo MDC), com o
denominador sempre positivo.

Exemplos:
    somar_fracoes((1, 2), (1, 3)) == (5, 6)
    somar_fracoes((1, 4), (1, 4)) == (1, 2)
    somar_fracoes((2, 3), (-2, 3)) == (0, 1)

Nao use bibliotecas externas. A biblioteca padrao do Python e permitida.