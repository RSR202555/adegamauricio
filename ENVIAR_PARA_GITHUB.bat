@echo off
title Enviar Atualizacoes - ADEGA MAURICIO
color 0B
echo ==============================================================
echo        ENVIANDO ATUALIZACOES PARA O GITHUB / VERCEL
echo ==============================================================
echo.
cd /d "%~dp0"
git push origin main
echo.
echo ==============================================================
echo Concluido! Pressione qualquer tecla para fechar esta janela.
pause
