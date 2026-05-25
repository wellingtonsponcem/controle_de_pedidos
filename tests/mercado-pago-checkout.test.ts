import * as fc from 'fast-check';
import { toPositiveQuantity, normalizePhone, emailFromPhone } from '../api/mercado-pago-checkout';

/**
 * Suite de Testes Baseados em Propriedades (Property-Based Testing) para as funções utilitárias do Checkout do Mercado Pago.
 * Garante indutivamente que as operações de conversão de dados do cliente, limpeza de parâmetros de telefone,
 * e-mail e tratamento de quantidades de itens de carrinho se comportem corretamente diante de qualquer cenário extremo de entrada.
 */

describe('Módulo do Mercado Pago Checkout - Validação Baseada em Propriedades', () => {

  describe('toPositiveQuantity() - Conversão e Sanitização de Quantidades', () => {
    
    // Propriedade 1: O resultado deve ser sempre um inteiro não-negativo (invariante absoluta)
    test('Propriedade: O valor retornado é sempre um número inteiro maior ou igual a zero', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.integer(),
            fc.float(),
            fc.double(),
            fc.string(),
            fc.boolean(),
            fc.constant(null),
            fc.constant(undefined)
          ),
          (input) => {
            const qty = toPositiveQuantity(input);
            expect(typeof qty).toBe('number');
            expect(Number.isInteger(qty)).toBe(true);
            expect(qty).toBeGreaterThanOrEqual(0);
          }
        ),
        { numRuns: 1000 }
      );
    });

    // Propriedade 2: A mesma entrada exata produz sempre a mesma saída (Determinismo Estrito)
    test('Propriedade: O tratamento de quantidade é estritamente determinístico', () => {
      fc.assert(
        fc.property(
          fc.oneof(fc.integer(), fc.string(), fc.constant(null)),
          (input) => {
            const qty1 = toPositiveQuantity(input);
            const qty2 = toPositiveQuantity(input);
            expect(qty1).toBe(qty2);
          }
        ),
        { numRuns: 500 }
      );
    });

    // Propriedade 3: Valores numéricos positivos são mantidos como inteiros arredondados para baixo
    test('Propriedade: Números positivos são mantidos e truncados (arredondados para baixo)', () => {
      fc.assert(
        fc.property(
          fc.double({ min: 0, max: 100000 }),
          (val) => {
            const qty = toPositiveQuantity(val);
            expect(qty).toBe(Math.floor(val));
          }
        ),
        { numRuns: 500 }
      );
    });
  });

  describe('normalizePhone() - Limpeza de Números de Telefone', () => {

    // Propriedade 1: O telefone retornado deve conter estritamente dígitos [0-9]
    test('Propriedade: O resultado contém apenas dígitos numéricos', () => {
      fc.assert(
        fc.property(
          fc.string(),
          (input) => {
            const normalized = normalizePhone(input);
            expect(/^[0-9]*$/.test(normalized)).toBe(true);
          }
        ),
        { numRuns: 1000 }
      );
    });

    // Propriedade 2: O comprimento do telefone higienizado é sempre menor ou igual ao comprimento original
    test('Propriedade: O comprimento do telefone resultante é menor ou igual ao original', () => {
      fc.assert(
        fc.property(
          fc.string(),
          (input) => {
            const normalized = normalizePhone(input);
            expect(normalized.length).toBeLessThanOrEqual(input.length);
          }
        ),
        { numRuns: 1000 }
      );
    });
  });

  describe('emailFromPhone() - Geração Idempotente de E-mails Fictícios', () => {

    // Propriedade 1: O e-mail gerado deve sempre terminar estritamente com o domínio oficial da aplicação
    test('Propriedade: O e-mail gerado termina sempre com @bemavi.local', () => {
      fc.assert(
        fc.property(
          fc.string(),
          (phone) => {
            const email = emailFromPhone(phone);
            expect(email.endsWith('@bemavi.local')).toBe(true);
          }
        ),
        { numRuns: 1000 }
      );
    });

    // Propriedade 2: Se a entrada for vazia ou sem dígitos, o e-mail resultante deve ser exatamente cliente@bemavi.local
    test('Propriedade: Entradas sem nenhum dígito resultam no padrão cliente@bemavi.local', () => {
      fc.assert(
        fc.property(
          fc.string().filter(str => !/\d/.test(str)), // apenas strings sem dígitos
          (nonDigitStr) => {
            const email = emailFromPhone(nonDigitStr);
            expect(email).toBe('cliente@bemavi.local');
          }
        ),
        { numRuns: 500 }
      );
    });
  });

});
