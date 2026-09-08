# Operações, logs e trajetórias

Feature `009-operations-observability`. Baseline retrospectiva de 2026-09-08.
Depende de 001 (runtime), 003 (experimentos) e 004 (análise). Detalha o que o
resumo de observabilidade em 004 não permitia reproduzir independentemente.

## Objetivo e stories

- **US1/P1 — Investigar falha inicial:** dado um candidato que falha antes de
  Harbor criar `job.log`, ao abrir seu acompanhamento vejo stdout/stderr capturados
  em arquivo durável, inclusive depois de recarregar a página.
- **US2/P1 — Retomar análise:** dado um analyze iniciado, ao recarregar a UI vejo
  seu estado, log e artefato; após reinício do servidor uma operação sem handle
  ativo é incerta, sem sucesso, cancelamento ou adoção de PID presumidos.
- **US3/P1 — Ler logs com segurança:** dado um segredo ou caractere UTF-8 dividido
  entre escritas, ao fazer polling não recebo fragmentos secretos nem caracteres
  corrompidos. Caminhos fornecidos pelo cliente não escapam do diretório escolhido.
- **US4/P2 — Abrir trajetórias:** dado um viewer iniciado por este servidor, posso
  acompanhar sua inicialização, abrir somente sua URL loopback e parar sua árvore
  de processos; viewers de outros processos não são adotados nem encerrados.
- **US5/P1 — Operar a GUI local:** quero consultar status, iniciar idempotentemente
  e parar apenas o servidor deste clone/porta, preservando listeners e runtimes de
  outros projetos. Status não deve iniciar uma máquina Podman.

## Requisitos verificáveis

- **FR-001** Separar três superfícies: logs nativos Harbor, logs iniciais dos
  candidatos e operações analyze/view. Os caminhos exatos constam no plano.
- **FR-002** Persistir operação antes de iniciar processo; criar ID exclusivo,
  escrever estado atomicamente e redigir metadados, resultados e logs antes do disco.
- **FR-003** Oferecer tail por offset de bytes, limite padrão 200.000 bytes,
  marcador de truncamento, tratamento de rotação e UTF-8 parcial.
- **FR-004** Restringir leitura de logs a nomes permitidos, recusar traversal,
  links simbólicos e junctions na fronteira ou abaixo dela.
- **FR-005** `running` de jobs nativos vem de `result.json`, não da memória.
  `executionUncertain` distingue registro durável de posse atual do processo.
- **FR-006** Capturar stdout/stderr em canais identificáveis; usar redaction de
  streaming antes dos writers, além de proteção de leitura para logs nativos.
- **FR-007** Viewer deve expor starting/running/failed e confirmar parada pelo
  processo real, sem transformar timeout de descoberta de URL em falha fictícia.
- **FR-008** UI deve bloquear ações concorrentes de lançamento, mostrar tempo e
  erro real, preservar descritores recuperáveis e oferecer Logs só com job existente.
- **FR-009** Expor status do runtime sem instalar ou iniciar serviços; separar
  reconhecimento da forma HTTP de comprovação da identidade do processo.
- **FR-010** Launchers bash/PowerShell exigem Node 24+, fazem preflight e executam
  GUI em foreground; stop exige script absoluto deste clone e porta correspondente,
  recusa identidade ambígua e verifica desaparecimento do processo.

## Aceitação e limites

- **SC-001:** fixture com segredo repartido em dois appends não vaza em nenhum
  offset; final UTF-8 incompleto só aparece após completar o code point.
- **SC-002:** após recriar o leitor, estado e log continuam disponíveis; operação
  running sem handle retorna incerteza. Recarga da UI não executa analyze novamente.
- **SC-003:** viewer sem URL após oito segundos permanece starting; saída prematura
  vira failed; stop desconhecido retorna 404 e não mata processo por nome/porta.
- **SC-004:** arquivos de credencial, traversal e links não são destinos de Logs;
  job iniciado por CLI é listável sem registro em memória.
- **SC-005:** processo de outro clone na mesma porta não é morto; GUI já respondendo
  não é duplicada; falha de Podman no Linux não dispara criação/start de VM.

Não há agregador remoto, retenção/rotação automática, busca full-text ou adoção
de processos órfãos. Trajetórias são apresentadas pelo Harbor e dependem dos
artefatos do adapter. A lista GET de viewers é volátil; logs de operações são
duráveis. Segurança não significa remover automaticamente segredos de arquivos
nativos escritos por ferramentas externas: a superfície de leitura os redige.
