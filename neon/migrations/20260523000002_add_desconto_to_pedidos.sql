-- Migração: Adicionar coluna de desconto na tabela de pedidos
-- Autor: Antigravity
-- Data: 2026-05-23

ALTER TABLE pedidos ADD COLUMN desconto NUMERIC(10,2) NOT NULL DEFAULT 0.00;
