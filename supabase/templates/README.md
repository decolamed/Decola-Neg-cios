# Templates de e-mail do Supabase Auth

Os e-mails de autenticação — redefinição de senha, confirmação de cadastro,
troca de e-mail — são gerados pelo **Supabase**, não pelo nosso código. Por
isso eles não vivem numa Edge Function: só existem se estiverem colados no
painel.

Sem isso, o Supabase manda o template padrão dele: em inglês, sem marca, e
assinado como "Supabase Auth". É o que o cliente recebia antes destes arquivos.

> Não confunda com o convite de funcionário. Aquele é nosso, sai pela Edge
> Function `enviar-convite`, e o HTML dele está no próprio `index.ts`.

## Como aplicar

Dashboard → **Authentication → Emails → Templates**. Para cada um, cole o
assunto e o corpo:

| Template no painel | Arquivo | Assunto |
|---|---|---|
| Reset Password | `recuperacao-de-senha.html` | `Criar uma nova senha — Decola Negócios` |
| Confirm signup | `confirmacao-de-cadastro.html` | `Confirme seu e-mail — Decola Negócios` |
| Change Email Address | `troca-de-email.html` | `Confirme seu novo e-mail — Decola Negócios` |

Editar aqui não muda nada sozinho: depois de alterar um arquivo, é preciso
colar de novo no painel.

## Sem estes três ajustes, o template bonito não resolve

1. **Site URL** (Authentication → URL Configuration) = `https://sitedecolanegocios.vercel.app`.
   É a base dos links. Enquanto for `http://localhost:3000`, o botão do e-mail
   leva a pessoa a uma página que não existe no computador dela — o link fica
   bonito e continua quebrado.

2. **Redirect URLs**, na mesma tela:
   - `https://sitedecolanegocios.vercel.app/**`
   - `decolanegocios://redefinir-senha`

   O primeiro cobre o site; o segundo, quem abre pelo aplicativo.

3. **SMTP próprio** (Authentication → Emails → SMTP Settings). Sem ele o
   remetente é `noreply@mail.app.supabase.io`, o envio é limitado a poucos
   por hora e a mensagem tende ao spam — por mais bem feito que seja o
   template. Os valores estão no README da raiz, em "E-mail".

## Por que HTML com `<table>` e estilo inline

Cliente de e-mail não é navegador: Gmail e Outlook descartam `<style>` no
`<head>`, e o suporte a flexbox e grid é irregular. Tabela com estilo inline é
o que renderiza igual em todos — é feio de escrever e é o que funciona.

As cores são as mesmas de `packages/theme`, copiadas à mão porque não há como
importar TypeScript dentro de um template do Supabase:

| Papel | Valor |
|---|---|
| `primaria` | `#01395E` |
| `acaoPrimaria` | `#F2B532` |
| `textoSobreAcao` | `#01395E` |
| `textoSuave` | `#5A6B78` |
| `fundo` | `#F5F6F7` |
| `borda` | `#E1E5E8` |

Se a paleta mudar no tema, estes seis valores precisam ser atualizados aqui e
recolados no painel.
