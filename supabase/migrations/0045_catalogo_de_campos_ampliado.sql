-- 0045 — Mais campos prontos no cadastro de produto.
--
-- O catálogo padrão tinha oito campos e um só era de seleção (Voltagem). Quem
-- vende roupa e precisava de "P, M, G, GG, XG" tinha de criar um campo
-- personalizado e digitar opção por opção — e refazer isso em cada empresa.
-- O tipo `selecao` já aparece no formulário como botões; o que faltava era o
-- catálogo trazer as listas prontas.
--
-- São campos DISPONÍVEIS, não obrigatórios: cada empresa continua escolhendo
-- em Configurações → Cadastro de produtos quais quer ligar. Uma loja de
-- celular não vai ligar "Numeração (calçado)", e tudo bem.
--
-- `empresa_id` nulo = campo do sistema, visível para todas as empresas.
-- A inserção é idempotente: rodar de novo não duplica nem sobrescreve o que
-- alguma empresa já tenha ajustado.

insert into public.campos_produto_disponiveis (chave, nome_exibicao, tipo_campo, opcoes, empresa_id)
select v.chave, v.nome_exibicao, v.tipo_campo::public.tipo_campo, v.opcoes, null
  from (values
    -- ------------------------------------------------------ vestuário
    ('tamanho_letra', 'Tamanho (PP a XGG)', 'selecao',
     '["PP","P","M","G","GG","XG","XGG"]'::jsonb),

    ('numeracao_roupa', 'Numeração (roupa)', 'selecao',
     '["36","38","40","42","44","46","48","50","52","54","56"]'::jsonb),

    ('numeracao_calcado', 'Numeração (calçado)', 'selecao',
     '["33","34","35","36","37","38","39","40","41","42","43","44","45","46"]'::jsonb),

    ('genero', 'Gênero', 'selecao',
     '["Masculino","Feminino","Unissex","Infantil"]'::jsonb),

    ('cor_basica', 'Cor (lista pronta)', 'selecao',
     '["Preto","Branco","Cinza","Azul","Vermelho","Verde","Amarelo","Rosa","Roxo","Laranja","Marrom","Bege","Dourado","Prata","Multicor"]'::jsonb),

    ('material', 'Material', 'texto', null),

    -- ------------------------------------------- eletrônicos e celulares
    ('armazenamento', 'Armazenamento', 'selecao',
     '["16 GB","32 GB","64 GB","128 GB","256 GB","512 GB","1 TB"]'::jsonb),

    ('memoria_ram', 'Memória RAM', 'selecao',
     '["2 GB","3 GB","4 GB","6 GB","8 GB","12 GB","16 GB"]'::jsonb),

    ('condicao', 'Condição', 'selecao',
     '["Novo","Seminovo","Usado","Recondicionado","Mostruário"]'::jsonb),

    ('garantia_meses', 'Garantia (meses)', 'numero', null),

    -- ------------------------------------------------------- venda e giro
    ('unidade_de_venda', 'Unidade de venda', 'selecao',
     '["Unidade","Par","Caixa","Pacote","Kit","Dúzia","Quilo","Grama","Litro","Mililitro","Metro"]'::jsonb),

    ('sabor', 'Sabor', 'texto', null),
    ('fornecedor', 'Fornecedor', 'texto', null),
    ('lote', 'Lote', 'texto', null),
    ('localizacao', 'Onde fica na loja', 'texto', null)
  ) as v(chave, nome_exibicao, tipo_campo, opcoes)
 where not exists (
   select 1
     from public.campos_produto_disponiveis existente
    where existente.chave = v.chave
      and existente.empresa_id is null
 );
