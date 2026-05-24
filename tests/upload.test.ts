import * as fc from 'fast-check';
import { gerarAssinaturaCloudinary } from '../api/upload';

/**
 * Suite de Testes Baseados em Propriedades (Property-Based Testing) para o Módulo de Upload (Cloudinary).
 * Testa indutivamente a corretude criptográfica do gerador de assinaturas SHA-1 assinado do Cloudinary,
 * garantindo invariância de ordenação de chaves, consistência de formato hexadecimal e alta sensibilidade a mudanças de entrada.
 */

describe('Módulo de Upload (Cloudinary) - Criptografia baseada em Propriedades', () => {

  // Propriedade 1: O tamanho do hash resultante de qualquer parâmetro ou segredo deve ser sempre exatamente 40 caracteres (SHA-1)
  test('Propriedade: O hash SHA-1 de assinatura tem sempre comprimento exato de 40 caracteres', () => {
    fc.assert(
      fc.property(
        fc.dictionary(fc.string({ minLength: 1 }), fc.oneof(fc.string(), fc.integer())),
        fc.string({ minLength: 1 }),
        (params, apiSecret) => {
          const assinatura = gerarAssinaturaCloudinary(params, apiSecret);
          expect(assinatura.length).toBe(40);
        }
      ),
      { numRuns: 1000 }
    );
  });

  // Propriedade 2: O hash resultante deve consistir estritamente em caracteres hexadecimais minúsculos [0-9a-f]
  test('Propriedade: O hash SHA-1 de assinatura consiste apenas em caracteres hexadecimais minúsculos', () => {
    const regexHexadecimal = /^[0-9a-f]{40}$/;
    fc.assert(
      fc.property(
        fc.dictionary(fc.string({ minLength: 1 }), fc.oneof(fc.string(), fc.integer())),
        fc.string({ minLength: 1 }),
        (params, apiSecret) => {
          const assinatura = gerarAssinaturaCloudinary(params, apiSecret);
          expect(regexHexadecimal.test(assinatura)).toBe(true);
        }
      ),
      { numRuns: 1000 }
    );
  });

  // Propriedade 3: A mesma entrada exata produz sempre o mesmo hash exato (Determinismo Estrito)
  test('Propriedade: A geração de assinatura do Cloudinary é estritamente determinística', () => {
    fc.assert(
      fc.property(
        fc.dictionary(fc.string({ minLength: 1 }), fc.oneof(fc.string(), fc.integer())),
        fc.string({ minLength: 1 }),
        (params, apiSecret) => {
          const assinatura1 = gerarAssinaturaCloudinary(params, apiSecret);
          const assinatura2 = gerarAssinaturaCloudinary(params, apiSecret);
          
          expect(assinatura1).toBe(assinatura2);
        }
      ),
      { numRuns: 500 }
    );
  });

  // Propriedade 4: A alteração de um único caractere no segredo ou nos parâmetros altera radicalmente o hash resultante (Efeito Avalanche)
  test('Propriedade: Alteração na chave secreta gera assinaturas completamente distintas', () => {
    fc.assert(
      fc.property(
        fc.dictionary(fc.string({ minLength: 1 }), fc.oneof(fc.string(), fc.integer())),
        fc.string({ minLength: 1 }),
        (params, apiSecret) => {
          const apiSecretModificado = apiSecret + 'a';
          const assinaturaOriginal = gerarAssinaturaCloudinary(params, apiSecret);
          const assinaturaModificada = gerarAssinaturaCloudinary(params, apiSecretModificado);
          
          expect(assinaturaOriginal).not.toBe(assinaturaModificada);
        }
      ),
      { numRuns: 500 }
    );
  });

  // Propriedade 5: A ordem em que os parâmetros são definidos no objeto JS não altera a assinatura final (Invariante de Ordenação do Cloudinary)
  test('Propriedade: A ordenação alfabética interna garante invariância da ordem de entrada no objeto JS', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }), // Chave 1
        fc.string({ minLength: 1 }), // Chave 2
        fc.oneof(fc.string(), fc.integer()), // Valor 1
        fc.oneof(fc.string(), fc.integer()), // Valor 2
        fc.string({ minLength: 1 }), // Secret
        (k1, k2, v1, v2, apiSecret) => {
          // Garante chaves únicas e válidas
          const chave1 = k1.replace(/[=&]/g, '');
          const chave2 = k2.replace(/[=&]/g, '');
          if (chave1 === chave2 || !chave1 || !chave2) return;

          // Cria dois objetos com chaves inseridas em ordens diferentes
          const objetoOrdemA: Record<string, string | number> = {};
          objetoOrdemA[chave1] = v1;
          objetoOrdemA[chave2] = v2;

          const objetoOrdemB: Record<string, string | number> = {};
          objetoOrdemB[chave2] = v2;
          objetoOrdemB[chave1] = v1;

          const assinaturaA = gerarAssinaturaCloudinary(objetoOrdemA, apiSecret);
          const assinaturaB = gerarAssinaturaCloudinary(objetoOrdemB, apiSecret);

          expect(assinaturaA).toBe(assinaturaB);
        }
      ),
      { numRuns: 1000 }
    );
  });

});
