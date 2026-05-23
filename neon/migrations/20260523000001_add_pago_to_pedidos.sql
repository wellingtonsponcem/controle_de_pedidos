-- Migração: Adição de colunas para controle de pagamento antecipado em pedidos
-- Data de Criação: 2026-05-23
-- Alvo: Neon Postgres (AWS sa-east-1)

-- 1. Adicionar colunas de controle de pagamento na tabela pedidos
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS pago BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS data_pagamento TIMESTAMP WITH TIME ZONE NULL;

-- 2. Atualizar registros antigos para falso por garantia
UPDATE pedidos SET pago = FALSE WHERE pago IS NULL;
