-- Migração: Criação da Estrutura de Consignações de Pães
-- Data de Criação: 2026-05-22
-- Alvo: Neon Postgres (AWS sa-east-1)

-- 1. Criação da Tabela de Consignações (Cabeçalho)
CREATE TABLE IF NOT EXISTS consignacoes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    amigo_nome VARCHAR(200) NOT NULL,
    amigo_telefone VARCHAR(50),
    data_envio DATE NOT NULL DEFAULT CURRENT_DATE,
    data_acerto DATE,
    status VARCHAR(20) NOT NULL DEFAULT 'Aberto' CHECK (status IN ('Aberto', 'Fechado')),
    observacao TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Criação da Tabela de Itens de Consignação (Relacionamento N-N com Produtos)
CREATE TABLE IF NOT EXISTS itens_consignacao (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    consignacao_id UUID NOT NULL REFERENCES consignacoes(id) ON DELETE CASCADE,
    produto_id UUID NOT NULL REFERENCES produtos(id) ON DELETE RESTRICT,
    quantidade_deixada INTEGER NOT NULL CHECK (quantidade_deixada > 0),
    quantidade_vendida INTEGER DEFAULT 0 CHECK (quantidade_vendida >= 0),
    preco_unitario DECIMAL(10, 2) NOT NULL CHECK (preco_unitario >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Alteração da Tabela transacoes_financeiras para suportar vínculo com consignações
ALTER TABLE transacoes_financeiras 
ADD COLUMN IF NOT EXISTS consignacao_id UUID REFERENCES consignacoes(id) ON DELETE SET NULL;

-- 4. Criação de Índices para Otimização
CREATE INDEX IF NOT EXISTS idx_consignacoes_status ON consignacoes(status);
CREATE INDEX IF NOT EXISTS idx_consignacoes_data_envio ON consignacoes(data_envio);
CREATE INDEX IF NOT EXISTS idx_itens_consignacao_consignacao ON itens_consignacao(consignacao_id);
CREATE INDEX IF NOT EXISTS idx_transacoes_consignacao ON transacoes_financeiras(consignacao_id);

-- 5. Trigger para Atualização Automática de updated_at
DROP TRIGGER IF EXISTS set_timestamp_consignacoes ON consignacoes;
CREATE TRIGGER set_timestamp_consignacoes
BEFORE UPDATE ON consignacoes
FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();
