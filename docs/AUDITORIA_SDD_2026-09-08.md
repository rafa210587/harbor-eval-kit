# Auditoria de suficiência das specs

## Veredito

**As seis specs de 48356f0 não eram suficientes como receita autônoma de reconstrução.**
Eram um mapa útil, mas deixavam decisões observáveis para quem lesse o código.
O problema não era o número seis: faltavam contratos, algoritmos, casos negativos,
formatos persistidos e aceitação detalhada.

A revisão organiza **12 capacidades**, com spec/plan/tasks e contratos adicionais
para 001–005. Fecha lacunas documentais identificadas, sem afirmar que a aplicação
foi recriada apenas a partir desses textos. A prova independente está definida em 012.

## Método e universo

Referência: `48356f021dc5d6649bb9b36e7982b7383016b511`. Inspeção de fontes, testes,
rotas, wrappers, adapters Python, GUI, configuração, fixtures e runbooks; revisão
separada de runtime/experimentos/juízes, tasks/providers e operações/resultados.

O [inventário](../specs/coverage.json) contém **215 arquivos**, incluindo **41 arquivos
de testes**, e **64 rotas de API**: 36 declarações literais e 28 geradas pelos sete
registries. Cada item tem uma spec responsável. Index e assets CSS/JS estão em 011,
fora da contagem de API. As **16 abas** estão detalhadas em 005. Módulos compartilhados
aparecem uma vez; rotas são classificadas individualmente. Segurança 011 é transversal.

Esses números medem rastreabilidade, **não porcentagem de completude funcional**.
Documentação e auditoria ficam fora da contagem de implementação; jobs, estado privado
e credenciais nunca são pacote de reprodução. Fixtures Java/TypeScript/Python recebem
dono 007, mas não viram benchmarks calibrados por constarem no inventário.

## Lacunas e correções documentais

| Área | O que faltava ou estava impreciso | Correção |
|---|---|---|
| Runtime | manifest/locks, identidade, socket, bootstrap Python e topologias recusadas | 001/contracts.md; remove READY indevidamente atribuído aos wrappers |
| Cadastros | PUT vs import, corrupção, IDs, campos opcionais e extraFiles | 002/contracts.md; corrige destino da materialização de skills |
| Experimentos | custo ponderado/fallback, guarda5/6, nomes/limites, snapshot parcial, dry-run com escrita | 003/contracts.md |
| Juiz | sessão/perfil/ad hoc, rubric default real, lock ancestral/filho, UUID, timeout, exit0 sem artefato | 004/contracts.md |
| UI | todas as abas, init parcial, checklist, storage, escape no DOM, estados e visual | 005/contracts.md |
| Tasks/datasets | editor, descoberta, templates, pins, download e falhas parciais | nova 007 |
| Providers | descoberta vs teste, prefixos, limites, gateway OFF/ON e master key | nova 008 |
| Operações | fontes de log, offsets/UTF-8, viewer/stop, polling e reinício | nova 009 |
| Resultados | contagens, médias, N/A/unknown, custo parcial, lote e CSV | nova 010 |
| Segurança | Host/Origin, body, assets, paths, redactor incremental e ambiente | nova 011 |
| Entrega | fixtures, CI, hooks, line endings, inventário e prova independente | nova 012 |

## Limitações reais do produto

Estes pontos **não foram corrigidos no código nesta entrega documental**. São
comportamentos atuais ou dívidas, não garantias ideais para repetir inadvertidamente.

| Ponto e evidência | Consequência / decisão futura |
|---|---|
| Pins por path literal fora do grafo de referências — tasks.ts e task/rubric-default | Normalizar identidade e validar IDs exige migração; hoje usar path retornado pela API |
| Editor permite diretório local existente — gui-server.ts task/detail | Ferramenta de usuário local confiável; não alegar confinamento a evals/ nem expor multiusuário |
| Arquivos/pins e import entre listas não são transação única — tasks.ts, bundle.ts, tasks.js | Falha de I/O exige releitura/reconciliação, sem promessa de rollback global |
| UI reconhece google/, probe exige gemini/ — catalog.ts, provider-probe.ts | Uniformizar alias com teste de integração específico |
| Parser admite custo negativo finito e término com string não vazia — results.ts | Endurecer validação, sem converter erro em zero ou alegar validação ISO existente |
| Grupos de reward não precisam cobrir todos os trials — results.ts | Conferir/expor cobertura antes de tratar média como resultado completo |
| logs/tail transforma offset inválido em zero, operations recusa — gui-server.ts | Harmonizar futuramente; cliente precisa conhecer diferença atual |
| Locks Analyze por processo, viewer não recupera handles — analysis-lock.ts, viewer-process.ts | Reinício permite observação, não adoção automática de controle nem garantia multi-servidor |
| Filesystem não é cofre/ACL corporativa nem imune a corridas locais — paths.ts, secrets.ts | Não converter segurança local em alegação de isolamento multiusuário |

Os arquivos `.ts` acima ficam em scripts/lib salvo gui-server.ts em scripts/;
tasks.js fica em gui/app/. Os contratos novos mostram limites e recusas concretas.

## Prova de reprodução ainda necessária

1. Implementador isolado usa specs/contratos e fixtures públicas, sem consultar código
   original para decidir comportamento; revisor separado compara efeitos.
2. Pergunta não respondida vira gap documental antes de improvisar equivalência.
3. Gate offline, instalação limpa e smoke real rodam na **nova implementação**;
   resultados da baseline não são atribuídos a ela.
4. Jornadas e erros são exercitados no browser; chamadas pagas somente por pedido
   explícito, com custos reais. AWS permanece plano.

Não executados nesta auditoria: reconstrução independente, instalação nova no Claude,
novos smokes, modelos/juízes pagos, gateway LiteLLM ou AWS. O gate local verifica o
código existente, imports e scanner; o CI do commit registra a publicação.
Gate repetido nesta auditoria: **231/231 testes**, imports de **80 módulos TS e
36 módulos GUI** sem ciclos e scanner completo aprovados. Inventário e links de
45 documentos conferidos sem divergências. Logs locais:
`jobs-test/sdd-audit-gates.log` e `jobs-test/sdd-audit-coverage-validation.json`,
não distribuídos no clone. O catálogo de referência contém somente dados públicos.

## Manutenção

Ao mudar código, atualizar spec/contrato e coverage.json. Reenumerar com
`git ls-files -- scripts gui config Harbor_install .claude .github .githooks evals .gitattributes .gitignore AGENTS.md CLAUDE.md`.
Conferir addRoute em gui-server.ts, experiment-routes.ts e experiment-log-routes.ts;
expandir registryRoutes nos sete registries. Revisar semântica mesmo se a quantidade
de arquivos/rotas não mudar. auditedSourceCommit identifica a revisão inspecionada;
não o substituir pelo HEAD novo sem nova auditoria. Inventário não é checker automático.
