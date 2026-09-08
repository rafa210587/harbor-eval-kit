# Diagnóstico de instalação macOS — 2026-09-08

## Estado

Não há instalação completa validada em um Mac nesta rodada. O ambiente disponível
é Windows; CI macOS cobre testes offline, não Podman machine/Compose/Harbor reais.
Sem os logs do outro host, não é possível afirmar a causa de todos os erros vistos.

## Bug reproduzido e corrigido

`scripts/lib/podman.ts` executava `podman machine inspect <nome> --format json`.
Esse subcomando trata --format como template Go: retorna texto literal `json`.
Sem --format, inspect já retorna JSON. `machine list --format json` e
`system connection list --format json` possuem tratamento próprio para JSON;
não se deve generalizar a sintaxe entre subcomandos.

Reprodução read-only com Podman 6.0.2 no host disponível:

| Chamada | JSON.parse | Texto literal json |
|---|---|---|
| machine inspect com --format json | falhou | sim |
| machine inspect sem --format | passou | não |

Nenhuma máquina foi criada, iniciada ou removida para essa verificação. O teste
antigo simulava JSON na chamada errada, ocultando o defeito. Atualizamos a fixture
para reproduzir a saída real; antes da correção o caso macOS falhou com
`Podman returned invalid JSON for machine inspect`. O resolver agora usa saída padrão.
No Windows esse defeito ficava oculto porque o ramo não lia PodmanSocket; usa pipe fixo.

Após a correção, os 8 testes do resolvedor e os 231 testes da suíte passaram.
A verificação de imports/ciclos passou para 80 módulos TS e 36 módulos da GUI.
O resolvedor também selecionou a conexão e o pipe com Podman real no Windows;
isso não exercita o socket Unix nem a VM do macOS.

Fontes oficiais: [machine inspect](https://docs.podman.io/en/latest/markdown/podman-machine-inspect.1.html)
e [implementação do comando](https://github.com/containers/podman/blob/main/cmd/podman/machine/inspect.go).

## Confirmação que falta no Mac

Depois de atualizar o clone, seguir [instalação manual macOS](INSTALACAO_MANUAL.md#macos)
ou `/harbor-setup` no Claude Code local. A confirmação exige:

1. Node 24+, Harbor 0.22.0, Podman machine e conexão corretas, Compose com --wait/--pull.
2. Doctor passando CLI/API Podman, build/run/exec, mounts, rede/volume e cleanup.
3. `soma-fracoes` com oracle=1 e nop=0, sem erro de infraestrutura e sem chamadas pagas.
4. GUI abrindo e resultados/logs acessíveis; registrar versão macOS, arquitetura,
   Podman, provider Compose e resultados reais.

Bases Alpine/Python precisam estar pré-provisionadas. Apple Silicon/Intel, provider
da VM e compartilhamento dos paths do host precisam ser conferidos no próprio Mac.
Não declarar READY só com JSON do inspect correto, GUI aberta ou CI verde.
