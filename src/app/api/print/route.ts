import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { generatePlainTextReceipt, ReceiptData } from '@/components/ThermalReceipt';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const receiptData: ReceiptData = body.data || body;
    const targetPrinter = body.printerName || 'POS-80(copy of 3)';

    const text = generatePlainTextReceipt(receiptData);
    const tempFile = path.join(os.tmpdir(), `receipt_${Date.now()}.txt`);
    
    // Salva com encoding Latin1 / UTF-8 compatível com ESC/POS
    fs.writeFileSync(tempFile, text, { encoding: 'utf-8' });

    const scriptPath = path.resolve(process.cwd(), 'scripts', 'print-raw.ps1');
    const escapedFile = tempFile.replace(/'/g, "''");
    const escapedPrinter = targetPrinter.replace(/'/g, "''");
    
    // Executa o script que envia bytes RAW diretamente ao spooler (sem GDI nem A4)
    const psCmd = `powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}" -PrinterName "${escapedPrinter}" -FilePath "${escapedFile}"`;

    await new Promise((resolve, reject) => {
      exec(psCmd, (err, stdout, stderr) => {
        try { fs.unlinkSync(tempFile); } catch {}
        if (err) {
          console.error('[API /api/print] Erro ao imprimir RAW no Windows:', err.message, stderr);
          reject(new Error(stderr || err.message));
        } else {
          console.log('[API /api/print] Cupom RAW enviado com sucesso:', stdout.trim());
          resolve(stdout);
        }
      });
    });

    return NextResponse.json({
      success: true,
      message: `Cupom enviado via spooler RAW para ${targetPrinter}!`,
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    console.error('[API /api/print] Erro interno:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Falha ao processar impressão direta' },
      { status: 500 }
    );
  }
}
