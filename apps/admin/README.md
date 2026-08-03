# Painel Administrativo (SaaS)

Interface exclusiva do Administrador da plataforma — gestão de empresas,
planos, assinaturas e configurações globais (Seções 7.15 e 11).

**Completamente separado do app cliente** (Seção 11.1): acesso próprio, nunca
acessível a usuários de empresas. O isolamento não depende de roteamento — é
garantido pelas políticas de RLS, que reconhecem o administrador pela presença
de uma linha em `administradores_plataforma`.

Implementação prevista para a Fase 8. A base de dados já está pronta:
`administradores_plataforma`, `configuracoes_plataforma`, `planos`,
`assinaturas` e `cobrancas`, com as políticas correspondentes.
