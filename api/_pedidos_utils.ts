/**
 * Verifica se um pedido com determinado status pode ser excluído definitivamente.
 * Regra de Segurança: Apenas pedidos previamente cancelados podem ser excluídos fisicamente do banco de dados.
 */
export function podeExcluirPedido(status: string | null | undefined): boolean {
  if (!status) return false;
  return status.trim().toLowerCase() === 'cancelado';
}
