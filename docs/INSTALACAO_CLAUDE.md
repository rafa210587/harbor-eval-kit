# Instalação local com Claude Code

O caminho assistido usa **Claude Code local**, aberto no clone. Não exige copiar
skills para o perfil do usuário nem instalar o Spec Kit para executar a plataforma.
Git, Node.js 24+, Podman, uv, Compose e imagens base continuam sendo pré-requisitos
reais; a skill verifica o que falta e orienta a configuração do host.

```bash
git clone https://github.com/rafa210587/harbor-eval-kit.git
cd harbor-eval-kit
claude
```

No Claude Code, invoque:

```text
/harbor-setup
```

A entrada versionada está em
[.claude/skills/harbor-setup/SKILL.md](../.claude/skills/harbor-setup/SKILL.md).
Essa é a pasta de descoberta de skills de projeto do
[Claude Code](https://code.claude.com/docs/en/skills).
As instruções detalhadas continuam em `Harbor_install/skills/`, compartilhadas
com outros agentes. Não são as skills de codificação avaliadas na GUI.

## O que a skill faz

1. Inspeciona SO e ferramentas e preserva o que já existe.
2. Ativa o scanner de credenciais, instala Harbor 0.22.0 isolado e valida Podman.
3. Executa uma task oracle/nop e verifica os resultados e a limpeza dos recursos.
4. Abre a GUI local e prepara catálogo e vínculos da demo pela UI ou API local.
5. Informa as pendências e orienta o cadastro de credenciais diretamente na GUI.

Você só precisa fornecer as escolhas locais que não podem ser inferidas, resolver
restrições administrativas da sua máquina e cadastrar as chaves. O setup não inicia
avaliações pagas. As três tasks da demo têm um smoke próprio ainda pendente; a
validação de `soma-fracoes` comprova o ambiente, não substitui esse smoke.
macOS/Linux precisam dos gates reais no próprio host para receber o estado READY.

## Se o comando não aparecer

Abra Claude Code na raiz do clone, confira se skills de projeto estão habilitadas
e se não há uma skill pessoal com o mesmo nome. Você também pode enviar:

```text
Leia .claude/skills/harbor-setup/SKILL.md e execute o setup local deste clone.
Preserve minhas dependências, use somente Podman, prepare a demo teste-live,
não faça chamadas pagas e não execute AWS. Não peça credenciais no chat.
```

Se a ferramenta não puder executar comandos locais, siga o
[fallback manual por SO](INSTALACAO_MANUAL.md). Claude no navegador, sem acesso ao
host, não instala Podman na sua máquina. Nenhuma configuração de permissões do
Claude é desativada por este projeto.

## Configurar a demo depois de instalar

Em **Configuração → Importar bundle → Escolher arquivo**, selecione
[`catalogo-teste-live.json`](../config/teste-live/catalogo-teste-live.json).
A seleção já inicia a importação. O JSON não contém credenciais; importar novamente
atualiza pelos mesmos IDs. As tasks vêm no clone e os vínculos locais devem ser
aplicados conforme o [roteiro teste-live](TESTE_LIVE.md).

O catálogo é portátil, mas disponibilidade dos modelos depende da conta do provider.
Revise os quatro candidatos e os limites antes de iniciar qualquer experimento.
Para o uso diário, peça ao Claude para iniciar, parar ou mostrar o status do kit;
`CLAUDE.md` encaminha às skills operacionais correspondentes.

## Validação deste guia

Rotas, comandos e arquivos foram conferidos contra o código em 2026-09-08.
A descoberta e execução interativa de `/harbor-setup` em uma instalação nova do
Claude Code ainda não foram exercitadas nesta rodada. O histórico de testes reais
da plataforma está no README; a revisão da skill não amplia sua certificação.

## Configuração opcional depois do doctor

O assistente fica em **Tasks → Spec de repositório + PR**; conexões reutilizáveis
ficam em **Agentes → Integrações de CLI e harness**. O [guia específico](REPOSITORIOS_E_HARNESSES.md)
explica cada etapa, credenciais Git/API/login nativo, calibração sem juiz, evidências
somente por diff, export/import de receitas e fallback manual. Use apenas fontes
confiáveis; diagnóstico no host não certifica a sessão do CLI em container.
