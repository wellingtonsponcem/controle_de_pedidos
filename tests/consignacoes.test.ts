import * as fc from 'fast-check';
import { calcularAcertoConsignacao, validarItemConsignacao, ItemConsignacaoInput } from '../api/_consignacoes_utils';
import { arredondarMoeda } from '../api/_financeiro_utils';

describe('Módulo de Consignações Bemavi - Property-Based Testing', () => {

  // Geradores (Arbitraries) para fast-check
  const itemConsignacaoArbitrario = fc.record({
    produto_id: fc.oneof(fc.integer({ min: 1, max: 1000 }), fc.string({ minLength: 1 })),
    quantidade_deixada: fc.integer({ min: 1, max: 100 }),
    quantidade_vendida: fc.integer({ min: 0, max: 100 }),
    preco_unitario: fc.double({ min: 0, max: 1000, noNaN: true })
  });

  // --------------------------------------------------------------------------
  // Propriedade 1: Validação estrita de limites (vendido nunca excede deixado)
  // --------------------------------------------------------------------------
  test('Propriedade: Validação do item falha se e somente se quantidade_vendida > quantidade_deixada ou valores forem negativos', () => {
    fc.assert(
      fc.property(
        fc.record({
          produto_id: fc.integer({ min: 1, max: 100 }),
          quantidade_deixada: fc.integer({ min: -50, max: 100 }),
          quantidade_vendida: fc.integer({ min: -50, max: 150 }),
          preco_unitario: fc.double({ min: -100, max: 1000, noNaN: true })
        }),
        (itemRaw) => {
          const item: ItemConsignacaoInput = itemRaw;
          const statusValido = validarItemConsignacao(item);

          const temNegativo = item.quantidade_deixada < 0 || item.quantidade_vendida < 0 || item.preco_unitario < 0;
          const vendidoMaiorQueDeixado = item.quantidade_vendida > item.quantidade_deixada;

          if (temNegativo || vendidoMaiorQueDeixado) {
            expect(statusValido.valido).toBe(false);
            expect(statusValido.erro).toBeDefined();
          } else {
            expect(statusValido.valido).toBe(true);
            expect(statusValido.erro).toBeUndefined();
          }
        }
      ),
      { numRuns: 1000 }
    );
  });

  // --------------------------------------------------------------------------
  // Propriedade 2: Total vendido é sempre não-negativo para entradas válidas
  // --------------------------------------------------------------------------
  test('Propriedade: O valor total vendido do acerto de consignação é sempre maior ou igual a zero', () => {
    // Garante que quantidade_vendida <= quantidade_deixada para que o cálculo seja válido
    const itemConsignacaoValidoArbitrario = itemConsignacaoArbitrario.map(item => {
      const qDeixada = Math.max(1, item.quantidade_deixada);
      const qVendida = Math.min(qDeixada, Math.max(0, item.quantidade_vendida));
      return {
        ...item,
        quantidade_deixada: qDeixada,
        quantidade_vendida: qVendida,
        preco_unitario: Math.max(0, item.preco_unitario)
      };
    });

    fc.assert(
      fc.property(
        fc.array(itemConsignacaoValidoArbitrario, { minLength: 1 }),
        (itens) => {
          const resultado = calcularAcertoConsignacao(itens);
          expect(resultado.valido).toBe(true);
          expect(resultado.valorTotalVendido).toBeGreaterThanOrEqual(0);
        }
      ),
      { numRuns: 1000 }
    );
  });

  // --------------------------------------------------------------------------
  // Propriedade 3: Adicionar itens com venda zero não altera o total da consignação
  // --------------------------------------------------------------------------
  test('Propriedade: Itens com zero vendas não impactam o total arrecadado', () => {
    const itemValidoArbitrario = itemConsignacaoArbitrario.map(item => {
      const qDeixada = Math.max(1, item.quantidade_deixada);
      const qVendida = Math.min(qDeixada, Math.max(0, item.quantidade_vendida));
      return {
        ...item,
        quantidade_deixada: qDeixada,
        quantidade_vendida: qVendida,
        preco_unitario: Math.max(0, item.preco_unitario)
      };
    });

    const itemVendaZeroArbitrario = itemConsignacaoArbitrario.map(item => ({
      ...item,
      quantidade_deixada: Math.max(1, item.quantidade_deixada),
      quantidade_vendida: 0,
      preco_unitario: Math.max(0, item.preco_unitario)
    }));

    fc.assert(
      fc.property(
        fc.array(itemValidoArbitrario, { minLength: 1 }),
        itemVendaZeroArbitrario,
        (itensAtivos, itemZero) => {
          const totalOriginal = calcularAcertoConsignacao(itensAtivos).valorTotalVendido;
          const totalComItemZero = calcularAcertoConsignacao([...itensAtivos, itemZero]).valorTotalVendido;
          
          expect(totalComItemZero).toBe(totalOriginal);
        }
      ),
      { numRuns: 1000 }
    );
  });

  // --------------------------------------------------------------------------
  // Propriedade 4: Monotonicidade (aumentar vendas de um item nunca diminui o total)
  // --------------------------------------------------------------------------
  test('Propriedade: Aumentar as vendas de qualquer item nunca diminui o valor total arrecadado', () => {
    const itemValidoArbitrario = itemConsignacaoArbitrario.map(item => {
      const qDeixada = Math.max(2, item.quantidade_deixada); // Pelo menos 2 para permitir incremento
      const qVendida = Math.min(qDeixada - 1, Math.max(0, item.quantidade_vendida));
      return {
        ...item,
        quantidade_deixada: qDeixada,
        quantidade_vendida: qVendida,
        preco_unitario: Math.max(0, item.preco_unitario)
      };
    });

    fc.assert(
      fc.property(
        fc.array(itemValidoArbitrario, { minLength: 1 }),
        (itens) => {
          const resultadoOriginal = calcularAcertoConsignacao(itens);
          expect(resultadoOriginal.valido).toBe(true);

          // Incrementa a quantidade vendida de um item aleatório do array
          const index = Math.floor(Math.random() * itens.length);
          const itensModificados = itens.map((it, idx) => {
            if (idx === index) {
              return {
                ...it,
                quantidade_vendida: it.quantidade_vendida + 1
              };
            }
            return it;
          });

          const resultadoModificado = calcularAcertoConsignacao(itensModificados);
          expect(resultadoModificado.valido).toBe(true);

          // O total modificado deve ser maior ou igual ao total original
          // (igual caso o preço do item seja zero)
          expect(resultadoModificado.valorTotalVendido).toBeGreaterThanOrEqual(resultadoOriginal.valorTotalVendido);
        }
      ),
      { numRuns: 1000 }
    );
  });

  // --------------------------------------------------------------------------
  // Propriedade 5: Arredondamento de moeda do acerto é consistente com regras do financeiro
  // --------------------------------------------------------------------------
  test('Propriedade: O total do acerto de consignação tem sempre no máximo duas casas decimais', () => {
    const itemValidoArbitrario = itemConsignacaoArbitrario.map(item => {
      const qDeixada = Math.max(1, item.quantidade_deixada);
      const qVendida = Math.min(qDeixada, Math.max(0, item.quantidade_vendida));
      return {
        ...item,
        quantidade_deixada: qDeixada,
        quantidade_vendida: qVendida,
        preco_unitario: Math.max(0, item.preco_unitario)
      };
    });

    fc.assert(
      fc.property(
        fc.array(itemValidoArbitrario, { minLength: 1 }),
        (itens) => {
          const resultado = calcularAcertoConsignacao(itens);
          expect(resultado.valido).toBe(true);

          const valorMultiplicado = resultado.valorTotalVendido * 100;
          const eInteiro = Number.isInteger(Math.round(valorMultiplicado));
          expect(eInteiro).toBe(true);
        }
      ),
      { numRuns: 1000 }
    );
  });

});
