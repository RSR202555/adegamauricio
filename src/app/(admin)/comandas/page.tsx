'use client';

import React, { useState, useEffect } from 'react';
import { 
  CreditCard, 
  Plus, 
  Search, 
  User, 
  DollarSign, 
  Clock, 
  CheckCircle2, 
  Receipt,
  FileText,
  AlertCircle,
  Eye,
  X,
  ShoppingBag
} from 'lucide-react';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import { Tab, PaymentMethod } from '@/types/database';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function ComandasPage() {
  const [tabs, setTabs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  // Modal de Nova Comanda
  const [isNewTabModalOpen, setIsNewTabModalOpen] = useState(false);
  const [tabIdentifier, setTabIdentifier] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [creating, setCreating] = useState(false);

  // Modal de Detalhes / Extrato de Consumo da Mesa
  const [viewingTab, setViewingTab] = useState<any | null>(null);

  // Modal de Fechamento de Comanda
  const [selectedTabToClose, setSelectedTabToClose] = useState<any | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('PIX');
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    loadTabs();
    const interval = setInterval(loadTabs, 4000);
    return () => clearInterval(interval);
  }, []);

  async function loadTabs() {
    try {
      const res = await fetch('/api/tabs');
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setTabs((data.tabs as any[]) || []);
    } catch (err) {
      console.error('Erro ao carregar comandas:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateTab(e: React.FormEvent) {
    e.preventDefault();
    if (!tabIdentifier.trim()) return;

    setCreating(true);
    try {
      const res = await fetch('/api/tabs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          tab_identifier: tabIdentifier.trim(),
          customer_name: customerName.trim() || null
        })
      });

      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Erro ao abrir mesa/comanda');

      setIsNewTabModalOpen(false);
      setTabIdentifier('');
      setCustomerName('');
      loadTabs();
    } catch (err: any) {
      alert('Erro ao abrir comanda/mesa: ' + err.message);
    } finally {
      setCreating(false);
    }
  }

  async function handleCloseTab(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedTabToClose) return;

    setClosing(true);
    try {
      const res = await fetch('/api/tabs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'close',
          tabId: selectedTabToClose.id,
          paymentMethod
        })
      });

      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Falha ao encerrar comanda');

      alert(`Comanda ${selectedTabToClose.tab_identifier} encerrada com sucesso no valor de ${formatCurrency(Number(selectedTabToClose.accumulated_amount || 0))}!`);
      setSelectedTabToClose(null);
      setViewingTab(null);
      loadTabs();
    } catch (err: any) {
      alert('Falha ao encerrar comanda: ' + err.message);
    } finally {
      setClosing(false);
    }
  }

  const filteredTabs = tabs.filter(t => 
    (t.tab_identifier || t.tab_number || '').toLowerCase().includes(search.toLowerCase()) ||
    (t.customer_name || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-amber-950/80">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full bg-amber-400"></span>
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400">Salão & Mesas</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-3">
            <CreditCard className="w-7 h-7 text-amber-400" />
            Mesas & Comandas Digitais
          </h1>
          <p className="text-xs sm:text-sm text-stone-400 mt-1">
            Controle integrado de pedidos em tempo real via celular (PWA) e fechamento
          </p>
        </div>

        <Button
          onClick={() => setIsNewTabModalOpen(true)}
          className="shadow-lg shadow-amber-950/60 font-black text-xs sm:text-sm bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-stone-950 cursor-pointer"
        >
          <Plus className="w-4 h-4 mr-1.5" />
          Abrir Nova Mesa / Comanda
        </Button>
      </div>

      {/* BUSCA */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative w-full max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500" />
          <Input
            type="text"
            placeholder="Buscar por número da mesa, comanda ou nome do cliente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 bg-stone-900 border-stone-800 text-stone-200 placeholder:text-stone-600"
          />
        </div>
        <div className="text-xs text-amber-400 font-mono font-bold uppercase flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span>{filteredTabs.length} em aberto</span>
        </div>
      </div>

      {/* GRID DE CARDS DE MESAS / COMANDAS */}
      {loading ? (
        <div className="py-16 text-center text-stone-500 text-sm">Carregando comandas...</div>
      ) : filteredTabs.length === 0 ? (
        <div className="bg-stone-950 border border-amber-950/60 p-16 rounded-3xl text-center space-y-3">
          <CreditCard className="w-12 h-12 text-stone-600 mx-auto" />
          <p className="text-stone-400 text-sm font-medium">Nenhuma mesa ou comanda aberta no momento.</p>
          <p className="text-stone-600 text-xs">Os pedidos enviados pelo App do Celular (PWA) abrirão as mesas automaticamente aqui.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredTabs.map(tab => (
            <Card 
              key={tab.id}
              className="p-5 flex flex-col justify-between hover:border-amber-500/60 transition-all duration-200 shadow-xl bg-stone-950/80 border-amber-950/70"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <Badge variant="default" className="text-xs px-2.5 py-0.5 bg-amber-500/20 text-amber-300 border-amber-500/30 font-black">
                    {tab.tab_identifier || tab.tab_number}
                  </Badge>
                  <span className="text-[11px] text-stone-500 font-mono">
                    {formatDateTime(tab.opened_at)}
                  </span>
                </div>

                <div className="text-xs text-stone-400 flex items-center gap-1.5 mb-2">
                  <User className="w-3.5 h-3.5 text-amber-500/60" />
                  <span className="truncate">{tab.customer_name || 'Sem cliente informado'}</span>
                </div>

                <div className="mt-4 pt-3 border-t border-stone-800">
                  <span className="text-[11px] font-bold text-amber-400/90 uppercase tracking-wider block">Consumo Acumulado</span>
                  <div className="text-2xl font-black text-amber-300 font-mono mt-0.5">
                    {formatCurrency(Number(tab.accumulated_amount || 0))}
                  </div>
                </div>
              </div>

              <div className="mt-5 pt-3 border-t border-stone-800 flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setViewingTab(tab)}
                  className="flex-1 text-xs border-stone-800 hover:bg-stone-900 text-stone-300 cursor-pointer"
                  title="Ver itens consumidos"
                >
                  <Eye className="w-3.5 h-3.5 mr-1" />
                  Extrato
                </Button>
                <Button
                  size="sm"
                  onClick={() => setSelectedTabToClose(tab)}
                  className="flex-1 text-xs font-black shadow-md shadow-amber-950/40 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-stone-950 cursor-pointer"
                >
                  Fechar
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* MODAL DE EXTRATO DE CONSUMO DA MESA */}
      {viewingTab && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <div className="bg-stone-950 border border-amber-900/60 rounded-3xl w-full max-w-lg p-6 shadow-2xl space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-stone-800 pb-3">
              <div>
                <h3 className="text-lg font-black text-white flex items-center gap-2">
                  <ShoppingBag className="w-5 h-5 text-amber-400" />
                  Consumo: {viewingTab.tab_identifier || viewingTab.tab_number}
                </h3>
                <p className="text-xs text-stone-400 mt-0.5">
                  {viewingTab.customer_name ? `Cliente: ${viewingTab.customer_name}` : 'Mesa em atendimento'}
                </p>
              </div>
              <button
                onClick={() => setViewingTab(null)}
                className="text-stone-400 hover:text-white p-1 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {(!viewingTab.orders || viewingTab.orders.length === 0) ? (
                <div className="py-8 text-center text-xs text-stone-500">
                  Nenhum pedido registrado nesta comanda ainda.
                </div>
              ) : (
                viewingTab.orders.map((ord: any) => (
                  <div key={ord.id} className="p-3 bg-stone-900/80 border border-stone-800 rounded-xl space-y-2">
                    <div className="flex items-center justify-between text-xs text-stone-400 pb-1.5 border-b border-stone-800/60">
                      <span>Pedido #{ord.order_number || String(ord.id).slice(0, 6)}</span>
                      <span className="text-amber-400 font-semibold">{ord.waiter_name ? `Garçom: ${ord.waiter_name}` : ''}</span>
                    </div>
                    <div className="space-y-1">
                      {(ord.order_items || []).map((item: any) => (
                        <div key={item.id} className="flex items-center justify-between text-xs">
                          <span className="text-stone-200">
                            {item.quantity}x {item.product_name || 'Produto'}
                          </span>
                          <span className="text-stone-400 font-mono">
                            {formatCurrency(Number(item.total_price || item.unit_price * item.quantity))}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="pt-3 border-t border-stone-800 flex items-center justify-between">
              <div>
                <span className="text-[11px] text-stone-400 uppercase font-bold block">Total a Pagar</span>
                <span className="text-2xl font-black text-amber-300 font-mono">
                  {formatCurrency(Number(viewingTab.accumulated_amount || 0))}
                </span>
              </div>
              <Button
                onClick={() => {
                  setSelectedTabToClose(viewingTab);
                  setViewingTab(null);
                }}
                className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-stone-950 font-black text-xs cursor-pointer shadow-lg shadow-amber-950/60"
              >
                Receber / Encerrar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE NOVA COMANDA */}
      {isNewTabModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <div className="bg-stone-950 border border-amber-900/60 rounded-3xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-black text-white flex items-center gap-2">
              <Plus className="w-5 h-5 text-amber-400" />
              Abrir Nova Mesa / Comanda
            </h3>

            <form onSubmit={handleCreateTab} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-stone-300 mb-1">Identificador da Comanda / Mesa *</label>
                <input
                  type="text"
                  placeholder="Ex: Mesa 05, Comanda 12, Cartão 88..."
                  value={tabIdentifier}
                  onChange={(e) => setTabIdentifier(e.target.value)}
                  required
                  className="w-full bg-stone-900 border border-stone-800 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-300 mb-1">Nome do Cliente (Opcional)</label>
                <input
                  type="text"
                  placeholder="Ex: Carlos, Juliana..."
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full bg-stone-900 border border-stone-800 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-stone-800">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsNewTabModalOpen(false)}
                  className="text-stone-400 text-xs"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={creating}
                  className="text-xs font-black shadow-lg shadow-amber-950/60 bg-gradient-to-r from-amber-500 to-amber-600 text-stone-950"
                >
                  {creating ? 'Criando...' : 'Confirmar e Abrir'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE FECHAMENTO DE COMANDA */}
      {selectedTabToClose && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <div className="bg-stone-950 border border-amber-900/60 rounded-3xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-black text-white flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-amber-400" />
              Receber {selectedTabToClose.tab_identifier || selectedTabToClose.tab_number}
            </h3>

            <div className="p-4 bg-stone-900/90 border border-amber-500/30 rounded-2xl text-center">
              <span className="text-xs text-amber-400 uppercase font-bold tracking-wider">Valor Total Acumulado</span>
              <div className="text-3xl font-black text-amber-300 font-mono mt-1">
                {formatCurrency(Number(selectedTabToClose.accumulated_amount || 0))}
              </div>
            </div>

            <form onSubmit={handleCloseTab} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-stone-300 mb-1">Forma de Pagamento *</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                  className="w-full bg-stone-900 border border-stone-800 rounded-xl px-3 py-2.5 text-white text-xs focus:outline-none focus:border-amber-500"
                >
                  <option value="PIX">PIX (Chave / QR Code)</option>
                  <option value="DINHEIRO">Dinheiro Físico</option>
                  <option value="CARTAO_DEBITO">Cartão de Débito</option>
                  <option value="CARTAO_CREDITO">Cartão de Crédito</option>
                  <option value="FIADO">Fiado / Pendente</option>
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-stone-800">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setSelectedTabToClose(null)}
                  className="text-stone-400 text-xs"
                >
                  Voltar
                </Button>
                <Button
                  type="submit"
                  disabled={closing}
                  className="text-xs font-black shadow-lg shadow-amber-950/60 bg-gradient-to-r from-amber-500 to-amber-600 text-stone-950 cursor-pointer"
                >
                  {closing ? 'Processando...' : 'Confirmar e Encerrar Mesa'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
