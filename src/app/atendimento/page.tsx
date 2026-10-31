'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { 
  Wine, 
  Search, 
  Plus, 
  Minus, 
  Trash2, 
  Send, 
  ShoppingBag, 
  CheckCircle2, 
  User, 
  Sparkles
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency } from '@/lib/utils';
import { Product, Tab } from '@/types/database';

interface CartItem {
  product: Product;
  quantity: number;
  notes: string;
}

export default function AtendimentoPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [openTabs, setOpenTabs] = useState<Tab[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  // Destino
  const [destinationType, setDestinationType] = useState<'COMANDA' | 'MESA' | 'AVULSO'>('MESA');
  const [tableNumber, setTableNumber] = useState<string>('1');
  const [selectedTabId, setSelectedTabId] = useState<string>('');
  const [customerName, setCustomerName] = useState<string>('');
  const [waiterName, setWaiterName] = useState<string>('');

  // Carrinho Mobile
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [sendingOrder, setSendingOrder] = useState(false);
  const [successMessage, setSuccessMessage] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    loadData();
    const savedWaiter = localStorage.getItem('adega_mauricio_waiter_name') || localStorage.getItem('adega_mauri_waiter_name');
    if (savedWaiter) setWaiterName(savedWaiter);
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [prodRes, tabRes] = await Promise.all([
        fetch('/api/products').then(res => res.json()).catch(() => ({ products: [] })),
        fetch('/api/tabs').then(res => res.json()).catch(() => ({ tabs: [] }))
      ]);

      if (prodRes.products) {
        setProducts(prodRes.products.filter((p: any) => p.active !== false && p.is_active !== false));
      }
      if (tabRes.tabs) setOpenTabs(tabRes.tabs);
    } catch (err) {
      console.error('Erro ao carregar dados:', err);
    } finally {
      setLoading(false);
    }
  }

  function handleWaiterChange(name: string) {
    setWaiterName(name);
    localStorage.setItem('adega_mauricio_waiter_name', name);
  }

  function addToCart(product: Product) {
    setCart((prev) => {
      const existing = prev.find(item => item.product.id === product.id);
      if (existing) {
        return prev.map(item => 
          item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { product, quantity: 1, notes: '' }];
    });
  }

  function updateQuantity(productId: string, delta: number) {
    setCart((prev) => 
      prev.map(item => {
        if (item.product.id === productId) {
          const newQty = item.quantity + delta;
          return newQty > 0 ? { ...item, quantity: newQty } : null;
        }
        return item;
      }).filter(Boolean) as CartItem[]
    );
  }

  function updateNotes(productId: string, notes: string) {
    setCart((prev) => 
      prev.map(item => item.product.id === productId ? { ...item, notes } : item)
    );
  }

  const cartTotal = cart.reduce((acc, item) => acc + (Number(item.product.selling_price ?? item.product.sale_price ?? 0) * item.quantity), 0);
  const cartTotalItems = cart.reduce((acc, item) => acc + item.quantity, 0);

  async function handleSendOrder() {
    if (cart.length === 0) return;
    if (!waiterName.trim()) {
      alert('Informe o seu nome de Atendente/Garçom para identificar o pedido.');
      return;
    }

    setSendingOrder(true);
    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destination_type: destinationType,
          table_number: destinationType === 'MESA' ? tableNumber : null,
          tab_id: destinationType === 'COMANDA' ? selectedTabId || null : null,
          customer_name: customerName || null,
          waiter_name: waiterName,
          items: cart.map(item => ({
            product_id: item.product.id,
            product_name: item.product.name,
            quantity: item.quantity,
            unit_price: Number(item.product.selling_price ?? item.product.sale_price ?? 0),
            notes: item.notes || null
          }))
        })
      });

      const resData = await response.json();
      if (!response.ok || resData.error) {
        throw new Error(resData.error || 'Erro ao enviar pedido');
      }

      setCart([]);
      setIsCartOpen(false);
      setSuccessMessage(true);
      setTimeout(() => setSuccessMessage(false), 4000);
      loadData();
    } catch (err: any) {
      alert('Falha ao enviar pedido para o caixa: ' + err.message);
    } finally {
      setSendingOrder(false);
    }
  }

  const categories = ['ALL', ...Array.from(new Set(products.map(p => p.category_name).filter(Boolean)))];

  const filteredProducts = products.filter(p => {
    const term = searchTerm.toLowerCase();
    const matchesSearch = p.name.toLowerCase().includes(term) || (p.barcode || '').includes(term);
    const matchesCategory = selectedCategory === 'ALL' || p.category_name === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 flex flex-col max-w-md mx-auto relative shadow-2xl border-x border-amber-950/60 pb-24">
      {/* HEADER MOBILE TOUCH ÂMBAR COM LOGO OFICIAL */}
      <header className="sticky top-0 z-40 bg-stone-900/95 backdrop-blur-md border-b border-amber-950/80 p-4 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-3">
          <div className="relative w-10 h-10 rounded-2xl overflow-hidden border border-amber-500/40 shadow-md shadow-amber-950/60 bg-stone-900 shrink-0">
            <Image
              src="/logo.jpg"
              alt="Adega de Mauricio"
              fill
              className="object-cover"
              sizes="40px"
              priority
            />
          </div>
          <div>
            <h1 className="text-base font-extrabold text-white leading-tight">ADEGA DE MAURICIO</h1>
            <span className="text-[11px] text-amber-400 font-bold">App do Atendente</span>
          </div>
        </div>

        <a
          href="/dashboard"
          className="text-xs bg-stone-800 hover:bg-stone-700 text-stone-300 px-3 py-1.5 rounded-xl font-bold transition-colors border border-stone-700"
        >
          Painel Web
        </a>
      </header>

      {/* IDENTIFICAÇÃO DO ATENDENTE & DESTINO */}
      <div className="p-4 space-y-3 bg-stone-900/40 border-b border-amber-950/60">
        <div className="flex items-center gap-2">
          <User className="w-4 h-4 text-amber-400" />
          <input
            type="text"
            placeholder="Seu nome (Atendente)..."
            value={waiterName}
            onChange={(e) => handleWaiterChange(e.target.value)}
            className="flex-1 bg-stone-900 border border-stone-800 rounded-xl px-3 py-2 text-xs text-white placeholder:text-stone-500 focus:outline-none focus:border-amber-500"
          />
        </div>

        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => setDestinationType('MESA')}
            className={`py-2 text-xs font-black rounded-xl border transition-all cursor-pointer ${
              destinationType === 'MESA' 
                ? 'bg-amber-500 text-stone-950 border-amber-400 shadow-md shadow-amber-950/60' 
                : 'bg-stone-900 text-stone-400 border-stone-800'
            }`}
          >
            Mesa
          </button>
          <button
            type="button"
            onClick={() => setDestinationType('COMANDA')}
            className={`py-2 text-xs font-black rounded-xl border transition-all cursor-pointer ${
              destinationType === 'COMANDA' 
                ? 'bg-amber-500 text-stone-950 border-amber-400 shadow-md shadow-amber-950/60' 
                : 'bg-stone-900 text-stone-400 border-stone-800'
            }`}
          >
            Comanda
          </button>
          <button
            type="button"
            onClick={() => setDestinationType('AVULSO')}
            className={`py-2 text-xs font-black rounded-xl border transition-all cursor-pointer ${
              destinationType === 'AVULSO' 
                ? 'bg-amber-500 text-stone-950 border-amber-400 shadow-md shadow-amber-950/60' 
                : 'bg-stone-900 text-stone-400 border-stone-800'
            }`}
          >
            Balcão
          </button>
        </div>

        {destinationType === 'MESA' && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-stone-400 font-bold">Nº da Mesa:</span>
            <input
              type="text"
              value={tableNumber}
              onChange={(e) => setTableNumber(e.target.value)}
              placeholder="Ex: 01, 04, VIP"
              className="flex-1 bg-stone-900 border border-stone-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
            />
          </div>
        )}

        {destinationType === 'COMANDA' && (
          <div>
            <select
              value={selectedTabId}
              onChange={(e) => setSelectedTabId(e.target.value)}
              className="w-full bg-stone-900 border border-stone-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
            >
              <option value="">Selecione a Comanda Aberta...</option>
              {openTabs.map(t => (
                <option key={t.id} value={t.id}>
                  {t.tab_identifier || t.tab_number} {t.customer_name ? `(${t.customer_name})` : ''} - {formatCurrency(Number(t.accumulated_amount || 0))}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* FEEDBACK DE SUCESSO */}
      {successMessage && (
        <div className="m-4 p-3.5 bg-amber-500/20 border border-amber-500/40 rounded-2xl flex items-center gap-2 text-amber-300 text-xs font-black shadow-lg">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-amber-400" />
          Pedido enviado com sucesso para o Caixa!
        </div>
      )}

      {/* BUSCA E CATEGORIAS */}
      <div className="p-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500" />
          <input
            type="text"
            placeholder="Buscar produto ou bebida gelada..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-stone-900 border border-stone-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder:text-stone-500 focus:outline-none focus:border-amber-500 shadow-inner"
          />
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat || 'ALL')}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors cursor-pointer ${
                selectedCategory === cat 
                  ? 'bg-amber-500 text-stone-950 font-black shadow-md shadow-amber-950/60' 
                  : 'bg-stone-900 text-stone-400 border border-stone-800'
              }`}
            >
              {cat === 'ALL' ? 'Todas' : cat}
            </button>
          ))}
        </div>
      </div>

      {/* LISTA DE PRODUTOS */}
      <div className="flex-1 px-4 space-y-2.5">
        {loading ? (
          <div className="py-16 text-center text-stone-500 text-xs">Carregando cardápio...</div>
        ) : filteredProducts.length === 0 ? (
          <div className="py-16 text-center text-stone-500 text-xs">Nenhum produto encontrado.</div>
        ) : (
          filteredProducts.map(p => {
            const inCart = cart.find(i => i.product.id === p.id);
            const price = p.selling_price ?? p.sale_price ?? 0;
            return (
              <div 
                key={p.id}
                onClick={() => addToCart(p)}
                className="bg-stone-900/80 hover:bg-stone-900 border border-stone-800/80 hover:border-amber-500/40 active:scale-[0.98] transition-all p-3.5 rounded-2xl flex items-center justify-between shadow-md cursor-pointer"
              >
                <div className="flex-1 pr-2">
                  <div className="text-sm font-bold text-white leading-tight">{p.name}</div>
                  <div className="text-xs font-black text-amber-400 font-mono mt-1">
                    {formatCurrency(Number(price))}
                  </div>
                  <div className="text-[10px] text-stone-500 font-mono mt-0.5">
                    Estoque: {p.current_stock} {p.unit}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {inCart && (
                    <span className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-black flex items-center justify-center font-mono">
                      {inCart.quantity}
                    </span>
                  )}
                  <button
                    type="button"
                    className="w-9 h-9 rounded-xl bg-stone-800 hover:bg-amber-500 text-stone-300 hover:text-stone-950 flex items-center justify-center transition-colors cursor-pointer"
                  >
                    <Plus className="w-4 h-4 stroke-[2.5]" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* BARRA FIXA INFERIOR DO CARRINHO */}
      {cart.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto p-4 z-40 bg-gradient-to-t from-stone-950 via-stone-950 to-transparent">
          <button
            onClick={() => setIsCartOpen(true)}
            className="w-full bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-stone-950 p-4 rounded-2xl flex items-center justify-between shadow-2xl shadow-amber-950/80 font-black text-sm active:scale-[0.99] transition-transform cursor-pointer border border-amber-300/40"
          >
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 stroke-[2.5]" />
              <span>{cartTotalItems} {cartTotalItems === 1 ? 'item' : 'itens'}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono">{formatCurrency(cartTotal)}</span>
              <span className="text-xs bg-stone-950/80 text-amber-300 px-2 py-0.5 rounded-lg border border-amber-400/30">Ver Comanda</span>
            </div>
          </button>
        </div>
      )}

      {/* DRAWER / MODAL DO CARRINHO */}
      {isCartOpen && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex flex-col justify-end">
          <div className="bg-stone-950 border-t border-amber-900/60 rounded-t-3xl max-h-[85vh] flex flex-col max-w-md mx-auto w-full shadow-2xl animate-in slide-in-from-bottom duration-200">
            <div className="p-4 border-b border-stone-800 flex items-center justify-between">
              <div>
                <h3 className="text-base font-black text-white flex items-center gap-2">
                  <ShoppingBag className="w-5 h-5 text-amber-400" />
                  Confirmar Pedido
                </h3>
                <span className="text-xs text-stone-400">
                  Destino: <strong className="text-amber-400">{destinationType} {destinationType === 'MESA' ? tableNumber : ''}</strong>
                </span>
              </div>
              <button onClick={() => setIsCartOpen(false)} className="text-stone-400 hover:text-white p-1 text-sm font-bold">✕</button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {cart.map(item => {
                const price = item.product.selling_price ?? item.product.sale_price ?? 0;
                return (
                  <div key={item.product.id} className="bg-stone-900 border border-stone-800 p-3 rounded-2xl space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-bold text-white">{item.product.name}</div>
                        <div className="text-xs text-amber-400 font-mono font-bold">
                          {formatCurrency(Number(price))} un
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => updateQuantity(item.product.id, -1)}
                          className="w-7 h-7 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 flex items-center justify-center cursor-pointer"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="font-mono font-black text-sm text-amber-300 w-5 text-center">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => updateQuantity(item.product.id, 1)}
                          className="w-7 h-7 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 flex items-center justify-center cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <input
                      type="text"
                      placeholder="Obs (ex: bem gelada, sem gelo)..."
                      value={item.notes}
                      onChange={(e) => updateNotes(item.product.id, e.target.value)}
                      className="w-full bg-stone-950 border border-stone-800 rounded-xl px-2.5 py-1 text-xs text-white placeholder:text-stone-500 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                );
              })}
            </div>

            <div className="p-4 border-t border-stone-800 bg-stone-900/60 space-y-3">
              <div className="flex items-center justify-between text-base font-black text-white">
                <span>Total do Pedido:</span>
                <span className="text-amber-400 font-mono text-xl">{formatCurrency(cartTotal)}</span>
              </div>

              <button
                onClick={handleSendOrder}
                disabled={sendingOrder}
                className="w-full bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-stone-950 py-3.5 rounded-2xl font-black text-sm flex items-center justify-center gap-2 shadow-xl shadow-amber-950/60 border border-amber-300/40 cursor-pointer disabled:opacity-50"
              >
                <Send className="w-4 h-4 stroke-[2.5]" />
                {sendingOrder ? 'Transmitindo Pedido...' : 'Enviar Pedido ao Caixa'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
