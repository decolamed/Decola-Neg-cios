/**
 * Onde o produto está publicado — UMA vez, para todas as Edge Functions.
 *
 * POR QUE NÃO É SECRET. Um endereço guardado em variável de ambiente é
 * configuração que envelhece calada: fica antigo no painel, ninguém percebe, e
 * todo mundo é mandado para o lugar errado sem nenhum erro no caminho. Onde
 * publicamos é fato do repositório, versionado junto com o resto.
 *
 * POR QUE UM ARQUIVO SÓ. O valor estava copiado em quatro funções
 * (`contratar`, `enviar-acesso`, `asaas-checkout`, `diagnostico-integracoes`).
 * Trocar o domínio exigia lembrar das quatro, e esquecer uma quebra COISAS
 * DIFERENTES e em silêncio:
 *
 *   contratar / asaas-checkout .. o cliente paga e volta para um endereço morto
 *   enviar-acesso ............... o e-mail de "criar sua senha" leva a lugar nenhum
 *   diagnostico-integracoes ..... o painel diz que o site está fora do ar
 *
 * Agora é uma linha. Depois de alterar, as quatro funções precisam ser
 * publicadas de novo — elas levam uma cópia do código no momento do deploy.
 *
 * ESTADO DO QUE ESTÁ NO AR (08/09/2026): as quatro funções foram publicadas
 * usando este arquivo, já com o domínio novo.
 *
 * O QUE MAIS PRECISA MUDAR JUNTO, fora deste arquivo:
 *   - Supabase → Authentication → URL Configuration (Site URL e Redirect URLs)
 *   - Vercel, no projeto do app/painel: VITE_URL_SITE e EXPO_PUBLIC_URL_SITE
 *   - Vercel, no projeto do site: manter o domínio antigo como apelido SE já
 *     houver lojista com link divulgado. Na troca de 08/09/2026 não havia
 *     nenhum, então o antigo (`site-kappa-five-66`) foi simplesmente
 *     descartado.
 */

/** O site público: planos, contratação e as vitrines dos lojistas. */
export const URL_DO_SITE = 'https://sitedecolanegocios.vercel.app';

/** O aplicativo e o painel, servidos na mesma publicação (o painel na raiz). */
export const URL_DO_APP = 'https://decolanegocios.vercel.app';
