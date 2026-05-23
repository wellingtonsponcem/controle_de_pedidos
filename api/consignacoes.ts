import pool, { withTransaction } from './_db';

/**
 * Handler Serverless para o endpoint /api/consignacoes
 * Gerencia a consignação de pães para parceiros de forma atômica e resiliente.
 */
export default async function handler(req: any, res: any) {
  const { method } = req;

  // ============================================================================
  // MÉTODO GET: Listar Consignações com seus respectivos Itens e Detalhes
  // ============================================================================
  if (method === 'GET') {
    try {
      const selectQuery = `
        SELECT c.id, c.amigo_nome, c.amigo_telefone, 
               TO_CHAR(c.data_envio, 'YYYY-MM-DD') as data_envio,
               TO_CHAR(c.data_acerto, 'YYYY-MM-DD') as data_acerto, 
               c.status, c.observacao, c.created_at,
               COALESCE(
                 json_agg(
                   json_build_object(
                     'id', ic.id,
                     'produto_id', ic.produto_id,
                     'quantidade_deixada', ic.quantidade_deixada,
                     'quantidade_vendida', ic.quantidade_vendida,
                     'preco_unitario', ic.preco_unitario,
                     'produto_nome', p.nome,
                     'produto_versao', p.versao,
                     'produto_sabor', p.sabor,
                     'produto_modelo', p.modelo
                   )
                 ) FILTER (WHERE ic.id IS NOT NULL), '[]'
               ) as itens
        FROM consignacoes c
        LEFT JOIN itens_consignacao ic ON ic.consignacao_id = c.id
        LEFT JOIN produtos p ON ic.produto_id = p.id
        GROUP BY c.id
        ORDER BY c.data_envio DESC, c.created_at DESC;
      `;
      
      const result = await pool.query(selectQuery);
      
      // Mapear preços e quantidades para tipos numéricos puros (pg retorna decimais como strings)
      const consignacoes = result.rows.map(row => ({
        ...row,
        itens: Array.isArray(row.itens) ? row.itens.map((it: any) => ({
          ...it,
          quantidade_deixada: Number(it.quantidade_deixada),
          quantidade_vendida: Number(it.quantidade_vendida),
          preco_unitario: Number(it.preco_unitario)
        })) : []
      }));

      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.status(200).json(consignacoes);
    } catch (error: any) {
      console.error('Falha ao buscar consignações no Neon Postgres:', error);
      return res.status(500).json({ error: 'Erro ao listar consignações.', details: error.message });
    }
  }

  // ============================================================================
  // MÉTODO POST: Criar uma Nova Consignação de Lote de Pães
  // ============================================================================
  else if (method === 'POST') {
    const { amigo_nome, amigo_telefone, data_envio, observacao, itens } = req.body;

    // Validações básicas e estritas
    if (!amigo_nome) {
      return res.status(400).json({ error: 'Parâmetro inválido. amigo_nome é obrigatório.' });
    }

    if (!Array.isArray(itens) || itens.length === 0) {
      return res.status(400).json({ error: 'Uma consignação deve possuir pelo menos um produto selecionado.' });
    }

    // Tratar data de envio padrão
    const dataEnvioTratada = data_envio ? data_envio : new Date().toISOString().split('T')[0];

    try {
      // Cria a consignação atômica em transação
      const novaConsignacao = await withTransaction(async (client) => {
        // 1. Inserir cabeçalho
        const insertConsQuery = `
          INSERT INTO consignacoes (amigo_nome, amigo_telefone, data_envio, observacao, status)
          VALUES ($1, $2, $3, $4, 'Aberto')
          RETURNING id, amigo_nome, amigo_telefone, TO_CHAR(data_envio, 'YYYY-MM-DD') as data_envio, status, observacao, created_at
        `;
        const consResult = await client.query(insertConsQuery, [amigo_nome, amigo_telefone || null, dataEnvioTratada, observacao || null]);
        const consignacao = consResult.rows[0];

        // 2. Inserir itens
        const itensCriados = [];
        for (const item of itens) {
          const { produto_id, quantidade_deixada, preco_unitario } = item;

          if (!produto_id || isNaN(Number(quantidade_deixada)) || Number(quantidade_deixada) <= 0 || isNaN(Number(preco_unitario)) || Number(preco_unitario) < 0) {
            throw new Error('Item com dados inválidos (produto_id, quantidade_deixada ou preco_unitario).');
          }

          const insertItemQuery = `
            INSERT INTO itens_consignacao (consignacao_id, produto_id, quantidade_deixada, quantidade_vendida, preco_unitario)
            VALUES ($1, $2, $3, 0, $4)
            RETURNING id, produto_id, quantidade_deixada, quantidade_vendida, preco_unitario
          `;
          const itemResult = await client.query(insertItemQuery, [consignacao.id, produto_id, Number(quantidade_deixada), Number(preco_unitario)]);
          itensCriados.push({
            ...itemResult.rows[0],
            quantidade_deixada: Number(itemResult.rows[0].quantidade_deixada),
            quantidade_vendida: Number(itemResult.rows[0].quantidade_vendida),
            preco_unitario: Number(itemResult.rows[0].preco_unitario)
          });
        }

        return {
          ...consignacao,
          itens: itensCriados
        };
      });

      return res.status(201).json(novaConsignacao);
    } catch (error: any) {
      console.error('Falha crítica ao criar consignação atômica:', error);
      return res.status(500).json({ error: 'Erro ao registrar consignação de pães.', details: error.message });
    }
  }

  // ============================================================================
  // MÉTODO PUT/PATCH: Realizar o Acerto de Vendas de uma Consignação
  // ============================================================================
  else if (method === 'PUT' || method === 'PATCH') {
    const { id, data_acerto, itens } = req.body;

    if (!id) {
      return res.status(400).json({ error: 'O ID da consignação é obrigatório para realizar o acerto.' });
    }

    if (!Array.isArray(itens) || itens.length === 0) {
      return res.status(400).json({ error: 'Dados dos itens do acerto são necessários.' });
    }

    // Tratar data do acerto padrão
    const dataAcertoTratada = data_acerto ? data_acerto : new Date().toISOString().split('T')[0];

    try {
      const acertoFinal = await withTransaction(async (client) => {
        // 1. Validar e obter a consignação existente
        const selectConsQuery = 'SELECT id, amigo_nome, status FROM consignacoes WHERE id = $1';
        const consResult = await client.query(selectConsQuery, [id]);
        if (consResult.rows.length === 0) {
          throw new Error('Consignação não encontrada.');
        }
        const consignacao = consResult.rows[0];

        // 2. Buscar itens originais para validação de quantidade deixada
        const selectItemsQuery = 'SELECT id, quantidade_deixada, preco_unitario FROM itens_consignacao WHERE consignacao_id = $1';
        const itemsResult = await client.query(selectItemsQuery, [id]);
        const itensOriginais = itemsResult.rows;

        // 3. Atualizar cada item com a quantidade vendida
        let valorTotalVendido = 0;
        for (const item of itens) {
          const { id: item_id, quantidade_vendida } = item;

          if (!item_id || isNaN(Number(quantidade_vendida)) || Number(quantidade_vendida) < 0) {
            throw new Error('Quantidade vendida inválida para um dos itens.');
          }

          const original = itensOriginais.find(it => it.id === item_id);
          if (!original) {
            throw new Error(`Item de ID ${item_id} não pertence a esta consignação.`);
          }

          if (Number(quantidade_vendida) > Number(original.quantidade_deixada)) {
            throw new Error(`Quantidade vendida (${quantidade_vendida}) não pode exceder a quantidade deixada (${original.quantidade_deixada}).`);
          }

          const updateItemQuery = `
            UPDATE itens_consignacao
            SET quantidade_vendida = $1
            WHERE id = $2
            RETURNING id, produto_id, quantidade_deixada, quantidade_vendida, preco_unitario
          `;
          await client.query(updateItemQuery, [Number(quantidade_vendida), item_id]);
          
          valorTotalVendido += Number(quantidade_vendida) * Number(original.preco_unitario);
        }

        // 4. Mudar status da consignação para 'Fechado'
        const updateConsQuery = `
          UPDATE consignacoes
          SET status = 'Fechado', data_acerto = $1
          WHERE id = $2
          RETURNING id, amigo_nome, amigo_telefone, TO_CHAR(data_envio, 'YYYY-MM-DD') as data_envio, TO_CHAR(data_acerto, 'YYYY-MM-DD') as data_acerto, status, observacao
        `;
        const updatedConsResult = await client.query(updateConsQuery, [dataAcertoTratada, id]);
        const consignacaoAtualizada = updatedConsResult.rows[0];

        // 5. Integração com Fluxo de Caixa (Idempotência Financeira)
        // Remover qualquer lançamento anterior para evitar duplicidade
        const deleteFinanceQuery = 'DELETE FROM transacoes_financeiras WHERE consignacao_id = $1';
        await client.query(deleteFinanceQuery, [id]);

        // Se houver algum valor vendido, cria a receita automática
        let transacaoCriada = null;
        if (valorTotalVendido > 0) {
          const insertFinanceQuery = `
            INSERT INTO transacoes_financeiras (tipo, valor, data, descricao, categoria, consignacao_id)
            VALUES ('Receita', $1, $2, $3, 'Venda Consignada', $4)
            RETURNING id, tipo, valor, TO_CHAR(data, 'YYYY-MM-DD') as data, descricao, categoria, created_at
          `;
          const desc = `Acerto de Consignação - ${consignacao.amigo_nome}`;
          const finResult = await client.query(insertFinanceQuery, [valorTotalVendido, dataAcertoTratada, desc, id]);
          transacaoCriada = {
            ...finResult.rows[0],
            valor: Number(finResult.rows[0].valor)
          };
        }

        return {
          consignacao: consignacaoAtualizada,
          total_vendido: valorTotalVendido,
          transacao: transacaoCriada
        };
      });

      return res.status(200).json(acertoFinal);
    } catch (error: any) {
      console.error('Falha crítica ao realizar acerto de consignação:', error);
      return res.status(500).json({ error: 'Erro ao realizar acerto da consignação.', details: error.message });
    }
  }

  // Método HTTP não suportado
  else {
    res.setHeader('Allow', ['GET', 'POST', 'PUT', 'PATCH']);
    return res.status(405).json({ error: `Método ${method} não suportado.` });
  }
}
