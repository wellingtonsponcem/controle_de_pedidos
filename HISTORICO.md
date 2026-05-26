# Histórico de Desenvolvimento - Controle de Pedidos

## Sobre este Arquivo
Mantém o histórico consolidado de decisões e progresso do projeto para portabilidade de contexto.
**Instrução para IDEs de IA**: Mantenha este arquivo atualizado, com NO MÁXIMO 70 linhas.

---

## 🛠 Diretrizes e Padrões Obrigatórios
- **Qualidade**: Idioma PT-BR, Property-Based Testing (`fast-check`), Profiling, transições resilientes.
- **Stack**: Vercel Serverless (`/api`), Neon Postgres, SPA em CSS Vanilla e PWA resiliente offline.

---

## 📅 Linha do Tempo e Ações Executadas

### [2026-05-22 a 2026-05-24] - Inicialização e Recursos Fundamentais
- **Banco & APIs**: Criada modelagem Neon e APIs serverless (`produtos`, `pedidos`, `financeiro`, `cron`).
- **Logística**: Painel "Ajustes de Frete", API `/api/taxas.ts` e Heurística de Roteirização Vizinho Mais Próximo.
- **Catálogo CRUD SPA**: Cadastro de pães integrado ao Neon Postgres e reatividade em tempo real sem refresh.
- **Finanças & IA**: Adicionado cálculo instantâneo de taxas (Débito 2.27%, Crédito 3.99%) e Assistente IA com Groq.
- **Segurança & Upload**: Área de upload segura no catálogo conectada ao Cloudinary via assinatura SHA-1 no servidor.

### [2026-05-25] - Integração do Mercado Pago Checkout Pro (Produção) (Concluído)
- **Credenciais**: Salvas chaves reais de produção no `.env` e integradas no banco de dados Neon Postgres (`configuracoes_sistema`).
- **Preference API**: Backend (`mercado-pago-checkout.ts`) migrado para a API oficial de Preferências do Mercado Pago (`/checkout/preferences`), fornecendo suporte nativo a Pix, Cartão e Boleto em ambiente seguro oficial.
- **Frontend & SDK**: Importado o SDK v2 do Mercado Pago no fim do body de `catalogo.html`/`index.html` e salva a Public Key global no topo de `catalogo-publico.js`. O Wallet Brick do Mercado Pago Pro foi inicializado de forma direta via constante estática com `redirectMode: "modal"`, abrindo o checkout transparente em modal sobreposto na própria página.
- **Bugfix e Limpeza**: Removido por completo o gateway obsoleto Abacate Pay do frontend e backend. Injetada a `API_BASE_URL` nas chamadas de `app.js` resolvendo o travamento na inicialização do painel administrativo por protocolo local (`file:///`).
- **Qualidade**: Criados testes de propriedades (`fast-check`) em `tests/mercado-pago-checkout.test.ts` validando indutivamente tratamentos de dados (100% de sucesso nos 24 testes e sem erros no `npx tsc --noEmit`).

### [2026-05-26] - Checkout Transparente (Pix via Orders API & Cartão via Card Payment Brick) (Concluído)
- **Orders API no Backend**: Refatorado o backend em `api/mercado-pago-checkout.ts` para integrar a **Orders API do Mercado Pago** (`/v1/orders`) de forma unificada. O Pix gera o QR Code e código copia e cola instantaneamente na mesma tela. O Cartão de crédito processa tokens PCI e parcelas.
- **Frontend & SDK**: Exibição dinâmica dos campos transparentes e carregamento dinâmico dos tipos de documento via `mp.getIdentificationTypes()`. Renderizado o **Card Payment Brick** de Cartão no modal de pagamento (`paymentModal`) com desmontagem resiliente de ciclo de vida (`unmount()`) evitando memory leaks na heap.
- **Qualidade & Testes**: Expandidos os testes baseados em propriedades com Jest e `fast-check` para validar de forma indutiva a divisão resiliente e higienização robusta contra múltiplos espaços internos de nomes dos clientes. Compilação estática (`npx tsc --noEmit`) e 26 testes 100% verdes.
