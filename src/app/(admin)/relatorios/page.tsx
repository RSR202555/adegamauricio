'use client';

import React, { useState, useEffect } from 'react';
import { 
  BarChart3, 
  Calendar, 
  DollarSign, 
  TrendingUp, 
  Download, 
  CreditCard, 
  FileSpreadsheet, 
  Filter
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import { Sale, PaymentMethod } from '@/types/database';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export default function RelatoriosPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filtros de Data
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [filterMethod, setFilterMethod] = useState<string>('ALL');

  const supabase = createClient();

  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    if (!startDate) setStartDate(today);
    if (!endDate) setEndDate(today);
  }, []);

  useEffect(() => {
    if (startDate && endDate) {
      loadReports();
    }
  }, [startDate, endDate]);

  async function loadReports() {
    setLoading(true);
    try {
      const res = await fetch(`/api/sales?startDate=${startDate}&endDate=${endDate}&includeItems=true`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao carregar vendas');
      setSales((data.sales as unknown as Sale[]) || []);
    } catch (err) {
      console.error('Erro ao carregar relatórios:', err);
    } finally {
      setLoading(false);
    }
  }

  const totalFaturado = sales.reduce((acc, s) => acc + Number(s.final_amount), 0);
  const totalDescontos = sales.reduce((acc, s) => acc + Number(s.discount_amount), 0);
  const totalVendasCount = sales.length;
  const ticketMedio = totalVendasCount > 0 ? totalFaturado / totalVendasCount : 0;

  const totaisPorMetodo: Record<string, number> = {
    DINHEIRO: 0,
    PIX: 0,
    CARTAO_CREDITO: 0,
    CARTAO_DEBITO: 0,
    FIADO: 0,
    OUTRO: 0
  };

  sales.forEach(sale => {
    const key = (sale.payment_method || 'OUTRO') as string;
    totaisPorMetodo[key] = (totaisPorMetodo[key] || 0) + Number(sale.final_amount);
  });

  function exportToCSV() {
    if (sales.length === 0) {
      alert('Não há dados no período para exportar.');
      return;
    }

    const headers = ['ID Venda', 'Data / Hora', 'Tipo', 'Forma Pagamento', 'Subtotal', 'Desconto', 'Total Líquido', 'Status'];
    const rows = sales.map(s => [
      s.id,
      formatDateTime(s.created_at),
      s.sale_type,
      s.payment_method,
      Number(s.total_amount).toFixed(2),
      Number(s.discount_amount).toFixed(2),
      Number(s.final_amount).toFixed(2),
      s.status
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + 
      [headers.join(','), ...rows.map(e => e.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `relatorio_vendas_${startDate}_ate_${endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  const filteredSales = sales.filter(s => {
    if (filterMethod === 'ALL') return true;
    return s.payment_method === filterMethod;
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-amber-950/80">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full bg-amber-400"></span>
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400">Gestão Contábil</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-3">
            <BarChart3 className="w-7 h-7 text-amber-400" />
            Relatórios Financeiros & Vendas
          </h1>
          <p className="text-xs sm:text-sm text-stone-400 mt-1">
            Visão consolidada de fechamento de caixa, faturamento e exportação de planilhas
          </p>
        </div>

        <Button
          onClick={exportToCSV}
          disabled={sales.length === 0}
          className="shadow-lg shadow-amber-950/60 font-black text-xs sm:text-sm"
        >
          <Download className="w-4 h-4 mr-1.5" />
          Exportar Planilha (CSV)
        </Button>
      </div>

      {/* FILTROS DE PERÍODO */}
      <div className="bg-stone-950 border border-amber-900/40 p-4 rounded-2xl flex flex-col md:flex-row gap-4 items-center justify-between shadow-xl">
        <div className="flex flex-wrap items-center gap-3">
          <Calendar className="w-5 h-5 text-amber-400" />
          <div>
            <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-wider">Data Inicial</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-stone-900 border border-stone-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-wider">Data Final</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-stone-900 border border-stone-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-stone-400" />
          <span className="text-xs text-stone-400 uppercase font-bold">Forma:</span>
          <select
            value={filterMethod}
            onChange={(e) => setFilterMethod(e.target.value)}
            className="bg-stone-900 border border-stone-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
          >
            <option value="ALL">Todas</option>
            <option value="DINHEIRO">Dinheiro</option>
            <option value="PIX">PIX</option>
            <option value="CARTAO_CREDITO">Crédito</option>
            <option value="CARTAO_DEBITO">Débito</option>
            <option value="FIADO">Fiado / Pendente</option>
          </select>
        </div>
      </div>

      {/* CARDS DE RESUMO */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-5">
          <span className="text-[11px] font-bold text-amber-400/90 uppercase tracking-widest">Faturamento Líquido</span>
          <div className="text-2xl sm:text-3xl font-black text-amber-400 font-mono mt-2">{formatCurrency(totalFaturado)}</div>
          <span className="text-xs text-stone-500 mt-1 block">Total apurado no período</span>
        </Card>

        <Card className="p-5">
          <span className="text-[11px] font-bold text-stone-400 uppercase tracking-widest">Qtd Vendas Fechadas</span>
          <div className="text-2xl sm:text-3xl font-black text-white font-mono mt-2">{totalVendasCount}</div>
          <span className="text-xs text-stone-500 mt-1 block">Transações no período</span>
        </Card>

        <Card className="p-5">
          <span className="text-[11px] font-bold text-stone-400 uppercase tracking-widest">Ticket Médio</span>
          <div className="text-2xl sm:text-3xl font-black text-yellow-400 font-mono mt-2">{formatCurrency(ticketMedio)}</div>
          <span className="text-xs text-stone-500 mt-1 block">Média por atendimento</span>
        </Card>

        <Card className="p-5">
          <span className="text-[11px] font-bold text-stone-400 uppercase tracking-widest">Total de Descontos</span>
          <div className="text-2xl sm:text-3xl font-black text-rose-400 font-mono mt-2">{formatCurrency(totalDescontos)}</div>
          <span className="text-xs text-stone-500 mt-1 block">Descontos concedidos</span>
        </Card>
      </div>

      {/* FORMAS DE PAGAMENTO CONSOLIDADAS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
        {Object.entries(totaisPorMetodo).map(([metodo, valor]) => (
          <div key={metodo} className="bg-stone-900/60 border border-stone-800/80 p-4 rounded-xl flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold text-amber-400/90 uppercase block">{metodo.replace('_', ' ')}</span>
              <span className="text-base font-black text-white font-mono mt-1 block">{formatCurrency(valor)}</span>
            </div>
            <CreditCard className="w-5 h-5 text-stone-500" />
          </div>
        ))}
      </div>

      {/* TABELA DE VENDAS */}
      <Card className="overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between border-b border-amber-950/80 pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-amber-400" />
            Extrato Analítico de Vendas
          </CardTitle>
          <span className="text-xs text-stone-400 font-mono">{filteredSales.length} transações</span>
        </CardHeader>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-stone-800 bg-stone-900/60 text-stone-400 text-xs font-semibold uppercase tracking-wider">
                <th className="py-3.5 px-4">Data / Hora</th>
                <th className="py-3.5 px-4">Tipo</th>
                <th className="py-3.5 px-4">Forma</th>
                <th className="py-3.5 px-4 text-right">Subtotal</th>
                <th className="py-3.5 px-4 text-right">Desconto</th>
                <th className="py-3.5 px-4 text-right">Valor Final</th>
                <th className="py-3.5 px-4 text-center">Itens</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-800/80 text-stone-300">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-stone-500 text-xs">Calculando indicadores...</td>
                </tr>
              ) : filteredSales.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-stone-500 text-xs">Nenhuma venda encontrada no período.</td>
                </tr>
              ) : (
                filteredSales.map((s) => (
                  <tr key={s.id} className="hover:bg-stone-900/40 transition-colors">
                    <td className="py-3.5 px-4 text-xs text-stone-400 font-mono whitespace-nowrap">
                      {formatDateTime(s.created_at)}
                    </td>
                    <td className="py-3.5 px-4">
                      <Badge variant="secondary" className="text-[11px]">
                        {s.sale_type}
                      </Badge>
                    </td>
                    <td className="py-3.5 px-4">
                      <Badge variant="default" className="text-[11px]">
                        {(s.payment_method || 'DINHEIRO').replace('_', ' ')}
                      </Badge>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-stone-400">
                      {formatCurrency(Number(s.total_amount))}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-amber-400">
                      {Number(s.discount_amount) > 0 ? `-${formatCurrency(Number(s.discount_amount))}` : '-'}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-black text-amber-300">
                      {formatCurrency(Number(s.final_amount))}
                    </td>
                    <td className="py-3.5 px-4 text-center text-xs font-mono text-stone-400">
                      {(s as any).sale_items?.length || 0}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
