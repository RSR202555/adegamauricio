'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  Package, 
  ArrowUpRight, 
  ArrowDownLeft, 
  RotateCcw, 
  AlertTriangle, 
  Search, 
  Filter, 
  PlusCircle, 
  Calendar,
  User,
  FileSpreadsheet,
  ScanBarcode,
  CheckCircle2,
  X,
  Plus,
  Minus,
  Trash2,
  DollarSign,
  AlertCircle,
  Barcode,
  Boxes,
  TrendingUp,
  Layers,
  SlidersHorizontal,
  RefreshCw
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import { StockMovement, Product } from '@/types/database';
import { matchProductByCode, parseProductMetadata } from '@/lib/products';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

// ============================================================================
// ÁUDIO WEB AUDIO API PARA CONFERÊNCIA DE MERCADORIA
// ============================================================================
function playTone(freq: number, duration: number, type: OscillatorType = 'sine') {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch {}
}

interface ReceivedItem {
  id: string; // `${productId}_${isBox ? 'box' : 'unit'}`
  product: Product;
  isBox: boolean;
  boxUnits: number;
  packageQty: number; // quantas caixas ou unidades
  totalUnits: number; // packageQty * boxUnits (quantidade que soma no estoque físico)
  costPerPackage: number; // quanto pagou por caixa ou unidade
  totalCost: number;
}

export default function EstoquePage() {
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('ALL');
  const [viewMode, setViewMode] = useState<'SALDOS' | 'MOVIMENTACOES'>('SALDOS');

  function handleOpenAdjustmentForProduct(prodId: string) {
    setSelectedProductId(prodId);
    setMovementType('AJUSTE');
    const prod = products.find(p => p.id === prodId);
    if (prod) {
      setQuantity(Number(prod.current_stock || 0));
      setCostPrice(String(prod.cost_price || ''));
    }
    setIsModalOpen(true);
  }
  
  // Modal de Ajuste Manual
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [movementType, setMovementType] = useState<'ENTRADA' | 'SAIDA' | 'PERDA' | 'AJUSTE'>('ENTRADA');
  const [quantity, setQuantity] = useState<number>(1);
  const [costPrice, setCostPrice] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // ============================================================================
  // MODAL DE RECEBER MERCADORIA (ENTRADA RÁPIDA POR BIPAGEM)
  // ============================================================================
  const [isReceivingModalOpen, setIsReceivingModalOpen] = useState(false);
  const [deliveryRef, setDeliveryRef] = useState('');
  const [receivingBarcode, setReceivingBarcode] = useState('');
  const [receivedItems, setReceivedItems] = useState<ReceivedItem[]>([]);
  const [receivingSuccessReceipt, setReceivingSuccessReceipt] = useState<any>(null);

  // Vínculo rápido de código de caixa novo direto no recebimento
  const [unknownCodeToLink, setUnknownCodeToLink] = useState<string | null>(null);
  const [linkTargetId, setLinkTargetId] = useState('');
  const [linkBoxUnits, setLinkBoxUnits] = useState('6');
  const [linkBoxPrice, setLinkBoxPrice] = useState('');
  const [linkMode, setLinkMode] = useState<'box' | 'unit'>('box');
  const [linking, setLinking] = useState(false);

  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const barcodeBufferRef = useRef<string>('');
  const lastKeyTimeRef = useRef<number>(0);

  const supabase = createClient();

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [prodRes, movRes] = await Promise.all([
        fetch('/api/products').then(res => res.json()).catch(() => ({ products: [] })),
        fetch('/api/stock?limit=250').then(res => res.json()).catch(() => ({ movements: [] }))
      ]);

      if (prodRes.products) setProducts(prodRes.products);
      if (movRes.movements) setMovements(movRes.movements);
    } catch (err) {
      console.error('Erro ao carregar movimentacoes:', err);
    } finally {
      setLoading(false);
    }
  }

  // ============================================================================
  // LEITOR DE CÓDIGO DE BARRAS USB (GLOBAL NO MODAL DE RECEBIMENTO)
  // ============================================================================
  useEffect(() => {
    if (!isReceivingModalOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(e.key)) return;

      const now = Date.now();
      const timeDiff = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;

      if (e.key === 'Enter') {
        const buffer = barcodeBufferRef.current.trim();
        barcodeBufferRef.current = '';

        if (buffer.length >= 4 && document.activeElement !== barcodeInputRef.current) {
          e.preventDefault();
          handleProcessScannedCode(buffer);
        }
      } else if (e.key.length === 1) {
        if (timeDiff > 90) barcodeBufferRef.current = '';
        barcodeBufferRef.current += e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isReceivingModalOpen, products, receivedItems]);

  function focusReceivingScanner() {
    setTimeout(() => {
      barcodeInputRef.current?.focus();
    }, 100);
  }

  // ============================================================================
  // PROCESSAR CÓDIGO BIPADO NO RECEBIMENTO
  // ============================================================================
  async function handleProcessScannedCode(rawCode: string) {
    const code = rawCode.trim();
    if (!code) return;

    let matched = matchProductByCode(products, code);

    // Se não encontrou no cache local, tenta buscar lista mais recente
    if (!matched) {
      try {
        const res = await fetch('/api/products');
        const data = await res.json();
        if (data.products) {
          setProducts(data.products);
          matched = matchProductByCode(data.products, code);
        }
      } catch {}
    }

    if (matched) {
      playTone(1760, 0.08); // Bipe de sucesso
      addItemToReception(matched.product, matched.isBox, matched.boxUnits);
      setReceivingBarcode('');
    } else {
      playTone(330, 0.2, 'sawtooth'); // Bipe de aviso
      // Abre modal para vincular o código à uma caixa existente ou avulso
      setUnknownCodeToLink(code);
      setLinkTargetId('');
      setLinkBoxUnits('6');
      setLinkBoxPrice('');
      setLinkMode('box');
      setReceivingBarcode('');
    }
    focusReceivingScanner();
  }

  function addItemToReception(product: Product, isBox: boolean, boxUnits: number) {
    const itemId = `${product.id}_${isBox ? 'box' : 'unit'}`;
    const unitsPerPack = isBox ? boxUnits : 1;
    const defaultCostPerPack = isBox 
      ? Number(product.cost_price || 0) * unitsPerPack 
      : Number(product.cost_price || 0);

    setReceivedItems(prev => {
      const existing = prev.find(item => item.id === itemId);
      if (existing) {
        const newQty = existing.packageQty + 1;
        const newTotalUnits = newQty * existing.boxUnits;
        const newTotalCost = newQty * existing.costPerPackage;
        return prev.map(item => item.id === itemId ? {
          ...item,
          packageQty: newQty,
          totalUnits: newTotalUnits,
          totalCost: newTotalCost
        } : item);
      }

      return [
        ...prev,
        {
          id: itemId,
          product,
          isBox,
          boxUnits: unitsPerPack,
          packageQty: 1,
          totalUnits: unitsPerPack,
          costPerPackage: defaultCostPerPack,
          totalCost: defaultCostPerPack
        }
      ];
    });
  }

  function updateItemPackageQty(itemId: string, newPkgQty: number) {
    if (newPkgQty <= 0) return;
    setReceivedItems(prev => prev.map(item => {
      if (item.id === itemId) {
        const totalUnits = newPkgQty * item.boxUnits;
        const totalCost = newPkgQty * item.costPerPackage;
        return { ...item, packageQty: newPkgQty, totalUnits, totalCost };
      }
      return item;
    }));
  }

  function updateItemPackageCost(itemId: string, newPkgCost: number) {
    setReceivedItems(prev => prev.map(item => {
      if (item.id === itemId) {
        return {
          ...item,
          costPerPackage: newPkgCost,
          totalCost: item.packageQty * newPkgCost
        };
      }
      return item;
    }));
  }

  function removeItemFromReception(itemId: string) {
    setReceivedItems(prev => prev.filter(item => item.id !== itemId));
    focusReceivingScanner();
  }

  // ============================================================================
  // VINCULAR CÓDIGO NOVO DIRETAMENTE NO FLUXO DE RECEBIMENTO
  // ============================================================================
  async function handleLinkCodeInReception() {
    if (!unknownCodeToLink || !linkTargetId) return;
    setLinking(true);
    try {
      const targetProd = products.find(p => p.id === linkTargetId);
      if (!targetProd) return;

      if (linkMode === 'box') {
        const units = parseFloat(linkBoxUnits) || 1;
        const price = parseFloat(linkBoxPrice) || (Number(targetProd.selling_price ?? targetProd.sale_price ?? 0) * units);

        const res = await fetch('/api/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'link_box_code',
            productId: linkTargetId,
            boxBarcode: unknownCodeToLink,
            boxUnits: units,
            boxPrice: price
          })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        // Atualiza a lista local
        const prodListRes = await fetch('/api/products').then(r => r.json());
        if (prodListRes.products) setProducts(prodListRes.products);

        // Adiciona imediatamente ao lote de recebimento
        addItemToReception(data.product || targetProd, true, units);
      } else {
        const res = await fetch('/api/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'link_secondary_code',
            productId: linkTargetId,
            barcode: unknownCodeToLink
          })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        const prodListRes = await fetch('/api/products').then(r => r.json());
        if (prodListRes.products) setProducts(prodListRes.products);

        addItemToReception(data.product || targetProd, false, 1);
      }

      playTone(1046, 0.08);
      setUnknownCodeToLink(null);
      setLinkTargetId('');
    } catch (err: any) {
      alert('Falha ao vincular código: ' + err.message);
    } finally {
      setLinking(false);
      focusReceivingScanner();
    }
  }

  // ============================================================================
  // FINALIZAR RECEBIMENTO E GRAVAR NO ESTOQUE
  // ============================================================================
  async function handleFinalizeReception() {
    if (receivedItems.length === 0) {
      alert('Nenhum item bipado para dar entrada.');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'batch_reception',
          delivery_ref: deliveryRef,
          items: receivedItems.map(item => ({
            product_id: item.product.id,
            total_units: item.totalUnits,
            package_qty: item.packageQty,
            is_box: item.isBox,
            box_units: item.boxUnits,
            cost_per_package: item.costPerPackage
          }))
        })
      });

      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Erro ao gravar recebimento');

      playTone(1046, 0.08);
      setTimeout(() => playTone(1567, 0.15), 80);

      setReceivingSuccessReceipt({
        date: new Date().toISOString(),
        ref: deliveryRef || 'Recebimento Geral',
        itemsCount: receivedItems.length,
        packagesCount: totalPackagesReceived,
        unitsCount: totalUnitsReceived,
        totalInvested: totalCostReception,
        items: [...receivedItems]
      });

      setReceivedItems([]);
      setDeliveryRef('');
      loadData();
    } catch (err: any) {
      alert('Falha ao processar recebimento: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  // ============================================================================
  // AJUSTE MANUAL (MODAL ANTIGO)
  // ============================================================================
  async function handleSaveMovement(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedProductId || quantity <= 0) {
      alert('Selecione um produto e informe uma quantidade válida.');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'manual_adjustment',
          product_id: selectedProductId,
          movement_type: movementType,
          quantity: Number(quantity),
          cost_price: costPrice || undefined,
          notes: notes || undefined
        })
      });

      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Erro ao registrar ajuste');

      alert('Movimentação registrada com sucesso!');
      setIsModalOpen(false);
      setSelectedProductId('');
      setQuantity(1);
      setCostPrice('');
      setNotes('');
      loadData();
    } catch (err: any) {
      alert('Falha ao registrar movimentação: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  const totalStockUnits = products.reduce((acc, p) => acc + Number(p.current_stock || 0), 0);
  const totalCostValue = products.reduce((acc, p) => acc + (Number(p.current_stock || 0) * Number(p.cost_price || 0)), 0);
  const totalSaleValue = products.reduce((acc, p) => acc + (Number(p.current_stock || 0) * Number(p.selling_price ?? p.sale_price ?? 0)), 0);
  const lowStockCount = products.filter(p => Number(p.current_stock || 0) <= Number(p.min_stock || 0)).length;

  const filteredProducts = products.filter(p => {
    const term = searchTerm.toLowerCase();
    return (
      (p.name || '').toLowerCase().includes(term) ||
      (p.barcode || '').toLowerCase().includes(term) ||
      (p.sku || '').toLowerCase().includes(term) ||
      (p.category_name || '').toLowerCase().includes(term)
    );
  });

  const filteredMovements = movements.filter(m => {
    const prodName = (m as any).products?.name?.toLowerCase() || '';
    const barcode = (m as any).products?.barcode?.toLowerCase() || '';
    const term = searchTerm.toLowerCase();

    const matchesSearch = prodName.includes(term) || barcode.includes(term) || (m.notes || '').toLowerCase().includes(term);
    const matchesType = filterType === 'ALL' || m.movement_type === filterType;

    return matchesSearch && matchesType;
  });

  const totalPackagesReceived = receivedItems.reduce((acc, i) => acc + i.packageQty, 0);
  const totalUnitsReceived = receivedItems.reduce((acc, i) => acc + i.totalUnits, 0);
  const totalCostReception = receivedItems.reduce((acc, i) => acc + i.totalCost, 0);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-amber-950/80">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full bg-amber-400"></span>
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400">Auditoria & Inventário</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-3">
            <Package className="w-7 h-7 text-amber-400" />
            Gestão & Movimentação de Estoque
          </h1>
          <p className="text-xs sm:text-sm text-stone-400 mt-1">
            Entrada rápida de caixas, avulsos, quebras, vendas e conferência de entregas
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <Button
            onClick={() => {
              setIsReceivingModalOpen(true);
              setReceivedItems([]);
              setDeliveryRef('');
              setReceivingBarcode('');
              setReceivingSuccessReceipt(null);
              focusReceivingScanner();
            }}
            className="bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 hover:from-amber-400 hover:to-yellow-400 text-stone-950 font-black text-xs sm:text-sm shadow-xl shadow-amber-950/70 border border-amber-300/40 cursor-pointer"
          >
            <ScanBarcode className="w-4 h-4 mr-1.5 stroke-[2.5]" />
            Receber Mercadoria (Bipagem)
          </Button>

          <Button
            variant="outline"
            onClick={() => {
              setSelectedProductId('');
              setMovementType('ENTRADA');
              setQuantity(1);
              setCostPrice('');
              setNotes('');
              setIsModalOpen(true);
            }}
            className="border-stone-800 text-stone-300 hover:text-white font-bold text-xs sm:text-sm cursor-pointer"
          >
            <PlusCircle className="w-4 h-4 mr-1.5" />
            Ajuste Manual
          </Button>

          <Button
            variant="outline"
            onClick={loadData}
            title="Recarregar dados"
            className="border-stone-800 text-stone-300 hover:text-white p-2"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-amber-400' : ''}`} />
          </Button>
        </div>
      </div>

      {/* CARDS DE INDICADORES / METRICAS DE ESTOQUE */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-stone-900/80 border border-stone-800 p-4 rounded-2xl shadow-xl">
          <div className="flex items-center justify-between text-stone-400 text-xs font-bold uppercase tracking-wider mb-2">
            <span>Total em Estoque</span>
            <Boxes className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-black text-amber-300 font-mono">
            {totalStockUnits} <span className="text-xs font-normal text-stone-400">unidades</span>
          </div>
          <span className="text-[11px] text-stone-500 mt-1 block">{products.length} itens cadastrados</span>
        </div>

        <div className="bg-stone-900/80 border border-stone-800 p-4 rounded-2xl shadow-xl">
          <div className="flex items-center justify-between text-stone-400 text-xs font-bold uppercase tracking-wider mb-2">
            <span>Patrimônio (Custo)</span>
            <DollarSign className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-emerald-300 font-mono">
            {formatCurrency(totalCostValue)}
          </div>
          <span className="text-[11px] text-stone-500 mt-1 block">Capital imobilizado</span>
        </div>

        <div className="bg-stone-900/80 border border-stone-800 p-4 rounded-2xl shadow-xl">
          <div className="flex items-center justify-between text-stone-400 text-xs font-bold uppercase tracking-wider mb-2">
            <span>Potencial de Venda</span>
            <TrendingUp className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-black text-amber-400 font-mono">
            {formatCurrency(totalSaleValue)}
          </div>
          <span className="text-[11px] text-stone-500 mt-1 block">Faturamento esperado</span>
        </div>

        <div className="bg-stone-900/80 border border-stone-800 p-4 rounded-2xl shadow-xl">
          <div className="flex items-center justify-between text-stone-400 text-xs font-bold uppercase tracking-wider mb-2">
            <span>Estoque Baixo / Crítico</span>
            <AlertTriangle className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-2xl font-black text-rose-400 font-mono">
            {lowStockCount} <span className="text-xs font-normal text-stone-400">itens</span>
          </div>
          <span className="text-[11px] text-stone-500 mt-1 block">Abaixo do estoque mínimo</span>
        </div>
      </div>

      {/* SELETOR DE ABAS ENTRE SALDOS E AUDITORIA */}
      <div className="flex items-center gap-2 border-b border-stone-800 pb-2">
        <button
          type="button"
          onClick={() => setViewMode('SALDOS')}
          className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer ${
            viewMode === 'SALDOS'
              ? 'bg-amber-500 text-stone-950 shadow-md shadow-amber-950/60'
              : 'bg-stone-900 text-stone-400 hover:text-white border border-stone-800'
          }`}
        >
          <Boxes className="w-4 h-4" />
          <span>Posição de Estoque (Balanço & Saldo Atual)</span>
          <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-stone-950/20">{products.length}</span>
        </button>

        <button
          type="button"
          onClick={() => setViewMode('MOVIMENTACOES')}
          className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer ${
            viewMode === 'MOVIMENTACOES'
              ? 'bg-amber-500 text-stone-950 shadow-md shadow-amber-950/60'
              : 'bg-stone-900 text-stone-400 hover:text-white border border-stone-800'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Histórico de Auditoria & Movimentações</span>
          <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-stone-950/20">{movements.length}</span>
        </button>
      </div>

      {/* FILTROS E BUSCA */}
      <div className="bg-stone-950 border border-amber-900/40 p-4 rounded-2xl flex flex-col md:flex-row gap-4 items-center justify-between shadow-xl">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500" />
          <Input
            type="text"
            placeholder={viewMode === 'SALDOS' ? "Buscar produto por nome, código de barras ou SKU..." : "Buscar movimentação por produto, código ou motivo..."}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        {viewMode === 'MOVIMENTACOES' && (
          <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-2 md:pb-0">
            <Filter className="w-4 h-4 text-stone-400" />
            <span className="text-xs text-stone-400 uppercase tracking-wider font-bold mr-1">Tipo:</span>
            {['ALL', 'ENTRADA', 'VENDA', 'PERDA', 'AJUSTE', 'ESTORNO'].map((type) => (
              <button
                key={type}
                onClick={() => setFilterType(type)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  filterType === type 
                    ? 'bg-amber-500 text-stone-950 font-black shadow-md shadow-amber-950/50' 
                    : 'bg-stone-900 text-stone-400 hover:text-white border border-stone-800'
                }`}
              >
                {type === 'ALL' ? 'Todos' : type}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ABA 1: POSIÇÃO DE ESTOQUE (SALDO ATUAL & BALANÇO) */}
      {viewMode === 'SALDOS' && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-stone-800 bg-stone-900/60 text-stone-400 text-xs font-semibold uppercase tracking-wider">
                  <th className="py-3.5 px-4">Produto</th>
                  <th className="py-3.5 px-4">Código / SKU</th>
                  <th className="py-3.5 px-4">Categoria</th>
                  <th className="py-3.5 px-4 text-right">Preço Custo</th>
                  <th className="py-3.5 px-4 text-right">Preço Venda</th>
                  <th className="py-3.5 px-4 text-right">Saldo Atual</th>
                  <th className="py-3.5 px-4 text-center">Status</th>
                  <th className="py-3.5 px-4 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-800/80 text-stone-300">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-stone-500 text-xs">Carregando catálogo de produtos...</td>
                  </tr>
                ) : filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-stone-500 text-xs">Nenhum produto encontrado.</td>
                  </tr>
                ) : (
                  filteredProducts.map((p) => {
                    const currentStock = Number(p.current_stock || 0);
                    const minStock = Number(p.min_stock || 0);
                    const isZero = currentStock <= 0;
                    const isLow = currentStock <= minStock && !isZero;

                    return (
                      <tr key={p.id} className="hover:bg-stone-900/50 transition-colors">
                        <td className="py-3 px-4 font-bold text-white">
                          {p.name}
                        </td>
                        <td className="py-3 px-4 font-mono text-xs text-stone-400">
                          {p.barcode || p.sku || '-'}
                        </td>
                        <td className="py-3 px-4 text-xs text-stone-400">
                          {p.category_name || '-'}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-xs text-stone-400">
                          {formatCurrency(Number(p.cost_price || 0))}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-xs text-amber-300 font-bold">
                          {formatCurrency(Number(p.selling_price ?? p.sale_price ?? 0))}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-base">
                          <span className={isZero ? 'text-rose-400 font-black' : isLow ? 'text-amber-400 font-bold' : 'text-emerald-400 font-bold'}>
                            {currentStock} <span className="text-xs text-stone-500 font-normal">{p.unit || 'un'}</span>
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          {isZero ? (
                            <Badge variant="destructive" className="text-[10px] uppercase font-bold">Zerado</Badge>
                          ) : isLow ? (
                            <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/40 text-[10px] uppercase font-bold">Baixo</Badge>
                          ) : (
                            <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/40 text-[10px] uppercase font-bold">Normal</Badge>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleOpenAdjustmentForProduct(p.id)}
                            className="text-xs border-stone-800 hover:bg-stone-800 text-stone-300 cursor-pointer h-8 px-2.5"
                          >
                            <SlidersHorizontal className="w-3.5 h-3.5 mr-1 text-amber-400" />
                            Ajustar
                          </Button>
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

      {/* ABA 2: HISTÓRICO DE AUDITORIA & MOVIMENTAÇÕES */}
      {viewMode === 'MOVIMENTACOES' && (
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-stone-800 bg-stone-900/60 text-stone-400 text-xs font-semibold uppercase tracking-wider">
                <th className="py-3.5 px-4">Data / Hora</th>
                <th className="py-3.5 px-4">Produto</th>
                <th className="py-3.5 px-4">Tipo</th>
                <th className="py-3.5 px-4 text-right">Qtd Movimentada</th>
                <th className="py-3.5 px-4 text-right">Estoque Anterior</th>
                <th className="py-3.5 px-4 text-right">Novo Saldo</th>
                <th className="py-3.5 px-4">Motivo / Observação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-800/80 text-stone-300">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-stone-500 text-xs">Carregando auditoria de estoque...</td>
                </tr>
              ) : filteredMovements.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-stone-500 text-xs">Nenhuma movimentação encontrada.</td>
                </tr>
              ) : (
                filteredMovements.map((mov) => {
                  const isEntrada = mov.movement_type === 'ENTRADA';
                  const isVenda = mov.movement_type === 'VENDA';
                  const isPerda = mov.movement_type === 'PERDA';

                  return (
                    <tr key={mov.id} className="hover:bg-stone-900/50 transition-colors">
                      <td className="py-3 px-4 text-xs font-mono text-stone-400">
                        {formatDateTime(mov.created_at)}
                      </td>
                      <td className="py-3 px-4 font-bold text-white">
                        {(mov as any).products?.name || 'Produto Não Identificado'}
                        {(mov as any).products?.barcode && (
                          <span className="block text-[11px] font-mono text-stone-500 font-normal">
                            {(mov as any).products.barcode}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <Badge 
                          variant={
                            isEntrada ? 'default' : 
                            isVenda ? 'secondary' : 
                            isPerda ? 'destructive' : 'outline'
                          }
                          className="text-[10px] font-bold tracking-wider"
                        >
                          {mov.movement_type}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold">
                        <span className={isEntrada ? 'text-emerald-400' : isVenda || isPerda ? 'text-rose-400' : 'text-amber-400'}>
                          {isEntrada ? '+' : isVenda || isPerda ? '' : ''}{mov.quantity}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-stone-400 text-xs">
                        {mov.previous_stock}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-white font-bold text-xs">
                        {mov.new_stock}
                      </td>
                      <td className="py-3 px-4 text-xs text-stone-400 max-w-xs truncate">
                        {mov.notes || '-'}
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

      {/* =========================================================================
          MODAL DE RECEBIMENTO DE MERCADORIA POR BIPAGEM (BALCÃO / DESCARGA)
          ========================================================================= */}
      {isReceivingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-stone-950 border border-amber-500/60 rounded-3xl w-full max-w-4xl max-h-[92vh] overflow-hidden shadow-2xl flex flex-col">
            {/* CABEÇALHO */}
            <div className="p-5 border-b border-stone-800 flex items-center justify-between bg-stone-950/90 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shadow-lg shadow-amber-950/50">
                  <ScanBarcode className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-lg font-black text-white flex items-center gap-2">
                    Recebimento de Mercadoria
                    <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/40 uppercase font-mono font-bold">
                      Sem Burocracia Fiscal
                    </span>
                  </h2>
                  <p className="text-xs text-stone-400">
                    Bipe as caixas ou garrafas conforme o entregador descarrega na adega
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsReceivingModalOpen(false)}
                className="text-stone-400 hover:text-white p-2 rounded-xl hover:bg-stone-900"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* CORPO DO MODAL */}
            <div className="p-5 space-y-4 flex-1 overflow-y-auto no-scrollbar">
              {/* CAMPO DE IDENTIFICAÇÃO DA ENTREGA (OPCIONAL) */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-stone-900/60 p-3.5 rounded-2xl border border-stone-800">
                <div className="sm:col-span-2 space-y-1">
                  <label className="text-[11px] font-bold text-stone-300 uppercase tracking-wider">
                    Identificação da Carga / Número da NF (Opcional)
                  </label>
                  <Input
                    type="text"
                    placeholder="Ex: NF 4820 - Distribuidora Ambev / Compra Assaí..."
                    value={deliveryRef}
                    onChange={(e) => setDeliveryRef(e.target.value)}
                    className="bg-stone-950 border-stone-800 text-xs text-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-stone-300 uppercase tracking-wider">
                    Modo Leitor Laser
                  </label>
                  <div className="h-10 rounded-xl bg-stone-950 border border-stone-800 px-3 flex items-center justify-between text-xs font-mono">
                    <span className="text-stone-400">Status:</span>
                    <span className="text-emerald-400 font-bold flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                      Pronto p/ Bipar
                    </span>
                  </div>
                </div>
              </div>

              {/* CAMPO GIGANTE DE BIPAGEM COM O LEITOR */}
              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  handleProcessScannedCode(receivingBarcode);
                }}
                className="relative"
              >
                <div className="flex items-center gap-3 bg-stone-950 border-2 border-amber-500 rounded-2xl p-2.5 shadow-2xl focus-within:ring-4 focus-within:ring-amber-500/20">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center text-amber-400 font-black flex-shrink-0">
                    <Barcode className="w-6 h-6" />
                  </div>
                  <input
                    ref={barcodeInputRef}
                    type="text"
                    placeholder="BIPE A CAIXA OU GARRAFA COM O LEITOR (OU DIGITE O CÓDIGO)..."
                    value={receivingBarcode}
                    onChange={(e) => setReceivingBarcode(e.target.value)}
                    className="w-full bg-transparent text-amber-100 font-mono text-sm sm:text-base font-black uppercase tracking-wider placeholder:text-stone-600 placeholder:font-sans placeholder:text-xs placeholder:font-normal focus:outline-none"
                  />
                  <Button
                    type="submit"
                    className="h-10 px-5 bg-gradient-to-r from-amber-500 to-yellow-500 text-stone-950 font-black rounded-xl text-xs flex-shrink-0"
                  >
                    Bipar (Enter)
                  </Button>
                </div>
              </form>

              {/* LISTA DE ITENS CONFERIDOS NA ENTREGA */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-stone-400 px-1 font-semibold uppercase tracking-wider">
                  <span>Itens Conferidos da Carga ({receivedItems.length})</span>
                  <span>Altere a quantidade de caixas conforme os fardos descerem</span>
                </div>

                <div className="border border-stone-800 rounded-2xl overflow-hidden divide-y divide-stone-800 bg-stone-950/60 max-h-72 overflow-y-auto">
                  {receivedItems.length === 0 ? (
                    <div className="py-12 text-center text-stone-500 text-xs space-y-2">
                      <ScanBarcode className="w-8 h-8 text-stone-600 mx-auto animate-pulse" />
                      <p>Nenhuma caixa ou produto bipado ainda.</p>
                      <p className="text-[11px] text-stone-600">
                        Passe o leitor de código de barras nas caixas da entrega para adicionar aqui.
                      </p>
                    </div>
                  ) : (
                    receivedItems.map((item) => (
                      <div key={item.id} className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-stone-900/60 transition-colors">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-white text-sm truncate">
                              {item.product.name}
                            </span>
                            {item.isBox ? (
                              <span className="px-2 py-0.5 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300 font-mono text-[10px] font-black uppercase whitespace-nowrap">
                                📦 Caixa c/ {item.boxUnits} un
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-lg bg-stone-800 text-stone-300 font-mono text-[10px] font-bold uppercase whitespace-nowrap">
                                🏷️ Avulso (Unidade)
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-stone-400 font-mono mt-0.5 flex items-center gap-3">
                            <span>Estoque atual: {item.product.current_stock} un</span>
                            <span className="text-emerald-400 font-bold">
                              ➔ Entrará: +{item.totalUnits} unidades
                            </span>
                          </div>
                        </div>

                        {/* CONTROLE DE QUANTIDADE DE PACOTES E PREÇO DE CUSTO */}
                        <div className="flex items-center gap-3 self-end sm:self-center font-mono">
                          {/* QTD DE CAIXAS */}
                          <div className="text-right">
                            <label className="text-[10px] text-stone-400 block font-sans uppercase font-bold">
                              {item.isBox ? 'Qtd Caixas' : 'Qtd Avulsa'}
                            </label>
                            <div className="flex items-center gap-1 mt-0.5">
                              <button
                                type="button"
                                onClick={() => updateItemPackageQty(item.id, item.packageQty - 1)}
                                className="w-6 h-6 rounded bg-stone-900 hover:bg-stone-800 border border-stone-800 text-stone-300 flex items-center justify-center font-bold"
                              >
                                -
                              </button>
                              <input
                                type="number"
                                min="1"
                                value={item.packageQty}
                                onChange={(e) => updateItemPackageQty(item.id, parseInt(e.target.value) || 1)}
                                className="w-14 h-6 bg-stone-900 border border-stone-800 rounded text-center text-xs font-bold text-amber-300"
                              />
                              <button
                                type="button"
                                onClick={() => updateItemPackageQty(item.id, item.packageQty + 1)}
                                className="w-6 h-6 rounded bg-stone-900 hover:bg-stone-800 border border-stone-800 text-stone-300 flex items-center justify-center font-bold"
                              >
                                +
                              </button>
                            </div>
                          </div>

                          {/* CUSTO PAGO POR CAIXA */}
                          <div className="text-right">
                            <label className="text-[10px] text-stone-400 block font-sans uppercase font-bold">
                              {item.isBox ? 'Custo / Caixa (R$)' : 'Custo / Un (R$)'}
                            </label>
                            <input
                              type="number"
                              step="0.01"
                              placeholder="0.00"
                              value={item.costPerPackage || ''}
                              onChange={(e) => updateItemPackageCost(item.id, parseFloat(e.target.value) || 0)}
                              className="w-24 h-6 mt-0.5 bg-stone-900 border border-stone-800 rounded text-right px-2 text-xs font-bold text-stone-200"
                            />
                          </div>

                          {/* REMOVER */}
                          <button
                            type="button"
                            onClick={() => removeItemFromReception(item.id)}
                            className="text-stone-600 hover:text-rose-400 p-1.5 rounded-lg hover:bg-rose-950/40 transition-colors ml-1"
                            title="Remover da lista"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* PAINEL DE TOTAIS DA DESCARGA */}
              {receivedItems.length > 0 && (
                <div className="bg-gradient-to-r from-stone-900 via-stone-900/90 to-stone-950 p-4 rounded-2xl border border-stone-800 grid grid-cols-3 gap-4 font-mono text-center">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-stone-400 font-sans block">Volumes / Caixas</span>
                    <span className="text-lg font-black text-amber-400">{totalPackagesReceived}</span>
                  </div>
                  <div className="border-x border-stone-800">
                    <span className="text-[10px] uppercase font-bold text-stone-400 font-sans block">Unidades no Estoque</span>
                    <span className="text-lg font-black text-emerald-400">+{totalUnitsReceived} un</span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-stone-400 font-sans block">Total da Compra</span>
                    <span className="text-lg font-black text-white">{formatCurrency(totalCostReception)}</span>
                  </div>
                </div>
              )}
            </div>

            {/* RODAPÉ DO MODAL */}
            <div className="p-4 border-t border-stone-800 flex items-center justify-between bg-stone-950/95 flex-shrink-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsReceivingModalOpen(false)}
                className="text-stone-400 text-xs"
              >
                Cancelar
              </Button>

              <Button
                type="button"
                onClick={handleFinalizeReception}
                disabled={receivedItems.length === 0 || saving}
                className="bg-gradient-to-r from-emerald-500 via-emerald-600 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-black text-xs sm:text-sm px-6 shadow-xl shadow-emerald-950/70 border border-emerald-400/40"
              >
                {saving ? 'Gravando Estoque...' : 'Confirmar e Concluir Entrada no Estoque'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL DE VÍNCULO RÁPIDO DE CÓDIGO DESCONHECIDO NO RECEBIMENTO
          ========================================================================= */}
      {unknownCodeToLink && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-150">
          <div className="bg-stone-950 border border-amber-500/80 rounded-3xl w-full max-w-lg p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-stone-800">
              <div className="flex items-center gap-2.5">
                <AlertCircle className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-black text-white">Código de Caixa não Reconhecido</h3>
              </div>
              <button
                onClick={() => setUnknownCodeToLink(null)}
                className="text-stone-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-stone-900 rounded-xl border border-stone-800 flex items-center justify-between font-mono">
              <span className="text-xs text-stone-400">Código Bipado da Caixa:</span>
              <span className="text-sm font-black text-amber-400">{unknownCodeToLink}</span>
            </div>

            <p className="text-xs text-stone-300">
              Esta caixa que chegou pertence a qual produto do seu cadastro?
            </p>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setLinkMode('box')}
                className={`flex-1 py-2 text-xs font-bold rounded-xl border transition-all ${
                  linkMode === 'box'
                    ? 'bg-amber-500 text-stone-950 border-amber-400 shadow-md font-black'
                    : 'bg-stone-900 text-stone-400 border-stone-800'
                }`}
              >
                📦 É uma Caixa Fechada
              </button>
              <button
                type="button"
                onClick={() => setLinkMode('unit')}
                className={`flex-1 py-2 text-xs font-bold rounded-xl border transition-all ${
                  linkMode === 'unit'
                    ? 'bg-amber-500 text-stone-950 border-amber-400 shadow-md font-black'
                    : 'bg-stone-900 text-stone-400 border-stone-800'
                }`}
              >
                🏷️ É Unidade Avulsa
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-stone-300 uppercase tracking-wider">
                Selecione o Produto Existente:
              </label>
              <select
                value={linkTargetId}
                onChange={(e) => {
                  setLinkTargetId(e.target.value);
                  const selected = products.find(p => p.id === e.target.value);
                  if (selected && linkMode === 'box') {
                    setLinkBoxUnits((selected.box_units || 6).toString());
                    setLinkBoxPrice(selected.box_price ? selected.box_price.toString() : '');
                  }
                }}
                className="w-full h-11 px-3 rounded-xl bg-stone-900 border border-stone-800 text-white text-xs font-semibold focus:outline-none focus:border-amber-500"
              >
                <option value="">Selecione o produto no catálogo...</option>
                {products.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} {p.barcode ? `(EAN: ${p.barcode})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {linkMode === 'box' && linkTargetId && (
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-stone-400 uppercase">
                    Unidades por Caixa *
                  </label>
                  <Input
                    type="number"
                    value={linkBoxUnits}
                    onChange={(e) => setLinkBoxUnits(e.target.value)}
                    className="font-mono text-xs font-bold text-amber-300"
                  />
                  <span className="text-[10px] text-stone-500">Ex: 6 garrafas</span>
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-stone-400 uppercase">
                    Preço Venda Caixa (R$)
                  </label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="Ex: 180.00"
                    value={linkBoxPrice}
                    onChange={(e) => setLinkBoxPrice(e.target.value)}
                    className="font-mono text-xs font-bold text-emerald-400"
                  />
                  <span className="text-[10px] text-stone-500">Para venda no PDV</span>
                </div>
              </div>
            )}

            <div className="flex gap-2.5 pt-3 border-t border-stone-800">
              <Button
                type="button"
                variant="outline"
                onClick={() => setUnknownCodeToLink(null)}
                className="flex-1 text-xs"
              >
                Ignorar
              </Button>
              <Button
                type="button"
                onClick={handleLinkCodeInReception}
                disabled={!linkTargetId || linking}
                className="flex-1 bg-gradient-to-r from-amber-500 to-yellow-500 text-stone-950 font-black text-xs shadow-lg shadow-amber-950/50"
              >
                {linking ? 'Vinculando...' : 'Vincular e Adicionar à Carga'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          RECIBO DE SUCESSO DE ENTRADA DE MERCADORIA
          ========================================================================= */}
      {receivingSuccessReceipt && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-stone-950 border border-emerald-500/60 rounded-3xl w-full max-w-sm p-6 shadow-2xl space-y-4 text-center">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center mx-auto shadow-lg shadow-emerald-950/60">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div>
              <h3 className="text-xl font-black text-white">Estoque Alimentado!</h3>
              <p className="text-xs text-stone-400 mt-1">Carga conferida e lançada com sucesso.</p>
            </div>

            <div className="p-4 bg-stone-900/90 rounded-2xl border border-stone-800 font-mono text-xs space-y-2 text-left">
              <div className="flex justify-between text-stone-400">
                <span>Documento / Ref:</span>
                <span className="text-white font-bold">{receivingSuccessReceipt.ref}</span>
              </div>
              <div className="flex justify-between text-stone-400">
                <span>Volumes Conferidos:</span>
                <span className="text-amber-400 font-bold">{receivingSuccessReceipt.totalPackages} caixas</span>
              </div>
              <div className="flex justify-between text-stone-400">
                <span>Unidades Adicionadas:</span>
                <span className="text-emerald-400 font-bold">+{receivingSuccessReceipt.totalUnits} unidades</span>
              </div>
              {receivingSuccessReceipt.totalCost > 0 && (
                <div className="flex justify-between text-stone-400 border-t border-stone-800 pt-1">
                  <span>Valor Total da Carga:</span>
                  <span className="text-white font-bold">{formatCurrency(receivingSuccessReceipt.totalCost)}</span>
                </div>
              )}
            </div>

            <Button
              type="button"
              onClick={() => {
                setReceivingSuccessReceipt(null);
                setIsReceivingModalOpen(false);
              }}
              className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 text-stone-950 font-black text-xs py-2.5 rounded-xl"
            >
              Concluir e Fechar
            </Button>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL DE AJUSTE MANUAL
          ========================================================================= */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-stone-950 border border-amber-900/60 rounded-3xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-stone-800">
              <h3 className="text-base font-black text-white">Nova Movimentação de Estoque</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-stone-400 hover:text-white p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveMovement} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-stone-300 mb-1">Produto *</label>
                <select
                  value={selectedProductId}
                  onChange={(e) => {
                    setSelectedProductId(e.target.value);
                    const p = products.find(item => item.id === e.target.value);
                    if (p) setCostPrice(p.cost_price.toString());
                  }}
                  required
                  className="w-full bg-stone-900 border border-stone-800 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-amber-500"
                >
                  <option value="">Selecione um produto...</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} (Saldo atual: {p.current_stock} {p.unit})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-stone-300 mb-1">Tipo de Movimento *</label>
                  <select
                    value={movementType}
                    onChange={(e) => setMovementType(e.target.value as any)}
                    className="w-full bg-stone-900 border border-stone-800 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-amber-500"
                  >
                    <option value="ENTRADA">Entrada de Mercadoria</option>
                    <option value="SAIDA">Saída Avulsa</option>
                    <option value="PERDA">Perda / Avaria / Quebra</option>
                    <option value="AJUSTE">Ajuste / Inventário Físico</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-300 mb-1">
                    {movementType === 'AJUSTE' ? 'Novo Saldo Real *' : 'Quantidade *'}
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0.001"
                    value={quantity}
                    onChange={(e) => setQuantity(parseFloat(e.target.value) || 0)}
                    required
                    className="w-full bg-stone-900 border border-stone-800 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {movementType === 'ENTRADA' && (
                <div>
                  <label className="block text-xs font-bold text-stone-300 mb-1">Preço de Custo Unitário (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={costPrice}
                    onChange={(e) => setCostPrice(e.target.value)}
                    placeholder="Ex: 4.50"
                    className="w-full bg-stone-900 border border-stone-800 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-amber-500"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-stone-300 mb-1">Motivo / Justificativa</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Ex: Quebra de garrafa no depósito, compra NF 1234, inventário semanal..."
                  className="w-full bg-stone-900 border border-stone-800 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-stone-800">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsModalOpen(false)}
                  className="text-stone-400 text-xs"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={saving}
                  className="text-xs font-black shadow-lg shadow-amber-950/60"
                >
                  {saving ? 'Gravando...' : 'Confirmar Lançamento'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
