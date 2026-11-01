/**
 * SERVIÇO DE IMPRESSÃO AUTOMÁTICA DIRETA - ADEGA MAURICIO
 * 1. Monitora vendas no Supabase (detecta novas vendas em tempo real)
 * 2. Disponibiliza servidor HTTP local em 127.0.0.1:9123 para reimpressões instantâneas
 * 3. Envia bytes RAW direto para a POS-80(copy of 3) sem diálogos ou janelas.
 */

const { createClient } = require('@supabase/supabase-js');
const http = require('http');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Carrega credenciais do .env.local sem expor segredos no repositório
function loadEnv() {
  const envPath = path.resolve(__dirname, '..', '.env.local');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf-8').split(/\r?\n/);
    lines.forEach(line => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let val = match[2] || '';
        if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
        if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
        process.env[key] = val;
      }
    });
  }
}
loadEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const PRINTER_NAME = process.env.PRINTER_NAME || 'POS-80(copy of 3)';
const HTTP_PORT = 9123;

console.log('===============================================================');
console.log('   ADEGA MAURICIO - SERVICO DE IMPRESSAO SILENCIOSA EM EXECUCAO');
console.log('   Impressora Alvo:', PRINTER_NAME);
console.log('   Porta Local:', HTTP_PORT);
console.log('   Conectando ao banco de dados Supabase...');
console.log('===============================================================');

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

// Cache de vendas já impressas para evitar duplicações
const printedSales = new Set();
let isReady = false;

function formatCurrency(val) {
  const num = Number(val || 0);
  return 'R$ ' + num.toFixed(2).replace('.', ',');
}

function padRight(str, len) {
  const s = String(str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7E\r\n]/g, '');
  return (s + ' '.repeat(len)).substring(0, len);
}

function padLeft(str, len) {
  const s = String(str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7E\r\n]/g, '');
  return (' '.repeat(len) + s).slice(-len);
}

function center(str, len = 42) {
  const s = String(str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7E\r\n]/g, '');
  const spaces = Math.max(0, Math.floor((len - s.length) / 2));
  return ' '.repeat(spaces) + s + '\r\n';
}

function buildReceiptText(sale, items) {
  const line = '-'.repeat(42) + '\r\n';
  const doubleLine = '='.repeat(42) + '\r\n';
  let out = '';

  out += doubleLine;
  out += center('ADEGA DE MAURICIO');
  out += center('Adega e Deposito Mauricio Ltda');
  out += center('Rua Nova Do Campo, Mimoso, BA');
  out += center('Tel: (71) 98103-8699');
  out += line;

  out += center('CUPOM NAO FISCAL');
  const dateStr = sale.created_at ? new Date(sale.created_at).toLocaleString('pt-BR') : new Date().toLocaleString('pt-BR');
  const saleId = sale.id ? String(sale.id).substring(0, 8).toUpperCase() : '000001';
  out += `VENDA: #${saleId}  DATA: ${dateStr}\r\n`;
  out += `OPERADOR: Caixa 01     PDV: 01\r\n`;
  if (sale.customer_name) out += `CLIENTE: ${padRight(sale.customer_name, 32)}\r\n`;
  if (sale.customer_cpf) out += `CPF: ${sale.customer_cpf}\r\n`;
  out += line;

  out += padRight('ITEM  DESCRICAO', 28) + padLeft('TOTAL', 14) + '\r\n';
  out += line;

  (items || []).forEach((item, idx) => {
    const num = String(idx + 1).padStart(2, '0');
    const name = padRight(`${num} ${item.product_name || item.name || 'Item'}`, 28);
    const tot = padLeft(formatCurrency(item.total_price !== undefined ? item.total_price : (item.unitPrice * item.quantity)), 14);
    out += `${name}${tot}\r\n`;

    const qty = Number(item.quantity || 1);
    const unitPrice = Number(item.unit_price || item.unitPrice || 0);
    out += padRight(`  ${qty} un x ${formatCurrency(unitPrice)}`, 42) + '\r\n';
  });

  out += line;
  out += padRight('Subtotal:', 28) + padLeft(formatCurrency(sale.subtotal_amount || sale.subtotal || sale.total_amount || sale.totalFinal), 14) + '\r\n';
  if ((sale.discount_amount || sale.discountAmount || 0) > 0) {
    out += padRight('Desconto:', 28) + padLeft(`- ${formatCurrency(sale.discount_amount || sale.discountAmount)}`, 14) + '\r\n';
  }
  out += padRight('TOTAL A PAGAR:', 28) + padLeft(formatCurrency(sale.total_amount || sale.totalFinal), 14) + '\r\n';
  out += line;

  const payment = String(sale.payment_method || sale.paymentMethod || 'DINHEIRO').toUpperCase();
  out += padRight('FORMA PGTO:', 24) + padLeft(payment, 18) + '\r\n';
  if (sale.final_amount !== undefined && sale.final_amount > 0 && sale.final_amount !== sale.total_amount) {
    out += padRight('VALOR RECEBIDO:', 28) + padLeft(formatCurrency(sale.final_amount), 14) + '\r\n';
  }
  if ((sale.change_amount || sale.troco || 0) > 0) {
    out += padRight('TROCO:', 28) + padLeft(formatCurrency(sale.change_amount || sale.troco), 14) + '\r\n';
  }

  if (payment === 'FIADO') {
    out += line;
    out += center('Reconheco a divida discriminada');
    out += center('neste comprovante.');
    out += '\r\n';
    out += '__________________________________________\r\n';
    out += center('Assinatura do Cliente');
  }

  out += doubleLine;
  out += center('OBRIGADO PELA PREFERENCIA!');
  out += center('VOLTE SEMPRE!');
  out += '\r\n\r\n\r\n';

  return out;
}

function dispatchRawToPrinter(receiptText, saleId = '000000') {
  return new Promise((resolve, reject) => {
    const tempFile = path.join(os.tmpdir(), `sale_${saleId}_${Date.now()}.txt`);
    fs.writeFileSync(tempFile, receiptText, { encoding: 'utf-8' });

    const scriptPath = path.resolve(__dirname, 'print-raw.ps1');
    const psCmd = `powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}" -PrinterName "${PRINTER_NAME}" -FilePath "${tempFile}"`;

    exec(psCmd, (err, stdout, stderr) => {
      try { fs.unlinkSync(tempFile); } catch {}
      if (err) {
        console.error('[ERRO IMPRESSORA]', err.message, stderr);
        reject(err);
      } else {
        console.log(`[SUCESSO] Cupom #${saleId} impresso diretamente na POS-80!`);
        resolve(stdout);
      }
    });
  });
}

async function printSale(sale) {
  if (printedSales.has(sale.id)) return;
  printedSales.add(sale.id);

  const shortId = sale.id ? sale.id.substring(0, 8) : 'NOVO';
  console.log(`[IMPRESSAO] Processando venda #${shortId} - R$ ${sale.total_amount}`);

  try {
    const { data: items, error: itemsErr } = await supabase
      .from('sale_items')
      .select('*')
      .eq('sale_id', sale.id);

    if (itemsErr) {
      console.error('[ERRO] Falha ao carregar itens da venda:', itemsErr.message);
    }

    const receiptText = buildReceiptText(sale, items || []);
    await dispatchRawToPrinter(receiptText, shortId);
  } catch (err) {
    console.error('[ERRO CRITICO AO IMPRIMIR]', err);
  }
}

// -------------------------------------------------------------
// SERVIDOR HTTP LOCAL PARA REIMPRESSÕES OU DISPAROS DIRETOS
// -------------------------------------------------------------
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', printer: PRINTER_NAME }));
    return;
  }

  if (req.method === 'POST' && req.url === '/print') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body);
        const receiptData = payload.data || payload;
        const text = buildReceiptText(receiptData, receiptData.items || []);
        await dispatchRawToPrinter(text, receiptData.id ? String(receiptData.id).substring(0, 8) : 'MANUAL');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Impresso com sucesso na POS-80' }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(HTTP_PORT, '127.0.0.1', () => {
  console.log(`[HTTP LOCAL] Servidor ativo em http://127.0.0.1:${HTTP_PORT}`);
});

// -------------------------------------------------------------
// SINCRONIZAÇÃO EM TEMPO REAL COM O SUPABASE
// -------------------------------------------------------------
async function init() {
  const { data: recentSales, error } = await supabase
    .from('sales')
    .select('id')
    .order('created_at', { ascending: false })
    .limit(30);

  if (!error && recentSales) {
    recentSales.forEach(s => printedSales.add(s.id));
    console.log(`[INICIALIZADO] ${printedSales.size} vendas recentes marcadas como sincronizadas.`);
  }

  isReady = true;
  console.log('[PRONTO] Aguardando novas vendas para impressao automatica imediata...');

  setInterval(async () => {
    if (!isReady) return;
    try {
      const { data: newSales, error: pollErr } = await supabase
        .from('sales')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);

      if (!pollErr && newSales) {
        for (const sale of newSales) {
          if (!printedSales.has(sale.id)) {
            await printSale(sale);
          }
        }
      }
    } catch (e) {
      // Ignora erro momentâneo
    }
  }, 1500);
}

init();
