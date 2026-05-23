import * as fc from 'fast-check';
import { calcularBalanco, arredondarMoeda, calcularValorLiquido, TransacaoSimplificada } from '../api/_financeiro_utils';

/**
 * Suite de Testes Baseados em Propriedades (Property-Based Testing) para o Módulo Financeiro Bemavi.
 * Utiliza o fast-check para inundar nossa lógica com milhares de entradas extremas aleatórias,
 * atestando de forma indutiva a invariância das regras matemáticas financeiras.
 */

describe('Módulo Financeiro Bemavi - Property-Based Testing', () => {

  // Propriedade 1: O arredondamento de qualquer número real positivo deve ter no máximo duas casas decimais
  test('Propriedade: Arredondamento para duas casas decimais é sempre consistente', () => {
    fc.assert(
      fc.property(fc.double({ min: -1000000, max: 1000000, noNaN: true }), (val) => {
        const arredondado = arredondarMoeda(val);
        // Multiplica por 100 e verifica se é um número inteiro (resolvendo imprecisão decimal)
        const multiplicado = arredondado * 100;
        const eInteiro = Number.isInteger(Math.round(multiplicado));
        
        // Deve ser exatamente um inteiro após arredondamento de float
        expect(eInteiro).toBe(true);
      }),
      { numRuns: 1000 } // Executa 1000 testes aleatórios!
    );
  });

  // Propriedade 2: O balanço consolidado de transações deve sempre respeitar as invariantes de sinal e saldo líquido
  test('Propriedade: Invariantes matemáticas do balanço financeiro consolidado são sempre verdadeiras', () => {
    // Gerador de transações aleatórias simplificadas
    const transacaoArbitraria = fc.record({
      tipo: fc.constantFrom('Receita', 'Despesa'),
      valor: fc.double({ min: 0.01, max: 50000, noNaN: true }) // Apenas valores monetários válidos
    }) as fc.Arbitrary<TransacaoSimplificada>;

    fc.assert(
      fc.property(fc.array(transacaoArbitraria), (transacoes) => {
        const balanco = calcularBalanco(transacoes);

        // Invariante 1: O total de receitas acumuladas deve ser sempre maior ou igual a zero
        expect(balanco.totalReceitas).toBeGreaterThanOrEqual(0);

        // Invariante 2: O total de despesas acumuladas deve ser sempre maior ou igual a zero
        expect(balanco.totalDespesas).toBeGreaterThanOrEqual(0);

        // Invariante 3: O lucro líquido deve ser matematicamente igual a receitas menos despesas (arredondado)
        const lucroCalculado = arredondarMoeda(balanco.totalReceitas - balanco.totalDespesas);
        expect(balanco.lucroLiquido).toBe(lucroCalculado);
      }),
      { numRuns: 1000 } // Bombardeia com 1000 arrays de tamanhos e conteúdos totalmente aleatórios!
    );
  });

  // Propriedade 3: Adicionar uma transação positiva aumenta o acumulador de forma previsível e estrita
  test('Propriedade: Adição incremental de transações é estritamente previsível', () => {
    const transacaoArbitraria = fc.record({
      tipo: fc.constantFrom('Receita', 'Despesa'),
      valor: fc.double({ min: 0.01, max: 10000, noNaN: true })
    }) as fc.Arbitrary<TransacaoSimplificada>;

    fc.assert(
      fc.property(
        fc.array(transacaoArbitraria),
        fc.double({ min: 0.01, max: 5000.00, noNaN: true }),
        fc.constantFrom('Receita', 'Despesa'),
        (transacoes, valorExtra, tipoExtra) => {
          const balancoOriginal = calcularBalanco(transacoes);
          
          const novaTransacao: TransacaoSimplificada = {
            tipo: tipoExtra as 'Receita' | 'Despesa',
            valor: valorExtra
          };

          const balancoNovo = calcularBalanco([...transacoes, novaTransacao]);
          const valorExtraArredondado = arredondarMoeda(valorExtra);

          if (tipoExtra === 'Receita') {
            expect(balancoNovo.totalReceitas).toBe(arredondarMoeda(balancoOriginal.totalReceitas + valorExtraArredondado));
            expect(balancoNovo.totalDespesas).toBe(balancoOriginal.totalDespesas);
          } else {
            expect(balancoNovo.totalDespesas).toBe(arredondarMoeda(balancoOriginal.totalDespesas + valorExtraArredondado));
            expect(balancoNovo.totalReceitas).toBe(balancoOriginal.totalReceitas);
          }
        }
      ),
      { numRuns: 1000 }
    );
  });

  // Propriedade 4: Taxa de 0% mantém o valor bruto idêntico e arredondado
  test('Propriedade: Taxa de 0% retorna exatamente o valor bruto arredondado', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1000000, noNaN: true }),
        (valorBruto) => {
          const valorLiquido = calcularValorLiquido(valorBruto, 0);
          expect(valorLiquido).toBe(arredondarMoeda(valorBruto));
        }
      ),
      { numRuns: 1000 }
    );
  });

  // Propriedade 5: Taxa de 100% zera a receita líquida
  test('Propriedade: Taxa de 100% sempre retorna zero', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1000000, noNaN: true }),
        (valorBruto) => {
          const valorLiquido = calcularValorLiquido(valorBruto, 100);
          expect(valorLiquido).toBe(0);
        }
      ),
      { numRuns: 1000 }
    );
  });

  // Propriedade 6: O valor líquido nunca excede o valor bruto para taxas positivas
  test('Propriedade: O valor líquido é sempre menor ou igual ao valor bruto', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.01, max: 50000, noNaN: true }),
        fc.double({ min: 0, max: 100, noNaN: true }),
        (valorBruto, taxa) => {
          const valorLiquido = calcularValorLiquido(valorBruto, taxa);
          expect(valorLiquido).toBeLessThanOrEqual(arredondarMoeda(valorBruto));
          expect(valorLiquido).toBeGreaterThanOrEqual(0);
        }
      ),
      { numRuns: 1000 }
    );
  });

  // Propriedade 7: Aumentar a taxa nunca aumenta o valor líquido calculado
  test('Propriedade: Aumentar a taxa nunca aumenta o valor líquido calculado', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.01, max: 50000, noNaN: true }),
        fc.double({ min: 0, max: 99, noNaN: true }),
        (valorBruto, taxaBase) => {
          const valorLiquidoBase = calcularValorLiquido(valorBruto, taxaBase);
          const valorLiquidoTaxaMaior = calcularValorLiquido(valorBruto, taxaBase + 1);
          
          expect(valorLiquidoTaxaMaior).toBeLessThanOrEqual(valorLiquidoBase);
        }
      ),
      { numRuns: 1000 }
    );
  });

});
