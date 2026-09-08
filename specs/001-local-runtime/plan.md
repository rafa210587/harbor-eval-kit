# Plano — runtime local

Baseline retrospectiva **2026-09-08**. Depende de [constituição](../../.specify/memory/constitution.md) e AGENTS.md; não depende de outra feature funcional.

## Arquitetura e decisões

`scripts/harbor-eval.sh` e `.ps1` despacham install/doctor/uninstall. `scripts/installation.ts` coordena `scripts/lib/installation.ts`, `podman.ts` e `podman-smoke.ts`. O adapter `scripts/python/harbor_eval_kit/managed.py` cria recursos Podman e `ownership.py` registra identidades. `scripts/lib/cleanup.ts` separa planejamento de execução. `scripts/lib/gui-lifecycle.ts` identifica processos da GUI.

Preservar instalação user-level e dependências existentes. Não trocar Podman por Docker para simplificar compatibilidade. Não transformar inferência por nome em prova de propriedade.

Na implementação atual, os wrappers executam operações e gates; a decisão final de declarar READY pertence ao runbook/skill após comprovar também o Oracle real. Não atribuir aos wrappers uma certificação automática completa.

## Dados e contratos

Implementar a partir de [contracts.md](contracts.md): esquema de manifesto/locks compartilhados, resolução por SO, identidade da API, limites do adapter, ordem de cleanup e auditoria. Referências a módulos são evidência, não substituem estes comportamentos.

- InstallationManifest schema_version=1: host, preexisting, installed_by_kit, managed_resources e notes. Recursos incluem containers/images/volumes/networks.
- Snapshot inicial usa criação exclusiva. Atualizações usam lock e substituição por arquivo temporário.
- CleanupPlan contém actions(command,args) e preserved. `planCleanup` não executa comandos.
- CLI pública: `scripts/harbor-eval.{sh,ps1} install`, `doctor`, `uninstall --dry-run`.
- Protocolo compatível com Docker aponta ao Podman; nenhuma dependência de Docker Engine.

## Mapa para reconstrução

1. Recriar manifesto e locks em `scripts/lib/installation.ts`.
2. Resolver conexão e gates em `scripts/lib/podman.ts` e `scripts/installation.ts`.
3. Recriar adapter Python e smoke de recursos com prefixo/label obrigatórios.
4. Implementar `scripts/lib/cleanup.ts` antes de expor uninstall nos dois wrappers.
5. Alinhar `Harbor_install/skills/harbor-bootstrap/SKILL.md` e `Harbor_install/references/docker-host-por-so.md` aos comandos reais.

## Testes e evidências

Suítes existentes: `scripts/lib/installation.test.ts`, `podman.test.ts`, `managed-runtime.test.ts`, `cleanup.test.ts`, `portability.test.ts`; Python: `scripts/python/test_managed.py`.

Gate offline: `pwsh -NoProfile -File scripts/test.ps1` ou `bash scripts/test.sh`. Smoke de container e Oracle ficam fora desse gate. Registrar SO, versões, conexão resolvida e efeito da limpeza em cada execução real.

Evidência offline desta entrega está registrada no índice SDD; smoke de runtime é separado. Fixtures não comprovam Podman funcional no macOS/Windows/Linux. Não declarar compatibilidade de host sem smoke. Remoção de uv não é automaticamente comprovada pelo manifesto atual: o cleanup o preserva. AWS permanece plano corporativo documental, sem implantação.

## Constitution check

Podman exclusivo; propriedade verificável; segredos fora de argv/logs; wrappers pareados; alterações com testes/docs; nenhuma remoção global ou AWS.
