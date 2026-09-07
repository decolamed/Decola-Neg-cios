/**
 * Aceite de convite — Seção 5.2, item 4.
 *
 * Destino do link enviado por e-mail. Dois caminhos, conforme a especificação:
 *   já tem conta ....... faz login e aceita participar da empresa
 *   não tem conta ...... cria a conta e é vinculado automaticamente
 *
 * Em ambos, o vínculo passa a `ativo` com `usuario_id` e `aceito_em`
 * preenchidos, e o colaborador entra como Funcionário.
 */
import { useCallback, useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import tema from '@decola/theme';
import { Aviso } from '@/componentes/Aviso';
import { Botao } from '@/componentes/Botao';
import { Marca } from '@/componentes/Marca';
import { TelaCarregando } from '@/componentes/EstadoDaTela';
import { useSessao } from '@/contexto/SessaoContexto';
import { sessaoAtual } from '@/dados/autenticacao';
import { aceitarConvite } from '@/dados/funcionarios';
import { textoDoErro } from '@/lib/erros';

export default function AceitarConvite() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { recarregar } = useSessao();

  const [autenticado, setAutenticado] = useState<boolean | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [aceitando, setAceitando] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        setAutenticado(Boolean(await sessaoAtual()));
      } catch {
        setAutenticado(false);
      }
    })();
  }, []);

  const aceitar = useCallback(async () => {
    if (!id) return;

    setMensagem(null);
    setAceitando(true);
    try {
      await aceitarConvite(id);
      // O contexto recarrega o vínculo antes de o Dashboard montar.
      await recarregar();
      router.replace('/dashboard');
    } catch (e) {
      // A RPC recusa convite expirado, e-mail diferente, convite já aceito e
      // conta já vinculada a outra empresa — com a mensagem pronta.
      setMensagem(textoDoErro(e, 'Não foi possível aceitar o convite.'));
    } finally {
      setAceitando(false);
    }
  }, [id, recarregar]);

  if (autenticado === null) return <TelaCarregando />;

  return (
    <SafeAreaView style={estilos.tela}>
      <ScrollView contentContainerStyle={estilos.conteudo}>
        <Marca escura />

        <Text style={estilos.titulo}>Convite para participar de uma empresa</Text>

        {mensagem ? <Aviso mensagem={mensagem} /> : null}

        {autenticado ? (
          <>
            <Text style={estilos.descricao}>
              Ao aceitar, você passa a ter acesso ao ambiente da empresa com o seu próprio login.
            </Text>
            <Botao titulo="Aceitar convite" aoPressionar={aceitar} carregando={aceitando} />
          </>
        ) : (
          <>
            <Text style={estilos.descricao}>
              Entre com a sua conta para aceitar. Se ainda não tem uma, crie usando o mesmo e-mail
              que recebeu o convite.
            </Text>
            <Botao
              titulo="Entrar"
              aoPressionar={() => router.push({ pathname: '/login', params: { convite: id } })}
            />
          </>
        )}

        <Botao titulo="Agora não" variante="texto" aoPressionar={() => router.replace('/')} />
      </ScrollView>
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  tela: { flex: 1, backgroundColor: tema.cores.fundo },
  conteudo: { flexGrow: 1, justifyContent: 'center', padding: tema.espacamento.lg },
  titulo: {
    ...tema.tipografia.h2,
    color: tema.cores.texto,
    textAlign: 'center',
    marginTop: tema.espacamento.xl,
    marginBottom: tema.espacamento.sm,
  },
  descricao: {
    ...tema.tipografia.corpo,
    color: tema.cores.textoSuave,
    textAlign: 'center',
    marginBottom: tema.espacamento.lg,
  },
});
