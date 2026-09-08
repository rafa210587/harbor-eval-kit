---
name: harbor-setup
description: Instala e configura este clone do Harbor Eval Kit localmente com Podman, valida o ambiente e prepara a demo teste-live sem chamadas pagas. Use para primeiro setup ou retomada da instalação.
---

# Instalar e preparar o Harbor Eval Kit

Trabalhe na raiz deste clone. Leia `AGENTS.md`, `docs/INSTALACAO_CLAUDE.md` e
`Harbor_install/skills/harbor-bootstrap/SKILL.md`. Os caminhos abaixo são relativos
à raiz do repositório. Reutilize os wrappers; não reimplemente o instalador.

1. Identifique SO, shell, versões e instalação existente com status somente leitura.
   Verifique Git, Node 24+, Podman, uv e provider Compose. Se faltar um pré-requisito,
   siga a seção do SO em `docs/INSTALACAO_MANUAL.md`; registre precisamente o bloqueio
   se uma política da máquina impedir sua instalação. Preserve ferramentas existentes.
2. Ative `scripts/setup-hooks.ps1` no PowerShell ou `scripts/setup-hooks.sh` no Bash.
3. Execute `scripts/harbor-eval.ps1 install` ou `scripts/harbor-eval.sh install`.
   O wrapper captura o snapshot e já executa doctor antes de instalar Harbor.
   Não repita smoke sem motivo. Nunca instale Docker ou substitua Harbor preexistente
   incompatível. Não faça pull implícito de imagens; use as bases pré-provisionadas.
4. Valide Harbor 0.22.0 e execute `soma-fracoes` com oracle e nop via wrapper `eval`.
   Leia os `result.json`: exija rewards 1 e 0, respectivamente, sem erro de infraestrutura.
   Confira ownership e cleanup. Só declare READY para este host após esses gates.
5. Leia `Harbor_install/skills/harbor-up/SKILL.md` e inicie a GUI com o launcher do SO.
   Preserve serviços alheios; se necessário recarregar o backend, use o stop helper
   que verifica a identidade do processo, seguido de start.
6. Para preparar a demo, siga `docs/TESTE_LIVE.md`: importe o catálogo pela aba
   Configuração ou pela API local `POST /api/config/import`, enviando o bundle inteiro.
   Aplique os três vínculos do mapa portátil por `POST /api/tasks/rubric-default`
   usando os caminhos efetivamente retornados por `GET /api/tasks`; confira o contrato
   no servidor antes de enviar. Releia registros e vínculos para comprovar persistência.
   Reimporte pelos mesmos IDs, sem apagar outros registros. Se não houver acesso local
   autorizado à UI/API, deixe os passos manuais; não simule cliques ou contorne restrições.
7. O usuário cadastra valores de credenciais diretamente na aba Credenciais; nunca
   solicite que cole segredos no chat. Não leia nem exiba valores de secrets.env.
   Não teste providers, execute modelos ou juízes pagos sem pedido explícito.
   Mantenha LiteLLM desligado e AWS somente documental.
8. Entregue URL local, versões, resultados reais, localização do manifest e pendências.
   Diferencie ambiente validado de catálogo preparado e de demo paga ainda não executada.

Para retomar, confira o estado atual antes de repetir qualquer etapa. Para operar
após instalar, encaminhe às skills harbor-up, harbor-down e harbor-status em
`Harbor_install/skills/`. Para reconstruir código, use `specs/README.md`.

## Repository / PR mode (spec 013)

Read `docs/REPOSITORIOS_E_HARNESSES.md` from the repository root before configuring
this optional mode. Keep the standard doctor/install sequence. Tasks has a collapsed
repository/spec/merged-PR wizard; Agents has reusable CLI integrations. Credentials
for Git acquisition stay on the host, separate from inference bindings. Both API
and native CLI identity require trusted source code; do not promise a broker or
adversarial credential isolation. Check the server capability catalog: unsupported
native adapters must remain blocked. Do not enable LiteLLM or provision AWS implicitly.

Calibrate the historical base and reference with deterministic checks before running
candidates. The judge receives only the two diffs as code plus selected requirements,
rubric and sanitized check results. Never use raw upstream Analyze on the original
repository trial to bypass this evidence boundary. Failed checks block paid judging
unless the user selects the diagnostic override. The guide also provides the manual
fallback, local recipe import/export and the actual validation limits.
