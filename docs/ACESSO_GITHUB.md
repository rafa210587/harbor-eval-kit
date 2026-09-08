# Login GitHub para avaliações de repositório

Em **Credenciais → Acesso ao GitHub**, verifique o login usado para buscar specs, commits e PRs. Ele é independente da conexão do harness e das credenciais de inferência. Para pastas locais, esse login não é necessário.

1. Instale Git e GitHub CLI (`gh`) no computador que executa o serviço.
2. Nesse computador e com o mesmo usuário do serviço, execute `gh auth login --hostname github.com` e siga o login interativo. Prefira o armazenamento seguro de credenciais oferecido pelo CLI; não copie tokens para o repositório.
3. Para uma organização, autorize o SSO e confirme que essa conta pode ler o repositório e o PR. Uma conta autenticada não garante acesso a todos os repos.
4. Na UI, informe `owner/repo` e clique **Verificar acesso GitHub**. O diagnóstico consulta a API e executa `git ls-remote` com o helper do `gh`, sem escrever no GitHub. Sem repositório, verifica apenas a identidade autenticada. A UI informa o resultado sem exibir a conta ou a credencial.
5. Em **Tarefas → Repositório + spec + PR**, selecione a fonte e o PR mergeado. A resolução verifica novamente as permissões e os commits históricos necessários.

O login é o do host do serviço. Em uma instalação remota, fazer login no notebook não autentica o servidor. O fluxo atual compartilha a identidade do usuário do sistema operacional que executa a plataforma; não implementa contas GitHub individuais por visitante da UI. O diagnóstico e a referência de PR atendem **github.com**. Outros remotos HTTPS/SSH podem fornecer código pelo fluxo Git, mas isso não equivale a suporte a PRs do GitHub Enterprise.

As chamadas de aquisição usam um ambiente restrito e o login local do `gh`. Não herdam `GH_TOKEN`, `GITHUB_TOKEN`, `GH_CONFIG_DIR`, chaves de provedores ou configurações Git arbitrárias do processo. Se o seu login usa uma pasta customizada, autentique no armazenamento padrão do mesmo usuário que executa o serviço. Falhas também podem indicar rede, Git ausente ou SSO pendente; o diagnóstico não expõe o stderr do CLI.

A credencial não é copiada para receita, export, snapshot, log nem container de agente/juiz. O código chega ao agente como snapshot sem a pasta `.git`; o juiz recebe somente as evidências previstas pela avaliação. O diagnóstico não grava seu resultado ou o campo de repositório. Não há campo de token ou endpoint que devolva a sessão. Para remover o acesso, use `gh auth logout --hostname github.com` no host, considerando que outras ferramentas desse usuário também podem usar a mesma sessão.

Os testes automatizados usam probes simulados e não acessam contas. A validação local real do diagnóstico deve registrar apenas resultado e repositório consultado, nunca saída bruta de autenticação. O diagnóstico não certifica outras contas, SSO corporativo, repos privados ou sistemas operacionais que não tenham sido exercitados.

Validação local em 08/09/2026, Windows: login do `gh`, leitura da API e `git ls-remote` de `rafa210587/harbor-eval-kit` confirmados. Nenhuma credencial foi retornada ou gravada pelo diagnóstico.


![Diagnóstico de acesso GitHub pela sessão local, sem campo de token](screenshots/github-access.png)
