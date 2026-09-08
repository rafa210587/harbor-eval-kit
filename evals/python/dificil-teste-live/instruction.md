## Skills opcionais

Antes de implementar, se `/harbor/skills` existir, liste e leia os arquivos
`SKILL.md` fornecidos nesse diretorio e seus subdiretorios. Siga as orientacoes
compativeis com o contrato desta task. Se nao houver skills, continue normalmente.
Nao altere as skills, os testes do avaliador nem os arquivos de reward.

Crie `/app/solution.py` com um ledger transacional em memoria:

    class EventoInvalidoError(ValueError): pass
    class EventoConflitanteError(ValueError): pass
    class SaldoInsuficienteError(ValueError): pass

    class Ledger:
        def aplicar(self, evento: dict) -> bool: ...
        def aplicar_lote(self, eventos: list[dict]) -> int: ...
        def saldo(self, conta: str) -> str: ...
        def saldos(self) -> dict[str, str]: ...
        @classmethod
        def replay(cls, eventos: list[dict]) -> "Ledger": ...

Um evento deve ser exatamente um destes formatos (sem chaves extras):

- deposito: `{"id": str, "tipo": "deposito", "conta": str, "valor": str}`
- saque: `{"id": str, "tipo": "saque", "conta": str, "valor": str}`
- transferencia: `{"id": str, "tipo": "transferencia", "origem": str,
  "destino": str, "valor": str}`

IDs e contas sao strings nao vazias, sem normalizacao. `valor` e uma string decimal
estritamente positiva no formato exato
`^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$`; valores numericamente iguais a zero sao
invalidos. Origem e destino devem ser diferentes. Use `decimal.Decimal`, nunca
float.

Mantenha a exatidao mesmo se o chamador reduzir `decimal.getcontext().prec` e nao
altere o contexto do chamador. Os testes usam ate 1000 eventos, 200 contas e
valores com ate 60 digitos na parte inteira. Esses limites definem o escopo da
avaliacao, nao exigem rejeitar entradas maiores.

Contas inexistentes tem saldo zero. Saque ou transferencia que deixaria a origem
negativa levanta `SaldoInsuficienteError` e nao altera estado nem registra o ID.
Evento malformado levanta `EventoInvalidoError`, tambem sem alterar estado.

Idempotencia e definida pelo conteudo: reaplicar um ID ja aceito com um dicionario
igual retorna `False` e nao altera nada; o mesmo ID com qualquer conteudo diferente
levanta `EventoConflitanteError`, mesmo que o novo dicionario seja malformado. Essa
checagem de ID existente precede a validacao dos demais campos. Um evento novo
aceito retorna `True`.

`aplicar_lote` exige uma lista e aplica todos os eventos como uma unica transacao.
Se qualquer evento falhar, inclusive por conflito entre eventos do proprio lote,
todo o estado volta exatamente ao anterior. Em sucesso, retorna a quantidade de
eventos novos; repeticoes idempotentes contam zero.

`saldo` retorna uma string com duas casas. `saldos` retorna apenas contas que ja
participaram de um evento aceito, inclusive saldo zero, ordenadas pelo nome.
`replay` cria um Ledger vazio, chama a semantica de lote sobre os eventos e devolve
o objeto. Nenhum metodo pode alterar os dicionarios/listas recebidos. Use apenas a
biblioteca padrao.
