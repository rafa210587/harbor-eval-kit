# Resultados, métricas e relatórios seguros

Feature `010-results-reporting`, baseline retrospectiva 2026-09-08. Depende de
003/004 para resultados de execução/julgamento e de 002 para política de segredos.

## Objetivo e stories

- **US1/P1 — Comparar resultados reais:** como avaliador, quero reward, erros,
  custo e tokens sem preencher ausências com zero nem tratar job incompleto como
  sucesso. Uma média de grupos considera a quantidade de trials de cada grupo.
- **US2/P1 — Interpretar o juiz:** quero distinguir pass/fail/não aplicável de
  julgamento desconhecido ou incompleto; só o último lote completo é pontuado.
- **US3/P1 — Compartilhar relatório:** quero JSON/CSV sem credenciais mesmo se
  alguém colou segredo em rótulo, erro ou campo aninhado; strings CSV não executam
  fórmulas quando abertas em planilha.

## Requisitos

- **FR-001** Ler `result.json` canônico, validar forma, contagens e conclusão;
  produzir erro explícito e preservar métricas disponíveis sem sinalizar sucesso.
- **FR-002** Reward é média ponderada por n_trials dos grupos válidos; billing
  vem de campos reportados, nunca de estimativa local de preço/token.
- **FR-003** Preservar metadados originais de análise e distinguir contagens de
  checks (denominador pass+fail) de número de trials.
- **FR-004** Omitir passRate se houver desconhecidos, trials incompletos, lote
  incompleto, falha ou modo de validação; excluir julgamentos de lotes anteriores.
- **FR-005** Distinguir custo total conhecido, subtotal reportado e ausência;
  zero explicitamente reportado permanece zero.
- **FR-006** Resolver artefato por entrada canônica, sem parsear caminho de stdout
  ou reutilizar artifact antigo de outro job.
- **FR-007** Exportar mesmas linhas em JSON/CSV, guardar ordem estável de colunas
  CSV, neutralizar fórmula apenas para strings e manter números como números.
- **FR-008** Recusar exportação inteira antes de enviar headers/download ou gravar
  qualquer um dos dois arquivos quando qualquer conteúdo for potencialmente sensível.

## Aceitação

- **SC-001:** grupos com rewards 0 (1 trial) e 1 (3 trials) resultam em 0,75;
  billing ausente não produz zero. Sem finished_at válido não há job concluído.
- **SC-002:** um pass e um fail dão 0,5; acrescentar not_applicable não muda
  denominador; acrescentar outcome desconhecido remove passRate.
- **SC-003:** custo 0 e 0,25 em dois trials soma 0,25; se o segundo não reporta,
  custo total desaparece e subtotal/contagem reportada permanecem distinguíveis.
- **SC-004:** segredo conhecido em campo comum ou aninhado bloqueia JSON e CSV
  sem expor o valor na mensagem; strings `=1+1` são exportadas como texto.

Não há intervalo de confiança, significância estatística, imputação de custo,
consenso de juízes ou reconstrução do ambiente a partir de relatório. Exportar
catálogo e exportar resultados são contratos diferentes; o bundle de catálogo
não inclui secrets.env nem os diretórios de tasks.
