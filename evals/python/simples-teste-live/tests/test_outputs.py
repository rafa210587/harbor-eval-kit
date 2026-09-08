import copy
import decimal
import unittest
from solution import resumir_itens


class ResumirItensTests(unittest.TestCase):
    def test_agrega_normaliza_ordena_e_preserva_precisao(self):
        itens = [
            {"codigo": " z9 ", "quantidade": 3, "preco_unitario": "0.10"},
            {"codigo": "ab", "quantidade": 2, "preco_unitario": "1.10"},
            {"codigo": " AB ", "quantidade": 1, "preco_unitario": "0.80"},
            {"codigo": "z9", "quantidade": 7, "preco_unitario": "0.10"},
        ]
        self.assertEqual(resumir_itens(itens), [
            {"codigo": "AB", "quantidade": 3, "total": "3.00"},
            {"codigo": "Z9", "quantidade": 10, "total": "1.00"},
        ])
        self.assertEqual(list(resumir_itens(itens)[0]), ["codigo", "quantidade", "total"])

    def test_precisao_independe_do_contexto_e_entrada_fica_intacta(self):
        itens = [{"codigo": "BIG", "quantidade": 9,
                  "preco_unitario": "123456789012345678901234567890.12"}]
        copia = copy.deepcopy(itens)
        contexto = decimal.getcontext().copy()
        try:
            decimal.getcontext().prec = 6
            self.assertEqual(resumir_itens(itens), [{
                "codigo": "BIG", "quantidade": 9,
                "total": "1111111101111111110111111111011.08",
            }])
            self.assertEqual(decimal.getcontext().prec, 6)
        finally:
            decimal.setcontext(contexto)
        self.assertEqual(itens, copia)

    def test_vazio(self):
        self.assertEqual(resumir_itens([]), [])

    def test_matriz_deterministica_de_valores_validos(self):
        itens = []
        for indice in range(1, 21):
            itens.append({"codigo": f" item-{indice % 5} ", "quantidade": indice,
                          "preco_unitario": f"{indice}.{indice % 100:02d}"})
        resultado = resumir_itens(itens)
        self.assertEqual([item["codigo"] for item in resultado],
                         ["ITEM-0", "ITEM-1", "ITEM-2", "ITEM-3", "ITEM-4"])
        esperados = {"ITEM-0": (50, "757.50"), "ITEM-1": (34, "418.14"),
                     "ITEM-2": (38, "490.86"), "ITEM-3": (42, "571.66"),
                     "ITEM-4": (46, "660.54")}
        self.assertEqual({x["codigo"]: (x["quantidade"], x["total"]) for x in resultado}, esperados)

    def test_rejeita_contratos_invalidos(self):
        invalidos = [
            None,
            [{"codigo": None, "quantidade": 1, "preco_unitario": "1.00"}],
            [{"codigo": [], "quantidade": 1, "preco_unitario": "1.00"}],
            [{"codigo": {}, "quantidade": 1, "preco_unitario": "1.00"}],
            [{"codigo": True, "quantidade": 1, "preco_unitario": "1.00"}],
            [{"codigo": "A", "quantidade": True, "preco_unitario": "1.00"}],
            [{"codigo": "A", "quantidade": None, "preco_unitario": "1.00"}],
            [{"codigo": "A", "quantidade": [], "preco_unitario": "1.00"}],
            [{"codigo": " ", "quantidade": 1, "preco_unitario": "1.00"}],
            [{"codigo": "A", "quantidade": 0, "preco_unitario": "1.00"}],
            [{"codigo": "A", "quantidade": 1, "preco_unitario": "1.001"}],
            [{"codigo": "A", "quantidade": 1, "preco_unitario": "NaN"}],
            [{"codigo": "A", "quantidade": 1, "preco_unitario": "-0.01"}],
            [{"codigo": "A", "quantidade": 1, "preco_unitario": 1}],
            [{"codigo": "A", "quantidade": 1, "preco_unitario": None}],
            [{"codigo": "A", "quantidade": 1, "preco_unitario": []}],
            [{"codigo": "A", "quantidade": 1, "preco_unitario": {}}],
            [{"codigo": "A", "quantidade": 1, "preco_unitario": True}],
            [{"codigo": "A", "quantidade": 1, "preco_unitario": "+1.00"}],
            [{"codigo": "A", "quantidade": 1, "preco_unitario": "01.00"}],
            [{"codigo": "A", "quantidade": 1, "preco_unitario": "1e2"}],
            [{"codigo": "A", "quantidade": 1, "preco_unitario": "1.00", "extra": 1}],
        ]
        for valor in invalidos:
            with self.subTest(valor=valor), self.assertRaises(ValueError):
                resumir_itens(valor)


if __name__ == "__main__":
    unittest.main()
