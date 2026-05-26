import * as fc from 'fast-check';
import { podeExcluirPedido } from '../api/_pedidos_utils';

/**
 * Suite de Testes Baseados em Propriedades (Property-Based Testing) para Exclusão de Pedidos.
 * Utiliza o fast-check para provar de forma robusta e indutiva a resiliência e corretude da
 * regra de segurança de exclusão apenas para pedidos cancelados.
 */
describe('Regra de Exclusão de Pedidos - Property-Based Testing', () => {

  // Propriedade 1: Qualquer variação da string "Cancelado" com espaços extras ou diferenças de caixa deve retornar true
  test('Propriedade: Variações válidas da palavra "Cancelado" sempre retornam true', () => {
    const geradorCanceladoValido = fc.constantFrom(
      'Cancelado',
      'cancelado',
      'CANCELADO',
      ' Cancelado ',
      '\tcancelado\n',
      '  CANCELADO  '
    );

    fc.assert(
      fc.property(geradorCanceladoValido, (status) => {
        expect(podeExcluirPedido(status)).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  // Propriedade 2: Qualquer outra string que não represente "cancelado" deve retornar false
  test('Propriedade: Qualquer outro status ou string arbitrária retorna false', () => {
    // Filtra strings que não se tornam "cancelado" após trim e toLowerCase
    const geradorStringsInvalidas = fc.string().filter(
      (str) => str.trim().toLowerCase() !== 'cancelado'
    );

    fc.assert(
      fc.property(geradorStringsInvalidas, (status) => {
        expect(podeExcluirPedido(status)).toBe(false);
      }),
      { numRuns: 1000 } // Executa 1000 testes aleatórios!
    );
  });

  // Propriedade 3: Valores nulos, indefinidos ou vazios devem retornar false
  test('Propriedade: Valores nulos, vazios ou indefinidos retornam false', () => {
    const geradorValoresVazios = fc.constantFrom(null, undefined, '', '   ');

    fc.assert(
      fc.property(geradorValoresVazios, (status) => {
        expect(podeExcluirPedido(status)).toBe(false);
      }),
      { numRuns: 50 }
    );
  });

});
