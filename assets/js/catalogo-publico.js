const WHATSAPP_NUMBER = '5527992760190';
const API_BASE_URL = window.location.protocol === 'file:' ? 'https://bemavi.vercel.app' : '';
let MERCADOPAGO_PUBLIC_KEY = 'APP_USR-5c9cbe03-f1c5-4e5c-9843-ea8c6b90a1d8';
const ONLINE_PIX_OPTION = 'Pix';
const ONLINE_CARD_OPTION = 'Cartão';

let mpInstance = null;
function getMercadoPagoInstance() {
  if (!mpInstance && window.MercadoPago) {
    mpInstance = new window.MercadoPago(MERCADOPAGO_PUBLIC_KEY, { locale: 'pt-BR' });
  }
  return mpInstance;
}

let pixCountdownInterval = null;
let pixPollingInterval = null;

const state = {
  produtos: [],
  carrinho: [],
  abacateCheckout: null,
  taxasEntrega: {},
  checkoutStep: 'cart',
  searchQuery: '',
  categoriaAtiva: 'Todos',
  calendarMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
};

const money = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL'
});

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

document.addEventListener('DOMContentLoaded', () => {
  setupPublicOrderForm();
  setupDeliveryMode();
  setupPhoneMask();
  setupCustomDatepicker();
  setupMunicipioChange();
  setupPaymentChange();
  loadDeliveryFees();
  loadPublicCatalog();
  loadMercadoPagoPublicKey();

  // Set up search event listeners
  const searchInput = document.getElementById('searchInput');
  const mobileSearchInput = document.getElementById('mobileSearchInput');
  
  const handleSearchInput = (e) => {
    state.searchQuery = e.target.value;
    if (searchInput && searchInput !== e.target) searchInput.value = state.searchQuery;
    if (mobileSearchInput && mobileSearchInput !== e.target) mobileSearchInput.value = state.searchQuery;
    renderCatalog();
  };

  if (searchInput) searchInput.addEventListener('input', handleSearchInput);
  if (mobileSearchInput) mobileSearchInput.addEventListener('input', handleSearchInput);

  // Initialize visual active states
  updateDeliveryVisualCards('Entrega');
  updatePaymentVisualCards('Pagamento na entrega');
});

async function loadMercadoPagoPublicKey() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/mercado-pago-public-key`);
    if (response.ok) {
      const data = await response.json();
      if (data.publicKey) {
        MERCADOPAGO_PUBLIC_KEY = data.publicKey;
        // Reseta a instância para que seja recriada com a chave correta no fuso de produção
        mpInstance = null;
      }
    }
  } catch (error) {
    console.error('Falha ao obter Public Key dinâmica do Mercado Pago:', error);
  }
}

async function loadDeliveryFees() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/taxas`);
    if (!response.ok) throw new Error('delivery_fees_unavailable');
    const taxas = await response.json();
    state.taxasEntrega = taxas.reduce((acc, taxa) => {
      acc[taxa.municipio] = Number(taxa.valor_taxa) || 0;
      return acc;
    }, {});
    renderCart();
  } catch (error) {
    console.error('Falha ao carregar taxas de entrega:', error);
  }
}

async function loadPublicCatalog() {
  const grid = document.getElementById('publicCatalogGrid');
  const count = document.getElementById('catalogCount');

  try {
    const response = await fetch(`${API_BASE_URL}/api/produtos`);
    if (!response.ok) throw new Error('catalog_unavailable');

    state.produtos = await response.json();
    renderCatalog();
  } catch (error) {
    console.error('Falha ao carregar catalogo publico:', error);
    if (count) count.textContent = 'Indisponivel';
    if (grid) {
      grid.innerHTML = `
        <div class="loading-card">
          Nao foi possivel carregar o catalogo agora. Chame pelo WhatsApp para fazer seu pedido.
        </div>
      `;
    }
  }
}

function renderCatalog() {
  const grid = document.getElementById('publicCatalogGrid');
  const count = document.getElementById('catalogCount');
  if (!grid) return;

  // Filter products by category and search query
  let filtered = state.produtos;
  
  if (state.categoriaAtiva !== 'Todos') {
    filtered = filtered.filter(prod => {
      const name = (prod.nome || '').toLowerCase();
      const versao = (prod.versao || '').toLowerCase();
      const text = `${name} ${versao}`.toLowerCase();
      
      if (state.categoriaAtiva === 'Pães') {
        return text.includes('pão') || text.includes('baguete') || text.includes('levain') || text.includes('focaccia') || text.includes('croissant') || text.includes('broinha');
      }
      if (state.categoriaAtiva === 'Bolos') {
        return text.includes('bolo');
      }
      if (state.categoriaAtiva === 'Outros') {
        const isBread = text.includes('pão') || text.includes('baguete') || text.includes('levain') || text.includes('focaccia') || text.includes('croissant') || text.includes('broinha');
        const isCake = text.includes('bolo');
        return !isBread && !isCake;
      }
      return true;
    });
  }

  if (state.searchQuery) {
    const q = state.searchQuery.toLowerCase();
    filtered = filtered.filter(prod => {
      const nome = (prod.nome || '').toLowerCase();
      const sabor = (prod.sabor || '').toLowerCase();
      const versao = (prod.versao || '').toLowerCase();
      const modelo = (prod.modelo || '').toLowerCase();
      return nome.includes(q) || sabor.includes(q) || versao.includes(q) || modelo.includes(q);
    });
  }

  if (count) {
    count.textContent = `${filtered.length} ${filtered.length === 1 ? 'item' : 'itens'}`;
  }

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="col-span-full py-16 flex flex-col items-center justify-center text-on-surface-variant bg-surface-container-low/40 rounded-2xl border border-dashed border-outline-variant/60">
        <span class="material-symbols-outlined text-[48px] text-outline mb-2">search_off</span>
        <span class="font-medium text-base">Nenhum produto encontrado. Tente buscar outro termo!</span>
      </div>
    `;
    return;
  }

  grid.innerHTML = filtered.map(prod => {
    const quantidade = getCartQuantity(prod.id);
    return `
    <article class="group bg-surface-container-lowest border border-outline-variant rounded-2xl overflow-hidden card-hover transition-all duration-300 flex flex-col justify-between">
      <div>
        <div class="relative aspect-[4/3] overflow-hidden bg-surface-container-low">
          <img class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" src="${getProductImage(prod)}" alt="${escapeHtml(prod.nome)}" loading="lazy">
        </div>
        <div class="p-5 flex-grow flex flex-col">
          <span class="font-label-bold text-[10px] text-primary uppercase tracking-widest mb-1.5 block">${escapeHtml(prod.versao || 'Artesanal')}</span>
          <h4 class="font-headline-md text-lg text-on-surface font-bold mb-1 leading-tight">${escapeHtml(prod.nome)}</h4>
          <p class="font-body-md text-xs text-on-surface-variant line-clamp-2 leading-relaxed mb-2">${escapeHtml(prod.sabor || 'Pão artesanal Bemavi')}</p>
          <p class="font-body-md text-xs text-on-surface-variant font-semibold">${escapeHtml(prod.modelo || '')}</p>
        </div>
      </div>
      <div class="px-5 pb-5 pt-2 flex items-center justify-between mt-auto">
        <span class="font-price-display text-lg text-on-background font-extrabold">${money.format(Number(prod.preco_base) || 0)}</span>
        
        ${quantidade > 0 ? `
          <div class="flex items-center bg-surface-container rounded-xl p-1 border border-outline-variant/30 shadow-sm">
            <button type="button" class="material-symbols-outlined text-sm text-primary hover:bg-primary/10 rounded-full p-1 transition-all" onclick="changeCartQty('${prod.id}', -1)">remove</button>
            <span class="font-label-bold text-sm px-3 text-on-surface">${quantidade}</span>
            <button type="button" class="material-symbols-outlined text-sm text-primary hover:bg-primary/10 rounded-full p-1 transition-all" onclick="changeCartQty('${prod.id}', 1)">add</button>
          </div>
        ` : `
          <button type="button" class="w-10 h-10 bg-primary text-on-primary rounded-xl flex items-center justify-center hover:bg-primary-container transition-all active:scale-90 shadow-sm" onclick="changeCartQty('${prod.id}', 1)">
            <span class="material-symbols-outlined text-[20px]">add</span>
          </button>
        `}
      </div>
    </article>
    `;
  }).join('');
}

function getProductImage(prod) {
  if (prod.imagem_url) return prod.imagem_url;

  const text = `${prod.nome || ''} ${prod.versao || ''} ${prod.sabor || ''} ${prod.modelo || ''}`.toLowerCase();

  if (text.includes('integral') || text.includes('grao') || text.includes('grão') || text.includes('sement')) {
    return 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=900&q=80';
  }

  if (text.includes('doce') || text.includes('chocolate') || text.includes('canela') || text.includes('reche')) {
    return 'https://images.unsplash.com/photo-1608198093002-ad4e005484ec?auto=format&fit=crop&w=900&q=80';
  }

  if (text.includes('baguete') || text.includes('frances') || text.includes('francês')) {
    return 'https://images.unsplash.com/photo-1549931319-a545dcf3bc73?auto=format&fit=crop&w=900&q=80';
  }

  if (text.includes('forma') || text.includes('sanduiche') || text.includes('sanduíche')) {
    return 'https://images.unsplash.com/photo-1586444248902-2f64eddc13df?auto=format&fit=crop&w=900&q=80';
  }

  return 'https://images.unsplash.com/photo-1534620808146-d33bb39128b2?auto=format&fit=crop&w=900&q=80';
}

function getCartQuantity(productId) {
  return state.carrinho.find(item => item.id === productId)?.quantidade || 0;
}

window.addToCart = function(productId) {
  changeCartQty(productId, 1);
};

window.changeCartQty = function(productId, delta) {
  const produto = state.produtos.find(item => item.id === productId);
  if (!produto) return;

  const item = state.carrinho.find(cartItem => cartItem.id === productId);
  if (!item && delta > 0) {
    state.carrinho.push({
      id: produto.id,
      nome: produto.nome,
      modelo: produto.modelo,
      preco: Number(produto.preco_base) || 0,
      quantidade: 1
    });
  } else if (item) {
    item.quantidade += delta;
    if (item.quantidade <= 0) {
      state.carrinho = state.carrinho.filter(cartItem => cartItem.id !== productId);
    }
  }

  if (state.carrinho.length === 0) closeCheckoutIdentification();
  state.abacateCheckout = null;
  clearAbacateCheckout();
  renderCart();
  renderCatalog();
};

function renderCart() {
  const list = document.getElementById('publicCartItems');
  const total = document.getElementById('publicCartTotal');
  const count = document.getElementById('cartCount');
  const countBadge = document.getElementById('cartCountBadge');
  const productsTotal = document.getElementById('cartProductsTotal');
  const deliveryFeeTotal = document.getElementById('cartDeliveryFeeTotal');
  const continueButton = document.getElementById('continueCheckoutBtn');
  const submitButton = document.getElementById('submitOrderBtn');
  const form = document.getElementById('publicOrderForm');

  const totalItens = state.carrinho.reduce((acc, item) => acc + item.quantidade, 0);
  const totalValor = getOrderTotal();
  const totalProdutos = getProductsTotal();
  const taxaEntrega = getSelectedDeliveryFee();

  // Update counters and badges
  if (count) count.textContent = `${totalItens} ${totalItens === 1 ? 'item' : 'itens'}`;
  if (countBadge) countBadge.textContent = totalItens;
  if (total) total.textContent = money.format(totalValor);
  if (productsTotal) productsTotal.textContent = money.format(totalProdutos);
  
  if (deliveryFeeTotal) {
    const entrega = document.getElementById('public_entrega')?.value;
    if (entrega !== 'Entrega') {
      deliveryFeeTotal.textContent = 'Grátis';
      deliveryFeeTotal.className = 'text-primary font-bold';
    } else if (taxaEntrega === 0) {
      deliveryFeeTotal.textContent = 'Grátis';
      deliveryFeeTotal.className = 'text-primary font-bold';
    } else {
      deliveryFeeTotal.textContent = money.format(taxaEntrega);
      deliveryFeeTotal.className = 'text-on-surface-variant font-medium';
    }
  }

  // Manage checkout step views & buttons
  if (continueButton) {
    continueButton.disabled = state.carrinho.length === 0;
    if (state.checkoutStep === 'identification') {
      continueButton.style.display = 'none';
    } else {
      continueButton.style.display = 'flex';
    }
  }

  if (submitButton) {
    if (state.checkoutStep === 'identification') {
      submitButton.style.display = 'flex';
    } else {
      submitButton.style.display = 'none';
    }
  }

  if (!list) return;

  if (state.carrinho.length === 0) {
    list.innerHTML = '<div class="empty-cart text-center py-8 text-on-surface-variant text-sm font-medium">Seu carrinho está vazio. Adicione pães artesanais para começar!</div>';
    return;
  }

  list.innerHTML = state.carrinho.map(item => {
    const prod = state.produtos.find(p => p.id === item.id);
    const imageUrl = prod ? getProductImage(prod) : 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=150&q=80';
    return `
    <div class="flex gap-4 items-center bg-surface-container-low/40 p-3 rounded-xl border border-outline-variant/30">
      <div class="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 bg-surface-container">
        <img class="w-full h-full object-cover" src="${imageUrl}" alt="${escapeHtml(item.nome)}">
      </div>
      <div class="flex-grow flex flex-col justify-between">
        <div>
          <p class="font-label-bold text-sm font-bold text-on-surface leading-tight">${escapeHtml(item.nome)}</p>
          <p class="text-[10px] text-on-surface-variant mt-0.5">${escapeHtml(item.modelo || '')}</p>
        </div>
        <div class="flex justify-between items-center mt-2">
          <div class="flex items-center bg-surface-container rounded-lg p-0.5 border border-outline-variant/20 shadow-inner">
            <button type="button" class="material-symbols-outlined text-[16px] text-primary hover:bg-primary/10 rounded-full p-1 active:scale-90 transition-all" onclick="changeCartQty('${item.id}', -1)">remove</button>
            <span class="font-label-bold text-xs px-2.5">${item.quantidade}</span>
            <button type="button" class="material-symbols-outlined text-[16px] text-primary hover:bg-primary/10 rounded-full p-1 active:scale-90 transition-all" onclick="changeCartQty('${item.id}', 1)">add</button>
          </div>
          <span class="font-price-display text-sm font-extrabold text-primary">${money.format(item.preco * item.quantidade)}</span>
        </div>
      </div>
    </div>
    `;
  }).join('');
}

window.openCheckoutIdentification = function() {
  window.navigateTo('identification');
};

function closeCheckoutIdentification() {
  window.navigateTo('cart');
}

function getProductsTotal() {
  return state.carrinho.reduce((acc, item) => acc + (item.preco * item.quantidade), 0);
}

function getSelectedDeliveryFee() {
  const entrega = document.getElementById('public_entrega')?.value;
  const municipio = document.getElementById('public_municipio')?.value;
  if (entrega !== 'Entrega') return 0;
  return Number(state.taxasEntrega[municipio]) || 0;
}

function getOrderTotal() {
  return getProductsTotal() + getSelectedDeliveryFee();
}

function setupPublicOrderForm() {
  const form = document.getElementById('publicOrderForm');
  if (!form) return;

  form.addEventListener('submit', async event => {
    event.preventDefault();

    if (state.carrinho.length === 0) {
      showToast('Adicione pelo menos um item ao pedido.');
      return;
    }

    const entrega = document.getElementById('public_entrega').value;
    const endereco = document.getElementById('public_endereco').value.trim();
    const municipio = document.getElementById('public_municipio').value;

    if (entrega === 'Entrega' && !endereco) {
      showToast('Informe o endereco para entrega.');
      return;
    }

    if (!municipio) {
      showToast('Informe o municipio.');
      return;
    }

    const pagamento = document.getElementById('public_pagamento').value;
    const button = form.querySelector('.submit-order');

    if (button) {
      button.disabled = true;
      button.textContent = isOnlinePayment(pagamento) ? 'Gerando pagamento...' : 'Finalizando...';
    }

    let onlinePay = false;
    try {
      if (isOnlinePayment(pagamento)) {
        onlinePay = true;
        state.abacateCheckout = await createMercadoPagoCheckout(getMercadoPagoPaymentMethod(pagamento));
        renderMercadoPagoCheckout(state.abacateCheckout);
        showToast(pagamento === ONLINE_CARD_OPTION ? 'Link de cartão gerado.' : 'PIX gerado no checkout.');
        return;
      } else {
        state.abacateCheckout = null;
        clearAbacateCheckout();
      }

      const message = buildWhatsappMessage(state.abacateCheckout);
      const whatsappUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
      window.location.href = whatsappUrl;
    } catch (error) {
      onlinePay = false;
      console.error('Falha ao preparar pedido publico:', error);
      showToast(error.message || 'Nao foi possivel preparar o pedido agora.');
    } finally {
      if (button && !onlinePay) {
        button.disabled = false;
        button.textContent = 'Finalizar pedido';
      }
    }
  });
}

function isOnlinePayment(pagamento) {
  return pagamento === ONLINE_PIX_OPTION || pagamento === ONLINE_CARD_OPTION;
}

function getMercadoPagoPaymentMethod(pagamento) {
  return pagamento === ONLINE_CARD_OPTION ? 'CARD' : 'PIX';
}

async function createMercadoPagoCheckout(metodoPagamento) {
  const payload = {
    id: generateUUID(),
    cliente: {
      nome: document.getElementById('public_nome').value.trim(),
      telefone: document.getElementById('public_telefone').value.trim()
    },
    pedido: {
      entrega: document.getElementById('public_entrega').value,
      data_agendada: document.getElementById('public_data').value,
      endereco: document.getElementById('public_endereco').value.trim(),
      municipio_entrega: document.getElementById('public_municipio').value,
      observacao: document.getElementById('public_obs').value.trim()
    },
    itens: state.carrinho.map(item => ({
      produto_id: item.id,
      quantidade: item.quantidade
    })),
    metodo_pagamento: metodoPagamento
  };

  if (metodoPagamento === 'PIX') {
    const emailField = document.getElementById('form-checkout__email');
    const docTypeField = document.getElementById('form-checkout__identificationType');
    const docNumField = document.getElementById('form-checkout__identificationNumber');
    
    payload.pix_payer = {
      email: emailField ? emailField.value.trim() : '',
      identification: {
        type: docTypeField ? docTypeField.value.trim() : '',
        number: docNumField ? docNumField.value.trim() : ''
      }
    };
  }

  const response = await fetch(`${API_BASE_URL}/api/mercado-pago-checkout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.details || data.error || 'Nao foi possivel gerar o pagamento online.');
  }

  return {
    ...(data.checkout || {}),
    pedidoId: data.pedido_id || data.checkout?.pedidoId || data.checkout?.externalId || '',
    paymentId: data.checkout?.paymentId || data.checkout?.id || ''
  };
}
function renderMercadoPagoCheckout(checkout) {
  if (!checkout) return;

  const pixCode = checkout.brCode || checkout.pix?.brCode || '';
  const qrCode = checkout.brCodeBase64 || checkout.pix?.brCodeBase64 || '';
  const isCard = checkout.method === 'CARD';
  const isPix = checkout.method === 'PIX';
  const isPro = checkout.method === 'PRO' || (checkout.method !== 'PIX' && !!checkout.url);
  const pedidoId = checkout.pedidoId || checkout.pedido_id || checkout.externalId || '';
  const paymentId = checkout.paymentId || checkout.id || '';

  openPaymentModal({
    isCard,
    isPix,
    isPro,
    amount: Number(checkout.amount) || 0,
    qrCode,
    pixCode,
    url: checkout.url || '',
    checkoutId: checkout.id || checkout.externalId || '',
    pedidoId,
    paymentId
  });
}

function clearAbacateCheckout() {
  const box = document.getElementById('abacateCheckout');
  if (!box) return;
  box.hidden = true;
  box.innerHTML = '';
}

function openPaymentModal({ isCard, isPix, isPro, amount, qrCode, pixCode, url, checkoutId, pedidoId, paymentId }) {
  const modal = document.getElementById('paymentModal');
  const text = document.getElementById('paymentModalText');
  const body = document.getElementById('paymentModalBody');
  const copyButton = document.getElementById('copyPixModalBtn');
  if (!modal || !text || !body || !copyButton) return;

  modal.dataset.pixCode = pixCode || '';

  if (isCard) {
    text.textContent = 'Preencha os dados do cartão com segurança para concluir seu pedido.';
    body.innerHTML = `
      <div class="modal-amount">${money.format(amount / 100)}</div>
      <div id="cardPaymentBrick_container" style="margin: 1rem 0; min-height: 200px;"></div>
    `;
    copyButton.hidden = true;

    // Inicializar o Card Payment Brick do Mercado Pago para checkout em modal transparente
    setTimeout(async () => {
      const container = document.getElementById('cardPaymentBrick_container');
      if (container && window.MercadoPago && checkoutId) {
        try {
          const mp = getMercadoPagoInstance();
          if (!mp) return;
          const bricksBuilder = mp.bricks();

          if (window.cardPaymentBrickController) {
            try {
              await window.cardPaymentBrickController.unmount();
            } catch (e) {
              console.warn(e);
            }
          }

          window.cardPaymentBrickController = await bricksBuilder.create("cardPayment", "cardPaymentBrick_container", {
            initialization: {
              amount: amount / 100, // valor em reais
            },
            callbacks: {
              onReady: () => {
                console.log('Card Payment Brick pronto.');
              },
              onSubmit: (formData, additionalData) => {
                return new Promise((resolve, reject) => {
                  fetch(`${API_BASE_URL}/api/mercado-pago-checkout`, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                      pedido_id: pedidoId || checkoutId,
                      metodo_pagamento: 'CARD',
                      card_payment: {
                        amount: String(formData.transaction_amount),
                        payment_method_id: formData.payment_method_id,
                        payment_type_id: additionalData.paymentTypeId,
                        token: formData.token,
                        installments: formData.installments,
                        email: formData.payer.email,
                        identification: formData.payer.identification
                      }
                    })
                  })
                  .then(response => response.json().then(data => ({ status: response.status, data })))
                  .then(({ status, data }) => {
                    if (status >= 200 && status < 300) {
                      showToast('Pagamento com cartão processado com sucesso!');
                      text.textContent = 'Pagamento Confirmado! Seu pedido já está sendo preparado.';
                      body.innerHTML = `
                        <div class="success-payment" style="text-align: center; padding: 2rem 1rem;">
                          <div style="font-size: 3rem; color: #4CAF50; margin-bottom: 1rem;">✓</div>
                          <h3 style="margin-bottom: 0.5rem; font-family: var(--font-display);">Pagamento Aprovado!</h3>
                          <p style="color: var(--text-muted); font-size: 0.9rem;">O pagamento foi confirmado e a produção de seus pães artesanais já foi iniciada.</p>
                        </div>
                      `;
                      
                      // Limpar carrinho
                      state.carrinho = [];
                      renderCart();
                      renderCatalog();
                      
                      resolve();
                    } else {
                      showToast(data.error || 'Erro ao processar pagamento com cartão.');
                      reject();
                    }
                  })
                  .catch(err => {
                    console.error('Erro na requisição de pagamento com cartão:', err);
                    showToast('Erro ao processar o pagamento com cartão. Tente novamente.');
                    reject();
                  });
                });
              },
              onError: (error) => {
                console.error('Erro no Card Payment Brick:', error);
                showToast('Erro no formulário de cartão do Mercado Pago.');
              }
            }
          });
        } catch (sdkError) {
          console.error('Erro ao renderizar Card Payment Brick:', sdkError);
          body.innerHTML = `<div style="color: red; text-align: center; padding: 1rem;">Erro ao inicializar o formulário de cartão. Por favor, tente pelo WhatsApp.</div>`;
        }
      }
    }, 100);
  } else if (isPro) {
    text.textContent = 'Clique no botão oficial abaixo para pagar de forma transparente via Pix, Cartão ou Boleto sem sair do site!';
    body.innerHTML = `
      <div class="modal-amount">${money.format(amount / 100)}</div>
      <div id="mp-wallet-brick-container" style="margin: 1rem 0; min-height: 48px;"></div>
    `;
    copyButton.hidden = true;

    // Renderizar o Wallet Brick do Mercado Pago para checkout em modal transparente
    setTimeout(() => {
      const container = document.getElementById('mp-wallet-brick-container');
      if (container && window.MercadoPago && checkoutId) {
        try {
          const mp = getMercadoPagoInstance();
          if (!mp) return;
          const bricksBuilder = mp.bricks();
          
          bricksBuilder.create("wallet", "mp-wallet-brick-container", {
            initialization: {
              preferenceId: checkoutId,
              redirectMode: "modal" // ABRE O MODAL / POPUP TRANSPARENTE NA PRÓPRIA PÁGINA!
            },
            customization: {
              texts: {
                valueProp: "smart_option"
              },
              visual: {
                buttonBackground: 'default',
                borderRadius: '8px'
              }
            }
          });
        } catch (sdkError) {
          console.error('Erro ao renderizar Wallet Brick do Mercado Pago:', sdkError);
          renderRedirectionFallback(body, url);
        }
      } else {
        renderRedirectionFallback(body, url);
      }
    }, 100);
  } else {
    text.textContent = 'Escaneie o QR Code ou copie o código PIX para pagar. Este código expira em 4 minutos.';
    body.innerHTML = `
      <div class="modal-amount">${money.format(amount / 100)}</div>
      <div id="pix-countdown-timer" style="font-weight: 600; color: #ff5722; text-align: center; font-size: 0.95rem; margin-bottom: 0.5rem; font-family: var(--font-display);">Expira em: 04:00</div>
      ${qrCode ? `<img class="modal-qr" src="${qrCode}" alt="QR Code PIX" style="max-width: 230px; margin: 0.5rem auto; display: block; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">` : ''}
      <div id="pix-payment-status" style="text-align: center; color: var(--text-muted); font-size: 0.85rem; margin-top: 0.5rem;">
        <span class="loading-spinner-small" style="display: inline-block; vertical-align: middle; margin-right: 6px;"></span>
        Aguardando pagamento...
      </div>
    `;
    copyButton.hidden = !pixCode;
    
    iniciarPixTimerEPolling(pedidoId || checkoutId, amount, paymentId || checkoutId);
  }

  modal.hidden = false;
  document.body.classList.add('modal-open');
}

function renderRedirectionFallback(bodyEl, url) {
  const amountText = bodyEl.querySelector('.modal-amount')?.innerHTML || '';
  bodyEl.innerHTML = `
    <div class="modal-amount">${amountText}</div>
    <a class="abacate-pay-link" href="${escapeHtml(url || '#')}" target="_blank" rel="noopener" style="background: linear-gradient(135deg, #009EE3 0%, #007CA8 100%); color: white; display: flex; align-items: center; justify-content: center; gap: 8px; font-weight: bold; border-radius: 8px; padding: 0.85rem; text-decoration: none; box-shadow: 0 4px 15px rgba(0, 158, 227, 0.4); font-size: 1rem; transition: transform 0.2s ease, box-shadow 0.2s ease; outline: none; margin: 1rem 0;">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display: inline-block; vertical-align: middle;">
        <rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect>
        <line x1="1" y1="10" x2="23" y2="10"></line>
      </svg>
      Pagar com Mercado Pago
    </a>
  `;
}

window.closePaymentModal = function() {
  const modal = document.getElementById('paymentModal');
  if (!modal) return;
  modal.hidden = true;
  document.body.classList.remove('modal-open');

  clearInterval(pixCountdownInterval);
  clearInterval(pixPollingInterval);

  if (window.cardPaymentBrickController) {
    try {
      window.cardPaymentBrickController.unmount();
      window.cardPaymentBrickController = null;
    } catch (e) {
      console.warn('Erro ao desmontar o Card Payment Brick:', e);
    }
  }
};

window.copyModalPixCode = async function() {
  const modal = document.getElementById('paymentModal');
  const pixCode = modal?.dataset.pixCode || '';
  if (!pixCode) return;

  try {
    await navigator.clipboard.writeText(pixCode);
    showToast('Código PIX copiado.');
  } catch (error) {
    showToast('Não foi possível copiar automaticamente.');
  }
};

function buildWhatsappMessage(checkout) {
  const nome = document.getElementById('public_nome').value.trim();
  const telefone = document.getElementById('public_telefone').value.trim();
  const entrega = document.getElementById('public_entrega').value;
  const data = document.getElementById('public_data').value;
  const endereco = document.getElementById('public_endereco').value.trim();
  const municipio = document.getElementById('public_municipio').value;
  const pagamento = document.getElementById('public_pagamento').value;
  const obs = document.getElementById('public_obs').value.trim();
  const totalProdutos = getProductsTotal();
  const taxaEntrega = getSelectedDeliveryFee();
  const total = getOrderTotal();

  const itens = state.carrinho
    .map(item => `- ${item.quantidade}x ${item.nome}${item.modelo ? ` (${item.modelo})` : ''} - ${money.format(item.preco * item.quantidade)}`)
    .join('\n');
  const pixCode = checkout?.brCode || checkout?.pix?.brCode || '';
  const checkoutUrl = checkout?.url || '';

  return [
    'Ola, Bemavi! Quero fazer um pedido:',
    '',
    '*Itens*',
    itens,
    '',
    `*Total dos paes:* ${money.format(totalProdutos)}`,
    `*Entrega:* ${money.format(taxaEntrega)}`,
    `*Total estimado:* ${money.format(total)}`,
    '',
    '*Dados do cliente*',
    `Nome: ${nome}`,
    `WhatsApp: ${telefone}`,
    `Entrega/retirada: ${entrega}`,
    `Data desejada: ${formatDate(data)}`,
    `Municipio: ${municipio}`,
    entrega === 'Entrega' ? `Endereco: ${endereco}` : null,
    `Pagamento: ${pagamento}`,
    checkout ? `Pagamento Mercado Pago: ${checkout.id}` : null,
    checkoutUrl ? `Link do checkout: ${checkoutUrl}` : null,
    pixCode ? `PIX copia e cola: ${pixCode}` : null,
    obs ? `Observacoes: ${obs}` : null,
    '',
    'Pode confirmar disponibilidade, frete e horario?'
  ].filter(Boolean).join('\n');
}

function setupDeliveryMode() {
  const select = document.getElementById('public_entrega');
  const address = document.getElementById('public_endereco');
  const box = document.getElementById('addressFields');
  if (!select || !address || !box) return;

  const update = () => {
    const isDelivery = select.value === 'Entrega';
    box.style.display = isDelivery ? 'block' : 'none';
    address.required = isDelivery;
    renderCart();
  };

  select.addEventListener('change', update);
  update();
}

function setupMunicipioChange() {
  const select = document.getElementById('public_municipio');
  if (!select) return;
  select.addEventListener('change', renderCart);
}

function formatPhoneBR(value) {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 11);
  if (digits.length === 0) return '';
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 3) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2, 3)} ${digits.slice(3)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 3)} ${digits.slice(3, 7)}-${digits.slice(7)}`;
}

function setupPhoneMask() {
  const input = document.getElementById('public_telefone');
  if (!input) return;

  input.inputMode = 'numeric';
  input.maxLength = 16;

  input.addEventListener('input', () => {
    input.value = formatPhoneBR(input.value);
  });
}

function setupCustomDatepicker() {
  const displayInput = document.getElementById('public_data_display');
  const picker = document.getElementById('publicDatepicker');
  if (!displayInput || !picker) return;

  displayInput.addEventListener('click', () => {
    picker.hidden = !picker.hidden;
    renderDatepicker();
  });

  document.addEventListener('click', event => {
    if (!picker.hidden && !picker.contains(event.target) && event.target !== displayInput) {
      picker.hidden = true;
    }
  });

  renderDatepicker();
}

function renderDatepicker() {
  const picker = document.getElementById('publicDatepicker');
  if (!picker) return;

  const month = state.calendarMonth;
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstDay = new Date(year, monthIndex, 1);
  const startOffset = firstDay.getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const monthLabel = month.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const cells = [];

  for (let i = 0; i < startOffset; i += 1) cells.push('<span></span>');

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const selectedValue = document.getElementById('public_data')?.value;

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(year, monthIndex, day);
    date.setHours(0, 0, 0, 0);
    const value = toDateInputValue(date);
    const disabled = date <= today;
    const selected = value === selectedValue;
    cells.push(`
      <button type="button" class="${selected ? 'selected' : ''}" ${disabled ? 'disabled' : ''} onclick="selectPublicDate('${value}')">
        ${day}
      </button>
    `);
  }

  picker.innerHTML = `
    <div class="datepicker-header">
      <button type="button" onclick="changeCalendarMonth(-1)" aria-label="Mês anterior">‹</button>
      <strong>${escapeHtml(monthLabel)}</strong>
      <button type="button" onclick="changeCalendarMonth(1)" aria-label="Próximo mês">›</button>
    </div>
    <div class="datepicker-weekdays">
      <span>D</span><span>S</span><span>T</span><span>Q</span><span>Q</span><span>S</span><span>S</span>
    </div>
    <div class="datepicker-days">${cells.join('')}</div>
  `;
}

window.changeCalendarMonth = function(delta) {
  state.calendarMonth = new Date(
    state.calendarMonth.getFullYear(),
    state.calendarMonth.getMonth() + delta,
    1
  );
  renderDatepicker();
};

window.selectPublicDate = function(value) {
  const hiddenInput = document.getElementById('public_data');
  const displayInput = document.getElementById('public_data_display');
  const picker = document.getElementById('publicDatepicker');
  if (hiddenInput) hiddenInput.value = value;
  if (displayInput) displayInput.value = formatDate(value);
  if (picker) picker.hidden = true;
  renderDatepicker();
};

function toDateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDate(value) {
  if (!value) return 'Nao informada';
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function showToast(message) {
  const toast = document.getElementById('publicToast');
  if (!toast) return;

  toast.textContent = message;
  toast.classList.add('active');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('active'), 2800);
}

function setupPaymentChange() {
  const selectPagamento = document.getElementById('public_pagamento');
  const mpFields = document.getElementById('mp-transparent-fields');
  if (!selectPagamento || !mpFields) return;

  const update = async () => {
    const isPix = selectPagamento.value === ONLINE_PIX_OPTION;
    mpFields.style.display = isPix ? 'flex' : 'none';

    const docType = document.getElementById('form-checkout__identificationType');
    const docNum = document.getElementById('form-checkout__identificationNumber');
    const emailField = document.getElementById('form-checkout__email');

    if (docType) docType.required = isPix;
    if (docNum) docNum.required = isPix;
    if (emailField) emailField.required = isPix;

    if (isPix) {
      await carregarTiposDocumento();
    }
  };

  selectPagamento.addEventListener('change', update);
  update();
}

async function carregarTiposDocumento() {
  const docTypeElement = document.getElementById('form-checkout__identificationType');
  if (!docTypeElement) return;

  if (docTypeElement.options.length > 0) return;

  try {
    const mp = getMercadoPagoInstance();
    if (!mp) {
      console.warn('SDK do Mercado Pago não disponível.');
      return;
    }
    const identificationTypes = await mp.getIdentificationTypes();

    docTypeElement.options.length = 0;
    const tempOptions = document.createDocumentFragment();

    identificationTypes.forEach(option => {
      const opt = document.createElement('option');
      opt.value = option.id;
      opt.textContent = option.name;
      tempOptions.appendChild(opt);
    });

    docTypeElement.appendChild(tempOptions);
  } catch (error) {
    console.error('Erro ao carregar tipos de documento:', error);
  }
}

function iniciarPixTimerEPolling(pedidoId, amount, paymentId) {
  clearInterval(pixCountdownInterval);
  clearInterval(pixPollingInterval);

  let tempoRestante = 4 * 60; // 4 minutos em segundos
  const timerEl = document.getElementById('pix-countdown-timer');
  const statusEl = document.getElementById('pix-payment-status');

  if (!pedidoId) {
    if (statusEl) statusEl.innerHTML = '<span style="color: #ff5722;">Nao foi possivel acompanhar este pagamento. Se o Pix foi pago, chame pelo WhatsApp.</span>';
    return;
  }

  pixCountdownInterval = setInterval(() => {
    tempoRestante -= 1;
    if (tempoRestante <= 0) {
      clearInterval(pixCountdownInterval);
      clearInterval(pixPollingInterval);
      if (timerEl) timerEl.textContent = 'QR Code Expirado!';
      if (statusEl) statusEl.innerHTML = '<span style="color: #ff5722;">O pagamento expirou. Feche e tente novamente.</span>';
      return;
    }

    const min = String(Math.floor(tempoRestante / 60)).padStart(2, '0');
    const seg = String(tempoRestante % 60).padStart(2, '0');
    if (timerEl) timerEl.textContent = `Expira em: ${min}:${seg}`;
  }, 1000);

  pixPollingInterval = setInterval(async () => {
    try {
      if (paymentId) {
        await fetch(`${API_BASE_URL}/api/mercado-pago-checkout?pedido_id=${encodeURIComponent(pedidoId)}&payment_id=${encodeURIComponent(paymentId)}`).catch(() => null);
      }

      const response = await fetch(`${API_BASE_URL}/api/pedidos?id=${pedidoId}`);
      if (!response.ok) return;
      const pedido = await response.json();

      if (pedido.pago === true) {
        clearInterval(pixCountdownInterval);
        clearInterval(pixPollingInterval);

        showToast('Pagamento Pix confirmado com sucesso!');
        const text = document.getElementById('paymentModalText');
        const body = document.getElementById('paymentModalBody');
        const copyButton = document.getElementById('copyPixModalBtn');

        if (text) text.textContent = 'Pagamento Confirmado! Seu pedido já está sendo preparado.';
        if (copyButton) copyButton.hidden = true;

        const dataAgendada = formatDate(pedido.data_agendada);
        const horarioEstimado = pedido.horario_estimado || '08:00';

        if (body) {
          body.innerHTML = `
            <div class="success-payment" style="text-align: center; padding: 1.5rem 1rem;">
              <div style="font-size: 3.5rem; color: #4CAF50; margin-bottom: 0.75rem;">✓</div>
              <h3 style="margin-bottom: 0.5rem; font-family: var(--font-display); font-size: 1.25rem;">Pagamento Pix Aprovado!</h3>
              <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 1rem;">Seu pagamento foi confirmado de forma automática e seu horário estimado de entrega é às <strong>${horarioEstimado}</strong> na data agendada.</p>
              <button type="button" class="whatsapp-send-btn" onclick="enviarConfirmacaoWhatsapp('${pedidoId}', '${horarioEstimado}')" style="background: #25D366; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 8px; font-weight: bold; width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px; cursor: pointer; box-shadow: 0 4px 15px rgba(37,211,102,0.3); font-size: 0.95rem; margin-top: 1rem;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style="display: inline-block; vertical-align: middle;">
                  <path d="M12.012 2c-5.506 0-9.989 4.478-9.99 9.984a9.96 9.96 0 0 0 1.335 4.978L2 22l5.197-1.363a9.957 9.957 0 0 0 4.815 1.242h.005c5.507 0 9.99-4.478 9.99-9.985A9.97 9.97 0 0 0 12.012 2zm5.727 14.127c-.247.697-1.206 1.275-1.66 1.327-.453.052-.903.243-2.903-.553-2.001-.798-3.284-2.83-3.385-2.964-.101-.133-.822-1.094-.822-2.087 0-.993.518-1.48.702-1.687.185-.206.402-.258.536-.258.135 0 .27-.001.387.005.123.006.29-.046.454.346.169.403.58 1.413.63 1.516.052.103.088.222.019.36-.069.138-.104.222-.207.345-.103.123-.217.274-.31.372-.103.103-.211.217-.09.423.122.207.544.896 1.163 1.447.797.712 1.467.933 1.673 1.036.207.103.326.088.446-.052.12-.138.517-.603.655-.81.137-.206.275-.172.464-.103.19.07 1.206.569 1.413.673.207.103.345.155.397.242.052.088.052.508-.195 1.205z"/>
                </svg>
                Enviar no WhatsApp da Padaria
              </button>
            </div>
          `;
        }

        state.carrinho = [];
        renderCart();
        renderCatalog();

        setTimeout(() => {
          enviarConfirmacaoWhatsapp(pedidoId, horarioEstimado);
        }, 2500);
      }
    } catch (e) {
      console.warn('Erro ao checar status do Pix:', e);
    }
  }, 4000);
}

window.enviarConfirmacaoWhatsapp = async function(pedidoId, horarioEstimado) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/pedidos?id=${pedidoId}`);
    if (!response.ok) return;
    const pedido = await response.json();

    const dataAgendada = formatDate(pedido.data_agendada);
    const totalProdutos = Number(pedido.valor_produtos);
    const taxaEntrega = Number(pedido.valor_entrega);
    const total = Number(pedido.valor_total);

    const itens = pedido.itens
      .map(item => `- ${item.quantidade}x ${item.nome}${item.modelo ? ` (${item.modelo})` : ''} - ${money.format(item.preco_unitario * item.quantidade)}`)
      .join('\n');

    const message = [
      'Ola, Bemavi! Meu pagamento de Pix foi confirmado automaticamente! ⚡🍞',
      '',
      `*Pedido Confirmado:* #${pedido.id.slice(0, 8).toUpperCase()}`,
      '',
      '*Itens*',
      itens,
      '',
      `*Total dos paes:* ${money.format(totalProdutos)}`,
      `*Entrega:* ${money.format(taxaEntrega)}`,
      `*Total Pago (Pix Online):* ${money.format(total)}`,
      '',
      '*Dados do cliente*',
      `Nome: ${pedido.cliente?.nome}`,
      `WhatsApp: ${pedido.cliente?.telefone}`,
      `Entrega/retirada: ${pedido.entrega}`,
      `Data agendada: ${dataAgendada}`,
      pedido.entrega === 'Entrega' ? `Endereco: ${pedido.cliente?.logradouro}` : null,
      pedido.observacao ? `Observacoes: ${pedido.observacao.split('\n')[0]}` : null,
      '',
      '*Logística Estimada Bemavi*',
      `📅 Entrega em: *${dataAgendada}*`,
      `⏰ Horário estimado aproximado: *${horarioEstimado}*`,
      '_(Definido com base na fila de produção e horários de partida)_',
      '',
      'Pode confirmar se a data/horário está disponível para entrega?'
    ].filter(Boolean).join('\n');

    const whatsappUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
    window.location.href = whatsappUrl;
  } catch (error) {
    console.error('Erro ao enviar mensagem para o WhatsApp:', error);
  }
};

window.navigateTo = function(step) {
  const viewCatalog = document.getElementById('viewCatalog');
  const viewCheckout = document.getElementById('viewCheckout');
  const headerSearch = document.getElementById('headerSearchBar');

  if (step === 'cart') {
    state.checkoutStep = 'cart';
    if (viewCatalog) viewCatalog.style.display = 'flex';
    if (viewCheckout) viewCheckout.classList.add('hidden');
    if (headerSearch) headerSearch.classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } else if (step === 'identification') {
    if (state.carrinho.length === 0) {
      showToast('Adicione pelo menos um item ao pedido.');
      return;
    }
    state.checkoutStep = 'identification';
    if (viewCatalog) viewCatalog.style.display = 'none';
    if (viewCheckout) viewCheckout.classList.remove('hidden');
    if (headerSearch) headerSearch.classList.add('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    document.getElementById('public_nome')?.focus();
  }
  renderCart();
  renderCatalog();
};

window.toggleCheckoutView = function() {
  if (state.checkoutStep === 'cart') {
    window.navigateTo('identification');
  } else {
    window.navigateTo('cart');
  }
};

window.selectDeliveryMethod = function(method) {
  const select = document.getElementById('public_entrega');
  if (!select) return;
  select.value = method;
  
  // Trigger native change event
  const event = new Event('change', { bubbles: true });
  select.dispatchEvent(event);

  // Update visual cards active state
  updateDeliveryVisualCards(method);
};

function updateDeliveryVisualCards(method) {
  const deliveryCard = document.getElementById('deliveryCard_Entrega');
  const pickupCard = document.getElementById('deliveryCard_Retirada');

  if (method === 'Entrega') {
    if (deliveryCard) {
      deliveryCard.className = "relative flex flex-col items-center justify-center p-5 border-2 border-primary-container bg-primary-container/5 rounded-xl cursor-pointer hover:bg-primary-container/10 transition-all group";
      const icon = deliveryCard.querySelector('.material-symbols-outlined');
      if (icon) icon.className = "material-symbols-outlined text-4xl text-primary mb-2";
    }
    if (pickupCard) {
      pickupCard.className = "relative flex flex-col items-center justify-center p-5 border border-outline-variant rounded-xl cursor-pointer hover:border-primary transition-all group";
      const icon = pickupCard.querySelector('.material-symbols-outlined');
      if (icon) icon.className = "material-symbols-outlined text-4xl text-on-surface-variant group-hover:text-primary mb-2";
    }
  } else {
    if (deliveryCard) {
      deliveryCard.className = "relative flex flex-col items-center justify-center p-5 border border-outline-variant rounded-xl cursor-pointer hover:border-primary transition-all group";
      const icon = deliveryCard.querySelector('.material-symbols-outlined');
      if (icon) icon.className = "material-symbols-outlined text-4xl text-on-surface-variant group-hover:text-primary mb-2";
    }
    if (pickupCard) {
      pickupCard.className = "relative flex flex-col items-center justify-center p-5 border-2 border-primary-container bg-primary-container/5 rounded-xl cursor-pointer hover:bg-primary-container/10 transition-all group";
      const icon = pickupCard.querySelector('.material-symbols-outlined');
      if (icon) icon.className = "material-symbols-outlined text-4xl text-primary mb-2";
    }
  }
}

window.selectPaymentMethod = function(method) {
  const select = document.getElementById('public_pagamento');
  if (!select) return;
  select.value = method;

  // Trigger native change event
  const event = new Event('change', { bubbles: true });
  select.dispatchEvent(event);

  // Update visual cards active state
  updatePaymentVisualCards(method);
};

function updatePaymentVisualCards(method) {
  const cards = [
    { id: 'paymentCard_Pagamento_na_entrega', value: 'Pagamento na entrega' },
    { id: 'paymentCard_Pix', value: 'Pix' },
    { id: 'paymentCard_Cartão', value: 'Cartão' }
  ];

  cards.forEach(cardInfo => {
    const card = document.getElementById(cardInfo.id);
    if (!card) return;

    const dotContainer = card.querySelector('.checked-dot-container');
    const dot = card.querySelector('.select-dot');

    if (cardInfo.value === method) {
      card.className = "flex items-center p-4 border-2 border-primary bg-primary/5 rounded-xl cursor-pointer hover:bg-surface-container-low transition-all bg-surface";
      if (dotContainer) dotContainer.className = "w-5 h-5 border-2 border-primary rounded-full flex items-center justify-center p-0.5 mr-4 transition-all checked-dot-container bg-white";
      if (dot) dot.classList.remove('opacity-0');
    } else {
      card.className = "flex items-center p-4 border border-outline-variant rounded-xl cursor-pointer hover:bg-surface-container-low transition-all bg-surface";
      if (dotContainer) dotContainer.className = "w-5 h-5 border border-outline rounded-full flex items-center justify-center p-0.5 mr-4 transition-all checked-dot-container";
      if (dot) dot.classList.add('opacity-0');
    }
  });
}

window.filterCategory = function(category) {
  state.categoriaAtiva = category;

  // Update active state of category buttons
  const categories = ['Todos', 'Pães', 'Bolos', 'Outros'];
  categories.forEach(cat => {
    const btn = document.getElementById(`catBtn_${cat}`);
    if (!btn) return;
    if (cat === category) {
      btn.className = "cat-btn flex items-center gap-xs px-5 py-2.5 bg-primary text-on-primary font-semibold rounded-full shadow-sm transition-all whitespace-nowrap";
    } else {
      btn.className = "cat-btn flex items-center gap-xs px-5 py-2.5 bg-surface hover:bg-surface-container-high text-on-surface-variant font-semibold rounded-full transition-all whitespace-nowrap border border-outline-variant";
    }
  });

  renderCatalog();
};

window.scrollToCatalog = function() {
  const section = document.getElementById('catalog-section');
  if (section) {
    const offset = 100;
    const bodyRect = document.body.getBoundingClientRect().top;
    const elementRect = section.getBoundingClientRect().top;
    const elementPosition = elementRect - bodyRect;
    const offsetPosition = elementPosition - offset;

    window.scrollTo({
      top: offsetPosition,
      behavior: 'smooth'
    });
  }
};

window.triggerCheckoutSubmit = function() {
  const form = document.getElementById('publicOrderForm');
  if (form) {
    form.requestSubmit();
  }
};
