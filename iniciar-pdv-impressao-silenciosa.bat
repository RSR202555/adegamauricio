@echo off
title ADEGA DE MAURICIO - PDV IMPRESSAO DIRETA
echo ==============================================================
echo        INICIANDO FRENTE DE CAIXA COM IMPRESSAO AUTOMATICA
echo          (IMPRIME DIRETO NA POS-80 SEM ABRIR JANELAS)
echo ==============================================================
echo.
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
    start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk-printing --user-data-dir="%LOCALAPPDATA%\Google\Chrome\PDVProfile" --app="https://adegamauricio-pgn0.vercel.app/pdv"
) else (
    start "" "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --kiosk-printing --user-data-dir="%LOCALAPPDATA%\Microsoft\Edge\PDVProfile" --app="https://adegamauricio-pgn0.vercel.app/pdv"
)
exit
