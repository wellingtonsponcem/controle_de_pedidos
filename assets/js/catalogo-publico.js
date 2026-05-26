const WHATSAPP_NUMBER = '5527992760190';
const API_BASE_URL = window.location.protocol === 'file:' ? 'https://bemavi.vercel.app' : '';
const ONLINE_PIX_OPTION = 'Pix';
const ONLINE_CARD_OPTION = 'Cartão';

const state = {
  produtos: [],
  carrinho: [],
  abacateCheckout: null,
  taxasEntrega: {},
  checkoutStep: 'cart',
  calendarMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
};

const money = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL'
});

document.addEventListener('DOMContentLoaded', () => {
  setupPublicOrderForm();
  setupDeliveryMode();
  setupPhoneMask();
  setupCustomDatepicker();
  setupMunicipioChange();
  loadDeliveryFees();
  loadPublicCatalog();
});

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

  if (count) {
    count.textContent = `${state.produtos.length} ${state.produtos.length === 1 ? 'item' : 'itens'}`;
  }

  if (state.produtos.length === 0) {
    grid.innerHTML = '<div class="loading-card">Nenhum produto disponivel no momento.</div>';
    return;
  }

  grid.innerHTML = state.produtos.map(prod => {
    const quantidade = getCartQuantity(prod.id);
    return `
    <article class="product-card">
      <div class="product-photo">
        <img src="${getProductImage(prod)}" alt="${escapeHtml(prod.nome)}" loading="lazy">
      </div>
      <span class="product-type">${escapeHtml(prod.versao || 'Artesanal')}</span>
      <h3>${escapeHtml(prod.nome)}</h3>
      <p class="product-details">${escapeHtml(prod.sabor || 'Pao artesanal Bemavi')}</p>
      <p class="product-details">${escapeHtml(prod.modelo || '')}</p>
      <div class="product-footer">
        <span class="price">${money.format(Number(prod.preco_base) || 0)}</span>
        <div class="product-counter" aria-label="Quantidade de ${escapeHtml(prod.nome)}">
          <button type="button" class="qty-btn" onclick="changeCartQty('${prod.id}', -1)" ${quantidade === 0 ? 'disabled' : ''}>-</button>
          <strong>${quantidade}</strong>
          <button type="button" class="qty-btn" onclick="changeCartQty('${prod.id}', 1)">+</button>
        </div>
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
  const continueButton = document.getElementById('continueCheckoutBtn');
  const form = document.getElementById('publicOrderForm');

  const totalItens = state.carrinho.reduce((acc, item) => acc + item.quantidade, 0);
  const totalValor = getOrderTotal();

  if (count) count.textContent = `${totalItens} ${totalItens === 1 ? 'item' : 'itens'}`;
  if (total) total.textContent = money.format(totalValor);
  if (continueButton) continueButton.disabled = state.carrinho.length === 0;
  if (form) form.hidden = state.carrinho.length === 0 || state.checkoutStep !== 'identification';

  if (!list) return;

  if (state.carrinho.length === 0) {
    list.innerHTML = '<div class="empty-cart">Seu carrinho está vazio. Adicione pães artesanais para começar!</div>';
    return;
  }

  list.innerHTML = state.carrinho.map(item => `
    <div class="cart-item">
      <div>
        <strong>${escapeHtml(item.nome)}</strong>
        <span>${escapeHtml(item.modelo || '')} - ${money.format(item.preco * item.quantidade)}</span>
      </div>
      <div class="qty-controls">
        <button type="button" class="qty-btn" onclick="changeCartQty('${item.id}', -1)">-</button>
        <strong>${item.quantidade}</strong>
        <button type="button" class="qty-btn" onclick="changeCartQty('${item.id}', 1)">+</button>
      </div>
    </div>
  `).join('');
}

window.openCheckoutIdentification = function() {
  if (state.carrinho.length === 0) {
    showToast('Adicione pelo menos um item ao pedido.');
    return;
  }
  state.checkoutStep = 'identification';
  renderCart();
  document.getElementById('public_nome')?.focus();
};

function closeCheckoutIdentification() {
  state.checkoutStep = 'cart';
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

    try {
      if (isOnlinePayment(pagamento)) {
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
      console.error('Falha ao preparar pedido publico:', error);
      showToast(error.message || 'Nao foi possivel preparar o pedido agora.');
    } finally {
      if (button) {
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
  const response = await fetch(`${API_BASE_URL}/api/mercado-pago-checkout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
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
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.details || data.error || 'Nao foi possivel gerar o pagamento online.');
  }

  return data.checkout;
}

function renderMercadoPagoCheckout(checkout) {
  if (!checkout) return;

  const pixCode = checkout.brCode || checkout.pix?.brCode || '';
  const qrCode = checkout.brCodeBase64 || checkout.pix?.brCodeBase64 || '';
  const isCard = checkout.method === 'CARD';
  const isPro = checkout.method === 'PRO' || !!checkout.url;

  openPaymentModal({
    isCard,
    isPro,
    amount: Number(checkout.amount) || 0,
    qrCode,
    pixCode,
    url: checkout.url || '',
    publicKey: checkout.publicKey || '',
    checkoutId: checkout.id || ''
  });
}

function clearAbacateCheckout() {
  const box = document.getElementById('abacateCheckout');
  if (!box) return;
  box.hidden = true;
  box.innerHTML = '';
}

function openPaymentModal({ isCard, isPro, amount, qrCode, pixCode, url, publicKey, checkoutId }) {
  const modal = document.getElementById('paymentModal');
  const text = document.getElementById('paymentModalText');
  const body = document.getElementById('paymentModalBody');
  const copyButton = document.getElementById('copyPixModalBtn');
  if (!modal || !text || !body || !copyButton) return;

  modal.dataset.pixCode = pixCode || '';

  if (isPro) {
    text.textContent = 'Clique no botão oficial abaixo para pagar de forma transparente via Pix, Cartão ou Boleto sem sair do site!';
    body.innerHTML = `
      <div class="modal-amount">${money.format(amount / 100)}</div>
      <div id="mp-wallet-brick-container" style="margin: 1rem 0; min-height: 48px;"></div>
    `;
    copyButton.hidden = true;

    // Renderizar o Wallet Brick do Mercado Pago para checkout em modal transparente
    setTimeout(() => {
      const container = document.getElementById('mp-wallet-brick-container');
      if (container && window.MercadoPago && publicKey && checkoutId) {
        try {
          const mp = new window.MercadoPago(publicKey, { locale: 'pt-BR' });
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
    text.textContent = isCard
      ? 'Use o link abaixo para concluir o pagamento com cartão.'
      : 'Escaneie o QR Code ou copie o código PIX para pagar.';
    body.innerHTML = isCard ? `
      <div class="modal-amount">${money.format(amount / 100)}</div>
      <a class="abacate-pay-link" href="${escapeHtml(url || '#')}" rel="noopener">Pagar com cartão</a>
    ` : `
      <div class="modal-amount">${money.format(amount / 100)}</div>
      ${qrCode ? `<img class="modal-qr" src="${qrCode}" alt="QR Code PIX">` : ''}
    `;
    copyButton.hidden = isCard || !pixCode;
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
