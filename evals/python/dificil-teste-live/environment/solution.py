class EventoInvalidoError(ValueError): pass
class EventoConflitanteError(ValueError): pass
class SaldoInsuficienteError(ValueError): pass


class Ledger:
    def aplicar(self, evento):
        raise NotImplementedError

    def aplicar_lote(self, eventos):
        raise NotImplementedError

    def saldo(self, conta):
        raise NotImplementedError

    def saldos(self):
        raise NotImplementedError

    @classmethod
    def replay(cls, eventos):
        raise NotImplementedError
