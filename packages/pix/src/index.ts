/**
 * Pix — a mesma lógica para o aplicativo, o painel e a loja pública.
 *
 * POR QUE É UM PACOTE, E NÃO UM ARQUIVO EM CADA LADO. Um BR Code montado
 * errado abre no aplicativo do banco, parece certo e não paga ninguém. Se o
 * gerador existisse em dois lugares, uma correção num deles deixaria o outro
 * emitindo cobrança quebrada — sem nada denunciar, porque o QR continuaria
 * bonito. Há uma implementação, e só uma.
 */
export * from './brcode';
export * from './chave';
