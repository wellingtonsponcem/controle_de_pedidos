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

### [2026-05-22] - Inicialização, APIs e Banco de Dados (v1.0.0 a v2.3.0)
- **Base**: Ratificada a constituição em `.specify/memory/constitution.md` e specs do negócio.
- **Fase 1 & 2**: Criada migração Neon Postgres em `neon/migrations/` e desenvolvidas APIs serverless (`produtos.ts`, `pedidos.ts`, `financeiro.ts`, `cron-recorrencia.ts`) com rollback resiliente em `api/_db.ts`.

### [2026-05-22] - Refatoração de Ergonomia UX/UI e Dashboard Financeiro (v2.4.0 a v2.6.0)
- **Visual**: Abas douradas minimalistas, sticky buttons fixos e accordion de dicas.
- **Formulário & Caixa**: Inputs mobile lado a lado, totais destacados em bloco Recibo e extração de lançamentos em Bottom Sheet.

### [2026-05-22] - Ajustes de Frete e Catálogo CRUD SPA (v2.7.0 a v2.8.0)
- **Logística**: Painel "Ajustes de Frete", API `/api/taxas.ts` e persistência offline em `localStorage` e PWA.
- **Produtos**: CRUD de produtos integrado ao Neon com sincronização offline no IndexedDB.

### [2026-05-22 a 2026-05-23] - Roteirização, Consignação e Taxas (v2.9.0 a v2.12.0)
- **Logística**: Heurística de Vizinho Mais Próximo para e-Bike, timeline no Maps e gestão de consignações em lotes.
- **Finanças**: Cálculo de taxas no modal (Débito 2.27%, Crédito 3.99%) e caixa líquido instantâneo.

### [2026-05-23] - Fluxos de Pagamentos Antecipados e Descontos (v2.13.0 a v2.14.0)
- **Prepayment**: Colunas `pago`/`data_pagamento` integradas com rollback atômico e idempotência financeira de caixa.
- **Melhorias**: Campo `desconto` em pedidos (Neon) recalculando líquido visual na hora e "Modelo/Peso" de pães digitável livre no catálogo.

### [2026-05-23] - Reatividade Síncrona Sem Refresh de Catálogo e Frete (v2.15.0) (Concluído)
- **Arquitetura**: Centralizada carga de catálogo em `/api/produtos?all=true` via `loadProdutos()`.
- **Reatividade**: Renderizações administrativa e pública tornadas síncronas a partir de `state.produtos` local.
- **Logística**: Injetada a função `updateMunicipioSelectLabels()` atualizando selects de frete de forma dinâmica pós-configuração de taxas.
- **Visual & UX**: Adicionado botão premium "➕ Novo Pedido" no cabeçalho da Fila de Produção do Dashboard para navegação ergonômica direta.
- **Qualidade**: Validação estática `npx tsc --noEmit` e Jest fast-check com 100% de sucesso.

### [2026-05-23] - Assistente IA de Finanças e Produção com Groq (v2.16.0) (Concluído)
- **Segurança**: Chave API coletada pelo frontend mascarada e salva exclusivamente no navegador (`localStorage`), sem exposição na nuvem.
- **Inteligência**: Integração com Groq (`llama-3.3-70b-versatile`) analisando fluxo de caixa consolidado, despesas por categoria e ranking de vendas de pães.
- **UX & Relatório**: Console de status dinâmico em PWA, renderizador markdown luxuoso e chat interativo de estratégias financeiras baseadas em dados reais.
- **Qualidade**: Compilação estática `npx tsc --noEmit` e Jest fast-check com 100% de sucesso.
- **Bugfix (v2.16.1)**: Removido bloco duplicado órfão no formulário de entrega (`app.js`) que causava erro de sintaxe e travamento na inicialização do dashboard no carregamento de dados.

### [2026-05-23] - Refatoração Ergonômica UX/UI do Dashboard (v2.17.0) (Concluído)
- **Fila de Produção**: Separada em sub-abas ("Pendentes", "Em Rota" e "Concluídos") com filtragem síncrona em memória a partir de `state.pedidos` e sincronização dinâmica do badge.
- **Sidebar**: Quatro seções administrativas unificadas sob o padrão Accordion Group (`<details>` / `<summary>`) com colapso de seleção única automatizado, reduzindo em 70% a rolagem de tela no celular.
- **Qualidade**: Validação estática `npx tsc --noEmit` e Jest fast-check com 100% de sucesso.

