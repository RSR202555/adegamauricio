@echo off
title ADEGA DE MAURICIO - Frente de Caixa PDV
echo ==============================================================
echo        INICIANDO FRENTE DE CAIXA COM IMPRESSAO AUTOMATICA
echo          (MODO SILENCIOSO KIOSK - IMPRIME DIRETO NA POS-80)
echo ==============================================================
echo.
start "" "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --kiosk-printing --user-data-dir="C:\Users\RSR_DEV\AppData\Local\Microsoft\Edge\PDVProfile" --app="https://adegamauricio-pgn0.vercel.app/pdv"
exit
