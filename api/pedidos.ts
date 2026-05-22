import pool, { withTransaction } from './_db';

/**
 * Handler Serverless unificado /api/pedidos
 * Suporta:
 * - GET: Listar todos os pedidos ordenados por data com detalhes do cliente e itens.
 * - POST: Criar um novo pedido (com agendamento ou recorrência) de forma atômica (transação com rollback).
 * - PUT/PATCH: Atualizar status do pedido (Rascunho -> Pendente -> Agendado -> Entregue -> Cancelado).
 *   Na entrega ("Entregue"), cria-se automaticamente o registro financeiro de Receita.
 */
export default async function handler(req: any, res: any) {
  const { method } = req;

  // ============================================================================
  // MÉTODO GET: Listagem Completa de Pedidos (Calendário de Produção & Entrega)
  // ============================================================================
  if (method === 'GET') {
    try {
      // Obter pedidos com os dados do cliente
      const pedidosQuery = `
        SELECT p.*, 
               c.nome as cliente_nome, c.telefone as cliente_telefone, c.email as cliente_email,
               c.logradouro as cliente_logradouro, c.numero as cliente_numero, 
               c.complemento as cliente_complemento, c.bairro as cliente_bairro, c.municipio as cliente_municipio
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
            municipio: pedido.cliente_municipio
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
    const { cliente, produtos, data_agendada, municipio_entrega, recorrente_flag, recorrente_intervalo, observacao } = req.body;

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

        const valorTotal = valorProdutos + valorEntrega;

        // 3. Cadastrar ou obter cliente (Upsert simplificado por telefone)
        const clienteCheck = await client.query('SELECT id FROM clientes WHERE telefone = $1 AND nome = $2', [cliente.telefone, cliente.nome]);
        let clienteId: string;

        if (clienteCheck.rows.length > 0) {
          clienteId = clienteCheck.rows[0].id;
          // Atualizar endereço caso tenha mudado
          await client.query(`
            UPDATE clientes 
            SET logradouro = $1, numero = $2, complemento = $3, bairro = $4, municipio = $5, email = $6, updated_at = NOW()
            WHERE id = $7
          `, [cliente.logradouro, cliente.numero, cliente.complemento, cliente.bairro, cliente.municipio, cliente.email, clienteId]);
        } else {
          const insertClienteQuery = `
            INSERT INTO clientes (nome, telefone, email, logradouro, numero, complemento, bairro, municipio)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id
          `;
          const insertClienteRes = await client.query(insertClienteQuery, [
            cliente.nome, cliente.telefone, cliente.email, cliente.logradouro, cliente.numero, cliente.complemento, cliente.bairro, cliente.municipio
          ]);
          clienteId = insertClienteRes.rows[0].id;
        }

        // 4. Inserir Pedido
        // Regra de negócio: Pedidos recorrentes iniciam como "Rascunho". Pedidos comuns com agendamento direto iniciam como "Pendente".
        const statusInicial = recorrente_flag ? 'Rascunho' : 'Pendente';
        const insertPedidoQuery = `
          INSERT INTO pedidos (cliente_id, data_agendada, municipio_entrega, valor_produtos, valor_entrega, valor_total, status, recorrente_flag, recorrente_intervalo, observacao)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *
        `;
        const insertPedidoRes = await client.query(insertPedidoQuery, [
          clienteId, data_agendada, municipio_entrega, valorProdutos, valorEntrega, valorTotal, statusInicial, recorrente_flag, recorrente_intervalo || null, observacao || null
        ]);
        const pedidoCriado = insertPedidoRes.rows[0];

        // 5. Inserir Itens do Pedido
        const insertItemQuery = `
          INSERT INTO itens_pedido (pedido_id, produto_id, quantidade, preco_unitario)
          VALUES ($1, $2, $3, $4)
        `;
        for (const item of itensComPreco) {
          await client.query(insertItemQuery, [pedidoCriado.id, item.produto_id, item.quantidade, item.preco_unitario]);
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
  // MÉTODO PUT/PATCH: Atualização de Status de Pedido (Gera Receita se "Entregue")
  // ============================================================================
  else if (method === 'PUT' || method === 'PATCH') {
    const { id, status } = req.body;

    if (!id || !status) {
      return res.status(400).json({ error: 'Pedido ID e novo Status são obrigatórios.' });
    }

    const statusValidos = ['Rascunho', 'Pendente', 'Agendado', 'Entregue', 'Cancelado'];
    if (!statusValidos.includes(status)) {
      return res.status(400).json({ error: 'Status de pedido inválido.' });
    }

    try {
      const pedidoAtualizado = await withTransaction(async (client) => {
        // Buscar informações atuais do pedido e do cliente
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

        // Se já está entregue, não permite alterar status para evitar re-faturamento ou alteração histórica
        if (statusAnterior === 'Entregue' && status !== 'Entregue') {
          throw new Error('Não é permitido alterar o status de um pedido já entregue.');
        }

        // Atualizar o status do pedido
        const updatePedidoQuery = `
          UPDATE pedidos 
          SET status = $1, updated_at = NOW() 
          WHERE id = $2 RETURNING *
        `;
        const updatePedidoRes = await client.query(updatePedidoQuery, [status, id]);
        const pedidoSalvo = updatePedidoRes.rows[0];

        // Regra de Negócio Crítica: Ao marcar como "Entregue", gera a Transação Financeira de Receita
        if (status === 'Entregue' && statusAnterior !== 'Entregue') {
          // Verificar se já existe lançamento financeiro para evitar duplicidade
          const transQuery = await client.query('SELECT id FROM transacoes_financeiras WHERE pedido_id = $1', [id]);
          if (transQuery.rows.length === 0) {
            const insertFinanceiroQuery = `
              INSERT INTO transacoes_financeiras (tipo, valor, data, descricao, categoria, pedido_id)
              VALUES ('Receita', $1, CURRENT_DATE, $2, 'Venda de Pedido', $3)
            `;
            const descricaoReceita = `Entrega de Pão Bemavi - Cliente: ${pedido.cliente_nome}`;
            await client.query(insertFinanceiroQuery, [pedido.valor_total, descricaoReceita, id]);
          }
        }

        return pedidoSalvo;
      });

      return res.status(200).json(pedidoAtualizado);
    } catch (error: any) {
      console.error('Falha ao atualizar status de pedido:', error);
      return res.status(500).json({ error: 'Erro ao atualizar status do pedido.', details: error.message });
    }
  }

  // Método HTTP não suportado no endpoint
  else {
    res.setHeader('Allow', ['GET', 'POST', 'PUT', 'PATCH']);
    return res.status(405).json({ error: `Método ${method} não suportado.` });
  }
}
