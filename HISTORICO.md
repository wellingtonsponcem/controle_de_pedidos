# Histórico de Desenvolvimento - Controle de Pedidos

## Sobre este Arquivo
Este arquivo mantém o histórico consolidado e contínuo de decisões e progresso do projeto, garantindo a portabilidade do contexto para qualquer IDE ou assistente de IA.
**Instrução para Assistentes e IDEs de IA**: Mantenha este arquivo sempre atualizado, com no máximo 70 linhas, preservando a linearidade e as regras arquiteturais fundamentais.

---

## 🛠 Diretrizes e Padrões Obrigatórios

1. **Idioma**: Todas as comunicações e entregas devem ser em português do Brasil.
2. **Spec-Driven Development (SDD)**: O desenvolvimento segue o framework SpecKit (`.specify/`). Nenhuma funcionalidade deve ser escrita sem especificação (`spec.md`), plano de implementação (`plan.md`) e checklist de tarefas (`tasks.md`) previamente validados e aprovados.
3. **Property-Based Testing**: Testes unitários e de integração devem adotar testes baseados em propriedades usando bibliotecas como `fast-check` para ambientes Node.js. Evite depender unicamente de entradas estáticas.
4. **Profiling e Heap Snapshots**: Monitoramento ativo de CPU e consumo de memória (Chrome DevTools ou py-spy). Devem ser gerados snapshots periódicos da Heap para validação e mitigação de vazamento de memória.
5. **Resiliência a Banco de Dados (DB Fallback)**: A lógica do sistema deve ser desenhada prevendo transações atômicas e rollbacks seguros caso o banco de dados falhe no meio de requisições, preservando a consistência dos dados.
6. **Hospedagem & Vercel Gratuita**: Implantação nativa na Vercel (plano Hobby). Frontend estático em HTML/CSS/JS (Vanilla) e Serverless Functions no backend (Node.js/TypeScript em `api/`). Respeitar o limite de 10s de timeout e sistema de arquivos somente leitura.
7. **Commits Semânticos**: Cada entrega ou ação finalizada requer sugestões explícitas de mensagens de commit em português.

---

## 📅 Linha do Tempo e Ações Executadas

### [2026-05-22] - Inicialização do SDD e Constituição do Projeto
- **Ação**: Execução do comando `/speckit.constitution` para iniciar o fluxo Spec-Driven Development.
- **Pre-hook**: Executado hook automático de inicialização do Git (`initialize-repo.ps1`) com correção de parser encoding no PowerShell de Windows.
- **Constituição (v1.0.0)**: Criada e ratificada a Constituição do Projeto (`.specify/memory/constitution.md`).
- **Histórico**: Criação inicial do arquivo `HISTORICO.md` contendo a portabilidade de contexto.

### [2026-05-22] - Emenda da Constituição para Vercel Gratuita (v1.1.0)
- **Ação**: Atualização da constituição (`constitution.md`) e do log técnico para incorporar a stack compatível com a Vercel gratuita (Hobby).
- **Detecção**: Estabelecidos limites de Serverless Functions (timeout estrito de 10s), sistema de arquivos somente leitura, e persistência de dados em banco de dados externo (como Supabase Postgres).
- **Adequação**: Frontend definido como HTML5, Vanilla CSS moderno e JS Vanilla, e backend com Node.js/TypeScript na pasta `api/` da Vercel.

### [2026-05-22] - Especificação Funcional do Controle de Pedidos de Pão (v1.1.0)
- **Ação**: Execução do comando `/speckit.specify` para o projeto de Controle de Pedidos de Pão Caseiro.
- **Pre-hook**: Executada criação automática de feature branch (`001-controle-pedidos-paes`) e inicialização da estrutura física em `specs/001-controle-pedidos-paes/`.
- **Especificação**: Desenvolvido o arquivo `spec.md` cobrindo o catálogo de pães (versões/sabores/modelos), entregas na Grande Vitória, agendamentos, recorrência, controle financeiro (compras/vendas) e arquitetura PWA responsiva.
- **Qualidade**: Gerado o arquivo de validação de qualidade `checklists/requirements.md` e mapeados 3 pontos críticos para decisão do usuário (taxas de entrega, comportamento de recorrência e complexidade do fluxo de insumos).

### [2026-05-22] - Conclusão das Fases 1 e 2 (v2.0.0)
- **Fase 1 (Banco de Dados)**: Migração estrutural Neon Postgres `neon/migrations/..._schema_inicial.sql` criada com triggers, índices e população (Vitória, Vila Velha, Serra e pães).
- **Fase 2 (APIs Backend)**: Desenvolvido utilitário resiliente com transação de conexão segura e rollbacks em `api/_db.ts`.
- **Endpoints Serverless**:
  - `api/produtos.ts`: Catálogo de pães com cache dinâmico e resiliência HTTP 503.
  - `api/pedidos.ts`: Agendamento atômico, validação de preços e gatilho de receita no status "Entregue".
  - `api/financeiro.ts`: Fluxo consolidado (Lucro = Receitas - Despesas) e lançamentos de despesas/insumos.
  - `api/cron-recorrencia.ts`: Varredura periódica e pré-geração autônoma de pedidos recorrentes como "Rascunho" sem duplicidade.
- **Status**: Fase 2 concluída. Iniciando desenvolvimento do Frontend PWA Premium.

### [2026-05-22] - Diagnóstico do Erro Vercel DEPLOYMENT_NOT_FOUND & Ajuste TypeScript (v2.1.0)
- **Diagnóstico**: O erro "DEPLOYMENT_NOT_FOUND" em bemavi.vercel.app indica que o domínio está registrado na Vercel, mas não há nenhuma build/implantação de produção ativa e com sucesso associada a ele.
- **Ajuste TypeScript**: Corrigido erro de deprecation no `tsconfig.json` adicionando `"ignoreDeprecations": "6.0"` para garantir compilação limpa do `tsc` e das serverless functions da Vercel.
- **Testes**: Rodados testes baseados em propriedades com sucesso absoluto no módulo financeiro (100% passados).

