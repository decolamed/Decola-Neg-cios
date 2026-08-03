# Decola Negócios

App de gestão para pequenos e médios negócios — vendas, estoque, financeiro e
funcionários — com um Painel Administrativo SaaS separado.

Fonte única de verdade: `especificacao-tecnica.md` (v3.0). Toda decisão de
produto e arquitetura já está tomada lá; este repositório implementa.

## Estrutura

```
apps/mobile/        App cliente — React Native + Expo (Seção 3.1)
apps/admin/         Painel Administrativo SaaS (Seção 7.15) — Fase 8
packages/theme/     Design tokens centralizados (Seções 2.1–2.3)
supabase/
  migrations/       Schema, RLS, triggers e RPCs
  tests/            Testes de RLS e regras de negócio
  scripts/          Seeds manuais (não replayados automaticamente)
```

## Fases

| Fase | Escopo | Estado |
|---|---|---|
| 1 | Fundação — schema, RLS, auth, ambiente | ✅ concluída |
| 2 | Autenticação e onboarding (Seções 5.5, 7.10–7.13) | pendente |
| 3 | Estoque e produtos (Seções 4.5/4.6, 8.3, 8.4) | pendente |
| 4 | Vendas (Seções 7.3, 7.4, 8.1, 8.2, 8.5) | pendente |
| 5 | Financeiro e relatórios (Seções 8.6, 10.2) | pendente |
| 6 | Funcionários e permissões (Seções 5.2, 5.3, 7.8) | pendente |
| 7 | Assinatura e pagamento — Asaas (Seções 6.4–6.7, 7.14) | pendente |
| 8 | Painel Administrativo (Seções 7.15, 11) | pendente |

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

### Rodando os testes

```sql
-- No SQL Editor do Supabase, com privilégio de service role:
\i supabase/tests/rls_fase1.sql
```

O script roda em transação e faz `ROLLBACK` no fim — não deixa resíduo.
Cada linha do resultado é uma asserção; procure por `FALHA` na saída.

Cobre isolamento multi-tenant, imutabilidade da auditoria, permissões
granulares por coluna, alerta de estoque, limite de plano, imutabilidade do
Gestor Principal e as regras de modo limitado da Seção 6.6.

### Primeiro administrador da plataforma

Ver `supabase/scripts/criar_administrador.sql` — criação manual, nunca por
autoatendimento (Seção 7.15).

## App

```bash
npm install
cp apps/mobile/.env.example apps/mobile/.env   # preencher URL e anon key
npm run mobile
```

A anon key do Supabase é pública por design — quem protege os dados é a RLS.
A chave da API do Asaas e a `service_role` key **nunca** entram no app: vivem
apenas como secrets de Edge Function (Seções 6.4 e 9.1).

## Design

Todos os tokens visuais estão em `packages/theme/src/index.ts` — cores,
tipografia, espaçamento e estados de componente. Nenhum valor visual deve
aparecer hardcoded em tela ou componente: o refino de layout posterior precisa
ser aplicável editando só esse arquivo.
