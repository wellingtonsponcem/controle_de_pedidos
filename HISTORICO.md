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

### [2026-05-26] - Checkout Transparente & Rastreabilidade Pix em Tempo Real (Concluído)
- **API do Mercado Pago corrigida**: Migrada a integração do endpoint legado/restrito de Merchant Orders (`/v1/orders`) para a **API oficial de Pagamentos (`/v1/payments`)** para Pix e Cartão de Crédito transparente. Isso resolveu definitivamente o erro "Não foi possível criar a cobrança Pix" devido a limitações de credenciais. O Pix expira em 4 min (`date_of_expiration` no payload). Criada rota `GET /api/pedidos?id={id}` retornando a posição logística diária e o horário de entrega estimado.
- **Remoção de Fricção de UX (E-mail Opcional)**: O e-mail do pagador é exigido estritamente pelo Mercado Pago, mas para evitar fricção de preenchimento que afasta clientes, tornamos o campo **100% opcional** no frontend (`index.html`, `catalogo.html`, `catalogo-publico.js`). No backend (`mercado-pago-checkout.ts`), implementamos um fallback transparente que higieniza e gera de forma autônoma um e-mail com base no telefone (`{telefone}@bemavi.local`) se o e-mail for omitido.
- **Frontend & SDK**: Acoplados cronômetro countdown regressivo (`Expira em: 04:00`) e polling de status (a cada 4s) que identifica instantaneamente o pagamento do Pix. Implementado o **Card Payment Brick** com desmontagem resiliente (`unmount()`) de ciclo de vida.
- **Logística do WhatsApp**: Intercepção automática de Pix aprovado e redirecionamento dinâmico para o WhatsApp com comprovante, pães e horário pré-estabelecido sugerido pela heurística de rotas diárias de 30 minutos a partir das 08:00.
- **Segurança & Webhook**: Ajustado o segredo do webhook `.env` e Neon (`MERCADOPAGO_WEBHOOK_SECRET="bemavi_mercadopago_webhook_20260524"`) para compatibilidade e verificação bem-sucedida das notificações em produção.

### [2026-05-26 - Extra] - Exclusão Segura de Pedidos Cancelados (Concluído)
- **Backend & Transação**: Ajustada a rota `DELETE /api/pedidos` com suporte a exclusão em cascata (remove dependências em `itens_pedido` e `transacoes_financeiras` e depois em `pedidos`). Lógica protegida por transações atômicas resilientes (`withTransaction`).
- **Validação de Segurança**: Criado utilitário puro `api/_pedidos_utils.ts` contendo a validação `podeExcluirPedido` para garantir que apenas pedidos com status "Cancelado" possam ser excluídos do banco de dados (retorna 400 para outros status).
- **Frontend Administrativo**: Adicionado o botão "🗑️ Excluir Definitivamente" visível apenas em pedidos com status "Cancelado" no painel. Implementada a função global `excluirPedidoCancelado` que interage com o backend via fetch e atualiza reativamente o dashboard administrativo.
- **Qualidade**: Criados 3 novos testes baseados em propriedades com `fast-check` em `tests/pedidos.test.ts` (totalizando 29 testes 100% verdes no Jest). Validação estática sem erros no `npx tsc --noEmit`.
