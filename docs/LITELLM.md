# LiteLLM: SDK e proxy

Os controles de cada provider na aba **Credenciais** usam o SDK LiteLLM dentro do ambiente
do Harbor e consultam/testam esse provider diretamente. O cartão **Gateway LiteLLM** da mesma
aba consulta um proxy configurado pelo operador. Ligar o gateway não transforma os botões dos
providers em testes do proxy.

O proxy é opcional e **OFF por padrão**. Quando `~/.harbor-eval-kit/litellm-gateway.json` está
ausente ou contém `"enabled": false`, nenhuma variável adicional entra no processo Harbor e
os controles do gateway não fazem rede. O kit não instala nem inicia um proxy. Não há proxy
real ativado ou validado nesta entrega.

## A aba Credenciais continua necessária

Com chamadas diretas, ela guarda as chaves de cada provider. Com proxy, use-a para guardar
uma **chave virtual de inferência** emitida pelo LiteLLM, no nome indicado por `inferenceKeyEnv`.
As chaves dos providers e a chave administrativa ficam na instalação do proxy. Não é necessário
copiar a chave administrativa para o kit, nem usá-la como chave de inferência. Salvar uma chave
não faz nenhuma chamada de modelo, e exportar o catálogo não exporta credenciais.

Depois de ter um LiteLLM acessível:

1. Copie `config/litellm-gateway.example.json` para o diretório de estado, ajuste os endpoints e
   mapeamentos do adapter e habilite o gateway.
2. Salve a chave virtual em **Credenciais**, usando o nome de `inferenceKeyEnv`.
3. No cartão do gateway, use a descoberta para consultar `GET /v1/models`. A lista contém os
   aliases publicados pelo proxy, sem chamada de completion. É o catálogo visível àquela chave,
   não uma garantia de saldo ou permissão de inferência.
4. Selecione e registre os aliases desejados; para o caminho OpenAI compatível eles são
   cadastrados como `openai/<alias>`. Um alias `team/code` vira `openai/team/code` no Harbor;
   a consulta e o teste do proxy preservam o alias bruto `team/code`.
5. Selecione explicitamente um alias e acione o teste pago, se quiser confirmar a inferência.
   Ele envia uma completion curta, limitada a 8 tokens. Nenhum modelo é testado automaticamente.
6. Use o modelo cadastrado em um agent cujo adapter suporte o protocolo e as variáveis
   configuradas. Valide uma task pequena antes de uma comparação maior.

Aliases descobertos não entram automaticamente na lista permitida de modelos de juiz. O
cadastro de juízes mantém sua lista curada atual; descobrir um alias não certifica esse modelo
para julgamento nem amplia a compatibilidade dos adapters.

## Contrato de configuração

O JSON contém somente nomes, endereços e placeholders. Com `enabled: true`, o kit recusa:

- JSON inválido, campos desconhecidos, nomes de ambiente inválidos ou URLs que não sejam
  HTTP(S) sem credenciais, query string ou fragmento;
- ausência dos endpoints explícitos que a topologia usa;
- placeholders desconhecidos ou endpoint referenciado sem seu campo correspondente;
- `inferenceKeyEnv` ausente, vazio ou igual a `masterKeyEnv`;
- variável sensível sem `{inferenceKey}` ou com valor literal que possa ser uma credencial.

`inferenceKeyEnv` aponta para a credencial apresentada ao endpoint de inferência.
`masterKeyEnv` identifica a chave administrativa usada para iniciar o proxy; ela não é usada
para inferência e é removida do ambiente Harbor quando a configuração está ON. As referências
devem ser diferentes. A chave de inferência do kit vive em `~/.harbor-eval-kit/secrets.env`;
a chave administrativa deve permanecer no proxy.

`hostBaseUrl` é visto pelo processo Harbor e pelas consultas da UI no host. O cartão exige esse
campo; ter somente `containerBaseUrl` não habilita a descoberta no host. As consultas acrescentam
`/v1` quando necessário, sem duplicá-lo se a URL já termina em `/v1`.
`containerBaseUrl` é visto por um agente dentro do container. `127.0.0.1` dentro do container
aponta para o próprio container: não copie esse endereço para os dois campos. O kit não inventa
um alias de rede; preencha o endereço que sua instalação realmente expõe e confirme a resolução.

O campo `env` declara quais variáveis cada adapter entende. O kit não presume que todo adapter
use `OPENAI_BASE_URL`; ajuste o mapeamento depois de conferir a documentação do adapter. Valores
podem usar `{hostBaseUrl}`, `{containerBaseUrl}` e `{inferenceKey}`. A chave mestre não possui
placeholder e não pode aparecer nessa seção. Os nomes declarados em `env` vencem valores do
provider com o mesmo nome; extras do provider não mapeados são preservados. Isso não é uma
interceptação universal de chamadas de todos os agents.

No runtime de avaliações, a chave de inferência é resolvida na ordem de prioridade: extras da
run, chave salva em `secrets.env`, ambiente do processo. Somente a referência de inferência é
lida do arquivo para esse lookup: as demais chaves salvas não entram no ambiente por isso.
O helper retorna somente extras e mapeamentos; o executor Harbor herda também o ambiente normal
do processo e remove `masterKeyEnv` quando ON. As consultas do cartão usam exclusivamente a
credencial salva indicada por `inferenceKeyEnv`.

## Consultas e diagnóstico

`GET /api/litellm/status` retorna somente `enabled`, `configured`, `inferenceKeyEnv` e
`hasCredential`. `configured` significa ON com `hostBaseUrl` presente, não serviço acessível.
Descoberta usa `GET /api/litellm/models`; teste explícito usa `POST /api/litellm/test` com
`{model: "alias"}`. São chamadas HTTP do host, sem depender do Python Harbor. O proxy recebe
Bearer com a chave de inferência. Redirects são recusados; timeout é 15 segundos e o corpo de
resposta é limitado a 1 MiB. Metadados upstream não são devolvidos e erros não reproduzem seus
corpos, chaves ou diagnósticos brutos. HTTP 401/403 orienta verificar chave/permissões.

## Topologias e retorno ao modo direto

Para comparar modelos de forma reproduzível, registre também a configuração do proxy:
qual modelo real cada alias representa, versão, fallbacks, cache e política de roteamento.
Evite alterar essas opções durante o experimento. O catálogo do kit registra o alias;
ele não congela nem audita a configuração remota do LiteLLM. Compare custos/tokens somente
quando reportados nos resultados do Harbor; o kit não deduz gastos a partir do alias.

Em um proxy no host com agentes em containers, o adapter normalmente recebe um endpoint pela
rede do container, enquanto a UI precisa do endpoint do host. Em proxy remoto, use HTTPS e o DNS
fornecido pela rede corporativa. Registre a topologia junto do experimento; configuração válida
não comprova conectividade, DNS/TLS ou compatibilidade do adapter.

Para voltar ao tráfego direto, pare o proxy por procedimento próprio, restaure o arquivo para
`"enabled": false` (ou remova-o) e confirme que a próxima execução não contém as variáveis do
gateway. OFF interrompe a injeção deste arquivo; não apaga overrides já exportados no shell ou
serviço. Remova esses overrides também, se existirem. Nenhuma chave é apagada pelo kit.

## Estado desta entrega — 2026-09-08

Plano e instruções para continuar pelo Claude: [plano da integração](PLANO_LITELLM_UI_2026-09-08.md).

A jornada foi exercitada pelo navegador em uma UI isolada: descobrir dois aliases,
cadastrar ambos, recusar teste sem seleção e testar `team/demo-quality`. O mock
registrou um GET de catálogo e um POST de chat com esse alias exato, ambos autenticados.
OFF e ausência de hostBaseUrl desabilitaram a descoberta. A leitura de status do Harbor
passou após corrigir o lookup da chave salva. A API listou somente nomes de credenciais
e o export não incluiu a credencial sintética. A suíte completa passou nos 247 testes;
83 módulos TS e 38 módulos da GUI passaram na verificação de imports/ciclos.

Além do contrato de ambiente OFF/ON, schema, placeholders e separação de chaves, 14 testes de
probe usam servidores HTTP locais efêmeros e respostas sintéticas: autenticação, aliases,
descoberta sem completion, payload pago explícito, 401/403/500, JSON inválido, redirects,
limite de corpo, timeout e não exposição de segredos. Um teste de domínio cobre o registro
`openai/<alias>` preservando barras. Nenhuma API paga ou container é necessário nesses testes.

Não houve integração com um proxy LiteLLM real, prova de tráfego de agents por ele ou certificação
de rede host/container em Windows, macOS ou Linux. Os mocks validam o contrato do cliente, não
a instalação futura do usuário. LiteLLM continua desligado na configuração local.
