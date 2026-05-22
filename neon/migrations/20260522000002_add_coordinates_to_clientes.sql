-- Migração: Adição de Coordenadas de Geolocalização à Tabela de Clientes
-- Data de Criação: 2026-05-22

-- Adicionar colunas latitude e longitude para suporte a autocomplete de endereços Nominatim e roteador de e-bike
ALTER TABLE clientes 
ADD COLUMN IF NOT EXISTS latitude DECIMAL(10, 8),
ADD COLUMN IF NOT EXISTS longitude DECIMAL(11, 8);
