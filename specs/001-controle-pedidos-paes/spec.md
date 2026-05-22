# Feature Specification: Controle de Pedidos de Pão Caseiro

**Feature Branch**: `001-controle-pedidos-paes`

**Created**: 2026-05-22

**Status**: Draft

**Input**: User description: "quero criar um sistema de controle de pedidos de pão caseiro que tem a algumas versões, sabores e modelos. Teremos entrega na grande vitória, agendamento de pedido, pedido recorrente, e controle financeiro dos pedidos, comprar e vendas. A a ideia é ele também ser um pwa, o trabalho na versão desktop e mobile deve ser muito bem alinhado."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Catálogo de Pães e Criação de Pedidos (Priority: P1) 🎯 MVP
Como cliente ou administrador, desejo visualizar o catálogo de pães (com suas diferentes versões, sabores e modelos) e criar um pedido com agendamento de data de entrega.

**Why this priority**: É a funcionalidade central de valor que inicia todo o fluxo do sistema. Sem a capacidade de listar os produtos e registrar um pedido, nenhuma outra funcionalidade pode operar.

**Independent Test**: Pode ser testado de ponta a ponta criando um novo pedido contendo um pão caseiro de determinado sabor/modelo, definindo uma data futura para agendamento de entrega e verificando se o registro do pedido foi criado com sucesso no banco de dados e aparece na lista.

**Acceptance Scenarios**:
1. **Given** que o catálogo possui "Pão Tradicional - Médio - Sabor Integral" e "Pão Recheado - Grande - Sabor Frango com Requeijão", **When** o usuário acessa a página inicial, **Then** ele deve ver a listagem clara dos pães com suas respectivas versões, sabores e modelos.
2. **Given** que o usuário está criando um pedido, **When** ele seleciona os itens, escolhe a data e hora de entrega futura (agendamento) e confirma, **Then** o pedido deve ser salvo no estado "Pendente" com a data e hora agendadas corretas.

---

### User Story 2 - Agendamento, Entregas na Grande Vitória e Recorrência (Priority: P2)
Como cliente ou administrador, desejo configurar regras de entrega para a região da Grande Vitória e criar pedidos de caráter recorrente para clientes assíduos.

**Why this priority**: Adiciona as regras logísticas críticas solicitadas e automatiza a geração de pedidos recorrentes, reduzindo o trabalho manual do produtor.

**Independent Test**: Testar a criação de um pedido recorrente de frequência semanal para um endereço em Vila Velha. Verificar se o sistema calcula a taxa de entrega adequada e gera automaticamente o próximo pedido da série na data correspondente.

**Acceptance Scenarios**:
1. **Given** que o endereço de entrega do cliente é no município de Vila Velha, **When** o pedido é configurado para entrega, **Then** o sistema deve validar e aplicar a taxa de entrega cadastrada para Vila Velha (conforme a tabela de taxas definidas por município: Vitória, Vila Velha e Serra).
2. **Given** que o cliente assinou um plano de pão semanal, **When** a rotina de recorrência é acionada, **Then** o sistema deve gerar automaticamente um novo pedido no estado "Rascunho" para revisão e aprovação manual do administrador.

---

### User Story 3 - Controle Financeiro de Compras e Vendas (Priority: P3)
Como administrador (produtor), desejo registrar as compras de insumos e as receitas de vendas de pedidos para acompanhar o fluxo de caixa, custos e faturamento real do negócio.

**Why this priority**: Permite a gestão financeira essencial do negócio, calculando a margem de lucro real de cada venda a partir dos custos de produção (compras) e do faturamento (vendas).

**Independent Test**: Inserir uma despesa de compra de insumos (ex: R$ 50,00 de farinha) e efetuar uma venda de R$ 80,00. Verificar se o painel financeiro calcula corretamente o lucro bruto de R$ 30,00 no período selecionado.

**Acceptance Scenarios**:
1. **Given** que o administrador deseja registrar um gasto, **When** ele insere uma compra informando a descrição do gasto, categoria e o valor total, **Then** o sistema deve registrar a transação de despesa no fluxo de caixa simples (sem controle físico de estoque de insumos).
2. **Given** que múltiplos pedidos foram concluídos com sucesso, **When** o administrador acessa o fluxo financeiro, **Then** o faturamento acumulado desses pedidos deve ser somado como receita de vendas.

---

### Edge Cases
- **Agendamento no passado**: O sistema deve rejeitar tentativas de agendar entregas em datas ou horários anteriores ao momento atual.
- **Queda de conexão no PWA**: O PWA deve ser capaz de salvar novos rascunhos de pedidos offline e sincronizá-los com o Neon Postgres assim que a conexão de internet for restaurada.
- **Limite de capacidade de produção diária**: O sistema deve alertar o cliente/administrador se o limite diário de pães assados para uma determinada data agendada for atingido.

## Requirements *(mandatory)*

### Functional Requirements
- **FR-001**: O sistema MUST permitir o cadastro e exibição do catálogo de pães organizados por versões (ex: tradicional, recheado), sabores (ex: integral, calabresa) e modelos/tamanhos (ex: mini, médio, grande).
- **FR-002**: O sistema MUST permitir a criação de pedidos agendados para datas futuras selecionadas via calendário.
- **FR-003**: O sistema MUST ser implementado como PWA (Progressive Web App), oferecendo suporte offline para visualização do catálogo e salvamento de rascunhos de pedidos, com manifest e service workers configurados.
- **FR-004**: A interface gráfica MUST ser totalmente responsiva (Mobile-First) e oferecer uma experiência visual altamente premium e unificada entre dispositivos móveis e desktops, utilizando Vanilla CSS avançado de acordo com a Constituição.
- **FR-005**: O sistema MUST suportar regras de entrega para a região da Grande Vitória (Vitória, Vila Velha, Serra, Cariacica, Viana).
- **FR-006**: O sistema MUST gerar automaticamente ou permitir o agendamento de pedidos recorrentes.
- **FR-007**: O sistema MUST fornecer um módulo de controle financeiro composto por:
  - Registro de receitas provenientes das vendas de pães.
  - Registro de despesas com compras de insumos e embalagens.
  - Painel de fluxo de caixa (Lucro = Vendas - Compras).

### Key Entities

- **Produto (Pão)**: Representa o item do catálogo. Possui nome, descrição, versão, sabor, modelo/tamanho e preço base de venda.
- **Pedido**: Representa uma solicitação de compra. Contém cliente, produtos selecionados, quantidades, tipo de agendamento, endereço de entrega na Grande Vitória, valor total, taxa de entrega, status (Pendente, Agendado, Entregue, Cancelado) e sinalização se é recorrente.
- **Transação Financeira**: Representa movimentações de entrada e saída. Contém tipo (Entrada/Venda ou Saída/Compra), valor, data, descrição e vínculo com Pedido (para vendas).

## Success Criteria *(mandatory)*

### Measurable Outcomes
- **SC-001**: O usuário deve conseguir cadastrar ou agendar um novo pedido em menos de 1 minuto em dispositivos móveis e desktop.
- **SC-002**: O PWA deve carregar instantaneamente (< 2 segundos) em conexões 3G estáveis e inicializar com suporte offline completo após o primeiro carregamento.
- **SC-003**: 100% dos pedidos recorrentes programados devem ser gerados e listados na data correspondente de forma automatizada pelo servidor.
- **SC-004**: O painel de controle financeiro deve refletir de forma precisa a consolidação de receitas e despesas instantaneamente ao alterar o status de um pedido para "Entregue" ou adicionar uma compra.

## Assumptions
- O sistema será implantado na Vercel Hobby utilizando Serverless Functions no backend (Node.js/TypeScript em `api/`), respeitando o limite de 10 segundos de timeout.
- A persistência resiliente a falhas e a reatividade serão gerenciadas via Neon Postgres.
- A entrega na Grande Vitória cobrirá Vitória, Vila Velha, Serra.
- A empresa dos pães se chama Bemavi
