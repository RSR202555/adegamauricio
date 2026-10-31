'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  BookOpen, 
  Search, 
  Plus, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  User, 
  Phone, 
  DollarSign, 
  ArrowRight, 
  Receipt, 
  Printer, 
  X, 
  RefreshCw, 
  Check, 
  CreditCard, 
  Banknote, 
  QrCode, 
  Eye, 
  ShoppingBag,
  HandCoins,
  FileText
} from 'lucide-react';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ThermalReceipt, ReceiptData, printThermalReceipt } from '@/components/ThermalReceipt';

interface CustomerSummary {
  customer_name: string;
  customer_phone?: string;
  total_pending: number;
  total_settled: number;
  sales_count: number;
  last_sale_date: string;
  sales: any[];
}

export default function VendasAPrazoPage() {
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMode, setFilterMode] = useState<'pending' | 'all' | 'sales_history'>('pending');
  
  const [kpis, setKpis] = useState({
    total_pending: 0,
    total_settled: 0,
    debtors_count: 0,
    total_records: 0
  });

  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [salesList, setSalesList] = useState<any[]>([]);

  // Modais
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [manualName, setManualName] = useState('');
  const [manualPhone, setManualPhone] = useState('');
  const [manualDescription, setManualDescription] = useState('');
  const [manualAmount, setManualAmount] = useState('');
  const [isSubmittingManual, setIsSubmittingManual] = useState(false);

  // Modal Extrato do Cliente
  const [selectedCustomerForStatement, setSelectedCustomerForStatement] = useState<CustomerSummary | null>(null);

  // Modal de Quitação / Recebimento
  const [selectedCustomerToSettle, setSelectedCustomerToSettle] = useState<CustomerSummary | null>(null);
  const [selectedSaleToSettle, setSelectedSaleToSettle] = useState<any | null>(null);
  const [settlementMethod, setSettlementMethod] = useState<'DINHEIRO' | 'PIX' | 'CARTAO_DEBITO' | 'CARTAO_CREDITO'>('DINHEIRO');
  const [isSettling, setIsSettling] = useState(false);

  // Impressão Térmica
  const [activePrintData, setActivePrintData] = useState<ReceiptData | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const res = await fetch('/api/a-prazo');
      const data = await res.json();
      if (res.ok && data.success) {
        setKpis(data.kpis);
        setCustomers(data.customers || []);
        setSalesList(data.sales || []);
      }
    } catch (err) {
      console.error('Erro ao carregar vendas a prazo:', err);
    } finally {
      setLoading(false);
    }
  }

  // Filtragem de Clientes
  const filteredCustomers = customers.filter(c => {
    const matchesSearch = 
      c.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.customer_phone || '').includes(searchTerm);

    if (filterMode === 'pending') {
      return matchesSearch && c.total_pending > 0;
    }
    return matchesSearch;
  });

  // Filtragem de Vendas Individuais
  const filteredSales = salesList.filter(s => {
    const matchesSearch = 
      (s.customer_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (s.customer_cpf || '').includes(searchTerm) ||
      String(s.sale_number || '').includes(searchTerm);

    if (filterMode === 'pending') {
      return matchesSearch && ['PENDENTE', 'FIADO_PENDENTE', 'ABERTA'].includes(s.status);
    }
    return matchesSearch;
  });

  // Submeter lançamento manual rápido
  async function handleCreateManualDebt(e: React.FormEvent) {
    e.preventDefault();
    if (!manualName.trim() || !manualAmount || Number(manualAmount) <= 0) {
      alert('Informe o nome do cliente e o valor!');
      return;
    }

    setIsSubmittingManual(true);
    try {
      const res = await fetch('/api/a-prazo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_manual_debt',
          customerName: manualName.trim(),
          customerPhone: manualPhone.trim() || null,
          description: manualDescription.trim() || 'Lançamento manual a prazo',
          amount: parseFloat(manualAmount.replace(',', '.'))
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setIsManualModalOpen(false);
        setManualName('');
        setManualPhone('');
        setManualDescription('');
        setManualAmount('');
        loadData();
      } else {
        alert('Erro ao registrar lançamento: ' + (data.error || 'Erro desconhecido'));
      }
    } catch (err: any) {
      alert('Falha na comunicação: ' + err.message);
    } finally {
      setIsSubmittingManual(false);
    }
  }

  // Quitar todo o saldo do cliente
  async function handleSettleCustomerTotal() {
    if (!selectedCustomerToSettle) return;
    setIsSettling(true);
    try {
      const res = await fetch('/api/a-prazo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'settle_customer_total',
          customerName: selectedCustomerToSettle.customer_name,
          paymentMethod: settlementMethod
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        // Prepara recibo de quitação para impressão
        const receipt: ReceiptData = {
          id: `REC-QUIT-${Date.now().toString().slice(-4)}`,
          date: new Date().toISOString(),
          companyTradeName: 'ADEGA DE MAURICIO',
          companyName: 'Adega e Depósito Mauricio Ltda',
          companyAddress: 'Rua Nova Do Campo, Ao Lado Da Quadra Mimoso, BA',
          companyPhone: '(71) 98103-8699',
          items: [
            {
              name: `Quitacao Total Fiado: ${selectedCustomerToSettle.customer_name}`,
              quantity: 1,
              unitPrice: selectedCustomerToSettle.total_pending,
              totalPrice: selectedCustomerToSettle.total_pending
            }
          ],
          subtotal: selectedCustomerToSettle.total_pending,
          discountAmount: 0,
          totalFinal: selectedCustomerToSettle.total_pending,
          paymentMethod: settlementMethod,
          customerName: selectedCustomerToSettle.customer_name,
          operatorName: 'Caixa 01'
        };

        setActivePrintData(receipt);
        setSelectedCustomerToSettle(null);
        loadData();

        // Envia para impressora
        try {
          fetch('/api/print', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: receipt })
          });
        } catch {}
      } else {
        alert('Erro ao dar baixa: ' + (data.error || 'Falha ao processar'));
      }
    } catch (err: any) {
      alert('Falha: ' + err.message);
    } finally {
      setIsSettling(false);
    }
  }

  // Quitar uma venda individual
  async function handleSettleSingleSale() {
    if (!selectedSaleToSettle) return;
    setIsSettling(true);
    try {
      const res = await fetch('/api/a-prazo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'settle_sale',
          saleId: selectedSaleToSettle.id,
          paymentMethod: settlementMethod,
          customerName: selectedSaleToSettle.customer_name
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        const val = Number(selectedSaleToSettle.final_amount || 0);
        const receipt: ReceiptData = {
          id: `REC-${selectedSaleToSettle.sale_number || selectedSaleToSettle.id.slice(-6)}`,
          date: new Date().toISOString(),
          companyTradeName: 'ADEGA DE MAURICIO',
          companyName: 'Adega e Depósito Mauricio Ltda',
          companyAddress: 'Rua Nova Do Campo, Ao Lado Da Quadra Mimoso, BA',
          companyPhone: '(71) 98103-8699',
          items: [
            {
              name: `Baixa Conta Fiado: ${selectedSaleToSettle.customer_name || 'Cliente'}`,
              quantity: 1,
              unitPrice: val,
              totalPrice: val
            }
          ],
          subtotal: val,
          discountAmount: 0,
          totalFinal: val,
          paymentMethod: settlementMethod,
          customerName: selectedSaleToSettle.customer_name,
          operatorName: 'Caixa 01'
        };

        setActivePrintData(receipt);
        setSelectedSaleToSettle(null);
        loadData();

        try {
          fetch('/api/print', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: receipt })
          });
        } catch {}
      } else {
        alert('Erro ao quitar conta: ' + (data.error || 'Falha ao processar'));
      }
    } catch (err: any) {
      alert('Falha: ' + err.message);
    } finally {
      setIsSettling(false);
    }
  }

  // Imprimir Extrato do Cliente
  function handlePrintCustomerStatement(customer: CustomerSummary) {
    const pendingSales = customer.sales.filter(s => ['PENDENTE', 'FIADO_PENDENTE', 'ABERTA'].includes(s.status));
    
    const statementItems = pendingSales.flatMap((s, sIdx) => {
      if (s.sale_items && s.sale_items.length > 0) {
        return s.sale_items.map((item: any) => ({
          name: `${item.products?.name || item.product_name || 'Item'} (${new Date(s.created_at).toLocaleDateString('pt-BR')})`,
          quantity: item.quantity,
          unitPrice: Number(item.unit_price),
          totalPrice: Number(item.total_price || (item.quantity * item.unit_price))
        }));
      }
      return [{
        name: `Compra #${s.sale_number || s.id.slice(-4)} (${new Date(s.created_at).toLocaleDateString('pt-BR')})`,
        quantity: 1,
        unitPrice: Number(s.final_amount),
        totalPrice: Number(s.final_amount)
      }];
    });

    const receipt: ReceiptData = {
      id: `EXTR-${customer.customer_name.slice(0, 4).toUpperCase()}`,
      date: new Date().toISOString(),
      companyTradeName: 'ADEGA DE MAURICIO',
      companyName: 'Adega e Depósito Mauricio Ltda',
      companyAddress: 'Rua Nova Do Campo, Ao Lado Da Quadra Mimoso, BA',
      companyPhone: '(71) 98103-8699',
      items: statementItems.length > 0 ? statementItems : [
        {
          name: 'Saldo Devedor Acumulado',
          quantity: 1,
          unitPrice: customer.total_pending,
          totalPrice: customer.total_pending
        }
      ],
      subtotal: customer.total_pending,
      discountAmount: 0,
      totalFinal: customer.total_pending,
      paymentMethod: 'FIADO',
      customerName: customer.customer_name,
      operatorName: 'Caixa 01'
    };

    setActivePrintData(receipt);
    printThermalReceipt(receipt);
    try {
      fetch('/api/print', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: receipt })
      });
    } catch {}
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* HEADER PRINCIPAL */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-amber-950/80">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full bg-amber-400"></span>
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400">
              Caderneta & Fiado
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-3">
            <BookOpen className="w-7 h-7 text-amber-400" />
            Vendas a Prazo (Fiado)
          </h1>
          <p className="text-xs sm:text-sm text-stone-400 mt-1">
            Controle de clientes devedores, histórico de compras a prazo e recebimento de contas
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={loadData}
            disabled={loading}
            className="border-stone-800 bg-stone-900 text-stone-300 hover:text-white text-xs h-10"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>

          <Button
            onClick={() => setIsManualModalOpen(true)}
            className="shadow-lg shadow-amber-950/60 font-black text-xs h-10 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-stone-950"
          >
            <Plus className="w-4 h-4 mr-1.5 stroke-[3]" />
            Lançar Débito Manual
          </Button>

          <Link href="/pdv">
            <Button
              variant="secondary"
              className="font-bold text-xs h-10 bg-stone-800 hover:bg-stone-700 text-amber-300 border border-amber-500/30"
            >
              <ArrowRight className="w-3.5 h-3.5 mr-1.5" />
              Ir para o PDV [F2]
            </Button>
          </Link>
        </div>
      </div>

      {/* CARDS DE RESUMO (KPIS) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total a Receber */}
        <Card className="bg-stone-950 border-amber-500/40 p-5 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/10 rounded-full blur-2xl"></div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-400">Total a Receber (Em Aberto)</span>
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-black text-amber-300 font-mono">
              {formatCurrency(kpis.total_pending)}
            </div>
            <p className="text-[11px] text-stone-400 mt-1">Dívidas ativas aguardando pagamento</p>
          </div>
        </Card>

        {/* Total Já Quitado */}
        <Card className="bg-stone-950 border-emerald-900/50 p-5 shadow-xl relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">Total Já Quitado</span>
            <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-black text-emerald-300 font-mono">
              {formatCurrency(kpis.total_settled)}
            </div>
            <p className="text-[11px] text-stone-400 mt-1">Contas a prazo pagas e finalizadas</p>
          </div>
        </Card>

        {/* Clientes com Débito */}
        <Card className="bg-stone-950 border-stone-800 p-5 shadow-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-stone-300">Clientes Devedores</span>
            <div className="p-2 rounded-xl bg-stone-900 text-amber-400">
              <User className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-black text-stone-100 font-mono">
              {kpis.debtors_count}
            </div>
            <p className="text-[11px] text-stone-400 mt-1">Pessoas com saldo pendente</p>
          </div>
        </Card>

        {/* Total de Contas Registradas */}
        <Card className="bg-stone-950 border-stone-800 p-5 shadow-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-stone-300">Total de Registros</span>
            <div className="p-2 rounded-xl bg-stone-900 text-stone-400">
              <FileText className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-black text-stone-100 font-mono">
              {kpis.total_records}
            </div>
            <p className="text-[11px] text-stone-400 mt-1">Histórico completo de compras fiado</p>
          </div>
        </Card>
      </div>

      {/* BARRA DE FERRAMENTAS E ABAS DE VISUALIZAÇÃO */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-stone-900/60 p-3 rounded-2xl border border-stone-800">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500" />
          <Input
            type="text"
            placeholder="Buscar por nome do cliente ou telefone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 bg-stone-950 border-stone-800 text-xs h-10"
          />
        </div>

        <div className="flex items-center gap-1.5 bg-stone-950 p-1 rounded-xl border border-stone-800 text-xs font-bold">
          <button
            type="button"
            onClick={() => setFilterMode('pending')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              filterMode === 'pending'
                ? 'bg-amber-500 text-stone-950 shadow-md'
                : 'text-stone-400 hover:text-white'
            }`}
          >
            Clientes Devedores ({kpis.debtors_count})
          </button>
          <button
            type="button"
            onClick={() => setFilterMode('all')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              filterMode === 'all'
                ? 'bg-amber-500 text-stone-950 shadow-md'
                : 'text-stone-400 hover:text-white'
            }`}
          >
            Todos os Clientes ({customers.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterMode('sales_history')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              filterMode === 'sales_history'
                ? 'bg-amber-500 text-stone-950 shadow-md'
                : 'text-stone-400 hover:text-white'
            }`}
          >
            Histórico Detalhado ({salesList.length})
          </button>
        </div>
      </div>

      {/* CONTEÚDO PRINCIPAL: CARDS POR CLIENTE OU TABELA DETALHADA */}
      {filterMode !== 'sales_history' ? (
        /* VISUALIZAÇÃO POR CLIENTES (CADERNETA DIGITAL) */
        <div className="space-y-3">
          {filteredCustomers.length === 0 ? (
            <div className="py-16 text-center bg-stone-950 border border-stone-800 rounded-3xl space-y-3">
              <BookOpen className="w-12 h-12 text-stone-600 mx-auto stroke-1" />
              <div className="text-stone-300 font-bold text-sm">
                Nenhum cliente {filterMode === 'pending' ? 'devedor' : ''} encontrado
              </div>
              <p className="text-xs text-stone-500 max-w-sm mx-auto">
                Para registrar uma venda a prazo, finalize uma compra no PDV selecionando a forma de pagamento "A Prazo (Fiado)" ou use o botão "Lançar Débito Manual" acima.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredCustomers.map(customer => {
                const hasPending = customer.total_pending > 0;
                return (
                  <Card 
                    key={customer.customer_name}
                    className={`bg-stone-950 rounded-2xl p-4 transition-all border ${
                      hasPending 
                        ? 'border-amber-500/40 shadow-lg shadow-amber-950/20 hover:border-amber-400' 
                        : 'border-stone-800/80 opacity-80 hover:opacity-100'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3 pb-3 border-b border-stone-900">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm shrink-0 ${
                          hasPending 
                            ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' 
                            : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        }`}>
                          {customer.customer_name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-black text-white text-sm truncate">{customer.customer_name}</h3>
                          {customer.customer_phone ? (
                            <p className="text-[11px] text-stone-400 flex items-center gap-1 font-mono">
                              <Phone className="w-3 h-3 text-stone-500" />
                              {customer.customer_phone}
                            </p>
                          ) : (
                            <p className="text-[11px] text-stone-500">Sem telefone cadastrado</p>
                          )}
                        </div>
                      </div>

                      <Badge className={hasPending ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'}>
                        {hasPending ? 'Devendo' : 'Quitado'}
                      </Badge>
                    </div>

                    {/* VALORES */}
                    <div className="py-3 space-y-1.5 text-xs">
                      <div className="flex justify-between items-baseline">
                        <span className="text-stone-400">Saldo Devedor:</span>
                        <span className={`font-mono font-black text-base ${hasPending ? 'text-amber-400' : 'text-stone-500'}`}>
                          {formatCurrency(customer.total_pending)}
                        </span>
                      </div>
                      <div className="flex justify-between text-[11px] text-stone-500">
                        <span>Total Já Pago:</span>
                        <span className="font-mono text-emerald-400">{formatCurrency(customer.total_settled)}</span>
                      </div>
                      <div className="flex justify-between text-[11px] text-stone-500 pt-1 border-t border-stone-900">
                        <span>Última Compra:</span>
                        <span>{formatDateTime(customer.last_sale_date)}</span>
                      </div>
                    </div>

                    {/* AÇÕES */}
                    <div className="pt-3 border-t border-stone-900 flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setSelectedCustomerForStatement(customer)}
                        className="flex-1 text-[11px] h-9 border-stone-800 bg-stone-900/80 text-stone-300 hover:text-white"
                      >
                        <Eye className="w-3.5 h-3.5 mr-1" />
                        Extrato ({customer.sales.length})
                      </Button>

                      {hasPending && (
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => setSelectedCustomerToSettle(customer)}
                          className="flex-1 text-[11px] h-9 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-stone-950 font-black shadow-md shadow-amber-950/40"
                        >
                          <HandCoins className="w-3.5 h-3.5 mr-1" />
                          Receber
                        </Button>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* VISUALIZAÇÃO EM HISTÓRICO DETALHADO DE VENDAS */
        <Card className="bg-stone-950 border-stone-800 rounded-3xl overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-stone-800 bg-stone-900/40 text-stone-400 uppercase tracking-wider text-[10px]">
                  <th className="py-3.5 px-4 font-bold">Venda #</th>
                  <th className="py-3.5 px-4 font-bold">Data / Hora</th>
                  <th className="py-3.5 px-4 font-bold">Cliente</th>
                  <th className="py-3.5 px-4 font-bold">Itens</th>
                  <th className="py-3.5 px-4 font-bold text-right">Valor Final</th>
                  <th className="py-3.5 px-4 font-bold text-center">Status</th>
                  <th className="py-3.5 px-4 font-bold text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-900">
                {filteredSales.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-stone-500">
                      Nenhuma venda a prazo encontrada.
                    </td>
                  </tr>
                ) : (
                  filteredSales.map(sale => {
                    const isPending = ['PENDENTE', 'FIADO_PENDENTE', 'ABERTA'].includes(sale.status);
                    return (
                      <tr key={sale.id} className="hover:bg-stone-900/50 transition-colors">
                        <td className="py-3.5 px-4 font-mono font-bold text-stone-300">
                          #{sale.sale_number || sale.id.slice(0, 6)}
                        </td>
                        <td className="py-3.5 px-4 text-stone-400">
                          {formatDateTime(sale.created_at)}
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-stone-100">{sale.customer_name || 'Cliente Balcão'}</div>
                          {sale.customer_cpf && (
                            <div className="text-[10px] text-stone-500 font-mono">{sale.customer_cpf}</div>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-stone-300">
                          {sale.sale_items && sale.sale_items.length > 0 ? (
                            <span>{sale.sale_items.length} produto(s)</span>
                          ) : (
                            <span className="text-stone-500 italic">Lançamento avulso</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono font-black text-amber-400">
                          {formatCurrency(Number(sale.final_amount))}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <Badge className={isPending ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'}>
                            {isPending ? 'Em Aberto' : 'Quitada'}
                          </Badge>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          {isPending ? (
                            <Button
                              size="sm"
                              onClick={() => setSelectedSaleToSettle(sale)}
                              className="text-[11px] h-8 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold"
                            >
                              Dar Baixa
                            </Button>
                          ) : (
                            <span className="text-stone-500 text-[11px]">Pago</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* =======================================================================
          MODAL: LANÇAR DÉBITO MANUAL RÁPIDO
          ======================================================================= */}
      {isManualModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in">
          <div className="bg-stone-950 border border-amber-900/60 rounded-3xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-stone-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-amber-500/10 rounded-xl border border-amber-500/20">
                  <Plus className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white">Lançar Débito na Caderneta</h3>
                  <p className="text-xs text-stone-400">Registrar conta fiado diretamente</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsManualModalOpen(false)}
                className="text-stone-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateManualDebt} className="space-y-3.5">
              <div>
                <label className="text-xs font-bold text-stone-300 block mb-1">
                  Nome do Cliente *
                </label>
                <Input
                  type="text"
                  required
                  autoFocus
                  placeholder="Ex: João da Farmácia, Maurício Jr..."
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  className="bg-stone-900 border-stone-800 text-xs h-10"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-stone-300 block mb-1">
                  Telefone / WhatsApp (opcional)
                </label>
                <Input
                  type="text"
                  placeholder="(71) 99999-9999"
                  value={manualPhone}
                  onChange={(e) => setManualPhone(e.target.value)}
                  className="bg-stone-900 border-stone-800 text-xs h-10"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-stone-300 block mb-1">
                  Descrição dos Itens / Motivo (opcional)
                </label>
                <Input
                  type="text"
                  placeholder="Ex: 3 Latões Heineken + 1 Gelo"
                  value={manualDescription}
                  onChange={(e) => setManualDescription(e.target.value)}
                  className="bg-stone-900 border-stone-800 text-xs h-10"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-stone-300 block mb-1">
                  Valor Total do Débito (R$) *
                </label>
                <Input
                  type="number"
                  step="0.01"
                  required
                  placeholder="0.00"
                  value={manualAmount}
                  onChange={(e) => setManualAmount(e.target.value)}
                  className="bg-stone-900 border-amber-500/50 text-amber-300 font-mono font-bold text-base h-11"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsManualModalOpen(false)}
                  className="flex-1 text-xs h-10 border-stone-800 text-stone-300"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmittingManual}
                  className="flex-1 text-xs h-10 bg-amber-500 hover:bg-amber-400 text-stone-950 font-black shadow-lg shadow-amber-500/20"
                >
                  {isSubmittingManual ? 'Salvando...' : 'Confirmar Débito'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =======================================================================
          MODAL: EXTRATO COMPLETO DO CLIENTE
          ======================================================================= */}
      {selectedCustomerForStatement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in">
          <div className="bg-stone-950 border border-amber-900/60 rounded-3xl w-full max-w-xl p-6 shadow-2xl space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-stone-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-amber-500/10 rounded-xl border border-amber-500/20">
                  <FileText className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white">
                    Extrato: {selectedCustomerForStatement.customer_name}
                  </h3>
                  <p className="text-xs text-stone-400">
                    {selectedCustomerForStatement.sales.length} compra(s) a prazo registradas
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCustomerForStatement(null)}
                className="text-stone-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* RESUMO DO SALDO */}
            <div className="grid grid-cols-2 gap-2 p-3 bg-stone-900/80 rounded-2xl border border-stone-800 text-xs">
              <div>
                <span className="text-stone-400">Saldo Devedor Atual:</span>
                <div className="text-lg font-black text-amber-400 font-mono">
                  {formatCurrency(selectedCustomerForStatement.total_pending)}
                </div>
              </div>
              <div>
                <span className="text-stone-400">Total Já Quitado:</span>
                <div className="text-lg font-black text-emerald-400 font-mono">
                  {formatCurrency(selectedCustomerForStatement.total_settled)}
                </div>
              </div>
            </div>

            {/* LISTA DE COMPRAS */}
            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 divide-y divide-stone-900">
              {selectedCustomerForStatement.sales.map((sale, sIdx) => {
                const isPending = ['PENDENTE', 'FIADO_PENDENTE', 'ABERTA'].includes(sale.status);
                return (
                  <div key={sale.id} className="pt-2.5 first:pt-0 space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-stone-300">
                          Compra #{sale.sale_number || sale.id.slice(0, 6)}
                        </span>
                        <Badge className={isPending ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 text-[10px]' : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 text-[10px]'}>
                          {isPending ? 'Pendente' : 'Quitada'}
                        </Badge>
                      </div>
                      <span className="font-mono font-black text-stone-200">
                        {formatCurrency(Number(sale.final_amount))}
                      </span>
                    </div>

                    <div className="text-[11px] text-stone-400 flex items-center justify-between">
                      <span>Data: {formatDateTime(sale.created_at)}</span>
                      {isPending && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedCustomerForStatement(null);
                            setSelectedSaleToSettle(sale);
                          }}
                          className="text-amber-400 hover:underline font-bold text-[10px]"
                        >
                          Quitar esta compra
                        </button>
                      )}
                    </div>

                    {/* ITENS COMPRADOS */}
                    {sale.sale_items && sale.sale_items.length > 0 && (
                      <div className="p-2 bg-stone-900/40 rounded-xl space-y-1 text-[11px] text-stone-300">
                        {sale.sale_items.map((item: any, iIdx: number) => (
                          <div key={iIdx} className="flex justify-between">
                            <span className="truncate pr-2">
                              • {item.quantity}x {item.products?.name || item.product_name || 'Produto'}
                            </span>
                            <span className="font-mono text-stone-400 shrink-0">
                              {formatCurrency(Number(item.total_price || (item.quantity * item.unit_price)))}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* AÇÕES DE IMPRESSÃO / BAIXA */}
            <div className="pt-3 border-t border-stone-800 flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => handlePrintCustomerStatement(selectedCustomerForStatement)}
                className="flex-1 text-xs h-10 border-stone-800 bg-stone-900 text-stone-300 hover:text-white"
              >
                <Printer className="w-3.5 h-3.5 mr-1.5" />
                Imprimir Extrato POS-80
              </Button>

              {selectedCustomerForStatement.total_pending > 0 && (
                <Button
                  type="button"
                  onClick={() => {
                    const cust = selectedCustomerForStatement;
                    setSelectedCustomerForStatement(null);
                    setSelectedCustomerToSettle(cust);
                  }}
                  className="flex-1 text-xs h-10 bg-amber-500 hover:bg-amber-400 text-stone-950 font-black"
                >
                  <HandCoins className="w-3.5 h-3.5 mr-1.5" />
                  Receber Saldo Total
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =======================================================================
          MODAL: QUITAR / RECEBER SALDO TOTAL DO CLIENTE
          ======================================================================= */}
      {selectedCustomerToSettle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in">
          <div className="bg-stone-950 border border-amber-900/60 rounded-3xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-stone-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
                  <HandCoins className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white">Receber Conta Fiado</h3>
                  <p className="text-xs text-stone-400">Cliente: {selectedCustomerToSettle.customer_name}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCustomerToSettle(null)}
                className="text-stone-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* TOTAL A RECEBER */}
            <div className="p-4 bg-stone-900/90 border border-amber-500/30 rounded-2xl text-center space-y-1">
              <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                Valor Total a Receber
              </span>
              <div className="text-3xl font-black text-amber-300 font-mono">
                {formatCurrency(selectedCustomerToSettle.total_pending)}
              </div>
              <p className="text-[11px] text-stone-400">
                Quitação de todas as contas em aberto deste cliente
              </p>
            </div>

            {/* FORMA DE PAGAMENTO */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-stone-300 block">
                Forma de Pagamento Recebida *
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'DINHEIRO', label: 'Dinheiro', icon: Banknote },
                  { id: 'PIX', label: 'PIX', icon: QrCode },
                  { id: 'CARTAO_DEBITO', label: 'Débito', icon: CreditCard },
                  { id: 'CARTAO_CREDITO', label: 'Crédito', icon: CreditCard }
                ].map(m => {
                  const Icon = m.icon;
                  const isSel = settlementMethod === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setSettlementMethod(m.id as any)}
                      className={`p-3 rounded-xl border text-xs font-bold flex items-center gap-2 cursor-pointer transition-all ${
                        isSel
                          ? 'bg-amber-500 text-stone-950 border-amber-400 shadow-md'
                          : 'bg-stone-900 text-stone-300 border-stone-800 hover:border-stone-700'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{m.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setSelectedCustomerToSettle(null)}
                className="flex-1 text-xs h-11 border-stone-800 text-stone-300"
              >
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={handleSettleCustomerTotal}
                disabled={isSettling}
                className="flex-1 text-xs h-11 bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-black shadow-lg shadow-emerald-500/20"
              >
                {isSettling ? 'Dando Baixa...' : 'Confirmar e Quitar'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* =======================================================================
          MODAL: QUITAR VENDA INDIVIDUAL
          ======================================================================= */}
      {selectedSaleToSettle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in">
          <div className="bg-stone-950 border border-amber-900/60 rounded-3xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-stone-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
                  <HandCoins className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white">Quitar Compra Específica</h3>
                  <p className="text-xs text-stone-400">
                    Venda #{selectedSaleToSettle.sale_number || selectedSaleToSettle.id.slice(0, 6)} • {selectedSaleToSettle.customer_name}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSaleToSettle(null)}
                className="text-stone-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 bg-stone-900/90 border border-amber-500/30 rounded-2xl text-center space-y-1">
              <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                Valor desta Compra
              </span>
              <div className="text-3xl font-black text-amber-300 font-mono">
                {formatCurrency(Number(selectedSaleToSettle.final_amount))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-stone-300 block">
                Forma de Pagamento Recebida *
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'DINHEIRO', label: 'Dinheiro', icon: Banknote },
                  { id: 'PIX', label: 'PIX', icon: QrCode },
                  { id: 'CARTAO_DEBITO', label: 'Débito', icon: CreditCard },
                  { id: 'CARTAO_CREDITO', label: 'Crédito', icon: CreditCard }
                ].map(m => {
                  const Icon = m.icon;
                  const isSel = settlementMethod === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setSettlementMethod(m.id as any)}
                      className={`p-3 rounded-xl border text-xs font-bold flex items-center gap-2 cursor-pointer transition-all ${
                        isSel
                          ? 'bg-amber-500 text-stone-950 border-amber-400 shadow-md'
                          : 'bg-stone-900 text-stone-300 border-stone-800 hover:border-stone-700'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{m.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setSelectedSaleToSettle(null)}
                className="flex-1 text-xs h-11 border-stone-800 text-stone-300"
              >
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={handleSettleSingleSale}
                disabled={isSettling}
                className="flex-1 text-xs h-11 bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-black shadow-lg shadow-emerald-500/20"
              >
                {isSettling ? 'Dando Baixa...' : 'Confirmar e Quitar'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ÁREA DE IMPRESSÃO TÉRMICA */}
      <div id="thermal-receipt" className="hidden print:block">
        {activePrintData && <ThermalReceipt data={activePrintData} />}
      </div>
    </div>
  );
}
