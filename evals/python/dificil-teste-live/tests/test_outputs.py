import copy
import decimal
import unittest
from solution import (EventoConflitanteError, EventoInvalidoError, Ledger,
                      SaldoInsuficienteError)


def dep(i, conta, valor):
    return {"id": i, "tipo": "deposito", "conta": conta, "valor": valor}


class LedgerTests(unittest.TestCase):
    def test_replay_transferencia_e_formatacao(self):
        eventos = [dep("1", "alice", "10.10"),
                   {"id": "2", "tipo": "transferencia", "origem": "alice", "destino": "bob", "valor": "3.05"},
                   {"id": "3", "tipo": "saque", "conta": "bob", "valor": "1.05"}]
        original = copy.deepcopy(eventos)
        ledger = Ledger.replay(eventos)
        self.assertEqual(ledger.saldos(), {"alice": "7.05", "bob": "2.00"})
        self.assertEqual(ledger.saldo("inexistente"), "0.00")
        self.assertEqual(eventos, original)

    def test_idempotencia_por_conteudo_e_conflito(self):
        ledger = Ledger()
        evento = dep("id", "a", "0.10")
        self.assertTrue(ledger.aplicar(evento))
        self.assertFalse(ledger.aplicar(dict(evento)))
        with self.assertRaises(EventoConflitanteError):
            ledger.aplicar(dep("id", "a", "0.20"))
        with self.assertRaises(EventoConflitanteError):
            ledger.aplicar({"id": "id", "tipo": "desconhecido"})
        self.assertEqual(ledger.saldos(), {"a": "0.10"})

    def test_lote_faz_rollback_de_saldos_contas_e_ids(self):
        ledger = Ledger()
        ledger.aplicar(dep("base", "a", "5.00"))
        lote = [dep("novo", "fantasma", "2.00"),
                {"id": "falha", "tipo": "saque", "conta": "a", "valor": "9.00"}]
        with self.assertRaises(SaldoInsuficienteError):
            ledger.aplicar_lote(lote)
        self.assertEqual(ledger.saldos(), {"a": "5.00"})
        self.assertTrue(ledger.aplicar(dep("novo", "a", "1.00")))

    def test_rollback_por_evento_invalido_preserva_id_preexistente(self):
        ledger = Ledger.replay([dep("base", "a", "2.00")])
        with self.assertRaises(EventoInvalidoError):
            ledger.aplicar_lote([dep("temporario", "b", "3.00"), dep("ruim", "c", "NaN")])
        self.assertEqual(ledger.saldos(), {"a": "2.00"})
        self.assertFalse(ledger.aplicar(dep("base", "a", "2.00")))
        self.assertTrue(ledger.aplicar(dep("temporario", "a", "1.00")))

    def test_conflito_dentro_do_lote_reverte_tudo(self):
        ledger = Ledger()
        with self.assertRaises(EventoConflitanteError):
            ledger.aplicar_lote([dep("x", "a", "1.00"), dep("x", "a", "2.00")])
        self.assertEqual(ledger.saldos(), {})

    def test_lote_conta_somente_novos(self):
        ledger = Ledger.replay([dep("1", "a", "1.00")])
        self.assertEqual(ledger.aplicar_lote([dep("1", "a", "1.00"), dep("2", "a", "2.00")]), 1)
        self.assertEqual(ledger.saldo("a"), "3.00")

    def test_repeticao_no_mesmo_lote_e_conta_com_saldo_zero(self):
        evento = dep("x", "a", "1.00")
        ledger = Ledger()
        self.assertEqual(ledger.aplicar_lote([evento, dict(evento)]), 1)
        ledger.aplicar({"id": "s", "tipo": "saque", "conta": "a", "valor": "1.00"})
        self.assertEqual(ledger.saldos(), {"a": "0.00"})

    def test_precisao_independe_do_contexto_e_nao_muta_eventos(self):
        eventos = [dep("g", "grande", "123456789012345678901234567890.12")]
        copia = copy.deepcopy(eventos)
        contexto = decimal.getcontext().copy()
        try:
            decimal.getcontext().prec = 5
            ledger = Ledger.replay(eventos)
            ledger.aplicar(dep("p", "grande", "0.88"))
            self.assertEqual(ledger.saldo("grande"), "123456789012345678901234567891.00")
            self.assertEqual(decimal.getcontext().prec, 5)
        finally:
            decimal.setcontext(contexto)
        self.assertEqual(eventos, copia)

    def test_replay_de_vinte_contas_conserva_total(self):
        eventos = [dep(f"d{i}", f"c{i:02d}", f"{i + 1}.00") for i in range(20)]
        eventos += [{"id": f"t{i}", "tipo": "transferencia", "origem": f"c{i:02d}",
                     "destino": f"c{i + 1:02d}", "valor": "0.25"} for i in range(19)]
        ledger = Ledger.replay(eventos)
        self.assertEqual(ledger.saldo("c00"), "0.75")
        self.assertEqual(ledger.saldo("c19"), "20.25")
        centavos = sum(int(valor.replace(".", "")) for valor in ledger.saldos().values())
        self.assertEqual(centavos, sum(range(1, 21)) * 100)
        self.assertEqual(ledger.aplicar_lote(copy.deepcopy(eventos)), 0)

    def test_validacao_e_falhas_sao_atomicas(self):
        ledger = Ledger()
        invalidos = [
            {"id": "tipo-list", "tipo": [], "conta": "a", "valor": "1.00"},
            {"id": "tipo-dict", "tipo": {}, "conta": "a", "valor": "1.00"},
            {"id": "tipo-none", "tipo": None, "conta": "a", "valor": "1.00"},
            {"id": "tipo-bool", "tipo": True, "conta": "a", "valor": "1.00"},
            {"id": [], "tipo": "deposito", "conta": "a", "valor": "1.00"},
            {"id": {}, "tipo": "deposito", "conta": "a", "valor": "1.00"},
            {"id": None, "tipo": "deposito", "conta": "a", "valor": "1.00"},
            {"id": True, "tipo": "deposito", "conta": "a", "valor": "1.00"},
            {"id": "conta-list", "tipo": "deposito", "conta": [], "valor": "1.00"},
            {"id": "conta-dict", "tipo": "deposito", "conta": {}, "valor": "1.00"},
            {"id": "conta-none", "tipo": "deposito", "conta": None, "valor": "1.00"},
            {"id": "conta-bool", "tipo": "deposito", "conta": True, "valor": "1.00"},
            dep("", "a", "1.00"), dep("x", "a", "NaN"), dep("x", "a", "1.001"),
            dep("x", "a", "0"), {**dep("x", "a", "1.00"), "extra": 1},
            dep("x", "a", "+1.00"), dep("x", "a", "01.00"), dep("x", "a", "1e2"),
            {"id": "x", "tipo": "transferencia", "origem": "a", "destino": "a", "valor": "1.00"},
        ]
        for evento in invalidos:
            with self.subTest(evento=evento), self.assertRaises(EventoInvalidoError):
                ledger.aplicar(evento)
        with self.assertRaises(EventoInvalidoError):
            ledger.aplicar_lote("nao-lista")
        self.assertEqual(ledger.saldos(), {})

    def test_saldo_insuficiente_nao_reserva_id(self):
        ledger = Ledger()
        saque = {"id": "s", "tipo": "saque", "conta": "a", "valor": "1.00"}
        with self.assertRaises(SaldoInsuficienteError): ledger.aplicar(saque)
        ledger.aplicar(dep("d", "a", "2.00"))
        self.assertTrue(ledger.aplicar(saque))
        self.assertEqual(ledger.saldo("a"), "1.00")


if __name__ == "__main__":
    unittest.main()
