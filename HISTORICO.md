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
- **Cabeçalho & Abas**: Convertido o menu superior mobile em abas minimalistas com indicador inferior (#F59E0B) sem o fundo amarelo.
- **Fila de Produção**: Botão de atualizar volumoso substituído por ícone sync SVG absoluto com animação rotativa. Adicionado Empty State dinâmico com botão "+ Criar Pedido".
- **Visual & Dicas**: Emojis nativos substituídos por SVGs no tom ouro Bemavi. Dicas de expedição reestruturadas para Accordion nativo com `<details>` e `<summary>` e transições 3D.
- **Testes & Lints**: Validada execução dos testes do Jest (Property-Based) e verificação do TypeScript sem erros.
