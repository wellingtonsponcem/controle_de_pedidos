/* ============================================================================
   LÓGICA DO CLIENTE SPA & PWA RESILIENTE - BEMAVI PÃO ARTESANAL
   Controle offline, IndexedDB local e sincronização atômica de transações.
   ============================================================================ */

// 1. Estado Global da Aplicação
const state = {
  activeTab: 'dashboard',
  produtos: [],
  pedidos: [],
  financeiro: {
    resumo: { total_receitas: 0, total_despesas: 0, lucro_liquido: 0 },
    transacoes: []
  },
  carrinho: [], // [{ produto_id, quantidade }]
  isOnline: navigator.onLine
};

// 2. Inicialização e Registro de PWA Service Worker
document.addEventListener('DOMContentLoaded', () => {
  initApp();
  
  // Registrar Service Worker para PWA
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
      .then((reg) => console.log('[PWA] Service Worker registrado com sucesso:', reg.scope))
      .catch((err) => console.error('[PWA] Falha ao registrar Service Worker:', err));
  }
});

// 3. Inicialização Principal
async function initApp() {
  setupNavigation();
  setupNetworkMonitoring();
  await initIndexedDB();
  
  // Carregar dados iniciais
  await renderCatalogo();
  await refreshDashboard();
  await refreshFinanceiro();
  
  // Setup formulários
  setupOrderForm();
  setupFinanceForm();
  
  // Tentar sincronização inicial se estiver online
  if (state.isOnline) {
    syncOfflineData();
  }
}

// 4. Navegação SPA de Abas
function setupNavigation() {
  const tabs = document.querySelectorAll('.tab-btn');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const tabId = tab.dataset.tab;
      switchTab(tabId);
    });
  });
}

function switchTab(tabId) {
  state.activeTab = tabId;
  
  // Atualizar botões
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });
  
  // Atualizar conteúdos
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.toggle('active', content.id === tabId);
  });

  // Atualizar dados sob demanda ao trocar de aba
  if (tabId === 'dashboard') refreshDashboard();
  if (tabId === 'financeiro') refreshFinanceiro();
}

// 5. Monitoramento de Rede e Badge Visual
function setupNetworkMonitoring() {
  const badge = document.getElementById('networkBadge');
  
  function updateStatus() {
    state.isOnline = navigator.onLine;
    if (state.isOnline) {
      badge.className = 'network-badge online';
      badge.innerHTML = '<span class="indicator"></span>Online';
      showToast('Conexão restabelecida. Sincronizando dados...', 'success');
      syncOfflineData();
    } else {
      badge.className = 'network-badge offline';
      badge.innerHTML = '<span class="indicator"></span>Modo Offline';
      showToast('Você está offline. Operações salvas localmente.', 'info');
    }
  }

  window.addEventListener('online', updateStatus);
  window.addEventListener('offline', updateStatus);
  updateStatus(); // Chamada inicial
}

// 6. Camada de Persistência Local (IndexedDB)
let db;
const DB_NAME = 'BemaviDB';
const DB_VERSION = 1;

function initIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (event) => {
      console.error('Erro ao inicializar IndexedDB:', event.target.error);
      reject(event.target.error);
    };

    request.onsuccess = (event) => {
      db = event.target.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = event.target.result;
      
      // Store para Catálogo de Produtos
      if (!database.objectStoreNames.contains('produtos')) {
        database.createObjectStore('produtos', { keyPath: 'id' });
      }
      
      // Store para novos Pedidos Offline pendentes de sincronização
      if (!database.objectStoreNames.contains('pedidos_offline')) {
        database.createObjectStore('pedidos_offline', { autoIncrement: true });
      }
      
      // Store para Despesas Offline pendentes de sincronização
      if (!database.objectStoreNames.contains('despesas_offline')) {
        database.createObjectStore('despesas_offline', { autoIncrement: true });
      }
    };
  });
}

// Utilitários auxiliares do IndexedDB
function writeIndexedDB(storeName, data) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.put(data);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function readAllIndexedDB(storeName) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function clearIndexedDBStore(storeName) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// 7. Catálogo de Produtos (Renderização & Offline Fallback)
async function renderCatalogo() {
  try {
    if (state.isOnline) {
      // Buscar do backend Neon
      const response = await fetch('/api/produtos');
      if (response.ok) {
        state.produtos = await response.json();
        // Atualizar cache IndexedDB
        await clearIndexedDBStore('produtos');
        for (const prod of state.produtos) {
          await writeIndexedDB('produtos', prod);
        }
      }
    } else {
      // Offline: Buscar do cache IndexedDB
      state.produtos = await readAllIndexedDB('produtos');
    }
  } catch (error) {
    console.error('Falha ao carregar catálogo de produtos:', error);
    // Tentar fallback do cache de qualquer forma
    state.produtos = await readAllIndexedDB('produtos');
  }

  // Renderizar o catálogo HTML
  const catalogGrid = document.getElementById('catalogGrid');
  if (state.produtos.length === 0) {
    catalogGrid.innerHTML = '<div class="carrinho-empty">Nenhum produto cadastrado no catálogo offline.</div>';
    return;
  }

  catalogGrid.innerHTML = state.produtos.map(prod => `
    <div class="bread-card">
      <div class="bread-header">
        <span class="bread-type">${prod.versao}</span>
        <span class="bread-name">${prod.nome}</span>
        <span class="bread-details">Sabor: ${prod.sabor} | Modelo: ${prod.modelo}</span>
      </div>
      <div class="bread-bottom">
        <span class="bread-price">R$ ${Number(prod.preco_base).toFixed(2)}</span>
        <button class="btn btn-primary" onclick="adicionarAoCarrinho('${prod.id}')">
          Adicionar
        </button>
      </div>
    </div>
  `).join('');

  // Atualizar select de produtos no formulário de pedido
  updateOrderFormSelectors();
}

// 8. Carrinho de Compras e Agendamento
function updateOrderFormSelectors() {
  const select = document.getElementById('addProdutoSelect');
  if (!select) return;
  select.innerHTML = '<option value="">-- Selecione um pão Bemavi --</option>' + 
    state.produtos.map(prod => `
      <option value="${prod.id}">${prod.nome} (${prod.modelo}) - R$ ${Number(prod.preco_base).toFixed(2)}</option>
    `).join('');
}

window.adicionarAoCarrinho = function(productId) {
  const produto = state.produtos.find(p => p.id === productId);
  if (!produto) return;

  const itemExistente = state.carrinho.find(item => item.produto_id === productId);
  if (itemExistente) {
    itemExistente.quantidade += 1;
  } else {
    state.carrinho.push({
      produto_id: productId,
      nome: produto.nome,
      modelo: produto.modelo,
      preco: Number(produto.preco_base),
      quantidade: 1
    });
  }

  renderCarrinho();
  showToast(`${produto.nome} adicionado ao pedido!`, 'success');
};

function renderCarrinho() {
  const carrinhoBox = document.getElementById('carrinhoItens');
  const totalProdutosEl = document.getElementById('carrinhoTotalProdutos');
  const totalGeralEl = document.getElementById('carrinhoTotalGeral');
  const taxaEntregaEl = document.getElementById('carrinhoTaxaEntrega');
  const municipioSelect = document.getElementById('municipio_entrega');

  if (state.carrinho.length === 0) {
    carrinhoBox.innerHTML = '<div class="carrinho-empty">Nenhum item selecionado para agendamento.</div>';
    totalProdutosEl.textContent = 'R$ 0,00';
    totalGeralEl.textContent = 'R$ 0,00';
    return;
  }

  carrinhoBox.innerHTML = state.carrinho.map(item => `
    <div class="carrinho-item">
      <div>
        <strong>${item.nome}</strong> <br>
        <span style="font-size: 0.8rem; color: var(--text-muted);">${item.modelo}</span>
      </div>
      <div class="quantity-controls">
        <button class="quantity-btn" onclick="alterarQtdCarrinho('${item.produto_id}', -1)">-</button>
        <span>${item.quantidade}</span>
        <button class="quantity-btn" onclick="alterarQtdCarrinho('${item.produto_id}', 1)">+</button>
        <span style="margin-left: 1rem; font-weight: 600;">R$ ${(item.preco * item.quantidade).toFixed(2)}</span>
      </div>
    </div>
  `).join('');

  // Calcular totais
  const subtotal = state.carrinho.reduce((acc, curr) => acc + (curr.preco * curr.quantidade), 0);
  
  // Obter taxa
  let taxa = 0;
  if (municipioSelect.value === 'Vitória') taxa = 8.0;
  if (municipioSelect.value === 'Vila Velha') taxa = 10.0;
  if (municipioSelect.value === 'Serra') taxa = 12.0;

  totalProdutosEl.textContent = `R$ ${subtotal.toFixed(2)}`;
  taxaEntregaEl.textContent = `R$ ${taxa.toFixed(2)}`;
  totalGeralEl.textContent = `R$ ${(subtotal + taxa).toFixed(2)}`;
}

window.alterarQtdCarrinho = function(productId, delta) {
  const item = state.carrinho.find(i => i.produto_id === productId);
  if (!item) return;

  item.quantidade += delta;
  if (item.quantidade <= 0) {
    state.carrinho = state.carrinho.filter(i => i.produto_id !== productId);
  }
  
  renderCarrinho();
};

// Listener para atualização da taxa de entrega baseado na escolha da Grande Vitória
document.getElementById('municipio_entrega').addEventListener('change', renderCarrinho);

// Add produto manual via select no painel
document.getElementById('addProdutoBtn').addEventListener('click', () => {
  const select = document.getElementById('addProdutoSelect');
  if (select.value) {
    adicionarAoCarrinho(select.value);
    select.value = '';
  }
});

// 9. Dashboard de Pedidos (Produção & Status)
async function refreshDashboard() {
  const btn = document.getElementById('btnRefreshDashboard');
  if (btn) btn.classList.add('spinning');

  try {
    if (state.isOnline) {
      const response = await fetch('/api/pedidos');
      if (response.ok) {
        state.pedidos = await response.json();
      }
    }
  } catch (error) {
    console.error('Erro ao atualizar dashboard de pedidos:', error);
  }

  renderPedidos();

  if (btn) {
    setTimeout(() => {
      btn.classList.remove('spinning');
    }, 800);
  }
}

function renderPedidos() {
  const listEl = document.getElementById('ordersList');
  const countEl = document.getElementById('pedidosTotalCount');

  if (state.pedidos.length === 0) {
    listEl.innerHTML = `
      <div class="carrinho-empty" style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1.25rem; padding: 3rem 1.5rem; text-align: center;">
        <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="var(--text-muted)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.6; margin-bottom: 0.5rem;">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        <span style="font-size: 1rem; font-weight: 500; color: var(--text-muted);">Nenhum pedido agendado ou pendente de produção.</span>
        <button class="btn btn-primary" onclick="switchTab('pedidos')" style="font-size: 0.95rem; padding: 0.65rem 1.5rem; display: flex; align-items: center; gap: 0.5rem; justify-content: center; border-radius: 8px; box-shadow: 0 4px 15px var(--primary-glow); border: none; font-weight: 600; cursor: pointer;">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          Criar Pedido
        </button>
      </div>
    `;
    countEl.textContent = '0';
    return;
  }

  countEl.textContent = state.pedidos.length;

  listEl.innerHTML = state.pedidos.map(pedido => {
    // Formatar data agendada
    const dataObj = new Date(pedido.data_agendada);
    const dataFormatada = dataObj.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    // Roteador de botões de ações baseado no status
    let acoesHtml = '';
    if (pedido.status === 'Rascunho') {
      acoesHtml = `
        <button class="btn btn-secondary" onclick="alterarStatusPedido('${pedido.id}', 'Pendente')">Aprovar Pedido</button>
      `;
    } else if (pedido.status === 'Pendente') {
      acoesHtml = `
        <button class="btn btn-primary" onclick="alterarStatusPedido('${pedido.id}', 'Agendado')">Agendar Produção</button>
      `;
    } else if (pedido.status === 'Agendado') {
      acoesHtml = `
        <button class="btn btn-success" onclick="alterarStatusPedido('${pedido.id}', 'Entregue')">Marcar como Entregue</button>
      `;
    }

    if (pedido.status !== 'Entregue' && pedido.status !== 'Cancelado') {
      acoesHtml += `
        <button class="btn btn-danger" onclick="alterarStatusPedido('${pedido.id}', 'Cancelado')">Cancelar</button>
      `;
    }

    const itemsHtml = pedido.itens.map(item => `
      <div class="order-item-row">
        <span>${item.quantidade}x ${item.nome} (${item.modelo})</span>
        <span>R$ ${(item.preco_unitario * item.quantidade).toFixed(2)}</span>
      </div>
    `).join('');

    return `
      <div class="order-card status-${pedido.status.toLowerCase()}">
        <div class="order-top">
          <div>
            <span class="client-name">${pedido.cliente.nome}</span>
            <div class="order-meta">
              <span class="meta-item">📞 ${pedido.cliente.telefone}</span>
              <span class="meta-item">📍 ${pedido.cliente.bairro}, ${pedido.cliente.municipio}</span>
              <span class="meta-item">📅 ${dataFormatada}</span>
              ${pedido.recorrente_flag ? `<span class="meta-item" style="color: var(--primary);">🔁 Recorrente (${pedido.recorrente_intervalo})</span>` : ''}
            </div>
          </div>
          <span class="order-status-badge badge-${pedido.status.toLowerCase()}">${pedido.status}</span>
        </div>
        
        <div class="order-items-box">
          ${itemsHtml}
        </div>
        
        ${pedido.observacao ? `
          <div style="font-size: 0.8rem; color: var(--text-muted); font-style: italic; background: rgba(255,255,255,0.01); padding: 0.4rem; border-radius: 4px;">
            Obs: ${pedido.observacao}
          </div>
        ` : ''}

        <div class="order-bottom-actions">
          <div class="order-price">
            R$ ${Number(pedido.valor_total).toFixed(2)}
            <span class="order-price-detail">(Pães: R$ ${Number(pedido.valor_produtos).toFixed(2)} + Taxa: R$ ${Number(pedido.valor_entrega).toFixed(2)})</span>
          </div>
          <div class="actions-group">
            ${acoesHtml}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

window.alterarStatusPedido = async function(pedidoId, novoStatus) {
  if (!state.isOnline) {
    showToast('Apenas online é permitido atualizar status físico de produção no banco de dados.', 'error');
    return;
  }

  try {
    const response = await fetch('/api/pedidos', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: pedidoId, status: novoStatus })
    });

    if (response.ok) {
      showToast(`Pedido atualizado para '${novoStatus}' com sucesso!`, 'success');
      await refreshDashboard();
      await refreshFinanceiro();
    } else {
      const err = await response.json();
      showToast(err.error || 'Erro ao alterar status.', 'error');
    }
  } catch (error) {
    console.error('Falha ao alterar status de pedido:', error);
    showToast('Falha de rede ao alterar status.', 'error');
  }
};

// 10. Formulário de Criação de Pedido (Agendamento & Recorrência)
function setupOrderForm() {
  const form = document.getElementById('orderCreationForm');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (state.carrinho.length === 0) {
      showToast('Adicione pelo menos um pão ao carrinho antes de agendar.', 'error');
      return;
    }

    const payload = {
      cliente: {
        nome: document.getElementById('cli_nome').value,
        telefone: document.getElementById('cli_telefone').value,
        email: document.getElementById('cli_email').value || null,
        logradouro: document.getElementById('cli_logradouro').value,
        numero: document.getElementById('cli_numero').value,
        complemento: document.getElementById('cli_complemento').value || null,
        bairro: document.getElementById('cli_bairro').value,
        municipio: document.getElementById('municipio_entrega').value
      },
      produtos: state.carrinho.map(item => ({
        produto_id: item.produto_id,
        quantidade: item.quantidade
      })),
      data_agendada: document.getElementById('data_agendada').value,
      municipio_entrega: document.getElementById('municipio_entrega').value,
      recorrente_flag: document.getElementById('recorrente_flag').checked,
      recorrente_intervalo: document.getElementById('recorrente_flag').checked ? document.getElementById('recorrente_intervalo').value : null,
      observacao: document.getElementById('observacao').value || null
    };

    try {
      if (state.isOnline) {
        // Enviar direto para o Neon Postgres via API
        const response = await fetch('/api/pedidos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (response.ok) {
          showToast('Pedido registrado com sucesso na nuvem!', 'success');
          limparFormularioPedido();
          switchTab('dashboard');
        } else {
          const err = await response.json();
          showToast(err.error || 'Erro ao criar pedido.', 'error');
        }
      } else {
        // Offline: Salvar rascunho em lote no IndexedDB
        await writeIndexedDB('pedidos_offline', payload);
        showToast('Sem conexão! Pedido guardado localmente e pronto para sincronizar.', 'info');
        limparFormularioPedido();
        switchTab('dashboard');
      }
    } catch (error) {
      console.error('Falha de rede na criação do pedido:', error);
      // Fallback para persistência offline
      await writeIndexedDB('pedidos_offline', payload);
      showToast('Falha de rede! Pedido retido de forma segura no IndexedDB.', 'info');
      limparFormularioPedido();
      switchTab('dashboard');
    }
  });
}

function limparFormularioPedido() {
  document.getElementById('orderCreationForm').reset();
  state.carrinho = [];
  renderCarrinho();
}

// 11. Módulo Financeiro (Caixa & Dashboard de Fluxo de Caixa)
async function refreshFinanceiro() {
  try {
    if (state.isOnline) {
      const response = await fetch('/api/financeiro');
      if (response.ok) {
        state.financeiro = await response.json();
      }
    }
  } catch (error) {
    console.error('Erro ao carregar dados financeiros:', error);
  }

  renderFinanceiro();
}

function renderFinanceiro() {
  const recEl = document.getElementById('totalReceitas');
  const desEl = document.getElementById('totalDespesas');
  const salEl = document.getElementById('saldoLiquido');
  const salCard = document.getElementById('saldoCard');
  const tableBody = document.getElementById('financeTableBody');

  const { total_receitas, total_despesas, lucro_liquido } = state.financeiro.resumo;

  recEl.textContent = `R$ ${Number(total_receitas).toFixed(2)}`;
  desEl.textContent = `R$ ${Number(total_despesas).toFixed(2)}`;
  salEl.textContent = `R$ ${Number(lucro_liquido).toFixed(2)}`;

  // Cor do saldo
  if (lucro_liquido < 0) {
    salCard.classList.add('saldo-negativo');
  } else {
    salCard.classList.remove('saldo-negativo');
  }

  if (state.financeiro.transacoes.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="5" class="carrinho-empty" style="text-align:center;">Nenhum lançamento financeiro registrado.</td></tr>';
    return;
  }

  tableBody.innerHTML = state.financeiro.transacoes.map(t => {
    return `
      <tr>
        <td><strong>${t.descricao}</strong></td>
        <td><span class="td-tipo-badge td-tipo-${t.tipo.toLowerCase()}">${t.tipo}</span></td>
        <td style="font-weight: 600; color: ${t.tipo === 'Receita' ? 'hsl(145, 65%, 60%)' : 'hsl(0, 75%, 70%)'};">
          ${t.tipo === 'Receita' ? '+' : '-'} R$ ${Number(t.valor).toFixed(2)}
        </td>
        <td>${t.categoria}</td>
        <td>${t.data}</td>
      </tr>
    `;
  }).join('');
}

function setupFinanceForm() {
  const form = document.getElementById('financeCreationForm');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const payload = {
      tipo: document.getElementById('fin_tipo').value,
      valor: parseFloat(document.getElementById('fin_valor').value),
      descricao: document.getElementById('fin_descricao').value,
      categoria: document.getElementById('fin_categoria').value,
      data: document.getElementById('fin_data').value || null
    };

    try {
      if (state.isOnline) {
        const response = await fetch('/api/financeiro', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (response.ok) {
          showToast('Despesa/Compra registrada com sucesso!', 'success');
          form.reset();
          await refreshFinanceiro();
        } else {
          const err = await response.json();
          showToast(err.error || 'Erro ao cadastrar lançamento.', 'error');
        }
      } else {
        // Offline: guardar lançamento financeiro no IndexedDB
        await writeIndexedDB('despesas_offline', payload);
        showToast('Offline! Compra guardada de forma segura para envio posterior.', 'info');
        form.reset();
        await refreshFinanceiro();
      }
    } catch (error) {
      console.error('Falha ao registrar transação financeira:', error);
      await writeIndexedDB('despesas_offline', payload);
      showToast('Falha de rede! Lançamento retido localmente para sincronização.', 'info');
      form.reset();
    }
  });
}

// 12. Sincronização Inteligente de Transações Acumuladas Offline
async function syncOfflineData() {
  if (!state.isOnline) return;

  try {
    // A. Sincronizar Pedidos acumulados offline
    const pedidosOffline = await readAllIndexedDB('pedidos_offline');
    if (pedidosOffline.length > 0) {
      console.log(`[Offline Sync] Sincronizando ${pedidosOffline.length} pedidos pendentes...`);
      for (const ped of pedidosOffline) {
        const res = await fetch('/api/pedidos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(ped)
        });
        if (res.ok) {
          console.log('[Offline Sync] Pedido sincronizado com sucesso.');
        }
      }
      await clearIndexedDBStore('pedidos_offline');
      showToast('Pedidos acumulados offline sincronizados com o Neon Postgres!', 'success');
      await refreshDashboard();
    }

    // B. Sincronizar Transações Financeiras acumuladas offline
    const despesasOffline = await readAllIndexedDB('despesas_offline');
    if (despesasOffline.length > 0) {
      console.log(`[Offline Sync] Sincronizando ${despesasOffline.length} lançamentos financeiros...`);
      for (const desp of despesasOffline) {
        const res = await fetch('/api/financeiro', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(desp)
        });
        if (res.ok) {
          console.log('[Offline Sync] Lançamento financeiro sincronizado.');
        }
      }
      await clearIndexedDBStore('despesas_offline');
      showToast('Lançamentos financeiros offline sincronizados!', 'success');
      await refreshFinanceiro();
    }
  } catch (error) {
    console.error('Erro na rotina de sincronização em segundo plano:', error);
  }
}

// 13. Sistema Global de Toasts
window.showToast = function(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span>${type === 'success' ? '✨' : type === 'error' ? '⚠️' : 'ℹ️'}</span>
    <span>${message}</span>
  `;
  container.appendChild(toast);

  // Auto-destruição após 4 segundos
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.4s ease';
    setTimeout(() => toast.remove(), 400);
  }, 4000);
};

// Listener especial para alternância entre recorrência sim ou não no formulário
document.getElementById('recorrente_flag').addEventListener('change', (e) => {
  const intervalBox = document.getElementById('intervaloRecorrenciaBox');
  intervalBox.style.display = e.target.checked ? 'block' : 'none';
});
