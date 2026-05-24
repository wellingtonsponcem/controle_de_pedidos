-- Adiciona URL de imagem aos produtos do catalogo publico.
ALTER TABLE produtos
ADD COLUMN IF NOT EXISTS imagem_url TEXT;
