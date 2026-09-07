/**
 * Configurações → Dados da empresa e chave Pix — Seções 4.1, 7.9 e 7.4.
 *
 * Sem esta tela a chave Pix não tinha como ser cadastrada, e o "Gerar Pix" da
 * tela Finalizar Venda (Seção 7.4) falhava sempre — a chave é justamente o que
 * o payload EMV exige.
 *
 * Todos os campos além do nome são opcionais por decisão da Seção 4.1: "o
 * público-alvo inclui negócios informais". Só o nome é obrigatório.
 *
 * `empresas.status` NÃO aparece aqui: é do administrador da plataforma
 * (Seção 6.9) e a coluna nem consta no GRANT do cliente.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import tema from '@decola/theme';
import { Aviso } from '@/componentes/Aviso';
import { Botao } from '@/componentes/Botao';
import { CampoTexto } from '@/componentes/CampoTexto';
import { TelaCarregando, TelaMensagem } from '@/componentes/EstadoDaTela';
import { useSessao } from '@/contexto/SessaoContexto';
import { salvarDadosDaEmpresa } from '@/dados/configuracoesEmpresa';
import { ErroChavePix, ROTULO_DO_TIPO, normalizarChavePix } from '@/lib/chavePix';
import { textoDoErro } from '@/lib/erros';

export default function DadosDaEmpresa() {
  const { carregando, conta, podeEscrever, recarregar } = useSessao();

  const [nome, setNome] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [endereco, setEndereco] = useState('');
  const [telefone, setTelefone] = useState('');
  const [chavePix, setChavePix] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);
  const [salvando, setSalvando] = useState(false);

  // Preenche uma vez, quando a conta chega; depois o formulário é do usuário.
  useEffect(() => {
    if (!conta) return;
    setNome(conta.empresa.nome);
    setCnpj(conta.empresa.cnpj ?? '');
    setEndereco(conta.empresa.endereco ?? '');
    setTelefone(conta.empresa.telefone ?? '');
    setChavePix(conta.empresa.chave_pix ?? '');
  }, [conta?.empresa.id]);

  const salvar = useCallback(async () => {
    if (!conta) return;
    setErro(null);
    setSucesso(false);

    if (!nome.trim()) {
      setErro('O nome da empresa é obrigatório.');
      return;
    }

    // A chave é conferida ANTES de salvar. Chave malformada não é um detalhe
    // de cadastro: é um QR Code que o cliente paga e o dinheiro não chega.
    let chaveNormalizada: string | null;
    try {
      chaveNormalizada = normalizarChavePix(chavePix)?.valor ?? null;
    } catch (e) {
      setErro(e instanceof ErroChavePix ? e.message : 'Chave Pix inválida.');
      return;
    }

    setSalvando(true);
    try {
      await salvarDadosDaEmpresa(conta.empresa.id, {
        nome,
        cnpj,
        endereco,
        telefone,
        chave_pix: chaveNormalizada,
      });
      if (chaveNormalizada) setChavePix(chaveNormalizada);
      await recarregar();
      setSucesso(true);
    } catch (e) {
      setErro(textoDoErro(e, 'Não foi possível salvar os dados da empresa.'));
    } finally {
      setSalvando(false);
    }
  }, [conta, nome, cnpj, endereco, telefone, chavePix, recarregar]);

  const conferenciaDaChave = useMemo(() => {
    if (chavePix.trim() === '') return null;
    try {
      const chave = normalizarChavePix(chavePix);
      if (!chave) return null;
      return {
        ok: true,
        texto: `Reconhecida como ${ROTULO_DO_TIPO[chave.tipo]}: ${chave.exibicao}`,
      };
    } catch (e) {
      return { ok: false, texto: e instanceof ErroChavePix ? e.message : 'Chave Pix inválida.' };
    }
  }, [chavePix]);

  if (carregando) return <TelaCarregando />;
  if (!conta) return <TelaMensagem mensagem="Não foi possível carregar os dados da empresa." />;

  // Seção 5.3 — configurar a empresa é ação exclusiva do papel Gestor.
  if (!conta.ehGestor) {
    return <TelaMensagem mensagem="Apenas o Gestor pode alterar os dados da empresa." />;
  }

  return (
    <SafeAreaView style={estilos.tela}>
      <ScrollView contentContainerStyle={estilos.conteudo} keyboardShouldPersistTaps="handled">
        <Text style={estilos.titulo}>Dados da empresa</Text>
        <Text style={estilos.descricao}>
          Só o nome é obrigatório. Os demais campos aparecem nos recibos e no QR Code Pix quando
          preenchidos.
        </Text>

        {erro ? <Aviso mensagem={erro} tom="erro" /> : null}
        {sucesso ? <Aviso mensagem="Dados salvos." tom="sucesso" /> : null}

        {/* Seção 6.6 — em modo limitado a escrita fica bloqueada, e a UI diz
            por quê em vez de só falhar na hora de salvar. */}
        {!podeEscrever ? (
          <Aviso
            mensagem={
              'Sua conta está com as alterações bloqueadas. Você pode consultar os dados, mas ' +
              'não salvá-los até regularizar a assinatura.'
            }
            tom="alerta"
          />
        ) : null}

        <CampoTexto
          rotulo="Nome da empresa"
          valor={nome}
          aoMudar={setNome}
          bloqueado={salvando || !podeEscrever}
        />
        <CampoTexto
          rotulo="CNPJ (opcional)"
          valor={cnpj}
          aoMudar={setCnpj}
          bloqueado={salvando || !podeEscrever}
        />
        <CampoTexto
          rotulo="Endereço (opcional)"
          valor={endereco}
          aoMudar={setEndereco}
          bloqueado={salvando || !podeEscrever}
        />
        <CampoTexto
          rotulo="Telefone (opcional)"
          valor={telefone}
          aoMudar={setTelefone}
          bloqueado={salvando || !podeEscrever}
        />

        <Text style={estilos.subtitulo}>Recebimento por Pix</Text>
        <Text style={estilos.descricao}>
          Chave usada para gerar o QR Code na tela de Finalizar Venda. Pode ser CPF, CNPJ, e-mail,
          telefone com DDD ou a chave aleatória do seu banco. Sem ela, a opção "Gerar Pix" não
          funciona.
        </Text>

        <CampoTexto
          rotulo="Chave Pix"
          valor={chavePix}
          aoMudar={setChavePix}
          bloqueado={salvando || !podeEscrever}
          placeholder="CPF, CNPJ, e-mail, telefone ou chave aleatória"
        />

        {/* Confirmação imediata do que o sistema entendeu. Telefone digitado
            como "74999300306" é gravado como "+5574999300306" — a pessoa
            precisa ver isso antes de um cliente pagar no QR errado. */}
        {conferenciaDaChave ? (
          <Text style={conferenciaDaChave.ok ? estilos.notaOk : estilos.notaErro}>
            {conferenciaDaChave.texto}
          </Text>
        ) : null}

        <Text style={estilos.nota}>
          O Pix da venda é independente da cobrança da assinatura: ele gera um QR Code para o seu
          cliente pagar você, sem confirmação automática.
        </Text>

        <Botao
          titulo="Salvar"
          aoPressionar={salvar}
          carregando={salvando}
          desabilitado={!podeEscrever}
          estilo={{ marginTop: tema.espacamento.md }}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  tela: { flex: 1, backgroundColor: tema.cores.fundo },
  conteudo: { padding: tema.espacamento.lg },
  titulo: { ...tema.tipografia.h1, color: tema.cores.texto },
  subtitulo: {
    ...tema.tipografia.h2,
    color: tema.cores.texto,
    marginTop: tema.espacamento.lg,
  },
  descricao: {
    ...tema.tipografia.corpo,
    color: tema.cores.textoSuave,
    marginTop: tema.espacamento.xs,
    marginBottom: tema.espacamento.md,
  },
  nota: {
    ...tema.tipografia.legenda,
    color: tema.cores.textoSuave,
    marginTop: tema.espacamento.sm,
  },
  notaOk: {
    ...tema.tipografia.legenda,
    color: tema.cores.positivo,
    marginTop: tema.espacamento.xs,
  },
  notaErro: {
    ...tema.tipografia.legenda,
    color: tema.cores.negativo,
    marginTop: tema.espacamento.xs,
  },
});
