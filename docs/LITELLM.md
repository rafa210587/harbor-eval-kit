# LiteLLM: SDK e proxy

O kit usa LiteLLM diretamente no botão **Test** da aba Secrets para fazer uma chamada mínima
ao provider escolhido. Esse é o SDK dentro do ambiente do Harbor; ele não passa pelo proxy.

O proxy LiteLLM é somente um ponto de integração preparado e permanece desligado. Quando o
arquivo `~/.harbor-eval-kit/litellm-gateway.json` está ausente ou contém `"enabled": false`,
nenhuma variável adicional entra no processo Harbor. Não há proxy real ativado ou validado por
esta etapa.

## Contrato de configuração

Copie `config/litellm-gateway.example.json` para o diretório de estado e edite somente nomes,
endereços e placeholders. Com `enabled: true`, o kit recusa antes da run:

- JSON inválido, campos desconhecidos, nomes de ambiente inválidos ou URLs que não sejam HTTP(S);
- ausência dos endpoints explícitos que a topologia usa;
- placeholders desconhecidos ou endpoint referenciado sem seu campo correspondente;
- `inferenceKeyEnv` ausente, vazio ou igual a `masterKeyEnv`;
- variável sensível sem `{inferenceKey}` ou com valor literal que possa ser uma credencial.

`inferenceKeyEnv` aponta para a credencial que os agentes apresentam ao endpoint de inferência.
`masterKeyEnv` identifica a chave administrativa usada para iniciar o proxy; ela não é usada
para inferência e é removida do ambiente Harbor quando a configuração está ON. As duas
variáveis devem ser diferentes e seus valores vivem em
`~/.harbor-eval-kit/secrets.env`.

`hostBaseUrl` é visto pelo processo Harbor no host. `containerBaseUrl` é visto por um agente
dentro do container. `127.0.0.1` dentro do container aponta para o próprio container, portanto
não deve ser copiado para os dois campos. O kit não inventa um alias de rede: preencha o endereço
que sua instalação realmente expõe e confirme a resolução antes de ligar.

O campo `env` declara quais variáveis cada adapter entende. O kit não presume que todo adapter
use `OPENAI_BASE_URL`; ajuste o mapeamento depois de conferir a documentação do adapter. Valores
podem usar `{hostBaseUrl}`, `{containerBaseUrl}` e `{inferenceKey}`. A chave mestre não possui
placeholder e não pode aparecer nessa seção. No ambiente final, os nomes declarados em `env`
vencem valores do provider com o mesmo nome; extras do provider não mapeados são preservados.
O valor de `inferenceKeyEnv` pode vir do ambiente do processo ou dos extras da run, com os extras
da run tendo precedência. O helper do gateway retorna somente extras e mapeamentos; o executor
Harbor herda também o ambiente normal do processo. Com o gateway ON, `masterKeyEnv` é removida
desse ambiente final antes de chegar ao runtime filho.

## Topologias e retorno ao modo direto

Em um proxy no host com agentes em containers, normalmente o adapter recebe um endpoint acessível
pela rede do container e o processo Harbor pode precisar de outro endpoint para verificações no
host. Em proxy e Harbor no mesmo container, use apenas o endereço interno correspondente. Em
proxy remoto, use HTTPS e o nome DNS fornecido pela rede corporativa. Registre qual topologia foi
usada junto do experimento; o contrato não comprova conectividade nem compatibilidade do adapter.

Para voltar ao tráfego direto, pare o proxy por procedimento próprio, restaure o arquivo para
`"enabled": false` (ou remova-o) e confirme que o ambiente da próxima execução não contém as
variáveis do gateway. OFF interrompe a injeção deste arquivo; não apaga variáveis que já tenham
sido exportadas no shell ou serviço. Remova esses overrides também, se existirem. A configuração
continua disponível para reativação; nenhuma chave é apagada pelo kit.

## Estado desta entrega

Os testes cobrem apenas o contrato local: no-op OFF, validação de schema, expansão de
placeholders, credencial de inferência, separação da master e precedência entre gateway e
`extraEnv`.
Não houve chamada de API, execução de container, integração com proxy real, validação de DNS/TLS
ou teste de endpoint em Windows, macOS ou Linux.
