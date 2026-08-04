/**
 * Métricas do painel — Seção 7.15 A.
 *
 * "número de empresas ativas; novas empresas no mês; receita recorrente mensal
 *  (MRR, soma dos valores dos planos com assinatura `ativa`); taxa de
 *  cancelamento no mês (churn); empresas atualmente em carência ou modo
 *  limitado (para ação proativa do time)."
 *
 * O cálculo é do banco (`admin_metricas`), não do navegador: agregar aqui
 * exigiria baixar a base inteira, e a RPC revalida que quem pergunta é
 * administrador.
 */
import { supabase } from '@/lib/supabase';

export type Metricas = {
  empresas_ativas: number;
  novas_no_mes: number;
  mrr: number;
  encerradas_no_mes: number;
  churn_percentual: number;
  em_carencia: number;
  em_modo_limitado: number;
  em_trial: number;
  pendentes_pagamento: number;
};

export async function carregarMetricas(): Promise<Metricas> {
  const { data, error } = await supabase.rpc('admin_metricas');
  if (error) throw new Error(error.message);
  return data as unknown as Metricas;
}
