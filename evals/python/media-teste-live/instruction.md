Crie `/app/solution.py` com a API:

    class DependenciaAusenteError(ValueError):
        ausentes: dict[str, tuple[str, ...]]

    class CicloError(ValueError):
        envolvidos: tuple[str, ...]

    resolver_ordem(tarefas: dict[str, list[str]]) -> list[str]

`tarefas` mapeia o nome de cada tarefa para os nomes de suas dependencias. Nomes
devem ser strings nao vazias. A lista de dependencias deve conter strings nao
vazias e nao pode repetir um nome.

Retorne uma ordem topologica. Sempre que mais de uma tarefa estiver disponivel,
escolha o menor nome pela ordem lexicografica do Python; portanto o resultado e
deterministico e nao depende da ordem de insercao do dicionario.

Entradas estruturalmente invalidas levantam `ValueError`. Se houver referencias a
tarefas que nao sao chaves do dicionario, levante `DependenciaAusenteError`; seu
atributo `ausentes` deve mapear, em ordem lexicografica, cada tarefa afetada para
uma tupla ordenada das referencias ausentes. Verifique ausencias antes de ciclos.

Se houver ciclo, levante `CicloError`. `envolvidos` deve ser a tupla ordenada de
todos e somente os nos que pertencem a pelo menos um ciclo (incluindo
autodependencia); nao inclua tarefas apenas bloqueadas por esses ciclos.

Nao altere a entrada e nao use bibliotecas externas.

As entradas validas desta avaliacao possuem ate 200 tarefas e ate 1000 arestas.
Esses limites definem o escopo dos testes, nao exigem rejeitar grafos maiores.
