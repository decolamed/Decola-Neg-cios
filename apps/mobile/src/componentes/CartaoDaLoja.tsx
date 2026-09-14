/**
 * A loja na página inicial — as três ações que o lojista faz toda semana.
 *
 * POR QUE ELE EXISTE. Ver a própria loja e mudar a aparência dela estavam em
 * Mais → Configurações → Loja virtual: quatro toques e um caminho que só quem
 * já sabia onde procurar encontrava. São, no entanto, as coisas que um lojista
 * faz o tempo todo — mandar o link para um cliente é a venda começando.
 *
 * "É configuração" não quer dizer "fica em Configurações". O que decide o
 * lugar de um botão é a FREQUÊNCIA com que se toca nele, não a gaveta
 * conceitual a que ele pertence. Categorias e alertas de estoque se ajustam uma
 * vez e se esquecem — esses continuam lá dentro. Compartilhar a loja, não.
 *
 * Enviar o link vem primeiro de propósito: é a ação com consequência comercial.
 * Ver e editar vêm depois, lado a lado.
 *
 * SEM LOJA PUBLICADA o cartão não some — vira o convite para publicar. Sumir
 * esconderia o recurso justamente de quem ainda não o conhece.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import tema from '@decola/theme';
import { Icone } from '@/componentes/Icone';
import { compartilharTexto } from '@/lib/compartilhar';
import { abrirNoNavegador } from '@/lib/navegador';

type Props = {
  nomeDaEmpresa: string;
  /** Endereço público da loja, ou `null` se ainda não foi publicada. */
  link: string | null;
};

export function CartaoDaLoja({ nomeDaEmpresa, link }: Props) {
  const [aviso, setAviso] = useState<string | null>(null);

  if (!link) {
    return (
      <Pressable
        onPress={() => router.push('/configuracoes/loja')}
        accessibilityRole="button"
        style={({ pressed }) => [estilos.cartao, pressed && { opacity: 0.9 }]}
      >
        <View style={estilos.topo}>
          <Text style={estilos.titulo}>Sua loja virtual</Text>
          <Icone nome="seta" cor={tema.cores.textoSuave} tamanho={18} />
        </View>
        <Text style={estilos.explicacao}>
          Publique seus produtos numa página pública e receba pedidos pelo WhatsApp. Leva um
          minuto.
        </Text>
      </Pressable>
    );
  }

  return (
    <View style={estilos.cartao}>
      <View style={estilos.topo}>
        <Text style={estilos.titulo}>Minha loja</Text>
      </View>

      <Text style={estilos.endereco} numberOfLines={1} selectable>
        {link}
      </Text>

      {aviso ? <Text style={estilos.aviso}>{aviso}</Text> : null}

      <Pressable
        onPress={() => {
          void compartilharTexto(
            `Confira os produtos da ${nomeDaEmpresa}: ${link}`,
            nomeDaEmpresa,
          ).then((r) =>
            setAviso(
              r === 'copiado'
                ? 'Link copiado. Cole no WhatsApp do seu cliente.'
                : r === 'nada'
                  ? null
                  : null,
            ),
          );
        }}
        accessibilityRole="button"
        style={({ pressed }) => [estilos.principal, pressed && { opacity: 0.9 }]}
      >
        <Text style={estilos.textoPrincipal}>Enviar para um cliente</Text>
      </Pressable>

      <View style={estilos.duplo}>
        <Pressable
          onPress={() => void abrirNoNavegador(link)}
          accessibilityRole="button"
          style={({ pressed }) => [estilos.secundario, pressed && { opacity: 0.85 }]}
        >
          <Text style={estilos.textoSecundario}>Ver minha loja</Text>
        </Pressable>

        <Pressable
          onPress={() => router.push('/configuracoes/aparencia-da-loja')}
          accessibilityRole="button"
          style={({ pressed }) => [estilos.secundario, pressed && { opacity: 0.85 }]}
        >
          <Text style={estilos.textoSecundario}>Editar aparência</Text>
        </Pressable>
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  cartao: {
    backgroundColor: tema.cores.fundoCard,
    borderRadius: tema.raio.lg,
    padding: tema.espacamento.md,
    marginBottom: tema.espacamento.md,
    ...tema.elevacao.card,
  },
  topo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  titulo: { ...tema.tipografia.corpoDestacado, color: tema.cores.texto },
  explicacao: {
    ...tema.tipografia.legenda,
    color: tema.cores.textoSuave,
    marginTop: tema.espacamento.xs,
  },
  endereco: {
    ...tema.tipografia.legenda,
    color: tema.cores.secundaria,
    marginTop: tema.espacamento.xs,
    marginBottom: tema.espacamento.sm,
  },
  aviso: {
    ...tema.tipografia.legenda,
    color: tema.cores.positivo,
    marginBottom: tema.espacamento.sm,
  },
  principal: {
    backgroundColor: tema.cores.acaoPrimaria,
    borderRadius: tema.raio.md,
    height: tema.alturas.controle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textoPrincipal: { ...tema.tipografia.rotulo, color: tema.cores.textoSobreAcao },
  duplo: { flexDirection: 'row', gap: tema.espacamento.sm, marginTop: tema.espacamento.sm },
  secundario: {
    flex: 1,
    borderWidth: 1,
    borderColor: tema.cores.borda,
    borderRadius: tema.raio.md,
    height: tema.alturas.controle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textoSecundario: { ...tema.tipografia.rotulo, color: tema.cores.texto },
});
