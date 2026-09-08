# Contratos de cadastro e bundle

Complemento normativo da baseline; tipos estão resumidos em plan.md. Segurança de
transporte/caminhos é 011; providers/gateway são 008; materialização de snapshots
de skills é 003, não `materialize.ts` (que atualmente materializa rubricas/prompts).

## Validação de dados

Registry é uma lista JSON em `<state>/registries/<nome>.json`. Arquivo ausente vira
lista vazia; JSON inválido ou objeto em vez de lista lança erro e preserva o arquivo.
Não transformar corrupção em catálogo vazio e sobrescrevê-lo no próximo POST.
Escrita usa arquivo temporário exclusivo no mesmo diretório e rename. Não há lock
global de CRUD nem transação entre todos os registries.

ID: 1–128 caracteres ASCII, primeiro alfanumérico, restante alfanumérico/underscore/hífen.
Rejeitar campos desconhecidos, arrays no lugar de objeto e tipos sem coerção.
Campos exigidos: label em todos exceto criteria (name); models exige value;
agents/judges exigem agentValue; skillsets exige skillIds[], rubrics exige criterionIds[].
Skills exige mode authored/path; path não vazio obrigatório em modo path.
Strings opcionais, quando presentes, precisam ser strings. Arrays de IDs validam
cada ID; o validador de entry não elimina automaticamente IDs repetidos na lista.
`description`/`guidance` de critérios não são obrigatórios no cadastro atual;
materializador serializa ausência como vazio. Não supor que cadastro garante boa rubrica.

Referências verificadas no snapshot inteiro:

| Origem.campo | Destino |
|---|---|
| skillsets.skillIds | skills |
| agents.modelId | models |
| agents.defaultSkillsetIds | skillsets |
| rubrics.criterionIds | criteria |
| judges.modelId | models |
| judges.defaultRubricIds | rubrics |

Pins de task não fazem parte desse grafo; ver limitações em 007. Strings modelId
vazias não criam referência, mas a execução ainda precisa resolver um modelo quando
o adapter o exige. ModelEntry.value é texto de configuração; o CRUD não consulta
provider nem comprova disponibilidade de modelo.

## Arquivos extras de skills

extraFiles é lista de objetos somente `{name,content}`; content string. Nome usa
barras `/` relativas, sem barra inicial, backslash, `:`, controle, segmento vazio,
`.`/`..`, espaço/ponto final em segmento, nomes reservados Windows CON/PRN/AUX/NUL/
COM1–9/LPT1–9 (inclusive extensão) nem SKILL.md na raiz. Recusar colisões sem
distinguir maiúsculas e caminho de arquivo que seja prefixo de outro arquivo.
Não confundir validar nome com copiar o diretório: freeze das skills acontece em 003.

## CRUD

Aplicado a agents/models/skills/skillsets/criteria/rubrics/judges:

| Método | Semântica e resposta |
|---|---|
| GET `/api/<registry>` | 200, array de entries |
| POST `/api/<registry>` | objeto, UUID novo substitui eventual id do body; valida snapshot; 201 entry |
| PUT `/api/<registry>/:id` | merge raso com entry atual, ID da URL prevalece; 200 entry; ausente 404 |
| DELETE `/api/<registry>/:id` | ausente 404; referência existente bloqueia com 400; 200 `{ok:true}` |

PUT não substitui entry inteira: omissão mantém campos antigos. Para limpar listas,
enviar `[]`; `null` não remove string opcional e falha validação. Erros estruturais
recusam antes da escrita. O grafo de referências cobre registries, não todo histórico.

## Bundle v1

GET `/api/config/export` retorna `{version:1,exportedAt,registries}` após validar
snapshot e `assertSafeExport`. POST `/api/config/import` recebe esse objeto; exige
version===1 e registries objeto. exportedAt não é usado como chave de merge.
Não exigir todas as sete listas no import: bundle parcial é aceito.

Algoritmo: carregar sete listas; para cada registry recebida conhecida, validar
lista e IDs únicos do payload, aplicar upsert por ID em Map preservando outros IDs.
Registry desconhecida gera warning e é ignorada. Validar snapshot mesclado inteiro
e todos os destinos antes de escrever listas alteradas. Erro de validação não
escreve; falha de I/O durante múltiplas trocas pode deixar resultado parcial.

Retorno `{added,updated,byRegistry,warnings}`; byRegistry contém `{added,updated}`
por lista recebida conhecida. updated conta ID existente, mesmo se conteúdo igual.
O import substitui o objeto inteiro pelo entry recebido para aquele ID, ao contrário
do merge raso do PUT. IDs locais não recebidos são preservados.

Bundle não copia tasks, arquivos de skills modo path, jobs, segredos ou pins por
caminho. Import não é restauração do estado total. A UI importa no change do input,
mostra resumo/avisos, chama refreshAll e limpa input para permitir reimportar.

## Aceitação independente

Usar estado temporário e IDs sintéticos: criar skill→set→agent; remover skill deve
falhar enquanto referenciada. PUT label mantém defaults; import entry do mesmo ID
sem defaults os remove. Bundle inválido com uma lista boa e outra referência ausente
não escreve nenhuma lista. Bundle parcial válido não apaga as demais. Corrupção
preexistente deve ficar intacta. ExtraFiles `A.txt`/`a.txt` e `a`/`a/b` devem falhar.
Esses cenários são cobertos por registry-validation, registry-service, bundle e state
tests; a reprodução deve demonstrar seus efeitos, não apenas repetir mensagens.
