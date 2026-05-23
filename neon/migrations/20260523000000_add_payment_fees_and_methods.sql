-- Migração: Criação de taxas de maquininha e colunas de controle financeiro líquido nos pedidos
-- Data de Criação: 2026-05-23
-- Alvo: Neon Postgres (AWS sa-east-1)

-- 1. Criação da Tabela de Taxas de Maquininha
CREATE TABLE IF NOT EXISTS taxas_maquininha (
    meio_pagamento VARCHAR(20) PRIMARY KEY CHECK (meio_pagamento IN ('Dinheiro', 'PIX', 'Débito', 'Crédito')),
    porcentagem_taxa DECIMAL(5, 2) NOT NULL CHECK (porcentagem_taxa >= 0 AND porcentagem_taxa <= 100),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. População de Valores Iniciais Padrões (Débito inicializado em 2,27% conforme relato de R$ 30,00 -> R$ 29,32 líquido)
INSERT INTO taxas_maquininha (meio_pagamento, porcentagem_taxa) VALUES
('Dinheiro', 0.00),
('PIX', 0.00),
('Débito', 2.27),
('Crédito', 3.99)
ON CONFLICT (meio_pagamento) DO UPDATE 
SET porcentagem_taxa = EXCLUDED.porcentagem_taxa;

-- 3. Adicionar Colunas na Tabela de Pedidos
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS meio_pagamento VARCHAR(20) CHECK (meio_pagamento IN ('Dinheiro', 'PIX', 'Débito', 'Crédito'));
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS valor_liquido DECIMAL(10, 2) CHECK (valor_liquido >= 0);

-- 4. Criação da Trigger para Atualização Automática de updated_at
DROP TRIGGER IF EXISTS set_timestamp_taxas_maquininha ON taxas_maquininha;
CREATE TRIGGER set_timestamp_taxas_maquininha
BEFORE UPDATE ON taxas_maquininha
FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();
