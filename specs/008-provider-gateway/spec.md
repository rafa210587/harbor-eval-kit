# Providers, credenciais e gateway opcional

Feature `008-provider-gateway`. Baseline retrospectiva 2026-09-08. Extrai de 002
o subsistema que conecta configuração privada, descoberta, probe pago e ambiente
do gateway. A simples menção a LiteLLM não determina esses contratos.

## Histórias e critérios de aceitação

- **US1 (P1):** usuário salva credencial; API/UI retornam somente nomes, formulário
  é limpo e nenhuma inferência é disparada automaticamente.
- **US2 (P1):** usuário descobre catálogo do provider; consulta não chama completion.
  IDs normalizados podem ser selecionados e registrados, existentes ficam marcados
  e desabilitados. Catálogo vazio oferece cadastro manual em Modelos.
- **US3 (P1):** usuário escolhe modelo cadastrado explicitamente e aciona teste pago;
  ausência/modelo de outro provider falha antes do processo. UI avisa gasto antes
  do clique; resultado identifica modelo exato ou diagnóstico redigido.
- **US4 (P2):** operador deixa proxy OFF; execução não recebe redirecionamento.
  Configuração ON válida expande URLs e chave de inferência; configuração inválida
  falha com diagnóstico e jamais degrada silenciosamente para OFF.
- **US5 (P1):** chave administrativa do proxy não entra no ambiente adicional de
  agentes; gateway vence somente variáveis mapeadas e não altera infraestrutura.

## Requisitos

- **FR-008-01:** catálogo canônico server-side serve provider `id,label,prefixes,
  envKey`; consumidores não duplicam branches para cada provider. IDs seguem
  `custom_llm_provider` LiteLLM. Provider sem chave simples tem `envKey:null`.
- **FR-008-02:** secrets vivem fora do repo em `secrets.env`, nunca em argv,
  respostas, export ou logs. Contrato completo de export está em 002.
- **FR-008-03:** descoberta e teste são modos separados, sem modelo pago default.
  Timeout externo 30s; completion limitada a 8 tokens e timeout SDK 20s.
- **FR-008-04:** gateway é preparação de ambiente; não instala, inicia, autentica
  nem verifica disponibilidade de serviço proxy. Nenhuma implantação AWS.
- **FR-008-05:** endpoint HTTP(S) não admite user/password/hash; templates e nomes
  de ambiente são validados antes de execução; segredo vem de referência privada.
- **FR-008-06:** UI bloqueia ação pendente, mostra erros reais e distingue descoberta
  de acesso confirmado ao modelo. Registro de lote é sequencial e não transacional.

## Fora de escopo e limites

Descobrir modelo não garante quota, saldo ou autorização de completion. Catálogo
fixo e aliases de modelo mudam externamente e precisam revisão explícita. Prefixo
`google/` reconhecido pela UI para Gemini não passa no probe que exige `gemini/`;
esta divergência é registrada como gap, não ocultada como compatibilidade garantida.
Controles de domínio do gateway não são sandbox de todos os processos: executor
também deve respeitar separação de segredos e sua própria política de ambiente.

## Sucesso

Reconstrução deve demonstrar US1–US5 com fixtures sem credenciais reais e gate
offline, depois validar provider/proxy real somente em execução autorizada. Esta
auditoria não fez chamada paga, não ligou proxy e não certifica todos providers.
