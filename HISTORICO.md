# Histórico de Desenvolvimento - Controle de Pedidos

## Sobre este Arquivo
Este arquivo mantém o histórico consolidado de decisões e progresso do projeto para portabilidade de contexto.
**Instrução para Assistentes e IDEs de IA**: Mantenha este arquivo atualizado, com no máximo 70 linhas, preservando a linearidade e as regras arquiteturais fundamentais.

---

## 🛠 Diretrizes e Padrões Obrigatórios
- **Qualidade & Processo**: Idioma PT-BR, Spec-Driven (SpecKit), Property-Based Testing (`fast-check`), Profiling, transações atômicas e rollbacks resilientes.
- **Stack**: Vercel Serverless (APIs em `/api`), Neon Postgres, Frontend SPA responsivo em CSS Vanilla e PWA resiliente offline com IndexedDB.
- **Commits**: Sugerir títulos semânticos em português ao finalizar as tarefas.

---

## 📅 Linha do Tempo e Ações Executadas

### [2026-05-22] - Inicialização e Arquitetura Base (v1.0.0 a v2.3.0)
- **SDD & Specs**: Ratificada a constituição em `.specify/memory/constitution.md` e especificações do negócio em `specs/001-controle-pedidos-paes/`.
- **Fase 1 (DB)**: Criada migração Neon Postgres em `neon/migrations/` com esquemas, triggers e dados populados de Vitória, Vila Velha, Serra e pães.
- **Fase 2 (APIs Backend)**: Desenvolvido utilitário resiliente com rollback em `api/_db.ts`. Implementados endpoints serverless: `produtos.ts`, `pedidos.ts`, `financeiro.ts` e `cron-recorrencia.ts`.
- **Diagnóstico & Ajustes**: Corrigido typescript deprecation no `tsconfig.json`. Validada execução de testes baseados em propriedades com `fast-check` (100% de sucesso).
- **Ambiente & Analytics**: Criado `.env`, `.gitignore` e integrado script estático Vercel Insights no `index.html`.

### [2026-05-22] - Refatoração Visual do Dashboard Mobile (v2.4.0) (Concluído)
- **Visual & UI**: Superior com abas minimalistas douradas (#F59E0B). Ícone sync SVG absoluto com rotação 3D. Emojis trocados por SVGs e dicas convertidas em Accordion.

### [2026-05-22] - Ergonomia do Formulário de Novo Pedido (v2.5.0) (Concluído)
- **Formulário & Inputs**: Empilhamento vertical de campos lado a lado em mobile. Borda sutil de 1px solid #2A2A2A, radius de 6px e foco com brilho dourado suave.
- **Estruturação & Totais**: Afastados títulos de seção em 16px. Aumentado gap para 24px. Bloco de totais redesenhado em Recibo (#1A1A1A) com Total Geral em destaque (1.5rem).
- **Botão Fixo (Sticky)**: Botão de agendamento fixado no rodapé com vidro translúcido premium (blur de 12px) sob o viewport mobile.
- **Qualidade**: Atualizado `tsconfig.json` para `"module": "node16"`, `"moduleResolution": "node16"` e `"isolatedModules": true`, eliminando o erro de depreciação do TS 6.0 e avisos do ts-jest. Compilação e testes (fast-check) concluídos com 100% de sucesso.

### [2026-05-22] - Refatoração do Dashboard Financeiro Mobile (v2.6.0) (Concluído)
- **Cards & Grids**: Hero card de Saldo com fonte 2.25rem em largura inteira. Receitas e Despesas parelhados lado a lado (1fr 1fr) com tamanho menor para evitar quebras.
- **Extrato Responsivo**: Tabela HTML removida. Implementada lista de transações flex/grid. No mobile, vira lista empilhada com categoria/data e cor dinâmica baseada no tipo.
- **Modal & Bottom Sheet**: Formulário de Novo Lançamento extraído em Modal Overlay de fundo escuro, transicionado em Bottom Sheet a partir do rodapé em celulares.
- **Lógica & Sincronização**: Criadas funções `openFinanceModal` e `closeFinanceModal` globais, com fechamento automático no envio bem-sucedido e resiliência offline do IndexedDB preservada. Testes de propriedades fast-check validados com sucesso.

### [2026-05-22] - Ajustes de Frete Dinâmicos e Flexibilidade de Logística (v2.7.0) (Concluído)
- **Painel Administrativo & UI**: Adicionado card "Ajustes de Frete" na coluna lateral do Dashboard com inputs numéricos e checkbox para "Frete Grátis Global".
- **Backend Serverless & API**: Criada API `/api/taxas.ts` que permite a persistência e atualização atômica das taxas no Neon Postgres de forma resiliente a falhas de conexão (HTTP 503).
- **Lógica Frontend & PWA**: Lógica desenvolvida em `app.js` integrada ao `localStorage` para funcionamento 100% offline (resiliência PWA), com sincronização inteligente de frete no restabelecimento da conexão (`syncOfflineData`).
- **Validação**: Testes Jest baseados em propriedades fast-check e compilação do TypeScript mantidos em 100% de sucesso.

### [2026-05-22] - Catálogo SPA & CRUD Administrativo de Produtos (v2.8.0) (Concluído)
- **SDD & Specs**: Ratificada a constituição em `.specify/memory/constitution.md` e especificações do negócio.
- **Fase 1 (DB)**: Criada migração Neon Postgres, triggers e dados populados.
- **Fase 2 (APIs Backend)**: Desenvolvido utilitário resiliente e endpoints serverless (produtos, pedidos, financeiro).
- **Ambiente**: Configurado TS 6.0, `fast-check` e Vercel Insights.

### [2026-05-22] - UX/UI Mobile, Ajustes de Frete e Catálogo SPA (v2.4.0 a v2.8.0) (Concluído)
- **Interface**: Abas douradas, sticky buttons, modal Bottom Sheet, CSS Grid Desktop assimétrico e roteamento SPA.
- **Logística & Produtos**: Ajustes dinâmicos de frete, sincronização offline (IndexedDB) e CRUD administrativo de produtos.

### [2026-05-22 a 2026-05-23] - Logística, Consignações e Taxas da Maquininha (v2.9.0 a v2.12.0) (Concluído)
- **Logística & Consignações**: Roteador e-Bike (Vizinho Mais Próximo), Timeline no Maps e módulo de gestão de consignações.
- **Maquininha**: Cálculo de taxas no modal `#orderDeliveryModal` (Débito 2.27%, Crédito 3.99%) e caixa líquido imediato.

### [2026-05-23] - Pagamentos Antecipados de Pedidos e Idempotência de Caixa (v2.13.0) (Concluído)
- **Banco & APIs**: Colunas `pago`/`data_pagamento` integradas com rollback atômico e idempotência financeira no caixa.
- **Interface & PWA**: Checkbox/seletor na criação/edição, badges `⚡ Pago`/`💵 Pendente` e encerramento imediato de pedidos quitados.

### [2026-05-23] - Abatimento de Descontos e Peso Digitável no Catálogo (v2.14.0) (Concluído)
- **DB & APIs**: Coluna `desconto` na tabela `pedidos` (Neon). POST/PUT tratam o desconto e recalculam o total e o valor líquido.
- **Interface & PWA**: Campo de desconto na criação/edição com recálculo visual em tempo real e digitação livre do "Modelo/Peso" no catálogo.
- **Verificação**: Compilação TypeScript (`npx tsc --noEmit`) e 12 testes fast-check com 100% de sucesso.
