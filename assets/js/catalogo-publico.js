const WHATSAPP_NUMBER = '5527992760190';

const state = {
  produtos: [],
  carrinho: []
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
  loadPublicCatalog();
});

async function loadPublicCatalog() {
  const grid = document.getElementById('publicCatalogGrid');
  const count = document.getElementById('catalogCount');

  try {
    const response = await fetch('/api/produtos');
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
  const totalValor = state.carrinho.reduce((acc, item) => acc + (item.preco * item.quantidade), 0);

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

function setupPublicOrderForm() {
  const form = document.getElementById('publicOrderForm');
  if (!form) return;

  form.addEventListener('submit', event => {
    event.preventDefault();

    if (state.carrinho.length === 0) {
      showToast('Adicione pelo menos um item ao pedido.');
      return;
    }

    const entrega = document.getElementById('public_entrega').value;
    const endereco = document.getElementById('public_endereco').value.trim();

    if (entrega === 'Entrega' && !endereco) {
      showToast('Informe o endereco para entrega.');
      return;
    }

    const message = buildWhatsappMessage();
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`, '_blank', 'noopener');
  });
}

function buildWhatsappMessage() {
  const nome = document.getElementById('public_nome').value.trim();
  const telefone = document.getElementById('public_telefone').value.trim();
  const entrega = document.getElementById('public_entrega').value;
  const data = document.getElementById('public_data').value;
  const endereco = document.getElementById('public_endereco').value.trim();
  const pagamento = document.getElementById('public_pagamento').value;
  const obs = document.getElementById('public_obs').value.trim();
  const total = state.carrinho.reduce((acc, item) => acc + (item.preco * item.quantidade), 0);

  const itens = state.carrinho
    .map(item => `- ${item.quantidade}x ${item.nome}${item.modelo ? ` (${item.modelo})` : ''} - ${money.format(item.preco * item.quantidade)}`)
    .join('\n');

  return [
    'Ola, Bemavi! Quero fazer um pedido:',
    '',
    '*Itens*',
    itens,
    '',
    `*Total dos paes:* ${money.format(total)}`,
    '',
    '*Dados do cliente*',
    `Nome: ${nome}`,
    `WhatsApp: ${telefone}`,
    `Entrega/retirada: ${entrega}`,
    `Data desejada: ${formatDate(data)}`,
    entrega === 'Entrega' ? `Endereco: ${endereco}` : null,
    `Pagamento: ${pagamento}`,
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
  };

  select.addEventListener('change', update);
  update();
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
