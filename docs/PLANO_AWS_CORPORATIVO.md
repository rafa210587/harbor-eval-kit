# Plano AWS corporativo — infraestrutura mínima

**Somente planejamento. Não há implantação AWS implementada ou validada.** Pedido confirmado
em 2026-09-07: documentar o caminho corporativo e mencioná-lo no README, sem provisionar.

## Objetivo e ponto de partida

Disponibilizar a mesma plataforma de evals em ambiente corporativo, com acesso controlado,
containers Podman e baixo custo quando ociosa. O primeiro alvo é um piloto com operador
confiável. Acesso simultâneo de pessoas com permissões diferentes exige trabalho adicional
de aplicação; não é resolvido simplesmente colocando a UI atrás de uma VPN.

Hoje o servidor escuta somente loopback, guarda cadastros/segredos por instalação e permite
executar código de tasks. Não tem login de aplicação, RBAC ou isolamento por equipe. O socket
Podman confere controle dos recursos do usuário que o opera e deve ficar restrito ao
controlador confiável, nunca aos containers do benchmark.
[Modelo de segurança Podman](https://docs.podman.io/en/stable/markdown/podman-system-service.1.html).

## Arquitetura inicial proposta

```text
Operador com identidade corporativa
           │ sessão autenticada, túnel SSM
           ▼
EC2 Linux x86_64 — UI em loopback
  ├─ controlador UI + Node + Harbor pinado
  │    └─ socket Podman rootless do usuário de serviço
  ├─ containers de trials, separados do controlador
  ├─ EBS criptografado: estado, jobs, snapshots, manifest
  └─ saída corporativa autorizada → APIs de modelos e registries
```

- Uma EC2 Linux sob usuário de serviço dedicado, concorrência inicial 1. Dimensionar CPU,
  memória e disco pela task mais pesada, não pela leveza da GUI. Começar avaliando x86_64;
  Graviton só após confirmar imagens/toolchains e equivalência de arquitetura.
- Planejar container do controlador com versões fixadas e volumes explícitos. Containers
  dos trials são irmãos no Podman do host; não instalar Docker nem rodar runtime aninhado.
  Validar paths do host/container/VM, bind mounts e API/Compose antes de adotar o empacotamento.
- Reutilizar VPC, egress, identidade e observabilidade corporativos existentes. A UI e o
  socket não são publicados na internet. Manter Host/Origin guards, não removê-los para
  acomodar proxy; acesso pelo túnel deve preservar o contrato loopback e a porta esperada.
- Acesso inicial via IAM/federação corporativa e Session Manager port forwarding. SSM
  permite acesso sem portas de entrada; isso não cria autorização dentro da aplicação.
  [Session Manager](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager.html).

## Rede e isolamento

Preferir instância privada na rede corporativa existente. Endpoints privados do SSM resolvem
conectividade com o serviço AWS, mas não fornecem saída para DeepSeek, registries ou gerenciadores
de pacotes. Mapear o egress HTTPS pelo proxy/firewall/NAT autorizado e incluir seu custo incremental.
[Endpoints SSM](https://docs.aws.amazon.com/systems-manager/latest/userguide/setup-create-vpc.html).

Se a empresa ainda não tiver esse caminho, comparar custo/risco das opções com a equipe de
infraestrutura. Não criar NAT dedicado automaticamente nem pressupor saída gratuita. Conservar
separação entre a rede de controle e trials; não montar credenciais AWS, socket ou secrets do
controlador em tasks. Restringir acesso dos trials ao metadata service e ao plano de controle;
provar a restrição com teste antes de executar código não confiável.

Credenciais de provider continuam fora do repositório e entram apenas no ambiente necessário.
Na implantação futura, buscar a fonte corporativa de segredos aprovada, restringir permissões
locais e remover valores sensíveis dos logs. Não colocar segredo em imagem, argumentos de processo ou template de IaC.
Registrar autorização de envio dos dados corporativos ao provider antes de usar benchmarks internos.

## Dados, disponibilidade e operação

- EBS criptografado persistente para cadastros, manifest, jobs e snapshots. Política explícita
  de retenção e delete-on-termination; preservar dados quando o host for substituído.
- Backup com retenção limitada e teste de restauração, separando resultados/config de segredos.
  Evitar duplicar indefinidamente caches de imagem, logs e snapshots; cleanup segue manifest.
- Inicialização por serviço do SO, health checks e logs com retenção. Shutdown consulta fila,
  execução do agente e análise do juiz; não desligar com base apenas em CPU baixa.
- Ligar sob demanda e parar quando não há trabalho. EC2 parada não cobra compute, mas EBS e
  outros recursos persistentes continuam gerando custo.
  [Ciclo de cobrança EC2](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-instance-lifecycle.html).
- Começar On-Demand; Spot é opção posterior para workers com retomada comprovada. Interrupção
  muda a validade do experimento e pode desperdiçar chamadas pagas já realizadas.

## Orçamento e escolhas para reduzir custo

```text
custo mensal = horas EC2 × tarifa regional
             + EBS provisionado + backups
             + retenção/ingestão de logs
             + endpoints + egress/rede incremental
             + armazenamento de imagens, se usado
             + chamadas dos agentes e juízes
```

Comparar cenários com 40, 160 e 730 horas de compute por mês na região corporativa escolhida;
separar consumo de modelos do custo de infraestrutura. Medir um trial representativo antes de
escolher o tamanho; registrar memória máxima, disco, tempo e efeito da concorrência.

Não adicionar EKS, ALB, NAT dedicado, RDS, alta disponibilidade ou banco do LiteLLM ao piloto
sem necessidade medida. NAT cobra hora e processamento; IPv4 público também pode cobrar.
O orçamento deve incluir esses componentes mesmo quando a aplicação estiver ociosa.
[Preços de rede AWS](https://aws.amazon.com/vpc/pricing/).

Não fixar um valor mensal “mínimo” sem região, perfil de task e rede corporativa. Usar a
[AWS Pricing Calculator](https://calculator.aws/) com premissas registradas; configurar
orçamento/alerta na futura implantação, sem apresentá-lo como limite automático rígido.

Fargate não é o primeiro alvo: o executor atual precisa criar/buildar containers por uma
interface compatível com a do host. Fargate não oferece o mesmo modelo de controle e restringe
modo privilegiado; migrar exige outro executor e validação de equivalência.
[Restrições Fargate](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/fargate-tasks-services.html).

## Evolução para equipe

Antes de liberar acesso compartilhado com permissões distintas:

1. Definir identidade/SSO, papéis de administrador, operador e leitor, autorização por rota
   e proteção de sessões. Gateway autenticado sozinho não isola chaves/cadastros/experimentos.
2. Adicionar identificação do autor e auditoria das ações, quotas e namespaces por equipe.
   Port forwarding SSM não registra conteúdo de sessão e não substitui auditoria da aplicação.
   [Limites de logging SSM](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-logging.html).
3. Separar API/UI do executor, com fila e admissão de trabalho, limites de concorrência e
   processos supervisionados. Definir isolamento entre usuários e tasks não confiáveis.
4. Somente então avaliar workers elásticos e disponibilidade contínua. Reaproveitar serviços
   corporativos existentes quando reduzirem operação e custo.

## LiteLLM futuro

Proxy permanece **desligado** na entrega local. Futuro piloto pode usar gateway corporativo
existente. Inferência usa chave restrita; chave administrativa fica no gateway. Recursos
como virtual keys e budgets persistentes têm dependências próprias, incluindo banco; não
incluí-los gratuitamente na arquitetura por assumir que o SDK já é um gateway completo.
[Virtual keys LiteLLM](https://docs.litellm.ai/docs/proxy/virtual_keys).

Registrar alias → modelo real e configuração do gateway no experimento sem secrets. Cache,
fallback e roteamento devem ser fixados/desligados para a comparação, salvo quando forem o
objeto avaliado. Validar endereço acessível por host e container e separar billing reportado
pelo Harbor de métricas da gateway.

## Plano futuro de implantação e aceite

1. Definir região/residência de dados, conta/VPC, egress, identidade, número de usuários,
   retenção e concorrência; preencher estimativa de custo com premissas.
2. Preparar IaC com tags/ownership, least privilege, parâmetros de rede e comandos de
   start/stop/backup/dry-run. Nenhum desses recursos é criado nesta rodada.
3. Empacotar controlador, confirmar paths/socket e completar doctor + oracle/nop.
4. Validar montagem/env/labels, falha e cancelamento, isolamento do metadata/socket,
   reinício sem perder resultados e restauração de backup.
5. Testar acesso autorizado/negado, logs sem secrets, execução concorrente limitada,
   desligamento sem jobs ativos e o custo real do piloto.
6. Atualizar README para “implantação disponível” somente depois de execução comprovada.

Este plano foi elaborado com código local e documentação oficial consultada em 2026-09-07.
Sem conta/recursos AWS acessados, sem provisionamento e sem teste de implantação.
