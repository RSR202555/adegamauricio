$wsh = New-Object -ComObject WScript.Shell
$desktop = [System.Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktop "PDV - Adega Mauricio.lnk"
$shortcut = $wsh.CreateShortcut($shortcutPath)
$shortcut.TargetPath = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
$shortcut.Arguments = "--kiosk-printing --app=https://adegamauricio-pgn0.vercel.app/pdv"
$shortcut.Description = "Frente de Caixa PDV - Impressao Direta na POS-80"
$shortcut.IconLocation = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe,0"
$shortcut.Save()
Write-Host "Atalho criado com sucesso em: $shortcutPath"
