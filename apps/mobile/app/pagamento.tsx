/**
 * Etapa de pagamento — PLACEHOLDER.
 *
 * Destino do cadastro quando o trial está desativado globalmente e a
 * assinatura nasce em `pendente_pagamento` (Seção 7.12, item 6). O checkout
 * hospedado do Asaas em webview e a espera pela confirmação via webhook são
 * da Fase 7 (Seções 6.4 e 7.12).
 *
 * O que já funciona aqui: o app observa a assinatura em tempo real (Seção 3.3)
 * e navega sozinho para o Dashboard assim que o backend a marcar como `ativa`
 * — que é exatamente o comportamento final descrito na Seção 7.12.
 */
import { useEffect } from 'react';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import tema from '@decola/theme';
import { Botao } from '@/componentes/Botao';
import { TelaCarregando } from '@/componentes/EstadoDaTela';
import { useSessao } from '@/contexto/SessaoContexto';

export default function Pagamento() {
  const { carregando, conta, sair } = useSessao();
  const status = conta?.assinatura?.status;

  useEffect(() => {
    if (status && status !== 'pendente_pagamento') {
      router.replace('/dashboard');
    }
  }, [status]);

  if (carregando) return <TelaCarregando />;

  return (
    <SafeAreaView style={estilos.tela}>
      <ScrollView contentContainerStyle={estilos.conteudo}>
        <Text style={estilos.titulo}>Ative sua assinatura</Text>
        <Text style={estilos.texto}>
          Sua empresa foi criada. Para liberar o acesso, é necessário concluir o pagamento da
          assinatura.
        </Text>
        <Text style={estilos.nota}>
          O checkout entra na próxima etapa da implementação. Assim que o pagamento for confirmado,
          esta tela avança sozinha para o app.
        </Text>

        <Botao
          titulo="Sair da conta"
          variante="texto"
          aoPressionar={async () => {
            await sair();
            router.replace('/login');
          }}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  tela: { flex: 1, backgroundColor: tema.cores.fundo },
  conteudo: { flexGrow: 1, justifyContent: 'center', padding: tema.espacamento.lg },
  titulo: { ...tema.tipografia.h1, color: tema.cores.texto, marginBottom: tema.espacamento.sm },
  texto: { ...tema.tipografia.corpo, color: tema.cores.texto, marginBottom: tema.espacamento.md },
  nota: {
    ...tema.tipografia.legenda,
    color: tema.cores.textoSuave,
    marginBottom: tema.espacamento.xl,
  },
});
