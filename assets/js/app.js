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
  isOnline: navigator.onLine,
  novoClienteCoords: null,
  editClienteCoords: null,
  rotaPartidaCoords: { latitude: -20.3168, longitude: -40.3117 },
  loteRotaCalculada: []
};

// Configurações de Frete da Grande Vitória (valores iniciais reduzidos e controle síncrono local)
const freteConfig = { vitoria: 5.0, vilaVelha: 6.0, serra: 7.0, gratis: false };

function loadFreteConfig() {
  try {
    const saved = localStorage.getItem('bemavi_frete_config');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed) {
        freteConfig.vitoria = typeof parsed.vitoria === 'number' ? parsed.vitoria : 5.0;
        freteConfig.vilaVelha = typeof parsed.vilaVelha === 'number' ? parsed.vilaVelha : 6.0;
        freteConfig.serra = typeof parsed.serra === 'number' ? parsed.serra : 7.0;
        freteConfig.gratis = typeof parsed.gratis === 'boolean' ? parsed.gratis : false;
      }
    }
  } catch (e) {
    console.error('Erro ao ler bemavi_frete_config do localStorage:', e);
  }

  // Atualizar inputs na interface se existirem
  const inputVitoria = document.getElementById('cfg_frete_vitoria');
  const inputVilaVelha = document.getElementById('cfg_frete_vilavelha');
  const inputSerra = document.getElementById('cfg_frete_serra');
  const checkboxGratis = document.getElementById('cfg_frete_gratis');

  if (inputVitoria) inputVitoria.value = freteConfig.vitoria.toFixed(2);
  if (inputVilaVelha) inputVilaVelha.value = freteConfig.vilaVelha.toFixed(2);
  if (inputSerra) inputSerra.value = freteConfig.serra.toFixed(2);
  if (checkboxGratis) checkboxGratis.checked = freteConfig.gratis;

  toggleInputsFreteState(freteConfig.gratis);
  updateTipsFrete();
}

function toggleInputsFreteState(isDisabled) {
  const inputVitoria = document.getElementById('cfg_frete_vitoria');
  const inputVilaVelha = document.getElementById('cfg_frete_vilavelha');
  const inputSerra = document.getElementById('cfg_frete_serra');

  if (inputVitoria) inputVitoria.disabled = isDisabled;
  if (inputVilaVelha) inputVilaVelha.disabled = isDisabled;
  if (inputSerra) inputSerra.disabled = isDisabled;
}

function updateTipsFrete() {
  const labelVitoria = document.getElementById('tips_frete_vitoria');
  const labelVilaVelha = document.getElementById('tips_frete_vilavelha');
  const labelSerra = document.getElementById('tips_frete_serra');

  if (labelVitoria) {
    labelVitoria.textContent = freteConfig.gratis ? 'R$ 0,00 (Grátis)' : `R$ ${freteConfig.vitoria.toFixed(2)}`;
  }
  if (labelVilaVelha) {
    labelVilaVelha.textContent = freteConfig.gratis ? 'R$ 0,00 (Grátis)' : `R$ ${freteConfig.vilaVelha.toFixed(2)}`;
  }
  if (labelSerra) {
    labelSerra.textContent = freteConfig.gratis ? 'R$ 0,00 (Grátis)' : `R$ ${freteConfig.serra.toFixed(2)}`;
  }
}

function saveFreteConfig() {
  try {
    localStorage.setItem('bemavi_frete_config', JSON.stringify(freteConfig));
  } catch (e) {
    console.error('Erro ao salvar bemavi_frete_config no localStorage:', e);
  }
}

async function syncFreteConfigToBackend() {
  if (!state.isOnline) return;

  try {
    const payload = {
      taxas: {
        "Vitória": freteConfig.gratis ? 0 : freteConfig.vitoria,
        "Vila Velha": freteConfig.gratis ? 0 : freteConfig.vilaVelha,
        "Serra": freteConfig.gratis ? 0 : freteConfig.serra
      }
    };

    const response = await fetch('/api/taxas', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (response.ok) {
      console.log('[Frete Sync] Taxas de entrega sincronizadas com o banco de dados Neon.');
    } else {
      console.warn('[Frete Sync] Falha ao sincronizar taxas de entrega com backend.');
    }
  } catch (e) {
    console.error('[Frete Sync] Erro de rede ao sincronizar taxas de entrega:', e);
  }
}

async function fetchFreteConfigFromBackend() {
  if (!state.isOnline) return;

  try {
    const response = await fetch('/api/taxas');
    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data) && data.length > 0) {
        let vitoriaVal = 5.0;
        let vilaVelhaVal = 6.0;
        let serraVal = 7.0;

        data.forEach(item => {
          const val = parseFloat(item.valor_taxa) || 0;
          if (item.municipio === 'Vitória') vitoriaVal = val;
          if (item.municipio === 'Vila Velha') vilaVelhaVal = val;
          if (item.municipio === 'Serra') serraVal = val;
        });

        const todosGratis = (vitoriaVal === 0 && vilaVelhaVal === 0 && serraVal === 0);

        if (todosGratis) {
          freteConfig.gratis = true;
        } else {
          freteConfig.gratis = false;
          freteConfig.vitoria = vitoriaVal;
          freteConfig.vilaVelha = vilaVelhaVal;
          freteConfig.serra = serraVal;
        }

        saveFreteConfig();
        
        const inputVitoria = document.getElementById('cfg_frete_vitoria');
        const inputVilaVelha = document.getElementById('cfg_frete_vilavelha');
        const inputSerra = document.getElementById('cfg_frete_serra');
        const checkboxGratis = document.getElementById('cfg_frete_gratis');

        if (inputVitoria) inputVitoria.value = freteConfig.vitoria.toFixed(2);
        if (inputVilaVelha) inputVilaVelha.value = freteConfig.vilaVelha.toFixed(2);
        if (inputSerra) inputSerra.value = freteConfig.serra.toFixed(2);
        if (checkboxGratis) checkboxGratis.checked = freteConfig.gratis;

        toggleInputsFreteState(freteConfig.gratis);
        updateTipsFrete();
        
        if (typeof renderCarrinho === 'function') {
          renderCarrinho();
        }
      }
    }
  } catch (e) {
    console.error('[Frete Fetch] Falha ao carregar taxas de entrega do backend Neon:', e);
  }
}

window.updateConfigFrete = function() {
  const inputVitoria = document.getElementById('cfg_frete_vitoria');
  const inputVilaVelha = document.getElementById('cfg_frete_vilavelha');
  const inputSerra = document.getElementById('cfg_frete_serra');

  if (inputVitoria) freteConfig.vitoria = Math.max(0, parseFloat(inputVitoria.value) || 0);
  if (inputVilaVelha) freteConfig.vilaVelha = Math.max(0, parseFloat(inputVilaVelha.value) || 0);
  if (inputSerra) freteConfig.serra = Math.max(0, parseFloat(inputSerra.value) || 0);

  saveFreteConfig();
  updateTipsFrete();
  
  if (typeof renderCarrinho === 'function') {
    renderCarrinho();
  }

  // Tenta sincronizar com o banco se estiver online
  syncFreteConfigToBackend();
};

window.toggleFreteGratis = function() {
  const checkboxGratis = document.getElementById('cfg_frete_gratis');
  if (checkboxGratis) {
    freteConfig.gratis = checkboxGratis.checked;
  }

  toggleInputsFreteState(freteConfig.gratis);
  saveFreteConfig();
  updateTipsFrete();
  
  if (typeof renderCarrinho === 'function') {
    renderCarrinho();
  }

  // Tenta sincronizar com o banco se estiver online
  syncFreteConfigToBackend();
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
  
  // Carregar configurações de frete síncronas do localStorage
  loadFreteConfig();
  
  // Tentar carregar taxas atualizadas do banco de dados se estiver online
  fetchFreteConfigFromBackend();
  
  // Carregar dados iniciais
  await renderCatalogo();
  await refreshDashboard();
  await refreshFinanceiro();
  
  // Setup formulários
  setupOrderForm();
  setupFinanceForm();
  setupProductForm();
  
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
  if (tabId === 'catalogo') refreshCatalogManagement();
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
  const ativos = state.produtos.filter(p => p.ativo !== false);
  if (ativos.length === 0) {
    catalogGrid.innerHTML = '<div class="carrinho-empty">Nenhum produto cadastrado no catálogo offline.</div>';
    return;
  }

  catalogGrid.innerHTML = ativos.map(prod => `
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
    state.produtos.filter(p => p.ativo !== false).map(prod => `
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
  
  // Obter taxa dinamicamente a partir do freteConfig ou frete gratuito ativado
  let taxa = 0;
  if (!freteConfig.gratis) {
    if (municipioSelect.value === 'Vitória') taxa = freteConfig.vitoria;
    else if (municipioSelect.value === 'Vila Velha') taxa = freteConfig.vilaVelha;
    else if (municipioSelect.value === 'Serra') taxa = freteConfig.serra;
  }

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
    const mapsIndividualUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(pedido.cliente.logradouro + ', ' + pedido.cliente.numero + ', ' + pedido.cliente.bairro + ', ' + pedido.cliente.municipio + ' - ES')}`;
    
    let acoesHtml = '';
    if (pedido.status !== 'Entregue') {
      acoesHtml += `
        <button class="btn btn-secondary" onclick="openOrderEditModal('${pedido.id}')" style="background: rgba(245, 158, 11, 0.08); border-color: rgba(245, 158, 11, 0.2); color: var(--primary);">📝 Editar</button>
      `;
    }
    
    acoesHtml += `
      <a href="${mapsIndividualUrl}" target="_blank" class="btn btn-secondary" style="text-decoration: none; display: inline-flex; align-items: center; gap: 0.25rem;">📍 Rota</a>
    `;

    if (pedido.status === 'Rascunho') {
      acoesHtml += `
        <button class="btn btn-secondary" onclick="alterarStatusPedido('${pedido.id}', 'Pendente')">Aprovar Pedido</button>
      `;
    } else if (pedido.status === 'Pendente') {
      acoesHtml += `
        <button class="btn btn-primary" onclick="alterarStatusPedido('${pedido.id}', 'Agendado')">Agendar Produção</button>
      `;
    } else if (pedido.status === 'Agendado') {
      acoesHtml += `
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
        municipio: document.getElementById('municipio_entrega').value,
        latitude: state.novoClienteCoords ? state.novoClienteCoords.latitude : null,
        longitude: state.novoClienteCoords ? state.novoClienteCoords.longitude : null
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
  state.novoClienteCoords = null;
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
  const listBody = document.getElementById('financeListBody');

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

  if (!listBody) return;

  if (state.financeiro.transacoes.length === 0) {
    listBody.innerHTML = '<div class="carrinho-empty" style="text-align:center;">Nenhum lançamento financeiro registrado.</div>';
    return;
  }

  listBody.innerHTML = state.financeiro.transacoes.map(t => {
    return `
      <div class="transacao-row">
        <div class="transacao-info">
          <span class="transacao-desc">${t.descricao}</span>
          <div class="transacao-meta">
            <span class="transacao-cat">${t.categoria}</span>
            <span>•</span>
            <span class="transacao-data">${t.data}</span>
          </div>
        </div>
        <div class="transacao-tipo-desktop">
          <span class="td-tipo-badge td-tipo-${t.tipo.toLowerCase()}">${t.tipo}</span>
        </div>
        <div class="transacao-valor val-${t.tipo.toLowerCase()}">
          ${t.tipo === 'Receita' ? '+' : '-'} R$ ${Number(t.valor).toFixed(2)}
        </div>
        <div class="transacao-categoria-desktop">${t.categoria}</div>
        <div class="transacao-data-desktop">${t.data}</div>
      </div>
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
          closeFinanceModal();
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
        closeFinanceModal();
        await refreshFinanceiro();
      }
    } catch (error) {
      console.error('Falha ao registrar transação financeira:', error);
      await writeIndexedDB('despesas_offline', payload);
      showToast('Falha de rede! Lançamento retido localmente para sincronização.', 'info');
      form.reset();
      closeFinanceModal();
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

    // C. Sincronizar configurações de frete acumuladas localmente
    await syncFreteConfigToBackend();
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

// 14. Controle do Modal / Bottom Sheet Financeiro (Responsivo)
window.openFinanceModal = function() {
  const modal = document.getElementById('financeModal');
  if (modal) {
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
};

window.closeFinanceModal = function() {
  const modal = document.getElementById('financeModal');
  if (modal) {
    modal.classList.remove('active');
    document.body.style.overflow = '';
  }
};

// 15. Catálogo Administrativo (CRUD, Ativação & Modais de Produto)
async function refreshCatalogManagement() {
  try {
    if (state.isOnline) {
      const response = await fetch('/api/produtos?all=true');
      if (response.ok) {
        const prods = await response.json();
        await clearIndexedDBStore('produtos');
        for (const prod of prods) {
          await writeIndexedDB('produtos', prod);
        }
        state.produtos = prods;
      }
    } else {
      state.produtos = await readAllIndexedDB('produtos');
    }
  } catch (error) {
    console.error('Falha ao carregar catálogo administrativo de produtos:', error);
    state.produtos = await readAllIndexedDB('produtos');
  }

  renderCatalogAdmin();
}

function renderCatalogAdmin() {
  const listBody = document.getElementById('catalogAdminListBody');
  if (!listBody) return;

  if (state.produtos.length === 0) {
    listBody.innerHTML = '<tr><td colspan="7" class="carrinho-empty">Nenhum produto cadastrado no catálogo.</td></tr>';
    return;
  }

  listBody.innerHTML = state.produtos.map(prod => {
    const statusAtivo = prod.ativo !== false;
    const statusText = statusAtivo ? 'Ativo' : 'Inativo';
    const statusClass = statusAtivo ? 'ativo' : 'inativo';
    const toggleText = statusAtivo ? 'Desativar' : 'Ativar';
    const toggleClass = statusAtivo ? 'btn-danger' : 'btn-success';

    return `
      <tr>
        <td data-label="Nome do Pão" style="font-weight: 600; color: var(--text-main);">${prod.nome}</td>
        <td data-label="Tipo / Versão">${prod.versao}</td>
        <td data-label="Modelo / Peso">${prod.modelo}</td>
        <td data-label="Sabor / Ingredientes" style="font-size: 0.85rem; color: var(--text-muted);">${prod.sabor}</td>
        <td data-label="Preço Base" style="font-weight: 600; color: var(--primary);">R$ ${Number(prod.preco_base).toFixed(2)}</td>
        <td data-label="Status">
          <span class="badge-status ${statusClass}">${statusText}</span>
        </td>
        <td data-label="Ações" style="text-align: center;">
          <div style="display: flex; gap: 0.5rem; justify-content: center;">
            <button class="btn btn-secondary btn-table-action" onclick="openProductModal('${prod.id}')" style="padding: 4px 8px; font-size: 0.8rem;">Editar</button>
            <button class="btn ${toggleClass} btn-table-action" onclick="toggleProductActive('${prod.id}', ${statusAtivo})" style="padding: 4px 8px; font-size: 0.8rem;">${toggleText}</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

window.openProductModal = function(prodId) {
  const modal = document.getElementById('productModal');
  const titleText = document.getElementById('productModalTitleText');
  const form = document.getElementById('productCreationForm');

  if (!modal) return;

  form.reset();
  document.getElementById('prod_id').value = '';

  if (prodId) {
    titleText.textContent = 'Editar Pão Caseiro';
    const prod = state.produtos.find(p => p.id === prodId);
    if (prod) {
      document.getElementById('prod_id').value = prod.id;
      document.getElementById('prod_nome').value = prod.nome;
      document.getElementById('prod_versao').value = prod.versao;
      document.getElementById('prod_modelo').value = prod.modelo;
      document.getElementById('prod_sabor').value = prod.sabor;
      document.getElementById('prod_preco').value = Number(prod.preco_base).toFixed(2);
      document.getElementById('prod_ativo').checked = prod.ativo !== false;
    }
  } else {
    titleText.textContent = 'Novo Pão Caseiro';
    document.getElementById('prod_ativo').checked = true;
  }

  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
};

window.closeProductModal = function() {
  const modal = document.getElementById('productModal');
  if (modal) {
    modal.classList.remove('active');
    document.body.style.overflow = '';
  }
};

window.toggleProductActive = async function(prodId, currentStatus) {
  if (!state.isOnline) {
    showToast('Apenas online é permitido alterar a ativação do produto no banco de dados.', 'error');
    return;
  }

  const prod = state.produtos.find(p => p.id === prodId);
  if (!prod) return;

  const payload = {
    id: prod.id,
    nome: prod.nome,
    versao: prod.versao,
    sabor: prod.sabor,
    modelo: prod.modelo,
    preco_base: Number(prod.preco_base),
    ativo: !currentStatus
  };

  try {
    const response = await fetch('/api/produtos', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (response.ok) {
      const data = await response.json();
      showToast(`Produto '${prod.nome}' ${!currentStatus ? 'ativado' : 'desativado'} com sucesso!`, 'success');
      
      const updatedProd = data.produto;
      await writeIndexedDB('produtos', updatedProd);
      
      await refreshCatalogManagement();
      await renderCatalogo();
    } else {
      const err = await response.json();
      showToast(err.error || 'Erro ao alterar status do produto.', 'error');
    }
  } catch (error) {
    console.error('Falha ao alterar ativação do produto:', error);
    showToast('Falha de rede ao alterar ativação do produto.', 'error');
  }
};

function setupProductForm() {
  const form = document.getElementById('productCreationForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const id = document.getElementById('prod_id').value;
    const payload = {
      nome: document.getElementById('prod_nome').value,
      versao: document.getElementById('prod_versao').value,
      modelo: document.getElementById('prod_modelo').value,
      sabor: document.getElementById('prod_sabor').value,
      preco_base: parseFloat(document.getElementById('prod_preco').value),
      ativo: document.getElementById('prod_ativo').checked
    };

    if (id) {
      payload.id = id;
    }

    if (!state.isOnline) {
      showToast('Apenas online é permitido cadastrar ou editar produtos no catálogo Bemavi.', 'error');
      return;
    }

    try {
      const method = id ? 'PUT' : 'POST';
      const response = await fetch('/api/produtos', {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        const data = await response.json();
        showToast(id ? 'Produto atualizado com sucesso!' : 'Novo pão cadastrado com sucesso!', 'success');
        
        const savedProd = data.produto;
        await writeIndexedDB('produtos', savedProd);

        closeProductModal();
        await refreshCatalogManagement();
        await renderCatalogo();
      } else {
        const err = await response.json();
        showToast(err.error || 'Erro ao salvar produto.', 'error');
      }
    } catch (error) {
      console.error('Falha ao salvar produto:', error);
      showToast('Falha de rede ao salvar produto. O banco de dados pode estar indisponível.', 'error');
    }
  });
}

// ============================================================================
// 16. ROTEIRIZAÇÃO E HEURÍSTICA DE VIZINHANÇA GEOGRÁFICA (GRANDE VITÓRIA)
// ============================================================================
const bairroPesos = {
  // Vitória
  'bento ferreira': 1,
  'monte belo': 2,
  'jucutuquara': 3,
  'gurigica': 4,
  'horto': 5,
  'santa lúcia': 6,
  'praia do canto': 7,
  'barro vermelho': 8,
  'enseada do suá': 9,
  'santa helena': 10,
  'jardim da penha': 11,
  'mata da praia': 12,
  'jardim camburi': 13,
  
  // Vila Velha (Próximo à Terceira Ponte)
  'praia da costa': 20,
  'itapoã': 21,
  'itaparica': 22,
  'coqueiral de itaparica': 23,
  'centro': 24,
  'glória': 25,
  
  // Serra (Próximo a Jardim Camburi)
  'bairro de fátima': 30,
  'carapina': 31,
  'laranjeiras': 32,
  'parque residencial laranjeiras': 33,
  'jacaraípe': 34
};

function obterPesoEndereco(pedido) {
  const mun = (pedido.cliente.municipio || '').toLowerCase().trim();
  const bai = (pedido.cliente.bairro || '').toLowerCase().trim();
  
  let pesoBase = 0;
  if (mun === 'vitória' || mun === 'vitoria') pesoBase = 100;
  else if (mun === 'vila velha') pesoBase = 200;
  else if (mun === 'serra') pesoBase = 300;
  else pesoBase = 400;
  
  const pesoBairro = bairroPesos[bai] || 99;
  return pesoBase + pesoBairro;
}

// Função para calcular a distância física direta entre dois pontos em km (Haversine)
function calcularDistanciaHaversine(lat1, lon1, lat2, lon2) {
  if (lat1 === null || lon1 === null || lat2 === null || lon2 === null) return 0;
  const R = 6371; // Raio da Terra em km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c; // Distância em km
}

function obterCoordenadasFallback(pedido) {
  if (pedido.cliente.latitude !== null && pedido.cliente.longitude !== null &&
      !isNaN(pedido.cliente.latitude) && !isNaN(pedido.cliente.longitude)) {
    return { lat: Number(pedido.cliente.latitude), lon: Number(pedido.cliente.longitude) };
  }
  // Coordenadas aproximadas padrão para a Grande Vitória
  const mun = (pedido.cliente.municipio || '').toLowerCase().trim();
  if (mun === 'vila velha') {
    return { lat: -20.3292, lon: -40.2882 }; // Praia da Costa
  } else if (mun === 'serra') {
    return { lat: -20.1947, lon: -40.2588 }; // Laranjeiras
  } else {
    return { lat: -20.3155, lon: -40.3128 }; // Vitória Centro
  }
}

window.planejarMelhorRota = function() {
  const partidaInput = document.getElementById('rota_partida');
  const horarioInput = document.getElementById('rota_horario');
  const dataInput = document.getElementById('rota_data');
  const resultDiv = document.getElementById('routePlanningResult');
  const timelineEl = document.getElementById('routeTimeline');
  const btnMaps = document.getElementById('btnOpenGoogleMapsRoute');
  const btnSaveBatch = document.getElementById('btnSaveCalculatedRoutes');
  
  if (!partidaInput || !horarioInput || !dataInput || !resultDiv || !timelineEl || !btnMaps || !btnSaveBatch) return;
  
  const dataSelecionada = dataInput.value;
  if (!dataSelecionada) {
    showToast('Por favor, selecione uma data para roteirização.', 'error');
    return;
  }

  // Filtrar pedidos que estão Ativos (Pendente ou Agendado) na data selecionada
  // Comparamos apenas o dia simples YYYY-MM-DD
  const pedidosDoDia = state.pedidos.filter(p => {
    if (p.status !== 'Pendente' && p.status !== 'Agendado') return false;
    const diaPedido = p.data_agendada.substring(0, 10);
    return diaPedido === dataSelecionada;
  });
  
  if (pedidosDoDia.length === 0) {
    showToast('Nenhum pedido pendente ou agendado para a data selecionada.', 'info');
    resultDiv.style.display = 'none';
    return;
  }
  
  // ALGORITMO DO VIZINHO MAIS PRÓXIMO para ordenação de rota
  const pedidosNaoVisitados = [...pedidosDoDia];
  const pedidosOrdenados = [];
  
  // Posição inicial: Bento Ferreira (ou de onde o usuário digitar e resolver pelo Nominatim)
  let latAtual = state.rotaPartidaCoords.latitude || -20.3168;
  let lonAtual = state.rotaPartidaCoords.longitude || -40.3117;
  
  while (pedidosNaoVisitados.length > 0) {
    let indiceProximo = -1;
    let menorDistancia = Infinity;
    
    for (let i = 0; i < pedidosNaoVisitados.length; i++) {
      const coords = obterCoordenadasFallback(pedidosNaoVisitados[i]);
      const dist = calcularDistanciaHaversine(latAtual, lonAtual, coords.lat, coords.lon);
      if (dist < menorDistancia) {
        menorDistancia = dist;
        indiceProximo = i;
      }
    }
    
    if (indiceProximo !== -1) {
      const pedidoEscolhido = pedidosNaoVisitados.splice(indiceProximo, 1)[0];
      pedidosOrdenados.push(pedidoEscolhido);
      const coordsEscolhida = obterCoordenadasFallback(pedidoEscolhido);
      latAtual = coordsEscolhida.lat;
      lonAtual = coordsEscolhida.lon;
    }
  }

  // Reiniciar para Bento Ferreira para calcular os tempos a partir da partida
  latAtual = state.rotaPartidaCoords.latitude || -20.3168;
  lonAtual = state.rotaPartidaCoords.longitude || -40.3117;
  
  // Configurar hora atual a partir do horário de saída
  const [saidaHora, saidaMin] = horarioInput.value.split(':');
  let dataHora = new Date(`${dataSelecionada}T${saidaHora || '08'}:${saidaMin || '00'}:00`);
  
  let timelineHtml = `
    <div class="timeline-node partida">
      <span class="timeline-time">${horarioInput.value}</span>
      <span class="timeline-info">📍 Ponto de Partida (Saída e-Bike)</span>
      <span class="timeline-address">${partidaInput.value}</span>
    </div>
  `;
  
  let stops = [];
  let loteBatch = [];
  let distanciaAcumulada = 0;
  
  pedidosOrdenados.forEach((pedido, idx) => {
    const cli = pedido.cliente;
    const coords = obterCoordenadasFallback(pedido);
    
    // Distância Haversine direta em km
    const distFisica = calcularDistanciaHaversine(latAtual, lonAtual, coords.lat, coords.lon);
    
    // Distância urbana corrigida pelo fator de rua de 1.35
    const distCorrigida = distFisica * 1.35;
    distanciaAcumulada += distCorrigida;
    
    // Tempo de trânsito em minutos a 18 km/h de e-bike
    const tempoDeslocamentoMinutos = Math.max(1, Math.round((distCorrigida / 18) * 60));
    
    // Somar o tempo de deslocamento
    dataHora.setMinutes(dataHora.getMinutes() + tempoDeslocamentoMinutos);
    
    // Criar o timestamp formatado para o banco de dados (no formato de data simples e horário correto)
    const ano = dataHora.getFullYear();
    const mes = String(dataHora.getMonth() + 1).padStart(2, '0');
    const dia = String(dataHora.getDate()).padStart(2, '0');
    const horas = String(dataHora.getHours()).padStart(2, '0');
    const minutos = String(dataHora.getMinutes()).padStart(2, '0');
    const dataAgendadaCalculada = `${ano}-${mes}-${dia}T${horas}:${minutos}:00`;
    
    loteBatch.push({
      id: pedido.id,
      data_agendada: dataAgendadaCalculada
    });
    
    const horaFormatada = `${horas}:${minutos}`;
    const enderecoCompleto = `${cli.logradouro}, ${cli.numero}, ${cli.bairro}, ${cli.municipio} - ES`;
    stops.push(enderecoCompleto);
    
    timelineHtml += `
      <div class="timeline-node" style="animation: fadeInUp 0.4s ease forwards; animation-delay: ${idx * 0.1}s;">
        <span class="timeline-time">${horaFormatada}</span>
        <span class="timeline-info">📦 #${pedido.id.substring(0, 5)} - ${cli.nome}</span>
        <div style="font-size: 0.75rem; color: var(--primary); margin: 0.2rem 0;">
          🚴 e-Bike: +${distCorrigida.toFixed(1)} km (${tempoDeslocamentoMinutos} min de pedalada)
        </div>
        <span class="timeline-address">${enderecoCompleto}</span>
      </div>
    `;
    
    // Somar 5 minutos de parada para a entrega antes de ir ao próximo
    dataHora.setMinutes(dataHora.getMinutes() + 5);
    
    // Atualizar referências
    latAtual = coords.lat;
    lonAtual = coords.lon;
  });
  
  timelineEl.innerHTML = timelineHtml;
  resultDiv.style.display = 'flex';
  
  // Guardar lote temporário no state para salvar no Neon
  state.loteRotaCalculada = loteBatch;
  
  // Habilitar botão de salvar em lote
  btnSaveBatch.style.display = 'block';
  
  // Link para Google Maps
  const partidaEscaped = encodeURIComponent(partidaInput.value);
  const destinosEscaped = stops.map(s => encodeURIComponent(s)).join('/');
  const mapsUrl = `https://www.google.com/maps/dir/${partidaEscaped}/${destinosEscaped}`;
  btnMaps.href = mapsUrl;
  
  showToast(`Melhor rota calculada! Total: ${distanciaAcumulada.toFixed(1)} km de e-bike.`, 'success');
};

// ============================================================================
// 17. MODAL DE EDIÇÃO COMPLETA DE PEDIDOS
// ============================================================================
state.editCarrinho = []; // Carrinho temporário para o modal de edição

window.openOrderEditModal = function(pedidoId) {
  const pedido = state.pedidos.find(p => p.id === pedidoId);
  if (!pedido) {
    showToast('Pedido não encontrado.', 'error');
    return;
  }

  if (pedido.status === 'Entregue') {
    showToast('Não é permitido editar pedidos que já foram entregues.', 'error');
    return;
  }

  // Preencher campos do modal
  document.getElementById('edit_order_id').value = pedido.id;
  document.getElementById('edit_cli_nome').value = pedido.cliente.nome;
  document.getElementById('edit_cli_telefone').value = pedido.cliente.telefone;
  document.getElementById('edit_cli_email').value = pedido.cliente.email || '';
  document.getElementById('edit_cli_logradouro').value = pedido.cliente.logradouro;
  document.getElementById('edit_cli_numero').value = pedido.cliente.numero;
  document.getElementById('edit_cli_complemento').value = pedido.cliente.complemento || '';
  document.getElementById('edit_cli_bairro').value = pedido.cliente.bairro;
  document.getElementById('edit_municipio_entrega').value = pedido.cliente.municipio;

  // Ajustar formato de data simples
  const diaSimples = pedido.data_agendada.substring(0, 10);
  document.getElementById('edit_data_agendada').value = diaSimples;

  state.editClienteCoords = {
    latitude: pedido.cliente.latitude,
    longitude: pedido.cliente.longitude
  };

  document.getElementById('edit_status').value = pedido.status;
  document.getElementById('edit_recorrente_flag').checked = pedido.recorrente_flag;
  
  const editIntervalBox = document.getElementById('edit_intervaloRecorrenciaBox');
  if (pedido.recorrente_flag) {
    editIntervalBox.style.display = 'block';
    document.getElementById('edit_recorrente_intervalo').value = pedido.recorrente_intervalo || 'Semanal';
  } else {
    editIntervalBox.style.display = 'none';
  }

  document.getElementById('edit_observacao').value = pedido.observacao || '';

  // Carregar produtos no carrinho de edição
  state.editCarrinho = pedido.itens.map(item => ({
    produto_id: item.produto_id,
    nome: item.nome,
    modelo: item.modelo,
    preco: Number(item.preco_unitario),
    quantidade: item.quantidade
  }));

  // Atualizar dropdown de produtos na edição
  const select = document.getElementById('edit_addProdutoSelect');
  if (select) {
    select.innerHTML = '<option value="">-- Selecione para adicionar --</option>' + 
      state.produtos.filter(p => p.ativo !== false).map(prod => `
        <option value="${prod.id}">${prod.nome} (${prod.modelo}) - R$ ${Number(prod.preco_base).toFixed(2)}</option>
      `).join('');
  }

  renderCarrinhoEdicao();

  const modal = document.getElementById('orderEditModal');
  if (modal) {
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
};

window.closeOrderEditModal = function() {
  const modal = document.getElementById('orderEditModal');
  if (modal) {
    modal.classList.remove('active');
    document.body.style.overflow = '';
  }
};

function renderCarrinhoEdicao() {
  const carrinhoBox = document.getElementById('edit_carrinhoItens');
  const totalProdutosEl = document.getElementById('edit_carrinhoTotalProdutos');
  const totalGeralEl = document.getElementById('edit_carrinhoTotalGeral');
  const taxaEntregaEl = document.getElementById('edit_carrinhoTaxaEntrega');
  const municipioSelect = document.getElementById('edit_municipio_entrega');

  if (state.editCarrinho.length === 0) {
    carrinhoBox.innerHTML = '<div class="carrinho-empty">Nenhum item selecionado.</div>';
    totalProdutosEl.textContent = 'R$ 0,00';
    totalGeralEl.textContent = 'R$ 0,00';
    return;
  }

  carrinhoBox.innerHTML = state.editCarrinho.map(item => `
    <div class="carrinho-item">
      <div>
        <strong>${item.nome}</strong> <br>
        <span style="font-size: 0.8rem; color: var(--text-muted);">${item.modelo}</span>
      </div>
      <div class="quantity-controls">
        <button type="button" class="quantity-btn" onclick="alterarQtdCarrinhoEdicao('${item.produto_id}', -1)">-</button>
        <span>${item.quantidade}</span>
        <button type="button" class="quantity-btn" onclick="alterarQtdCarrinhoEdicao('${item.produto_id}', 1)">+</button>
        <span style="margin-left: 1rem; font-weight: 600;">R$ ${(item.preco * item.quantidade).toFixed(2)}</span>
      </div>
    </div>
  `).join('');

  const subtotal = state.editCarrinho.reduce((acc, curr) => acc + (curr.preco * curr.quantidade), 0);
  
  let taxa = 0;
  if (!freteConfig.gratis) {
    if (municipioSelect.value === 'Vitória') taxa = freteConfig.vitoria;
    else if (municipioSelect.value === 'Vila Velha') taxa = freteConfig.vilaVelha;
    else if (municipioSelect.value === 'Serra') taxa = freteConfig.serra;
  }

  totalProdutosEl.textContent = `R$ ${subtotal.toFixed(2)}`;
  taxaEntregaEl.textContent = `R$ ${taxa.toFixed(2)}`;
  totalGeralEl.textContent = `R$ ${(subtotal + taxa).toFixed(2)}`;
}

window.alterarQtdCarrinhoEdicao = function(productId, delta) {
  const item = state.editCarrinho.find(i => i.produto_id === productId);
  if (!item) return;

  item.quantidade += delta;
  if (item.quantidade <= 0) {
    state.editCarrinho = state.editCarrinho.filter(i => i.produto_id !== productId);
  }
  
  renderCarrinhoEdicao();
};

window.adicionarAoCarrinhoEdicao = function(productId) {
  const produto = state.produtos.find(p => p.id === productId);
  if (!produto) return;

  const itemExistente = state.editCarrinho.find(item => item.produto_id === productId);
  if (itemExistente) {
    itemExistente.quantidade += 1;
  } else {
    state.editCarrinho.push({
      produto_id: productId,
      nome: produto.nome,
      modelo: produto.modelo,
      preco: Number(produto.preco_base),
      quantidade: 1
    });
  }

  renderCarrinhoEdicao();
  showToast(`${produto.nome} adicionado à edição!`, 'success');
};

// Inicializador de listeners do formulário de edição
function setupOrderEditForm() {
  const form = document.getElementById('orderEditForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (state.editCarrinho.length === 0) {
      showToast('O pedido precisa de pelo menos um pão.', 'error');
      return;
    }

    const orderId = document.getElementById('edit_order_id').value;
    const payload = {
      id: orderId,
      status: document.getElementById('edit_status').value,
      cliente: {
        nome: document.getElementById('edit_cli_nome').value,
        telefone: document.getElementById('edit_cli_telefone').value,
        email: document.getElementById('edit_cli_email').value || null,
        logradouro: document.getElementById('edit_cli_logradouro').value,
        numero: document.getElementById('edit_cli_numero').value,
        complemento: document.getElementById('edit_cli_complemento').value || null,
        bairro: document.getElementById('edit_cli_bairro').value,
        municipio: document.getElementById('edit_municipio_entrega').value,
        latitude: state.editClienteCoords ? state.editClienteCoords.latitude : null,
        longitude: state.editClienteCoords ? state.editClienteCoords.longitude : null
      },
      produtos: state.editCarrinho.map(item => ({
        produto_id: item.produto_id,
        quantidade: item.quantidade
      })),
      data_agendada: document.getElementById('edit_data_agendada').value,
      municipio_entrega: document.getElementById('edit_municipio_entrega').value,
      recorrente_flag: document.getElementById('edit_recorrente_flag').checked,
      recorrente_intervalo: document.getElementById('edit_recorrente_flag').checked ? document.getElementById('edit_recorrente_intervalo').value : null,
      observacao: document.getElementById('edit_observacao').value || null
    };

    if (!state.isOnline) {
      showToast('Para edições completas e recálculo financeiro, é necessário conexão online com o Neon.', 'error');
      return;
    }

    try {
      const response = await fetch('/api/pedidos', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        showToast('Pedido alterado com sucesso no Neon Postgres!', 'success');
        closeOrderEditModal();
        await refreshDashboard();
        await refreshFinanceiro();
      } else {
        const err = await response.json();
        showToast(err.error || 'Erro ao salvar alterações do pedido.', 'error');
      }
    } catch (error) {
      console.error('Falha de rede ao editar pedido:', error);
      showToast('Falha de rede ao salvar alterações. O banco de dados pode estar indisponível.', 'error');
    }
  });

  // Configurar listeners complementares
  const editRecFlag = document.getElementById('edit_recorrente_flag');
  if (editRecFlag) {
    editRecFlag.addEventListener('change', (e) => {
      const editIntervalBox = document.getElementById('edit_intervaloRecorrenciaBox');
      editIntervalBox.style.display = e.target.checked ? 'block' : 'none';
    });
  }

  const editAddBtn = document.getElementById('edit_addProdutoBtn');
  if (editAddBtn) {
    editAddBtn.addEventListener('click', () => {
      const select = document.getElementById('edit_addProdutoSelect');
      if (select && select.value) {
        adicionarAoCarrinhoEdicao(select.value);
        select.value = '';
      }
    });
  }

  const editMunicipioSelect = document.getElementById('edit_municipio_entrega');
  if (editMunicipioSelect) {
    editMunicipioSelect.addEventListener('change', renderCarrinhoEdicao);
  }
}

// Configurar o formulário após carregar
document.addEventListener('DOMContentLoaded', () => {
  setupOrderEditForm();

  // Inicializar o Autocomplete Nominatim
  setupAddressAutocomplete('cli_logradouro', 'cli_logradouro_suggestions', (data) => {
    state.novoClienteCoords = { latitude: data.latitude, longitude: data.longitude };
    if (data.bairro) document.getElementById('cli_bairro').value = data.bairro;
    const munSelect = document.getElementById('municipio_entrega');
    if (munSelect && data.municipio) {
      munSelect.value = data.municipio;
      renderCarrinho();
    }
  });

  setupAddressAutocomplete('edit_cli_logradouro', 'edit_cli_logradouro_suggestions', (data) => {
    state.editClienteCoords = { latitude: data.latitude, longitude: data.longitude };
    if (data.bairro) document.getElementById('edit_cli_bairro').value = data.bairro;
    const munSelect = document.getElementById('edit_municipio_entrega');
    if (munSelect && data.municipio) {
      munSelect.value = data.municipio;
      renderCarrinhoEdicao();
    }
  });

  setupAddressAutocomplete('rota_partida', 'rota_partida_suggestions', (data) => {
    state.rotaPartidaCoords = { latitude: data.latitude, longitude: data.longitude };
  });
});

// ============================================================================
// 18. SALVAMENTO ATÔMICO DA ROTA SEQUENCIAL DE E-BIKE NO NEON POSTGRES
// ============================================================================
window.salvarRotasNoBanco = async function() {
  if (!state.isOnline) {
    showToast('Apenas online é permitido salvar o planejamento de rotas no banco.', 'error');
    return;
  }

  if (!state.loteRotaCalculada || state.loteRotaCalculada.length === 0) {
    showToast('Nenhuma rota calculada para salvar.', 'error');
    return;
  }

  try {
    const response = await fetch('/api/pedidos', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ batch: state.loteRotaCalculada })
    });

    if (response.ok) {
      showToast('Horários e rotas otimizados gravados com sucesso no Neon Postgres!', 'success');
      state.loteRotaCalculada = [];
      const btnSaveBatch = document.getElementById('btnSaveCalculatedRoutes');
      if (btnSaveBatch) btnSaveBatch.style.display = 'none';
      await refreshDashboard();
    } else {
      const err = await response.json();
      showToast(err.error || 'Erro ao persistir planejamento de rotas.', 'error');
    }
  } catch (error) {
    console.error('Erro de rede ao salvar rotas:', error);
    showToast('Erro de rede ao salvar rotas no banco de dados.', 'error');
  }
};

// ============================================================================
// 19. AUTOCOMPLETE DE ENDEREÇOS COM A API NOMINATIM (OPENSTREETMAP)
// ============================================================================
function setupAddressAutocomplete(inputId, suggestionsId, onSelect) {
  const input = document.getElementById(inputId);
  const suggestionsContainer = document.getElementById(suggestionsId);
  if (!input || !suggestionsContainer) return;

  let debounceTimer;

  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const query = input.value.trim();

    if (query.length < 3) {
      suggestionsContainer.innerHTML = '';
      suggestionsContainer.style.display = 'none';
      return;
    }

    debounceTimer = setTimeout(async () => {
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query + ', Espírito Santo, Brasil')}&addressdetails=1&limit=5`;
        const response = await fetch(url, {
          headers: { 'User-Agent': 'BemaviPanificacao/1.0' }
        });

        if (!response.ok) return;
        const results = await response.json();

        if (results.length === 0) {
          suggestionsContainer.innerHTML = '<div class="autocomplete-suggestion-item">Nenhum endereço encontrado</div>';
          suggestionsContainer.style.display = 'block';
          return;
        }

        suggestionsContainer.innerHTML = results.map(item => {
          const name = item.display_name;
          return `
            <div class="autocomplete-suggestion-item" data-lat="${item.lat}" data-lon="${item.lon}" data-address="${encodeURIComponent(JSON.stringify(item))}">
              ${name}
            </div>
          `;
        }).join('');
        suggestionsContainer.style.display = 'block';

        suggestionsContainer.querySelectorAll('.autocomplete-suggestion-item').forEach(el => {
          el.addEventListener('click', () => {
            const rawData = JSON.parse(decodeURIComponent(el.dataset.address));
            const lat = Number(el.dataset.lat);
            const lon = Number(el.dataset.lon);
            
            const addr = rawData.address || {};
            const logradouro = addr.road || addr.pedestrian || addr.suburb || rawData.name || '';
            const bairro = addr.suburb || addr.neighbourhood || addr.city_district || '';
            let municipio = addr.city || addr.town || addr.municipality || '';
            
            if (municipio.toLowerCase().includes('vitoria') || municipio.toLowerCase().includes('vitória')) {
              municipio = 'Vitória';
            } else if (municipio.toLowerCase().includes('vila velha')) {
              municipio = 'Vila Velha';
            } else if (municipio.toLowerCase().includes('serra')) {
              municipio = 'Serra';
            }

            input.value = logradouro;
            suggestionsContainer.innerHTML = '';
            suggestionsContainer.style.display = 'none';

            onSelect({
              logradouro,
              bairro,
              municipio,
              latitude: lat,
              longitude: lon
            });
          });
        });

      } catch (error) {
        console.error('Erro no Nominatim autocomplete:', error);
      }
    }, 400);
  });

  document.addEventListener('click', (e) => {
    if (e.target !== input && e.target !== suggestionsContainer && !suggestionsContainer.contains(e.target)) {
      suggestionsContainer.innerHTML = '';
      suggestionsContainer.style.display = 'none';
    }
  });
}

