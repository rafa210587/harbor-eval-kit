# Checklist vigente de jornadas da UI

Este é o roteiro manual atual para a GUI local. Ele usa os nomes visíveis hoje: **Começar**,
**Novo experimento**, **Tasks**, **Modelos**, **Agentes**, **Skills**, **Conjuntos de skills**,
**Critérios**, **Conjuntos de critérios**, **Juízes**, **Credenciais**, **Datasets**,
**Configuração**, **Logs**, **Trajetórias** e **Análise avulsa**.

Não há números de abas no roteiro. Marque `[x]` somente depois de clicar na UI, conferir a
resposta e verificar o artefato indicado. Evidência anterior deve ser consultada em
[Jornadas reais da UI](./JORNADAS_REAIS_UI_2026-09-07.md), [Validação da plataforma](./VALIDACAO_PLATAFORMA_2026-09-07.md)
e [Auditoria de entrega](./AUDITORIA_ENTREGA_2026-09-07.md); são registros datados, não uma
autorização para repetir chamadas pagas.

Legenda: ✅ evidência manual datada; 🔶 API, fixture ou contrato offline; ⬜ pendente de interação.

### T1.1 Preparação

- [ ] Subir `bash scripts/start-gui.sh` ou `pwsh scripts/start-gui.ps1` e abrir
  `http://127.0.0.1:<porta>`. Confirmar no banner a versão/estado do Harbor.
- [ ] Usar estado isolado e uma task mínima. Para fluxo gratuito, usar `oracle` e `nop` e
  conferir reward 1 e 0, sem credencial nem chamada de modelo. ✅ Evidência: validação da plataforma.
- [ ] Antes de uma execução paga, confirmar autorização da rodada, provider/modelo explícitos,
  task, tentativas, custo estimado e imagem base preexistente. Nunca inserir segredo em campo,
  arquivo exportado, log ou argumento.

## Começar e catálogos

### T2.1 Começar

- [ ] Conferir que o checklist aponta a próxima ação e que **Continuar configuração** leva ao
  cadastro necessário.
- [ ] Acionar cada atalho **Começar** de **Comparar modelos**, **Comparar agentes**, **Avaliar
  skills** e **Modo livre**. Esperado: abrir **Novo experimento** com o modo correspondente,
  sem criar plano, trial ou container antes do envio. ⬜ A cobertura independente desses quatro
  atalhos ainda precisa ser registrada.

### T2.2 Credenciais e Modelos

- [ ] Em **Credenciais**, escolher um provider e salvar uma chave sintética. Esperado: aparece
  somente o nome do secret; `GET /api/secrets` nunca devolve o valor.
- [ ] Testar uma chave inválida. Esperado: status de erro real e mensagem visível; o botão
  destrava. Para chave válida, usar somente modelo explícito do provider e autorização para a
  chamada. ✅ Probes e descoberta constam nas jornadas reais.
- [ ] Em **Modelos**, cadastrar, editar e remover um valor `provider/modelo`. Esperado: badge da
  credencial e referências de perfis continuam tratáveis quando um modelo é removido. ✅
- [ ] Após **Testar modelo escolhido**, conferir discovery: variantes `model` e `provider/model`
  aparecem uma vez, vazios não viram erro e **Cadastrar marcados** atualiza Modelos. 🔶 Contrato
  puro e evidência de provider constam nas jornadas reais; repita com provider autorizado se
  precisar verificar o botão.

### T2.3 Agentes, Skills e conjuntos

- [ ] Em **Agentes**, criar um perfil com adapter, modelo opcional, instruções e conjunto padrão.
  Editar e cancelar edição deve restaurar o formulário sem alterar o registro. O autocomplete é
  a lista server-side de adapters registrados pelo Harbor 0.22.0; o campo continua livre para
  import path customizado/ACP.
- [ ] Em **Skills**, criar uma skill autorada, anexar Markdown e arquivo extra; repetir com uma
  pasta existente contendo `SKILL.md`. Esperado: referência de path permanece referência e o
  conteúdo autorado entra no snapshot somente ao preparar o experimento.
- [ ] Em **Conjuntos de skills**, selecionar várias skills, filtrar e limpar o filtro. Esperado:
  seleção sobrevive ao filtro e o conjunto aparece na herança do Agente.
- [ ] Em **Critérios**, criar, editar e tentar remover um critério referenciado. Esperado: a
  dependência é explicada e o registro não é apagado silenciosamente.
- [ ] Em **Conjuntos de critérios**, criar um conjunto com critérios, filtrar seleção e conferir
  que ele pode ser escolhido por Juízes e Análise.
- [ ] Em **Juízes**, selecionar adapter, modelo e vários conjuntos de critérios padrão. Editar o
  modelo preserva a seleção existente até uma mudança deliberada. **Modo validação** deve ser
  explícito e carimbar o resultado; ele não autoriza ranking.

### T3.1 Tasks e Datasets

- [ ] Em **Tasks**, criar uma task pelo wizard com organização explícita, editar os arquivos
  exibidos e salvar. Conferir no disco `task.toml`, instrução, Dockerfile e `tests/test.sh`.
- [ ] Exercitar task com vários steps e as opções de omitir templates. Esperado: steps ficam
  separados, o verifier continua exigindo saída/reward e um stub não é aprovado.
- [ ] Fixar defaults de juiz e conjuntos na task; ao usar a task em Análise, confirmar que são
  pré-selecionados sem disparar execução automática.
- [ ] Em **Datasets**, conferir listagem/descoberta recursiva, filtro por raiz de task e recusa de
  links. Baixar um dataset do Hub somente com autorização de rede; não confundir link informativo
  com cópia local validada. ✅ A descoberta e o dataset mínimo das jornadas reais têm artefatos
  próprios; download de outro dataset continua específico do operador.

### T4.1 Novo experimento

- [ ] Escolher task ou dataset, modo de comparação e candidatos. Adicionar, duplicar e remover
  linhas; conferir que contador e seleção não carregam defaults de outra edição.
- [ ] Testar os modos **Comparar modelos**, **Comparar agentes**, **Avaliar skills** e **Livre**.
  A pergunta experimental deve aparecer no texto de ajuda e a prévia deve mostrar todas as
  diferenças efetivas.
- [ ] Para modelos, manter agente/task/skills iguais e alterar somente o modelo. Para agentes,
  manter task/modelo quando compatível. Para skills, manter o candidato baseline e alterar apenas
  o conjunto. A coluna baseline deve ficar explícita.
- [ ] Ajustar tentativas e concorrência e conferir a prévia completa: tasks, candidatos, tentativas,
  volume, agente, modelo, skills, baseline e metadados persistidos.
- [ ] Conferir **Dry run**. Esperado: valida configuração e argumentos, não cria trial nem chama
  provider; o estado e o painel de saída não podem reaproveitar log de run antiga. 🔶 O contrato
  offline confirma ausência de mutação; a evidência de UI está nas jornadas reais.
- [ ] Forçar estimativa acima do teto e cancelar a confirmação. Esperado: nenhuma chamada,
  container ou novo resultado. Para combinação sem histórico, a guarda deve explicar que o custo
  é desconhecido e exigir confirmação explícita quando aplicável.
- [ ] Conferir que argumentos extras aceitam somente `--ak`/`--agent-kwarg` e
  `--timeout-multiplier`; campos de plano, credenciais aninhadas e valores conhecidos de secrets
  são recusados antes do snapshot.

### T5.1 Execução, resultados e logs

- [ ] Em uma execução autorizada, conferir botão bloqueado, tempo decorrido, log incremental,
  Cancelar e desbloqueio ao terminar. A saída stdout/stderr do candidato deve existir em
  `<jobsDir>/.experiments/<id>/logs/<candidate-id>.log` antes do `job.log` do Harbor.
- [ ] Cancelar uma run e verificar o efeito em disco e nos recursos gerenciados. Não concluir que
  parou apenas pelo exit code; preservar recursos de propriedade ambígua.
- [ ] Recarregar a página e reabrir **Novo experimento** ou o histórico. Esperado: estado é lido
  de `result.json`/`experiment.json`; processo não é retomado automaticamente e atividade órfã
  é apresentada como incerta.
- [ ] Em **Resultados**, conferir reward, erros, duração, tokens e custo somente quando reportados
  pelo Harbor. Resultado sem `finished_at`, com contagens inconsistentes ou sem checks não pode
  virar sucesso, zero artificial ou ranking.
- [ ] Baixar JSON e CSV. Esperado: linhas completas, aspas preservadas, fórmulas neutralizadas e
  nenhum secret. Inserir conteúdo sintético em notes, análise e erro deve bloquear antes de enviar
  headers ou gravar arquivo.
- [ ] Em **Logs**, listar job e arquivos permitidos, alternar acompanhamento e buscar offset.
  Esperado: caminhos fora do job, symlinks, diretórios e arquivos arbitrários são recusados;
  stdout/stderr preservam ordem, UTF-8 e redação entre chunks.
- [ ] Em **Trajetórias**, iniciar o viewer para um job local, abrir task/trial e parar. Esperado:
  somente URL HTTP loopback explícita; o viewer é leitura e não inicia nova avaliação.

### T6.1 Análise

- [ ] Após um resultado elegível, escolher juiz e um ou mais **Conjuntos de critérios** e clicar
  **Analisar** em uma linha. Esperado: sessão congela adapter, modelo, prompt, modo e todos os
  conjuntos antes do lote; a UI mostra operação, tempo, logs, resumo e checks.
- [ ] Usar **Analisar todas**. Esperado: uma chamada por candidato elegível, lote fixo e IDs de
  sessão/batch persistidos; candidato falho ou incompleto não entra silenciosamente no ranking.
- [ ] Em **Análise avulsa**, selecionar path/job, juiz e vários conjuntos. Esperado: sessão nova,
  uma chamada por conjunto, `analysis.json` canônico e todos os trials preservados em `results`;
  não depender da formatação stdout e manter todos os itens do lote.
- [ ] Marcar **Modo validação** com modelo fora da lista curada. Esperado: aviso persistente,
  `validationMode: true` no resultado e exclusão do ranking. Sem a marca, o gate deve recusar.
- [ ] Recarregar durante ou após Análise. Esperado: operação persistida e log incremental ficam
  consultáveis; não há auto-resume nem reexecução automática de itens do lote.

### T7.1 Configuração, segurança e layout

- [ ] Em **Configuração**, exportar bundle, importar em estado isolado e importar novamente.
  Esperado: upsert idempotente por ID, avisos legíveis e nenhuma seção `secrets`.
- [ ] Repetir exportação com credencial sintética em campo aninhado, texto livre, análise e
  arquivo extra. Esperado: bloqueio fail-closed antes do download/gravação, mensagem sem o valor.
- [ ] Ativar **Modo compacto** e conferir que avisos de gasto/validação, erros e ajuda continuam
  visíveis. Verificar foco por teclado e labels dos checkboxes; tema claro e leitor de tela ainda
  precisam de validação específica.
- [ ] Inspecionar a 390 px e em janela ampla. Esperado: tabela rola em seu próprio contêiner,
  formulários não cortam controles e os nomes acima permanecem legíveis.

## Execuções pagas e limites

Chamadas pagas só entram numa rodada explicitamente autorizada. Use task pequena, uma tentativa e
limites registrados no plano. Não repita candidatos, juízes ou probes cuja evidência já esteja em
[Jornadas reais](./JORNADAS_REAIS_UI_2026-09-07.md) sem pergunta nova ou defeito reproduzível.
Não trate juiz em modo validação como evidência de qualidade.

Ainda exigem evidência separada: smoke real em macOS/Linux, integração do proxy LiteLLM, todos os
adapters/modelos/providers, tema claro completo, teclado/leitor de tela completo e operação
multiusuário. O piloto validado continua restrito ao escopo descrito na [Validação da plataforma](./VALIDACAO_PLATAFORMA_2026-09-07.md);
AWS permanece somente plano.
