import React from 'react';
import { formatCurrency } from '@/lib/utils';

export interface ReceiptItem {
  id?: string;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  isBox?: boolean;
  boxUnits?: number;
}

export interface ReceiptData {
  id?: string;
  date?: string | Date;
  companyName?: string;
  companyTradeName?: string;
  companyAddress?: string;
  companyPhone?: string;
  companyDoc?: string;
  logoUrl?: string;
  hideLogo?: boolean;
  items: ReceiptItem[];
  subtotal: number;
  discountAmount?: number;
  totalFinal: number;
  paymentMethod: string;
  amountPaid?: number;
  troco?: number;
  customerName?: string;
  customerDoc?: string;
  operatorName?: string;
  isTest?: boolean;
  isQuotation?: boolean;
  quotationValidity?: string;
  quotationNotes?: string;
}

interface ThermalReceiptProps {
  data: ReceiptData;
  className?: string;
}

export function ThermalReceipt({ data, className = '' }: ThermalReceiptProps) {
  const formattedDate = data.date
    ? new Date(data.date).toLocaleString('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'medium',
      })
    : new Date().toLocaleString('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'medium',
      });

  const saleNumber = data.id
    ? typeof data.id === 'string' && data.id.length > 8
      ? data.id.substring(0, 8).toUpperCase()
      : data.id
    : '000001';

  return (
    <div
      className={`font-mono text-black bg-white select-text ${className}`}
      style={{
        width: '100%',
        maxWidth: '300px',
        margin: '0 auto',
        padding: '8px 12px 32px 12px',
        lineHeight: 1.25,
        fontSize: '12px',
      }}
    >
      {/* CABEÇALHO DA EMPRESA */}
      <div className="text-center space-y-1 pb-2 border-b border-dashed border-black">
        {/* LOGOMARCA */}
        {!data.hideLogo && (
          <div className="flex justify-center pb-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={data.logoUrl || '/logo.jpg'}
              alt="Logo Adega"
              className="w-28 h-28 object-contain mx-auto"
              style={{
                maxWidth: '120px',
                maxHeight: '120px',
              }}
            />
          </div>
        )}

        {data.isTest && (
          <div className="border border-black font-bold py-0.5 px-2 my-1 text-[11px] uppercase tracking-wider bg-black/5">
            *** TESTE DE IMPRESSÃO ***
          </div>
        )}
        {data.isQuotation && (
          <div className="border border-black font-bold py-0.5 px-2 my-1 text-[11px] uppercase tracking-wider bg-black/5">
            *** ORÇAMENTO / COTAÇÃO ***
          </div>
        )}
        <h1 className="text-base font-extrabold tracking-wide uppercase">
          {data.companyTradeName || 'ADEGA DE MAURICIO'}
        </h1>
        <p className="text-[11px] font-semibold text-neutral-800">
          {data.companyName || 'Adega e Depósito Mauricio Ltda'}
        </p>
        {data.companyDoc && (
          <p className="text-[10px]">CNPJ/CPF: {data.companyDoc}</p>
        )}
        {data.companyAddress && (
          <p className="text-[10px]">{data.companyAddress}</p>
        )}
        {data.companyPhone && (
          <p className="text-[10px]">Tel: {data.companyPhone}</p>
        )}
      </div>

      {/* IDENTIFICAÇÃO DO CUPOM */}
      <div className="py-2 border-b border-dashed border-black text-[11px] space-y-0.5">
        <div className="text-center font-bold text-xs">
          {data.isQuotation ? 'ORÇAMENTO (SEM VALOR FISCAL)' : 'CUPOM NÃO FISCAL'}
        </div>
        <div className="flex justify-between">
          <span>{data.isQuotation ? 'ORÇAMENTO:' : 'VENDA:'} #{saleNumber}</span>
          <span>{formattedDate}</span>
        </div>
        {data.isQuotation && data.quotationValidity && (
          <div className="flex justify-between text-neutral-600 font-semibold">
            <span>VALIDADE:</span>
            <span>{data.quotationValidity}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span>OPERADOR: {data.operatorName || 'Caixa 01'}</span>
          <span>TERMINAL: PDV-01</span>
        </div>
        {data.customerName && (
          <div className="pt-0.5">
            <span>CLIENTE: {data.customerName}</span>
          </div>
        )}
        {data.customerDoc && (
          <div>
            <span>CPF: {data.customerDoc}</span>
          </div>
        )}
      </div>

      {/* ITENS DA VENDA */}
      <div className="py-2 border-b border-dashed border-black">
        <div className="flex justify-between text-[10px] font-bold pb-1 border-b border-black">
          <span>DESCRIÇÃO</span>
          <span>TOTAL</span>
        </div>
        <div className="space-y-1.5 pt-1.5">
          {data.items.map((item, index) => {
            const itemNumber = String(index + 1).padStart(3, '0');
            return (
              <div key={index} className="text-[11px]">
                <div className="font-bold flex justify-between">
                  <span className="truncate pr-1">
                    {itemNumber} {item.name}
                  </span>
                  <span>{formatCurrency(item.totalPrice)}</span>
                </div>
                <div className="text-[10px] text-neutral-700 pl-6 flex justify-between">
                  <span>
                    {item.isBox
                      ? `${item.quantity} cx (${item.boxUnits || 1} un) x ${formatCurrency(item.unitPrice)}`
                      : `${item.quantity} un x ${formatCurrency(item.unitPrice)}`}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* TOTAIS E PAGAMENTO */}
      <div className="py-2 border-b border-dashed border-black text-[11px] space-y-1">
        <div className="flex justify-between">
          <span>Qtd Total de Itens:</span>
          <span>{data.items.reduce((acc, i) => acc + i.quantity, 0)}</span>
        </div>
        <div className="flex justify-between">
          <span>Subtotal:</span>
          <span>{formatCurrency(data.subtotal)}</span>
        </div>
        {(data.discountAmount || 0) > 0 && (
          <div className="flex justify-between text-neutral-800">
            <span>Desconto:</span>
            <span>- {formatCurrency(data.discountAmount || 0)}</span>
          </div>
        )}
        <div className="flex justify-between font-extrabold text-sm pt-1 border-t border-black">
          <span>{data.isQuotation ? 'TOTAL ESTIMADO:' : 'TOTAL A PAGAR:'}</span>
          <span>{formatCurrency(data.totalFinal)}</span>
        </div>
      </div>

      {/* FORMA DE PAGAMENTO OU CONDIÇÃO DO ORÇAMENTO */}
      {!data.isQuotation ? (
        <div className="py-2 border-b border-dashed border-black text-[11px] space-y-1">
          <div className="flex justify-between">
            <span>FORMA PGTO:</span>
            <span className="font-bold uppercase">
              {data.paymentMethod === 'FIADO' ? 'A PRAZO / FIADO' : data.paymentMethod}
            </span>
          </div>
          {data.paymentMethod === 'FIADO' && (
            <>
              <div className="flex justify-between text-neutral-800 font-bold">
                <span>STATUS:</span>
                <span className="text-red-700">PENDENTE DE PAGAMENTO</span>
              </div>
              <div className="pt-3 pb-1 text-center border-t border-dashed border-black mt-2">
                <p className="text-[10px] italic">Reconheço a dívida acima descrita.</p>
                <div className="mt-6 border-b border-black w-3/4 mx-auto"></div>
                <p className="text-[9px] uppercase mt-1 font-bold">Assinatura do Cliente</p>
              </div>
            </>
          )}
          {data.paymentMethod !== 'FIADO' && data.amountPaid !== undefined && data.amountPaid > 0 && (
            <div className="flex justify-between">
              <span>VALOR PAGO:</span>
              <span>{formatCurrency(data.amountPaid)}</span>
            </div>
          )}
          {data.paymentMethod !== 'FIADO' && (data.troco || 0) > 0 && (
            <div className="flex justify-between font-bold">
              <span>TROCO:</span>
              <span>{formatCurrency(data.troco || 0)}</span>
            </div>
          )}
        </div>
      ) : (
        <div className="py-2 border-b border-dashed border-black text-[10px] text-center italic text-neutral-700">
          {data.quotationNotes || 'Orçamento sujeito a alteração de preço e disponibilidade de estoque.'}
        </div>
      )}

      {/* MENSAGEM FINAL / RODAPÉ */}
      <div className="pt-3 text-center space-y-1 text-[11px]">
        <p className="font-bold">OBRIGADO PELA PREFERÊNCIA!</p>
        <p>VOLTE SEMPRE!</p>
        {/* Espaçamento para o corte do papel */}
        <div className="py-1 text-[9px] text-neutral-400 flex items-center justify-center">
          - - - - - - - - - - - - - - - - - - - -
        </div>
      </div>
    </div>
  );
}

/**
 * Gera o documento HTML completo e isolado para impressão em bobinas térmicas de 80mm.
 */
export function generateThermalReceiptHtml(data: ReceiptData): string {
  const formattedDate = data.date
    ? new Date(data.date).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' })
    : new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' });

  const saleNumber = data.id
    ? typeof data.id === 'string' && data.id.length > 8
      ? data.id.substring(0, 8).toUpperCase()
      : data.id
    : '000001';

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const logoSrc = data.logoUrl
    ? (data.logoUrl.startsWith('http') ? data.logoUrl : origin + data.logoUrl)
    : origin + '/logo.jpg';

  const itemsHtml = data.items
    .map((item, index) => {
      const itemNumber = String(index + 1).padStart(3, '0');
      const detail = item.isBox
        ? `${item.quantity} cx (${item.boxUnits || 1} un) x ${formatCurrency(item.unitPrice)}`
        : `${item.quantity} un x ${formatCurrency(item.unitPrice)}`;
      return `
        <div style="margin-bottom: 3px;">
          <div style="display: flex; justify-content: space-between; align-items: baseline; font-weight: bold; font-size: 9.5px;">
            <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding-right: 4px; max-width: 44mm;">${itemNumber} ${item.name}</span>
            <span style="white-space: nowrap;">${formatCurrency(item.totalPrice)}</span>
          </div>
          <div style="font-size: 8.5px; color: #444; padding-left: 12px;">${detail}</div>
        </div>
      `;
    })
    .join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <base href="${origin}">
  <title>Cupom - ADEGA DE MAURICIO</title>
  <style>
    @page {
      size: auto;
      margin: 0mm !important;
    }
    * {
      box-sizing: border-box !important;
      margin: 0;
      padding: 0;
    }
    html, body {
      width: 66mm !important;
      max-width: 66mm !important;
      margin: 0 auto !important;
      padding: 1mm 1mm 4mm 1mm !important;
      background: #ffffff !important;
      color: #000000 !important;
      font-family: 'Courier New', Courier, monospace;
      font-size: 10px;
      line-height: 1.22;
      height: auto !important;
      overflow: visible !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .bold { font-weight: bold; }
    .extrabold { font-weight: 800; font-size: 12.5px; }
    .divider { border-top: 1px dashed #000; margin: 3px 0; }
    .row { display: flex; justify-content: space-between; align-items: baseline; width: 100%; }
    .logo-container { text-align: center; margin-bottom: 3px; }
    .logo-img {
      max-width: 85px;
      max-height: 85px;
      display: inline-block;
      margin: 0 auto;
      object-fit: contain;
    }
    .test-badge {
      border: 1px solid #000;
      font-weight: bold;
      padding: 2px 4px;
      margin: 2px 0;
      text-align: center;
      font-size: 9px;
      background: #f0f0f0;
    }
    .cut-line {
      margin-top: 4px;
      text-align: center;
      font-size: 9px;
      color: #999;
    }
  </style>
</head>
<body>
  ${
    !data.hideLogo
      ? `
    <div class="logo-container">
      <img src="${logoSrc}" class="logo-img" alt="Logo" />
    </div>
  `
      : ''
  }

  <div class="text-center">
    ${data.isTest ? '<div class="test-badge">*** TESTE DE IMPRESSÃO ***</div>' : ''}
    ${data.isQuotation ? '<div class="test-badge">*** ORÇAMENTO / COTAÇÃO ***</div>' : ''}
    <div class="extrabold">${data.companyTradeName || 'ADEGA DE MAURICIO'}</div>
    <div style="font-size: 9.5px; font-weight: bold;">${data.companyName || 'Adega e Depósito Mauricio Ltda'}</div>
    ${data.companyDoc ? `<div style="font-size: 9px;">CNPJ: ${data.companyDoc}</div>` : ''}
    ${data.companyAddress ? `<div style="font-size: 9px;">${data.companyAddress}</div>` : ''}
    ${data.companyPhone ? `<div style="font-size: 9px;">Tel: ${data.companyPhone}</div>` : ''}
  </div>

  <div class="divider"></div>

  <div class="text-center bold" style="font-size: 10px;">
    ${data.isQuotation ? 'ORÇAMENTO (SEM VALOR FISCAL)' : 'CUPOM NÃO FISCAL'}
  </div>
  <div class="row" style="font-size: 9.5px;">
    <span>${data.isQuotation ? 'ORÇAMENTO:' : 'VENDA:'} #${saleNumber}</span>
    <span>${formattedDate}</span>
  </div>
  ${data.isQuotation && data.quotationValidity ? `<div class="row" style="font-size: 9.5px;"><span>VALIDADE:</span><span>${data.quotationValidity}</span></div>` : ''}
  <div class="row" style="font-size: 9.5px;">
    <span>OPERADOR: ${data.operatorName || 'Caixa 01'}</span>
    <span>TERMINAL: PDV-01</span>
  </div>
  ${data.customerName ? `<div style="font-size: 9.5px;">CLIENTE: ${data.customerName}</div>` : ''}
  ${data.customerDoc ? `<div style="font-size: 9.5px;">CPF: ${data.customerDoc}</div>` : ''}

  <div class="divider"></div>

  <div class="row bold" style="font-size: 9.5px; border-bottom: 1px solid #000; padding-bottom: 2px; margin-bottom: 3px;">
    <span>DESCRIÇÃO</span>
    <span>TOTAL</span>
  </div>

  ${itemsHtml}

  <div class="divider"></div>

  <div class="row" style="font-size: 9.5px;">
    <span>Qtd Total de Itens:</span>
    <span>${data.items.reduce((acc, i) => acc + i.quantity, 0)}</span>
  </div>
  <div class="row" style="font-size: 9.5px;">
    <span>Subtotal:</span>
    <span>${formatCurrency(data.subtotal)}</span>
  </div>
  ${
    (data.discountAmount || 0) > 0
      ? `
    <div class="row" style="font-size: 9.5px;">
      <span>Desconto:</span>
      <span>- ${formatCurrency(data.discountAmount || 0)}</span>
    </div>
  `
      : ''
  }
  <div class="row bold" style="font-size: 12px; border-top: 1px solid #000; padding-top: 3px; margin-top: 2px;">
    <span>${data.isQuotation ? 'TOTAL ESTIMADO:' : 'TOTAL A PAGAR:'}</span>
    <span>${formatCurrency(data.totalFinal)}</span>
  </div>

  ${!data.isQuotation ? `
    <div class="divider"></div>
    <div class="row" style="font-size: 9.5px;">
      <span>FORMA PGTO:</span>
      <span class="bold" style="text-transform: uppercase;">${data.paymentMethod === 'FIADO' ? 'A PRAZO / FIADO' : data.paymentMethod}</span>
    </div>
    ${
      data.paymentMethod === 'FIADO'
        ? `
      <div class="row bold" style="font-size: 9.5px; color: #900;">
        <span>STATUS:</span>
        <span>PENDENTE DE PAGAMENTO</span>
      </div>
      <div style="margin-top: 10px; text-align: center; border-top: 1px dashed #000; padding-top: 6px;">
        <div style="font-size: 8.5px; font-style: italic;">Reconheço a dívida acima discriminada.</div>
        <div style="margin-top: 25px; border-bottom: 1px solid #000; width: 75%; margin-left: auto; margin-right: auto;"></div>
        <div style="font-size: 8px; font-weight: bold; text-transform: uppercase; margin-top: 3px;">Assinatura do Cliente</div>
      </div>
    `
        : ''
    }
    ${
      data.paymentMethod !== 'FIADO' && data.amountPaid !== undefined && data.amountPaid > 0
        ? `
      <div class="row" style="font-size: 9.5px;">
        <span>VALOR PAGO:</span>
        <span>${formatCurrency(data.amountPaid)}</span>
      </div>
    `
        : ''
    }
    ${
      data.paymentMethod !== 'FIADO' && (data.troco || 0) > 0
        ? `
      <div class="row bold" style="font-size: 9.5px;">
        <span>TROCO:</span>
        <span>${formatCurrency(data.troco || 0)}</span>
      </div>
    `
        : ''
    }
  ` : `
    <div class="divider"></div>
    <div class="text-center" style="font-size: 8.5px; font-style: italic; color: #444; padding: 2px 0;">
      ${data.quotationNotes || 'Orçamento sujeito a alteração de preço e disponibilidade de estoque.'}
    </div>
  `}

  <div class="divider"></div>

  <div class="text-center" style="font-size: 9.5px; padding-top: 2px;">
    <div class="bold">OBRIGADO PELA PREFERÊNCIA!</div>
    <div>VOLTE SEMPRE!</div>
  </div>

  <div class="cut-line">- - - - - - - - - - - - - - - - - - - -</div>
</body>
</html>`;
}

/**
 * Dispara a impressão física abrindo uma janela/iframe isolada 100% configurada para POS-80.
 * Isso impede que estilos externos, overflow:hidden ou temas escuros da aplicação façam o cupom sair em branco.
 */
export function printThermalReceipt(data: ReceiptData) {
  if (typeof window === 'undefined') return;

  let frame = document.getElementById('thermal-print-iframe') as HTMLIFrameElement;
  if (!frame) {
    frame = document.createElement('iframe');
    frame.id = 'thermal-print-iframe';
    document.body.appendChild(frame);
  }

  // IMPORTANTE: O iframe NÃO pode ter width: 0 ou height: 0, caso contrário o Chrome
  // renderiza um documento com dimensões zeradas e gera uma folha 100% em branco!
  frame.style.position = 'fixed';
  frame.style.right = '0';
  frame.style.bottom = '0';
  frame.style.width = '300px';
  frame.style.height = '600px';
  frame.style.border = 'none';
  frame.style.opacity = '0.01';
  frame.style.pointerEvents = 'none';
  frame.style.zIndex = '-1';

  const doc = frame.contentWindow?.document;
  if (!doc) {
    window.print();
    return;
  }

  const html = generateThermalReceiptHtml(data);
  doc.open();
  doc.write(html);
  doc.close();

  const doPrint = () => {
    try {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    } catch {
      window.print();
    }
  };

  const img = doc.querySelector('img');
  if (img && !img.complete) {
    let done = false;
    const trigger = () => {
      if (!done) {
        done = true;
        doPrint();
      }
    };
    img.onload = () => setTimeout(trigger, 40);
    img.onerror = () => trigger();
    setTimeout(trigger, 250);
  } else {
    setTimeout(doPrint, 50);
  }
}

/**
 * Gera o texto formatado para impressoras térmicas ESC/POS em modo texto (48 colunas).
 */
export function generatePlainTextReceipt(data: ReceiptData): string {
  const ESC = '\x1b';
  const ALIGN_LEFT = `${ESC}a\x00`;
  const ALIGN_CENTER = `${ESC}a\x01`;

  // Normaliza texto para ASCII seguro evitando caracteres corrompidos em impressoras termicas
  const clean = (str: string) => {
    if (!str) return '';
    return str
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\x20-\x7E\r\n]/g, '');
  };

  const line = '-'.repeat(42) + '\r\n';
  const doubleLine = '='.repeat(42) + '\r\n';
  let out = '';

  const padRight = (str: string, len: number) => (clean(str) + ' '.repeat(len)).substring(0, len);
  const padLeft = (str: string, len: number) => (' '.repeat(len) + clean(str)).slice(-len);

  // 1. CABEÇALHO CENTRALIZADO NATIVO POR HARDWARE ESC/POS
  out += ALIGN_CENTER;
  out += doubleLine;
  if (data.isTest) {
    out += '*** TESTE DE IMPRESSAO ***\r\n';
  }
  if (data.isQuotation) {
    out += '*** ORCAMENTO / COTACAO ***\r\n';
  }
  out += `${clean(data.companyTradeName || 'ADEGA DE MAURICIO')}\r\n`;
  out += `${clean(data.companyName || 'Adega e Deposito Mauricio Ltda')}\r\n`;
  if (data.companyDoc) out += `CNPJ: ${clean(data.companyDoc)}\r\n`;
  if (data.companyAddress) out += `${clean(data.companyAddress)}\r\n`;
  if (data.companyPhone) out += `Tel: ${clean(data.companyPhone)}\r\n`;
  out += line;
  out += data.isQuotation ? 'ORCAMENTO (SEM VALOR FISCAL)\r\n' : 'CUPOM NAO FISCAL\r\n';

  // 2. CORPO DO RECIBO ALINHADO À ESQUERDA (42 COLUNAS)
  out += ALIGN_LEFT;
  const dateStr = data.date ? new Date(data.date).toLocaleString('pt-BR') : new Date().toLocaleString('pt-BR');
  const docPrefix = data.isQuotation ? 'ORCAMENTO:' : 'VENDA:';
  out += `${docPrefix} #${clean(data.id ? String(data.id).substring(0, 8).toUpperCase() : '000001')}  DATA: ${dateStr}\r\n`;
  if (data.isQuotation && data.quotationValidity) {
    out += `VALIDADE: ${clean(data.quotationValidity)}\r\n`;
  }
  out += `OPERADOR: ${clean(data.operatorName || 'Caixa 01')}     PDV: 01\r\n`;
  if (data.customerName) out += `CLIENTE: ${clean(data.customerName)}\r\n`;
  if (data.customerDoc) out += `CPF: ${clean(data.customerDoc)}\r\n`;
  out += line;

  out += padRight('ITEM  DESCRICAO', 28) + padLeft('TOTAL', 14) + '\r\n';
  out += padRight('  QTD x UNIT', 42) + '\r\n';
  out += line;

  data.items.forEach((item, idx) => {
    const num = String(idx + 1).padStart(2, '0');
    const itemName = padRight(`${num} ${item.name}`, 28);
    const itemTotal = padLeft(formatCurrency(item.totalPrice), 14);
    out += `${itemName}${itemTotal}\r\n`;

    const detail = item.isBox
      ? `  ${item.quantity} cx (${item.boxUnits || 1} un) x ${formatCurrency(item.unitPrice)}`
      : `  ${item.quantity} un x ${formatCurrency(item.unitPrice)}`;
    out += `${padRight(detail, 42)}\r\n`;
  });

  out += line;
  out += padRight('Subtotal:', 28) + padLeft(formatCurrency(data.subtotal), 14) + '\r\n';
  if ((data.discountAmount || 0) > 0) {
    out += padRight('Desconto:', 28) + padLeft(`- ${formatCurrency(data.discountAmount || 0)}`, 14) + '\r\n';
  }
  const totalLabel = data.isQuotation ? 'TOTAL ESTIMADO:' : 'TOTAL A PAGAR:';
  out += padRight(totalLabel, 28) + padLeft(formatCurrency(data.totalFinal), 14) + '\r\n';
  out += line;

  if (!data.isQuotation) {
    if (data.paymentMethod === 'FIADO') {
      out += padRight('FORMA PGTO:', 20) + padLeft('A PRAZO / FIADO', 22) + '\r\n';
      out += padRight('STATUS:', 20) + padLeft('PENDENTE PGTO', 22) + '\r\n';
      out += line;
      out += ALIGN_CENTER;
      out += 'Reconheco a divida discriminada\r\n';
      out += 'neste comprovante.\r\n\r\n';
      out += '________________________________________\r\n';
      out += '         Assinatura do Cliente\r\n';
      out += ALIGN_LEFT;
    } else {
      out += padRight('FORMA PGTO:', 24) + padLeft(clean(String(data.paymentMethod).toUpperCase()), 18) + '\r\n';
      if (data.amountPaid !== undefined && data.amountPaid > 0) {
        out += padRight('VALOR RECEBIDO:', 28) + padLeft(formatCurrency(data.amountPaid), 14) + '\r\n';
      }
      if ((data.troco || 0) > 0) {
        out += padRight('TROCO:', 28) + padLeft(formatCurrency(data.troco || 0), 14) + '\r\n';
      }
    }
  } else {
    out += ALIGN_CENTER;
    out += 'ORCAMENTO SUJEITO A ALTERACAO\r\n';
    out += 'DE PRECO E DISPONIBILIDADE.\r\n';
    out += 'NAO GERA RESERVA DE ESTOQUE.\r\n';
    out += ALIGN_LEFT;
  }

  // 3. RODAPÉ 100% CENTRALIZADO NATIVO POR HARDWARE ESC/POS
  out += doubleLine;
  out += ALIGN_CENTER;
  out += 'OBRIGADO PELA PREFERENCIA!\r\n';
  out += 'VOLTE SEMPRE!\r\n';
  out += ALIGN_LEFT;
  out += '\r\n\r\n'; // Feed reduzido antes do corte

  return out;
}
