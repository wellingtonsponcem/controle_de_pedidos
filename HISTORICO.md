# Histórico de Desenvolvimento - Controle de Pedidos

## Sobre este Arquivo
Este arquivo mantém o histórico consolidado de decisões e progresso do projeto para portabilidade de contexto.
**Instrução para Assistentes e IDEs de IA**: Mantenha este arquivo atualizado, com no máximo 70 linhas, preservando a linearidade e as regras arquiteturais fundamentais.

---

## 🛠 Diretrizes e Padrões Obrigatórios

1. **Idioma**: Todas as comunicações e entregas em português do Brasil.
2. **Spec-Driven Development (SDD)**: Seguir o framework SpecKit (`.specify/`).
3. **Property-Based Testing**: Adotar testes baseados em propriedades usando `fast-check`.
4. **Profiling e Heap Snapshots**: Monitoramento ativo de CPU/memória e vazamentos.
5. **Resiliência a Banco de Dados**: Transações atômicas e rollbacks seguros.
6. **Hospedagem & Vercel**: Estático no frontend, Serverless no backend (`api/`), banco Neon Postgres.
7. **Commits Semânticos**: Sugerir mensagens de commit em português ao finalizar ações.

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
- **Layout Desktop Grid**: Reorganizado dashboard com CSS Grid assimétrico (`2fr 1fr`), colocando a Fila na esquerda e os Ajustes de Frete/Expedição empilhados na direita.
- **Roteamento SPA**: Injetada a aba "Catálogo" e sua estrutura responsiva para o gerenciamento de produtos com cadastro, edição e ativação/desativação.
- **CRUD e Cache Offline**: Implementadas as funções administrativas no `app.js` integrando modais de produtos e o backend Neon Postgres, com sincronização offline no IndexedDB.
- **Filtro de Inativos**: Atualizadas as buscas no catálogo público e no seletor de pedidos para exibir estritamente produtos com `ativo !== false`.
- **Qualidade**: Executados `npx tsc --noEmit` e `npm test` baseados em propriedades com sucesso absoluto.
### [2026-05-22] - Semeadura e Estruturação de Tabelas no Neon (v2.9.0) (Concluído)
- **Migração do Banco**: Adicionado atalho `db:migrate` no `package.json` e executada a migração com sucesso, garantindo 100% da DDL estruturada e os dados iniciais de taxas de frete (Vitória, Vila Velha, Serra) e pães Bemavi semeados no Neon Postgres.
