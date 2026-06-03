/* ============================================================================
   LÓGICA DO CLIENTE SPA & PWA RESILIENTE - BEMAVI PÃO ARTESANAL
   Controle offline, IndexedDB local e sincronização atômica de transações.
   ============================================================================ */

// 1. Estado Global da Aplicação
const API_BASE_URL = window.location.protocol === 'file:' ? 'https://bemavi.vercel.app' : '';

const state = {
  activeTab: 'dashboard',
  activeSubTab: 'pendentes',
  produtos: [],
  pedidos: [],
  consignacoes: [],
  financeiro: {
    resumo: { total_receitas: 0, total_despesas: 0, lucro_liquido: 0 },
    transacoes: []
  },
  carrinho: [], // [{ produto_id, quantidade }]
  isOnline: navigator.onLine,
  novoClienteCoords: null,
  editClienteCoords: null,
  rotaPartidaCoords: { latitude: -20.3168, longitude: -40.3117 },
  loteRotaCalculada: [],
  taxasMaquininha: { debito: 2.27, credito: 3.99 },
  aiInsights: {
    dashboard: { hash: '', loading: false },
    catalogo: { hash: '', loading: false },
    pedidos: { hash: '', loading: false }
  },
  clientesHistoricos: []
};

function generateUUID() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

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
  updateMunicipioSelectLabels();
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

function updateMunicipioSelectLabels() {
  const selects = [
    document.getElementById('municipio_entrega'),
    document.getElementById('edit_municipio_entrega')
  ];

  selects.forEach(select => {
    if (!select) return;

    // Salvar valor selecionado anteriormente
    const val = select.value;

    select.innerHTML = `
      <option value="Vitória">Vitória (${freteConfig.gratis ? 'Grátis' : `Taxa: R$ ${freteConfig.vitoria.toFixed(2)}`})</option>
      <option value="Vila Velha">Vila Velha (${freteConfig.gratis ? 'Grátis' : `Taxa: R$ ${freteConfig.vilaVelha.toFixed(2)}`})</option>
      <option value="Serra">Serra (${freteConfig.gratis ? 'Grátis' : `Taxa: R$ ${freteConfig.serra.toFixed(2)}`})</option>
    `;

    // Restaurar seleção
    select.value = val;
  });
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

    const response = await fetch(`${API_BASE_URL}/api/taxas`, {
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
    const response = await fetch(`${API_BASE_URL}/api/taxas`);
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
        updateMunicipioSelectLabels();
        
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
  updateMunicipioSelectLabels();
  
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
  updateMunicipioSelectLabels();
  
  if (typeof renderCarrinho === 'function') {
    renderCarrinho();
  }

  // Tenta sincronizar com o banco se estiver online
  syncFreteConfigToBackend();
};

// Configuração de Taxas da Maquininha de Cartão (LocalStorage + Backend Sync)
function loadTaxasMaquininha() {
  try {
    const saved = localStorage.getItem('bemavi_taxas_maquininha');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed) {
        state.taxasMaquininha.debito = typeof parsed.debito === 'number' ? parsed.debito : 2.27;
        state.taxasMaquininha.credito = typeof parsed.credito === 'number' ? parsed.credito : 3.99;
      }
    }
  } catch (e) {
    console.error('Erro ao ler bemavi_taxas_maquininha do localStorage:', e);
  }

  // Atualizar inputs se existirem
  const inputDebito = document.getElementById('cfg_taxa_debito');
  const inputCredito = document.getElementById('cfg_taxa_credito');
  if (inputDebito) inputDebito.value = state.taxasMaquininha.debito.toFixed(2);
  if (inputCredito) inputCredito.value = state.taxasMaquininha.credito.toFixed(2);
}

function saveTaxasMaquininha() {
  try {
    localStorage.setItem('bemavi_taxas_maquininha', JSON.stringify(state.taxasMaquininha));
  } catch (e) {
    console.error('Erro ao salvar bemavi_taxas_maquininha no localStorage:', e);
  }
}

async function syncTaxasMaquininhaToBackend() {
  if (!state.isOnline) return;

  try {
    const payload = {
      taxas: {
        "Débito": state.taxasMaquininha.debito,
        "Crédito": state.taxasMaquininha.credito
      }
    };

    const response = await fetch(`${API_BASE_URL}/api/taxas-maquininha`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (response.ok) {
      console.log('[Taxas Sync] Taxas de maquininha sincronizadas com o banco Neon.');
    } else {
      console.warn('[Taxas Sync] Falha ao sincronizar taxas de maquininha com backend.');
    }
  } catch (e) {
    console.error('[Taxas Sync] Erro de rede ao sincronizar taxas de maquininha:', e);
  }
}

async function fetchTaxasMaquininhaFromBackend() {
  if (!state.isOnline) return;

  try {
    const response = await fetch(`${API_BASE_URL}/api/taxas-maquininha`);
    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data) && data.length > 0) {
        data.forEach(item => {
          const val = parseFloat(item.porcentagem_taxa) || 0;
          if (item.meio_pagamento === 'Débito') state.taxasMaquininha.debito = val;
          if (item.meio_pagamento === 'Crédito') state.taxasMaquininha.credito = val;
        });

        saveTaxasMaquininha();

        const inputDebito = document.getElementById('cfg_taxa_debito');
        const inputCredito = document.getElementById('cfg_taxa_credito');
        if (inputDebito) inputDebito.value = state.taxasMaquininha.debito.toFixed(2);
        if (inputCredito) inputCredito.value = state.taxasMaquininha.credito.toFixed(2);
      }
    }
  } catch (e) {
    console.error('[Taxas Fetch] Falha ao buscar taxas de maquininha do backend:', e);
  }
}

window.updateConfigTaxasMaquininha = function() {
  const inputDebito = document.getElementById('cfg_taxa_debito');
  const inputCredito = document.getElementById('cfg_taxa_credito');

  if (inputDebito) state.taxasMaquininha.debito = Math.max(0, Math.min(100, parseFloat(inputDebito.value) || 0));
  if (inputCredito) state.taxasMaquininha.credito = Math.max(0, Math.min(100, parseFloat(inputCredito.value) || 0));

  saveTaxasMaquininha();
  syncTaxasMaquininhaToBackend();
};

// Configurações globais do sistema (chaves de API e usuários)
async function carregarConfiguracoesSistema() {
  if (!state.isOnline) return;

  try {
    const response = await fetch(`${API_BASE_URL}/api/configuracoes`);
    if (!response.ok) throw new Error('config_unavailable');
    const data = await response.json();

    renderConfiguracoesSistema(data.configuracoes || {});
    renderUsuariosSistema(data.usuarios || []);
  } catch (error) {
    console.error('Falha ao carregar configurações do sistema:', error);
    const badge = document.getElementById('configStatusBadge');
    if (badge) {
      badge.textContent = 'Indisponível';
      badge.className = 'badge-status inativo';
    }
  }
}

function renderConfiguracoesSistema(configuracoes) {
  const badge = document.getElementById('configStatusBadge');
  const groqStatus = document.getElementById('configGroqStatus');
  const mpAccessStatus = document.getElementById('configMpAccessStatus');
  const mpPublicStatus = document.getElementById('configMpPublicStatus');
  const mpWebhookStatus = document.getElementById('configMpWebhookStatus');
  const groqInput = document.getElementById('config_groq_api_key');
  const mpAccessInput = document.getElementById('config_mp_access_token');
  const mpPublicInput = document.getElementById('config_mp_public_key');
  const mpWebhookInput = document.getElementById('config_mp_webhook_secret');

  const hasGroq = Boolean(configuracoes.GROQ_API_KEY?.configured);
  const hasMpAccess = Boolean(configuracoes.MERCADOPAGO_ACCESS_TOKEN?.configured);
  const hasMpPublic = Boolean(configuracoes.MERCADOPAGO_PUBLIC_KEY?.configured);
  const hasMpWebhook = Boolean(configuracoes.MERCADOPAGO_WEBHOOK_SECRET?.configured);
  const groqMask = configuracoes.GROQ_API_KEY?.value;
  const mpAccessMask = configuracoes.MERCADOPAGO_ACCESS_TOKEN?.value;
  const mpPublicMask = configuracoes.MERCADOPAGO_PUBLIC_KEY?.value;
  const mpWebhookMask = configuracoes.MERCADOPAGO_WEBHOOK_SECRET?.value;

  if (badge) {
    badge.textContent = hasMpAccess ? 'Mercado Pago configurado' : 'Mercado Pago pendente';
    badge.className = `badge-status ${hasMpAccess ? 'ativo' : 'inativo'}`;
  }
  if (groqStatus) groqStatus.textContent = hasGroq ? `Salva no banco: ${groqMask}` : 'Não configurada';
  if (mpAccessStatus) mpAccessStatus.textContent = hasMpAccess ? `Salvo no banco: ${mpAccessMask}` : 'Não configurado';
  if (mpPublicStatus) mpPublicStatus.textContent = hasMpPublic ? `Salva no banco: ${mpPublicMask}` : 'Não configurada';
  if (mpWebhookStatus) mpWebhookStatus.textContent = hasMpWebhook ? `Salvo no banco: ${mpWebhookMask}` : 'Não configurado';

  if (groqInput) groqInput.placeholder = hasGroq ? `Salva: ${groqMask}` : 'gsk_...';
  if (mpAccessInput) mpAccessInput.placeholder = hasMpAccess ? `Salvo: ${mpAccessMask}` : 'APP_USR-...';
  if (mpPublicInput) mpPublicInput.placeholder = hasMpPublic ? `Salva: ${mpPublicMask}` : 'APP_USR-...';
  if (mpWebhookInput) mpWebhookInput.placeholder = hasMpWebhook ? `Salvo: ${mpWebhookMask}` : 'bemavi_mercadopago_webhook_...';
}

function renderUsuariosSistema(usuarios) {
  const tbody = document.getElementById('configUsersTableBody');
  if (!tbody) return;

  if (!usuarios.length) {
    tbody.innerHTML = '<tr><td colspan="4">Nenhum usuário cadastrado.</td></tr>';
    return;
  }

  tbody.innerHTML = usuarios.map(usuario => `
    <tr>
      <td>${escapeHtml(usuario.nome)}</td>
      <td>${escapeHtml(usuario.email)}</td>
      <td>${escapeHtml(usuario.perfil)}</td>
      <td>${usuario.ativo ? 'Ativo' : 'Inativo'}</td>
    </tr>
  `).join('');
}

window.salvarConfiguracoesSistema = async function() {
  const groqInput = document.getElementById('config_groq_api_key');
  const mpAccessInput = document.getElementById('config_mp_access_token');
  const mpPublicInput = document.getElementById('config_mp_public_key');
  const mpWebhookInput = document.getElementById('config_mp_webhook_secret');

  const configuracoes = {
    GROQ_API_KEY: groqInput?.value.trim() || '',
    MERCADOPAGO_ACCESS_TOKEN: mpAccessInput?.value.trim() || '',
    MERCADOPAGO_PUBLIC_KEY: mpPublicInput?.value.trim() || '',
    MERCADOPAGO_WEBHOOK_SECRET: mpWebhookInput?.value.trim() || ''
  };

  if (!Object.values(configuracoes).some(Boolean)) {
    showToast('Preencha pelo menos uma configuração para salvar.', 'warning');
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/configuracoes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ configuracoes })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Erro ao salvar configurações.');

    if (groqInput) groqInput.value = '';
    if (mpAccessInput) mpAccessInput.value = '';
    if (mpPublicInput) mpPublicInput.value = '';
    if (mpWebhookInput) mpWebhookInput.value = '';

    showToast('Configurações salvas no banco de dados.', 'success');
    await carregarConfiguracoesSistema();
  } catch (error) {
    console.error('Erro ao salvar configurações:', error);
    showToast(error.message || 'Erro ao salvar configurações.', 'error');
  }
};

window.salvarUsuarioConfiguracao = async function() {
  const nomeInput = document.getElementById('config_user_nome');
  const emailInput = document.getElementById('config_user_email');
  const perfilInput = document.getElementById('config_user_perfil');

  const usuario = {
    nome: nomeInput?.value.trim() || '',
    email: emailInput?.value.trim() || '',
    perfil: perfilInput?.value || 'Operador'
  };

  if (!usuario.nome || !usuario.email) {
    showToast('Informe nome e email do usuário.', 'warning');
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/configuracoes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Erro ao salvar usuário.');

    if (nomeInput) nomeInput.value = '';
    if (emailInput) emailInput.value = '';

    showToast('Usuário salvo.', 'success');
    await carregarConfiguracoesSistema();
  } catch (error) {
    console.error('Erro ao salvar usuário:', error);
    showToast(error.message || 'Erro ao salvar usuário.', 'error');
  }
};

window.toggleOrderCreationPaymentSelect = function() {
  const checkbox = document.getElementById('order_pago');
  const box = document.getElementById('orderCreationPaymentBox');
  if (checkbox && box) {
    box.style.display = checkbox.checked ? 'block' : 'none';
  }
};

window.toggleOrderEditPaymentSelect = function() {
  const checkbox = document.getElementById('edit_pago');
  const box = document.getElementById('orderEditPaymentBox');
  if (checkbox && box) {
    box.style.display = checkbox.checked ? 'block' : 'none';
  }
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
  
  // Carregar configurações de frete e taxas de maquininha síncronas do localStorage
  loadFreteConfig();
  loadTaxasMaquininha();
  
  // Tentar carregar taxas atualizadas do banco de dados se estiver online
  fetchFreteConfigFromBackend();
  fetchTaxasMaquininhaFromBackend();
  carregarConfiguracoesSistema();
  
  // Carregar dados iniciais de produtos centralizados
  await loadProdutos();
  renderCatalogAdmin();
  renderCatalogo();
  await refreshDashboard();
  await refreshFinanceiro();
  
  // Setup formulários
  setupOrderForm();
  setupFinanceForm();
  setupProductForm();
  setupConsignationForm();
  setupConsignationSalesForm();
  setupOrderDeliveryForm();
  setupSidebarAccordion();
  setupClienteHistoricoAutocomplete();
  atualizarStatusChaveGroq();
  atualizarDicaContextualIA('dashboard');
  
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
  if (tabId === 'consignacoes') refreshConsignacoes();
  if (tabId === 'inteligencia') atualizarStatusChaveGroq();
  if (tabId === 'configuracoes') carregarConfiguracoesSistema();
  if (['dashboard', 'catalogo', 'pedidos'].includes(tabId)) atualizarDicaContextualIA(tabId);
}

// 4b. Navegação SPA de Sub-abas da Fila de Produção
window.switchSubTab = function(subTabId) {
  state.activeSubTab = subTabId;
  
  const subTabBtnIds = {
    pendentes: 'subTabPendentes',
    rota: 'subTabRota',
    concluidos: 'subTabConcluidos'
  };

  Object.entries(subTabBtnIds).forEach(([key, id]) => {
    const btn = document.getElementById(id);
    if (btn) {
      btn.classList.toggle('active', key === subTabId);
    }
  });

  // Re-renderizar síncronamente com o novo filtro aplicado
  renderPedidos();
};

// 4c. Setup de comportamento do Accordion Group da Sidebar (Seleção Única)
function setupSidebarAccordion() {
  const details = document.querySelectorAll('.sidebar-accordion details');
  details.forEach(targetDetail => {
    targetDetail.addEventListener('toggle', () => {
      if (targetDetail.open) {
        details.forEach(detail => {
          if (detail !== targetDetail) {
            detail.open = false;
          }
        });
      }
    });
  });
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
const DB_VERSION = 2;

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
      
      // Store para Consignações Offline pendentes de sincronização
      if (!database.objectStoreNames.contains('consignacoes_offline')) {
        database.createObjectStore('consignacoes_offline', { autoIncrement: true });
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

// 7. Catálogo de Produtos (Centralização de Estado, Renderização & Offline Fallback)
async function loadProdutos() {
  try {
    if (state.isOnline) {
      // Buscar todos os produtos (ativos e inativos) do backend Neon
      const response = await fetch('/api/produtos?all=true');
      if (response.ok) {
        const prods = await response.json();
        // Atualizar cache IndexedDB
        await clearIndexedDBStore('produtos');
        for (const prod of prods) {
          await writeIndexedDB('produtos', prod);
        }
        state.produtos = prods;
      }
    } else {
      // Offline: Buscar todos do cache IndexedDB
      state.produtos = await readAllIndexedDB('produtos');
    }
  } catch (error) {
    console.error('Falha ao carregar catálogo de produtos:', error);
    // Tentar fallback do cache de qualquer forma
    state.produtos = await readAllIndexedDB('produtos');
  }
}

function renderCatalogo() {
  // Renderizar o catálogo HTML a partir de state.produtos local filtrando apenas ativos
  const catalogGrid = document.getElementById('catalogGrid');
  if (!catalogGrid) return;

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
  atualizarDicaContextualIA('catalogo');
  atualizarDicaContextualIA('pedidos');
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

  const descontoInput = document.getElementById('order_desconto');
  const desconto = Math.max(0, parseFloat(descontoInput ? descontoInput.value : 0) || 0);

  totalProdutosEl.textContent = `R$ ${subtotal.toFixed(2)}`;
  taxaEntregaEl.textContent = `R$ ${taxa.toFixed(2)}`;
  totalGeralEl.textContent = `R$ ${Math.max(0, subtotal + taxa - desconto).toFixed(2)}`;
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
  atualizarClientesHistoricos();
  atualizarDicaContextualIA('dashboard');

  if (btn) {
    setTimeout(() => {
      btn.classList.remove('spinning');
    }, 800);
  }
}

function renderPedidos() {
  const listEl = document.getElementById('ordersList');
  const countEl = document.getElementById('pedidosTotalCount');

  // Filtrar os pedidos com base no filtro síncrono da sub-aba operacional ativa
  const subTab = state.activeSubTab || 'pendentes';
  const pedidosFiltrados = state.pedidos.filter(pedido => {
    const status = (pedido.status || '').toLowerCase();
    if (subTab === 'pendentes') {
      return status === 'rascunho' || status === 'pendente';
    } else if (subTab === 'rota') {
      return status === 'agendado';
    } else if (subTab === 'concluidos') {
      return status === 'entregue' || status === 'cancelado';
    }
    return false;
  });

  // Atualizar a contagem no badge dourado dinâmico refletindo a sub-aba ativa
  countEl.textContent = pedidosFiltrados.length;

  if (pedidosFiltrados.length === 0) {
    let emptyText = 'Nenhum pedido agendado ou pendente de produção.';
    if (subTab === 'rota') emptyText = 'Nenhum pedido atualmente em rota de entrega.';
    if (subTab === 'concluidos') emptyText = 'Nenhum pedido concluído ou cancelado.';

    listEl.innerHTML = `
      <div class="carrinho-empty" style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1.25rem; padding: 3rem 1.5rem; text-align: center;">
        <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="var(--text-muted)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.6; margin-bottom: 0.5rem;">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        <span style="font-size: 1rem; font-weight: 500; color: var(--text-muted);">${emptyText}</span>
        ${subTab === 'pendentes' ? `
        <button class="btn btn-primary" onclick="switchTab('pedidos')" style="font-size: 0.95rem; padding: 0.65rem 1.5rem; display: flex; align-items: center; gap: 0.5rem; justify-content: center; border-radius: 8px; box-shadow: 0 4px 15px var(--primary-glow); border: none; font-weight: 600; cursor: pointer;">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          Criar Pedido
        </button>
        ` : ''}
      </div>
    `;
    return;
  }

  listEl.innerHTML = pedidosFiltrados.map(pedido => {
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
      if (pedido.pago === true) {
        acoesHtml += `
          <button class="btn btn-success" onclick="alterarStatusPedido('${pedido.id}', 'Entregue')">Marcar como Entregue</button>
        `;
      } else {
        acoesHtml += `
          <button class="btn btn-success" onclick="abrirModalEntregaPedido('${pedido.id}')">Marcar como Entregue</button>
        `;
      }
    }

    if (pedido.status !== 'Entregue' && pedido.status !== 'Cancelado') {
      acoesHtml += `
        <button class="btn btn-danger" onclick="alterarStatusPedido('${pedido.id}', 'Cancelado')">Cancelar</button>
      `;
    }

    if (pedido.status === 'Cancelado') {
      acoesHtml += `
        <button class="btn btn-danger" onclick="excluirPedidoCancelado('${pedido.id}')" style="background: rgba(220, 38, 38, 0.08); border-color: rgba(220, 38, 38, 0.2); color: var(--danger);">🗑️ Excluir Definitivamente</button>
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
          <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
            <span class="order-status-badge badge-${pedido.status.toLowerCase()}">${pedido.status}</span>
            <span class="order-status-badge" style="background: ${pedido.pago ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)'}; color: ${pedido.pago ? '#10B981' : '#F59E0B'}; border: 1px solid ${pedido.pago ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)'}; margin-right: 0; font-size: 0.75rem; padding: 2px 6px; border-radius: 4px; font-weight: 600;">
              ${pedido.pago ? '⚡ Pago' : '💵 Pendente'}
            </span>
          </div>
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
            <span class="order-price-detail">(Pães: R$ ${Number(pedido.valor_produtos).toFixed(2)} + Taxa: R$ ${Number(pedido.valor_entrega).toFixed(2)}${Number(pedido.desconto) > 0 ? ` - Desconto: R$ ${Number(pedido.desconto).toFixed(2)}` : ''})</span>
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

window.excluirPedidoCancelado = async function(pedidoId) {
  if (!state.isOnline) {
    showToast('Apenas online é permitido excluir pedidos do banco de dados.', 'error');
    return;
  }

  if (!confirm('Deseja excluir definitivamente este pedido cancelado? Esta ação não pode ser desfeita e removerá todos os registros financeiros e itens associados.')) {
    return;
  }

  try {
    const response = await fetch(`/api/pedidos?id=${pedidoId}`, {
      method: 'DELETE'
    });

    if (response.ok) {
      showToast('Pedido cancelado excluído com sucesso!', 'success');
      await refreshDashboard();
      await refreshFinanceiro();
    } else {
      const err = await response.json();
      showToast(err.error || 'Erro ao excluir pedido.', 'error');
    }
  } catch (error) {
    console.error('Falha ao excluir pedido:', error);
    showToast('Falha de rede ao excluir pedido.', 'error');
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

    const submitBtn = document.getElementById('btnSubmitOrder');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = '⏳ Gravando...';
    }

    const payload = {
      id: generateUUID(),
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
      observacao: document.getElementById('observacao').value || null,
      pago: document.getElementById('order_pago').checked,
      meio_pagamento: document.getElementById('order_pago').checked ? document.getElementById('order_meio_pagamento').value : null,
      desconto: parseFloat(document.getElementById('order_desconto').value) || 0
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
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = '✨ Confirmar & Agendar Pedido';
      }
    }
  });
}

function limparFormularioPedido() {
  document.getElementById('orderCreationForm').reset();
  state.carrinho = [];
  state.novoClienteCoords = null;
  renderCarrinho();
  const paymentBox = document.getElementById('orderCreationPaymentBox');
  if (paymentBox) paymentBox.style.display = 'none';
  const descontoInput = document.getElementById('order_desconto');
  if (descontoInput) descontoInput.value = '';
  const nomeInput = document.getElementById('cli_nome');
  if (nomeInput) delete nomeInput.dataset.lastClienteHistorico;
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

  const resumo = state.financeiro?.resumo || { total_receitas: 0, total_despesas: 0, lucro_liquido: 0 };
  const { total_receitas, total_despesas, lucro_liquido } = resumo;

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

  const transacoes = state.financeiro?.transacoes || [];
  if (transacoes.length === 0) {
    listBody.innerHTML = '<div class="carrinho-empty" style="text-align:center;">Nenhum lançamento financeiro registrado.</div>';
    return;
  }

  listBody.innerHTML = transacoes.map(t => {
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

    const submitBtn = form.querySelector('button[type="submit"]');
    let originalText = '';
    if (submitBtn) {
      submitBtn.disabled = true;
      originalText = submitBtn.textContent;
      submitBtn.textContent = '⏳ Gravando...';
    }

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
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
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

    // D. Sincronizar Consignações acumuladas offline
    const consignacoesOffline = await readAllIndexedDB('consignacoes_offline');
    if (consignacoesOffline.length > 0) {
      console.log(`[Offline Sync] Sincronizando ${consignacoesOffline.length} consignações pendentes...`);
      for (const cons of consignacoesOffline) {
        const res = await fetch('/api/consignacoes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cons)
        });
        if (res.ok) {
          console.log('[Offline Sync] Consignação sincronizada.');
        }
      }
      await clearIndexedDBStore('consignacoes_offline');
      showToast('Consignações offline sincronizadas!', 'success');
      await refreshConsignacoes();
    }

    // E. Sincronizar configurações de taxas de maquininha
    await syncTaxasMaquininhaToBackend();
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
  await loadProdutos();
  renderCatalogAdmin();
}

function renderCatalogAdmin() {
  const listBody = document.getElementById('catalogAdminListBody');
  if (!listBody) return;

  if (state.produtos.length === 0) {
    listBody.innerHTML = '<tr><td colspan="8" class="carrinho-empty">Nenhum produto cadastrado no catálogo.</td></tr>';
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
        <td data-label="Foto">
          <div class="admin-product-thumb">
            ${prod.imagem_url ? `<img src="${prod.imagem_url}" alt="${prod.nome}">` : '<span>Sem foto</span>'}
          </div>
        </td>
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

  atualizarDicaContextualIA('catalogo');
}

window.openProductModal = function(prodId) {
  const modal = document.getElementById('productModal');
  const titleText = document.getElementById('productModalTitleText');
  const form = document.getElementById('productCreationForm');

  if (!modal) return;

  form.reset();
  document.getElementById('prod_id').value = '';
  updateProductImagePreview('');
  
  const fileInput = document.getElementById('prod_imagem_file');
  if (fileInput) fileInput.value = '';
  
  const statusText = document.getElementById('uploadStatusText');

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
      document.getElementById('prod_imagem_url').value = prod.imagem_url || '';
      document.getElementById('prod_ativo').checked = prod.ativo !== false;
      updateProductImagePreview(prod.imagem_url || '');
      
      if (statusText) {
        statusText.textContent = prod.imagem_url ? 'Foto existente carregada' : 'Nenhuma foto selecionada';
        statusText.style.color = 'var(--text-muted)';
      }
    }
  } else {
    titleText.textContent = 'Novo Pão Caseiro';
    document.getElementById('prod_ativo').checked = true;
    
    if (statusText) {
      statusText.textContent = 'Nenhuma foto selecionada';
      statusText.style.color = 'var(--text-muted)';
    }
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

function updateProductImagePreview(url) {
  const preview = document.getElementById('prodImagePreview');
  const img = document.getElementById('prodImagePreviewImg');
  if (!preview || !img) return;

  const cleanUrl = (url || '').trim();
  if (!cleanUrl) {
    preview.style.display = 'none';
    img.src = '';
    return;
  }

  img.src = cleanUrl;
  preview.style.display = 'block';
}

function compressProductImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Falha ao ler a imagem.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Falha ao carregar a imagem.'));
      img.onload = () => {
        const maxSide = 1100;
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.78));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

document.addEventListener('change', async (event) => {
  if (!event.target || event.target.id !== 'prod_imagem_file') return;

  event.stopImmediatePropagation();
  const file = event.target.files[0];
  if (!file) return;

  const statusText = document.getElementById('uploadStatusText');
  if (statusText) {
    statusText.textContent = 'Preparando foto...';
    statusText.style.color = 'var(--primary)';
  }

  if (!file.type.startsWith('image/')) {
    if (statusText) {
      statusText.textContent = 'Arquivo invalido';
      statusText.style.color = '#EF4444';
    }
    showToast('Escolha um arquivo de imagem valido.', 'error');
    return;
  }

  try {
    const dataUrl = await compressProductImage(file);
    if (dataUrl.length > 1.5 * 1024 * 1024) {
      throw new Error('Imagem comprimida ainda ficou grande demais.');
    }

    document.getElementById('prod_imagem_url').value = dataUrl;
    updateProductImagePreview(dataUrl);

    if (statusText) {
      statusText.textContent = 'Foto pronta para salvar';
      statusText.style.color = '#10B981';
    }
    showToast('Foto preparada. Clique em salvar para gravar no catalogo.', 'success');
  } catch (error) {
    console.error('Erro ao preparar imagem:', error);
    if (statusText) {
      statusText.textContent = 'Falha ao preparar foto';
      statusText.style.color = '#EF4444';
    }
    showToast('Nao foi possivel preparar essa imagem. Tente uma foto menor.', 'error');
  }
}, true);

document.addEventListener('input', (event) => {
  if (event.target && event.target.id === 'prod_imagem_url') {
    updateProductImagePreview(event.target.value);
  }
});

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
    imagem_url: prod.imagem_url || null,
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

  // Lógica do botão de upload de arquivo para o Cloudinary (via API do backend)
  const fileInput = document.getElementById('prod_imagem_file');
  if (fileInput) {
    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const statusText = document.getElementById('uploadStatusText');
      if (statusText) {
        statusText.textContent = '⏳ Carregando foto no Cloudinary...';
        statusText.style.color = 'var(--primary)';
      }

      // Validar tamanho da imagem (limite máximo de 4.5MB para Vercel Serverless JSON payload)
      if (file.size > 4.5 * 1024 * 1024) {
        if (statusText) {
          statusText.textContent = '⚠️ Foto muito grande (máx 4.5MB)';
          statusText.style.color = '#EF4444';
        }
        showToast('A imagem selecionada é muito pesada! Escolha uma imagem de até 4.5MB.', 'error');
        return;
      }

      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = reader.result;
        try {
          const response = await fetch('/api/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ file: base64 })
          });

          if (response.ok) {
            const data = await response.json();
            document.getElementById('prod_imagem_url').value = data.url;
            updateProductImagePreview(data.url);
            
            if (statusText) {
              statusText.textContent = '✅ Upload concluído!';
              statusText.style.color = '#10B981'; // Verde de sucesso
            }
            showToast('Foto do pão carregada com sucesso!', 'success');
          } else {
            const err = await response.json();
            if (statusText) {
              statusText.textContent = '❌ Falha no upload';
              statusText.style.color = '#EF4444';
            }
            showToast(err.error || 'Erro ao fazer upload da imagem.', 'error');
          }
        } catch (error) {
          console.error('Erro de rede ao enviar imagem para a API:', error);
          if (statusText) {
            statusText.textContent = '❌ Falha de conexão';
            statusText.style.color = '#EF4444';
          }
          showToast('Erro de conexão ao carregar a imagem.', 'error');
        }
      };

      reader.onerror = () => {
        if (statusText) {
          statusText.textContent = '❌ Erro ao ler arquivo';
          statusText.style.color = '#EF4444';
        }
        showToast('Não foi possível ler a imagem selecionada.', 'error');
      };

      reader.readAsDataURL(file);
    });
  }

  // Função global para limpar a imagem do formulário
  window.removerImagemProduto = function() {
    document.getElementById('prod_imagem_url').value = '';
    const fileInput = document.getElementById('prod_imagem_file');
    if (fileInput) fileInput.value = '';
    updateProductImagePreview('');
    
    const statusText = document.getElementById('uploadStatusText');
    if (statusText) {
      statusText.textContent = 'Nenhuma foto selecionada';
      statusText.style.color = 'var(--text-muted)';
    }
    showToast('Foto removida.', 'info');
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const submitBtn = form.querySelector('button[type="submit"]');
    let originalText = '';
    if (submitBtn) {
      submitBtn.disabled = true;
      originalText = submitBtn.textContent;
      submitBtn.textContent = '⏳ Salvando...';
    }

    const id = document.getElementById('prod_id').value;
    const payload = {
      nome: document.getElementById('prod_nome').value,
      versao: document.getElementById('prod_versao').value,
      modelo: document.getElementById('prod_modelo').value,
      sabor: document.getElementById('prod_sabor').value,
      preco_base: parseFloat(document.getElementById('prod_preco').value),
      imagem_url: document.getElementById('prod_imagem_url').value.trim() || null,
      ativo: document.getElementById('prod_ativo').checked
    };

    if (id) {
      payload.id = id;
    }

    if (!state.isOnline) {
      showToast('Apenas online é permitido cadastrar ou editar produtos no catálogo Bemavi.', 'error');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
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
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
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
  document.getElementById('edit_desconto').value = pedido.desconto && Number(pedido.desconto) > 0 ? Number(pedido.desconto).toFixed(2) : '';

  const editPagoCheckbox = document.getElementById('edit_pago');
  const editMeioSelect = document.getElementById('edit_meio_pagamento');
  const editPagoBox = document.getElementById('orderEditPaymentBox');
  
  if (editPagoCheckbox) {
    editPagoCheckbox.checked = pedido.pago === true;
    if (editPagoBox) {
      editPagoBox.style.display = pedido.pago ? 'block' : 'none';
    }
  }
  if (editMeioSelect) {
    editMeioSelect.value = pedido.meio_pagamento || 'PIX';
  }

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

  const descontoInput = document.getElementById('edit_desconto');
  const desconto = Math.max(0, parseFloat(descontoInput ? descontoInput.value : 0) || 0);

  totalProdutosEl.textContent = `R$ ${subtotal.toFixed(2)}`;
  taxaEntregaEl.textContent = `R$ ${taxa.toFixed(2)}`;
  totalGeralEl.textContent = `R$ ${Math.max(0, subtotal + taxa - desconto).toFixed(2)}`;
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

    const submitBtn = form.querySelector('button[type="submit"]');
    let originalText = '';
    if (submitBtn) {
      submitBtn.disabled = true;
      originalText = submitBtn.textContent;
      submitBtn.textContent = '⏳ Salvando...';
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
      observacao: document.getElementById('edit_observacao').value || null,
      pago: document.getElementById('edit_pago').checked,
      meio_pagamento: document.getElementById('edit_pago').checked ? document.getElementById('edit_meio_pagamento').value : null,
      desconto: parseFloat(document.getElementById('edit_desconto').value) || 0
    };

    if (!state.isOnline) {
      showToast('Para edições completas e recálculo financeiro, é necessário conexão online com o Neon.', 'error');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
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
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
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

// ============================================================================
// 20. MÓDULO DE GESTÃO DE CONSIGNAÇÕES DE PÃES (BEMAVI)
// ============================================================================

async function refreshConsignacoes() {
  const btn = document.getElementById('btnRefreshConsignacoes');
  if (btn) btn.classList.add('spinning');

  try {
    if (state.isOnline) {
      const response = await fetch('/api/consignacoes');
      if (response.ok) {
        state.consignacoes = await response.json();
      }
    } else {
      const offlineItems = await readAllIndexedDB('consignacoes_offline');
      state.consignacoes = offlineItems.map((c, idx) => ({
        id: `offline-${idx}`,
        amigo_nome: c.amigo_nome,
        amigo_telefone: c.amigo_telefone,
        data_envio: c.data_envio,
        status: 'Aberto',
        observacao: c.observacao,
        itens: c.itens.map(it => ({
          ...it,
          produto_nome: state.produtos.find(p => p.id === it.produto_id)?.nome || 'Pão Bemavi'
        }))
      }));
    }
  } catch (error) {
    console.error('Erro ao atualizar consignações:', error);
  }

  renderConsignacoes();

  if (btn) {
    setTimeout(() => {
      btn.classList.remove('spinning');
    }, 800);
  }
}

function renderConsignacoes() {
  const listEl = document.getElementById('consignacoesListBody');
  const totalDeixadoEl = document.getElementById('consignadoTotalDeixado');
  const totalArrecadadoEl = document.getElementById('consignadoTotalArrecadado');
  const lotesAtivosEl = document.getElementById('consignadoLotesAtivos');

  if (!listEl) return;

  let totalDeixado = 0;
  let totalArrecadado = 0;
  let lotesAtivos = 0;

  state.consignacoes.forEach(c => {
    const valorLote = c.itens.reduce((acc, it) => acc + (it.quantidade_deixada * it.preco_unitario), 0);
    const valorVendido = c.itens.reduce((acc, it) => acc + (it.quantidade_vendida * it.preco_unitario), 0);

    if (c.status === 'Aberto') {
      totalDeixado += valorLote;
      lotesAtivos++;
    } else if (c.status === 'Fechado') {
      totalArrecadado += valorVendido;
    }
  });

  if (totalDeixadoEl) totalDeixadoEl.textContent = `R$ ${totalDeixado.toFixed(2)}`;
  if (totalArrecadadoEl) totalArrecadadoEl.textContent = `R$ ${totalArrecadado.toFixed(2)}`;
  if (lotesAtivosEl) lotesAtivosEl.textContent = lotesAtivos;

  if (state.consignacoes.length === 0) {
    listEl.innerHTML = `
      <div class="carrinho-empty" style="padding: 2rem 1rem; text-align: center;">
        Nenhum lote de consignação cadastrado.
      </div>
    `;
    return;
  }

  listEl.innerHTML = state.consignacoes.map(c => {
    const dataEnvioFormatada = c.data_envio ? c.data_envio.split('-').reverse().join('/') : '';
    const qtdItens = c.itens.reduce((acc, it) => acc + it.quantidade_deixada, 0);
    const valorLote = c.itens.reduce((acc, it) => acc + (it.quantidade_deixada * it.preco_unitario), 0);
    const valorVendido = c.itens.reduce((acc, it) => acc + (it.quantidade_vendida * it.preco_unitario), 0);

    const isAberto = c.status === 'Aberto';
    const badgeClass = isAberto ? 'badge-rascunho' : 'badge-entregue';
    const statusText = isAberto ? 'Aberto' : 'Acertado';

    let acoesHtml = '';
    if (isAberto) {
      acoesHtml = `<button class="btn btn-primary btn-table-action" onclick="openConsignationSalesModal('${c.id}')" style="padding: 4px 8px; font-size: 0.8rem;">Acerto</button>`;
    } else {
      acoesHtml = `<span style="font-size: 0.85rem; color: #10B981; font-weight: 600;">Liquidado (R$ ${valorVendido.toFixed(2)})</span>`;
    }

    return `
      <div class="transacao-row" style="grid-template-columns: 2fr 1fr 1fr 1fr 1fr 1.5fr; align-items: center; padding: 12px 16px;">
        <div style="font-weight: 600; color: var(--text-main);">${c.amigo_nome} ${c.amigo_telefone ? `<br><span style="font-size:0.8rem; font-weight:normal; color:var(--text-muted);">📞 ${c.amigo_telefone}</span>` : ''}</div>
        <div><span class="order-status-badge ${badgeClass}" style="margin: 0;">${statusText}</span></div>
        <div style="color: var(--text-main);">${qtdItens} pães</div>
        <div style="font-weight: 600; color: var(--primary);">R$ ${valorLote.toFixed(2)}</div>
        <div style="color: var(--text-muted); font-size: 0.85rem;">${dataEnvioFormatada}</div>
        <div style="text-align: right;">${acoesHtml}</div>
      </div>
    `;
  }).join('');
}

window.openConsignationModal = function() {
  const modal = document.getElementById('consignationModal');
  if (!modal) return;

  const form = document.getElementById('consignationCreationForm');
  if (form) form.reset();

  document.getElementById('cons_data_envio').value = new Date().toISOString().split('T')[0];
  document.getElementById('consignationTotalPrevisto').textContent = 'R$ 0,00';

  const listContainer = document.getElementById('consignationProductsList');
  const ativos = state.produtos.filter(p => p.ativo !== false);

  if (ativos.length === 0) {
    listContainer.innerHTML = '<div class="carrinho-empty">Nenhum pão ativo no catálogo.</div>';
    return;
  }

  listContainer.innerHTML = ativos.map(prod => `
    <div style="display: grid; grid-template-columns: 2fr 1fr 1.2fr; gap: 8px; align-items: center; background: rgba(255,255,255,0.02); padding: 8px; border-radius: 6px; border: 1px solid var(--border-subtle);">
      <div style="font-size: 0.9rem; font-weight: 600; color: var(--text-main);">
        ${prod.nome} <br>
        <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: normal;">${prod.modelo}</span>
      </div>
      <div>
        <input type="number" class="cons-qtd-input" data-prod-id="${prod.id}" min="0" value="0" style="width: 100%; padding: 4px; border: 1px solid var(--border-subtle); background: rgba(0,0,0,0.2); color: var(--text-main); border-radius: 4px; text-align: center;" oninput="updateConsignationTotal()">
      </div>
      <div>
        <input type="number" class="cons-preco-input" data-prod-id="${prod.id}" step="0.01" min="0" value="${Number(prod.preco_base).toFixed(2)}" style="width: 100%; padding: 4px; border: 1px solid var(--border-subtle); background: rgba(0,0,0,0.2); color: var(--text-main); border-radius: 4px; text-align: center;" oninput="updateConsignationTotal()">
      </div>
    </div>
  `).join('');

  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
};

window.closeConsignationModal = function() {
  const modal = document.getElementById('consignationModal');
  if (modal) {
    modal.classList.remove('active');
    document.body.style.overflow = '';
  }
};

window.updateConsignationTotal = function() {
  const qInputs = document.querySelectorAll('.cons-qtd-input');
  const pInputs = document.querySelectorAll('.cons-preco-input');
  let total = 0;

  qInputs.forEach(qi => {
    const prodId = qi.dataset.prodId;
    const qtd = parseInt(qi.value) || 0;
    const pi = Array.from(pInputs).find(input => input.dataset.prodId === prodId);
    const preco = parseFloat(pi ? pi.value : 0) || 0;
    total += qtd * preco;
  });

  const totalEl = document.getElementById('consignationTotalPrevisto');
  if (totalEl) totalEl.textContent = `R$ ${total.toFixed(2)}`;
};

function setupConsignationForm() {
  const form = document.getElementById('consignationCreationForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const submitBtn = form.querySelector('button[type="submit"]');
    let originalText = '';
    if (submitBtn) {
      submitBtn.disabled = true;
      originalText = submitBtn.textContent;
      submitBtn.textContent = '⏳ Gravando...';
    }

    const amigo_nome = document.getElementById('cons_amigo').value;
    const amigo_telefone = document.getElementById('cons_telefone').value;
    const data_envio = document.getElementById('cons_data_envio').value;
    const observacao = document.getElementById('cons_observacao').value;

    const qInputs = document.querySelectorAll('.cons-qtd-input');
    const pInputs = document.querySelectorAll('.cons-preco-input');
    const itens = [];

    qInputs.forEach(qi => {
      const prodId = qi.dataset.prodId;
      const qtd = parseInt(qi.value) || 0;
      if (qtd > 0) {
        const pi = Array.from(pInputs).find(input => input.dataset.prodId === prodId);
        const preco = parseFloat(pi ? pi.value : 0) || 0;
        itens.push({
          produto_id: prodId,
          quantidade_deixada: qtd,
          preco_unitario: preco
        });
      }
    });

    if (itens.length === 0) {
      showToast('Por favor, informe a quantidade de pelo menos um pão.', 'error');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
      return;
    }

    const payload = {
      amigo_nome,
      amigo_telefone: amigo_telefone || null,
      data_envio,
      observacao: observacao || null,
      itens
    };

    try {
      if (state.isOnline) {
        const response = await fetch('/api/consignacoes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (response.ok) {
          showToast('Lote de consignação registrado com sucesso na nuvem!', 'success');
          closeConsignationModal();
          await refreshConsignacoes();
        } else {
          const err = await response.json();
          showToast(err.error || 'Erro ao criar consignação.', 'error');
        }
      } else {
        await writeIndexedDB('consignacoes_offline', payload);
        showToast('Offline! Consignação guardada localmente de forma segura no PWA.', 'info');
        closeConsignationModal();
        await refreshConsignacoes();
      }
    } catch (error) {
      console.error('Falha de rede ao registrar consignação:', error);
      await writeIndexedDB('consignacoes_offline', payload);
      showToast('Falha de rede! Guardado no IndexedDB local.', 'info');
      closeConsignationModal();
      await refreshConsignacoes();
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
    }
  });
}

window.openConsignationSalesModal = function(consignationId) {
  const modal = document.getElementById('consignationSalesModal');
  if (!modal) return;

  const consignacao = state.consignacoes.find(c => c.id === consignationId);
  if (!consignacao) {
    showToast('Consignação não encontrada.', 'error');
    return;
  }

  document.getElementById('acerto_consignacao_id').value = consignacao.id;
  document.getElementById('acerto_amigo_nome').textContent = consignacao.amigo_nome;
  
  const dataFormatada = consignacao.data_envio ? consignacao.data_envio.split('-').reverse().join('/') : '';
  const fone = consignacao.amigo_telefone || 'Não informado';
  document.getElementById('acerto_amigo_detalhes').textContent = `Envio: ${dataFormatada} | Fone: ${fone}`;

  const listContainer = document.getElementById('acertoItemsList');
  if (!listContainer) return;

  listContainer.innerHTML = consignacao.itens.map(item => `
    <div style="display: grid; grid-template-columns: 2.2fr 1fr 1.2fr; gap: 8px; align-items: center; background: rgba(255,255,255,0.02); padding: 8px; border-radius: 6px; border: 1px solid var(--border-subtle);">
      <div style="font-size: 0.9rem; font-weight: 600; color: var(--text-main);">
        ${item.produto_nome || 'Pão'} <br>
        <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: normal;">Deixado: ${item.quantidade_deixada} | Preço: R$ ${Number(item.preco_unitario).toFixed(2)}</span>
      </div>
      <div>
        <input type="number" class="acerto-qtd-input" data-item-id="${item.id}" data-max="${item.quantidade_deixada}" data-preco="${item.preco_unitario}" min="0" max="${item.quantidade_deixada}" value="0" style="width: 100%; padding: 6px; border: 1px solid var(--border-subtle); background: rgba(0,0,0,0.2); color: var(--text-main); border-radius: 4px; text-align: center;" oninput="updateAcertoTotal()">
      </div>
      <div style="text-align: right; font-weight: 600; font-size: 0.85rem; color: var(--text-muted);" class="acerto-subtotal-val" data-item-id="${item.id}">
        R$ 0,00
      </div>
    </div>
  `).join('');

  const totalDeixado = consignacao.itens.reduce((acc, it) => acc + (it.quantidade_deixada * it.preco_unitario), 0);
  document.getElementById('acertoTotalDeixado').textContent = `R$ ${totalDeixado.toFixed(2)}`;
  document.getElementById('acertoTotalVendido').textContent = 'R$ 0,00';

  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
};

window.closeConsignationSalesModal = function() {
  const modal = document.getElementById('consignationSalesModal');
  if (modal) {
    modal.classList.remove('active');
    document.body.style.overflow = '';
  }
};

window.updateAcertoTotal = function() {
  const qInputs = document.querySelectorAll('.acerto-qtd-input');
  let total = 0;

  qInputs.forEach(qi => {
    const itemId = qi.dataset.itemId;
    const maxVal = parseInt(qi.dataset.max) || 0;
    let qtd = parseInt(qi.value) || 0;

    if (qtd > maxVal) {
      qtd = maxVal;
      qi.value = maxVal;
    } else if (qtd < 0) {
      qtd = 0;
      qi.value = 0;
    }

    const preco = parseFloat(qi.dataset.preco) || 0;
    const subtotal = qtd * preco;
    total += subtotal;

    const subEl = document.querySelector(`.acerto-subtotal-val[data-item-id="${itemId}"]`);
    if (subEl) {
      subEl.textContent = `R$ ${subtotal.toFixed(2)}`;
      if (qtd > 0) {
        subEl.style.color = '#10B981';
      } else {
        subEl.style.color = 'var(--text-muted)';
      }
    }
  });

  const totalEl = document.getElementById('acertoTotalVendido');
  if (totalEl) totalEl.textContent = `R$ ${total.toFixed(2)}`;
};

function setupConsignationSalesForm() {
  const form = document.getElementById('consignationSalesForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const submitBtn = form.querySelector('button[type="submit"]');
    let originalText = '';
    if (submitBtn) {
      submitBtn.disabled = true;
      originalText = submitBtn.textContent;
      submitBtn.textContent = '⏳ Gravando...';
    }

    const id = document.getElementById('acerto_consignacao_id').value;
    const qInputs = document.querySelectorAll('.acerto-qtd-input');
    const itens = [];

    qInputs.forEach(qi => {
      const itemId = qi.dataset.itemId;
      const qtd = parseInt(qi.value) || 0;
      itens.push({
        id: itemId,
        quantidade_vendida: qtd
      });
    });

    if (id.startsWith('offline-')) {
      showToast('Por favor, sincronize o lote com a nuvem antes de fazer o acerto.', 'error');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
      return;
    }

    if (!state.isOnline) {
      showToast('O acerto de vendas exige conexão online para garantir a integridade do caixa no banco Neon.', 'error');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
      return;
    }

    const payload = {
      id,
      data_acerto: new Date().toISOString().split('T')[0],
      itens
    };

    try {
      const response = await fetch('/api/consignacoes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        showToast('Acerto de consignação concluído e caixa atualizado!', 'success');
        closeConsignationSalesModal();
        await refreshConsignacoes();
        await refreshFinanceiro();
      } else {
        const err = await response.json();
        showToast(err.error || 'Erro ao realizar acerto.', 'error');
      }
    } catch (error) {
      console.error('Falha crítica de rede no acerto da consignação:', error);
      showToast('Falha de rede ao liquidar acerto. Verifique a internet.', 'error');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
    }
  });
}

// 16. Controle de Entrega de Pedidos (Confirmação com WOW Visual de Meios de Pagamento)
window.abrirModalEntregaPedido = function(pedidoId) {
  const modal = document.getElementById('orderDeliveryModal');
  if (!modal) return;

  const pedido = state.pedidos.find(p => p.id === pedidoId);
  if (!pedido) return;

  // Preencher os dados do modal
  document.getElementById('delivery_pedido_id').value = pedidoId;
  document.getElementById('delivery_valor_total').value = pedido.valor_total;
  document.getElementById('delivery_cliente_nome').textContent = pedido.cliente.nome;

  const itensTxt = pedido.itens.map(it => `${it.quantidade}x ${it.nome} (${it.modelo})`).join(', ');
  document.getElementById('delivery_detalhes_pedido').textContent = `Itens: ${itensTxt} | Frete: R$ ${Number(pedido.valor_entrega).toFixed(2)}`;

  // Forçar reset do rádio para PIX como padrão
  const radios = document.getElementsByName('delivery_meio_pagamento');
  radios.forEach(r => {
    if (r.value === 'PIX') r.checked = true;
  });

  // Atualizar cálculo líquido estimulado
  updateDeliveryValorLiquido();

  // Ativar modal
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
};

window.closeOrderDeliveryModal = function() {
  const modal = document.getElementById('orderDeliveryModal');
  if (modal) {
    modal.classList.remove('active');
    document.body.style.overflow = '';
  }
};

window.updateDeliveryValorLiquido = function() {
  const radios = document.getElementsByName('delivery_meio_pagamento');
  let meio = 'PIX';
  radios.forEach(r => {
    if (r.checked) meio = r.value;
  });

  const valorBruto = parseFloat(document.getElementById('delivery_valor_total').value) || 0;
  
  // Buscar a taxa do estado local
  const taxa = meio === 'PIX' || meio === 'Dinheiro' 
    ? 0 
    : (meio === 'Débito' ? state.taxasMaquininha.debito : state.taxasMaquininha.credito);

  const taxaValor = valorBruto * (taxa / 100);
  const valorLiquido = Math.round((valorBruto - taxaValor + Number.EPSILON) * 100) / 100;

  // Atualizar visualização
  document.getElementById('delivery_valor_bruto_txt').textContent = `R$ ${valorBruto.toFixed(2)}`;
  document.getElementById('delivery_taxa_pct').textContent = `${taxa.toFixed(2)}%`;
  document.getElementById('delivery_taxa_valor').textContent = `- R$ ${taxaValor.toFixed(2)}`;
  document.getElementById('delivery_valor_liquido_txt').textContent = `R$ ${valorLiquido.toFixed(2)}`;
};

function setupOrderDeliveryForm() {
  const form = document.getElementById('orderDeliveryForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const submitBtn = form.querySelector('button[type="submit"]');
    let originalText = '';
    if (submitBtn) {
      submitBtn.disabled = true;
      originalText = submitBtn.textContent;
      submitBtn.textContent = '⏳ Concluindo...';
    }

    const pedidoId = document.getElementById('delivery_pedido_id').value;
    const radios = document.getElementsByName('delivery_meio_pagamento');
    let meio = 'PIX';
    radios.forEach(r => {
      if (r.checked) meio = r.value;
    });

    if (!state.isOnline) {
      showToast('O fechamento financeiro do pedido exige conexão ativa com a internet para calcular as taxas no banco Neon.', 'error');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
      return;
    }

    try {
      const response = await fetch('/api/pedidos', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: pedidoId,
          status: 'Entregue',
          meio_pagamento: meio
        })
      });

      if (response.ok) {
        showToast('Pedido concluído e receita lançada no caixa com sucesso!', 'success');
        closeOrderDeliveryModal();
        await refreshDashboard();
        await refreshFinanceiro();
      } else {
        const err = await response.json();
        showToast(err.error || 'Erro ao concluir entrega.', 'error');
      }
    } catch (error) {
      console.error('Falha crítica ao enviar conclusão de entrega:', error);
      showToast('Falha de rede ao concluir o pedido.', 'error');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
    }
  });
}

// ============================================================================
// 21. MÓDULO DE INTELIGÊNCIA IA & PREVISÃO DE ESTOQUE (INTEGRAÇÃO GROQ)
// ============================================================================

window.salvarChaveGroq = function() {
  const input = document.getElementById('groq_api_key_input');
  if (!input) return;

  const key = input.value.trim();
  if (!key) {
    showToast('Por favor, digite ou cole uma chave API válida.', 'error');
    return;
  }

  if (!key.startsWith('gsk_')) {
    showToast('Essa não parece ser uma chave válida do Groq (deve começar com gsk_).', 'warning');
  }

  try {
    localStorage.setItem('bemavi_groq_api_key', key);
    showToast('Chave de API do Groq salva com sucesso no navegador!', 'success');
    input.value = '';
    atualizarStatusChaveGroq();
  } catch (e) {
    console.error('Erro ao salvar chave Groq no localStorage:', e);
    showToast('Falha ao gravar chave no navegador.', 'error');
  }
};

window.excluirChaveGroq = function() {
  try {
    localStorage.removeItem('bemavi_groq_api_key');
    showToast('Chave de API do Groq removida do navegador.', 'info');
    const input = document.getElementById('groq_api_key_input');
    if (input) input.value = '';
    atualizarStatusChaveGroq();
    
    // Limpar visualizações
    const reportContainer = document.getElementById('groqReportContainer');
    if (reportContainer) {
      reportContainer.innerHTML = '';
      reportContainer.style.display = 'none';
    }
    const placeholder = document.getElementById('groqReportPlaceholder');
    if (placeholder) placeholder.style.display = 'flex';
  } catch (e) {
    console.error('Erro ao remover chave Groq:', e);
  }
};

window.atualizarStatusChaveGroq = function() {
  const badge = document.getElementById('groqKeyStatus');
  const input = document.getElementById('groq_api_key_input');
  const chatInput = document.getElementById('groq_chat_input');
  const chatSendBtn = document.getElementById('btnGroqChatSend');

  if (!badge) return;

  const savedKey = localStorage.getItem('bemavi_groq_api_key');

  if (savedKey) {
    badge.className = 'badge-status ativo';
    badge.textContent = '🔒 Chave Configurada';
    if (input) input.placeholder = 'Chave configurada localmente (••••••••••••••••)';
    if (chatInput) chatInput.disabled = false;
    if (chatSendBtn) chatSendBtn.disabled = false;
  } else {
    badge.className = 'badge-status inativo';
    badge.textContent = '🔓 Sem Chave (Informe abaixo)';
    if (input) input.placeholder = 'Cole sua API Key do Groq aqui (gsk_...)';
    if (chatInput) chatInput.disabled = true;
    if (chatSendBtn) chatSendBtn.disabled = true;
  }
};

// Consolida todas as métricas financeiras, despesas e pedidos de state em um JSON estruturado
function obterDadosConsolidadosNegocio() {
  const vendasProdutos = {};
  
  // Agregar vendas físicas a partir dos pedidos que não foram cancelados
  state.pedidos.forEach(p => {
    if (p.status !== 'Cancelado') {
      p.itens.forEach(it => {
        const key = `${it.nome} (${it.modelo})`;
        if (!vendasProdutos[key]) {
          vendasProdutos[key] = { quantidade_vendida: 0, faturamento_bruto: 0 };
        }
        vendasProdutos[key].quantidade_vendida += it.quantidade;
        vendasProdutos[key].faturamento_bruto += it.quantidade * Number(it.preco_unitario);
      });
    }
  });

  // Agregar despesas por categoria
  const despesasPorCategoria = {};
  let totalDespesasGeral = 0;
  
  const transacoesFin = state.financeiro?.transacoes || [];
  transacoesFin.forEach(t => {
    if (t.tipo === 'Despesa') {
      const cat = t.categoria || 'Outros';
      const val = Number(t.valor) || 0;
      if (!despesasPorCategoria[cat]) despesasPorCategoria[cat] = 0;
      despesasPorCategoria[cat] += val;
      totalDespesasGeral += val;
    }
  });

  // Sabor e detalhes dos produtos
  const catálogoAtivo = state.produtos.map(p => ({
    id: p.id,
    nome: p.nome,
    modelo: p.modelo,
    preco_base: Number(p.preco_base),
    ativo: p.ativo !== false
  }));

  // Resumo de consignações
  const resumoConsignacoes = state.consignacoes.map(c => {
    const valorLote = c.itens.reduce((acc, it) => acc + (it.quantidade_deixada * it.preco_unitario), 0);
    const valorVendido = c.itens.reduce((acc, it) => acc + (it.quantidade_vendida * it.preco_unitario), 0);
    return {
      amigo: c.amigo_nome,
      status: c.status,
      valor_lote: valorLote,
      valor_vendido: valorVendido,
      pães_deixados: c.itens.reduce((acc, it) => acc + it.quantidade_deixada, 0),
      data: c.data_envio
    };
  });

  return {
    periodo_analise: 'Geral acumulado no banco',
    catalogo_produtos: catálogoAtivo,
    desempenho_vendas_paes: vendasProdutos,
    resumo_financeiro: {
      total_receitas_vendas: Number(state.financeiro.resumo.total_receitas),
      total_despesas_compras: Number(state.financeiro.resumo.total_despesas),
      lucro_liquido_caixa: Number(state.financeiro.resumo.lucro_liquido)
    },
    despesas_detalhadas_por_categoria: despesasPorCategoria,
    consignações_amigos: resumoConsignacoes,
    taxas_maquininha_configuradas: {
      debito_pct: state.taxasMaquininha.debito,
      credito_pct: state.taxasMaquininha.credito
    },
    taxas_frete_configuradas: {
      vitoria: freteConfig.gratis ? 0 : freteConfig.vitoria,
      vila_velha: freteConfig.gratis ? 0 : freteConfig.vilaVelha,
      serra: freteConfig.gratis ? 0 : freteConfig.serra,
      frete_gratis_global: freteConfig.gratis
    }
  };
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function normalizarBusca(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function formatarMoeda(valor) {
  return `R$ ${Number(valor || 0).toFixed(2)}`;
}

function getProdutoMaisVendido() {
  const ranking = {};
  state.pedidos.forEach(pedido => {
    if ((pedido.status || '').toLowerCase() === 'cancelado') return;
    (pedido.itens || []).forEach(item => {
      const key = item.produto_id || `${item.nome}-${item.modelo}`;
      if (!ranking[key]) {
        ranking[key] = {
          nome: item.nome,
          modelo: item.modelo,
          quantidade: 0,
          receita: 0
        };
      }
      ranking[key].quantidade += Number(item.quantidade) || 0;
      ranking[key].receita += (Number(item.quantidade) || 0) * (Number(item.preco_unitario) || 0);
    });
  });

  return Object.values(ranking).sort((a, b) => b.quantidade - a.quantidade)[0] || null;
}

function getClientesRecorrentes() {
  const clientes = {};
  state.pedidos.forEach(pedido => {
    const cliente = pedido.cliente || {};
    const key = normalizarBusca(cliente.telefone || cliente.nome);
    if (!key) return;
    if (!clientes[key]) {
      clientes[key] = { nome: cliente.nome, quantidade: 0 };
    }
    clientes[key].quantidade += 1;
  });

  return Object.values(clientes)
    .filter(c => c.quantidade >= 2)
    .sort((a, b) => b.quantidade - a.quantidade);
}

function montarDicaLocalIA(tabId) {
  const pedidos = state.pedidos || [];
  const produtos = state.produtos || [];
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const produtoTop = getProdutoMaisVendido();

  if (tabId === 'dashboard') {
    const pendentes = pedidos.filter(p => ['rascunho', 'pendente'].includes((p.status || '').toLowerCase())).length;
    const emRota = pedidos.filter(p => (p.status || '').toLowerCase() === 'agendado').length;
    const atrasados = pedidos.filter(p => {
      const status = (p.status || '').toLowerCase();
      const data = p.data_agendada ? new Date(p.data_agendada) : null;
      return data && data < hoje && !['entregue', 'cancelado'].includes(status);
    }).length;

    const itens = [];
    if (atrasados > 0) itens.push(`Priorize ${atrasados} pedido(s) com data anterior a hoje antes de aceitar novas entregas.`);
    if (pendentes > 0) itens.push(`Ha ${pendentes} pedido(s) esperando producao; separe a lista por bairro antes de roteirizar.`);
    if (emRota > 0) itens.push(`${emRota} pedido(s) ja estao em rota; confirme pagamento na entrega para manter o caixa correto.`);
    if (produtoTop) itens.push(`${produtoTop.nome} (${produtoTop.modelo}) lidera o historico com ${produtoTop.quantidade} unidade(s); deixe insumos prontos.`);
    if (itens.length === 0) itens.push('Fila limpa no momento. Use este intervalo para revisar fretes, taxas e estoque da semana.');
    return itens;
  }

  if (tabId === 'catalogo') {
    const ativos = produtos.filter(p => p.ativo !== false).length;
    const inativos = produtos.length - ativos;
    const itens = [];
    if (produtoTop) itens.push(`${produtoTop.nome} (${produtoTop.modelo}) e o item com maior saida: ${produtoTop.quantidade} unidade(s) e ${formatarMoeda(produtoTop.receita)} em vendas brutas.`);
    if (inativos > 0) itens.push(`${inativos} produto(s) inativo(s). Reative apenas os que ainda tem margem e capacidade de producao.`);
    if (ativos < 3) itens.push('Catalogo ativo esta enxuto; considere manter pelo menos uma opcao de entrada, uma premium e uma recorrente.');
    if (produtos.length === 0) itens.push('Cadastre os paes principais antes de abrir pedidos para evitar vendas sem preco padronizado.');
    if (itens.length === 0) itens.push('Catalogo consistente. Revise precos quando despesas de ingredientes subirem ou a taxa de entrega mudar.');
    return itens;
  }

  const recorrentes = getClientesRecorrentes();
  const itens = [];
  if (produtoTop) itens.push(`Sugestao inicial: ofereca ${produtoTop.nome} (${produtoTop.modelo}), hoje e o produto com melhor historico.`);
  if (recorrentes.length > 0) itens.push(`${recorrentes[0].nome} ja aparece ${recorrentes[0].quantidade} vezes no historico; vale sugerir recorrencia quando esse cliente comprar novamente.`);
  if (!freteConfig.gratis) itens.push(`Fretes atuais: Vitoria ${formatarMoeda(freteConfig.vitoria)}, Vila Velha ${formatarMoeda(freteConfig.vilaVelha)}, Serra ${formatarMoeda(freteConfig.serra)}. Confira o municipio antes de fechar.`);
  if (itens.length === 0) itens.push('Monte o carrinho e preencha o cliente. Se ele ja comprou antes, os dados serao sugeridos automaticamente.');
  return itens;
}

function renderDicaContextual(tabId, itens, origem = 'local') {
  const card = document.getElementById(`aiInsight${tabId.charAt(0).toUpperCase()}${tabId.slice(1)}`);
  if (!card) return;

  card.classList.remove('is-loading');
  card.classList.toggle('is-ai-refined', origem === 'groq');
  const body = card.querySelector('.ai-context-body');
  const badge = card.querySelector('.ai-context-header small');
  if (badge) badge.textContent = origem === 'groq' ? 'Groq' : 'Local';
  if (body) {
    body.innerHTML = `<ul>${itens.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
  }
}

function setDicaContextualLoading(tabId) {
  const card = document.getElementById(`aiInsight${tabId.charAt(0).toUpperCase()}${tabId.slice(1)}`);
  if (!card) return;
  card.classList.add('is-loading');
  const body = card.querySelector('.ai-context-body');
  if (body) body.textContent = 'Atualizando analise em segundo plano...';
}

async function atualizarDicaContextualIA(tabId) {
  if (!['dashboard', 'catalogo', 'pedidos'].includes(tabId)) return;

  const locais = montarDicaLocalIA(tabId);
  renderDicaContextual(tabId, locais, 'local');

  const savedKey = localStorage.getItem('bemavi_groq_api_key');
  if (!savedKey || !state.isOnline || state.activeTab !== tabId) return;

  const dados = obterDadosConsolidadosNegocio();
  const hash = JSON.stringify({
    tabId,
    pedidos: state.pedidos.length,
    produtos: state.produtos.length,
    financeiro: state.financeiro.resumo,
    locais
  });

  const slot = state.aiInsights[tabId];
  if (!slot || slot.loading || slot.hash === hash) return;

  slot.loading = true;
  slot.hash = hash;
  setDicaContextualLoading(tabId);

  const nomes = {
    dashboard: 'Dashboard de producao e entregas',
    catalogo: 'Catalogo de produtos',
    pedidos: 'Criacao de novo pedido'
  };

  const prompt = `Voce e um consultor operacional da Bemavi Pao Artesanal. Gere exatamente 3 dicas curtas, acionaveis e contextuais para a tela "${nomes[tabId]}". Nao use titulo, nao use introducao, nao mencione que e IA. Cada dica deve caber em uma linha e comecar com "- ". Use apenas os dados abaixo.\n\n${JSON.stringify(dados, null, 2)}`;

  try {
    const payload = {
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: 'Responda em portugues do Brasil, com frases diretas para uma interface operacional.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.2,
      max_tokens: 360
    };

    let response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${savedKey}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok && response.status === 404) {
      payload.model = 'llama3-8b-8192';
      response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${savedKey}`
        },
        body: JSON.stringify(payload)
      });
    }

    if (response.ok) {
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';
      const dicas = content
        .split('\n')
        .map(line => line.replace(/^[-*]\s*/, '').trim())
        .filter(Boolean)
        .slice(0, 3);
      if (dicas.length > 0) renderDicaContextual(tabId, dicas, 'groq');
    } else {
      renderDicaContextual(tabId, locais, 'local');
    }
  } catch (error) {
    console.error('Falha ao atualizar dica contextual da IA:', error);
    renderDicaContextual(tabId, locais, 'local');
  } finally {
    slot.loading = false;
  }
}

function atualizarClientesHistoricos() {
  const porCliente = new Map();
  state.pedidos.forEach(pedido => {
    const cliente = pedido.cliente || {};
    const key = normalizarBusca(cliente.telefone || cliente.nome);
    if (!key || !cliente.nome) return;

    const atual = porCliente.get(key);
    const dataAtual = atual?.ultimaData ? new Date(atual.ultimaData) : null;
    const dataPedido = pedido.data_agendada ? new Date(pedido.data_agendada) : null;
    const deveAtualizar = !atual || (dataPedido && (!dataAtual || dataPedido >= dataAtual));

    if (deveAtualizar) {
      porCliente.set(key, {
        nome: cliente.nome,
        telefone: cliente.telefone || '',
        email: cliente.email || '',
        logradouro: cliente.logradouro || '',
        numero: cliente.numero || '',
        complemento: cliente.complemento || '',
        bairro: cliente.bairro || '',
        municipio: cliente.municipio || '',
        latitude: cliente.latitude || null,
        longitude: cliente.longitude || null,
        ultimaData: pedido.data_agendada,
        totalPedidos: (atual?.totalPedidos || 0) + 1
      });
    } else if (atual) {
      atual.totalPedidos += 1;
    }
  });

  state.clientesHistoricos = Array.from(porCliente.values())
    .sort((a, b) => normalizarBusca(a.nome).localeCompare(normalizarBusca(b.nome)));
}

function preencherClienteHistorico(cliente) {
  const nomeInput = document.getElementById('cli_nome');
  const clienteKey = normalizarBusca(cliente.telefone || cliente.nome);
  const jaPreenchido = nomeInput && nomeInput.dataset.lastClienteHistorico === clienteKey;

  const campos = {
    cli_nome: cliente.nome,
    cli_telefone: cliente.telefone,
    cli_email: cliente.email,
    cli_logradouro: cliente.logradouro,
    cli_numero: cliente.numero,
    cli_complemento: cliente.complemento,
    cli_bairro: cliente.bairro
  };

  Object.entries(campos).forEach(([id, value]) => {
    const el = document.getElementById(id);
    if (el && value) el.value = value;
  });

  const municipio = document.getElementById('municipio_entrega');
  if (municipio && cliente.municipio) municipio.value = cliente.municipio;
  state.novoClienteCoords = cliente.latitude && cliente.longitude
    ? { latitude: cliente.latitude, longitude: cliente.longitude }
    : null;

  if (nomeInput) nomeInput.dataset.lastClienteHistorico = clienteKey;
  renderCarrinho();
  if (!jaPreenchido) showToast(`Dados de ${cliente.nome} preenchidos pelo historico.`, 'success');
}

function renderClienteHistoricoSuggestions(query) {
  const box = document.getElementById('cli_nome_suggestions');
  if (!box) return;

  const termo = normalizarBusca(query);
  if (termo.length < 2) {
    box.innerHTML = '';
    box.style.display = 'none';
    return;
  }

  const matches = state.clientesHistoricos
    .filter(cliente => normalizarBusca(cliente.nome).includes(termo) || normalizarBusca(cliente.telefone).includes(termo))
    .slice(0, 6);

  if (matches.length === 0) {
    box.innerHTML = '';
    box.style.display = 'none';
    return;
  }

  box.innerHTML = matches.map((cliente, index) => `
    <div class="autocomplete-suggestion-item" data-cliente-index="${index}">
      <strong>${escapeHtml(cliente.nome)}</strong>
      <span>${escapeHtml(cliente.telefone || 'Sem telefone')} - ${escapeHtml(cliente.bairro || 'Bairro nao informado')}</span>
    </div>
  `).join('');
  box.style.display = 'block';

  box.querySelectorAll('.autocomplete-suggestion-item').forEach((el, index) => {
    el.addEventListener('click', () => {
      preencherClienteHistorico(matches[index]);
      box.innerHTML = '';
      box.style.display = 'none';
    });
  });
}

function setupClienteHistoricoAutocomplete() {
  const input = document.getElementById('cli_nome');
  const box = document.getElementById('cli_nome_suggestions');
  if (!input || !box) return;

  atualizarClientesHistoricos();

  input.addEventListener('input', () => {
    renderClienteHistoricoSuggestions(input.value);
  });

  input.addEventListener('blur', () => {
    setTimeout(() => {
      const typed = normalizarBusca(input.value);
      const exact = state.clientesHistoricos.find(cliente => normalizarBusca(cliente.nome) === typed);
      if (exact) preencherClienteHistorico(exact);
      box.style.display = 'none';
    }, 180);
  });
}

// Parser Premium de Markdown para HTML responsivo Bemavi
function parserMarkdownBemavi(md) {
  if (!md) return '';
  
  // Normalização e limpeza
  let html = md.trim().replace(/\r\n/g, '\n');
  
  // Negrito
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  
  // Itálico
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
  
  // Blockquotes
  html = html.replace(/^\>\s+(.*)$/gim, '<blockquote>$1</blockquote>');
  
  // Títulos (h3)
  html = html.replace(/^###\s+(.*)$/gim, '<h3>$1</h3>');
  html = html.replace(/^##\s+(.*)$/gim, '<h3>$1</h3>');
  html = html.replace(/^#\s+(.*)$/gim, '<h3>$1</h3>');
  
  // Linhas horizontais
  html = html.replace(/^---$/gim, '<hr style="border: 0; border-top: 1px dashed var(--border-subtle); margin: 1.5rem 0;">');
  
  const lines = html.split('\n');
  let inTable = false;
  let tableHtml = '';
  
  const processedLines = lines.map(line => {
    const trimmed = line.trim();
    
    // Tabelas markdown: | Col1 | Col2 |
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      const cols = trimmed.split('|').filter(c => c.trim() !== '').map(c => c.trim());
      
      // Ignorar linhas de separação |---|---|
      if (cols.every(c => /^:-*|-*:-*|-*:$/.test(c))) {
        return '';
      }
      
      if (!inTable) {
        inTable = true;
        tableHtml = '<div class="responsive-table-container"><table class="admin-table"><thead><tr>' + 
          cols.map(c => `<th>${c}</th>`).join('') + '</tr></thead><tbody>';
        return 'TABLE_START';
      } else {
        return '<tr>' + cols.map(c => `<td>${c}</td>`).join('') + '</tr>';
      }
    } else {
      if (inTable) {
        inTable = false;
        return 'TABLE_END\n' + '<p>' + line + '</p>';
      }
    }
    
    // Listas
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      return `<li>${trimmed.substring(2)}</li>`;
    }
    
    if (trimmed === '') return '';
    
    // Parágrafos normais se não forem tags
    if (!trimmed.startsWith('<h') && !trimmed.startsWith('<b') && !trimmed.startsWith('<l') && !trimmed.startsWith('<hr') && !trimmed.startsWith('<div') && !trimmed.startsWith('<p>')) {
      return `<p>${trimmed}</p>`;
    }
    
    return trimmed;
  });
  
  // Consolidar tabela
  let finalHtml = '';
  processedLines.forEach(line => {
    if (line === 'TABLE_START') {
      finalHtml += tableHtml;
    } else if (line.startsWith('TABLE_END')) {
      finalHtml += '</tbody></table></div>' + line.substring(9);
    } else {
      finalHtml += line + '\n';
    }
  });
  
  if (inTable) {
    finalHtml += '</tbody></table></div>';
  }
  
  // Agrupar <li> soltos em <ul>
  finalHtml = finalHtml.replace(/(<li>.*?<\/li>)+/gs, (match) => `<ul>${match}</ul>`);
  
  return finalHtml;
}

// Conectar e gerar Relatório com a API do Groq Cloud
window.gerarRelatorioGroq = async function() {
  const savedKey = localStorage.getItem('bemavi_groq_api_key');
  if (!savedKey) {
    showToast('Chave de API do Groq não configurada. Por favor, insira e salve sua chave acima.', 'error');
    return;
  }

  const btn = document.getElementById('btnGerarAnaliseIA');
  const consolePanel = document.getElementById('groqLoadingConsole');
  const consoleLogs = document.getElementById('groqConsoleLogs');
  const statusMsg = document.getElementById('groqStatusMsg');
  const reportContainer = document.getElementById('groqReportContainer');
  const placeholder = document.getElementById('groqReportPlaceholder');

  if (btn) btn.disabled = true;
  if (placeholder) placeholder.style.display = 'none';
  if (reportContainer) reportContainer.style.display = 'none';
  if (consolePanel) consolePanel.style.display = 'flex';
  if (consoleLogs) consoleLogs.innerHTML = '';

  const addLog = (text, type = 'info') => {
    const log = document.createElement('div');
    log.style.padding = '2px 0';
    log.innerHTML = `<span style="color: ${type === 'success' ? '#10B981' : type === 'warning' ? '#F59E0B' : 'var(--text-muted)'}">[${new Date().toLocaleTimeString()}]</span> ${text}`;
    consoleLogs.appendChild(log);
    consoleLogs.scrollTop = consoleLogs.scrollHeight;
  };

  addLog('Iniciando agregação analítica local do banco Neon...', 'info');
  statusMsg.textContent = 'Consolidando dados do caixa e de pedidos...';
  
  const dadosNegocio = obterDadosConsolidadosNegocio();
  
  await new Promise(r => setTimeout(r, 600)); // Simula tempo sutil de UX premium
  
  addLog(`Dados agregados! ${dadosNegocio.catalogo_produtos.length} produtos em catálogo, faturamento de receitas de R$ ${dadosNegocio.resumo_financeiro.total_receitas_vendas.toFixed(2)}.`, 'success');
  addLog('Conectando ao barramento de inteligência da nuvem Groq Cloud...', 'info');
  statusMsg.textContent = 'Enviando dados estruturados para a IA Groq...';

  const systemPrompt = `Você é o Diretor Financeiro e Especialista em Produção e Logística da Bemavi Pão Artesanal. 
Sua missão é ler o arquivo JSON com os dados consolidados do negócio (vendas de pães, fluxo financeiro, despesas, consignações e configurações de taxas) e fornecer um Relatório Executivo Analítico de altíssimo impacto profissional e visual.

Diretrizes obrigatórias de formatação e conteúdo:
1. Apresente um resumo executivo da saúde financeira: onde o dinheiro está indo (vazamentos de caixa, despesas desproporcionais) e de onde vem.
2. Identifique os produtos com a melhor saída de vendas, criando um ranking claro.
3. Forneça uma tabela simples com a Previsão de Produção Semanal recomendada para cada pão ativo da Bemavi com base no volume de vendas recente. Adicione uma margem de segurança de +10% para evitar falta de estoque, e arredonde para números inteiros de pães.
4. Inclua sugestões práticas de como melhorar a margem operacional (ex: taxas de frete vs custos de deslocamento, taxas de maquininhas Débito/Crédito).
5. Use exclusivamente o idioma Português do Brasil com tom inspirador, motivacional, pragmático e extremamente premium.
6. Formate a resposta rigorosamente em Markdown limpo (use títulos h3 '###', tabelas markdown, listas e negritos) para que o parser local consiga exibir a interface visual dourada perfeitamente.`;

  const userMessage = `Aqui estão os dados consolidados em tempo real da Bemavi:
\`\`\`json
${JSON.stringify(dadosNegocio, null, 2)}
\`\`\`
Por favor, gere o relatório completo de análise financeira e plano de estoque/produção semanal.`;

  try {
    const payload = {
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ],
      temperature: 0.2,
      max_tokens: 2048
    };

    let response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${savedKey}`
      },
      body: JSON.stringify(payload)
    });

    // Fallback de modelo se o llama 70b versátil falhar ou não estiver disponível
    if (!response.ok && response.status === 404) {
      addLog('Modelo llama-3.3-70b não encontrado. Fazendo fallback para llama3-8b...', 'warning');
      payload.model = 'llama3-8b-8192';
      response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${savedKey}`
        },
        body: JSON.stringify(payload)
      });
    }

    if (response.ok) {
      const resData = await response.json();
      const content = resData.choices[0].message.content;
      
      addLog('Relatório financeiro e previsão de estoque gerados com sucesso!', 'success');
      statusMsg.textContent = 'Formatando interface visual...';
      await new Promise(r => setTimeout(r, 400));

      const parsedHtml = parserMarkdownBemavi(content);

      if (reportContainer) {
        reportContainer.innerHTML = parsedHtml;
        reportContainer.style.display = 'block';
      }
      if (consolePanel) consolePanel.style.display = 'none';
      showToast('Relatório IA da Bemavi gerado com sucesso!', 'success');
    } else {
      const err = await response.json();
      console.error('Erro de API do Groq:', err);
      addLog(`Erro da API do Groq: ${err.error?.message || response.statusText}`, 'warning');
      statusMsg.textContent = 'Falha ao processar relatório.';
      showToast('Falha ao conectar na API do Groq Cloud.', 'error');
    }
  } catch (error) {
    console.error('Falha de rede ao consultar Groq:', error);
    addLog('Falha crítica de rede. Verifique sua chave e a conexão com a internet.', 'warning');
    statusMsg.textContent = 'Falha de rede.';
    showToast('Falha de rede ao consultar Groq.', 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
};

// Histórico de mensagens do chat interativo de IA
const chatHistory = [];

window.enviarPerguntaGroq = async function(event) {
  if (event) event.preventDefault();

  const savedKey = localStorage.getItem('bemavi_groq_api_key');
  if (!savedKey) {
    showToast('Configure sua chave Groq antes de enviar perguntas.', 'error');
    return;
  }

  const input = document.getElementById('groq_chat_input');
  const chatMessages = document.getElementById('groqChatMessages');
  
  if (!input || !chatMessages) return;

  const query = input.value.trim();
  if (!query) return;

  // Limpar input
  input.value = '';

  // Injetar mensagem do usuário na tela
  const userMsgEl = document.createElement('div');
  userMsgEl.className = 'chat-message user';
  userMsgEl.textContent = query;
  chatMessages.appendChild(userMsgEl);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  // Injetar loading dots
  const loadingEl = document.createElement('div');
  loadingEl.className = 'chat-message loading-dots';
  loadingEl.innerHTML = 'Analisando dados<span></span><span></span><span></span>';
  chatMessages.appendChild(loadingEl);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  // Adicionar ao histórico de chat na sessão
  chatHistory.push({ role: 'user', content: query });

  // Consolidar contexto de dados de negócios atualizados em tempo real do banco
  const dadosNegocio = obterDadosConsolidadosNegocio();

  const systemPrompt = `Você é o Diretor Financeiro e Especialista de Estoque Inteligente da Bemavi Pão Artesanal.
Você está conversando de forma interativa e amigável com o panificador sobre suas finanças, produção de pães e gestão de consignações.
Sempre fundamente suas respostas de forma direta, clara e precisa nos dados reais fornecidos em JSON abaixo.
Seja muito prestativo, profissional e encorajador. Forneça respostas em português do Brasil curtas e diretas com markdown simples.

Dados de Negócios da Bemavi em tempo real:
\`\`\`json
${JSON.stringify(dadosNegocio, null, 2)}
\`\`\``;

  const payload = {
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: systemPrompt },
      ...chatHistory.slice(-6) // Enviar apenas as últimas 6 interações para evitar estouro de tokens
    ],
    temperature: 0.5,
    max_tokens: 800
  };

  try {
    let response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${savedKey}`
      },
      body: JSON.stringify(payload)
    });

    // Fallback de modelo se necessário
    if (!response.ok && response.status === 404) {
      payload.model = 'llama3-8b-8192';
      response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${savedKey}`
        },
        body: JSON.stringify(payload)
      });
    }

    // Remover loading dots
    loadingEl.remove();

    if (response.ok) {
      const resData = await response.json();
      const answer = resData.choices[0].message.content;

      // Adicionar resposta ao histórico
      chatHistory.push({ role: 'assistant', content: answer });

      // Injetar resposta do assistente na tela
      const assistantMsgEl = document.createElement('div');
      assistantMsgEl.className = 'chat-message assistant';
      
      // Um parser de markdown simplificado para o chat (só blockquotes, negritos e parágrafos)
      assistantMsgEl.innerHTML = parserMarkdownBemavi(answer);
      chatMessages.appendChild(assistantMsgEl);
      chatMessages.scrollTop = chatMessages.scrollHeight;
    } else {
      const err = await response.json();
      const errMsg = err.error?.message || 'Erro desconhecido ao consultar a IA.';
      
      const errorMsgEl = document.createElement('div');
      errorMsgEl.className = 'chat-message assistant';
      errorMsgEl.style.color = '#EF4444';
      errorMsgEl.style.border = '1px solid rgba(239, 68, 68, 0.2)';
      errorMsgEl.textContent = `Desculpe, ocorreu uma falha de conexão: ${errMsg}`;
      chatMessages.appendChild(errorMsgEl);
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }
  } catch (error) {
    console.error('Falha de rede no chat IA:', error);
    loadingEl.remove();
    const errorMsgEl = document.createElement('div');
    errorMsgEl.className = 'chat-message assistant';
    errorMsgEl.style.color = '#EF4444';
    errorMsgEl.style.border = '1px solid rgba(239, 68, 68, 0.2)';
    errorMsgEl.textContent = 'Erro de rede! Verifique sua chave API e a internet.';
    chatMessages.appendChild(errorMsgEl);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
};
