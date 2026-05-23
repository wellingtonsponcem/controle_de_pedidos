import pool, { withTransaction } from './_db';
import { calcularValorLiquido } from './_financeiro_utils';

/**
 * Handler Serverless unificado /api/pedidos
 * Suporta:
 * - GET: Listar todos os pedidos ordenados por data com detalhes do cliente e itens.
 * - POST: Criar um novo pedido (com agendamento ou recorrência) de forma atômica (transação com rollback).
 * - PUT/PATCH: Atualizar status do pedido (Rascunho -> Pendente -> Agendado -> Entregue -> Cancelado).
 *   Suporta atualização de lote (batch) de horários de rota planejados.
 *   Na entrega ("Entregue"), cria-se automaticamente o registro financeiro de Receita.
 */
export default async function handler(req: any, res: any) {
  const { method } = req;

  // ============================================================================
  // MÉTODO GET: Listagem Completa de Pedidos (Calendário de Produção & Entrega)
  // ============================================================================
  if (method === 'GET') {
    try {
      // Obter pedidos com os dados do cliente e suas coordenadas geográficas
      const pedidosQuery = `
        SELECT p.*, 
               c.nome as cliente_nome, c.telefone as cliente_telefone, c.email as cliente_email,
               c.logradouro as cliente_logradouro, c.numero as cliente_numero, 
               c.complemento as cliente_complemento, c.bairro as cliente_bairro, c.municipio as cliente_municipio,
               c.latitude as cliente_latitude, c.longitude as cliente_longitude
        FROM pedidos p
        JOIN clientes c ON p.cliente_id = c.id
        ORDER BY p.data_agendada ASC, p.created_at DESC
      `;
      const pedidosResult = await pool.query(pedidosQuery);
      const pedidos = pedidosResult.rows;

      // Se não houver pedidos, retorna lista vazia de imediato
      if (pedidos.length === 0) {
        return res.status(200).json([]);
      }

      // Obter itens de todos os pedidos para aninhar no retorno
      const itensQuery = `
        SELECT ip.*, prod.nome, prod.versao, prod.sabor, prod.modelo
        FROM itens_pedido ip
        JOIN produtos prod ON ip.produto_id = prod.id
      `;
      const itensResult = await pool.query(itensQuery);
      const todosItens = itensResult.rows;

      // Aninhar itens em seus respectivos pedidos
      const pedidosCompletos = pedidos.map(pedido => {
        const itens = todosItens.filter(item => item.pedido_id === pedido.id);
        return {
          ...pedido,
          cliente: {
            nome: pedido.cliente_nome,
            telefone: pedido.cliente_telefone,
            email: pedido.cliente_email,
            logradouro: pedido.cliente_logradouro,
            numero: pedido.cliente_numero,
            complemento: pedido.cliente_complemento,
            bairro: pedido.cliente_bairro,
            municipio: pedido.cliente_municipio,
            latitude: pedido.cliente_latitude ? Number(pedido.cliente_latitude) : null,
            longitude: pedido.cliente_longitude ? Number(pedido.cliente_longitude) : null
          },
          itens: itens.map(i => ({
            id: i.id,
            produto_id: i.produto_id,
            nome: i.nome,
            versao: i.versao,
            sabor: i.sabor,
            modelo: i.modelo,
            quantidade: i.quantidade,
            preco_unitario: Number(i.preco_unitario)
          }))
        };
      });

      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.status(200).json(pedidosCompletos);
    } catch (error: any) {
      console.error('Erro ao listar pedidos no Neon Postgres:', error);
      return res.status(500).json({ error: 'Erro ao buscar listagem de pedidos.', details: error.message });
    }
  }

  // ============================================================================
  // MÉTODO POST: Criação Atômica de Pedido (Cliente + Pedido + Itens)
  // ============================================================================
  else if (method === 'POST') {
    const { cliente, produtos, data_agendada, municipio_entrega, recorrente_flag, recorrente_intervalo, observacao, pago, meio_pagamento, desconto } = req.body;

    // Validações básicas de payload
    if (!cliente || !produtos || !Array.isArray(produtos) || produtos.length === 0 || !data_agendada || !municipio_entrega) {
      return res.status(400).json({ error: 'Parâmetros inválidos. Preencha todos os campos obrigatórios.' });
    }

    try {
      const novoPedido = await withTransaction(async (client) => {
        // 1. Obter taxa de entrega correspondente
        const taxaQuery = await client.query('SELECT valor_taxa FROM taxas_entrega WHERE municipio = $1', [municipio_entrega]);
        if (taxaQuery.rows.length === 0) {
          throw new Error(`Município '${municipio_entrega}' não é atendido pela logística Bemavi.`);
        }
        const valorEntrega = Number(taxaQuery.rows[0].valor_taxa);

        // 2. Calcular preço real dos produtos com base nos registros do banco (evita manipulação externa)
        let valorProdutos = 0;
        const itensComPreco: Array<{ produto_id: string, quantidade: number, preco_unitario: number }> = [];

        for (const item of produtos) {
          const prodQuery = await client.query('SELECT preco_base, ativo FROM produtos WHERE id = $1', [item.produto_id]);
          if (prodQuery.rows.length === 0) {
            throw new Error(`Produto com ID ${item.produto_id} não existe no catálogo.`);
          }
          if (!prodQuery.rows[0].ativo) {
            throw new Error(`Produto selecionado não está mais disponível.`);
          }
          const precoUnitario = Number(prodQuery.rows[0].preco_base);
          valorProdutos += precoUnitario * item.quantidade;
          itensComPreco.push({
            produto_id: item.produto_id,
            quantidade: item.quantidade,
            preco_unitario: precoUnitario
          });
        }

        const descontoVal = Math.max(0, Number(desconto) || 0);
        const valorTotal = Math.max(0, valorProdutos + valorEntrega - descontoVal);

        // 3. Cadastrar ou obter cliente (Upsert simplificado por telefone)
        const clienteCheck = await client.query('SELECT id FROM clientes WHERE telefone = $1 AND nome = $2', [cliente.telefone, cliente.nome]);
        let clienteId: string;

        if (clienteCheck.rows.length > 0) {
          clienteId = clienteCheck.rows[0].id;
          // Atualizar endereço e coordenadas geográficas caso tenha mudado
          await client.query(`
            UPDATE clientes 
            SET logradouro = $1, numero = $2, complemento = $3, bairro = $4, municipio = $5, email = $6, latitude = $7, longitude = $8, updated_at = NOW()
            WHERE id = $9
          `, [cliente.logradouro, cliente.numero, cliente.complemento, cliente.bairro, cliente.municipio, cliente.email, cliente.latitude || null, cliente.longitude || null, clienteId]);
        } else {
          const insertClienteQuery = `
            INSERT INTO clientes (nome, telefone, email, logradouro, numero, complemento, bairro, municipio, latitude, longitude)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id
          `;
          const insertClienteRes = await client.query(insertClienteQuery, [
            cliente.nome, cliente.telefone, cliente.email, cliente.logradouro, cliente.numero, cliente.complemento, cliente.bairro, cliente.municipio, cliente.latitude || null, cliente.longitude || null
          ]);
          clienteId = insertClienteRes.rows[0].id;
        }

        // 4. Calcular o valor líquido se já estiver pago antecipadamente
        let valorLiquido = null;
        let pagoFlag = false;
        let dataPagamento = null;
        let meio = null;

        if (pago === true) {
          pagoFlag = true;
          dataPagamento = new Date();
          meio = meio_pagamento || 'PIX';
          const taxaResult = await client.query('SELECT porcentagem_taxa FROM taxas_maquininha WHERE meio_pagamento = $1', [meio]);
          const taxa = taxaResult.rows.length > 0 ? Number(taxaResult.rows[0].porcentagem_taxa) : 0;
          valorLiquido = calcularValorLiquido(valorTotal, taxa);
        }

        // 5. Inserir Pedido com controle de pagamento
        const statusInicial = recorrente_flag ? 'Rascunho' : 'Pendente';
        const insertPedidoQuery = `
          INSERT INTO pedidos (cliente_id, data_agendada, municipio_entrega, valor_produtos, valor_entrega, valor_total, status, recorrente_flag, recorrente_intervalo, observacao, pago, data_pagamento, meio_pagamento, valor_liquido, desconto)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING *
        `;
        const insertPedidoRes = await client.query(insertPedidoQuery, [
          clienteId, data_agendada, municipio_entrega, valorProdutos, valorEntrega, valorTotal, statusInicial, recorrente_flag, recorrente_intervalo || null, observacao || null, pagoFlag, dataPagamento, meio, valorLiquido, descontoVal
        ]);
        const pedidoCriado = insertPedidoRes.rows[0];

        // 6. Inserir Itens do Pedido
        const insertItemQuery = `
          INSERT INTO itens_pedido (pedido_id, produto_id, quantidade, preco_unitario)
          VALUES ($1, $2, $3, $4)
        `;
        for (const item of itensComPreco) {
          await client.query(insertItemQuery, [pedidoCriado.id, item.produto_id, item.quantidade, item.preco_unitario]);
        }

        // 7. Se foi pago antecipadamente, lança receita de caixa de forma atômica
        if (pagoFlag) {
          const insertFinanceiroQuery = `
            INSERT INTO transacoes_financeiras (tipo, valor, data, descricao, categoria, pedido_id)
            VALUES ('Receita', $1, CURRENT_DATE, $2, 'Venda de Pedido', $3)
          `;
          const taxaResult = await client.query('SELECT porcentagem_taxa FROM taxas_maquininha WHERE meio_pagamento = $1', [meio]);
          const taxa = taxaResult.rows.length > 0 ? Number(taxaResult.rows[0].porcentagem_taxa) : 0;
          const descricaoReceita = `Entrega de Pão Bemavi - Cliente: ${cliente.nome} (${meio} - Líquido: R$ ${Number(valorLiquido).toFixed(2)} | Bruto: R$ ${valorTotal.toFixed(2)} | Taxa: ${taxa}%) (Pago Antecipado)`;
          await client.query(insertFinanceiroQuery, [valorLiquido, descricaoReceita, pedidoCriado.id]);
        }

        return pedidoCriado;
      });

      return res.status(201).json(novoPedido);
    } catch (error: any) {
      console.error('Falha na transação de criação de pedido:', error);
      return res.status(500).json({ error: 'Erro ao registrar pedido.', details: error.message });
    }
  }

  // ============================================================================
  // MÉTODO PUT/PATCH: Atualização de Status/Edição de Pedido (Gera Receita se "Entregue")
  // ============================================================================
  else if (method === 'PUT' || method === 'PATCH') {
    // 1. SUPORTE A ATUALIZAÇÃO EM LOTE DE HORÁRIOS (ROTA PLANEJADA)
    if (req.body.batch && Array.isArray(req.body.batch)) {
      try {
        const batchResult = await withTransaction(async (client) => {
          const updated = [];
          for (const item of req.body.batch) {
            const { id, data_agendada } = item;
            if (!id || !data_agendada) {
              throw new Error('Cada item do lote deve conter id e data_agendada.');
            }
            const resUpdate = await client.query(`
              UPDATE pedidos
              SET data_agendada = $1, status = 'Agendado', updated_at = NOW()
              WHERE id = $2 RETURNING *
            `, [data_agendada, id]);
            if (resUpdate.rows.length === 0) {
              throw new Error(`Pedido com ID ${id} não encontrado para atualização em lote.`);
            }
            updated.push(resUpdate.rows[0]);
          }
          return updated;
        });
        return res.status(200).json(batchResult);
      } catch (error: any) {
        console.error('Falha na transação de atualização em lote de horários:', error);
        return res.status(500).json({ error: 'Erro ao atualizar horários em lote.', details: error.message });
      }
    }

    const { id, status, pago, meio_pagamento, cliente, produtos, data_agendada, municipio_entrega, recorrente_flag, recorrente_intervalo, observacao, desconto } = req.body;

    if (!id || !status) {
      return res.status(400).json({ error: 'Pedido ID e Status são obrigatórios.' });
    }

    const statusValidos = ['Rascunho', 'Pendente', 'Agendado', 'Entregue', 'Cancelado'];
    if (!statusValidos.includes(status)) {
      return res.status(400).json({ error: 'Status de pedido inválido.' });
    }

    try {
      const pedidoAtualizado = await withTransaction(async (client) => {
        // Buscar informações atuais do pedido
        const pedQuery = await client.query(`
          SELECT p.*, c.nome as cliente_nome 
          FROM pedidos p
          JOIN clientes c ON p.cliente_id = c.id
          WHERE p.id = $1
        `, [id]);

        if (pedQuery.rows.length === 0) {
          throw new Error('Pedido não encontrado.');
        }

        const pedido = pedQuery.rows[0];
        const statusAnterior = pedido.status;
        const pagoAnterior = pedido.pago === true;
        const clienteId = pedido.cliente_id;

        // Se já está entregue, não permite nenhuma alteração física ou de status
        if (statusAnterior === 'Entregue') {
          throw new Error('Não é permitido alterar ou editar um pedido já entregue.');
        }

        let pedidoSalvo;

        // Determinar novos valores de pagamento e desconto
        let pagoNovo = pago !== undefined ? (pago === true) : pagoAnterior;
        let meioNovo = meio_pagamento || pedido.meio_pagamento || null;
        let descontoNovo = desconto !== undefined ? Math.max(0, Number(desconto) || 0) : Number(pedido.desconto || 0);

        // Se mudar o status para 'Entregue', força pago = true
        if (status === 'Entregue') {
          pagoNovo = true;
          if (!meioNovo) meioNovo = 'PIX';
        }

        // DETECTAR SE É EDIÇÃO COMPLETA
        let valorTotal = 0;
        let valorEntrega = 0;
        if (cliente && produtos && Array.isArray(produtos) && produtos.length > 0 && data_agendada && municipio_entrega) {
          // 1. Atualizar dados e coordenadas do cliente correspondente
          await client.query(`
            UPDATE clientes 
            SET nome = $1, telefone = $2, email = $3, logradouro = $4, numero = $5, complemento = $6, bairro = $7, municipio = $8, latitude = $9, longitude = $10, updated_at = NOW()
            WHERE id = $11
          `, [cliente.nome, cliente.telefone, cliente.email, cliente.logradouro, cliente.numero, cliente.complemento, cliente.bairro, cliente.municipio, cliente.latitude || null, cliente.longitude || null, clienteId]);

          // 2. Obter taxa de entrega
          const taxaQuery = await client.query('SELECT valor_taxa FROM taxas_entrega WHERE municipio = $1', [municipio_entrega]);
          if (taxaQuery.rows.length === 0) {
            throw new Error(`Município '${municipio_entrega}' não é atendido pela logística Bemavi.`);
          }
          valorEntrega = Number(taxaQuery.rows[0].valor_taxa);

          // 3. Calcular preço oficial dos produtos no banco (evita manipulação externa)
          let valorProdutos = 0;
          const itensComPreco = [];

          for (const item of produtos) {
            const prodQuery = await client.query('SELECT preco_base FROM produtos WHERE id = $1', [item.produto_id]);
            if (prodQuery.rows.length === 0) {
              throw new Error(`Produto com ID ${item.produto_id} não existe no catálogo.`);
            }
            const precoUnitario = Number(prodQuery.rows[0].preco_base);
            valorProdutos += precoUnitario * item.quantidade;
            itensComPreco.push({
              produto_id: item.produto_id,
              quantidade: item.quantidade,
              preco_unitario: precoUnitario
            });
          }

          valorTotal = Math.max(0, valorProdutos + valorEntrega - descontoNovo);
        } else {
          valorTotal = Math.max(0, Number(pedido.valor_produtos) + Number(pedido.valor_entrega) - descontoNovo);
          valorEntrega = Number(pedido.valor_entrega);
        }

        // Calcular o valor líquido correspondente se estiver pago
        let valorLiquido = null;
        let dataPagamento = pedido.data_pagamento;

        if (pagoNovo) {
          const meio = meioNovo || 'PIX';
          const taxaResult = await client.query('SELECT porcentagem_taxa FROM taxas_maquininha WHERE meio_pagamento = $1', [meio]);
          const taxa = taxaResult.rows.length > 0 ? Number(taxaResult.rows[0].porcentagem_taxa) : 0;
          const totalRef = valorTotal !== undefined ? valorTotal : Number(pedido.valor_total);
          valorLiquido = calcularValorLiquido(totalRef, taxa);
          
          if (!pagoAnterior) {
            dataPagamento = new Date();
          }
        } else {
          dataPagamento = null;
          meioNovo = null;
        }

        // EXECUTAR ATUALIZAÇÃO DO PEDIDO
        if (cliente && produtos && Array.isArray(produtos) && produtos.length > 0 && data_agendada && municipio_entrega) {
          // 4. Atualizar Pedido Completo
          const updatePedidoQuery = `
            UPDATE pedidos 
            SET data_agendada = $1, municipio_entrega = $2, valor_produtos = $3, valor_entrega = $4, valor_total = $5, status = $6, recorrente_flag = $7, recorrente_intervalo = $8, observacao = $9, pago = $10, data_pagamento = $11, meio_pagamento = $12, valor_liquido = $13, desconto = $14, updated_at = NOW() 
            WHERE id = $15 RETURNING *
          `;
          const updatePedidoRes = await client.query(updatePedidoQuery, [
            data_agendada, municipio_entrega, Math.max(0, valorTotal + descontoNovo - Number(valorEntrega)), valorEntrega, valorTotal, status, recorrente_flag, recorrente_intervalo || null, observacao || null, pagoNovo, dataPagamento, meioNovo, valorLiquido, descontoNovo, id
          ]);
          pedidoSalvo = updatePedidoRes.rows[0];

          // 5. Atualizar Itens do Pedido (Exclui antigos e reinseri novos)
          await client.query('DELETE FROM itens_pedido WHERE pedido_id = $1', [id]);
          
          const insertItemCorrectQuery = `
            INSERT INTO itens_pedido (pedido_id, produto_id, quantidade, preco_unitario)
            VALUES ($1, $2, $3, $4)
          `;

          for (const item of produtos) {
            const prodQuery = await client.query('SELECT preco_base FROM produtos WHERE id = $1', [item.produto_id]);
            const precoUnitario = Number(prodQuery.rows[0].preco_base);
            await client.query(insertItemCorrectQuery, [id, item.produto_id, item.quantidade, precoUnitario]);
          }
        } 
        // CASO CONTRÁRIO: ATUALIZAÇÃO RÁPIDA DE STATUS OU PAGAMENTO OU DESCONTO
        else {
          const updatePedidoQuery = `
            UPDATE pedidos 
            SET status = $1, pago = $2, data_pagamento = $3, meio_pagamento = $4, valor_liquido = $5, desconto = $6, valor_total = $7, updated_at = NOW() 
            WHERE id = $8 RETURNING *
          `;
          const updatePedidoRes = await client.query(updatePedidoQuery, [status, pagoNovo, dataPagamento, meioNovo, valorLiquido, descontoNovo, valorTotal, id]);
          pedidoSalvo = updatePedidoRes.rows[0];
        }

        // Regra de Negócio Crítica de Integração Financeira Atômica e Idempotente
        if (pagoNovo) {
          // Excluir qualquer lançamento de receita anterior para este pedido (idempotência absoluta)
          await client.query('DELETE FROM transacoes_financeiras WHERE pedido_id = $1', [id]);

          // Lançar a nova receita líquida no caixa
          const insertFinanceiroQuery = `
            INSERT INTO transacoes_financeiras (tipo, valor, data, descricao, categoria, pedido_id)
            VALUES ('Receita', $1, CURRENT_DATE, $2, 'Venda de Pedido', $3)
          `;
          const meio = meioNovo || 'PIX';
          const taxaResult = await client.query('SELECT porcentagem_taxa FROM taxas_maquininha WHERE meio_pagamento = $1', [meio]);
          const taxa = taxaResult.rows.length > 0 ? Number(taxaResult.rows[0].porcentagem_taxa) : 0;
          const clienteNome = cliente ? cliente.nome : pedido.cliente_nome;
          const descricaoReceita = `Entrega de Pão Bemavi - Cliente: ${clienteNome} (${meio} - Líquido: R$ ${Number(valorLiquido).toFixed(2)} | Bruto: R$ ${Number(pedidoSalvo.valor_total).toFixed(2)} | Taxa: ${taxa}%)` + (status === 'Entregue' ? '' : ' (Pago Antecipado)');
          await client.query(insertFinanceiroQuery, [valorLiquido, descricaoReceita, id]);
        } 
        // Se mudou de pago para não pago ou se foi cancelado, remove a receita do caixa
        else if (!pagoNovo && pagoAnterior) {
          await client.query('DELETE FROM transacoes_financeiras WHERE pedido_id = $1', [id]);
        }
        
        // Se o pedido foi cancelado (status === 'Cancelado'), garante remoção da receita em qualquer circunstância
        if (status === 'Cancelado') {
          await client.query('DELETE FROM transacoes_financeiras WHERE pedido_id = $1', [id]);
          await client.query('UPDATE pedidos SET pago = FALSE, data_pagamento = NULL, meio_pagamento = NULL, valor_liquido = NULL WHERE id = $1', [id]);
          pedidoSalvo.pago = false;
          pedidoSalvo.valor_liquido = null;
        }

        return {
          ...pedidoSalvo,
          valor_liquido: pedidoSalvo.valor_liquido ? Number(pedidoSalvo.valor_liquido) : null,
          valor_total: Number(pedidoSalvo.valor_total),
          valor_produtos: Number(pedidoSalvo.valor_produtos),
          valor_entrega: Number(pedidoSalvo.valor_entrega)
        };
      });

      return res.status(200).json(pedidoAtualizado);
    } catch (error: any) {
      console.error('Falha ao atualizar/editar pedido no Neon:', error);
      return res.status(500).json({ error: 'Erro ao atualizar/editar pedido.', details: error.message });
    }
  }

  // Método HTTP não suportado no endpoint
  else {
    res.setHeader('Allow', ['GET', 'POST', 'PUT', 'PATCH']);
    return res.status(405).json({ error: `Método ${method} não suportado.` });
  }
}
