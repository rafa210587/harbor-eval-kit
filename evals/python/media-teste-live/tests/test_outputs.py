import unittest
from solution import CicloError, DependenciaAusenteError, resolver_ordem


class ResolverOrdemTests(unittest.TestCase):
    def test_ordem_topologica_e_desempate_deterministico(self):
        entrada = {"deploy": ["testar", "empacotar"], "testar": ["compilar"],
                   "empacotar": ["compilar"], "docs": [], "compilar": []}
        copia = {k: list(v) for k, v in entrada.items()}
        self.assertEqual(resolver_ordem(entrada),
                         ["compilar", "docs", "empacotar", "testar", "deploy"])
        self.assertEqual(entrada, copia)

    def test_ausentes_tem_prioridade_e_formato_exato(self):
        entrada = {"b": ["x", "a", "x"], "a": ["b", "z"]}
        with self.assertRaises(ValueError):
            resolver_ordem(entrada)  # repeticao e erro estrutural primeiro
        with self.assertRaises(DependenciaAusenteError) as ctx:
            resolver_ordem({"b": ["x", "a"], "a": ["b", "z"]})
        self.assertEqual(ctx.exception.ausentes, {"a": ("z",), "b": ("x",)})

    def test_ciclo_exclui_nos_apenas_bloqueados(self):
        entrada = {"a": ["b"], "b": ["a"], "c": ["b"], "d": ["d"], "livre": []}
        with self.assertRaises(CicloError) as ctx:
            resolver_ordem(entrada)
        self.assertEqual(ctx.exception.envolvidos, ("a", "b", "d"))

    def test_multiplos_sccs_e_arestas_entre_componentes(self):
        entrada = {
            "cauda": ["c"], "c": ["d"], "d": ["c", "b"],
            "b": ["a"], "a": ["b"], "entrada": [],
        }
        copia = {k: list(v) for k, v in entrada.items()}
        with self.assertRaises(CicloError) as ctx:
            resolver_ordem(entrada)
        self.assertEqual(ctx.exception.envolvidos, ("a", "b", "c", "d"))
        self.assertEqual(entrada, copia)

    def test_ordem_independe_da_insercao(self):
        a = {"z": ["a"], "b": [], "a": [], "y": ["a"]}
        b = {"y": ["a"], "a": [], "b": [], "z": ["a"]}
        self.assertEqual(resolver_ordem(a), resolver_ordem(b))

    def test_vinte_dags_deterministicos(self):
        for tamanho in range(1, 21):
            nomes = [f"t{i:02d}" for i in range(tamanho)]
            grafo = {}
            for i in reversed(range(tamanho)):
                deps = [] if i == 0 else [nomes[i - 1]]
                if i >= 3: deps.append(nomes[i - 3])
                grafo[nomes[i]] = deps
            with self.subTest(tamanho=tamanho):
                self.assertEqual(resolver_ordem(grafo), nomes)

    def test_vazio_e_validacao(self):
        self.assertEqual(resolver_ordem({}), [])
        for valor in [[], {"": []}, {"a": "b"}, {"a": [""]}, {1: []},
                      {None: []}, {True: []}, {"a": [None]}, {"a": [[]]},
                      {"a": [{}]}, {"a": [True]}]:
            with self.subTest(valor=valor), self.assertRaises(ValueError):
                resolver_ordem(valor)


if __name__ == "__main__":
    unittest.main()
