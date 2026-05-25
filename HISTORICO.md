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
- **Frontend Premium**: Ajustada a função `openPaymentModal` em `catalogo-publico.js` renderizando botão estilizado azul oficial do Mercado Pago com gradiente e sombras premium.
- **Qualidade**: Criados testes de propriedades (`fast-check`) em `tests/mercado-pago-checkout.test.ts` validando indutivamente tratamentos de dados (100% de sucesso nos 24 testes e sem erros no `npx tsc --noEmit`).
