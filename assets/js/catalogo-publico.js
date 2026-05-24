const WHATSAPP_NUMBER = '5527992760190';
const API_BASE_URL = window.location.protocol === 'file:' ? 'https://bemavi.vercel.app' : '';
const ONLINE_PIX_OPTION = 'Pix';
const ONLINE_CARD_OPTION = 'Cartão';

const state = {
  produtos: [],
  carrinho: [],
  abacateCheckout: null,
  taxasEntrega: {}
};

const money = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL'
});

document.addEventListener('DOMContentLoaded', () => {
  setupPublicOrderForm();
  setupDeliveryMode();
  setupPhoneMask();
  setMinimumDate();
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

  grid.innerHTML = state.produtos.map(prod => `
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
        <button type="button" class="add-btn" onclick="addToCart('${prod.id}')">Adicionar</button>
      </div>
    </article>
  `).join('');
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

window.addToCart = function(productId) {
  const produto = state.produtos.find(item => item.id === productId);
  if (!produto) return;

  const item = state.carrinho.find(cartItem => cartItem.id === productId);
  if (item) {
    item.quantidade += 1;
  } else {
    state.carrinho.push({
      id: produto.id,
      nome: produto.nome,
      modelo: produto.modelo,
      preco: Number(produto.preco_base) || 0,
      quantidade: 1
    });
  }

  renderCart();
  showToast(`${produto.nome} adicionado ao pedido.`);
};

window.changeCartQty = function(productId, delta) {
  const item = state.carrinho.find(cartItem => cartItem.id === productId);
  if (!item) return;

  item.quantidade += delta;
  if (item.quantidade <= 0) {
    state.carrinho = state.carrinho.filter(cartItem => cartItem.id !== productId);
  }

  renderCart();
};

function renderCart() {
  const list = document.getElementById('publicCartItems');
  const total = document.getElementById('publicCartTotal');
  const count = document.getElementById('cartCount');

  const totalItens = state.carrinho.reduce((acc, item) => acc + item.quantidade, 0);
  const totalValor = getOrderTotal();

  if (count) count.textContent = `${totalItens} ${totalItens === 1 ? 'item' : 'itens'}`;
  if (total) total.textContent = money.format(totalValor);

  if (!list) return;

  if (state.carrinho.length === 0) {
    list.innerHTML = '<div class="empty-cart">Seu carrinho esta vazio.</div>';
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
    const whatsappWindow = window.open('about:blank', '_blank');
    if (whatsappWindow) whatsappWindow.opener = null;

    if (button) {
      button.disabled = true;
      button.textContent = isOnlinePayment(pagamento) ? 'Preparando pagamento...' : 'Abrindo WhatsApp...';
    }

    try {
      if (isOnlinePayment(pagamento)) {
        state.abacateCheckout = await createAbacateCheckout(getAbacatePaymentMethod(pagamento));
        renderAbacateCheckout(state.abacateCheckout);
      } else {
        state.abacateCheckout = null;
        clearAbacateCheckout();
      }

      const message = buildWhatsappMessage(state.abacateCheckout);
      const whatsappUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
      if (whatsappWindow) {
        whatsappWindow.location.href = whatsappUrl;
      } else {
        window.open(whatsappUrl, '_blank', 'noopener');
      }

      if (state.abacateCheckout?.method === 'CARD' && state.abacateCheckout.url) {
        window.location.href = state.abacateCheckout.url;
      }
    } catch (error) {
      console.error('Falha ao preparar pedido publico:', error);
      if (whatsappWindow) whatsappWindow.close();
      showToast(error.message || 'Nao foi possivel preparar o pedido agora.');
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = 'Enviar pedido pelo WhatsApp';
      }
    }
  });
}

function isOnlinePayment(pagamento) {
  return pagamento === ONLINE_PIX_OPTION || pagamento === ONLINE_CARD_OPTION;
}

function getAbacatePaymentMethod(pagamento) {
  return pagamento === ONLINE_CARD_OPTION ? 'CARD' : 'PIX';
}

async function createAbacateCheckout(metodoPagamento) {
  const response = await fetch(`${API_BASE_URL}/api/abacate-checkout`, {
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
    throw new Error(data.error || 'Nao foi possivel gerar o PIX online.');
  }

  return data.checkout;
}

function renderAbacateCheckout(checkout) {
  const box = document.getElementById('abacateCheckout');
  if (!box || !checkout) return;

  const pixCode = checkout.brCode || checkout.pix?.brCode || '';
  const qrCode = checkout.brCodeBase64 || checkout.pix?.brCodeBase64 || '';
  const isCard = checkout.method === 'CARD';

  box.hidden = false;
  box.innerHTML = isCard ? `
    <div class="abacate-checkout-header">
      <strong>Checkout Abacate Pay gerado</strong>
      <span>${money.format((Number(checkout.amount) || 0) / 100)}</span>
    </div>
    <a class="abacate-pay-link" href="${escapeHtml(checkout.url || '#')}" target="_blank" rel="noopener">Pagar com cartao de credito</a>
  ` : `
    <div class="abacate-checkout-header">
      <strong>PIX Abacate Pay gerado</strong>
      <span>${money.format((Number(checkout.amount) || 0) / 100)}</span>
    </div>
    ${qrCode ? `<img src="${qrCode}" alt="QR Code PIX Abacate Pay">` : ''}
    <label for="abacatePixCode">PIX copia e cola</label>
    <textarea id="abacatePixCode" rows="4" readonly>${escapeHtml(pixCode)}</textarea>
    <button type="button" class="copy-pix" id="copyAbacatePix">Copiar PIX</button>
  `;

  if (isCard) return;

  const copyButton = document.getElementById('copyAbacatePix');
  if (copyButton) {
    copyButton.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(pixCode);
        showToast('Codigo PIX copiado.');
      } catch (error) {
        showToast('Selecione e copie o codigo PIX.');
      }
    });
  }
}

function clearAbacateCheckout() {
  const box = document.getElementById('abacateCheckout');
  if (!box) return;
  box.hidden = true;
  box.innerHTML = '';
}

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
    checkout ? `Checkout Abacate Pay: ${checkout.id}` : null,
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

function setMinimumDate() {
  const input = document.getElementById('public_data');
  if (!input) return;

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  input.min = tomorrow.toISOString().slice(0, 10);
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
