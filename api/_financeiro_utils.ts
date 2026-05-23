/**
 * Utilitários Financeiros Puros da Bemavi.
 * Focado em resiliência aritmética contra imprecisões de ponto flutuante IEEE 754 em JS/TS.
 */

export interface TransacaoSimplificada {
  tipo: 'Receita' | 'Despesa';
  valor: number;
}

export interface BalancoConsolidado {
  totalReceitas: number;
  totalDespesas: number;
  lucroLiquido: number;
}

/**
 * Arredonda um valor numérico decimal para exatamente duas casas decimais,
 * evitando erros clássicos de arredondamento IEEE 754 em cálculos financeiros.
 */
export function arredondarMoeda(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

/**
 * Calcula o valor líquido de uma transação deduzindo a taxa da maquininha,
 * aplicando arredondamento seguro contra inconsistências decimais (IEEE 754).
 * Invariantes:
 * - Se taxaPorcentagem === 0, retorna o próprio valorBruto arredondado.
 * - Se taxaPorcentagem === 100, retorna exatamente 0.00.
 * - valorLiquido <= valorBruto (para taxas positivas).
 */
export function calcularValorLiquido(valorBruto: number, taxaPorcentagem: number): number {
  const valorBrutoArredondado = arredondarMoeda(valorBruto);
  if (isNaN(valorBrutoArredondado) || valorBrutoArredondado <= 0) {
    return 0;
  }
  const taxaArredondada = Math.max(0, Math.min(100, taxaPorcentagem));
  if (isNaN(taxaArredondada) || taxaArredondada === 0) {
    return valorBrutoArredondado;
  }
  const desconto = valorBrutoArredondado * (taxaArredondada / 100);
  return arredondarMoeda(valorBrutoArredondado - desconto);
}

/**
 * Agrega e consolida uma lista de transações financeiras de forma puramente funcional.
 * Invariantes Garantidas:
 * 1. totalReceitas >= 0
 * 2. totalDespesas >= 0
 * 3. lucroLiquido === totalReceitas - totalDespesas
 * 4. Resiliência absoluta contra entradas de ponto flutuante arbitrárias.
 */
export function calcularBalanco(transacoes: TransacaoSimplificada[]): BalancoConsolidado {
  let receitasAcumuladas = 0;
  let despesasAcumuladas = 0;

  for (const transacao of transacoes) {
    const valorArredondado = arredondarMoeda(transacao.valor);
    
    // Ignorar valores inválidos ou negativos na agregação física
    if (isNaN(valorArredondado) || valorArredondado <= 0) {
      continue;
    }

    if (transacao.tipo === 'Receita') {
      receitasAcumuladas += valorArredondado;
    } else if (transacao.tipo === 'Despesa') {
      despesasAcumuladas += valorArredondado;
    }
  }

  const totalReceitas = arredondarMoeda(receitasAcumuladas);
  const totalDespesas = arredondarMoeda(despesasAcumuladas);
  const lucroLiquido = arredondarMoeda(totalReceitas - totalDespesas);

  return {
    totalReceitas,
    totalDespesas,
    lucroLiquido
  };
}
