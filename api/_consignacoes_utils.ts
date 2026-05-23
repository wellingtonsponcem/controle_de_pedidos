import { arredondarMoeda } from './_financeiro_utils';

export interface ItemConsignacaoInput {
  id?: number | string;
  produto_id: number | string;
  quantidade_deixada: number;
  quantidade_vendida: number;
  preco_unitario: number;
}

export interface ResultadoCalculoConsignacao {
  valido: boolean;
  erro?: string;
  valorTotalVendido: number;
}

/**
 * Valida a integridade matemática de um item de consignação durante o acerto de contas.
 * Invariantes de Negócio:
 * 1. quantidade_deixada >= 0
 * 2. quantidade_vendida >= 0
 * 3. preco_unitario >= 0
 * 4. quantidade_vendida <= quantidade_deixada (não se pode vender mais do que foi deixado)
 */
export function validarItemConsignacao(item: ItemConsignacaoInput): { valido: boolean; erro?: string } {
  if (isNaN(item.quantidade_deixada) || item.quantidade_deixada < 0) {
    return { valido: false, erro: 'Quantidade deixada não pode ser negativa ou inválida.' };
  }
  if (isNaN(item.quantidade_vendida) || item.quantidade_vendida < 0) {
    return { valido: false, erro: 'Quantidade vendida não pode ser negativa ou inválida.' };
  }
  if (isNaN(item.preco_unitario) || item.preco_unitario < 0) {
    return { valido: false, erro: 'Preço unitário não pode ser negativo ou inválido.' };
  }
  if (item.quantidade_vendida > item.quantidade_deixada) {
    return { 
      valido: false, 
      erro: `Quantidade vendida (${item.quantidade_vendida}) não pode exceder a quantidade deixada (${item.quantidade_deixada}).` 
    };
  }
  return { valido: true };
}

/**
 * Calcula o valor total obtido nas vendas da consignação, garantindo consistência aritmética de ponto flutuante.
 * Retorna um resultado contendo o status da validação e o total financeiro calculado.
 */
export function calcularAcertoConsignacao(itens: ItemConsignacaoInput[]): ResultadoCalculoConsignacao {
  if (!Array.isArray(itens) || itens.length === 0) {
    return { valido: false, erro: 'A consignação deve conter pelo menos um item.', valorTotalVendido: 0 };
  }

  let totalAcumulado = 0;

  for (const item of itens) {
    const validacao = validarItemConsignacao(item);
    if (!validacao.valido) {
      return { valido: false, erro: validacao.erro, valorTotalVendido: 0 };
    }

    const valorItem = item.quantidade_vendida * item.preco_unitario;
    totalAcumulado += valorItem;
  }

  return {
    valido: true,
    valorTotalVendido: arredondarMoeda(totalAcumulado)
  };
}
