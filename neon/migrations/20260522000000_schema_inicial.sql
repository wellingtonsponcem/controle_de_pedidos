-- Migração Inicial: Criação da Estrutura de Banco de Dados Bemavi
-- Data de Criação: 2026-05-22
-- Alvo: Neon Postgres (AWS sa-east-1)

-- ============================================================================
-- 1. Habilitação de Extensões (se necessário)
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- 2. Remoção de Tabelas Antigas (para evitar conflitos em caso de reinstalação)
-- ============================================================================
DROP TABLE IF EXISTS transacoes_financeiras CASCADE;
DROP TABLE IF EXISTS itens_pedido CASCADE;
DROP TABLE IF EXISTS pedidos CASCADE;
DROP TABLE IF EXISTS clientes CASCADE;
DROP TABLE IF EXISTS taxas_entrega CASCADE;
DROP TABLE IF EXISTS produtos CASCADE;

-- ============================================================================
-- 3. Criação de Tabelas
-- ============================================================================

-- Tabela: Produtos (Catálogo de Pães da Bemavi)
CREATE TABLE produtos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nome VARCHAR(100) NOT NULL,
    versao VARCHAR(50) NOT NULL, -- ex: Tradicional, Recheado, Doce, Integral
    sabor VARCHAR(100) NOT NULL, -- ex: Trigo, Calabresa com Catupiry, Coco
    modelo VARCHAR(50) NOT NULL,  -- ex: Mini, Médio, Grande
    preco_base DECIMAL(10, 2) NOT NULL CHECK (preco_base >= 0),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabela: Taxas de Entrega por Município (Vitória, Vila Velha e Serra)
CREATE TABLE taxas_entrega (
    municipio VARCHAR(50) PRIMARY KEY CHECK (municipio IN ('Vitória', 'Vila Velha', 'Serra')),
    valor_taxa DECIMAL(10, 2) NOT NULL CHECK (valor_taxa >= 0),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabela: Clientes
CREATE TABLE clientes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nome VARCHAR(150) NOT NULL,
    telefone VARCHAR(20) NOT NULL,
    email VARCHAR(100),
    logradouro VARCHAR(200) NOT NULL,
    numero VARCHAR(20) NOT NULL,
    complemento VARCHAR(100),
    bairro VARCHAR(100) NOT NULL,
    municipio VARCHAR(50) NOT NULL CHECK (municipio IN ('Vitória', 'Vila Velha', 'Serra')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabela: Pedidos (Controle de Status, Logística e Agendamento)
CREATE TABLE pedidos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
    data_agendada TIMESTAMP WITH TIME ZONE NOT NULL,
    municipio_entrega VARCHAR(50) NOT NULL REFERENCES taxas_entrega(municipio),
    valor_produtos DECIMAL(10, 2) NOT NULL CHECK (valor_produtos >= 0),
    valor_entrega DECIMAL(10, 2) NOT NULL CHECK (valor_entrega >= 0),
    valor_total DECIMAL(10, 2) NOT NULL CHECK (valor_total >= 0),
    status VARCHAR(20) NOT NULL DEFAULT 'Rascunho' CHECK (status IN ('Rascunho', 'Pendente', 'Agendado', 'Entregue', 'Cancelado')),
    recorrente_flag BOOLEAN NOT NULL DEFAULT FALSE,
    recorrente_intervalo VARCHAR(20) CHECK (recorrente_intervalo IN ('Semanal', 'Quinzenal', 'Mensal')),
    observacao TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabela: Itens do Pedido (Vínculo de Produtos e Quantidades)
CREATE TABLE itens_pedido (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pedido_id UUID NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
    produto_id UUID NOT NULL REFERENCES produtos(id) ON DELETE RESTRICT,
    quantidade INTEGER NOT NULL CHECK (quantidade > 0),
    preco_unitario DECIMAL(10, 2) NOT NULL CHECK (preco_unitario >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabela: Transações Financeiras (Controle de Fluxo de Caixa Simples)
CREATE TABLE transacoes_financeiras (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tipo VARCHAR(10) NOT NULL CHECK (tipo IN ('Receita', 'Despesa')),
    valor DECIMAL(10, 2) NOT NULL CHECK (valor > 0),
    data DATE NOT NULL DEFAULT CURRENT_DATE,
    descricao VARCHAR(250) NOT NULL,
    categoria VARCHAR(50) NOT NULL, -- ex: Insumos, Embalagens, Venda de Pedido, Taxa de Entrega, Utilidades
    pedido_id UUID REFERENCES pedidos(id) ON DELETE SET NULL, -- Se for receita de um pedido específico
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 4. Criação de Índices de Performance
-- ============================================================================
CREATE INDEX idx_produtos_ativo ON produtos(ativo);
CREATE INDEX idx_pedidos_cliente ON pedidos(cliente_id);
CREATE INDEX idx_pedidos_data_agendada ON pedidos(data_agendada);
CREATE INDEX idx_pedidos_status ON pedidos(status);
CREATE INDEX idx_itens_pedido_pedido ON itens_pedido(pedido_id);
CREATE INDEX idx_transacoes_tipo_data ON transacoes_financeiras(tipo, data);
CREATE INDEX idx_transacoes_pedido ON transacoes_financeiras(pedido_id);

-- ============================================================================
-- 5. População de Dados Iniciais (Catálogo e Logística Bemavi)
-- ============================================================================

-- Inserção de Taxas de Entrega Iniciais
INSERT INTO taxas_entrega (municipio, valor_taxa) VALUES 
('Vitória', 8.00),
('Vila Velha', 10.00),
('Serra', 12.00);

-- Inserção de Catálogo Inicial de Pães Bemavi
INSERT INTO produtos (nome, versao, sabor, modelo, preco_base) VALUES
('Pão Tradicional Bemavi', 'Tradicional', 'Trigo Branco', 'Médio', 12.00),
('Pão Tradicional Bemavi', 'Tradicional', 'Trigo Branco', 'Grande', 18.00),
('Pão Integral Bemavi', 'Integral', 'Integral 100%', 'Médio', 15.00),
('Pão Integral Bemavi', 'Integral', 'Integral 100%', 'Grande', 22.00),
('Pão Recheado de Calabresa', 'Recheado', 'Calabresa com Catupiry', 'Grande', 25.00),
('Pão Recheado de Frango', 'Recheado', 'Frango com Requeijão', 'Grande', 25.00),
('Pão Doce de Coco', 'Doce', 'Coco Artesanal', 'Grande', 20.00);

-- ============================================================================
-- 6. Trigger para atualização automática do updated_at (opcional e recomendado)
-- ============================================================================
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_timestamp_produtos
BEFORE UPDATE ON produtos
FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();

CREATE TRIGGER set_timestamp_clientes
BEFORE UPDATE ON clientes
FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();

CREATE TRIGGER set_timestamp_pedidos
BEFORE UPDATE ON pedidos
FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();
