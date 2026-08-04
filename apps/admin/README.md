# Painel Administrativo (SaaS)

Interface exclusiva do Administrador da plataforma — gestão de empresas,
planos, assinaturas e configurações globais (Seções 7.15 e 11).

**Completamente separado do app cliente** (Seção 11.1): acesso próprio, nunca
acessível a usuários de empresas. O isolamento não depende de roteamento — é
garantido pelas políticas de RLS e pelas RPCs `admin_*`, que revalidam
`app.eh_admin_plataforma()` no servidor. Esconder um botão aqui é conveniência
de tela; a recusa acontece no banco.

## Stack

Vite + React + TypeScript. É um app web estático, construído fora do Expo de
propósito: o painel roda no navegador do time, não em dispositivo. A decisão
não estava no documento — a Seção 11.1 só diz "provavelmente web".

Os design tokens são os mesmos do app cliente (`packages/theme`), convertidos
em variáveis CSS por `src/lib/tokens.ts`. Nenhum valor visual aparece
hardcoded: a marca muda nos dois lugares editando um arquivo só.

## Rodando

```bash
npm install
cp apps/admin/.env.example apps/admin/.env   # preencher URL e anon key
npm run painel
```

A `service_role` key **nunca** entra aqui: qualquer variável `VITE_` é embutida
no bundle e servida ao navegador. O que exige service key — criar a conta do
responsável na ativação manual — vive na Edge Function `admin-criar-empresa`.

## Áreas (Seção 7.15)

| Área | O que faz |
|---|---|
| **Visão geral** | Empresas ativas, novas no mês, MRR, churn do mês e contas que precisam de atenção (carência + modo limitado). |
| **Empresas** | Busca e filtro por status e plano; criação manual; e por empresa: alterar plano, ativar manualmente, suspender, reativar, encerrar, alterar período de teste e excluir definitivamente. |
| **Planos** | Criar, editar, ativar/desativar e copiar o link direto de cadastro. |
| **Configurações SaaS** | Trial ligado/desligado, duração do trial e duração da carência. |

## Duas regras que a interface deixa explícitas

- **Alterar o valor de um plano não mexe em quem já assina.** O preço fica
  congelado em `assinaturas.valor_contratado` (Seção 7.15 C). Para mudar o que
  uma empresa paga, use "Alterar plano" na tela dela — que aceita um valor
  diferente do de tabela.
- **Desativar um plano só o tira das novas contratações.** Quem já assina
  continua normalmente (Seção 6.1).

## Primeiro administrador

Ver `supabase/scripts/criar_administrador.sql` — criação manual, nunca por
autoatendimento (Seção 7.15). Sem uma linha em `administradores_plataforma`, o
login autentica mas o painel não abre: a tela avisa que a conta não tem acesso
e oferece entrar com outra.
