param (
    [string]$PrinterName = "",
    [Parameter(Mandatory=$true)]
    [string]$FilePath
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $FilePath)) {
    Write-Error "Arquivo de cupom nao encontrado: $FilePath"
    exit 1
}

# Determina a impressora alvo
$target = $PrinterName
if ([string]::IsNullOrWhiteSpace($target)) {
    # Tenta POS-80(copy of 3) ou qualquer impressora POS ou padrao
    $posPrinters = Get-Printer | Where-Object { $_.Name -like "*POS*" }
    $defaultPrinter = Get-Printer | Where-Object { $_.Default -eq $true }
    
    if ($posPrinters) {
        # Prioriza a que for padrao ou a primeira disponivel
        $activePos = $posPrinters | Where-Object { $_.Default -eq $true } | Select-Object -First 1
        if (-not $activePos) {
            $activePos = $posPrinters | Where-Object { $_.Name -like "*copy of 3*" } | Select-Object -First 1
        }
        if (-not $activePos) {
            $activePos = $posPrinters | Select-Object -First 1
        }
        $target = $activePos.Name
    } elseif ($defaultPrinter) {
        $target = $defaultPrinter.Name
    } else {
        $target = "POS-80"
    }
} else {
    # Verifica se a impressora informada existe; caso contrario busca similar
    $exists = Get-Printer -Name $target -ErrorAction SilentlyContinue
    if (-not $exists) {
        $similar = Get-Printer | Where-Object { $_.Name -like "*POS*" } | Select-Object -First 1
        if ($similar) {
            $target = $similar.Name
        }
    }
}

# Codigo C# para envio RAW direto ao spooler do Windows (sem passar pelo GDI que quebra pagina A4)
$src = @"
using System;
using System.IO;
using System.Runtime.InteropServices;

public class RawPrinterHelper
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    public class DOCINFOA
    {
        [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
    }

    [DllImport("winspool.Drv", EntryPoint = "OpenPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool OpenPrinter([MarshalAs(UnmanagedType.LPStr)] string szPrinter, out IntPtr hPrinter, IntPtr pd);

    [DllImport("winspool.Drv", EntryPoint = "ClosePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "StartDocPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, Int32 level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);

    [DllImport("winspool.Drv", EntryPoint = "EndDocPrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "StartPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "EndPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "WritePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, Int32 dwCount, out Int32 dwWritten);

    public static bool SendBytesToPrinter(string szPrinterName, byte[] pBytes)
    {
        IntPtr hPrinter = IntPtr.Zero;
        DOCINFOA di = new DOCINFOA();
        di.pDocName = "Cupom Adega Mauricio";
        di.pDataType = "RAW";

        if (OpenPrinter(szPrinterName.Normalize(), out hPrinter, IntPtr.Zero))
        {
            if (StartDocPrinter(hPrinter, 1, di))
            {
                if (StartPagePrinter(hPrinter))
                {
                    IntPtr pUnmanagedBytes = Marshal.AllocCoTaskMem(pBytes.Length);
                    Marshal.Copy(pBytes, 0, pUnmanagedBytes, pBytes.Length);
                    int dwWritten = 0;
                    bool success = WritePrinter(hPrinter, pUnmanagedBytes, pBytes.Length, out dwWritten);
                    Marshal.FreeCoTaskMem(pUnmanagedBytes);
                    EndPagePrinter(hPrinter);
                    EndDocPrinter(hPrinter);
                    ClosePrinter(hPrinter);
                    return success;
                }
                EndDocPrinter(hPrinter);
            }
            ClosePrinter(hPrinter);
        }
        return false;
    }
}
"@

if (-not ([System.Management.Automation.PSTypeName]'RawPrinterHelper').Type) {
    Add-Type -TypeDefinition $src -Language CSharp
}

$fileBytes = [System.IO.File]::ReadAllBytes($FilePath)

# Comandos ESC/POS para inicializacao, avanco alem da lamina e corte
$initCmd = [byte[]]@(0x1B, 0x40) # ESC @ (Reset/Init)
$cutCmd = [byte[]]@(0x1B, 0x64, 0x03, 0x1D, 0x56, 0x01) # ESC d 3 (Avanca alem da lamina) + GS V 1 (Corte)

# Carrega o raster ESC/POS da logomarca oficial se disponivel
$logoPath = Join-Path $PSScriptRoot "..\public\logo-escpos.bin"
$logoBytes = [byte[]]@()
if (Test-Path -LiteralPath $logoPath) {
    try {
        $logoBytes = [System.IO.File]::ReadAllBytes($logoPath)
    } catch {}
}

# Combina: Init + Logomarca + Conteudo do Cupom + Corte
$totalLen = $initCmd.Length + $logoBytes.Length + $fileBytes.Length + $cutCmd.Length
$totalBytes = [byte[]]::new($totalLen)
$offset = 0

[System.Buffer]::BlockCopy($initCmd, 0, $totalBytes, $offset, $initCmd.Length)
$offset += $initCmd.Length

if ($logoBytes.Length -gt 0) {
    [System.Buffer]::BlockCopy($logoBytes, 0, $totalBytes, $offset, $logoBytes.Length)
    $offset += $logoBytes.Length
}

[System.Buffer]::BlockCopy($fileBytes, 0, $totalBytes, $offset, $fileBytes.Length)
$offset += $fileBytes.Length

[System.Buffer]::BlockCopy($cutCmd, 0, $totalBytes, $offset, $cutCmd.Length)

$success = [RawPrinterHelper]::SendBytesToPrinter($target, $totalBytes)

if ($success) {
    Write-Output "SUCCESS: Impresso em $target"
    exit 0
} else {
    Write-Error "FALHA: Nao foi possivel enviar dados RAW para $target"
    exit 1
}
