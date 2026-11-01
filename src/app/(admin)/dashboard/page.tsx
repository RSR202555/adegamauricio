'use client';

import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, 
  DollarSign, 
  Package, 
  AlertTriangle, 
  ShoppingCart, 
  ArrowUpRight, 
  Clock, 
  CheckCircle2, 
  Users, 
  Wine, 
  RefreshCw, 
  ArrowRight,
  Sparkles
} from 'lucide-react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import { Sale, Product, Tab } from '@/types/database';

export default function DashboardPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [lowStockProducts, setLowStockProducts] = useState<Product[]>([]);
  const [openTabsCount, setOpenTabsCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string>('');

  const supabase = createClient();

  useEffect(() => {
    loadDashboardData();
  }, []);

  async function loadDashboardData() {
    setLoading(true);
    try {
      const [salesRes, prodRes, tabRes] = await Promise.all([
        fetch('/api/sales?today=true').then(res => res.json()).catch(() => ({ sales: [] })),
        fetch('/api/products').then(res => res.json()).catch(() => ({ products: [] })),
        fetch('/api/tabs').then(res => res.json()).catch(() => ({ tabs: [] })),
      ]);

      let salesList: Sale[] = Array.isArray(salesRes?.sales) ? salesRes.sales : [];

      // Também inclui vendas que possam ter sido salvas no modo offline localmente e ainda não sincronizadas
      try {
        const rawPending = localStorage.getItem('adega_mauricio_pending_sales') || localStorage.getItem('adega_mauri_pending_sales');
        if (rawPending) {
          const pending = JSON.parse(rawPending);
          if (Array.isArray(pending) && pending.length > 0) {
            const existingIds = new Set(salesList.map((s: any) => s.id));
            const todayStr = new Date().toLocaleDateString('en-CA');
            for (const p of pending) {
              const pDate = p.created_at ? p.created_at.slice(0, 10) : todayStr;
              if (pDate === todayStr && !existingIds.has(p.offline_id)) {
                salesList.push({
                  id: p.offline_id || p.id,
                  company_id: p.company_id,
                  sale_number: p.offline_id,
                  sale_type: p.sale_type || 'BALCAO',
                  payment_method: p.payment_method,
                  total_amount: p.total_amount,
                  discount_amount: p.discount_amount || 0,
                  final_amount: p.final_amount,
                  customer_name: p.customer_name,
                  customer_cpf: p.customer_cpf,
                  status: 'CONCLUIDA',
                  created_at: p.created_at || new Date().toISOString(),
                } as any);
              }
            }
          }
        }
      } catch {}

      setSales(salesList);
      const productList = prodRes.products || [];
      const low = productList.filter((p: Product) => p.current_stock <= p.min_stock);
      setLowStockProducts(low as Product[]);
      setOpenTabsCount(Array.isArray(tabRes?.tabs) ? tabRes.tabs.length : 0);
      setLastUpdated(new Date().toLocaleTimeString('pt-BR'));
    } catch (err) {
      console.error('Erro ao carregar métricas:', err);
    } finally {
      setLoading(false);
    }
  }

  const faturamentoHoje = sales.reduce((acc, s) => acc + Number(s.final_amount), 0);
  const totalVendasHoje = sales.length;
  const ticketMedioHoje = totalVendasHoje > 0 ? faturamentoHoje / totalVendasHoje : 0;

  return (
    <div className="space-y-8 p-1 sm:p-2 max-w-7xl mx-auto">
      {/* HEADER ELEGANTE E CLARO */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full bg-amber-500"></span>
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700">Visão Gerencial</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
            Visão Geral da Adega
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Métricas de faturamento, consumo em mesas e reposição de estoque
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadDashboardData}
            disabled={loading}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 shadow-sm transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
            Atualizar {lastUpdated && `(${lastUpdated})`}
          </button>

          <Link 
            href="/pdv"
            className="px-5 py-2.5 rounded-xl text-sm font-bold bg-amber-500 hover:bg-amber-400 text-stone-950 shadow-md shadow-amber-500/20 transition-all flex items-center gap-2"
          >
            <ShoppingCart className="w-4 h-4" /> Frente de Caixa (PDV)
          </Link>
        </div>
      </div>

      {/* KPI METRICS GRID COM CARTOES BRANCOS E SOMBRAS SUAVES */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* FATURAMENTO DIÁRIO */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between pb-2">
            <span className="font-bold text-slate-400 uppercase tracking-wider text-[11px]">
              Faturamento Hoje
            </span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight font-mono mt-1">
            {formatCurrency(faturamentoHoje)}
          </div>
          <div className="flex items-center gap-2 mt-2 text-xs text-slate-500">
            <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-mono text-[11px] font-bold border border-slate-200">
              {totalVendasHoje} vendas
            </span>
            <span>registradas hoje</span>
          </div>
        </div>

        {/* TICKET MÉDIO */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between pb-2">
            <span className="font-bold text-slate-400 uppercase tracking-wider text-[11px]">
              Ticket Médio
            </span>
            <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-600 border border-slate-200 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight font-mono mt-1">
            {formatCurrency(ticketMedioHoje)}
          </div>
          <div className="text-xs text-slate-500 mt-2">
            Média por atendimento
          </div>
        </div>

        {/* COMANDAS NO SALÃO */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between pb-2">
            <span className="font-bold text-slate-400 uppercase tracking-wider text-[11px]">
              Comandas no Salão
            </span>
            <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-600 border border-slate-200 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight font-mono mt-1">
            {openTabsCount}
          </div>
          <div className="flex items-center gap-1.5 mt-2 text-xs">
            <Link href="/comandas" className="text-amber-600 hover:text-amber-700 hover:underline flex items-center gap-1 font-bold">
              Ver mesas ativas <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>

        {/* ALERTA DE ESTOQUE BAIXO */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between pb-2">
            <span className="font-bold text-slate-400 uppercase tracking-wider text-[11px]">
              Estoque Crítico
            </span>
            <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 border border-rose-200 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-rose-600 tracking-tight font-mono mt-1">
            {lowStockProducts.length}
          </div>
          <div className="flex items-center gap-1.5 mt-2 text-xs">
            <Link href="/estoque" className="text-rose-600 hover:text-rose-700 hover:underline flex items-center gap-1 font-bold">
              Auditar reposição <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>
      </div>

      {/* SEÇÃO ANALÍTICA: TABELA E RADAR EM TEMA CLARO */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* TABELA DE VENDAS RECENTES */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm flex flex-col justify-between">
          <div>
            <div className="p-5 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
                  <ShoppingCart className="w-4 h-4 text-slate-500" />
                  Últimas Vendas Concluídas
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Extrato das transações em balcão e salão hoje
                </p>
              </div>
              <Link href="/relatorios" className="text-xs font-bold text-amber-600 hover:text-amber-700 hover:underline flex items-center gap-1">
                Relatório Completo <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-500 text-xs font-bold uppercase tracking-wider">
                    <th className="py-3 px-4">Hora</th>
                    <th className="py-3 px-4">Tipo</th>
                    <th className="py-3 px-4">Forma</th>
                    <th className="py-3 px-4 text-right">Valor Líquido</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {loading ? (
                    <tr>
                      <td colSpan={4} className="py-12 text-center text-slate-400 text-xs">
                        Carregando registros de transações...
                      </td>
                    </tr>
                  ) : sales.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-12 text-center text-slate-400 text-xs">
                        Nenhuma venda registrada hoje até o momento.
                      </td>
                    </tr>
                  ) : (
                    sales.slice(0, 6).map((s) => (
                      <tr key={s.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3.5 px-4 text-xs font-mono text-slate-500 whitespace-nowrap">
                          {formatDateTime(s.created_at)}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-slate-100 text-slate-700 border border-slate-200">
                            {s.sale_type || 'BALCÃO'}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-xs">
                          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-800 border border-amber-200">
                            {(s.payment_method || 'DINHEIRO').replace('_', ' ')}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono font-extrabold text-slate-900">
                          {formatCurrency(Number(s.final_amount))}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* RADAR DE REPOSIÇÃO */}
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm flex flex-col justify-between">
          <div>
            <div className="p-5 border-b border-slate-200">
              <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
                <AlertTriangle className="w-4 h-4 text-rose-500" />
                Radar de Reposição
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Bebidas atingindo saldo mínimo
              </p>
            </div>

            <div className="p-5 space-y-2.5">
              {lowStockProducts.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs flex flex-col items-center gap-2">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500/60" />
                  <span>Estoque sob controle! Nenhum produto abaixo do mínimo.</span>
                </div>
              ) : (
                lowStockProducts.slice(0, 5).map((p) => (
                  <div
                    key={p.id}
                    className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between hover:bg-slate-100 transition-colors"
                  >
                    <div className="pr-2">
                      <div className="text-sm font-bold text-slate-900 leading-tight">{p.name}</div>
                      <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                        Mínimo: {p.min_stock} {p.unit}
                      </div>
                    </div>
                    <span className="font-mono font-extrabold text-xs px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-600 border border-rose-200">
                      {p.current_stock} {p.unit}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="p-5 pt-0">
            <Link 
              href="/estoque"
              className="w-full py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 font-bold text-xs flex items-center justify-center transition-colors shadow-sm"
            >
              Ir para Controle de Estoque
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
