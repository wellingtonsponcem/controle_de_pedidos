import pool, { withTransaction } from './_db';

/**
 * Handler Serverless para o endpoint /api/cron-recorrencia
 * Executa a varredura de pedidos recorrentes ativos ('Entregue', 'Agendado', 'Pendente') 
 * e pré-gera de forma transacional e automatizada os rascunhos para os próximos ciclos.
 * 
 * Regras de Negócio:
 * - Filtra pedidos com recorrente_flag = true e status elegíveis.
 * - Calcula a próxima data ideal:
 *   - 'Semanal' = +7 dias
 *   - 'Quinzenal' = +14 dias
 *   - 'Mensal' = +30 dias
 * - Previne duplicações verificando se o cliente já possui um pedido na mesma data alvo.
 * - Copia de forma idêntica os itens do pedido base com os preços atualizados do banco.
 * - O novo pedido é criado em status 'Rascunho' para que o administrador aprove.
 */
export default async function handler(req: any, res: any) {
  // Para fins de segurança, aceitamos apenas POST (comum em Vercel Cron Jobs) ou GET para testes manuais
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({ error: `Método ${req.method} não suportado.` });
  }

  // Opcional: Validar token secreto do Vercel Cron no cabeçalho Authorization se estiver em produção
  // const authHeader = req.headers.authorization;
  // if (process.env.NODE_ENV === 'production' && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
  //   return res.status(401).json({ error: 'Não autorizado a disparar o cron job.' });
  // }

  try {
    // 1. Buscar todos os pedidos marcados como recorrentes que estão confirmados ou em andamento
    const queryPedidosRecorrentes = `
      SELECT DISTINCT ON (cliente_id, recorrente_intervalo) 
             id, cliente_id, data_agendada, municipio_entrega, status, recorrente_flag, recorrente_intervalo, observacao
      FROM pedidos
      WHERE recorrente_flag = true 
        AND status IN ('Pendente', 'Agendado', 'Entregue')
      ORDER BY cliente_id, recorrente_intervalo, data_agendada DESC
    `;
    const resultPedidos = await pool.query(queryPedidosRecorrentes);
    const pedidosBases = resultPedidos.rows;

    const pedidosGerados: any[] = [];
    const logsExecucao: string[] = [];

    // 2. Processar cada pedido base individualmente para manter a resiliência por lote
    for (const pedidoBase of pedidosBases) {
      const { id: pedidoBaseId, cliente_id, data_agendada, municipio_entrega, recorrente_intervalo, observacao } = pedidoBase;

      // Calcular a próxima data com base no intervalo
      const dataOriginal = new Date(data_agendada);
      const dataProxima = new Date(dataOriginal);

      if (recorrente_intervalo === 'Semanal') {
        dataProxima.setDate(dataOriginal.getDate() + 7);
      } else if (recorrente_intervalo === 'Quinzenal') {
        dataProxima.setDate(dataOriginal.getDate() + 14);
      } else if (recorrente_intervalo === 'Mensal') {
        dataProxima.setDate(dataOriginal.getDate() + 30);
      } else {
        logsExecucao.push(`Pedido base ${pedidoBaseId}: Intervalo '${recorrente_intervalo}' desconhecido. Ignorado.`);
        continue;
      }

      // Formatando datas para comparação sem horas (truncado)
      const dataProximaString = dataProxima.toISOString().split('T')[0];

      // Executar criação do próximo pedido rascunho de forma transacional individual
      try {
        const resultado = await withTransaction(async (client) => {
          // A. Verificar se já existe um pedido para este cliente na mesma data planejada (evita duplicidade)
          const checkQuery = `
            SELECT id FROM pedidos 
            WHERE cliente_id = $1 
              AND DATE(data_agendada) = DATE($2)
              AND status != 'Cancelado'
          `;
          const checkRes = await client.query(checkQuery, [cliente_id, dataProximaString]);

          if (checkRes.rows.length > 0) {
            return { duplicado: true, data: dataProximaString };
          }

          // B. Obter itens originais do pedido base
          const itensQuery = `
            SELECT ip.produto_id, ip.quantidade, prod.preco_base, prod.ativo
            FROM itens_pedido ip
            JOIN produtos prod ON ip.produto_id = prod.id
            WHERE ip.pedido_id = $1
          `;
          const itensRes = await client.query(itensQuery, [pedidoBaseId]);
          const itensOriginais = itensRes.rows;

          if (itensOriginais.length === 0) {
            throw new Error('O pedido base de recorrência não possui itens cadastrados.');
          }

          // C. Calcular valores do pedido com base nos preços ATUAIS do catálogo
          let valorProdutos = 0;
          const itensValidados = [];

          for (const item of itensOriginais) {
            if (!item.ativo) {
              logsExecucao.push(`Aviso: Produto ${item.produto_id} está inativo no catálogo. Gerando com preço base antigo.`);
            }
            const precoUnitario = Number(item.preco_base);
            valorProdutos += precoUnitario * item.quantidade;
            itensValidados.push({
              produto_id: item.produto_id,
              quantidade: item.quantidade,
              preco_unitario: precoUnitario
            });
          }

          // D. Obter taxa de entrega atualizada para o município
          const taxaQuery = await client.query('SELECT valor_taxa FROM taxas_entrega WHERE municipio = $1', [municipio_entrega]);
          if (taxaQuery.rows.length === 0) {
            throw new Error(`Município '${municipio_entrega}' não é atendido pela logística Bemavi.`);
          }
          const valorEntrega = Number(taxaQuery.rows[0].valor_taxa);
          const valorTotal = valorProdutos + valorEntrega;

          // E. Criar o novo pedido em estado 'Rascunho'
          const observacaoAutomatica = `[Recorrência Automática] Gerado a partir do pedido base ${pedidoBaseId}. ${observacao || ''}`;
          const insertPedidoQuery = `
            INSERT INTO pedidos (cliente_id, data_agendada, municipio_entrega, valor_produtos, valor_entrega, valor_total, status, recorrente_flag, recorrente_intervalo, observacao)
            VALUES ($1, $2, $3, $4, $5, $6, 'Rascunho', true, $7, $8) RETURNING *
          `;
          const insertPedidoRes = await client.query(insertPedidoQuery, [
            cliente_id, dataProxima, municipio_entrega, valorProdutos, valorEntrega, valorTotal, recorrente_intervalo, observacaoAutomatica
          ]);
          const novoPedido = insertPedidoRes.rows[0];

          // F. Inserir itens no novo pedido
          const insertItemQuery = `
            INSERT INTO itens_pedido (pedido_id, produto_id, quantidade, preco_unitario)
            VALUES ($1, $2, $3, $4)
          `;
          for (const item of itensValidados) {
            await client.query(insertItemQuery, [novoPedido.id, item.produto_id, item.quantidade, item.preco_unitario]);
          }

          return { duplicado: false, pedido: novoPedido };
        });

        if (resultado.duplicado) {
          logsExecucao.push(`Pedido base ${pedidoBaseId} para cliente ${cliente_id}: Pedido já agendado para ${resultado.data}. Pulado.`);
        } else {
          pedidosGerados.push(resultado.pedido);
          logsExecucao.push(`Sucesso: Gerado pedido rascunho ${resultado.pedido?.id} agendado para ${dataProximaString}.`);
        }
      } catch (innerError: any) {
        console.error(`Erro ao gerar recorrência para o pedido base ${pedidoBaseId}:`, innerError);
        logsExecucao.push(`Erro no pedido base ${pedidoBaseId}: ${innerError.message}`);
      }
    }

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(200).json({
      message: `Processamento de recorrência finalizado. Pedidos rascunhos criados: ${pedidosGerados.length}`,
      pedidos_gerados: pedidosGerados,
      logs: logsExecucao
    });
  } catch (error: any) {
    console.error('Falha crítica ao executar cron de recorrência:', error);
    return res.status(500).json({
      error: 'Falha crítica ao processar a rotina de agendamento recorrente.',
      details: error.message
    });
  }
}
