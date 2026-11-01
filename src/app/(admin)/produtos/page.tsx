'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  Package, 
  Search, 
  Plus, 
  AlertCircle, 
  Edit, 
  Trash2, 
  CheckCircle2, 
  Barcode, 
  ScanBarcode, 
  Volume2, 
  VolumeX, 
  TrendingUp, 
  DollarSign, 
  X, 
  Sparkles, 
  ArrowUpDown, 
  RefreshCw, 
  Check, 
  SlidersHorizontal,
  Layers,
  Archive,
  ArrowRight
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency } from '@/lib/utils';
import { Product, Category } from '@/types/database';
import { matchProductByCode, parseProductMetadata } from '@/lib/products';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

// ============================================================================
// SÍNTESE DE ÁUDIO WEB AUDIO API (SEM DEPENDÊNCIA EXTERNA)
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
  } catch {
    // Ignore audio errors on un-interacted DOM
  }
}

function playScanSound() {
  playTone(1760, 0.08, 'sine'); // Bipe agudo característico de leitor laser de PDV
}

function playSuccessSound() {
  playTone(1046, 0.06, 'triangle');
  setTimeout(() => playTone(1567, 0.12, 'triangle'), 60);
}

function playWarningSound() {
  playTone(440, 0.15, 'sawtooth');
}

// Gerador de código EAN-13 interno para produtos sem código de barras original
function generateInternalBarcode(): string {
  const prefix = '7899'; // Prefixo nacional padrão adega interna
  const randomPart = Math.floor(10000000 + Math.random() * 90000000).toString();
  const raw12 = (prefix + randomPart).slice(0, 12);
  
  // Cálculo de dígito verificador EAN-13
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(raw12[i], 10);
    sum += i % 2 === 0 ? digit : digit * 3;
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  return raw12 + checkDigit.toString();
}

const UNITS = [
  { label: 'Unidade (un)', value: 'un' },
  { label: 'Lata (lata)', value: 'lata' },
  { label: 'Garrafa (gf)', value: 'garrafa' },
  { label: 'Fardo (fd)', value: 'fardo' },
  { label: 'Caixa (cx)', value: 'cx' },
  { label: 'Dose (ds)', value: 'dose' },
];

export default function ProdutosPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [filterStock, setFilterStock] = useState<'all' | 'low' | 'out'>('all');
  const [soundEnabled, setSoundEnabled] = useState(true);
  
  // Modal de Cadastro / Edição
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  
  // Quick Stock Adjustment Modal
  const [quickStockProduct, setQuickStockProduct] = useState<Product | null>(null);
  const [quickStockDelta, setQuickStockDelta] = useState<string>('');
  
  // Barcode Scanner detection
  const [lastScanned, setLastScanned] = useState<{ code: string; time: string; name?: string } | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const barcodeBufferRef = useRef<string>('');
  const lastKeyTimeRef = useRef<number>(0);
  
  // Form State
  const [formData, setFormData] = useState({
    name: '',
    barcode: '',
    sku: '',
    category_id: '',
    category_name: '',
    unit: 'un',
    cost_price: '',
    sale_price: '',
    current_stock: '0',
    min_stock: '5',
    active: true,
    description: '',
    box_enabled: false,
    box_units: '6',
    box_price: '',
    box_barcodes: [] as string[],
    secondary_barcodes: [] as string[],
  });

  const [newBoxCodeInput, setNewBoxCodeInput] = useState('');
  const [newSecondaryCodeInput, setNewSecondaryCodeInput] = useState('');

  const barcodeInputModalRef = useRef<HTMLInputElement>(null);
  const nameInputModalRef = useRef<HTMLInputElement>(null);

  const supabase = createClient();
  const defaultCompanyId = '00000000-0000-0000-0000-000000000001';

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const res = await fetch('/api/products');
      const prodRes = await res.json();

      if (prodRes.error) throw new Error(prodRes.error);

      setProducts(prodRes.products || []);
      setCategories(prodRes.categories || []);
    } catch (err) {
      console.error('Erro ao carregar dados:', err);
    } finally {
      setLoading(false);
    }
  }

  // ============================================================================
  // ESCUTA GLOBAL DO LEITOR DE CÓDIGO DE BARRAS USB (TECLADO RÁPIDO)
  // ============================================================================
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignorar teclas modificadoras
      if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(e.key)) return;

      const now = Date.now();
      const timeDiff = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;

      // O leitor de código de barras transmite teclas com intervalo < 45ms
      if (e.key === 'Enter') {
        const buffer = barcodeBufferRef.current.trim();
        barcodeBufferRef.current = '';

        // Se o buffer acumulou mais de 3 caracteres rápidos (característica de leitor)
        if (buffer.length >= 4) {
          e.preventDefault();
          handleScannedBarcode(buffer);
        }
      } else if (e.key.length === 1) {
        // Se demorou mais de 90ms entre teclas e não estamos no meio de um scan rápido, reseta o buffer
        if (timeDiff > 90) {
          barcodeBufferRef.current = '';
        }
        barcodeBufferRef.current += e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [products, isModalOpen]);

  function handleScannedBarcode(scannedCode: string) {
    if (soundEnabled) playScanSound();

    // Se o modal de cadastro já estiver aberto, preenche o campo de código de barras
    if (isModalOpen) {
      setFormData(prev => ({
        ...prev,
        barcode: scannedCode,
        sku: prev.sku || scannedCode.slice(-6).toUpperCase()
      }));
      setLastScanned({ code: scannedCode, time: new Date().toLocaleTimeString() });
      if (nameInputModalRef.current) nameInputModalRef.current.focus();
      return;
    }

    // Procura se o produto já existe usando a inteligência de múltiplos códigos (incluindo códigos de caixa)
    const matched = matchProductByCode(products, scannedCode);

    if (matched) {
      const found = matched.product;
      // Produto já existe: destaca na listagem e limpa busca
      setHighlightedId(found.id);
      setSearch(found.name);
      setLastScanned({ 
        code: scannedCode, 
        name: `${found.name} ${matched.isBox ? `(Caixa c/ ${matched.boxUnits})` : ''}`, 
        time: new Date().toLocaleTimeString() 
      });
      
      setTimeout(() => {
        const el = document.getElementById(`prod-row-${found.id}`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);

      setTimeout(() => setHighlightedId(null), 4000);
    } else {
      // Produto novo: abre o modal de cadastro com o código de barras preenchido!
      setLastScanned({ code: scannedCode, time: new Date().toLocaleTimeString() });
      openCreateModal(scannedCode);
    }
  }

  // ============================================================================
  // CÁLCULO DE MARGEM E LUCRO EM TEMPO REAL
  // ============================================================================
  const costNum = parseFloat(formData.cost_price) || 0;
  const saleNum = parseFloat(formData.sale_price) || 0;
  const profitNum = Math.max(0, saleNum - costNum);
  const marginPct = costNum > 0 ? ((saleNum - costNum) / costNum) * 100 : (saleNum > 0 ? 100 : 0);

  function applyMargin(percent: number) {
    if (costNum <= 0) return;
    const newSale = costNum * (1 + percent / 100);
    setFormData(prev => ({
      ...prev,
      sale_price: newSale.toFixed(2)
    }));
  }

  // ============================================================================
  // ABERTURA DE MODAIS
  // ============================================================================
  function openCreateModal(initialBarcode: string = '') {
    setEditingProduct(null);
    setModalError(null);
    setNewBoxCodeInput('');
    setNewSecondaryCodeInput('');
    setFormData({
      name: '',
      barcode: initialBarcode,
      sku: initialBarcode ? `SKU-${initialBarcode.slice(-4)}` : '',
      category_id: categories[0]?.id || '',
      category_name: categories[0]?.name || 'Geral',
      unit: 'un',
      cost_price: '',
      sale_price: '',
      current_stock: '0',
      min_stock: '6',
      active: true,
      description: '',
      box_enabled: false,
      box_units: '6',
      box_price: '',
      box_barcodes: [],
      secondary_barcodes: [],
    });
    setIsModalOpen(true);

    setTimeout(() => {
      if (initialBarcode && nameInputModalRef.current) {
        nameInputModalRef.current.focus();
      } else if (barcodeInputModalRef.current) {
        barcodeInputModalRef.current.focus();
      }
    }, 150);
  }

  function openEditModal(prod: Product) {
    setEditingProduct(prod);
    setModalError(null);
    setNewBoxCodeInput('');
    setNewSecondaryCodeInput('');
    setFormData({
      name: prod.name || '',
      barcode: prod.barcode || '',
      sku: prod.sku || '',
      category_id: prod.category_id || '',
      category_name: prod.category_name || '',
      unit: prod.unit || 'un',
      cost_price: prod.cost_price ? prod.cost_price.toString() : '',
      sale_price: (prod.selling_price ?? prod.sale_price ?? 0).toString(),
      current_stock: prod.current_stock ? prod.current_stock.toString() : '0',
      min_stock: prod.min_stock ? prod.min_stock.toString() : '5',
      active: prod.active ?? prod.is_active ?? true,
      description: prod.description || '',
      box_enabled: Boolean(prod.box_enabled),
      box_units: (prod.box_units || 6).toString(),
      box_price: prod.box_price ? prod.box_price.toString() : '',
      box_barcodes: Array.isArray(prod.box_barcodes) ? [...prod.box_barcodes] : [],
      secondary_barcodes: Array.isArray(prod.secondary_barcodes) ? [...prod.secondary_barcodes] : [],
    });
    setIsModalOpen(true);
  }

  // ============================================================================
  // SALVAR PRODUTO VIA API
  // ============================================================================
  async function handleSaveProduct(e: React.FormEvent) {
    e.preventDefault();
    setModalError(null);

    if (!formData.name.trim()) {
      setModalError('Por favor, informe o nome do produto.');
      return;
    }

    setSaving(true);
    try {
      const selectedCat = categories.find(c => c.id === formData.category_id);
      const cost_val = parseFloat(formData.cost_price) || 0;
      const sale_val = parseFloat(formData.sale_price) || 0;
      const stock_val = parseFloat(formData.current_stock) || 0;
      const min_stock_val = parseFloat(formData.min_stock) || 5;

      const payload: any = {
        company_id: defaultCompanyId,
        name: formData.name.trim(),
        barcode: formData.barcode.trim() || null,
        sku: formData.sku.trim() || null,
        category_id: formData.category_id || null,
        category_name: selectedCat?.name || formData.category_name || 'Geral',
        unit: formData.unit,
        cost_price: cost_val,
        sale_price: sale_val,
        selling_price: sale_val,
        current_stock: stock_val,
        min_stock: min_stock_val,
        active: formData.active,
        is_active: formData.active,
        description: formData.description.trim() || null,
        box_enabled: formData.box_enabled,
        box_units: parseFloat(formData.box_units) || 1,
        box_price: parseFloat(formData.box_price) || 0,
        box_barcodes: formData.box_barcodes,
        secondary_barcodes: formData.secondary_barcodes,
      };

      if (editingProduct) {
        payload.id = editingProduct.id;
      }

      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const resData = await res.json();
      if (!res.ok || resData.error) {
        throw new Error(resData.error || 'Falha ao salvar produto no banco de dados');
      }

      if (soundEnabled) playSuccessSound();
      setIsModalOpen(false);
      await loadData();
    } catch (err: any) {
      console.error('Erro ao salvar produto:', err);
      if (soundEnabled) playWarningSound();
      setModalError(err.message || 'Erro desconhecido ao salvar.');
    } finally {
      setSaving(false);
    }
  }

  // ============================================================================
  // EXCLUSÃO DE PRODUTO
  // ============================================================================
  async function handleDeleteProduct(id: string, name: string) {
    if (!confirm(`Tem certeza que deseja remover o produto "${name}" do catálogo?`)) return;

    try {
      const res = await fetch(`/api/products?id=${id}`, { method: 'DELETE' });
      const resData = await res.json();
      if (!res.ok || resData.error) throw new Error(resData.error || 'Erro ao excluir produto');

      setProducts(prev => prev.filter(p => p.id !== id));
      if (soundEnabled) playSuccessSound();
    } catch (err: any) {
      alert(`Erro ao excluir: ${err.message}`);
    }
  }

  // ============================================================================
  // AJUSTE RÁPIDO DE ESTOQUE
  // ============================================================================
  async function handleQuickStockSave(e: React.FormEvent) {
    e.preventDefault();
    if (!quickStockProduct) return;
    const delta = parseFloat(quickStockDelta);
    if (isNaN(delta) || delta === 0) return;

    const newStock = Math.max(0, quickStockProduct.current_stock + delta);
    try {
      const res = await fetch('/api/products', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: quickStockProduct.id,
          current_stock: newStock,
        }),
      });

      const resData = await res.json();
      if (!res.ok || resData.error) throw new Error(resData.error || 'Erro no ajuste de estoque');

      setProducts(prev => prev.map(p => p.id === quickStockProduct.id ? { ...p, current_stock: newStock } : p));
      if (soundEnabled) playSuccessSound();
      setQuickStockProduct(null);
      setQuickStockDelta('');
    } catch (err: any) {
      alert(`Erro no ajuste de estoque: ${err.message}`);
    }
  }

  // ============================================================================
  // MÉTRICAS & FILTRAGEM
  // ============================================================================
  const totalProducts = products.length;
  const totalCostValue = products.reduce((acc, p) => acc + (p.current_stock * p.cost_price), 0);
  const totalSaleValue = products.reduce((acc, p) => acc + (p.current_stock * (p.selling_price ?? p.sale_price ?? 0)), 0);
  const lowStockCount = products.filter(p => p.current_stock <= p.min_stock).length;

  const filteredProducts = products.filter(p => {
    const matchesSearch = 
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.barcode && p.barcode.includes(search)) ||
      (p.sku && p.sku.toLowerCase().includes(search.toLowerCase()));

    const matchesCat = selectedCategory === 'all' || p.category_id === selectedCategory;

    const matchesStock = 
      filterStock === 'all' ||
      (filterStock === 'low' && p.current_stock <= p.min_stock && p.current_stock > 0) ||
      (filterStock === 'out' && p.current_stock <= 0);

    return matchesSearch && matchesCat && matchesStock;
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 select-none">
      {/* =====================================================================
          HEADER PRINCIPAL COM STATUS DO LEITOR DE CÓDIGO DE BARRAS
          ===================================================================== */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-amber-950/80">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse"></span>
            <span className="text-[11px] font-extrabold uppercase tracking-widest text-amber-400">
              Gestão de Catálogo & Frente de Loja
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-center gap-3">
            <div className="p-2 bg-gradient-to-tr from-amber-600 to-yellow-500 rounded-xl text-stone-950 shadow-md shadow-amber-950/50">
              <Package className="w-6 h-6 stroke-[2.5]" />
            </div>
            Catálogo de Bebidas & Itens
          </h1>
          <p className="text-xs sm:text-sm text-stone-400 mt-1">
            Controle de preços de custo, venda, margens em tempo real e leitura automática por leitor USB/laser.
          </p>
        </div>

        {/* STATUS DO LEITOR USB & BOTÃO CADASTRAR */}
        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
          {/* BADGE ANIMADO DO LEITOR DE CÓDIGO DE BARRAS */}
          <div 
            title="O sistema escuta automaticamente seu leitor de código de barras USB/Bluetooth em qualquer momento"
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-stone-900/90 border border-amber-500/30 text-amber-300 text-xs font-semibold shadow-inner"
          >
            <div className="relative flex items-center justify-center">
              <span className="absolute w-2.5 h-2.5 rounded-full bg-emerald-500/40 animate-ping"></span>
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            </div>
            <ScanBarcode className="w-4 h-4 text-amber-400" />
            <span className="hidden sm:inline">Leitor de Barras:</span>
            <span className="font-mono text-emerald-400 font-bold">Ativo & Pronto</span>
          </div>

          {/* TOGGLE DE ÁUDIO */}
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="p-2.5 rounded-xl bg-stone-900/80 border border-stone-800 text-stone-400 hover:text-amber-300 hover:border-amber-500/40 transition-colors"
            title={soundEnabled ? 'Silenciar bipes do leitor' : 'Ativar bipes do leitor'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4 text-amber-400" /> : <VolumeX className="w-4 h-4" />}
          </button>

          {/* BOTÃO CADASTRAR PRODUTO */}
          <Button
            onClick={() => openCreateModal()}
            className="bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-stone-950 font-black shadow-lg shadow-amber-950/60 px-5 text-sm"
          >
            <Plus className="w-4 h-4 mr-2 stroke-[3]" /> Cadastrar Produto
          </Button>
        </div>
      </div>

      {/* NOTIFICAÇÃO DISCRETA DO ÚLTIMO ITEM BIPADO */}
      {lastScanned && (
        <div className="p-3 bg-gradient-to-r from-amber-950/60 via-stone-900/80 to-stone-950 border border-amber-500/40 rounded-2xl flex items-center justify-between text-xs text-amber-200 shadow-xl animate-in fade-in duration-300">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <Barcode className="w-4 h-4" />
            </div>
            <div>
              <span className="text-stone-400 text-[11px]">Último código lido pelo scanner:</span>
              <div className="font-mono font-black text-amber-300 text-sm flex items-center gap-2">
                {lastScanned.code}
                {lastScanned.name ? (
                  <span className="text-emerald-400 text-xs font-semibold">({lastScanned.name})</span>
                ) : (
                  <span className="text-yellow-400 text-xs font-semibold">(Novo — Aberto no formulário)</span>
                )}
              </div>
            </div>
          </div>
          <span className="text-[10px] text-stone-500 font-mono">{lastScanned.time}</span>
        </div>
      )}

      {/* =====================================================================
          CARDS DE MÉTRICAS & INDICADORES DO ESTOQUE
          ===================================================================== */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Card className="bg-stone-900/70 border-stone-800/80 hover:border-amber-500/30 transition-all p-4">
          <div className="flex items-center justify-between text-stone-400 text-xs font-bold uppercase tracking-wider mb-2">
            <span>Catálogo Ativo</span>
            <Package className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-black text-white font-mono">{totalProducts}</div>
          <div className="text-[11px] text-stone-400 mt-1">itens cadastrados</div>
        </Card>

        <Card className="bg-stone-900/70 border-stone-800/80 hover:border-amber-500/30 transition-all p-4">
          <div className="flex items-center justify-between text-stone-400 text-xs font-bold uppercase tracking-wider mb-2">
            <span>Estoque a Preço Venda</span>
            <DollarSign className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-emerald-400 font-mono">
            {formatCurrency(totalSaleValue)}
          </div>
          <div className="text-[11px] text-stone-400 mt-1">projeção bruta de faturamento</div>
        </Card>

        <Card className="bg-stone-900/70 border-stone-800/80 hover:border-amber-500/30 transition-all p-4">
          <div className="flex items-center justify-between text-stone-400 text-xs font-bold uppercase tracking-wider mb-2">
            <span>Custo Total Imobilizado</span>
            <TrendingUp className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-amber-300 font-mono">
            {formatCurrency(totalCostValue)}
          </div>
          <div className="text-[11px] text-stone-400 mt-1">capital investido em mercadorias</div>
        </Card>

        <Card 
          onClick={() => setFilterStock(filterStock === 'low' ? 'all' : 'low')}
          className={`cursor-pointer transition-all p-4 border ${
            filterStock === 'low'
              ? 'bg-rose-950/40 border-rose-500'
              : 'bg-stone-900/70 border-stone-800/80 hover:border-rose-500/40'
          }`}
        >
          <div className="flex items-center justify-between text-stone-400 text-xs font-bold uppercase tracking-wider mb-2">
            <span>Estoque Crítico</span>
            <AlertCircle className={`w-4 h-4 ${lowStockCount > 0 ? 'text-rose-400 animate-pulse' : 'text-stone-500'}`} />
          </div>
          <div className={`text-2xl font-black font-mono ${lowStockCount > 0 ? 'text-rose-400' : 'text-stone-300'}`}>
            {lowStockCount}
          </div>
          <div className="text-[11px] text-stone-400 mt-1">
            {lowStockCount > 0 ? 'clique para filtrar' : 'todos em nível seguro'}
          </div>
        </Card>
      </div>

      {/* =====================================================================
          BARRA DE FERRAMENTAS: BUSCA, CATEGORIAS E FILTROS RÁPIDOS
          ===================================================================== */}
      <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between bg-stone-900/40 p-3 rounded-2xl border border-stone-800/60">
        {/* INPUT DE BUSCA ULTRA RÁPIDO */}
        <div className="relative flex-1 max-w-lg">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-500" />
          <Input
            type="text"
            placeholder="Buscar por Nome, Código de Barras (EAN) ou SKU..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 pr-10 bg-stone-950/80 border-stone-800 focus-visible:border-amber-500 text-sm font-medium"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-500 hover:text-stone-300 p-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* SELETOR DE CATEGORIA & BOTÕES DE ESTOQUE */}
        <div className="flex flex-wrap items-center gap-2">
          {/* CATEGORIA */}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="h-11 px-3 rounded-xl bg-stone-950/90 border border-stone-800 text-stone-200 text-xs font-semibold focus:outline-none focus:border-amber-500"
          >
            <option value="all">Todas as Categorias</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          {/* FILTRO STATUS ESTOQUE */}
          <div className="inline-flex rounded-xl bg-stone-950/90 p-1 border border-stone-800 text-xs">
            <button
              onClick={() => setFilterStock('all')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                filterStock === 'all' ? 'bg-amber-500 text-stone-950 shadow-sm' : 'text-stone-400 hover:text-white'
              }`}
            >
              Todos
            </button>
            <button
              onClick={() => setFilterStock('low')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                filterStock === 'low' ? 'bg-rose-500 text-white shadow-sm' : 'text-stone-400 hover:text-white'
              }`}
            >
              Abaixo Mínimo
            </button>
          </div>
        </div>
      </div>

      {/* =====================================================================
          TABELA DE PRODUTOS ESTILIZADA & RESPONSIVA
          ===================================================================== */}
      <Card className="overflow-hidden border-stone-800 bg-stone-950/80 backdrop-blur-md shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-stone-800 bg-stone-900/80 text-stone-400 text-[11px] font-bold uppercase tracking-wider">
                <th className="py-4 px-4">Produto & Categoria</th>
                <th className="py-4 px-4 font-mono">Código EAN-13 / SKU</th>
                <th className="py-4 px-4 text-right">Preço Custo</th>
                <th className="py-4 px-4 text-right">Preço Venda</th>
                <th className="py-4 px-4 text-right">Margem / Lucro</th>
                <th className="py-4 px-4 text-center">Estoque Atual</th>
                <th className="py-4 px-4 text-center">Status</th>
                <th className="py-4 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-800/60 text-stone-300">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-stone-500 text-xs">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto text-amber-500 mb-2" />
                    Carregando catálogo de produtos...
                  </td>
                </tr>
              ) : filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center">
                    <div className="max-w-md mx-auto space-y-3">
                      <div className="w-12 h-12 rounded-2xl bg-stone-900 border border-stone-800 flex items-center justify-center mx-auto text-amber-400">
                        <ScanBarcode className="w-6 h-6" />
                      </div>
                      <p className="text-stone-300 font-bold text-sm">Nenhum produto encontrado</p>
                      <p className="text-stone-500 text-xs">
                        Use o leitor de código de barras para bipar uma garrafa ou lata, ou clique no botão abaixo para cadastrar.
                      </p>
                      <Button
                        onClick={() => openCreateModal()}
                        className="bg-amber-500 hover:bg-amber-400 text-stone-950 font-black text-xs"
                      >
                        <Plus className="w-4 h-4 mr-1.5" /> Cadastrar Agora
                      </Button>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredProducts.map(p => {
                  const salePrice = Number(p.selling_price ?? p.sale_price ?? 0);
                  const costPrice = Number(p.cost_price || 0);
                  const profitUnit = Math.max(0, salePrice - costPrice);
                  const marginPct = costPrice > 0 
                    ? (((salePrice - costPrice) / costPrice) * 100).toFixed(0)
                    : '100';
                  const isLowStock = p.current_stock <= p.min_stock;
                  const isHighlighted = highlightedId === p.id;

                  return (
                    <tr 
                      key={p.id} 
                      id={`prod-row-${p.id}`}
                      className={`transition-all duration-200 group ${
                        isHighlighted 
                          ? 'bg-amber-500/20 ring-2 ring-amber-400' 
                          : 'hover:bg-stone-900/60'
                      }`}
                    >
                      {/* PRODUTO */}
                      <td className="py-3.5 px-4">
                        <div className="font-extrabold text-white text-sm leading-snug group-hover:text-amber-200 transition-colors">
                          {p.name}
                        </div>
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500/70"></span>
                          <span className="text-[11px] font-semibold text-stone-400">
                            {p.category_name || 'Geral'}
                          </span>
                        </div>
                      </td>

                      {/* CÓDIGO DE BARRAS / SKU */}
                      <td className="py-3.5 px-4 font-mono text-xs">
                        {p.barcode ? (
                          <div className="flex items-center gap-1.5 text-amber-300/90 font-bold bg-stone-900/80 px-2 py-1 rounded-lg border border-amber-900/30 w-fit">
                            <Barcode className="w-3.5 h-3.5 text-amber-400" />
                            <span>{p.barcode}</span>
                          </div>
                        ) : p.sku ? (
                          <span className="text-stone-400 bg-stone-900 px-2 py-1 rounded text-[11px]">
                            SKU: {p.sku}
                          </span>
                        ) : (
                          <span className="text-stone-600">-</span>
                        )}

                        {/* Indicador de Códigos de Caixa */}
                        {p.box_enabled && p.box_barcodes && p.box_barcodes.length > 0 && (
                          <div className="flex items-center gap-1 text-[10px] text-amber-400/90 font-mono mt-1" title={p.box_barcodes.join(', ')}>
                            <span>📦 {p.box_barcodes.length} cód. caixa</span>
                          </div>
                        )}
                      </td>

                      {/* PREÇO DE CUSTO */}
                      <td className="py-3.5 px-4 text-right font-mono text-xs text-stone-400">
                        {formatCurrency(costPrice)}
                      </td>

                      {/* PREÇO DE VENDA */}
                      <td className="py-3.5 px-4 text-right font-mono">
                        <span className="font-black text-amber-400 text-sm">
                          {formatCurrency(salePrice)}
                        </span>
                        {p.box_enabled && (
                          <div className="text-[10px] text-stone-400 font-mono mt-0.5 whitespace-nowrap">
                            Cx c/ {p.box_units || 1}: <span className="text-amber-300 font-bold">{formatCurrency(p.box_price || 0)}</span>
                          </div>
                        )}
                      </td>

                      {/* MARGEM & LUCRO UNITÁRIO */}
                      <td className="py-3.5 px-4 text-right font-mono text-xs">
                        <div className="font-bold text-emerald-400">
                          +{marginPct}%
                        </div>
                        <div className="text-[10px] text-stone-500">
                          Lucro: {formatCurrency(profitUnit)}
                        </div>
                      </td>

                      {/* ESTOQUE ATUAL & AJUSTE RÁPIDO */}
                      <td className="py-3.5 px-4 text-center">
                        <button
                          onClick={() => {
                            setQuickStockProduct(p);
                            setQuickStockDelta('');
                          }}
                          title="Clique para adicionar ou baixar estoque rapidamente"
                          className="cursor-pointer group/stock"
                        >
                          <Badge 
                            variant={isLowStock ? "destructive" : "secondary"} 
                            className="font-mono text-xs px-2.5 py-1 gap-1.5 group-hover/stock:border-amber-400 transition-colors"
                          >
                            {isLowStock && <AlertCircle className="w-3 h-3 text-rose-400" />}
                            <span>{p.current_stock} {p.unit}</span>
                          </Badge>
                          <div className="text-[10px] text-stone-500 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            Mín: {p.min_stock} {p.unit}
                          </div>
                        </button>
                      </td>

                      {/* STATUS */}
                      <td className="py-3.5 px-4 text-center">
                        <Badge variant={p.active ? "default" : "outline"} className="text-[10px] font-bold">
                          {p.active ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </td>

                      {/* AÇÕES */}
                      <td className="py-3.5 px-4 text-right space-x-1">
                        <Button 
                          variant="ghost" 
                          size="iconSm" 
                          onClick={() => openEditModal(p)}
                          title="Editar dados e preço do produto"
                          className="hover:bg-stone-800 hover:text-amber-300"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="iconSm" 
                          onClick={() => handleDeleteProduct(p.id, p.name)}
                          title="Excluir produto"
                          className="hover:bg-rose-950/60 hover:text-rose-400"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
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

      {/* =====================================================================
          MODAL DE CADASTRO / EDIÇÃO DE PRODUTO COM FOCO NO LEITOR DE BARRAS
          ===================================================================== */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-stone-950 border border-amber-900/60 rounded-3xl w-full max-w-2xl max-h-[92vh] overflow-y-auto shadow-2xl flex flex-col no-scrollbar">
            {/* CABEÇALHO DO MODAL */}
            <div className="p-5 sm:p-6 border-b border-stone-800 flex items-center justify-between sticky top-0 bg-stone-950/95 backdrop-blur-md z-10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
                  <Package className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-black text-white">
                    {editingProduct ? 'Editar Produto' : 'Cadastrar Novo Produto'}
                  </h2>
                  <p className="text-xs text-stone-400">
                    {editingProduct ? 'Atualize preços, estoque e detalhes' : 'Bipe o código com o leitor ou preencha manualmente'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-stone-400 hover:text-white p-2 rounded-xl hover:bg-stone-900"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* FORMULÁRIO */}
            <form onSubmit={handleSaveProduct} className="p-5 sm:p-6 space-y-5 flex-1">
              {/* ALERTA DE ERRO DENTRO DO MODAL SE HOUVER */}
              {modalError && (
                <div className="p-3.5 bg-rose-950/80 border border-rose-500/60 rounded-2xl flex items-center gap-3 text-xs text-rose-200 animate-in fade-in">
                  <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
                  <span className="font-semibold">{modalError}</span>
                </div>
              )}

              {/* CAMPO DE CÓDIGO DE BARRAS COM DESTAQUE VISUAL PARA O LEITOR */}
              <div className="p-4 rounded-2xl bg-gradient-to-br from-stone-900/90 to-stone-950 border border-amber-500/40 shadow-inner space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-amber-300 flex items-center gap-1.5 uppercase tracking-wider">
                    <ScanBarcode className="w-4 h-4 text-amber-400" />
                    Código de Barras (EAN-13 / Laser)
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const generated = generateInternalBarcode();
                      setFormData(prev => ({
                        ...prev,
                        barcode: generated,
                        sku: prev.sku || `INT-${generated.slice(-4)}`
                      }));
                      if (soundEnabled) playSuccessSound();
                    }}
                    className="text-[11px] font-bold text-amber-400 hover:text-yellow-300 underline underline-offset-2 flex items-center gap-1 cursor-pointer"
                  >
                    <Sparkles className="w-3 h-3" /> Gerar Código Interno
                  </button>
                </div>

                <div className="relative">
                  <Input
                    ref={barcodeInputModalRef}
                    type="text"
                    placeholder="Bipe com o leitor ou digite o código..."
                    value={formData.barcode}
                    onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                    className="font-mono text-base font-black text-amber-300 tracking-wider bg-stone-950 border-amber-500/50 focus-visible:ring-amber-500/40 pl-4 pr-10"
                  />
                  {formData.barcode && (
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, barcode: '' })}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-500 hover:text-stone-300 p-1"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <div className="flex items-center justify-between text-[11px] text-stone-400">
                  <span>💡 O leitor de código de barras preenche este campo automaticamente.</span>
                  {formData.barcode && (
                    <span className="font-mono text-emerald-400 font-bold">{formData.barcode.length} dígitos</span>
                  )}
                </div>
              </div>

              {/* NOME DO PRODUTO */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-stone-300 uppercase tracking-wider">
                  Nome do Produto *
                </label>
                <Input
                  ref={nameInputModalRef}
                  type="text"
                  placeholder="Ex.: Cerveja Heineken Lata 350ml, Vinho Pérgola Tinto 1L..."
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  className="text-sm font-semibold"
                />
              </div>

              {/* CATEGORIA E SKU */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-stone-300 uppercase tracking-wider">
                    Categoria
                  </label>
                  <select
                    value={formData.category_id}
                    onChange={(e) => {
                      const cat = categories.find(c => c.id === e.target.value);
                      setFormData({ 
                        ...formData, 
                        category_id: e.target.value,
                        category_name: cat?.name || 'Geral'
                      });
                    }}
                    className="h-11 w-full px-3 rounded-xl bg-stone-900 border border-stone-800 text-stone-100 text-sm font-medium focus:outline-none focus:border-amber-500"
                  >
                    <option value="">Selecione uma categoria...</option>
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-stone-300 uppercase tracking-wider">
                    SKU / Código Rápido
                  </label>
                  <Input
                    type="text"
                    placeholder="Ex.: HEIN-350, COR-330"
                    value={formData.sku}
                    onChange={(e) => setFormData({ ...formData, sku: e.target.value.toUpperCase() })}
                    className="font-mono text-xs uppercase"
                  />
                </div>
              </div>

              {/* UNIDADE DE MEDIDA (PILLS) */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-stone-300 uppercase tracking-wider">
                  Unidade de Medida
                </label>
                <div className="flex flex-wrap gap-2">
                  {UNITS.map(u => (
                    <button
                      key={u.value}
                      type="button"
                      onClick={() => setFormData({ ...formData, unit: u.value })}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                        formData.unit === u.value
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500 shadow-sm'
                          : 'bg-stone-900 text-stone-400 border-stone-800 hover:border-stone-700'
                      }`}
                    >
                      {u.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* PREÇOS & CALCULADORA DE MARGEM DE LUCRO */}
              <div className="p-4 rounded-2xl bg-stone-900/60 border border-stone-800/80 space-y-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                    <DollarSign className="w-4 h-4" /> Precificação & Margem de Lucro
                  </span>
                  {costNum > 0 && (
                    <div className="text-xs font-mono font-bold flex items-center gap-2">
                      <span className="text-stone-400">Margem:</span>
                      <span className="text-emerald-400">+{marginPct.toFixed(1)}%</span>
                      <span className="text-stone-500">|</span>
                      <span className="text-stone-400">Lucro:</span>
                      <span className="text-amber-300">{formatCurrency(profitNum)}</span>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-stone-400">
                      Preço de Custo (R$)
                    </label>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={formData.cost_price}
                      onChange={(e) => setFormData({ ...formData, cost_price: e.target.value })}
                      className="font-mono text-base font-bold"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-stone-400">
                      Preço de Venda ao Cliente (R$) *
                    </label>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={formData.sale_price}
                      onChange={(e) => setFormData({ ...formData, sale_price: e.target.value })}
                      required
                      className="font-mono text-base font-black text-amber-400"
                    />
                  </div>
                </div>

                {/* BOTÕES DE SUGESTÃO DE MARGEM RÁPIDA */}
                {costNum > 0 && (
                  <div className="pt-2 border-t border-stone-800/60 flex items-center gap-1.5 flex-wrap">
                    <span className="text-[11px] text-stone-500 font-semibold mr-1">Calcular Venda:</span>
                    {[30, 40, 50, 70, 100].map(pct => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => applyMargin(pct)}
                        className="px-2.5 py-1 rounded-lg bg-stone-800/90 hover:bg-amber-500 hover:text-stone-950 text-stone-300 text-xs font-mono font-bold transition-all"
                      >
                        +{pct}%
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* ESTOQUE ATUAL & MÍNIMO */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-stone-300 uppercase tracking-wider">
                    Estoque Inicial ({formData.unit})
                  </label>
                  <Input
                    type="number"
                    step="1"
                    value={formData.current_stock}
                    onChange={(e) => setFormData({ ...formData, current_stock: e.target.value })}
                    className="font-mono text-sm font-bold"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-stone-300 uppercase tracking-wider">
                    Estoque Mínimo de Alerta
                  </label>
                  <Input
                    type="number"
                    step="1"
                    value={formData.min_stock}
                    onChange={(e) => setFormData({ ...formData, min_stock: e.target.value })}
                    className="font-mono text-sm font-bold text-yellow-400"
                  />
                </div>
              </div>

              {/* CONFIGURAÇÃO DE VENDA POR CAIXA FECHADA & MÚLTIPLOS CÓDIGOS */}
              <div className="p-4 rounded-2xl bg-gradient-to-br from-amber-950/20 via-stone-900 to-stone-950 border border-amber-500/30 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-8 h-8 rounded-xl bg-amber-500/20 flex items-center justify-center text-amber-400 font-bold">
                      📦
                    </span>
                    <div>
                      <div className="text-xs font-black text-amber-300 uppercase tracking-wider">
                        Venda e Controle por Caixa Fechada (Fardo)
                      </div>
                      <div className="text-[11px] text-stone-400">
                        Venda a caixa com preço atacado baixando o mesmo estoque em unidades
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, box_enabled: !formData.box_enabled })}
                    className={`w-11 h-6 rounded-full transition-colors relative flex items-center px-1 ${
                      formData.box_enabled ? 'bg-amber-500' : 'bg-stone-800'
                    }`}
                  >
                    <span
                      className={`w-4 h-4 rounded-full bg-stone-950 transition-transform ${
                        formData.box_enabled ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {formData.box_enabled && (
                  <div className="space-y-4 pt-3 border-t border-amber-900/30 animate-in fade-in">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-stone-300 uppercase tracking-wider">
                          Unidades por Caixa (Fator) *
                        </label>
                        <Input
                          type="number"
                          step="1"
                          min="1"
                          placeholder="Ex: 6, 12, 24"
                          value={formData.box_units}
                          onChange={(e) => setFormData({ ...formData, box_units: e.target.value })}
                          className="font-mono text-sm font-bold text-amber-300"
                        />
                        <span className="text-[10px] text-stone-500">
                          Ex: Se for caixa com 6 garrafas, digite 6.
                        </span>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-stone-300 uppercase tracking-wider">
                          Preço de Venda da Caixa (R$) *
                        </label>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={formData.box_price}
                          onChange={(e) => setFormData({ ...formData, box_price: e.target.value })}
                          className="font-mono text-sm font-bold text-emerald-400"
                        />
                        {parseFloat(formData.box_price) > 0 && parseFloat(formData.box_units) > 0 && (
                          <span className="text-[10px] text-stone-400">
                            Sai a {formatCurrency(parseFloat(formData.box_price) / parseFloat(formData.box_units))} por unidade
                          </span>
                        )}
                      </div>
                    </div>

                    {/* LISTA DE CÓDIGOS DA CAIXA (SUPORTA MÚLTIPLOS CÓDIGOS E QR CODES) */}
                    <div className="space-y-2 bg-stone-950/70 p-3 rounded-xl border border-stone-800">
                      <label className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center justify-between">
                        <span>Códigos / QR Codes da Caixa</span>
                        <span className="text-[10px] text-stone-500 font-normal">
                          {formData.box_barcodes.length} código(s) vinculado(s)
                        </span>
                      </label>

                      <div className="flex gap-2">
                        <Input
                          type="text"
                          placeholder="Bipe ou digite o código/QR code da caixa..."
                          value={newBoxCodeInput}
                          onChange={(e) => setNewBoxCodeInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              const trimmed = newBoxCodeInput.trim();
                              if (trimmed && !formData.box_barcodes.includes(trimmed)) {
                                setFormData(prev => ({ ...prev, box_barcodes: [...prev.box_barcodes, trimmed] }));
                                setNewBoxCodeInput('');
                                if (soundEnabled) playSuccessSound();
                              }
                            }
                          }}
                          className="font-mono text-xs uppercase"
                        />
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => {
                            const trimmed = newBoxCodeInput.trim();
                            if (trimmed && !formData.box_barcodes.includes(trimmed)) {
                              setFormData(prev => ({ ...prev, box_barcodes: [...prev.box_barcodes, trimmed] }));
                              setNewBoxCodeInput('');
                              if (soundEnabled) playSuccessSound();
                            }
                          }}
                          className="text-xs shrink-0"
                        >
                          + Adicionar
                        </Button>
                      </div>

                      {/* Chips de códigos cadastrados */}
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {formData.box_barcodes.length === 0 ? (
                          <span className="text-[11px] text-stone-500 italic">
                            Nenhum código de caixa vinculado ainda. Bipe o código da caixa acima para adicionar.
                          </span>
                        ) : (
                          formData.box_barcodes.map((code, idx) => (
                            <span
                              key={idx}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 font-mono text-xs font-bold"
                            >
                              📦 {code}
                              <button
                                type="button"
                                onClick={() => setFormData(prev => ({
                                  ...prev,
                                  box_barcodes: prev.box_barcodes.filter((_, i) => i !== idx)
                                }))}
                                className="text-stone-400 hover:text-rose-400 transition-colors ml-0.5"
                                title="Remover este código"
                              >
                                &times;
                              </button>
                            </span>
                          ))
                        )}
                      </div>
                      <p className="text-[10px] text-stone-400 pt-1">
                        💡 Quando uma nova caixa do mesmo produto vier com código diferente, basta bipar e adicionar aqui. O leitor aceitará qualquer um dos códigos no PDV e na entrada de mercadoria!
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* CÓDIGOS ADICIONAIS DA UNIDADE (SE HOUVER) */}
              <div className="p-3.5 rounded-2xl bg-stone-900/60 border border-stone-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-stone-300 uppercase tracking-wider flex items-center gap-1.5">
                    🏷️ Códigos Alternativos da Garrafa / Unidade
                  </span>
                  <span className="text-[10px] text-stone-500">
                    {formData.secondary_barcodes.length} alternativo(s)
                  </span>
                </div>

                <div className="flex gap-2">
                  <Input
                    type="text"
                    placeholder="Bipe outro código avulso para esta mesma bebida..."
                    value={newSecondaryCodeInput}
                    onChange={(e) => setNewSecondaryCodeInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const trimmed = newSecondaryCodeInput.trim();
                        if (trimmed && !formData.secondary_barcodes.includes(trimmed)) {
                          setFormData(prev => ({ ...prev, secondary_barcodes: [...prev.secondary_barcodes, trimmed] }));
                          setNewSecondaryCodeInput('');
                          if (soundEnabled) playSuccessSound();
                        }
                      }
                    }}
                    className="font-mono text-xs uppercase"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      const trimmed = newSecondaryCodeInput.trim();
                      if (trimmed && !formData.secondary_barcodes.includes(trimmed)) {
                        setFormData(prev => ({ ...prev, secondary_barcodes: [...prev.secondary_barcodes, trimmed] }));
                        setNewSecondaryCodeInput('');
                        if (soundEnabled) playSuccessSound();
                      }
                    }}
                    className="text-xs shrink-0"
                  >
                    + Adicionar
                  </Button>
                </div>

                <div className="flex flex-wrap gap-1.5 pt-1">
                  {formData.secondary_barcodes.map((code, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-stone-800 border border-stone-700 text-stone-300 font-mono text-xs font-bold"
                    >
                      {code}
                      <button
                        type="button"
                        onClick={() => setFormData(prev => ({
                          ...prev,
                          secondary_barcodes: prev.secondary_barcodes.filter((_, i) => i !== idx)
                        }))}
                        className="text-stone-400 hover:text-rose-400 transition-colors ml-0.5"
                      >
                        &times;
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              {/* STATUS ATIVO / INATIVO */}
              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-stone-900 border border-stone-800">
                <div>
                  <div className="text-xs font-bold text-white">Disponível para Venda</div>
                  <div className="text-[11px] text-stone-400">Produto ativo no PDV e catálogo dos garçons</div>
                </div>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, active: !formData.active })}
                  className={`w-12 h-7 rounded-full transition-colors relative flex items-center px-1 ${
                    formData.active ? 'bg-amber-500' : 'bg-stone-700'
                  }`}
                >
                  <span
                    className={`w-5 h-5 rounded-full bg-stone-950 transition-transform ${
                      formData.active ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* BOTÕES DO RODAPÉ */}
              <div className="pt-4 border-t border-stone-800 flex items-center justify-end gap-3 sticky bottom-0 bg-stone-950/95 py-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsModalOpen(false)}
                  disabled={saving}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={saving}
                  className="bg-gradient-to-r from-amber-500 to-yellow-500 text-stone-950 font-black px-6"
                >
                  {saving ? 'Gravando...' : editingProduct ? 'Atualizar Produto' : 'Cadastrar Produto'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL RÁPIDO DE ENTRADA / BAIXA DE ESTOQUE
          ===================================================================== */}
      {quickStockProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-stone-950 border border-amber-900/60 rounded-3xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-black text-white">{quickStockProduct.name}</h3>
                <p className="text-xs text-stone-400">
                  Estoque atual: <span className="font-mono font-bold text-amber-300">{quickStockProduct.current_stock} {quickStockProduct.unit}</span>
                </p>
              </div>
              <button
                onClick={() => setQuickStockProduct(null)}
                className="text-stone-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleQuickStockSave} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-stone-300">
                  Quantidade a Adicionar (+) ou Baixar (-)
                </label>
                <Input
                  type="number"
                  step="1"
                  autoFocus
                  placeholder="Ex: +12 ou -2"
                  value={quickStockDelta}
                  onChange={(e) => setQuickStockDelta(e.target.value)}
                  className="font-mono text-lg font-black text-center"
                />
              </div>

              {/* ATALHOS RÁPIDOS */}
              <div className="grid grid-cols-4 gap-2">
                {[6, 12, 24, 48].map(qty => (
                  <button
                    key={qty}
                    type="button"
                    onClick={() => setQuickStockDelta(`+${qty}`)}
                    className="p-2 rounded-xl bg-stone-900 hover:bg-amber-500 hover:text-stone-950 border border-stone-800 text-xs font-mono font-bold transition-all"
                  >
                    +{qty}
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setQuickStockProduct(null)}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  className="bg-amber-500 hover:bg-amber-400 text-stone-950 font-black"
                >
                  Salvar Ajuste
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
