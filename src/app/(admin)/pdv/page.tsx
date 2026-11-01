'use client';

import React, { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { 
  ShoppingCart, 
  Barcode, 
  Search, 
  Trash2, 
  Plus, 
  Minus, 
  CheckCircle2, 
  ArrowRight, 
  Receipt, 
  Percent, 
  Printer, 
  ScanBarcode, 
  Volume2, 
  VolumeX, 
  Package, 
  AlertCircle,
  X,
  CreditCard,
  Banknote,
  QrCode,
  Wifi,
  WifiOff,
  RefreshCw,
  FileText,
  BookOpen
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency, cn } from '@/lib/utils';
import { Product, PaymentMethod } from '@/types/database';
import { matchProductByCode, parseProductMetadata } from '@/lib/products';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ThermalReceipt, ReceiptData, printThermalReceipt } from '@/components/ThermalReceipt';

interface CartItem {
  id: string;
  product: Product;
  quantity: number;
  isBox?: boolean;
  boxUnits?: number;
  unitPrice: number;
  displayName?: string;
}

export default function PDVFrenteDeCaixaPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerDoc, setCustomerDoc] = useState('');
  const [discountInput, setDiscountInput] = useState('');
  const [discountType, setDiscountType] = useState<'reais' | 'percent'>('reais');
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Modal de Pesquisa Rápida (para itens sem código de barras ou rasurados)
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [manualSearchTerm, setManualSearchTerm] = useState('');

  // Modal de Pagamento
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('DINHEIRO');
  const [amountPaid, setAmountPaid] = useState('');
  const [finishing, setFinishing] = useState(false);
  const [completedSale, setCompletedSale] = useState<any>(null);

  // Estados de Conectividade & Modo Offline (Frente de Caixa Ininterrupta)
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [pendingSales, setPendingSales] = useState<any[]>([]);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  // Controle de Impressão Térmica (POS-80) - Padrão AUTOMÁTICO ativado
  const [autoPrint, setAutoPrint] = useState<boolean>(true);
  const [autoCloseModal, setAutoCloseModal] = useState<boolean>(true);
  const [countdown, setCountdown] = useState<number>(3);
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);
  const [activePrintData, setActivePrintData] = useState<ReceiptData | null>(null);
  const [isPrinting, setIsPrinting] = useState(false);

  // Modal de Orçamento / Cotação
  const [isQuotationModalOpen, setIsQuotationModalOpen] = useState(false);
  const [quotationCustomer, setQuotationCustomer] = useState('');
  const [quotationValidity, setQuotationValidity] = useState('3 dias');
  const [clearCartAfterQuotation, setClearCartAfterQuotation] = useState(false);
  const [isPrintingQuotation, setIsPrintingQuotation] = useState(false);

  // Modal de Vínculo de Código Desconhecido (Novo QR Code ou Caixa)
  const [unknownScannedCode, setUnknownScannedCode] = useState<string | null>(null);
  const [linkTargetProductId, setLinkTargetProductId] = useState<string>('');
  const [linkBoxUnits, setLinkBoxUnits] = useState<string>('6');
  const [linkBoxPrice, setLinkBoxPrice] = useState<string>('');
  const [linkMode, setLinkMode] = useState<'box' | 'unit'>('box');
  const [linking, setLinking] = useState(false);

  // Referências
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const barcodeBufferRef = useRef<string>('');
  const lastKeyTimeRef = useRef<number>(0);
  const tableBottomRef = useRef<HTMLDivElement>(null);

  const supabase = createClient();

  // ============================================================================
  // ÁUDIO DE BIPE DO LEITOR DE SUPERMERCADO
  // ============================================================================
  function playBeep(freq = 1760, duration = 0.08) {
    if (!soundEnabled) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch {}
  }

  // ============================================================================
  // CARREGAMENTO DE PRODUTOS VIA API CENTRALIZADA (SEM BLOQUEIO DE RLS)
  // ============================================================================
  useEffect(() => {
    try {
      const savedAutoPrint = localStorage.getItem('adega_mauricio_auto_print') || localStorage.getItem('adega_mauri_auto_print');
      if (savedAutoPrint !== null) {
        setAutoPrint(savedAutoPrint === 'true');
      } else {
        setAutoPrint(true);
        try { localStorage.setItem('adega_mauricio_auto_print', 'true'); } catch {}
      }

      const savedAutoClose = localStorage.getItem('adega_mauricio_auto_close_modal');
      if (savedAutoClose !== null) {
        setAutoCloseModal(savedAutoClose === 'true');
      } else {
        setAutoCloseModal(true);
        try { localStorage.setItem('adega_mauricio_auto_close_modal', 'true'); } catch {}
      }

      const storedPending = localStorage.getItem('adega_mauricio_pending_sales') || localStorage.getItem('adega_mauri_pending_sales');
      if (storedPending) {
        const parsed = JSON.parse(storedPending);
        if (Array.isArray(parsed)) setPendingSales(parsed);
      }
    } catch {}

    const handleOnline = () => {
      setIsOnline(true);
      syncPendingSales();
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const checkInterval = setInterval(async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2500);
        const res = await fetch('/api/products', { signal: controller.signal, cache: 'no-store' });
        clearTimeout(timeoutId);
        if (res.ok) {
          setIsOnline(true);
        } else {
          setIsOnline(false);
        }
      } catch {
        setIsOnline(false);
      }
    }, 15000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(checkInterval);
    };
  }, []);

  async function syncPendingSales() {
    let storedList: any[] = [];
    try {
      const raw = localStorage.getItem('adega_mauricio_pending_sales') || localStorage.getItem('adega_mauri_pending_sales');
      if (raw) storedList = JSON.parse(raw);
    } catch {}

    if (!Array.isArray(storedList) || storedList.length === 0) {
      setPendingSales([]);
      return;
    }

    setIsSyncing(true);
    try {
      const res = await fetch('/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'sync_batch',
          sales: storedList
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        const syncedIds = new Set(
          (data.results || [])
            .filter((r: any) => r.status === 'synced')
            .map((r: any) => r.offline_id)
        );

        const remaining = storedList.filter(s => !syncedIds.has(s.offline_id));
        localStorage.setItem('adega_mauricio_pending_sales', JSON.stringify(remaining));
        localStorage.removeItem('adega_mauri_pending_sales');
        setPendingSales(remaining);
        setIsOnline(true);

        const count = data.synced_count || 0;
        setSyncNotice(`${count} venda(s) offline sincronizada(s) com sucesso com o servidor!`);
        setTimeout(() => setSyncNotice(null), 5000);
        loadProducts();
      }
    } catch (err: any) {
      console.warn('Tentativa de sincronização offline falhou. Será tentada novamente:', err.message);
    } finally {
      setIsSyncing(false);
    }
  }

  // Avanço automático opcional para a próxima venda após impressão
  useEffect(() => {
    if (!completedSale || !autoCloseModal) {
      setCountdown(3);
      return;
    }

    setCountdown(3);
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          setCompletedSale(null);
          focusScanner();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [completedSale, autoCloseModal]);

  // Carrega catálogo inicial na montagem
  useEffect(() => {
    loadProducts();
    focusScanner();
  }, []);

  // Atalhos de teclado do PDV e leitor de código de barras
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(e.key)) return;

      // Verifica se o usuário está focado em algum campo de digitação (Desconto, Cliente, CPF, Busca, etc.)
      const activeEl = document.activeElement;
      const isTypingInOtherInput =
        activeEl &&
        activeEl !== document.body &&
        activeEl !== barcodeInputRef.current &&
        (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT');

      if (isTypingInOtherInput) {
        // Se o operador pressionar Escape dentro de um input, desseleciona e volta o foco para o scanner
        if (e.key === 'Escape') {
          (activeEl as HTMLElement).blur();
          focusScanner();
        }
        // NÃO intercepta as teclas normais para permitir digitação livre em todos os campos!
        return;
      }

      if (completedSale) {
        if (e.key === 'F9') {
          e.preventDefault();
          handlePrintReceipt(completedSale);
          return;
        }
        if (e.key === 'Enter' || e.key === 'Escape' || e.key === ' ') {
          e.preventDefault();
          setCompletedSale(null);
          focusScanner();
          return;
        }
      }

      if (isTestModalOpen) {
        if (e.key === 'Enter') {
          e.preventDefault();
          handlePrintReceipt(activePrintData);
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          setIsTestModalOpen(false);
          return;
        }
      }

      if (e.key === 'F2') {
        e.preventDefault();
        if (cart.length > 0) setIsCheckoutOpen(true);
        return;
      }
      if (e.key === 'F3') {
        e.preventDefault();
        if (cart.length > 0) {
          setIsQuotationModalOpen(true);
        } else {
          alert('Adicione ao menos um produto no carrinho para emitir o orçamento.');
        }
        return;
      }
      if (e.key === 'F4') {
        e.preventDefault();
        clearCart();
        return;
      }
      if (e.key === 'F8') {
        e.preventDefault();
        setIsSearchModalOpen(prev => !prev);
        return;
      }
      if (e.key === 'F9') {
        e.preventDefault();
        handleOpenTestModal();
        return;
      }
      if (e.key === 'Escape') {
        if (isSearchModalOpen) setIsSearchModalOpen(false);
        if (isCheckoutOpen) setIsCheckoutOpen(false);
        if (isQuotationModalOpen) setIsQuotationModalOpen(false);
        return;
      }

      // Detecção global do scanner USB/Bluetooth se o cursor estiver fora do input
      const now = Date.now();
      const timeDiff = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;

      if (e.key === 'Enter') {
        const buffer = barcodeBufferRef.current.trim();
        barcodeBufferRef.current = '';
        if (buffer.length >= 4 && document.activeElement !== barcodeInputRef.current) {
          e.preventDefault();
          if (completedSale) {
            setCompletedSale(null);
          }
          findAndAddByBarcode(buffer);
        }
      } else if (e.key.length === 1) {
        if (timeDiff > 90) barcodeBufferRef.current = '';
        barcodeBufferRef.current += e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cart, isSearchModalOpen, isCheckoutOpen, completedSale, isTestModalOpen, activePrintData]);

  function focusScanner() {
    setTimeout(() => {
      // Se o usuário está com o cursor em outro campo (Desconto, CPF, Busca, etc.), NUNCA rouba o foco!
      const active = document.activeElement;
      if (
        active &&
        active !== document.body &&
        active !== barcodeInputRef.current &&
        (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT')
      ) {
        return;
      }
      barcodeInputRef.current?.focus();
    }, 100);
  }

  async function loadProducts(): Promise<Product[]> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);
      const res = await fetch('/api/products', { signal: controller.signal });
      clearTimeout(timeoutId);
      const data = await res.json();
      if (data.products && Array.isArray(data.products)) {
        const activeList = data.products.filter((p: any) => p.active !== false && p.is_active !== false);
        setProducts(activeList);
        try {
          localStorage.setItem('adega_mauricio_offline_catalog', JSON.stringify(activeList));
        } catch {}
        return activeList;
      }
    } catch (err) {
      console.warn('Conexão instável ou offline ao buscar produtos. Carregando catálogo em cache local...');
    }

    // Fallback offline resiliente: recupera o catálogo do localStorage
    try {
      const cached = localStorage.getItem('adega_mauricio_offline_catalog') || localStorage.getItem('adega_mauri_offline_catalog');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setProducts(parsed);
          return parsed;
        }
      }
    } catch {}

    return [];
  }

  // ============================================================================
  // BUSCA E REGISTRO DE PRODUTO (RECONHECE CÓDIGO DA GARRAFA E CÓDIGO DA CAIXA)
  // ============================================================================
  async function findAndAddByBarcode(rawCode: string) {
    const code = rawCode.trim();
    if (!code) return;

    let matched = matchProductByCode(products, code);

    // Se não encontrou no cache local, busca produtos atualizados na API
    if (!matched) {
      const freshList = await loadProducts();
      matched = matchProductByCode(freshList, code);
    }

    if (matched) {
      addToCart(
        matched.product, 
        matched.isBox, 
        matched.boxUnits, 
        matched.isBox ? matched.boxPrice : undefined
      );
      setBarcodeInput('');
    } else {
      playBeep(330, 0.2); // Som de alerta
      // Abre modal rápido para permitir vincular como caixa ou avulso na hora!
      setUnknownScannedCode(code);
      setLinkTargetProductId('');
      setLinkBoxUnits('6');
      setLinkBoxPrice('');
      setLinkMode('box');
      setBarcodeInput('');
    }
    focusScanner();
  }

  function handleBarcodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    findAndAddByBarcode(barcodeInput);
  }

  function addToCart(
    product: Product, 
    isBox: boolean = false, 
    boxUnits: number = 1, 
    customPrice?: number
  ) {
    playBeep(1760, 0.08); // Bipe laser característico
    const itemId = `${product.id}_${isBox ? 'box' : 'unit'}`;
    const price = customPrice !== undefined 
      ? customPrice 
      : isBox 
        ? Number(product.box_price || (product.selling_price ?? product.sale_price ?? 0) * (product.box_units || 1))
        : Number(product.selling_price ?? product.sale_price ?? 0);
    const displayName = isBox 
      ? `${product.name} (Caixa c/ ${boxUnits})` 
      : product.name;

    setCart(prev => {
      const existing = prev.find(item => item.id === itemId);
      if (existing) {
        return prev.map(item => 
          item.id === itemId ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [
        ...prev, 
        { 
          id: itemId, 
          product, 
          quantity: 1, 
          isBox, 
          boxUnits, 
          unitPrice: price, 
          displayName 
        }
      ];
    });

    // Rola para o final da bobina
    setTimeout(() => {
      tableBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);

    focusScanner();
  }

  function updateQuantity(itemId: string, delta: number) {
    playBeep(1400, 0.04);
    setCart(prev => 
      prev.map(item => {
        if (item.id === itemId) {
          const newQty = item.quantity + delta;
          return newQty > 0 ? { ...item, quantity: newQty } : null;
        }
        return item;
      }).filter(Boolean) as CartItem[]
    );
    focusScanner();
  }

  function removeFromCart(itemId: string) {
    playBeep(880, 0.08);
    setCart(prev => prev.filter(item => item.id !== itemId));
    focusScanner();
  }

  function clearCart() {
    if (cart.length > 0 && confirm('Deseja cancelar e limpar todos os itens deste cupom?')) {
      setCart([]);
      setDiscountInput('');
      focusScanner();
    }
  }

  async function handleLinkUnknownCode() {
    if (!unknownScannedCode || !linkTargetProductId) return;
    setLinking(true);
    try {
      const targetProd = products.find(p => p.id === linkTargetProductId);
      if (!targetProd) return;

      if (linkMode === 'box') {
        const units = parseFloat(linkBoxUnits) || 1;
        const price = parseFloat(linkBoxPrice) || (Number(targetProd.selling_price ?? targetProd.sale_price ?? 0) * units);

        const res = await fetch('/api/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'link_box_code',
            productId: linkTargetProductId,
            boxBarcode: unknownScannedCode,
            boxUnits: units,
            boxPrice: price,
          })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        const freshList = await loadProducts();
        const matched = matchProductByCode(freshList, unknownScannedCode);
        if (matched) {
          addToCart(matched.product, true, matched.boxUnits, matched.boxPrice);
        }
      } else {
        const res = await fetch('/api/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'link_secondary_code',
            productId: linkTargetProductId,
            barcode: unknownScannedCode,
          })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        const freshList = await loadProducts();
        const matched = matchProductByCode(freshList, unknownScannedCode);
        if (matched) {
          addToCart(matched.product, false, 1);
        }
      }

      setUnknownScannedCode(null);
      setLinkTargetProductId('');
      playBeep(1760, 0.12);
    } catch (err: any) {
      alert('Erro ao vincular código: ' + err.message);
    } finally {
      setLinking(false);
      focusScanner();
    }
  }

  // Cálculos financeiros
  const subtotal = cart.reduce((acc, item) => {
    return acc + (item.unitPrice * item.quantity);
  }, 0);

  // Desconto calculado a partir da digitação livre do operador (R$ ou %)
  const rawDiscount = parseFloat(discountInput.replace(',', '.')) || 0;
  const calculatedDiscount = discountType === 'percent'
    ? (subtotal * rawDiscount) / 100
    : rawDiscount;
  const discountAmount = Math.min(subtotal, Math.max(0, calculatedDiscount));

  const totalFinal = Math.max(0, subtotal - discountAmount);
  const totalQuantity = cart.reduce((acc, item) => acc + item.quantity, 0);

  const troco = paymentMethod === 'DINHEIRO' && parseFloat(amountPaid) > totalFinal 
    ? parseFloat(amountPaid) - totalFinal 
    : 0;

  // Último item registrado no caixa
  const lastItem = cart.length > 0 ? cart[cart.length - 1] : null;

  // ============================================================================
  // FINALIZAÇÃO DE VENDA (BAIXA CORRETA DE ESTOQUE PARA CAIXA E AVULSO)
  // ============================================================================
  async function handleFinalizeSale() {
    if (cart.length === 0) return;

    if (paymentMethod === 'FIADO' && (!customerName || !customerName.trim())) {
      alert('Atenção: Para registrar uma venda A Prazo (Fiado na Caderneta), é obrigatório informar o Nome do Cliente!');
      return;
    }

    setFinishing(true);
    try {
      const companyId = products[0]?.company_id || '00000000-0000-0000-0000-000000000001';
      
      const payloadItems = cart.map(item => {
        const unitsDeducted = item.isBox ? item.quantity * (item.boxUnits || 1) : item.quantity;
        const totalItemAmount = item.unitPrice * item.quantity;
        const effectiveUnitPrice = totalItemAmount / unitsDeducted;

        return {
          product_id: item.product.id,
          quantity: unitsDeducted, // Dedução física exata em unidades do estoque!
          unit_price: effectiveUnitPrice,
          total_price: totalItemAmount,
          cost_price: Number(item.product.cost_price || 0)
        };
      });

      let saleId: string | null = null;
      let isOfflineSale = false;

      // 1. Tenta envio online direto com timeout de 4s
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        isOfflineSale = true;
      } else {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 4000);

          const response = await fetch('/api/sales', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              company_id: companyId,
              sale_type: 'BALCAO',
              payment_method: paymentMethod,
              total_amount: subtotal,
              discount_amount: discountAmount,
              final_amount: totalFinal,
              customer_name: customerName || null,
              customer_cpf: customerDoc || null,
              items: payloadItems
            }),
            signal: controller.signal
          });
          clearTimeout(timeoutId);

          const resData = await response.json();
          if (response.ok && resData.success) {
            saleId = resData.sale_id;
            setIsOnline(true);
          } else {
            throw new Error(resData.error || 'Erro ao salvar venda no servidor');
          }
        } catch (netErr: any) {
          console.warn('Conexão instável ou offline detectada. Salvando venda localmente:', netErr.message);
          isOfflineSale = true;
          setIsOnline(false);
        }
      }

      // 2. Se a internet caiu ou falhou, grava no armazenamento local seguro (Offline-First)
      if (isOfflineSale) {
        const offlineId = `OFF-${Date.now().toString().slice(-6)}`;
        saleId = offlineId;

        const offlineSaleRecord = {
          offline_id: offlineId,
          created_at: new Date().toISOString(),
          company_id: companyId,
          sale_type: 'BALCAO',
          payment_method: paymentMethod,
          total_amount: subtotal,
          discount_amount: discountAmount,
          final_amount: totalFinal,
          customer_name: customerName || null,
          customer_cpf: customerDoc || null,
          items: payloadItems
        };

        try {
          const currentList = JSON.parse(
            localStorage.getItem('adega_mauricio_pending_sales') ||
            localStorage.getItem('adega_mauri_pending_sales') ||
            '[]'
          );
          currentList.push(offlineSaleRecord);
          localStorage.setItem('adega_mauricio_pending_sales', JSON.stringify(currentList));
          setPendingSales(currentList);
        } catch (e) {
          console.error('Erro ao salvar venda offline no localStorage:', e);
        }

        // Abate o estoque localmente em memória e no cache para manter precisão
        setProducts(prevProds => {
          const updated = prevProds.map(p => {
            const soldItem = cart.find(ci => ci.product.id === p.id);
            if (soldItem) {
              const units = soldItem.isBox ? soldItem.quantity * (soldItem.boxUnits || 1) : soldItem.quantity;
              return { ...p, current_stock: Math.max(0, p.current_stock - units) };
            }
            return p;
          });
          try {
            localStorage.setItem('adega_mauricio_offline_catalog', JSON.stringify(updated));
          } catch {}
          return updated;
        });

        setSyncNotice(`Venda registrada com sucesso em MODO OFFLINE (${offlineId})! Sincronizará automaticamente com a internet.`);
      }

      const saleReceipt = {
        id: saleId || '000001',
        date: new Date().toISOString(),
        items: [...cart],
        subtotal,
        discountAmount,
        totalFinal,
        paymentMethod,
        amountPaid: parseFloat(amountPaid) || totalFinal,
        troco,
        customerName,
        customerDoc,
        isOffline: isOfflineSale
      };

      const formatted: ReceiptData = {
        id: (saleReceipt.id && saleReceipt.id.startsWith('OFF-') ? `[OFFLINE] ${saleReceipt.id}` : saleReceipt.id) || '000001',
        date: saleReceipt.date,
        companyTradeName: 'ADEGA DE MAURICIO',
        companyName: 'Adega e Depósito Mauricio Ltda',
        companyAddress: 'Rua Nova Do Campo, Ao Lado Da Quadra Mimoso, BA',
        companyPhone: '(71) 98103-8699',
        logoUrl: '/logo.jpg',
        items: saleReceipt.items.map((i: any) => ({
          name: i.displayName || i.product?.name || i.name || 'Produto',
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          totalPrice: i.unitPrice * i.quantity,
          isBox: i.isBox,
          boxUnits: i.boxUnits,
        })),
        subtotal: saleReceipt.subtotal,
        discountAmount: saleReceipt.discountAmount,
        totalFinal: saleReceipt.totalFinal,
        paymentMethod: saleReceipt.paymentMethod,
        amountPaid: saleReceipt.amountPaid,
        troco: saleReceipt.troco,
        customerName: saleReceipt.customerName || undefined,
        customerDoc: saleReceipt.customerDoc || undefined,
        operatorName: 'Caixa 01',
        isTest: false,
      };

      setActivePrintData(formatted);
      setCompletedSale(saleReceipt);
      setCart([]);
      setIsCheckoutOpen(false);
      setDiscountInput('');
      setAmountPaid('');
      setCustomerName('');
      setCustomerDoc('');

      // Dispara a impressão imediatamente sem necessidade de clique
      if (autoPrint) {
        handlePrintReceipt(formatted);
      }
    } catch (err: any) {
      alert('Falha ao processar venda no PDV: ' + err.message);
    } finally {
      setFinishing(false);
    }
  }

  // ============================================================================
  // IMPRESSÃO TÉRMICA DIRETA (AGENTE LOCAL OU NAVEGADOR POS-80)
  // ============================================================================
  async function handlePrintReceipt(saleData?: any) {
    const rawReceipt = saleData || completedSale || activePrintData;
    if (!rawReceipt) return;

    const formatted: ReceiptData = {
      id: rawReceipt.id || '000001',
      date: rawReceipt.date || new Date().toISOString(),
      companyTradeName: 'ADEGA DE MAURICIO',
      companyName: 'Adega e Depósito Mauricio Ltda',
      companyAddress: 'Rua Nova Do Campo, Ao Lado Da Quadra Mimoso, BA',
      companyPhone: '(71) 98103-8699',
      logoUrl: '/logo.jpg',
      items: (rawReceipt.items || []).map((i: any) => ({
        name: i.displayName || i.product?.name || i.name || 'Produto',
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        totalPrice: i.totalPrice !== undefined ? i.totalPrice : (i.unitPrice * i.quantity),
        isBox: i.isBox,
        boxUnits: i.boxUnits,
      })),
      subtotal: rawReceipt.subtotal || rawReceipt.totalFinal,
      discountAmount: rawReceipt.discountAmount || 0,
      totalFinal: rawReceipt.totalFinal,
      paymentMethod: rawReceipt.paymentMethod || 'DINHEIRO',
      amountPaid: rawReceipt.amountPaid || rawReceipt.totalFinal,
      troco: rawReceipt.troco || 0,
      customerName: rawReceipt.customerName || undefined,
      customerDoc: rawReceipt.customerDoc || undefined,
      operatorName: 'Caixa 01',
      isTest: rawReceipt.isTest || false,
    };

    setActivePrintData(formatted);
    setIsPrinting(true);

    // 1. Tenta envio direto para o Agente Local (http://127.0.0.1:9123/print) se estiver rodando
    try {
      const agentCtrl = new AbortController();
      const agentTimeout = setTimeout(() => agentCtrl.abort(), 800);

      const agentRes = await fetch('http://127.0.0.1:9123/print', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mauri-pos-secret-2026',
        },
        body: JSON.stringify({
          type: 'SALE',
          data: formatted,
        }),
        signal: agentCtrl.signal,
      });
      clearTimeout(agentTimeout);

      if (agentRes.ok) {
        setIsPrinting(false);
        return;
      }
    } catch {
      // Agente local não respondeu, tenta endpoint /api/print
    }

    // 2. Tenta envio direto para o Windows Spooler via backend local (/api/print)
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2500);

      const response = await fetch('/api/print', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          data: formatted,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const resData = await response.json().catch(() => null);
      if (response.ok && resData?.success) {
        setIsPrinting(false);
        return;
      }
    } catch {
      // Falha ou timeout -> prossegue para impressão via navegador
    }

    // 3. Fallback: dispara a impressão isolada dedicada para a bobina POS-80 (evita corte de estilos ou tela em branco)
    setTimeout(() => {
      printThermalReceipt(formatted);
      setIsPrinting(false);
    }, 50);
  }

  // ============================================================================
  // IMPRESSÃO DE ORÇAMENTO / COTAÇÃO (SEM ABATER ESTOQUE NEM LANÇAR FINANCEIRO)
  // ============================================================================
  async function handlePrintQuotation() {
    if (cart.length === 0) {
      alert('Adicione ao menos um item no carrinho para emitir o orçamento.');
      return;
    }

    const quoteId = 'ORC-' + Math.floor(1000 + Math.random() * 9000);
    const formatted: ReceiptData = {
      id: quoteId,
      date: new Date().toISOString(),
      companyTradeName: 'ADEGA DE MAURICIO',
      companyName: 'Adega e Depósito Mauricio Ltda',
      companyAddress: 'Rua Nova Do Campo, Ao Lado Da Quadra Mimoso, BA',
      companyPhone: '(71) 98103-8699',
      logoUrl: '/logo-print.png',
      items: cart.map(i => ({
        name: i.displayName || i.product.name,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        totalPrice: i.unitPrice * i.quantity,
        isBox: i.isBox,
        boxUnits: i.boxUnits
      })),
      subtotal: subtotal,
      discountAmount: discountAmount || 0,
      totalFinal: totalFinal,
      paymentMethod: 'ORÇAMENTO',
      customerName: quotationCustomer.trim() || customerName || 'Cliente Balcão',
      operatorName: 'Caixa 01',
      isQuotation: true,
      quotationValidity: quotationValidity.trim() || '3 dias',
      quotationNotes: 'Orçamento sujeito a alteração de preço e disponibilidade de estoque.'
    };

    setActivePrintData(formatted);
    setIsPrintingQuotation(true);

    // 1. Tenta envio direto USB via /api/print
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch('/api/print', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: formatted }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      const resData = await response.json().catch(() => null);
      if (response.ok && resData?.success) {
        setIsPrintingQuotation(false);
        setIsQuotationModalOpen(false);
        if (clearCartAfterQuotation) clearCart();
        return;
      }
    } catch {
      // Se USB direto falhar, segue para o navegador
    }

    // 2. Fallback via navegador
    setTimeout(() => {
      printThermalReceipt(formatted);
      setIsPrintingQuotation(false);
      setIsQuotationModalOpen(false);
      if (clearCartAfterQuotation) clearCart();
    }, 100);
  }

  function handleOpenTestModal() {
    const testSample: ReceiptData = {
      id: 'TEST-' + Math.floor(1000 + Math.random() * 9000),
      date: new Date().toISOString(),
      companyTradeName: 'ADEGA DE MAURICIO',
      companyName: 'Adega e Depósito Mauricio Ltda',
      companyAddress: 'Rua Nova Do Campo, Ao Lado Da Quadra Mimoso, BA',
      companyPhone: '(71) 98103-8699',
      logoUrl: '/logo.jpg',
      items: [
        {
          name: 'Cerveja Heineken Long Neck 330ml',
          quantity: 2,
          unitPrice: 8.50,
          totalPrice: 17.00,
        },
        {
          name: 'Cerveja Brahma Chopp Lata 350ml',
          quantity: 6,
          unitPrice: 4.50,
          totalPrice: 27.00,
        },
        {
          name: 'Whisky Red Label 1L [CX c/ 6]',
          quantity: 1,
          unitPrice: 89.90,
          totalPrice: 89.90,
          isBox: true,
          boxUnits: 6,
        },
      ],
      subtotal: 133.90,
      discountAmount: 3.90,
      totalFinal: 130.00,
      paymentMethod: 'PIX',
      amountPaid: 130.00,
      troco: 0,
      customerName: 'Cliente Balcão',
      operatorName: 'Caixa 01',
      isTest: true,
    };
    setActivePrintData(testSample);
    setIsTestModalOpen(true);
  }

  function toggleAutoPrint(val: boolean) {
    setAutoPrint(val);
    try {
      localStorage.setItem('adega_mauricio_auto_print', val ? 'true' : 'false');
    } catch {}
  }

  function toggleAutoClose(val: boolean) {
    setAutoCloseModal(val);
    try {
      localStorage.setItem('adega_mauricio_auto_close_modal', val ? 'true' : 'false');
    } catch {}
  }

  // Produtos filtrados na pesquisa manual
  const searchResults = manualSearchTerm.trim()
    ? products.filter(p => 
        p.name.toLowerCase().includes(manualSearchTerm.toLowerCase()) || 
        (p.barcode && p.barcode.includes(manualSearchTerm)) ||
        (p.sku && p.sku.toLowerCase().includes(manualSearchTerm.toLowerCase()))
      )
    : products.slice(0, 20);

  return (
    <div className="h-[calc(100vh-4.5rem)] flex flex-col gap-3 select-none overflow-hidden max-w-[1600px] mx-auto w-full">
      {/* =========================================================================
          BARRA DE TOPO DO TERMINAL DE CAIXA (SUPERMERCADO STYLE)
          ========================================================================= */}
      <div className="bg-stone-950 border border-stone-800 rounded-2xl px-4 py-2.5 flex items-center justify-between shadow-xl flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="relative w-8 h-8 rounded-xl overflow-hidden border border-amber-500/40 bg-stone-900 shrink-0 shadow-md">
            <Image
              src="/logo.jpg"
              alt="Adega de Mauricio"
              fill
              className="object-cover"
              sizes="32px"
            />
          </div>
          <div className="flex items-center gap-2 px-3 py-1 bg-stone-900 border border-stone-800 rounded-xl">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="text-xs font-black uppercase tracking-wider text-emerald-400">
              CAIXA 01 — ABERTO
            </span>
          </div>

          <div className="hidden sm:flex items-center gap-2 text-xs text-stone-400 font-mono">
            <ScanBarcode className="w-4 h-4 text-amber-400" />
            <span>Leitor Laser:</span>
            <span className="text-emerald-400 font-bold">Pronto</span>
          </div>

          {/* STATUS DE CONECTIVIDADE DA MÁQUINA */}
          {isOnline ? (
            <div className="hidden md:flex items-center gap-1.5 px-3 py-1 bg-stone-900/90 border border-emerald-900/60 rounded-xl text-xs font-mono text-emerald-400" title="Conectado à nuvem Supabase">
              <Wifi className="w-3.5 h-3.5 text-emerald-400" />
              <span>Online</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-950/80 border border-amber-600/70 rounded-xl text-xs font-black text-amber-300 animate-pulse" title="Sem internet! As vendas continuam normalmente e serão sincronizadas depois">
              <WifiOff className="w-3.5 h-3.5 text-amber-400" />
              <span>Modo Offline Ativo</span>
            </div>
          )}

          {/* BOTÃO PARA SINCRONIZAR VENDAS OFFLINE */}
          {pendingSales.length > 0 && (
            <button
              type="button"
              onClick={syncPendingSales}
              disabled={isSyncing}
              title="Clique para sincronizar agora com o servidor"
              className="flex items-center gap-1.5 px-3 py-1 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/50 rounded-xl text-xs font-black text-amber-300 transition-all cursor-pointer shadow-md"
            >
              <RefreshCw className={cn("w-3.5 h-3.5 text-amber-400", isSyncing && "animate-spin")} />
              <span>{isSyncing ? "Sincronizando..." : `${pendingSales.length} venda(s) offline`}</span>
            </button>
          )}
        </div>

        {/* ATALHOS RÁPIDOS NO TOPO */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsSearchModalOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-stone-900 hover:bg-stone-800 border border-stone-800 text-stone-300 text-xs font-bold transition-all flex items-center gap-1.5"
          >
            <Search className="w-3.5 h-3.5 text-amber-400" />
            <span>Consultar Item (F8)</span>
          </button>

          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="p-1.5 rounded-xl bg-stone-900 hover:bg-stone-800 border border-stone-800 text-stone-400 hover:text-amber-300 transition-colors"
            title={soundEnabled ? 'Silenciar bipe' : 'Ativar bipe'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4 text-amber-400" /> : <VolumeX className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* BANNER DE NOTIFICAÇÃO DE MODO OFFLINE / SINCRONIZAÇÃO */}
      {syncNotice && (
        <div className="bg-amber-500/15 border border-amber-500/40 rounded-2xl px-4 py-2 flex items-center justify-between text-xs text-amber-200 animate-in fade-in flex-shrink-0">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="font-semibold">{syncNotice}</span>
          </div>
          <button 
            type="button"
            onClick={() => setSyncNotice(null)} 
            className="text-amber-400 hover:text-white cursor-pointer ml-3 p-1 rounded-lg hover:bg-stone-800"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* =========================================================================
          CAMPO PRINCIPAL DE LEITURA DO CÓDIGO DE BARRAS
          ========================================================================= */}
      <form onSubmit={handleBarcodeSubmit} className="relative flex-shrink-0">
        <div className="flex items-center gap-3 bg-stone-950 border-2 border-amber-500/70 focus-within:border-amber-400 focus-within:ring-4 focus-within:ring-amber-500/20 rounded-2xl p-2.5 shadow-2xl transition-all">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-amber-600 via-amber-500 to-yellow-400 flex items-center justify-center text-stone-950 font-black shadow-lg shadow-amber-950/60 flex-shrink-0">
            <Barcode className="w-7 h-7 stroke-[2.5]" />
          </div>
          <input
            ref={barcodeInputRef}
            type="text"
            placeholder="BIPE O CÓDIGO DE BARRAS OU DIGITE O NÚMERO / SKU..."
            value={barcodeInput}
            onChange={(e) => setBarcodeInput(e.target.value)}
            className="w-full bg-transparent text-amber-100 font-mono text-lg sm:text-xl font-black uppercase tracking-wider placeholder:text-stone-600 placeholder:font-sans placeholder:text-sm placeholder:font-normal focus:outline-none"
          />
          <Button
            type="submit"
            className="h-11 px-6 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-stone-950 font-black rounded-xl shadow-lg shadow-amber-950/50 flex-shrink-0"
          >
            Registrar (Enter)
          </Button>
        </div>
      </form>

      {/* =========================================================================
          CORPO CENTRAL DO PDV: BOBINA DE CUPOM (ESQ) + PAINEL DE TOTAIS (DIR)
          ========================================================================= */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-3 min-h-0 overflow-hidden">
        {/* =====================================================================
            COLUNA ESQUERDA (8 COLUNAS): CUPOM ITEM A ITEM + ÚLTIMO PRODUTO
            ===================================================================== */}
        <div className="lg:col-span-8 flex flex-col bg-stone-950 border border-stone-800 rounded-2xl shadow-2xl overflow-hidden min-h-0">
          {/* DISPLAY DO ÚLTIMO PRODUTO REGISTRADO (TELA DO CLIENTE / OPERADOR) */}
          <div className="p-3.5 bg-gradient-to-r from-stone-900/90 via-stone-900/70 to-stone-950 border-b border-stone-800 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 font-bold flex-shrink-0">
                <Package className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] uppercase font-extrabold tracking-wider text-amber-400/90 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping"></span>
                  Último Produto Registrado
                </span>
                <div className="text-base sm:text-lg font-black text-white uppercase tracking-tight truncate">
                  {lastItem ? (lastItem.displayName || lastItem.product.name) : 'NENHUM ITEM BIPADO'}
                </div>
              </div>
            </div>

            {lastItem && (
              <div className="flex items-center gap-4 text-right flex-shrink-0 font-mono">
                <div>
                  <div className="text-[10px] text-stone-400 font-sans uppercase font-bold">Qtd Registrada</div>
                  <div className="text-sm font-black text-amber-300">
                    {lastItem.quantity} {lastItem.isBox ? 'cx' : lastItem.product.unit || 'un'}
                  </div>
                </div>
                <div className="border-l border-stone-800 pl-4">
                  <div className="text-[10px] text-stone-400 font-sans uppercase font-bold">Total do Item</div>
                  <div className="text-base sm:text-lg font-black text-emerald-400">
                    {formatCurrency(lastItem.unitPrice * lastItem.quantity)}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* CABEÇALHO DA BOBINA / TABELA DE ITENS (SUPERMERCADO CLÁSSICO) */}
          <div className="bg-stone-900/90 border-b border-stone-800 px-4 py-2.5 grid grid-cols-12 text-[11px] font-extrabold uppercase tracking-wider text-stone-400 flex-shrink-0">
            <div className="col-span-1 text-center font-mono">Item</div>
            <div className="col-span-2 font-mono">Código EAN</div>
            <div className="col-span-4">Descrição do Produto</div>
            <div className="col-span-2 text-center">Quantidade</div>
            <div className="col-span-1 text-right font-mono">Unitário</div>
            <div className="col-span-2 text-right font-mono pr-2">Total Item</div>
          </div>

          {/* LISTA DE ITENS DO CUPOM (UM EMBAIXO DO OUTRO - BOBINA ELETRÔNICA) */}
          <div className="flex-1 overflow-y-auto divide-y divide-stone-800/60 font-mono text-xs">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 text-stone-500 space-y-3">
                <div className="w-16 h-16 rounded-3xl bg-stone-900/80 border border-stone-800 flex items-center justify-center text-amber-400/50 shadow-inner">
                  <ScanBarcode className="w-8 h-8 stroke-1 animate-pulse" />
                </div>
                <div>
                  <p className="text-sm font-black text-stone-300 uppercase tracking-wider">
                    CAIXA LIVRE — PRONTO PARA REGISTRAR
                  </p>
                  <p className="text-xs text-stone-500 font-sans mt-1 max-w-sm">
                    Passe o leitor de código de barras ou use a barra de busca acima para registrar mercadorias.
                  </p>
                </div>
              </div>
            ) : (
              cart.map((item, index) => {
                const itemNumber = (index + 1).toString().padStart(3, '0');
                const price = item.unitPrice;
                const itemTotal = price * item.quantity;
                const isLast = index === cart.length - 1;

                return (
                  <div
                    key={item.id}
                    className={`px-4 py-3 grid grid-cols-12 items-center transition-colors group ${
                      isLast 
                        ? 'bg-amber-500/10 border-l-4 border-l-amber-400' 
                        : index % 2 === 0 ? 'bg-stone-950/60' : 'bg-stone-900/30'
                    } hover:bg-stone-900/80`}
                  >
                    {/* NÚMERO DO ITEM */}
                    <div className="col-span-1 text-center font-bold text-amber-400/90 text-xs">
                      {itemNumber}
                    </div>

                    {/* CÓDIGO DE BARRAS / SKU */}
                    <div className="col-span-2 text-stone-400 text-xs truncate pr-2">
                      {item.product.barcode || item.product.sku || '-'}
                    </div>

                    {/* DESCRIÇÃO DO PRODUTO */}
                    <div className="col-span-4 font-sans font-bold text-stone-100 text-sm truncate pr-2">
                      {item.displayName || item.product.name}
                      {item.isBox ? (
                        <span className="ml-2 text-[10px] text-amber-300 font-mono font-bold bg-amber-500/20 px-1.5 py-0.5 rounded border border-amber-500/30">
                          📦 Caixa c/ {item.boxUnits}
                        </span>
                      ) : (
                        <span className="ml-2 text-[10px] text-stone-500 font-mono font-normal">
                          ({item.product.unit || 'un'})
                        </span>
                      )}
                    </div>

                    {/* CONTROLE DE QUANTIDADE RÁPIDO */}
                    <div className="col-span-2 flex items-center justify-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => updateQuantity(item.id, -1)}
                        className="w-7 h-7 rounded-lg bg-stone-900 hover:bg-stone-800 border border-stone-800 text-stone-300 flex items-center justify-center font-bold hover:text-white transition-colors"
                        title="Diminuir 1"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="w-8 text-center font-black text-amber-300 text-sm">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateQuantity(item.id, 1)}
                        className="w-7 h-7 rounded-lg bg-stone-900 hover:bg-stone-800 border border-stone-800 text-stone-300 flex items-center justify-center font-bold hover:text-white transition-colors"
                        title="Aumentar 1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* VALOR UNITÁRIO */}
                    <div className="col-span-1 text-right text-stone-400 font-medium">
                      {formatCurrency(price)}
                    </div>

                    {/* TOTAL DO ITEM + BOTÃO DE EXCLUIR */}
                    <div className="col-span-2 flex items-center justify-end gap-3 pr-2">
                      <span className="font-black text-amber-300 text-sm">
                        {formatCurrency(itemTotal)}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeFromCart(item.id)}
                        className="text-stone-600 hover:text-rose-400 p-1 rounded hover:bg-rose-950/40 transition-colors"
                        title="Remover Item"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={tableBottomRef} />
          </div>

          {/* RODAPÉ DA BOBINA COM TOTAL DE VOLUMES */}
          <div className="p-3 bg-stone-900/80 border-t border-stone-800 flex items-center justify-between text-xs text-stone-400 flex-shrink-0">
            <div className="flex items-center gap-4">
              <span>
                Total de Linhas: <strong className="text-white font-mono">{cart.length}</strong>
              </span>
              <span>
                Volumes / Peças: <strong className="text-amber-300 font-mono">{totalQuantity}</strong>
              </span>
            </div>
            {cart.length > 0 && (
              <button
                type="button"
                onClick={clearCart}
                className="text-stone-500 hover:text-rose-400 flex items-center gap-1 text-[11px] font-bold"
              >
                <Trash2 className="w-3 h-3" /> Cancelar Venda (F4)
              </button>
            )}
          </div>
        </div>

        {/* =====================================================================
            COLUNA DIREITA (4 COLUNAS): TOTAIS, DISPLAY DIGITAL & FECHAMENTO
            ===================================================================== */}
        <div className="lg:col-span-4 flex flex-col justify-between bg-stone-950 border border-stone-800 rounded-2xl shadow-2xl p-4 sm:p-5 space-y-4 overflow-y-auto">
          <div className="space-y-4">
            {/* CABEÇALHO DO RESUMO */}
            <div className="flex items-center justify-between pb-3 border-b border-stone-800">
              <div className="flex items-center gap-2">
                <Receipt className="w-5 h-5 text-amber-400" />
                <h2 className="text-base font-black text-white">Resumo da Venda</h2>
              </div>
              <span className="text-xs font-mono font-bold text-amber-400/90 bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/20">
                {cart.length} itens
              </span>
            </div>

            {/* SUBTOTAL BRUTO */}
            <div className="flex justify-between items-center text-sm text-stone-400 py-1">
              <span>Subtotal dos Itens</span>
              <span className="font-mono font-bold text-white text-base">
                {formatCurrency(subtotal)}
              </span>
            </div>

            {/* CAMPO DE DESCONTO INTELIGENTE */}
            <div className="p-3 bg-stone-900/60 border border-stone-800/80 rounded-2xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-bold text-amber-400">
                  <Percent className="w-3.5 h-3.5" /> Desconto
                </span>
                
                {/* SELETOR DE FORMATO: R$ OU % */}
                <div className="inline-flex rounded-lg bg-stone-950 p-0.5 border border-stone-800 text-xs">
                  <button
                    type="button"
                    onClick={() => setDiscountType('reais')}
                    className={`px-2.5 py-0.5 rounded font-black transition-all ${
                      discountType === 'reais' 
                        ? 'bg-amber-500 text-stone-950 shadow-sm' 
                        : 'text-stone-400 hover:text-white'
                    }`}
                  >
                    R$
                  </button>
                  <button
                    type="button"
                    onClick={() => setDiscountType('percent')}
                    className={`px-2.5 py-0.5 rounded font-black transition-all ${
                      discountType === 'percent' 
                        ? 'bg-amber-500 text-stone-950 shadow-sm' 
                        : 'text-stone-400 hover:text-white'
                    }`}
                  >
                    %
                  </button>
                </div>
              </div>

              {/* CAMPO DE DIGITAÇÃO LIVRE COM VÍRGULA OU PONTO */}
              <div className="relative flex items-center">
                <span className="absolute left-3 text-stone-500 font-mono text-xs font-bold">
                  {discountType === 'reais' ? 'R$' : '%'}
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={discountInput}
                  onChange={(e) => {
                    const clean = e.target.value.replace(/[^0-9.,]/g, '');
                    setDiscountInput(clean);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.stopPropagation();
                      (e.target as HTMLElement).blur();
                      focusScanner();
                    }
                  }}
                  placeholder="0,00"
                  className="w-full bg-stone-950 border border-stone-800 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 rounded-xl pl-9 pr-9 py-2 text-right font-mono text-base font-black text-amber-300 focus:outline-none"
                />
                {discountInput && (
                  <button
                    type="button"
                    onClick={() => setDiscountInput('')}
                    className="absolute right-2.5 text-stone-500 hover:text-white p-1"
                    title="Remover desconto"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* ATALHOS RÁPIDOS DE DESCONTO */}
              <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                {['0.50', '1', '2', '5'].map(val => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => {
                      setDiscountType('reais');
                      setDiscountInput(val.replace('.', ','));
                    }}
                    className="px-2 py-0.5 rounded-lg bg-stone-800/80 hover:bg-amber-500 hover:text-stone-950 text-stone-300 text-[11px] font-mono font-bold transition-all"
                  >
                    R$ {val.replace('.', ',')}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setDiscountType('percent');
                    setDiscountInput('10');
                  }}
                  className="px-2 py-0.5 rounded-lg bg-stone-800/80 hover:bg-amber-500 hover:text-stone-950 text-stone-300 text-[11px] font-mono font-bold transition-all"
                >
                  10%
                </button>
              </div>

              {discountAmount > 0 && (
                <div className="flex justify-between items-center text-xs font-mono pt-1 text-emerald-400 font-bold border-t border-stone-800/60">
                  <span>Desconto Aplicado:</span>
                  <span>- {formatCurrency(discountAmount)}</span>
                </div>
              )}
            </div>

            {/* DISPLAY GIGANTE DO TOTAL A PAGAR (ESTILO SUPERMERCADO) */}
            <div className="bg-gradient-to-br from-stone-900 via-stone-950 to-stone-900 border-2 border-amber-500/50 p-5 rounded-3xl shadow-inner text-center space-y-1">
              <span className="text-xs font-extrabold uppercase tracking-widest text-amber-400 block">
                TOTAL A PAGAR
              </span>
              <div className="text-4xl sm:text-5xl font-black text-amber-300 font-mono tracking-tight drop-shadow-md">
                {formatCurrency(totalFinal)}
              </div>
              <span className="text-[11px] text-stone-500 block pt-1">
                Pressione <strong className="text-amber-400 font-mono">F2</strong> para finalizar
              </span>
            </div>
          </div>

          {/* BOTÕES DE FECHAMENTO */}
          <div className="space-y-2 pt-2">
            <Button
              type="button"
              onClick={() => setIsCheckoutOpen(true)}
              disabled={cart.length === 0}
              className="w-full h-14 bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-stone-950 font-black text-base rounded-2xl shadow-xl shadow-amber-950/70 border border-amber-300/40 flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-[0.98]"
            >
              <ArrowRight className="w-5 h-5 stroke-[3]" /> RECEBER PAGAMENTO [F2]
            </Button>

            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={cart.length === 0}
                onClick={() => setIsQuotationModalOpen(true)}
                className="h-11 rounded-xl bg-stone-900/90 hover:bg-stone-800 border-stone-800 text-stone-300 hover:text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <FileText className="w-4 h-4 text-amber-400" />
                <span>Orçamento [F3]</span>
              </Button>

              <button
                type="button"
                onClick={() => setIsSearchModalOpen(true)}
                className="h-11 rounded-xl bg-stone-900/90 hover:bg-stone-800 border border-stone-800 text-stone-300 hover:text-white text-xs font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Search className="w-4 h-4 text-amber-400" />
                <span>Consultar [F8]</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
          MODAL DE PESQUISA RÁPIDA DE PRODUTOS [F8] (SEM CÓDIGO OU RASURADO)
          ========================================================================= */}
      {isSearchModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-150">
          <div className="bg-stone-950 border border-amber-900/60 rounded-3xl w-full max-w-2xl p-6 shadow-2xl space-y-4 flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between pb-3 border-b border-stone-800">
              <div className="flex items-center gap-2.5">
                <Search className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-black text-white">Consulta Rápida de Produtos</h3>
              </div>
              <button
                onClick={() => setIsSearchModalOpen(false)}
                className="text-stone-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <Input
              type="text"
              autoFocus
              placeholder="Digite o nome, chopp, lata, vodka, gelo..."
              value={manualSearchTerm}
              onChange={(e) => setManualSearchTerm(e.target.value)}
              className="bg-stone-900 border-stone-800 text-sm font-semibold h-12"
            />

            <div className="flex-1 overflow-y-auto space-y-2 pr-1 no-scrollbar divide-y divide-stone-800/40">
              {searchResults.length === 0 ? (
                <div className="py-12 text-center text-stone-500 text-xs">Nenhum produto encontrado.</div>
              ) : (
                searchResults.map(p => {
                  const price = Number(p.selling_price ?? p.sale_price ?? 0);
                  return (
                    <div
                      key={p.id}
                      className="p-3 hover:bg-stone-900/80 rounded-xl flex items-center justify-between transition-colors gap-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-stone-100 text-sm truncate">{p.name}</div>
                        <div className="text-xs text-stone-400 font-mono truncate">
                          Código: {p.barcode || p.sku || '-'} • Estoque: {p.current_stock} {p.unit}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            addToCart(p, false, 1);
                            setIsSearchModalOpen(false);
                          }}
                          className="text-xs font-mono font-bold"
                        >
                          + Avulso {formatCurrency(price)}
                        </Button>

                        {p.box_enabled && (
                          <Button
                            size="sm"
                            onClick={() => {
                              addToCart(p, true, p.box_units || 1, p.box_price);
                              setIsSearchModalOpen(false);
                            }}
                            className="text-xs font-mono font-black bg-amber-500 hover:bg-amber-400 text-stone-950"
                          >
                            📦 Caixa c/{p.box_units || 1} {formatCurrency(p.box_price || price * (p.box_units || 1))}
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL DE CÓDIGO NÃO CADASTRADO (NOVO QR CODE OU CAIXA NO BALCÃO)
          ========================================================================= */}
      {unknownScannedCode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-150">
          <div className="bg-stone-950 border border-amber-500/70 rounded-3xl w-full max-w-lg p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-stone-800">
              <div className="flex items-center gap-2.5">
                <AlertCircle className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-black text-white">Código não Reconhecido</h3>
              </div>
              <button
                onClick={() => setUnknownScannedCode(null)}
                className="text-stone-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-stone-900 rounded-xl border border-stone-800 flex items-center justify-between font-mono">
              <span className="text-xs text-stone-400">Código Bipado:</span>
              <span className="text-sm font-black text-amber-400">{unknownScannedCode}</span>
            </div>

            <p className="text-xs text-stone-300">
              Este código/QR Code pertence a um produto que você já vende (por exemplo, uma nova caixa ou novo lote)?
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
                🏷️ É Garrafa/Unidade Avulsa
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-stone-300 uppercase tracking-wider">
                Selecione o Produto Existente:
              </label>
              <select
                value={linkTargetProductId}
                onChange={(e) => {
                  setLinkTargetProductId(e.target.value);
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

            {linkMode === 'box' && linkTargetProductId && (
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-stone-400 uppercase">
                    Qtd por Caixa
                  </label>
                  <Input
                    type="number"
                    value={linkBoxUnits}
                    onChange={(e) => setLinkBoxUnits(e.target.value)}
                    className="font-mono text-xs font-bold"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-stone-400 uppercase">
                    Preço da Caixa (R$)
                  </label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="Ex: 180.00"
                    value={linkBoxPrice}
                    onChange={(e) => setLinkBoxPrice(e.target.value)}
                    className="font-mono text-xs font-bold text-emerald-400"
                  />
                </div>
              </div>
            )}

            <div className="flex gap-2.5 pt-3 border-t border-stone-800">
              <Button
                type="button"
                variant="outline"
                onClick={() => setUnknownScannedCode(null)}
                className="flex-1 text-xs"
              >
                Ignorar
              </Button>
              <Button
                type="button"
                onClick={handleLinkUnknownCode}
                disabled={!linkTargetProductId || linking}
                className="flex-1 bg-gradient-to-r from-amber-500 to-yellow-500 text-stone-950 font-black text-xs shadow-lg shadow-amber-950/50"
              >
                {linking ? 'Vinculando...' : 'Vincular e Registrar Venda'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL DE RECEBIMENTO & FORMAS DE PAGAMENTO [F2]
          ========================================================================= */}
      {isCheckoutOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-stone-950 border border-amber-900/60 rounded-3xl w-full max-w-lg p-6 sm:p-7 shadow-2xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-stone-800">
              <div className="flex items-center gap-2">
                <Receipt className="w-5 h-5 text-amber-400" />
                <h3 className="text-lg font-black text-white">Recebimento do Caixa</h3>
              </div>
              <button onClick={() => setIsCheckoutOpen(false)} className="text-stone-400 hover:text-white p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* DISPLAY TOTAL GIGANTE EM DOURADO */}
            <div className="bg-stone-900/90 border border-amber-500/30 p-5 rounded-2xl text-center shadow-inner">
              <span className="text-xs font-bold text-amber-400 uppercase tracking-widest">Valor Total a Cobrar</span>
              <div className="text-4xl font-black text-amber-300 font-mono mt-1">
                {formatCurrency(totalFinal)}
              </div>
            </div>

            {/* SELEÇÃO DAS FORMAS DE PAGAMENTO */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {[
                { id: 'DINHEIRO', label: 'Dinheiro', icon: Banknote },
                { id: 'PIX', label: 'PIX', icon: QrCode },
                { id: 'CARTAO_DEBITO', label: 'Débito', icon: CreditCard },
                { id: 'CARTAO_CREDITO', label: 'Crédito', icon: CreditCard },
                { id: 'FIADO', label: 'A Prazo (Fiado)', icon: BookOpen }
              ].map(method => {
                const Icon = method.icon;
                const isSelected = paymentMethod === method.id;
                return (
                  <button
                    key={method.id}
                    type="button"
                    onClick={() => setPaymentMethod(method.id as PaymentMethod)}
                    className={`py-3 px-2 rounded-2xl text-xs font-black border transition-all flex flex-col items-center gap-1.5 cursor-pointer ${
                      isSelected 
                        ? 'bg-amber-500 text-stone-950 border-amber-400 shadow-lg shadow-amber-950/60' 
                        : 'bg-stone-900 text-stone-400 border-stone-800 hover:text-white hover:border-stone-700'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="text-[11px] leading-tight text-center">{method.label}</span>
                  </button>
                );
              })}
            </div>

            {/* AVISO QUANDO FIADO / A PRAZO ESTÁ SELECIONADO */}
            {paymentMethod === 'FIADO' && (
              <div className="p-3.5 bg-amber-950/40 border border-amber-500/40 rounded-2xl space-y-1.5">
                <div className="flex items-center gap-2 text-amber-300 font-bold text-xs">
                  <BookOpen className="w-4 h-4 text-amber-400" />
                  <span>Venda a Prazo / Fiado na Caderneta</span>
                </div>
                <p className="text-[11px] text-stone-300 leading-relaxed">
                  O estoque será baixado imediatamente e a dívida ficará registrada na <strong>Área de Vendas a Prazo</strong> até ser quitada. O cupom térmico sairá com campo para assinatura do cliente.
                </p>
              </div>
            )}

            {/* DINHEIRO E TROCO AUTOMÁTICO */}
            {paymentMethod === 'DINHEIRO' && (
              <div className="p-4 bg-stone-900/80 border border-amber-500/20 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-stone-300">Valor Entregue pelo Cliente (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    autoFocus
                    value={amountPaid}
                    onChange={(e) => setAmountPaid(e.target.value)}
                    placeholder="0.00"
                    className="w-36 bg-stone-950 border border-amber-500/50 rounded-xl px-3 py-1.5 text-right font-mono text-base font-black text-amber-300 focus:outline-none focus:border-amber-400"
                  />
                </div>
                {troco > 0 && (
                  <div className="flex items-center justify-between pt-2.5 border-t border-stone-800">
                    <span className="text-xs font-black text-amber-400 uppercase tracking-wider">TROCO A DEVOLVER:</span>
                    <span className="font-mono font-black text-xl text-amber-300">{formatCurrency(troco)}</span>
                  </div>
                )}
              </div>
            )}

            {/* DADOS DO CLIENTE */}
            <div className="space-y-1.5">
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[11px] font-bold text-stone-400 block mb-1">
                    {paymentMethod === 'FIADO' ? 'Nome do Cliente * (Obrigatório)' : 'Nome do Cliente (Opcional)'}
                  </label>
                  <input
                    type="text"
                    required={paymentMethod === 'FIADO'}
                    placeholder={paymentMethod === 'FIADO' ? 'Ex: João do Bar, Zé...' : 'Nome do Cliente'}
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className={`w-full bg-stone-900 border rounded-xl px-3 py-2 text-xs text-white placeholder:text-stone-500 focus:outline-none ${
                      paymentMethod === 'FIADO' && !customerName.trim()
                        ? 'border-amber-500 ring-1 ring-amber-500/50'
                        : 'border-stone-800 focus:border-amber-500'
                    }`}
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-stone-400 block mb-1">
                    {paymentMethod === 'FIADO' ? 'Telefone / WhatsApp (Opcional)' : 'CPF na Nota (Opcional)'}
                  </label>
                  <input
                    type="text"
                    placeholder={paymentMethod === 'FIADO' ? '(71) 99999-9999' : '000.000.000-00'}
                    value={customerDoc}
                    onChange={(e) => setCustomerDoc(e.target.value)}
                    className="w-full bg-stone-900 border border-stone-800 rounded-xl px-3 py-2 text-xs text-white placeholder:text-stone-500 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-stone-800">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsCheckoutOpen(false)}
                className="text-stone-400 text-xs"
              >
                Voltar
              </Button>
              <Button
                type="button"
                onClick={handleFinalizeSale}
                disabled={finishing}
                className="bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-stone-950 font-black text-xs px-6 shadow-lg shadow-amber-950/60"
              >
                {finishing ? 'Processando Venda...' : 'Confirmar e Finalizar'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL PÓS-VENDA (COMPROVANTE DE CUPOM COM IMPRESSÃO AUTOMÁTICA)
          ========================================================================= */}
      {completedSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-stone-950 border border-amber-900/60 rounded-3xl w-full max-w-sm p-5 shadow-2xl space-y-3.5 text-center max-h-[94vh] overflow-y-auto">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center mx-auto shadow-lg shadow-amber-950/60">
              <CheckCircle2 className="w-7 h-7" />
            </div>

            <div>
              <h3 className="text-lg font-black text-white">Venda Concluída!</h3>
              {completedSale.isOffline ? (
                <div className="mt-1.5 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-bold">
                  <WifiOff className="w-3.5 h-3.5" />
                  <span>Venda Salva no Modo Offline</span>
                </div>
              ) : (
                <p className="text-xs text-stone-400">Estoque atualizado e caixa registrado.</p>
              )}
            </div>

            {/* Destaque de Troco para o Caixa */}
            {completedSale.troco > 0 && (
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-2.5 text-center">
                <span className="text-[11px] text-emerald-400 font-bold block uppercase tracking-wider">Troco do Cliente</span>
                <span className="text-2xl font-black text-emerald-300 font-mono">
                  {formatCurrency(completedSale.troco)}
                </span>
              </div>
            )}

            {/* Status da Impressão Automática */}
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-semibold">
              <Printer className={`w-3.5 h-3.5 ${isPrinting ? 'animate-bounce' : ''}`} />
              <span>{isPrinting ? 'Enviando cupom para impressão...' : 'Cupom impresso automaticamente'}</span>
            </div>

            {/* Prévia do Cupom Térmico */}
            <div className="bg-white rounded-2xl p-2.5 shadow-inner text-left max-h-48 overflow-y-auto border border-stone-400">
              {activePrintData && <ThermalReceipt data={activePrintData} />}
            </div>

            <div className="flex flex-col gap-1.5 px-1 text-xs text-stone-300 text-left pt-1">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={autoPrint}
                    onChange={(e) => toggleAutoPrint(e.target.checked)}
                    className="rounded border-stone-700 text-amber-500 focus:ring-amber-500 w-4 h-4 bg-stone-900"
                  />
                  <span className="text-[11px]">Auto-imprimir vendas</span>
                </label>
                <span className="text-[10px] text-amber-400 font-mono font-bold">POS-80 (80mm)</span>
              </div>

              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={autoCloseModal}
                    onChange={(e) => toggleAutoClose(e.target.checked)}
                    className="rounded border-stone-700 text-amber-500 focus:ring-amber-500 w-4 h-4 bg-stone-900"
                  />
                  <span className="text-[11px] text-stone-400">
                    {autoCloseModal ? `Próxima venda automática (${countdown}s)` : 'Avançar automaticamente'}
                  </span>
                </label>
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                onClick={() => handlePrintReceipt(completedSale)}
                disabled={isPrinting}
                className="flex-1 text-xs border-stone-800 text-stone-300 hover:text-white"
              >
                <Printer className="w-3.5 h-3.5 mr-1" />
                {isPrinting ? 'Enviando...' : 'Reimprimir (F9)'}
              </Button>
              <Button
                type="button"
                onClick={() => {
                  setCompletedSale(null);
                  focusScanner();
                }}
                className="flex-1 bg-amber-500 hover:bg-amber-400 text-stone-950 font-black text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-amber-500/20"
              >
                Nova Venda {autoCloseModal ? `(${countdown}s)` : '(Enter)'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL DE TESTE DE IMPRESSÃO DA TÉRMICA (POS-80)
          ========================================================================= */}
      {isTestModalOpen && activePrintData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-stone-950 border border-amber-900/60 rounded-3xl w-full max-w-md p-6 shadow-2xl space-y-4 max-h-[94vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-stone-800">
              <div className="flex items-center gap-2.5 text-amber-400">
                <Printer className="w-5 h-5" />
                <h3 className="text-base font-black text-white">Teste da Impressora Térmica</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsTestModalOpen(false)}
                className="p-1 rounded-lg text-stone-400 hover:text-white hover:bg-stone-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 bg-stone-900/80 rounded-xl border border-stone-800 text-xs space-y-1.5 text-stone-300">
              <div className="flex justify-between">
                <span>Impressora Detectada:</span>
                <span className="text-emerald-400 font-bold font-mono">POS-80 (Padrão Windows)</span>
              </div>
              <div className="flex justify-between">
                <span>Largura da Bobina:</span>
                <span className="text-white font-mono">80mm (48 colunas)</span>
              </div>
              <div className="flex justify-between">
                <span>Porta USB:</span>
                <span className="text-amber-400 font-mono">USB001</span>
              </div>
            </div>

            {/* Prévia do Cupom */}
            <div className="bg-white rounded-2xl p-2.5 shadow-inner text-left max-h-60 overflow-y-auto border border-stone-400">
              <ThermalReceipt data={activePrintData} />
            </div>

            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsTestModalOpen(false)}
                className="text-xs px-3"
              >
                Fechar
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  if (activePrintData) printThermalReceipt(activePrintData);
                }}
                className="flex-1 text-xs flex items-center justify-center gap-1.5 border border-stone-700 bg-stone-900 hover:bg-stone-800 text-stone-200"
              >
                <Printer className="w-3.5 h-3.5 text-stone-400" />
                <span>Via Navegador (80mm)</span>
              </Button>
              <Button
                type="button"
                onClick={() => handlePrintReceipt(activePrintData)}
                disabled={isPrinting}
                className="flex-1 bg-amber-500 hover:bg-amber-400 text-stone-950 font-black text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-amber-500/20"
              >
                <Printer className="w-3.5 h-3.5" />
                {isPrinting ? 'Enviando...' : 'Direto USB (Spooler)'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL DE ORÇAMENTO / COTAÇÃO [F3] (NÃO GERA VENDA / NÃO BAIXA ESTOQUE)
          ========================================================================= */}
      {isQuotationModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-150">
          <div className="bg-stone-950 border border-amber-900/60 rounded-3xl w-full max-w-lg p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-stone-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-amber-500/10 rounded-xl border border-amber-500/20">
                  <FileText className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white">Emitir Orçamento / Cotação</h3>
                  <p className="text-xs text-stone-400">Impressão térmica sem baixa de estoque [F3]</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsQuotationModalOpen(false)}
                className="text-stone-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Aviso informativo */}
            <div className="p-3 bg-amber-950/30 border border-amber-500/20 rounded-2xl flex items-start gap-2.5 text-xs text-amber-200/90 leading-relaxed">
              <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <span>
                Esta ação imprime a cotação com a logo da adega e valores atuais para o cliente. 
                <strong> Não registra venda</strong> e <strong>não altera o estoque</strong>.
              </span>
            </div>

            {/* Resumo do Orçamento */}
            <div className="bg-stone-900/90 border border-stone-800 rounded-2xl p-3.5 space-y-2 text-xs">
              <div className="flex justify-between text-stone-400">
                <span>Itens no Carrinho:</span>
                <span className="font-bold text-stone-200">{cart.length} produto(s)</span>
              </div>
              <div className="flex justify-between text-stone-400">
                <span>Subtotal:</span>
                <span className="font-semibold text-stone-200">{formatCurrency(subtotal)}</span>
              </div>
              {discountAmount > 0 && (
                <div className="flex justify-between text-emerald-400 font-medium">
                  <span>Desconto:</span>
                  <span>- {formatCurrency(discountAmount)}</span>
                </div>
              )}
              <div className="pt-2 border-t border-stone-800 flex justify-between items-baseline">
                <span className="font-bold text-stone-300">Total Estimado:</span>
                <span className="text-lg font-black text-amber-400">{formatCurrency(totalFinal)}</span>
              </div>
            </div>

            {/* Campos de Configuração do Orçamento */}
            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-stone-300 block mb-1">
                  Nome do Cliente (opcional)
                </label>
                <Input
                  type="text"
                  placeholder="Ex: Bar do Maurício, João Carlos..."
                  value={quotationCustomer}
                  onChange={(e) => setQuotationCustomer(e.target.value)}
                  className="bg-stone-900 border-stone-800 text-xs h-10"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-stone-300 block mb-1">
                  Validade da Cotação
                </label>
                <Input
                  type="text"
                  placeholder="Ex: 3 dias, 24 horas, 7 dias"
                  value={quotationValidity}
                  onChange={(e) => setQuotationValidity(e.target.value)}
                  className="bg-stone-900 border-stone-800 text-xs h-10"
                />
              </div>

              <label className="flex items-center gap-2 cursor-pointer pt-1 text-xs text-stone-400 hover:text-stone-300 select-none">
                <input
                  type="checkbox"
                  checked={clearCartAfterQuotation}
                  onChange={(e) => setClearCartAfterQuotation(e.target.checked)}
                  className="rounded border-stone-700 bg-stone-900 text-amber-500 focus:ring-0 focus:ring-offset-0 w-4 h-4"
                />
                <span>Limpar itens do carrinho após imprimir o orçamento</span>
              </label>
            </div>

            {/* Ações */}
            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsQuotationModalOpen(false)}
                className="flex-1 text-xs h-11 border-stone-800 bg-stone-900 text-stone-300 hover:text-white"
              >
                Cancelar [ESC]
              </Button>
              <Button
                type="button"
                onClick={handlePrintQuotation}
                disabled={isPrintingQuotation || cart.length === 0}
                className="flex-[2] text-xs h-11 bg-amber-500 hover:bg-amber-400 text-stone-950 font-black flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20"
              >
                <Printer className="w-4 h-4" />
                {isPrintingQuotation ? 'Imprimindo Orçamento...' : 'Imprimir Orçamento Térmico'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          ÁREA DE IMPRESSÃO TÉRMICA (EXCLUSIVA PARA @media print)
          ========================================================================= */}
      <div id="thermal-receipt" className="hidden print:block">
        {activePrintData && <ThermalReceipt data={activePrintData} />}
      </div>
    </div>
  );
}
