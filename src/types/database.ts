export type UserRole = "admin" | "manager" | "cashier" | "waiter";

export type StockMovementType =
  | "purchase_in"
  | "manual_in"
  | "sale_out"
  | "order_out"
  | "loss_waste"
  | "loss_damage"
  | "inventory_adjustment"
  | "ENTRADA"
  | "SAIDA"
  | "VENDA"
  | "PERDA"
  | "AJUSTE"
  | "ESTORNO";

export type PaymentMethod = 
  | "cash" 
  | "pix" 
  | "debit_card" 
  | "credit_card" 
  | "other"
  | "DINHEIRO"
  | "PIX"
  | "CARTAO_DEBITO"
  | "CARTAO_CREDITO"
  | "FIADO"
  | "OUTRO";

export type OrderStatus =
  | "draft"
  | "sent"
  | "received_cashier"
  | "confirmed"
  | "cancelled"
  | "completed"
  | "PENDENTE"
  | "PREPARANDO"
  | "ENTREGUE"
  | "CANCELADO";

export type TabStatus = "open" | "closing_requested" | "closed" | "cancelled" | "ABERTA" | "FECHADA";

export type TableStatus =
  | "available"
  | "occupied"
  | "order_pending"
  | "closing_requested"
  | "payment_in_progress";

export interface Company {
  id: string;
  name: string;
  trade_name: string;
  document?: string;
  phone?: string;
  address?: string;
  allow_negative_stock: boolean;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  created_at: string;
}

export interface CompanyMember {
  id: string;
  company_id: string;
  user_id: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
}

export interface Category {
  id: string;
  company_id: string;
  name: string;
  color_code: string;
  is_active: boolean;
  created_at: string;
}

export interface Supplier {
  id: string;
  company_id: string;
  name: string;
  trade_name?: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  notes?: string;
  is_active: boolean;
  created_at: string;
}

export interface Product {
  id: string;
  company_id: string;
  category_id?: string;
  category_name?: string;
  supplier_id?: string;
  name: string;
  description?: string;
  sku?: string;
  barcode?: string;
  unit: string;
  cost_price: number;
  sale_price?: number;
  selling_price?: number;
  current_stock: number;
  min_stock: number;
  image_url?: string;
  is_active?: boolean;
  active?: boolean;
  created_at: string;
  updated_at: string;
  category?: Category;
  // Configurações de Embalagem & Múltiplos Códigos
  box_enabled?: boolean;
  box_units?: number;
  box_price?: number;
  box_barcodes?: string[];
  secondary_barcodes?: string[];
}

export interface StockMovement {
  id: string;
  company_id: string;
  product_id: string;
  type?: StockMovementType;
  movement_type?: string;
  quantity: number;
  previous_stock: number;
  new_stock: number;
  unit_cost?: number;
  cost_price?: number;
  reference_id?: string;
  notes?: string;
  created_by?: string;
  created_at: string;
  product?: Product;
  products?: {
    name?: string;
    barcode?: string;
    unit?: string;
  };
}

export interface DiningTable {
  id: string;
  company_id: string;
  table_number: string;
  name?: string;
  status: TableStatus;
  created_at: string;
}

export interface Tab {
  id: string;
  company_id: string;
  tab_number?: string;
  tab_identifier?: string;
  table_id?: string;
  customer_name?: string;
  waiter_id?: string;
  status: TabStatus;
  total_amount?: number;
  accumulated_amount?: number;
  discount_amount?: number;
  final_amount?: number;
  opened_at: string;
  closed_at?: string;
  table?: DiningTable;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  product_name?: string;
  unit_price: number;
  quantity: number;
  subtotal?: number;
  total_price?: number;
  notes?: string;
  products?: {
    name?: string;
    barcode?: string;
    unit?: string;
  };
}

export interface Order {
  id: string;
  company_id: string;
  tab_id?: string;
  table_id?: string;
  table_number?: string;
  destination_type?: string;
  customer_name?: string;
  waiter_id?: string;
  waiter_name?: string;
  order_number?: number;
  status: OrderStatus;
  total_amount: number;
  notes?: string;
  stock_deducted?: boolean;
  created_at: string;
  confirmed_at?: string;
  items?: OrderItem[];
  order_items?: OrderItem[];
  waiter?: Profile;
  table?: DiningTable;
}

export interface SalePayment {
  id: string;
  sale_id: string;
  method: PaymentMethod;
  amount: number;
}

export interface SaleItem {
  id: string;
  sale_id: string;
  product_id: string;
  product_name?: string;
  unit_cost?: number;
  unit_price: number;
  quantity: number;
  subtotal?: number;
  total_price?: number;
  products?: {
    name?: string;
    barcode?: string;
  };
}

export interface Sale {
  id: string;
  company_id: string;
  session_id?: string;
  tab_id?: string;
  sale_number?: number;
  sale_type?: string;
  payment_method?: PaymentMethod;
  subtotal_amount?: number;
  discount_amount: number;
  total_amount: number;
  final_amount: number;
  change_amount?: number;
  operator_id?: string;
  status: string;
  idempotency_key?: string;
  created_at: string;
  items?: SaleItem[];
  sale_items?: SaleItem[];
  payments?: SalePayment[];
}

export interface CashMovement {
  id: string;
  company_id: string;
  session_id: string;
  movement_type: "SANGRIA" | "SUPRIMENTO" | "initial_supply" | "sale" | "supply" | "bleed" | "refund";
  payment_method?: PaymentMethod;
  amount: number;
  notes?: string;
  reason?: string;
  reference_id?: string;
  created_by?: string;
  created_at: string;
}

export interface CashSession {
  id: string;
  company_id: string;
  cash_register_id?: string;
  terminal_number?: number;
  operator_id?: string;
  initial_amount?: number;
  opening_balance?: number;
  opened_at: string;
  closed_at?: string;
  total_cash_sales?: number;
  total_pix_sales?: number;
  total_debit_sales?: number;
  total_credit_sales?: number;
  total_bleeds?: number;
  total_supplies?: number;
  expected_cash_amount?: number;
  actual_cash_amount?: number;
  closing_expected_balance?: number;
  closing_actual_balance?: number;
  closing_difference?: number;
  difference_amount?: number;
  notes?: string;
  status: "open" | "closed" | "ABERTA" | "FECHADA";
}

export interface PrinterSettings {
  id: string;
  company_id: string;
  printer_name: string;
  paper_width: "58mm" | "80mm";
  connection_type: "browser" | "local_agent" | "network";
  local_agent_url: string;
  header_text: string;
  footer_text: string;
  auto_print: boolean;
  copies_count: number;
}
