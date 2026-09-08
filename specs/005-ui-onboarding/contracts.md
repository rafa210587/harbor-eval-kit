# Contrato das jornadas e apresentação

Comportamento da interface na baseline de 2026-09-08. DTOs e efeitos das ações
pertencem às specs de domínio indicadas; browser não substitui validação do servidor.

## As 16 abas

Página pt-BR com header/status/compacto, nav em três grupos e main. `data-tab`
liga botão a `tab-<id>`; ativação seleciona uma section, chama hooks e refresher.

| Grupo / id | Área | Entrada/ação e resultado | Contrato |
|---|---|---|---|
| Jornada / start | Começar | checklist; modos modelos/agentes/skills/livre; próximo passo | esta spec |
| Jornada / compare | Novo experimento | task/candidatos/defaults/limites; prévia, execução, histórico e análise | 003/004/010 |
| Catálogo / tasks | Tasks | criar/editar arquivos e fixar juiz/rubricas | 007 |
| Catálogo / models | Modelos | label e provider/model; CRUD e descoberta | 002/008 |
| Catálogo / agents | Agentes | adapter/modelo/instruções/conjuntos padrão/notas | 002/003 |
| Catálogo / skills | Skills | authored/pasta, Markdown e arquivos extras | 002/003 |
| Catálogo / skillsets | Conjuntos de skills | label e skillIds | 002 |
| Catálogo / criteria | Critérios | nome, descrição, guidance PASS/FAIL/N-A | 002/004 |
| Catálogo / rubrics | Conjuntos de critérios | label e criterionIds | 002/004 |
| Catálogo / judges | Juízes | adapter/modelo/prompt/rubricas padrão/validação | 002/004 |
| Ambiente / secrets | Credenciais | provider/nome/valor; listar nomes; descobrir/testar modelo | 008/011 |
| Ambiente / datasets | Datasets | listar/baixar e enviar caminho a Compare | 007 |
| Ambiente / config-bundle | Configuração | export JSON seguro e import no change do input | 002/010 |
| Ambiente / logs | Logs | jobsDir/job/arquivo e leitura incremental | 009 |
| Ambiente / trajectories | Trajetórias | iniciar viewer, abrir URL pronta, parar processo próprio | 009 |
| Ambiente / analyze | Análise avulsa | path/juiz/rubricas/validação; progresso e resultado | 004/009/010 |

## Inicialização e estado

Carregar status, retomar monitores conhecidos e fazer refresh de catálogo/tasks/viewers.
Usar Promise.allSettled para nomear áreas com falha preservando as que carregaram.
Instalar field help ao terminar. Status a cada 15s; barra verde exige Harbor
disponível, podman.infoOk e dockerHost. Essa barra não comprova READY nem substitui smoke.

Checklist primeiro exige task escolhida; se há tasks encaminha a Compare, senão Tasks.
Depois exige ao menos um perfil. Se algum usa adapter gratuito informado pelo servidor,
oferece caminho sem modelo/credencial. Senão exige ao menos um modelo e um nome de
credencial. Isso não comprova correspondência da chave com o candidato; preflight
de domínio decide se execução é possível.

Cliente fetch relativo envia JSON/Content-Type quando há body, lê texto e tenta JSON.
Não-2xx lança erro com status, mensagem, estimate e needsAcknowledge. Sucesso HTTP de
Compare não significa todas as rows aprovadas. Histórico reaberto apresenta identidade
e título próprios, independentemente do formulário atual.

## Campos, segurança e assíncrono

Cada controle tem label associado e ajuda via aria-describedby: finalidade, exemplo,
padrão e obrigatoriedade. Campos dinâmicos podem usar descrição de grupo. Preservar
avisos específicos de custo, concorrência, herança de skills e modo validação.
UI pode exigir descrição/guidance de critério mesmo quando CRUD aceita omissão.
Anexar Markdown substitui textarea e limpa input para permitir reaplicação.

Escapar &, <, > e aspas ao inserir dados externos em HTML. Labels, notes, sublinhas
e erros de bundles importados são texto, não markup confiável. Delete confirma,
mostra recusa por referência e libera botão após erro. Identidade/geração de request
impede que resultado antigo de task/log/viewer substitua seleção atual (007/009).

Modo compacto persiste em localStorage `hek-compact-mode` como `1`/`0`; storage
indisponível não bloqueia página, mantém modo desligado. Ocultar dicas introdutórias
sem ocultar custo, validação, alertas e status. Preferência do browser não é estado
de execução; experimentos/operações são lidos do disco.

## Referência visual

Main até 1320px, painéis com borda/radius8, fonte sistema 14px/1.5, campos 100%,
nav com wrap e grupos sem submenu. Escuro padrão: bg #0f1115, panel #171a21,
text #e6e8eb, accent #4f8cff. Tema claro segue prefers-color-scheme, sem toggle próprio.
Strings longas quebram, foco por teclado visível, controles cabem em viewport 390px.
Compare/rows devem reorganizar sem cortar ações essenciais. Prints de referência
estão em `docs/GUIA_VISUAL.md`; não certificam estados atuais nem igualdade pixel a pixel.

## Aceitação sem consultar a implementação original

1. Catálogo vazio: checklist indica próximo passo sem chamada de modelo.
2. Oracle/Nop: prévia funciona sem credencial; dry-run não executa trials.
3. Ablação: remover skills de uma linha fica explícito sem alterar a outra.
4. Import: label com HTML vira texto; erro não deixa botão preso.
5. Trocar task/arquivo durante request: resultado antigo não aparece.
6. Juiz: defaults visíveis antes da sessão; edição posterior não altera sessão;
   modo validação explícito e fora do ranking.
7. Histórico/logs/export preservam identidade e não contêm credenciais.
8. Conferir teclado, viewport390, tema claro/escuro e compacto ligado/desligado.

Testes de markup/domínio não provam esses cenários em um browser reconstruído.
Registrar ensaio real antes de marcar aceitação completa.
