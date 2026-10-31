-- ==============================================================================
-- SISTEMA INTEGRADO ADEGA MAURI — BANCO DE DADOS POSTGRESQL / SUPABASE
-- PDV RÁPIDO, ESTOQUE, CAIXA, MESAS & COMANDAS, ATENDIMENTO PWA E REALTIME
-- ==============================================================================

-- 1. EXTENSÕES
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. ENUMS DE DOMÍNIO
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('admin', 'manager', 'cashier', 'waiter');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE stock_movement_type AS ENUM (
    'purchase_in', 'manual_in', 'sale_out', 'order_out', 'loss_waste', 
    'loss_damage', 'inventory_adjustment', 'ENTRADA', 'SAIDA', 'VENDA', 'PERDA', 'AJUSTE', 'ESTORNO'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payment_method AS ENUM (
    'cash', 'pix', 'debit_card', 'credit_card', 'other',
    'DINHEIRO', 'PIX', 'CARTAO_DEBITO', 'CARTAO_CREDITO', 'FIADO', 'OUTRO'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE order_status AS ENUM (
    'draft', 'sent', 'received_cashier', 'confirmed', 'cancelled', 'completed',
    'PENDENTE', 'PREPARANDO', 'ENTREGUE', 'CANCELADO'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE tab_status AS ENUM (
    'open', 'closing_requested', 'closed', 'cancelled', 'ABERTA', 'FECHADA'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE table_status AS ENUM (
    'available', 'occupied', 'order_pending', 'closing_requested', 'payment_in_progress'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE cash_movement_type AS ENUM (
    'initial_supply', 'sale', 'supply', 'bleed', 'refund', 'SANGRIA', 'SUPRIMENTO'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. EMPRESAS (MULTI-TENANT)
CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  trade_name VARCHAR(255) NOT NULL,
  document VARCHAR(20),
  phone VARCHAR(20),
  address TEXT,
  allow_negative_stock BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. PERFIS DE USUÁRIOS
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS company_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role user_role NOT NULL DEFAULT 'waiter',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, user_id)
);

-- 5. CATÁLOGO: CATEGORIAS, FORNECEDORES E PRODUTOS
CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  color_code VARCHAR(20) DEFAULT '#d97706',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  trade_name VARCHAR(255),
  contact_person VARCHAR(100),
  phone VARCHAR(20),
  email VARCHAR(100),
  notes TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  category_name VARCHAR(100),
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  sku VARCHAR(50),
  barcode VARCHAR(50),
  unit VARCHAR(20) DEFAULT 'un',
  cost_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  sale_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  selling_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  current_stock NUMERIC(12,3) NOT NULL DEFAULT 0,
  min_stock NUMERIC(12,3) NOT NULL DEFAULT 5,
  image_url TEXT,
  active BOOLEAN DEFAULT TRUE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(company_id, barcode);
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(company_id, sku);
CREATE INDEX IF NOT EXISTS idx_products_name ON products(company_id, name);

-- 6. GESTÃO DE ESTOQUE E AUDITORIA
CREATE TABLE IF NOT EXISTS stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  type VARCHAR(50),
  movement_type VARCHAR(50) NOT NULL,
  quantity NUMERIC(12,3) NOT NULL,
  previous_stock NUMERIC(12,3) NOT NULL,
  new_stock NUMERIC(12,3) NOT NULL,
  cost_price NUMERIC(12,2),
  unit_cost NUMERIC(12,2),
  reference_id UUID,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_created ON stock_movements(company_id, created_at DESC);

-- 7. CAIXA FINANCEIRO
CREATE TABLE IF NOT EXISTS cash_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  terminal_number INTEGER NOT NULL DEFAULT 1,
  cash_register_id UUID,
  operator_id UUID,
  opening_balance NUMERIC(12,2) NOT NULL DEFAULT 0,
  initial_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  opened_at TIMESTAMPTZ DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  closing_expected_balance NUMERIC(12,2),
  closing_actual_balance NUMERIC(12,2),
  closing_difference NUMERIC(12,2),
  expected_cash_amount NUMERIC(12,2),
  actual_cash_amount NUMERIC(12,2),
  difference_amount NUMERIC(12,2),
  notes TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'ABERTA'
);

CREATE TABLE IF NOT EXISTS cash_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES cash_sessions(id) ON DELETE CASCADE,
  movement_type VARCHAR(50) NOT NULL,
  type VARCHAR(50),
  payment_method VARCHAR(50) DEFAULT 'DINHEIRO',
  amount NUMERIC(12,2) NOT NULL,
  notes TEXT,
  reason TEXT,
  reference_id UUID,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. MESAS E COMANDAS
CREATE TABLE IF NOT EXISTS dining_tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  table_number VARCHAR(20) NOT NULL,
  name VARCHAR(50),
  status table_status NOT NULL DEFAULT 'available',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tabs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  tab_identifier VARCHAR(50) NOT NULL,
  tab_number VARCHAR(50),
  table_id UUID REFERENCES dining_tables(id) ON DELETE SET NULL,
  customer_name VARCHAR(100),
  waiter_id UUID,
  status VARCHAR(20) NOT NULL DEFAULT 'ABERTA',
  accumulated_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  final_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  opened_at TIMESTAMPTZ DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_tabs_status ON tabs(company_id, status);

-- 9. PEDIDOS EM TEMPO REAL (DO CELULAR PARA O CAIXA)
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  destination_type VARCHAR(20) NOT NULL DEFAULT 'MESA',
  table_number VARCHAR(20),
  tab_id UUID REFERENCES tabs(id) ON DELETE SET NULL,
  table_id UUID REFERENCES dining_tables(id) ON DELETE SET NULL,
  customer_name VARCHAR(100),
  waiter_name VARCHAR(100),
  waiter_id UUID,
  order_number SERIAL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDENTE',
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  stock_deducted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  product_name VARCHAR(255),
  unit_price NUMERIC(12,2) NOT NULL,
  quantity NUMERIC(12,3) NOT NULL DEFAULT 1,
  total_price NUMERIC(12,2) NOT NULL,
  subtotal NUMERIC(12,2),
  notes TEXT
);

-- 10. VENDAS DO PDV E FECHAMENTO COMERCIAL
CREATE SEQUENCE IF NOT EXISTS sale_number_seq;

CREATE TABLE IF NOT EXISTS sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  session_id UUID REFERENCES cash_sessions(id) ON DELETE SET NULL,
  tab_id UUID REFERENCES tabs(id) ON DELETE SET NULL,
  sale_number BIGINT NOT NULL DEFAULT nextval('sale_number_seq'),
  sale_type VARCHAR(30) NOT NULL DEFAULT 'BALCAO',
  payment_method VARCHAR(50) NOT NULL DEFAULT 'DINHEIRO',
  subtotal_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  final_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  change_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  customer_name VARCHAR(100),
  customer_cpf VARCHAR(20),
  operator_id UUID,
  status VARCHAR(20) NOT NULL DEFAULT 'CONCLUIDA',
  idempotency_key VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sale_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  product_name VARCHAR(255),
  cost_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  unit_cost NUMERIC(12,2) DEFAULT 0,
  unit_price NUMERIC(12,2) NOT NULL,
  quantity NUMERIC(12,3) NOT NULL,
  total_price NUMERIC(12,2) NOT NULL,
  subtotal NUMERIC(12,2)
);

CREATE TABLE IF NOT EXISTS sale_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  method VARCHAR(50) NOT NULL,
  amount NUMERIC(12,2) NOT NULL
);

-- 11. HABILITAR SUPABASE REALTIME NA TABELA DE PEDIDOS
ALTER PUBLICATION supabase_realtime ADD TABLE orders;

-- ==============================================================================
-- STORED PROCEDURES SEGURAS (SECURITY DEFINER)
-- ==============================================================================

-- PROCEDURE 1: FINALIZAR VENDA DIRETA NO PDV COM BAIXA ATÔMICA
CREATE OR REPLACE FUNCTION fn_process_sale(
  p_company_id UUID,
  p_sale_type VARCHAR,
  p_payment_method VARCHAR,
  p_total_amount NUMERIC,
  p_discount_amount NUMERIC,
  p_final_amount NUMERIC,
  p_customer_name VARCHAR DEFAULT NULL,
  p_customer_cpf VARCHAR DEFAULT NULL,
  p_items JSONB DEFAULT '[]'::jsonb
) RETURNS UUID AS $$
DECLARE
  v_sale_id UUID;
  v_item JSONB;
  v_prod RECORD;
  v_qty NUMERIC;
  v_prev_stock NUMERIC;
  v_new_stock NUMERIC;
BEGIN
  -- 1. Inserir venda mestre
  INSERT INTO sales (
    company_id, sale_type, payment_method, total_amount, subtotal_amount,
    discount_amount, final_amount, customer_name, customer_cpf, status
  ) VALUES (
    p_company_id, p_sale_type, p_payment_method, p_total_amount, p_total_amount,
    p_discount_amount, p_final_amount, p_customer_name, p_customer_cpf, 'CONCLUIDA'
  ) RETURNING id INTO v_sale_id;

  -- 2. Inserir pagamento
  INSERT INTO sale_payments (sale_id, method, amount)
  VALUES (v_sale_id, p_payment_method, p_final_amount);

  -- 3. Iterar itens, atualizar saldo e registrar auditoria
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty := (v_item->>'quantity')::NUMERIC;

    SELECT current_stock, cost_price, name INTO v_prod FROM products
    WHERE id = (v_item->>'product_id')::UUID
    FOR UPDATE;

    IF FOUND THEN
      v_prev_stock := v_prod.current_stock;
      v_new_stock := v_prev_stock - v_qty;

      UPDATE products SET current_stock = v_new_stock, updated_at = NOW()
      WHERE id = (v_item->>'product_id')::UUID;

      INSERT INTO stock_movements (
        company_id, product_id, movement_type, type, quantity,
        previous_stock, new_stock, cost_price, reference_id, notes
      ) VALUES (
        p_company_id, (v_item->>'product_id')::UUID, 'VENDA', 'sale_out', -v_qty,
        v_prev_stock, v_new_stock, v_prod.cost_price, v_sale_id, 'Venda Balcão PDV'
      );

      INSERT INTO sale_items (
        sale_id, product_id, product_name, cost_price, unit_price, quantity, total_price
      ) VALUES (
        v_sale_id, (v_item->>'product_id')::UUID, v_prod.name,
        COALESCE(v_prod.cost_price, 0), (v_item->>'unit_price')::NUMERIC, v_qty,
        (v_item->>'total_price')::NUMERIC
      );
    END IF;
  END LOOP;

  RETURN v_sale_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- PROCEDURE 2: CONFIRMAR PEDIDO RECEBIDO DO CELULAR COM BAIXA DE ESTOQUE
CREATE OR REPLACE FUNCTION fn_confirm_order_stock(
  p_order_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
  v_order RECORD;
  v_item RECORD;
  v_prod RECORD;
  v_prev_stock NUMERIC;
  v_new_stock NUMERIC;
BEGIN
  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado.';
  END IF;

  IF v_order.stock_deducted THEN
    RETURN TRUE;
  END IF;

  FOR v_item IN SELECT * FROM order_items WHERE order_id = p_order_id
  LOOP
    SELECT current_stock, cost_price, name INTO v_prod FROM products
    WHERE id = v_item.product_id FOR UPDATE;

    IF FOUND THEN
      v_prev_stock := v_prod.current_stock;
      v_new_stock := v_prev_stock - v_item.quantity;

      UPDATE products SET current_stock = v_new_stock, updated_at = NOW()
      WHERE id = v_item.product_id;

      INSERT INTO stock_movements (
        company_id, product_id, movement_type, type, quantity,
        previous_stock, new_stock, cost_price, reference_id, notes
      ) VALUES (
        v_order.company_id, v_item.product_id, 'VENDA', 'order_out', -v_item.quantity,
        v_prev_stock, v_new_stock, v_prod.cost_price, p_order_id, 'Confirmação Pedido Garçom'
      );
    END IF;
  END LOOP;

  -- Se o pedido for associado a uma comanda, incrementar o valor acumulado dela
  IF v_order.tab_id IS NOT NULL THEN
    UPDATE tabs 
    SET accumulated_amount = accumulated_amount + v_order.total_amount
    WHERE id = v_order.tab_id;
  END IF;

  UPDATE orders 
  SET status = 'ENTREGUE', stock_deducted = TRUE, confirmed_at = NOW()
  WHERE id = p_order_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- PROCEDURE 3: FECHAR COMANDA / MESA
CREATE OR REPLACE FUNCTION fn_close_tab(
  p_tab_id UUID,
  p_payment_method VARCHAR,
  p_company_id UUID
) RETURNS UUID AS $$
DECLARE
  v_tab RECORD;
  v_sale_id UUID;
BEGIN
  SELECT * INTO v_tab FROM tabs WHERE id = p_tab_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Comanda não encontrada.';
  END IF;

  INSERT INTO sales (
    company_id, tab_id, sale_type, payment_method, subtotal_amount,
    total_amount, final_amount, status
  ) VALUES (
    p_company_id, p_tab_id, 'COMANDA', p_payment_method, v_tab.accumulated_amount,
    v_tab.accumulated_amount, v_tab.accumulated_amount, 'CONCLUIDA'
  ) RETURNING id INTO v_sale_id;

  UPDATE tabs 
  SET status = 'FECHADA', closed_at = NOW(), final_amount = accumulated_amount
  WHERE id = p_tab_id;

  RETURN v_sale_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==============================================================================
-- DADOS INICIAIS (SEED) PARA COMEÇAR A USAR IMEDIATAMENTE
-- ==============================================================================
INSERT INTO companies (id, name, trade_name, phone, address, allow_negative_stock)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Adega e Deposito Mauri Ltda',
  'ADEGA MAURI',
  '(11) 99999-8888',
  'Av. Principal, 1000 - Deposito & Bebidas',
  TRUE
) ON CONFLICT (id) DO NOTHING;

-- CATEGORIAS INICIAIS
INSERT INTO categories (id, company_id, name, color_code)
VALUES 
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Cervejas Latas', '#d97706'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Cervejas Long Neck', '#b45309'),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Destilados & Whiskies', '#78350f'),
  ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'Refrigerantes & Sucos', '#0284c7'),
  ('10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', 'Gelo & Carvão', '#475569'),
  ('10000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001', 'Petiscos & Salgados', '#ca8a04')
ON CONFLICT (id) DO NOTHING;

-- PRODUTOS INICIAIS COM CÓDIGOS DE BARRAS REAIS
INSERT INTO products (
  company_id, category_id, category_name, name, barcode, sku, unit, 
  cost_price, sale_price, selling_price, current_stock, min_stock, active
)
VALUES
  ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Cervejas Latas', 'Heineken Lata 350ml', '7891991010856', 'HEIN-350', 'un', 3.80, 5.50, 5.50, 120, 24, TRUE),
  ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Cervejas Latas', 'Amstel Lata 350ml', '7891991010863', 'AMS-350', 'un', 2.90, 4.50, 4.50, 96, 24, TRUE),
  ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Cervejas Latas', 'Brahma Duplo Malte 350ml', '7891991010870', 'BRAH-DM', 'un', 3.10, 4.80, 4.80, 80, 20, TRUE),
  ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'Cervejas Long Neck', 'Corona Extra Long Neck 330ml', '7891991010887', 'COR-330', 'un', 5.50, 8.50, 8.50, 60, 12, TRUE),
  ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'Cervejas Long Neck', 'Stella Artois Long Neck 330ml', '7891991010894', 'STE-330', 'un', 5.00, 7.50, 7.50, 48, 12, TRUE),
  ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'Destilados & Whiskies', 'Whisky Red Label 1L', '5000267014005', 'RED-1L', 'un', 75.00, 110.00, 110.00, 15, 3, TRUE),
  ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'Destilados & Whiskies', 'Gin Tanqueray London Dry 750ml', '5000281005409', 'TANQ-750', 'un', 85.00, 129.90, 129.90, 10, 2, TRUE),
  ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'Destilados & Whiskies', 'Vodka Smirnoff 998ml', '7891991000123', 'SMIR-1L', 'un', 32.00, 48.00, 48.00, 20, 5, TRUE),
  ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000004', 'Refrigerantes & Sucos', 'Coca-Cola 2L Pet', '7894900011517', 'COCA-2L', 'un', 7.50, 11.00, 11.00, 40, 10, TRUE),
  ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000004', 'Refrigerantes & Sucos', 'Energético Red Bull 250ml', '9002490100070', 'REDB-250', 'un', 6.20, 9.50, 9.50, 72, 12, TRUE),
  ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000005', 'Gelo & Carvão', 'Saco de Gelo em Cubo 5kg', '7898901234567', 'GELO-5KG', 'pacote', 7.00, 14.00, 14.00, 30, 5, TRUE),
  ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000005', 'Gelo & Carvão', 'Carvão Vegetal 3kg', '7898907654321', 'CARV-3KG', 'saco', 12.00, 19.90, 19.90, 25, 4, TRUE)
ON CONFLICT DO NOTHING;

-- COMANDAS/MESAS INICIAIS DE TESTE
INSERT INTO tabs (company_id, tab_identifier, tab_number, customer_name, status, accumulated_amount)
VALUES 
  ('00000000-0000-0000-0000-000000000001', 'Mesa 01', '01', 'Mauri (VIP)', 'ABERTA', 0),
  ('00000000-0000-0000-0000-000000000001', 'Mesa 02', '02', 'Balcão', 'ABERTA', 0),
  ('00000000-0000-0000-0000-000000000001', 'Comanda 10', '10', 'Cliente Avulso', 'ABERTA', 0)
ON CONFLICT DO NOTHING;

-- ==============================================================================
-- 9. HABILITAÇÃO DO SUPABASE REALTIME (ATUALIZAÇÕES EM TEMPO REAL)
-- ==============================================================================
DO $$ 
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE orders;
EXCEPTION WHEN OTHERS THEN NULL; 
END $$;

DO $$ 
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE tabs;
EXCEPTION WHEN OTHERS THEN NULL; 
END $$;

DO $$ 
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE sales;
EXCEPTION WHEN OTHERS THEN NULL; 
END $$;

DO $$ 
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE stock_movements;
EXCEPTION WHEN OTHERS THEN NULL; 
END $$;
