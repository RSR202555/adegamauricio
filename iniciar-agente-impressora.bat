@echo off
title Agente de Impressao Termica - ADEGA MAURI
color 0A
echo ==============================================================
echo        INICIANDO AGENTE DE IMPRESSAO TERMICA POS-80
echo                      ADEGA MAURI
echo ==============================================================
echo.
cd /d "%~dp0\printer-agent"
node agent.js
pause
