# Decola Negócios

App de gestão para pequenos e médios negócios — vendas, estoque, financeiro e
funcionários — com um Painel Administrativo SaaS separado.

Fonte única de verdade: `especificacao-tecnica.md` (v3.0). Toda decisão de
produto e arquitetura já está tomada lá; este repositório implementa.

## Estrutura

```
apps/mobile/        App cliente — React Native + Expo (Seção 3.1)
apps/admin/         Painel Administrativo SaaS — Vite + React (Seção 7.15)
apps/site/          Site público de contratação — Vite + React (Seção 6.3)
packages/theme/     Design tokens centralizados (Seções 2.1–2.3)
supabase/
  migrations/       Schema, RLS, triggers e RPCs
  functions/        Edge Functions (Asaas, convite por e-mail, PDF/Excel)
  tests/            Testes de RLS e regras de negócio
  scripts/          Seeds manuais (não replayados automaticamente)
```

## Fases

| Fase | Escopo | Estado |
|---|---|---|
| 1 | Fundação — schema, RLS, auth, ambiente | ✅ concluída |
| 2 | Autenticação e onboarding (Seções 5.5, 7.10–7.13) | ✅ concluída |
| 3 | Estoque e produtos (Seções 4.5/4.6, 8.3, 8.4) | ✅ concluída |
| 4 | Vendas (Seções 7.3, 7.4, 8.1, 8.2, 8.5) | ✅ concluída |
| 5 | Financeiro e relatórios (Seções 8.6, 10.2) | ✅ concluída |
| 6 | Funcionários e permissões (Seções 5.2, 5.3, 7.8) | ✅ concluída |
| 7 | Assinatura e pagamento — Asaas (Seções 6.4–6.7, 7.14) | ✅ concluída |
| 8 | Painel Administrativo (Seções 7.15, 11) | ✅ concluída |
| — | Auditoria final — Seções 7.1, 7.2 e correções do linter | ✅ concluída |

## Princípio de segurança que rege todo o código

**Nenhuma regra de negócio crítica depende do aplicativo.** Toda validação
importante — permissões, assinatura ativa, limite do plano, atualização de
estoque, cancelamento de venda, geração de movimentação financeira — é
revalidada no backend, mesmo quando a interface já validou.

Isso se materializa em três camadas independentes:

1. **Privilégio (`GRANT`)** — cada role recebe só os verbos que alguma política
   pode autorizar. Em `vendas`, `assinaturas` e `empresa_usuarios` o cliente
   não tem *nenhum* verbo de escrita: nem uma política afrouxada por engano
   abriria caminho.
2. **RLS** — isolamento por `empresa_id` e checagem da permissão exigida, em
   toda tabela, sem exceção (Seção 9.1).
3. **RPC `SECURITY DEFINER`** — operações compostas ou transacionais
   revalidam permissão, limite de plano e estado da assinatura antes de
   escrever.

Invariantes que o banco garante sozinho:

- `logs_auditoria` é imutável — sem `UPDATE`/`DELETE` para nenhum papel, e o
  privilégio está revogado além da ausência de política.
- Produtos e categorias nunca são apagados: `ativo → arquivado → excluido`.
- Vendas nunca são apagadas: cancelamento gera reversão de estoque e um
  lançamento de estorno no financeiro.
- Um usuário pertence a no máximo uma empresa (índice único parcial).
- Exatamente um Gestor Principal por empresa, não removível nem rebaixável.

## Banco de dados

Projeto Supabase: **Decola Negócios** (`nakqafnchwydfogcozvc`).

As migrations em `supabase/migrations/` estão aplicadas e numeradas na ordem de
execução. Para um ambiente novo, rode-as em sequência.

### Decisões registradas fora da especificação

Pontos que o documento não cobria e foram fechados durante a implementação:

- **`movimentacoes_financeiras.data_movimentacao`** — a Seção 8.6 dá ao
  lançamento manual um campo "data" que a Seção 4.11 não modelou. A coluna foi
  criada; `criado_em` continua registrando quando a linha foi gravada.
- **Assinatura `cancelada`** — mantém a conta em modo de consulta, com toda
  escrita bloqueada, preservando os dados da empresa.
- **Leitura do status sem trava** — `empresas` e `assinaturas` são legíveis por
  qualquer membro ativo mesmo com a conta suspensa, em modo limitado ou
  pendente de pagamento. Sem isso o app não teria como explicar ao usuário o
  motivo do bloqueio. Os dados de negócio é que ficam travados.
- **Primeira vez com Google → Escolha do Plano antes do Cadastro.** A Seção
  7.11 manda ir direto ao Cadastro, mas a Seção 7.12 exige um plano
  selecionado. O plano é escolhido primeiro; o que se pula, conforme a 7.11,
  são os campos de e-mail e senha.
- **Divergência de estoque não reinicia o ciclo de alerta.** A Seção 8.3 manda
  recalcular `estoque_referencia_alerta` "a cada reposição". O ajuste de
  divergência da Seção 8.1 é correção de contagem, não entrada de mercadoria,
  então soma ao estoque sem iniciar um ciclo novo. A auditoria distingue as
  duas (`estoque.reposicao` vs. `estoque.divergencia_ajustada`).
- **Exportação devolve os bytes, não um link.** A Seção 10.3 fala em "retorna
  um link de download". A Edge Function devolve o arquivo direto na resposta e
  o app abre a folha de compartilhamento — evita criar um bucket público e um
  ciclo de limpeza de arquivos temporários só para o download. Trocar por
  Storage com URL assinada depois é uma mudança contida.
- **Cidade no QR Code Pix.** O padrão EMV exige o campo "cidade do
  recebedor", mas `empresas` só tem `endereco` como texto livre (Seção 4.1).
  O payload usa `BRASIL` como padrão — os PSPs não validam esse campo de forma
  estrita.
- **Rótulo de funcionalidade de plano.** `planos.funcionalidades` é uma lista de
  chaves técnicas (Seção 4.12.1) e o documento não define rótulos comerciais. A
  tela humaniza a chave (`relatorios_avancados` → "Relatorios avancados") em vez
  de inventar nomes.
- **Troca agendada em `assinaturas`.** A Seção 6.7 exige que o downgrade só
  valha no próximo ciclo, mas a Seção 4.12.2 não modelou onde guardar a troca
  pendente. Foram criadas `plano_agendado_id`, `troca_agendada_para` e
  `valor_agendado`, com CHECK que impede agendamento pela metade. O valor fica
  congelado no momento da solicitação, pelo mesmo princípio da Seção 7.15.
- **`pendente_pagamento` volta para o pagamento, não para o Dashboard.** A
  tabela da Seção 7.10 só olha o vínculo e manda ao Dashboard; a Seção 7.12 diz
  que esse estado fica "sem acesso ao conteúdo do app até a confirmação". Quem
  fechou o app antes de pagar volta para `/pagamento`. Os demais estados
  bloqueados (`modo_limitado`, empresa suspensa) seguem para o Dashboard de
  propósito: neles a consulta continua liberada (Seção 6.6) e é lá que o app
  explica o bloqueio.
- **Selo de trial some no modo troca.** A Seção 7.13 mostra "N dias grátis"
  quando o trial está ligado, e reutiliza a mesma tela para troca de plano.
  Quem já assina não recomeça um teste, então o selo não aparece nesse modo.
- **Alterar senha reautentica antes.** A Seção 7.14 oferece "senha atual +
  nova". O Supabase troca a senha sem pedir a atual, então o app confere a
  atual com um `signInWithPassword` antes do `updateUser` — sem isso, um
  aparelho desbloqueado trocaria a senha da conta sem prova de identidade.
- **Preferência de notificação controla o push, não o registro.** A Seção 7.14
  define o push como "complementar/best-effort" e o registro no banco como "a
  fonte confiável". Desligar uma categoria para de enviar push; o alerta
  continua sendo gravado e aparece no sino do Dashboard.
- **`empresas.encerrada_em`.** A Seção 7.15 A pede a taxa de cancelamento do
  mês, e a Seção 6.9 define `inativa` como o status "para empresas encerradas",
  mas não havia onde guardar QUANDO isso aconteceu. Sem a coluna, o churn teria
  de adivinhar a partir de `atualizado_em`, que muda por qualquer edição.
  Preenchida ao encerrar e limpa ao reativar.
- **Painel administrativo em Vite + React.** A Seção 11.1 diz "provavelmente
  web" sem fechar a stack. É um app estático, fora do Expo, consumindo os
  mesmos tokens de `packages/theme` convertidos em variáveis CSS.
- **Troca de plano pelo painel não agenda nem bloqueia.** A Seção 6.7 rege o
  autoatendimento do Gestor (downgrade no próximo ciclo, recusado se exceder
  limites). A Seção 7.15 B dá ao administrador uma ação diferente — "troca o
  plano da empresa diretamente, fora do fluxo de autoatendimento" — então
  `admin_alterar_plano_empresa` aplica na hora e aceita um valor combinado.
  Continua sem desativar nada sozinho.
- **Auditoria de plataforma com `empresa_id` nulo.** Editar um plano ou as
  configurações do SaaS não pertence a nenhuma empresa. A coluna já era
  anulável para isso; o registro da exclusão definitiva também nasce nulo de
  propósito, porque `logs_auditoria` cascateia a partir de `empresas` e um log
  amarrado à empresa desapareceria junto com ela.

### Rodando os testes

```sql
-- No SQL Editor do Supabase, com privilégio de service role:
\i supabase/tests/rls_fase1.sql
\i supabase/tests/onboarding_fase2.sql
\i supabase/tests/estoque_fase3.sql
\i supabase/tests/vendas_fase4.sql
\i supabase/tests/funcionarios_fase6.sql
\i supabase/tests/assinatura_fase7.sql
\i supabase/tests/administrativo_fase8.sql
\i supabase/tests/dashboard_auditoria.sql
```

Os scripts rodam em transação e fazem `ROLLBACK` no fim — não deixam resíduo.
Cada linha do resultado é uma asserção; procure por `FALHA` na saída.

`rls_fase1.sql` cobre isolamento multi-tenant, imutabilidade da auditoria,
permissões granulares por coluna, alerta de estoque, limite de plano,
imutabilidade do Gestor Principal e as regras de modo limitado da Seção 6.6.

`onboarding_fase2.sql` cobre o provisionamento de conta pelo trigger, a leitura
de planos pela role `anon` (a tela de Escolha do Plano é pré-autenticação), as
validações do botão "Criar conta" e os dois desfechos da assinatura conforme o
trial esteja ligado ou desligado.

`estoque_fase3.sql` cobre a geração da chave técnica de campos personalizados,
a validação de atributos por tipo e obrigatoriedade, o ciclo de alerta com o
exemplo literal da Seção 8.3, as guardas do ajuste de estoque e o ciclo de vida
do produto.

`vendas_fase4.sql` cobre a venda feita por um Funcionário sem `gerenciar_estoque`,
o cálculo de preço e desconto pelo servidor, as guardas de estoque e desconto, e
a reversão completa do cancelamento pelos dois caminhos da Seção 8.5.

`funcionarios_fase6.sql` cobre a validade e o reenvio do convite, o aceite, a
promoção e o rebaixamento, as permissões individuais, a imutabilidade do Gestor
Principal, o limite de funcionários do plano e a remoção que preserva o
histórico.

`assinatura_fase7.sql` cobre o fechamento da escrita direta em `assinaturas`, a
exclusividade de `gerenciar_assinatura`, as guardas da troca de plano, o
downgrade recusado com a lista literal do excesso, o upgrade imediato, o
downgrade agendado e desfeito, o job diário de expirações (trial, carência e
downgrade vencido) com idempotência, e as regras de escrita do modo limitado.

`administrativo_fase8.sql` cobre o isolamento do painel (nenhuma RPC `admin_*`
aceita usuário de empresa), o fechamento de `planos` e `configuracoes_plataforma`
ao cliente, a auditoria das entidades de plataforma, a ativação manual com os
três desfechos de e-mail, o status da empresa e o churn, o período de teste por
empresa, as métricas e a exclusão definitiva com confirmação.

`dashboard_auditoria.sql` cobre o resumo dos quatro cards, o badge do sino, a
central de notificações unindo as duas tabelas com o filtro por destinatário, e
a gravação da chave Pix — sem a qual o "Gerar Pix" da Seção 7.4 nunca funciona.

**Duas armadilhas ao ler os resultados:**

1. Dentro de um mesmo statement, todas as ramificações de um `UNION ALL`
   enxergam o snapshot do início do statement. Verificações de efeito colateral
   (auditoria, estoque final) precisam ficar em statements separados das ações
   que as produzem — caso contrário parecem falhar sem estarem falhando.
2. A RLS barra `UPDATE` e `DELETE` **em silêncio**: 0 linhas afetadas, sem
   exceção. Um teste que só pergunta "deu erro?" dá falso negativo. O helper
   `bloqueado_em_silencio()` da Fase 7 confere o `row_count`, que é o que
   realmente prova o bloqueio.

Um detalhe do modelo que aparece nos testes: **um convite pendente não é
legível pelo próprio convidado** — a política `empresa_usuarios_leitura` casa
por `usuario_id` ou por empresa, e quem ainda não aceitou não tem nenhum dos
dois. No app isso não é problema: o aceite passa pela RPC `aceitar_convite`
(SECURITY DEFINER), que recebe o id pelo link do e-mail. Nos testes, o
resolvedor `pg_temp.vinculo()` faz esse papel.

### Edge Functions do painel

`admin-criar-empresa` (`verify_jwt=true`) faz a ativação manual da Seção 6.9.
Existe por um motivo só: criar a conta do responsável quando o e-mail ainda não
existe exige a Admin API do Auth, e portanto a service key — que nunca pode
viver no navegador. A parte transacional continua sendo da RPC
`admin_criar_empresa`, que revalida a autorização sob a identidade de quem
chamou. Secret opcional: `URL_APP_BASE`, que troca o esquema do app por um
endereço web no link de definição de senha enviado ao responsável — o destino é
o aplicativo, não o painel, porque quem recebe é o dono da loja.

## E-mail

O projeto envia e-mail por **dois caminhos independentes**, e é isso que causa
mais confusão do que qualquer outra parte da configuração: acertar um não
acerta o outro.

| Caminho | Quem envia | O que sai por ele |
|---|---|---|
| **Supabase Auth** | o próprio Supabase | confirmação de cadastro, redefinição de senha, link de acesso do responsável |
| **Edge Function `enviar-convite`** | a API do Resend, chamada pelo nosso código | convite de funcionário (Seção 5.2) |

Os dois usam o Resend no fim, mas por portas diferentes: o Auth por **SMTP**, a
Edge Function pela **API**. Cada um tem a sua credencial.

### 1. Supabase Auth — SMTP

Sem isto, o Auth usa o remetente de testes do próprio Supabase, que é limitado
a poucos envios por hora e cai em spam. É a causa mais comum de "o e-mail não
chega".

Dashboard → **Authentication → Emails → SMTP Settings** → *Enable Custom SMTP*:

| Campo | Valor |
|---|---|
| Host | `smtp.resend.com` |
| Port | `587` |
| Username | `resend` |
| Password | a API key do Resend (a mesma de `RESEND_API_KEY`) |
| Sender email | `negocios@decola.pro` |
| Sender name | `Decola Negócios` |

Depois, em **Authentication → Rate Limits**, suba *"Emails sent per hour"* — com
o SMTP do Supabase o teto é baixo por design; com SMTP próprio quem limita é o
plano do Resend (3.000/mês, 100/dia no gratuito).

E em **Authentication → URL Configuration → Redirect URLs**, adicione
`decolanegocios://redefinir-senha`. Sem isso o Auth ignora o destino do link e
joga a pessoa na Site URL.

### 2. Edge Function — API

Secrets do projeto (Dashboard → **Edge Functions → Secrets**). Sem eles a função
responde 503 com mensagem clara, e o convite continua criado no banco para ser
reenviado depois:

- `RESEND_API_KEY` — credencial do provedor de e-mail.
- `EMAIL_REMETENTE` — remetente no domínio verificado, no formato
  `Decola Negócios <negocios@decola.pro>`.
- `URL_CONVITE_BASE` — base do link de aceite. Sem ela cai no esquema do app
  (`decolanegocios://convite/<id>`), que funciona no dispositivo mas é
  bloqueado por vários webmails. O ideal é uma página web que redirecione.

### Os dois domínios, e por que não é um só

Há uma divisão deliberada aqui, e vale entendê-la antes de "simplificar":

| | Domínio | Onde aparece |
|---|---|---|
| **Envio de e-mail** | `decola.pro` | Só no remetente: `negocios@decola.pro` |
| **Parte pública** | `site-kappa-five-66.vercel.app` | Links de plano e as lojas dos clientes |
| **O produto** | `decolanegocios.vercel.app` | Onde se entra; destino dos e-mails de acesso |

A razão é o que acontece quando um domínio comprado não é renovado. Endereço de
loja é link que o lojista imprime no balcão, cola na bio do Instagram e manda no
WhatsApp dos clientes dele; link de plano é link que fica salvo numa conversa
até a pessoa decidir. Se o domínio vence, todos eles viram erro de uma vez — e
quem sofre não é a plataforma, é o cliente do cliente.

Remetente de e-mail não tem esse problema: o link dentro do e-mail é clicado em
minutos e expira sozinho. Se um dia o domínio mudar, basta trocar o remetente;
nenhum link antigo dependia dele.

O domínio da Vercel, em troca, não vence nem exige renovação, e continua
respondendo mesmo depois de um domínio próprio ser apontado para o projeto —
ou seja, adotar `decola.pro` no site mais tarde é aditivo, não substitui.

Sobre a escolha de `decola.pro` para o envio: antes dele o e-mail saía de
`decolamed.online`, o domínio da Decola Med — o que funcionava, mas misturava
numa reputação de envio só duas operações que não têm relação entre si. Com
domínio próprio, um problema de entrega de um produto não contamina o outro.

Um endereço por produto no mesmo domínio, e não um subdomínio por produto: a
reputação segue sendo do domínio, e mantê-la única concentra o volume — o que
ajuda a entrega enquanto o volume é baixo. Se algum dia um dos produtos passar
a mandar marketing em massa, aí vale separar em subdomínio.

A chave de API do Resend **não** é restrita a um domínio, de propósito: ela
precisa continuar valendo se o remetente mudar de domínio, senão a troca
quebra o envio com um erro que não menciona a chave.

### Integração com o Asaas (Seções 6.4 e 7.12)

Duas Edge Functions, e nenhuma delas roda no app:

| Função | `verify_jwt` | Papel |
|---|---|---|
| `asaas-checkout` | `true` | Cria cliente e cobrança no Asaas e devolve a URL do checkout hospedado. |
| `asaas-webhook` | `false` | **Única porta** que marca `assinaturas.status = 'ativa'`. |

Secrets do projeto:

- `ASAAS_API_KEY` — chave da API. Vive só aqui; nunca no app (Seções 6.4 e 9.1).
- `ASAAS_AMBIENTE` — `sandbox` (padrão) ou `producao`.
- `ASAAS_WEBHOOK_TOKEN` — segredo compartilhado com o painel do Asaas. O
  webhook compara com o cabeçalho `asaas-access-token` em tempo constante e
  responde 401 sem ele.

No painel do Asaas, cadastre a URL do webhook e o mesmo token:

```
https://nakqafnchwydfogcozvc.supabase.co/functions/v1/asaas-webhook
```

Eventos tratados: `PAYMENT_CONFIRMED` e `PAYMENT_RECEIVED` (ativa e restaura o
acesso, inclusive saindo do modo limitado), `PAYMENT_OVERDUE` (entra em
carência com `configuracoes_plataforma.carencia_dias`) e os de estorno. O
upsert por `asaas_payment_id` torna o reprocessamento inofensivo — o Asaas
reenvia eventos.

`verify_jwt` fica desligado no webhook porque quem chama é o Asaas, não um
usuário: a autenticação é o token do cabeçalho.

### Job diário de assinaturas

`processar_assinaturas()` roda às 03:00 UTC via pg_cron (migration 0026) e
aplica trial vencido, carência vencida e downgrade agendado, além dos avisos.
É idempotente e está revogada de `anon` e `authenticated` — só o `service_role`
executa. Nenhuma dessas transições pode depender de o app estar aberto.

### Configuração necessária no Supabase Auth

Dois ajustes no painel do projeto, sem os quais a Fase 2 não funciona:

- **Confirm email: desligado.** A Seção 5.5 decide que a verificação de e-mail
  não é obrigatória antes do primeiro acesso. Com a opção ligada, o `signUp`
  não devolve sessão e a criação da empresa não tem como prosseguir — o app
  detecta isso e mostra uma mensagem explícita em vez de falhar em silêncio.
- **Google provider habilitado**, com Client ID e Secret, para o "Entrar com
  Google" da Seção 7.11. Enquanto não estiver configurado, o botão retorna erro
  do provedor; o login por e-mail e senha funciona normalmente.

### Primeiro administrador da plataforma

Ver `supabase/scripts/criar_administrador.sql` — criação manual, nunca por
autoatendimento (Seção 7.15).

## Apps

```bash
npm install

# App cliente (React Native + Expo)
cp apps/mobile/.env.example apps/mobile/.env   # preencher URL e anon key
npm run mobile

# Painel Administrativo (Vite + React)
cp apps/admin/.env.example apps/admin/.env     # preencher URL e anon key
npm run painel
```

A anon key do Supabase é pública por design — quem protege os dados é a RLS.
A chave da API do Asaas e a `service_role` key **nunca** entram no app: vivem
apenas como secrets de Edge Function (Seções 6.4 e 9.1).

## Site público de contratação (`apps/site`)

O link direto de plano (Seção 6.3) precisa abrir para quem **ainda não é
cliente** — e quem ainda não é cliente não tem o aplicativo instalado. Um link
no esquema `decolanegocios://` não serve para vender: ele só significa alguma
coisa num aparelho que já tem o app. Por isso o site existe.

Ele faz o caminho inteiro da Seção 7.12 no navegador:

| Rota | Papel |
|---|---|
| `/planos` | vitrine dos planos ativos, leitura anônima |
| `/cadastro?plano=<slug>` | conta no Auth → `criar_empresa_e_assinatura` → pagamento |
| `/pagamento` | pede a cobrança ao backend e leva ao checkout do Asaas |
| `/pronto` | fim da contratação com trial, com o passo a passo de entrar no app |
| `/redefinir-senha` | destino dos links de e-mail, para quem não tem o app |
| `/convite/<id>` | aceite de convite de funcionário (Seção 5.2, item 4) |

Não há área logada aqui: o produto é o aplicativo. O site termina onde a conta
começa.

A ordem dos passos do cadastro é a mesma do app, e não por simetria: sem a
sessão criada primeiro, a RPC seguinte rodaria como anônimo e seria recusada.

### Deploy

São **dois projetos na Vercel**, e a divisão não é por tecnologia — é por
quem entra:

| | Projeto | Domínio | Quem usa |
|---|---|---|---|
| **O produto** | `decolanegocios` | `decolanegocios.vercel.app` | Quem já é cliente, e você |
| **A parte pública** | `site` | `site-kappa-five-66.vercel.app` | Quem ainda não é cliente |

### O produto: um endereço, um login, dois destinos

O projeto `decolanegocios` publica DUAS aplicações na mesma saída:

| Caminho | O que é | De onde vem |
|---|---|---|
| `/` | Painel administrativo da plataforma | `apps/admin` (Vite) |
| `/app` | Aplicativo do cliente | `apps/mobile`, exportado para web pelo Expo |

Quem entra pela raiz é encaminhado pelo tipo da conta: administrador da
plataforma fica no painel, dono de negócio vai para `/app`.

**Servir as duas na mesma origem é o que faz isso funcionar**, e não uma
economia de projeto. Elas dividem a chave de sessão do navegador
(`decola-negocios`), então o encaminhamento não cobra a senha de novo. Em
domínios separados, seria um segundo login — e o encaminhamento pioraria a
experiência em vez de melhorá-la.

Uma consequência disso exigiu cuidado: administrador da plataforma não tem
empresa, e o aplicativo, ao encontrar conta sem empresa, encerra a sessão. Com
a sessão compartilhada, um clique em "Visualizar aplicativo" derrubaria o
painel de onde a pessoa veio. A splash (`apps/mobile/app/index.tsx`) pergunta
antes se quem chegou é administrador e o devolve à raiz sem deslogar.

O build de `npm run painel:build` produz os dois: `vite build` para o painel e
`expo export --platform web` para o aplicativo, com `baseUrl: /app` no
`app.json` para que roteador e assets vivam sob o prefixo. As rewrites do
`vercel.json` da raiz separam as duas aplicações.

A versão de celular continua intacta: a web é adicional, e o mesmo código
compila para as duas.

### A parte pública

| Ajuste | Valor |
|---|---|
| Root Directory | `apps/site` |
| Production Branch | `main` |

Planos, contratação e as vitrines dos lojistas — tudo o que precisa ser aberto
e indexável, ao contrário do produto, que é `noindex`. O botão "Entrar" no topo
leva ao endereço do produto.

O nome `site` foi o que a Vercel recebeu na criação, e o sufixo aleatório do
domínio veio de `site.vercel.app` já existir. Renomear muda o endereço que vai
nos links de loja dos clientes: enquanto nenhum estiver na mão de cliente a
troca é barata, depois não é.

### Configuração

A conexão do Supabase vive no CÓDIGO das três aplicações, não em variável de
ambiente. A anon key é pública por definição — já vai no bundle servido a
qualquer visitante —, então guardá-la fora do repositório nunca a tornou
secreta; só a tornou fácil de esquecer, e um esquecimento desses derrubava a
publicação inteira. Quem protege os dados é a RLS.

As variáveis continuam tendo prioridade onde existem, para apontar a um projeto
de homologação sem tocar no código:

- `VITE_URL_SITE` no **painel** → base dos links de plano e de loja. O nome
  antigo `VITE_URL_CADASTRO` continua sendo aceito.
- `VITE_URL_APP` no **site** → para onde o botão "Entrar" aponta.
- `EXPO_PUBLIC_URL_SITE` no **app** → base do link da loja virtual.
- `URL_CONVITE_BASE` na Edge Function `enviar-convite` → base do link de
  convite. Sem ela o convite sai no esquema do app, que vários webmails
  bloqueiam — e o convidado é justamente quem ainda não tem nada instalado.

O endereço do site nas Edge Functions deixou de ser secret: onde publicamos é
fato do repositório, e um valor antigo guardado no painel do Supabase mandava
todo mundo para o lugar errado sem nada no código denunciar.

## Deploy do Painel Administrativo

O painel é um site estático — qualquer host serve. O `vercel.json` **da raiz do
repositório** traz tudo: qual pasta construir, o rewrite de todas as rotas para
`index.html` (sem ele, atualizar a página em `/empresas` devolve 404) e os
cabeçalhos `X-Robots-Tag: noindex`, `X-Frame-Options: DENY`, `nosniff` e
`Referrer-Policy`.

**Por que na raiz, e não em `apps/admin`.** A Vercel lê o `vercel.json` que está
no *Root Directory* do projeto, e ignora qualquer outro. Com o arquivo dentro de
`apps/admin`, ele só valia se o Root Directory também apontasse para lá — e, se
não apontasse, a Vercel construía sem configuração nenhuma: sem
`outputDirectory` publicava a raiz do monorepo, e todo caminho respondia
`404 NOT_FOUND`. Na raiz, a configuração vale com o Root Directory no padrão,
que é o estado em que um projeto conectado ao repositório já nasce. Um arquivo
só, no lugar onde ele sempre é lido.

### Pelo painel da Vercel (recomendado)

Um projeto só — `decolanegocios`, ligado a `decolamed/Decola-Neg-cios`. Não crie
um segundo: o repositório é um monorepo, e o painel é uma pasta dentro dele.

Em **Settings** do projeto existente:

1. **Git → Production Branch:** `main` (a branch padrão do repositório). Enquanto
   apontar para a branch de trabalho, um push na `main` não publica nada.
2. **Build and Deployment → Root Directory:** deixe **vazio** (a raiz do
   repositório). Se estiver preenchido com `apps/admin`, apague: com o
   `vercel.json` na raiz, é de lá que a build sai — `npm install` na raiz resolve
   os workspaces e `npm run painel:build` constrói o painel.
3. Framework, Build Command e Output Directory: deixe todos em *Override: off*.
   Vêm do `vercel.json` (`buildCommand: npm run painel:build`,
   `outputDirectory: apps/admin/dist`). Valor digitado na interface **vence** o
   do arquivo — é por isso que o campo em branco é o certo aqui.
4. **Environment Variables** (escopo Production, Preview e Development):

| Variável | Valor |
|---|---|
| `VITE_SUPABASE_URL` | `https://nakqafnchwydfogcozvc.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | anon key do projeto (Supabase → Settings → API) |
| `VITE_URL_CADASTRO` | opcional — base do link direto de plano (Seção 6.3) |

Só essas. Variável `EXPO_PUBLIC_*` aqui não tem efeito nenhum: ela é do app
cliente, que não passa pela Vercel — se existir alguma, apague, porque ela só
confunde a próxima leitura do painel de configurações.

Depois de mexer em variável de ambiente é preciso **Redeploy**: o Vite embute os
valores no bundle no momento do build, então o deploy antigo continua com os
valores antigos.

Sem as duas primeiras o painel **não** quebra em tela branca: mostra uma tela
explicando o que falta configurar. É por isso que vale abrir a URL depois do
deploy — a tela diz se o problema é build ou variável.

### Pela CLI

Da raiz do repositório — é lá que está o `vercel.json`:

```bash
vercel link      # escolha o escopo e o projeto decolanegocios
vercel --prod
```

### Quando a URL responde 404

| O que aparece | O que é |
|---|---|
| `Code: DEPLOYMENT_NOT_FOUND` | não há deploy servindo o domínio — o projeto nunca publicou, ou a Production Branch aponta para uma branch sem push |
| `Code: NOT_FOUND` na raiz (`/`) | há deploy, mas a pasta publicada não tem `index.html`: Root Directory ou Output Directory sobrescritos na interface |
| `Code: NOT_FOUND` só em rota interna (`/empresas`) | a pasta certa está publicada, mas o rewrite da SPA não foi aplicado — o `vercel.json` não está sendo lido |
| Tela "falta configurar" | build e rewrite corretos; faltam as variáveis `VITE_` |

### A `service_role` key nunca entra aqui

Qualquer variável `VITE_` é embutida no bundle e servida ao navegador. A anon
key pode, porque quem protege os dados é a RLS; a service key ignoraria a RLS
inteira.

### O app cliente não vai para a Vercel

`apps/mobile` é React Native — sai por EAS Build e pelas lojas, não por host
estático.

## Design

Todos os tokens visuais estão em `packages/theme/src/index.ts` — cores,
tipografia, espaçamento, raios, sombras e estados de componente. Nenhum valor
visual deve aparecer hardcoded em tela ou componente: qualquer ajuste de marca
se resolve editando só esse arquivo.

### Identidade visual

Os arquivos da marca ficam em `apps/mobile/assets/marca/` (e uma cópia do
logo nome e da assinatura em `apps/admin/public/marca/`):

| Arquivo | Uso |
|---|---|
| `simbolo.png` | símbolo isolado — base do ícone do app e da splash |
| `logo-nome-claro.png` / `-escuro.png` | logo nome, para fundo escuro / claro |
| `by-decola-claro.png` / `-escuro.png` | assinatura "by Decola" |

O componente `Marca` (`src/componentes/Marca.tsx`) monta as combinações
(símbolo, logo nome, tagline, assinatura) e `AssinaturaDecola` isola a
assinatura para rodapés. `assets/icone.png`, `icone-adaptativo.png`,
`splash.png` e `favicon.png` são derivados desses arquivos e já estão
referenciados no `app.json`.

### Fontes da marca (Seção 2.2)

Montserrat nos três pesos que a hierarquia usa — 400, 600 e 700 — vinda de
pacotes npm que trazem os arquivos junto. Não há `.ttf` solto no repositório
nem download em tempo de execução:

| App | Pacote | Como entra |
|---|---|---|
| `apps/mobile` | `@expo-google-fonts/montserrat` | `src/lib/fontes.ts`, carregado por `expo-font` antes da primeira tela |
| `apps/admin` | `@fontsource/montserrat` | importado em `src/main.tsx`, empacotado no bundle |

No app cliente cada peso é importado pelo subcaminho (`/400Regular`), nunca
pelo índice do pacote: o índice reexporta as 18 variações da família e o
empacotador embarcaria ~6 MB de fonte para usar três.

**Glacial Indifference nos títulos** — a Seção 2.2 pede, mas ela não é livre
nem está no Google Fonts, e os arquivos nunca chegaram. A prévia visual
aprovada renderiza tudo em Montserrat, títulos inclusive, então Montserrat nos
dois papéis reproduz o que foi validado em vez de aproximar com uma terceira
fonte. Para voltar atrás: trocar `fontes.titulo`/`tituloBold` em
`packages/theme` e registrar os arquivos em `src/lib/fontes.ts`.

