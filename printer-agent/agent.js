/**
 * AGENTE LOCAL DE IMPRESSÃO TÉRMICA ESC/POS - ADEGA MAURI
 * Servidor leve Node.js para receber trabalhos de impressão da aplicação web
 * e comunicar diretamente com a impressora térmica POS-80 no Windows sem janelas de diálogo.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');

const PORT = process.env.PORT || 9123;
const AGENT_TOKEN = process.env.PRINTER_AGENT_TOKEN || 'mauri-pos-secret-2026';
const PRINTER_NAME = process.env.PRINTER_NAME || 'POS-80(copy of 3)';

function formatCurrency(val) {
  const num = Number(val || 0);
  return 'R$ ' + num.toFixed(2).replace('.', ',');
}

function padRight(str, len) {
  const s = String(str || '');
  return (s + ' '.repeat(len)).substring(0, len);
}

function padLeft(str, len) {
  const s = String(str || '');
  return (' '.repeat(len) + s).slice(-len);
}

function center(str, len = 48) {
  const s = String(str || '');
  const spaces = Math.max(0, Math.floor((len - s.length) / 2));
  return ' '.repeat(spaces) + s + '\r\n';
}

function buildSaleReceiptText(data) {
  const line = '-'.repeat(48) + '\r\n';
  const doubleLine = '='.repeat(48) + '\r\n';
  let out = '';

  out += doubleLine;
  if (data.isTest) {
    out += center('*** TESTE DE IMPRESSAO ***');
  }
  out += center(data.companyTradeName || 'ADEGA MAURI');
  out += center(data.companyName || 'Adega e Deposito Mauri Ltda');
  if (data.companyDoc) out += center(`CNPJ: ${data.companyDoc}`);
  if (data.companyPhone) out += center(`Tel: ${data.companyPhone}`);
  if (data.companyAddress) out += center(data.companyAddress);
  out += line;

  out += center('CUPOM NAO FISCAL');
  const dateStr = data.date ? new Date(data.date).toLocaleString('pt-BR') : new Date().toLocaleString('pt-BR');
  const saleId = data.id ? String(data.id).substring(0, 8).toUpperCase() : '000001';
  out += `VENDA: #${saleId}  DATA: ${dateStr}\r\n`;
  out += `OPERADOR: ${data.operatorName || 'Caixa 01'}     PDV: 01\r\n`;
  if (data.customerName) out += `CLIENTE: ${data.customerName}\r\n`;
  if (data.customerDoc) out += `CPF/CNPJ: ${data.customerDoc}\r\n`;
  out += line;

  out += padRight('ITEM  DESCRICAO', 32) + padLeft('TOTAL', 16) + '\r\n';
  out += line;

  const items = data.items || [];
  items.forEach((item, idx) => {
    const num = String(idx + 1).padStart(3, '0');
    const itemName = padRight(`${num} ${item.name || item.product?.name || 'Item'}`, 32);
    const itemTotal = padLeft(formatCurrency(item.totalPrice || (item.unitPrice * item.quantity)), 16);
    out += `${itemName}${itemTotal}\r\n`;

    const detail = item.isBox
      ? `  ${item.quantity} cx (${item.boxUnits || 1} un) x ${formatCurrency(item.unitPrice)}`
      : `  ${item.quantity} un x ${formatCurrency(item.unitPrice)}`;
    out += `${detail}\r\n`;
  });

  out += line;
  out += padRight('Subtotal:', 32) + padLeft(formatCurrency(data.subtotal || data.totalFinal), 16) + '\r\n';
  if ((data.discountAmount || 0) > 0) {
    out += padRight('Desconto:', 32) + padLeft(`- ${formatCurrency(data.discountAmount)}`, 16) + '\r\n';
  }
  out += padRight('TOTAL A PAGAR:', 32) + padLeft(formatCurrency(data.totalFinal), 16) + '\r\n';
  out += line;

  out += padRight('FORMA PGTO:', 24) + padLeft(String(data.paymentMethod || 'DINHEIRO').toUpperCase(), 24) + '\r\n';
  if (data.amountPaid !== undefined && data.amountPaid > 0) {
    out += padRight('VALOR RECEBIDO:', 32) + padLeft(formatCurrency(data.amountPaid), 16) + '\r\n';
  }
  if ((data.troco || 0) > 0) {
    out += padRight('TROCO:', 32) + padLeft(formatCurrency(data.troco), 16) + '\r\n';
  }

  out += doubleLine;
  out += center('OBRIGADO PELA PREFERENCIA!');
  out += center('VOLTE SEMPRE!');
  out += center('Adega Mauri • PDV');
  out += '\r\n\r\n\r\n\r\n';

  return out;
}

function buildOrderTicketText(order) {
  const line = '-'.repeat(48) + '\r\n';
  const doubleLine = '='.repeat(48) + '\r\n';
  let out = '';

  out += doubleLine;
  out += center('*** PEDIDO DE PRODUCAO / BAR ***');
  out += center('ADEGA MAURI');
  out += line;
  out += `PEDIDO: #${order.order_number || order.id?.substring(0, 6) || '---'}\r\n`;
  out += `DATA: ${new Date(order.created_at || Date.now()).toLocaleString('pt-BR')}\r\n`;
  out += `LOCAL: ${order.destination_type || 'MESA'} ${order.table_number || ''}\r\n`;
  if (order.waiter_name) out += `GARCOM: ${order.waiter_name}\r\n`;
  if (order.customer_name) out += `CLIENTE: ${order.customer_name}\r\n`;
  out += line;

  const items = order.items || [];
  items.forEach((item, idx) => {
    out += `${idx + 1}. [ ${item.quantity}x ] ${item.product_name || item.name || 'Produto'}\r\n`;
    if (item.notes) {
      out += `   Obs: ${item.notes}\r\n`;
    }
  });

  if (order.notes) {
    out += line;
    out += `OBS GERAL: ${order.notes}\r\n`;
  }

  out += doubleLine;
  out += '\r\n\r\n\r\n\r\n';
  return out;
}

function printTextToWindowsPrinter(text) {
  return new Promise((resolve, reject) => {
    const tempFile = path.join(os.tmpdir(), `receipt_${Date.now()}.txt`);
    fs.writeFileSync(tempFile, text, { encoding: 'utf-8' });

    // Envia via PowerShell para a impressora configurada ou padrão
    const escapedFile = tempFile.replace(/'/g, "''");
    const escapedPrinter = PRINTER_NAME.replace(/'/g, "''");
    const psCommand = `powershell -NoProfile -NonInteractive -Command "if (Get-Printer -Name '${escapedPrinter}' -ErrorAction SilentlyContinue) { Get-Content -LiteralPath '${escapedFile}' -Encoding UTF8 | Out-Printer -Name '${escapedPrinter}' } else { Get-Content -LiteralPath '${escapedFile}' -Encoding UTF8 | Out-Printer }"`;

    exec(psCommand, (error, stdout, stderr) => {
      // Remove arquivo temporário após envio
      try { fs.unlinkSync(tempFile); } catch {}

      if (error) {
        console.error('[PRINTER-AGENT] Erro ao imprimir no Windows:', error.message);
        reject(error);
      } else {
        console.log('[PRINTER-AGENT] Cupom despachado com sucesso para a fila de impressão!');
        resolve(stdout);
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  // Configuração CORS para permitir requisições do navegador
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Status de saúde
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      status: 'online',
      version: '1.2.0',
      printer: PRINTER_NAME,
      timestamp: new Date().toISOString()
    }));
    return;
  }

  // Endpoint de Impressão Direta
  if (req.method === 'POST' && req.url === '/print') {
    const authHeader = req.headers['authorization'];
    if (authHeader !== `Bearer ${AGENT_TOKEN}`) {
      res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Não autorizado: Token inválido ou ausente' }));
      return;
    }

    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const payload = JSON.parse(body);
        console.log(`[PRINTER-AGENT] Requisição de impressão recebida [Tipo: ${payload.type || 'VENDA'}]`);

        let ticketText = '';
        if (payload.type === 'ORDER_PRODUCTION') {
          ticketText = buildOrderTicketText(payload.data || {});
        } else {
          // Default: Cupom de venda
          ticketText = buildSaleReceiptText(payload.data || {});
        }

        await printTextToWindowsPrinter(ticketText);

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
          success: true,
          message: 'Documento impresso na impressora térmica POS-80!',
          job_id: Math.random().toString(36).substring(7),
          printed_at: new Date().toISOString(),
        }));
      } catch (err) {
        console.error('[PRINTER-AGENT] Falha na impressão:', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Erro ao processar impressão: ' + err.message }));
      }
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ error: 'Rota não encontrada' }));
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('====================================================');
  console.log(`[ADEGA MAURI] Agente Local de Impressão Ativo`);
  console.log(`Porta: http://127.0.0.1:${PORT}`);
  console.log(`Impressora Alvo: ${PRINTER_NAME}`);
  console.log('====================================================');
});
