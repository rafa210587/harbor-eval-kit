#!/bin/bash
set -euo pipefail
cat > /app/solution.py <<'PY'
import heapq


class DependenciaAusenteError(ValueError):
    def __init__(self, ausentes):
        super().__init__("dependencias ausentes")
        self.ausentes = ausentes


class CicloError(ValueError):
    def __init__(self, envolvidos):
        super().__init__("ciclo")
        self.envolvidos = envolvidos


def resolver_ordem(tarefas):
    if not isinstance(tarefas, dict):
        raise ValueError("tarefas deve ser dict")
    for nome, deps in tarefas.items():
        if not isinstance(nome, str) or not nome or not isinstance(deps, list):
            raise ValueError("estrutura invalida")
        if any(not isinstance(dep, str) or not dep for dep in deps) or len(deps) != len(set(deps)):
            raise ValueError("dependencias invalidas")
    nomes = set(tarefas)
    faltas = {nome: tuple(sorted(set(deps) - nomes)) for nome, deps in sorted(tarefas.items()) if set(deps) - nomes}
    if faltas:
        raise DependenciaAusenteError(faltas)
    grau = {nome: len(deps) for nome, deps in tarefas.items()}
    filhos = {nome: [] for nome in tarefas}
    for nome, deps in tarefas.items():
        for dep in deps:
            filhos[dep].append(nome)
    fila = [nome for nome, valor in grau.items() if valor == 0]
    heapq.heapify(fila)
    ordem = []
    while fila:
        atual = heapq.heappop(fila)
        ordem.append(atual)
        for filho in filhos[atual]:
            grau[filho] -= 1
            if grau[filho] == 0:
                heapq.heappush(fila, filho)
    if len(ordem) != len(tarefas):
        index = 0
        indices, low, pilha, na_pilha, ciclicos = {}, {}, [], set(), set()
        def visitar(no):
            nonlocal index
            indices[no] = low[no] = index; index += 1
            pilha.append(no); na_pilha.add(no)
            for dep in tarefas[no]:
                if dep not in indices:
                    visitar(dep); low[no] = min(low[no], low[dep])
                elif dep in na_pilha:
                    low[no] = min(low[no], indices[dep])
            if low[no] == indices[no]:
                componente = []
                while True:
                    item = pilha.pop(); na_pilha.remove(item); componente.append(item)
                    if item == no: break
                if len(componente) > 1 or no in tarefas[no]:
                    ciclicos.update(componente)
        for nome in sorted(tarefas):
            if nome not in indices: visitar(nome)
        raise CicloError(tuple(sorted(ciclicos)))
    return ordem
PY
