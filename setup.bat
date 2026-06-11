@echo off
title Setup Extract-XISO Node.js
setlocal enabledelayedexpansion

for /F %%a in ('copy /Z "%~f0" nul') do set "BS=%%a"

echo.
echo %BS%[1;36m=== Setup Extract-XISO Node.js ===%BS%[0m
echo.

REM Verifica Node.js
echo %BS%[1;33mVerificando Node.js...%BS%[0m
where node >nul 2>&1
if errorlevel 1 (
    node --version >nul 2>&1
    if errorlevel 1 (
        echo %BS%[1;31mErro: Node.js não detectado!%BS%[0m
        echo.
        echo Baixe em: https://nodejs.org/
        echo.
        pause
        exit /b 1
    )
)

node --version
npm --version

echo.
echo %BS%[1;32m✓ Node.js detectado!%BS%[0m
echo.

REM Cria pastas necessárias
set "PROJECT_DIR=%~dp0"
echo %BS%[1;33mCriando estrutura de pastas...%BS%[0m

if not exist "%PROJECT_DIR%iso" (
    mkdir "%PROJECT_DIR%iso"
    echo  ✓ Pasta "iso" criada
)

if not exist "%PROJECT_DIR%output" (
    mkdir "%PROJECT_DIR%output"
    echo  ✓ Pasta "output" criada
)

echo.
echo %BS%[1;32m=== Setup Concluído! ===%BS%[0m
echo.
echo Próximos passos:
echo  1. Copie seus arquivos .xiso para:
echo     %PROJECT_DIR%iso\
echo.
echo  2. Execute:
echo     extract.bat
echo.
echo.
pause
