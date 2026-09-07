/**
 * Alterar senha — Seção 7.14 (botão "Alterar senha") e Seção 5.5.
 *
 * "senha atual + nova". Sem exigência de complexidade (Seção 5.5): a única
 * validação é campo não vazio, mais a conferência da repetição, que evita o
 * usuário se trancar fora da conta por erro de digitação.
 *
 * "Permanece em Perfil após sucesso, com mensagem de confirmação."
 */
import { useState } from 'react';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import tema from '@decola/theme';
import { Aviso } from '@/componentes/Aviso';
import { Botao } from '@/componentes/Botao';
import { CampoTexto } from '@/componentes/CampoTexto';
import { alterarSenha } from '@/dados/autenticacao';
import { textoDoErro } from '@/lib/erros';

export default function AlterarSenha() {
  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  const [repetida, setRepetida] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const preenchido = atual.length > 0 && nova.length > 0 && repetida.length > 0;

  const salvar = async () => {
    setErro(null);
    setSucesso(null);

    if (nova !== repetida) {
      setErro('A nova senha e a repetição não são iguais.');
      return;
    }

    setSalvando(true);
    try {
      await alterarSenha(atual, nova);
      setAtual('');
      setNova('');
      setRepetida('');
      setSucesso('Senha alterada com sucesso.');
      // A confirmação fica em Perfil, como manda a Seção 7.14.
      setTimeout(() => router.back(), 1200);
    } catch (e) {
      setErro(textoDoErro(e, 'Não foi possível alterar sua senha.'));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <SafeAreaView style={estilos.tela}>
      <ScrollView contentContainerStyle={estilos.conteudo} keyboardShouldPersistTaps="handled">
        <Text style={estilos.titulo}>Alterar senha</Text>

        {erro ? <Aviso mensagem={erro} tom="erro" /> : null}
        {sucesso ? <Aviso mensagem={sucesso} tom="sucesso" /> : null}

        <CampoTexto
          rotulo="Senha atual"
          valor={atual}
          aoMudar={setAtual}
          senha
          bloqueado={salvando}
          autoCompletar="password"
        />
        <CampoTexto
          rotulo="Nova senha"
          valor={nova}
          aoMudar={setNova}
          senha
          bloqueado={salvando}
          autoCompletar="password"
        />
        <CampoTexto
          rotulo="Repita a nova senha"
          valor={repetida}
          aoMudar={setRepetida}
          senha
          bloqueado={salvando}
          autoCompletar="password"
        />

        <Botao
          titulo="Salvar nova senha"
          aoPressionar={salvar}
          carregando={salvando}
          desabilitado={!preenchido}
          estilo={{ marginTop: tema.espacamento.md }}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  tela: { flex: 1, backgroundColor: tema.cores.fundo },
  conteudo: { padding: tema.espacamento.lg },
  titulo: { ...tema.tipografia.h1, color: tema.cores.texto, marginBottom: tema.espacamento.md },
});
