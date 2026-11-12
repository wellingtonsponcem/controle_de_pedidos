import pool from '../api/_db';

interface NatalProduct {
  nome: string;
  versao: string;
  sabor: string;
  modelo: string;
  preco_base: number;
  imagem_url: string;
}

const produtosNatal: NatalProduct[] = [
  // Chocotones Tradicionais (R$ 80,00)
  {
    nome: 'Chocotone Tradicional - Brigadeiro 50%',
    versao: 'Especial de Natal',
    sabor: 'Brigadeiro 50% cacau cremoso artesanal',
    modelo: 'Super Recheado (800g a 1kg)',
    preco_base: 80.00,
    imagem_url: 'assets/images/natal/prod-chocotone.jpg'
  },
  {
    nome: 'Chocotone Tradicional - Dois Amores',
    versao: 'Especial de Natal',
    sabor: 'Brigadeiro tradicional e brigadeiro branco artesanal',
    modelo: 'Super Recheado (800g a 1kg)',
    preco_base: 80.00,
    imagem_url: 'assets/images/natal/prod-chocotone.jpg'
  },
  {
    nome: 'Chocotone Tradicional - Doce de Leite',
    versao: 'Especial de Natal',
    sabor: 'Doce de leite cremoso artesanal',
    modelo: 'Super Recheado (800g a 1kg)',
    preco_base: 80.00,
    imagem_url: 'assets/images/natal/prod-chocotone.jpg'
  },
  {
    nome: 'Chocotone Tradicional - Prestígio',
    versao: 'Especial de Natal',
    sabor: 'Creme de coco artesanal com chocolate',
    modelo: 'Super Recheado (800g a 1kg)',
    preco_base: 80.00,
    imagem_url: 'assets/images/natal/prod-chocotone.jpg'
  },
  {
    nome: 'Chocotone Tradicional - Ninho',
    versao: 'Especial de Natal',
    sabor: 'Creme aveludado de leite Ninho',
    modelo: 'Super Recheado (800g a 1kg)',
    preco_base: 80.00,
    imagem_url: 'assets/images/natal/prod-chocotone.jpg'
  },

  // Chocotones Premium (R$ 100,00)
  {
    nome: 'Chocotone Premium - Nozes',
    versao: 'Especial de Natal',
    sabor: 'Recheio especial com nozes selecionadas',
    modelo: 'Super Recheado (800g a 1kg)',
    preco_base: 100.00,
    imagem_url: 'assets/images/natal/prod-chocotone.jpg'
  },
  {
    nome: 'Chocotone Premium - Ninho com Geleia de Morango',
    versao: 'Especial de Natal',
    sabor: 'Creme de ninho com geleia artesanal de morangos frescos',
    modelo: 'Super Recheado (800g a 1kg)',
    preco_base: 100.00,
    imagem_url: 'assets/images/natal/prod-chocotone.jpg'
  },
  {
    nome: 'Chocotone Premium - Ninho com Nutella',
    versao: 'Especial de Natal',
    sabor: 'Creme de ninho generoso e autêntica Nutella',
    modelo: 'Super Recheado (800g a 1kg)',
    preco_base: 100.00,
    imagem_url: 'assets/images/natal/prod-chocotone.jpg'
  },
  {
    nome: 'Chocotone Premium - Ferrero Rocher',
    versao: 'Especial de Natal',
    sabor: 'Creme de chocolate, avelãs e bombons Ferrero',
    modelo: 'Super Recheado (800g a 1kg)',
    preco_base: 100.00,
    imagem_url: 'assets/images/natal/prod-chocotone.jpg'
  },
  {
    nome: 'Chocotone Premium - Kinder',
    versao: 'Especial de Natal',
    sabor: 'Creme de chocolate ao leite e pedaços de Kinder',
    modelo: 'Super Recheado (800g a 1kg)',
    preco_base: 100.00,
    imagem_url: 'assets/images/natal/prod-chocotone.jpg'
  },

  // Sobremesas na Travessa - Tamanho P (R$ 69,90)
  {
    nome: 'Delícia de Morango na Travessa (P)',
    versao: 'Especial de Natal',
    sabor: 'Creme de chocolate, morangos frescos, creme de ninho, mousse e ganache',
    modelo: 'Travessa P (~4 pessoas)',
    preco_base: 69.90,
    imagem_url: 'assets/images/natal/prod-travessa-delicia-morango.jpg'
  },
  {
    nome: 'Moranguva na Travessa (P)',
    versao: 'Especial de Natal',
    sabor: 'Creme e mousse de ninho, uvas verdes, morangos, chocolate e fios de Nutella',
    modelo: 'Travessa P (~4 pessoas)',
    preco_base: 69.90,
    imagem_url: 'assets/images/natal/prod-travessa-moranguva.jpg'
  },
  {
    nome: 'Banoffee na Travessa (P)',
    versao: 'Especial de Natal',
    sabor: 'Farofinha doce, banana fresca, ninho, doce de leite, chantilly e canela',
    modelo: 'Travessa P (~4 pessoas)',
    preco_base: 69.90,
    imagem_url: 'assets/images/natal/prod-travessa-banoffee.jpg'
  },
  {
    nome: 'Tentação na Travessa (P)',
    versao: 'Especial de Natal',
    sabor: 'Brownie artesanal, creme de ninho, geleia de morango e creme de chocolate',
    modelo: 'Travessa P (~4 pessoas)',
    preco_base: 69.90,
    imagem_url: 'assets/images/natal/prod-travessa-tentacao.jpg'
  },
  {
    nome: 'Maracujá com Brownie na Travessa (P)',
    versao: 'Especial de Natal',
    sabor: 'Creme meio amargo, brownie, mousse e geleia artesanal de maracujá',
    modelo: 'Travessa P (~4 pessoas)',
    preco_base: 69.90,
    imagem_url: 'assets/images/natal/prod-travessa-maracuja-brownie.jpg'
  },
  {
    nome: 'Morangoffe na Travessa (P)',
    versao: 'Especial de Natal',
    sabor: 'Farofinha doce, creme e mousse de ninho, morangos frescos e suspiros',
    modelo: 'Travessa P (~4 pessoas)',
    preco_base: 69.90,
    imagem_url: 'assets/images/natal/prod-travessa-morangoffe.jpg'
  },
  {
    nome: 'Ferrero Rocher na Travessa (P)',
    versao: 'Especial de Natal',
    sabor: 'Mousse de chocolate, bolo molhadinho, amendoim, creme meio amargo, Nutella e Ferrero',
    modelo: 'Travessa P (~4 pessoas)',
    preco_base: 69.90,
    imagem_url: 'assets/images/natal/prod-travessa-ferrero.jpg'
  },

  // Sobremesas na Travessa - Tamanho G (R$ 169,90 ou R$ 179,90)
  {
    nome: 'Delícia de Morango na Travessa (G)',
    versao: 'Especial de Natal',
    sabor: 'Creme de chocolate, morangos frescos, creme de ninho, mousse e ganache',
    modelo: 'Travessa G (~10 pessoas)',
    preco_base: 179.90,
    imagem_url: 'assets/images/natal/prod-travessa-delicia-morango.jpg'
  },
  {
    nome: 'Moranguva na Travessa (G)',
    versao: 'Especial de Natal',
    sabor: 'Creme e mousse de ninho, uvas verdes, morangos, chocolate e fios de Nutella',
    modelo: 'Travessa G (~10 pessoas)',
    preco_base: 179.90,
    imagem_url: 'assets/images/natal/prod-travessa-moranguva.jpg'
  },
  {
    nome: 'Banoffee na Travessa (G)',
    versao: 'Especial de Natal',
    sabor: 'Farofinha doce, banana fresca, ninho, doce de leite, chantilly e canela',
    modelo: 'Travessa G (~10 pessoas)',
    preco_base: 169.90,
    imagem_url: 'assets/images/natal/prod-travessa-banoffee.jpg'
  },
  {
    nome: 'Tentação na Travessa (G)',
    versao: 'Especial de Natal',
    sabor: 'Brownie artesanal, creme de ninho, geleia de morango e creme de chocolate',
    modelo: 'Travessa G (~10 pessoas)',
    preco_base: 179.90,
    imagem_url: 'assets/images/natal/prod-travessa-tentacao.jpg'
  },
  {
    nome: 'Maracujá com Brownie na Travessa (G)',
    versao: 'Especial de Natal',
    sabor: 'Creme meio amargo, brownie, mousse e geleia artesanal de maracujá',
    modelo: 'Travessa G (~10 pessoas)',
    preco_base: 169.90,
    imagem_url: 'assets/images/natal/prod-travessa-maracuja-brownie.jpg'
  },
  {
    nome: 'Morangoffe na Travessa (G)',
    versao: 'Especial de Natal',
    sabor: 'Farofinha doce, creme e mousse de ninho, morangos frescos e suspiros',
    modelo: 'Travessa G (~10 pessoas)',
    preco_base: 179.90,
    imagem_url: 'assets/images/natal/prod-travessa-morangoffe.jpg'
  },
  {
    nome: 'Ferrero Rocher na Travessa (G)',
    versao: 'Especial de Natal',
    sabor: 'Mousse de chocolate, bolo molhadinho, amendoim, creme meio amargo, Nutella e Ferrero',
    modelo: 'Travessa G (~10 pessoas)',
    preco_base: 179.90,
    imagem_url: 'assets/images/natal/prod-travessa-ferrero.jpg'
  },

  // Taças Especiais 1,5kg (R$ 210,00)
  {
    nome: 'Taça Especial - Ouro Branco',
    versao: 'Especial de Natal',
    sabor: 'Creme de ninho, mousse de ninho, pedacinhos de bombom Ouro Branco e creme de chocolate',
    modelo: 'Taça Acrílico 1,5kg (~10 porções)',
    preco_base: 210.00,
    imagem_url: 'assets/images/natal/prod-taca-ouro-branco.jpg'
  },
  {
    nome: 'Taça Especial - Ferrero Rocher',
    versao: 'Especial de Natal',
    sabor: 'Creme de ninho, uvas verdes sem semente, mousse de ninho, morangos, chocolate e Nutella',
    modelo: 'Taça Acrílico 1,5kg (~10 porções)',
    preco_base: 210.00,
    imagem_url: 'assets/images/natal/prod-taca-ferrero.jpg'
  },
  {
    nome: 'Taça Especial - Delícia de Abacaxi',
    versao: 'Especial de Natal',
    sabor: 'Creme de ninho aveludado, compota artesanal de abacaxi e mousse de ninho',
    modelo: 'Taça Acrílico 1,5kg (~10 porções)',
    preco_base: 210.00,
    imagem_url: 'assets/images/natal/prod-taca-abacaxi.jpg'
  },
  {
    nome: 'Taça Especial - Brownie com Morango',
    versao: 'Especial de Natal',
    sabor: 'Creme de ninho, brownie, morangos frescos, creme de chocolate, brigadeiros e morangos',
    modelo: 'Taça Acrílico 1,5kg (~10 porções)',
    preco_base: 210.00,
    imagem_url: 'assets/images/natal/prod-taca-brownie-morango.jpg'
  },
  {
    nome: 'Taça Especial - Brownie com Uva',
    versao: 'Especial de Natal',
    sabor: 'Creme de ninho, brownie, uvas verdes sem semente, chocolate, branquinhos e uvas',
    modelo: 'Taça Acrílico 1,5kg (~10 porções)',
    preco_base: 210.00,
    imagem_url: 'assets/images/natal/prod-taca-brownie-uva.jpg'
  },
  {
    nome: 'Taça Especial - Pavê de Morango',
    versao: 'Especial de Natal',
    sabor: 'Creme de ninho, biscoito champanhe, morangos frescos e mousse leve de ninho',
    modelo: 'Taça Acrílico 1,5kg (~10 porções)',
    preco_base: 210.00,
    imagem_url: 'assets/images/natal/prod-taca-pave-morango.jpg'
  },

  // Pudim Tradicional (R$ 60,00)
  {
    nome: 'Pudim Tradicional Bemavi',
    versao: 'Especial de Natal',
    sabor: 'Cremoso, na medida certa, calda artesanal de caramelo brilhante',
    modelo: 'Forma Tradicional (~1kg)',
    preco_base: 60.00,
    imagem_url: 'assets/images/natal/prod-pudim.jpg'
  }
];

async function seed() {
  console.log('--- Iniciando cadastro dos Produtos de Natal no Neon Postgres ---');
  let cadastrados = 0;
  let atualizados = 0;

  for (const prod of produtosNatal) {
    const existing = await pool.query(
      'SELECT id FROM produtos WHERE nome = $1 AND modelo = $2',
      [prod.nome, prod.modelo]
    );

    if (existing.rows.length > 0) {
      await pool.query(
        `UPDATE produtos 
         SET versao = $1, sabor = $2, preco_base = $3, imagem_url = $4, ativo = TRUE, updated_at = NOW()
         WHERE id = $5`,
        [prod.versao, prod.sabor, prod.preco_base, prod.imagem_url, existing.rows[0].id]
      );
      atualizados++;
    } else {
      await pool.query(
        `INSERT INTO produtos (nome, versao, sabor, modelo, preco_base, imagem_url, ativo)
         VALUES ($1, $2, $3, $4, $5, $6, TRUE)`,
        [prod.nome, prod.versao, prod.sabor, prod.modelo, prod.preco_base, prod.imagem_url]
      );
      cadastrados++;
    }
  }

  console.log(`Sucesso: ${cadastrados} produtos cadastrados, ${atualizados} atualizados.`);
  await pool.end();
}

seed().catch((err) => {
  console.error('Erro ao cadastrar produtos de natal:', err);
  process.exit(1);
});
