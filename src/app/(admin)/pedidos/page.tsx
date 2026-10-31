'use client';

import React, { useState, useEffect } from 'react';
import { 
  Bell, 
  CheckCircle, 
  XCircle, 
  Clock, 
  Printer, 
  Wine, 
  AlertCircle,
  Volume2
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import { Order, OrderItem } from '@/types/database';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { ThermalReceipt, printThermalReceipt } from '@/components/ThermalReceipt';

export default function PedidosCaixaPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [printingOrder, setPrintingOrder] = useState<Order | null>(null);

  const supabase = createClient();

  useEffect(() => {
    loadOrders();
    const interval = setInterval(loadOrders, 4000);

    const channel = supabase
      .channel('realtime_orders')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        (payload) => {
          loadOrders();
          if (payload.eventType === 'INSERT' && soundEnabled) {
            playBeep();
          }
        }
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [soundEnabled]);

  function playBeep() {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.35);
    } catch (e) {
      console.warn('AudioContext bloqueado pelo navegador.');
    }
  }

  async function loadOrders() {
    try {
      const res = await fetch('/api/orders');
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setOrders((data.orders as unknown as Order[]) || []);
    } catch (err) {
      console.error('Erro ao carregar pedidos:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirmOrder(orderId: string) {
    setProcessingId(orderId);
    try {
      const res = await fetch('/api/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'confirm', orderId })
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Falha ao confirmar pedido');
      loadOrders();
    } catch (err: any) {
      alert('Falha ao confirmar pedido: ' + err.message);
    } finally {
      setProcessingId(null);
    }
  }

  async function handleCancelOrder(orderId: string) {
    if (!confirm('Deseja realmente cancelar este pedido?')) return;
    setProcessingId(orderId);
    try {
      const res = await fetch('/api/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel', orderId })
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Falha ao cancelar pedido');
      loadOrders();
    } catch (err: any) {
      alert('Falha ao cancelar: ' + err.message);
    } finally {
      setProcessingId(null);
    }
  }

  async function handlePrint(order: Order) {
    setPrintingOrder(order);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 600);

      const response = await fetch('http://127.0.0.1:9123/print', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mauricio-pos-secret-2026'
        },
        body: JSON.stringify({
          type: 'ORDER_PRODUCTION',
          data: order
        }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        return;
      }
    } catch {
      // Agente offline -> segue para impressão nativa
    }

    setTimeout(() => {
      printThermalReceipt({
        id: String(order.order_number || order.id),
        date: order.created_at,
        companyTradeName: 'ADEGA DE MAURICIO',
        companyName: 'Adega e Depósito Mauricio Ltda',
        companyAddress: 'Rua Nova Do Campo, Ao Lado Da Quadra Mimoso, BA',
        companyPhone: '(71) 98103-8699',
        logoUrl: '/logo.jpg',
        items: (order.items || []).map((i) => ({
          name: i.product_name || 'Item',
          quantity: Number(i.quantity),
          unitPrice: Number(i.unit_price),
          totalPrice: Number(i.total_price),
        })),
        subtotal: Number(order.total_amount),
        totalFinal: Number(order.total_amount),
        paymentMethod: 'COMANDA / MESA',
        customerName: order.customer_name || undefined,
        operatorName: order.waiter_name || 'Garçom',
      });
    }, 100);
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* HEADER EXECUTIVO */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-amber-950/80">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400">Recepção Realtime</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-3">
            <Bell className="w-7 h-7 text-amber-400" />
            Central de Pedidos em Tempo Real
          </h1>
          <p className="text-xs sm:text-sm text-stone-400 mt-1">
            Pedidos transmitidos instantaneamente pelos garçons via celular (PWA)
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="text-xs font-bold"
          >
            <Volume2 className="w-4 h-4 mr-1.5 text-amber-400" />
            Alerta Sonoro: {soundEnabled ? 'Ativo' : 'Mudo'}
          </Button>
        </div>
      </div>

      {/* QUADRO DE PEDIDOS RECEBIDOS */}
      {loading ? (
        <div className="py-16 text-center text-stone-500 text-sm">Conectando ao canal em tempo real...</div>
      ) : orders.length === 0 ? (
        <div className="bg-stone-950 border border-amber-950/60 p-16 rounded-3xl text-center space-y-3">
          <Wine className="w-12 h-12 text-stone-600 mx-auto" />
          <h3 className="text-base font-bold text-stone-300">Nenhum pedido pendente</h3>
          <p className="text-stone-500 text-xs max-w-sm mx-auto">
            Assim que um atendente enviar um pedido pelo celular, o aviso sonoro tocará e o card aparecerá aqui automaticamente.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {orders.map((ord) => {
            const isPendente = ord.status === 'PENDENTE';

            return (
              <Card
                key={ord.id}
                className={`p-5 flex flex-col justify-between transition-all duration-200 ${
                  isPendente 
                    ? 'border-amber-500/60 shadow-xl shadow-amber-950/40 ring-1 ring-amber-500/30' 
                    : 'border-stone-800'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between pb-3 border-b border-stone-800">
                    <div>
                      <span className="text-[10px] font-bold text-amber-400/90 uppercase tracking-widest block">Destino</span>
                      <span className="text-base font-black text-white">
                        {ord.destination_type} {ord.table_number ? `Mesa ${ord.table_number}` : ''}
                      </span>
                    </div>

                    <Badge variant={isPendente ? "default" : "secondary"} className="text-xs">
                      {ord.status}
                    </Badge>
                  </div>

                  <div className="py-2.5 flex items-center justify-between text-xs text-stone-400">
                    <span>Atendente: <strong className="text-stone-200">{ord.waiter_name || 'Balcão'}</strong></span>
                    <span className="font-mono text-stone-500">{formatDateTime(ord.created_at)}</span>
                  </div>

                  {/* ITENS */}
                  <div className="my-3 space-y-2 bg-stone-900/80 p-3 rounded-xl border border-stone-800/80">
                    {(ord as any).order_items?.map((item: any) => (
                      <div key={item.id} className="flex items-start justify-between text-xs">
                        <div>
                          <div className="font-bold text-stone-200">
                            <span className="font-black text-amber-400 mr-1.5">{item.quantity}x</span>
                            {item.products?.name || 'Item'}
                          </div>
                          {item.notes && (
                            <div className="text-[11px] text-amber-400/80 italic mt-0.5">Obs: {item.notes}</div>
                          )}
                        </div>
                        <div className="font-mono font-bold text-stone-400">
                          {formatCurrency(Number(item.total_price))}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <span className="text-xs text-stone-400 font-bold uppercase">Total do Pedido</span>
                    <span className="text-xl font-black text-amber-400 font-mono">
                      {formatCurrency(Number(ord.total_amount))}
                    </span>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-stone-800 flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="iconSm"
                    onClick={() => handlePrint(ord)}
                    title="Imprimir comanda"
                  >
                    <Printer className="w-4 h-4 text-stone-300" />
                  </Button>

                  <Button
                    variant="destructive"
                    size="iconSm"
                    onClick={() => handleCancelOrder(ord.id)}
                    disabled={processingId === ord.id}
                    title="Cancelar pedido"
                  >
                    <XCircle className="w-4 h-4" />
                  </Button>

                  {isPendente && (
                    <Button
                      onClick={() => handleConfirmOrder(ord.id)}
                      disabled={processingId === ord.id}
                      className="flex-1 text-xs font-black shadow-lg shadow-amber-950/40"
                    >
                      <CheckCircle className="w-4 h-4 mr-1.5" />
                      {processingId === ord.id ? 'Baixando...' : 'Confirmar & Baixar Estoque'}
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* ÁREA DE IMPRESSÃO TÉRMICA */}
      <div id="thermal-receipt" className="hidden print:block">
        {printingOrder && (
          <ThermalReceipt
            data={{
              id: String(printingOrder.order_number || printingOrder.id),
              date: printingOrder.created_at,
              companyTradeName: 'ADEGA DE MAURICIO',
              companyName: 'Adega e Depósito Mauricio Ltda',
              companyAddress: 'Rua Nova Do Campo, Ao Lado Da Quadra Mimoso, BA',
              companyPhone: '(71) 98103-8699',
              logoUrl: '/logo.jpg',
              items: (printingOrder.items || []).map((i) => ({
                name: i.product_name || 'Item',
                quantity: Number(i.quantity),
                unitPrice: Number(i.unit_price),
                totalPrice: Number(i.total_price),
              })),
              subtotal: Number(printingOrder.total_amount),
              totalFinal: Number(printingOrder.total_amount),
              paymentMethod: 'COMANDA / MESA',
              customerName: printingOrder.customer_name || undefined,
              operatorName: printingOrder.waiter_name || 'Garçom',
            }}
          />
        )}
      </div>
    </div>
  );
}
