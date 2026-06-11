@echo off
title Extract-XISO Node.js
chcp 65001 >nul
setlocal enabledelayedexpansion
cd /d "%~dp0"

REM Pasta do projeto (use a pasta do script como root)
set "PROJECT_DIR=%~dp0"
set "BIN_DIR=%PROJECT_DIR%bin"
set "ISO_DIR=%PROJECT_DIR%iso"

REM Verifica se Node.js está instalado
where node >nul 2>&1
if errorlevel 1 (
    node --version >nul 2>&1
    if errorlevel 1 (
        cls
        echo.
        echo ================================================================
        echo         ERRO: Node.js NAO ENCONTRADO
        echo ================================================================
        echo.
        echo Node.js nao esta instalado ou nao esta no PATH do sistema.
        echo.
        echo Para usar este programa, voce precisa instalar Node.js:
        echo   - Acesse: https://nodejs.org/
        echo   - Baixe a versao LTS mais recente
        echo   - Execute o instalador e siga as instrucoes
        echo   - Reinicie o computador apos a instalacao
        echo.
        echo Pressione qualquer tecla para sair...
        pause >nul
        exit /b 1
    )
)

REM Garante que o arquivo de configuração exista
node "!BIN_DIR!\config.js" --init >nul 2>&1

REM Loop do menu principal
:menu
cls
echo.
echo ================================================================
echo         Extract-XISO Node.js v0.1.0
echo ================================================================
echo.
echo Escolha uma opcao:
echo.
echo   [1] Extrair ISO para XEX
echo   [2] Configuracoes
echo   [3] Sair
echo.
echo ================================================================
echo.

set /p "choice=Digite sua opcao (1, 2 ou 3): "

if "%choice%"=="1" (
    cls
    echo.
    echo Iniciando extracao de arquivos ISO...
    echo.
    node "%~dp0bin\extract.js"
    set "RC=!ERRORLEVEL!"
    if not "!RC!"=="0" (
        echo.
        echo Erro durante a execucao! Codigo: !RC!
        echo.
        echo Exibindo as ultimas linhas de extract.log para depuracao:
        if exist "!PROJECT_DIR!extract.log" (
            powershell -NoProfile -Command "Get-Content -Path '!PROJECT_DIR!extract.log' -Tail 200"
        ) else (
            echo extract.log nao encontrado
        )
    ) else (
        echo.
        echo Extracao concluida com sucesso!
    )
    echo.
    echo Pressione qualquer tecla para voltar ao menu...
    pause >nul
    goto menu
)

if "%choice%"=="2" (
    call "!PROJECT_DIR!config.bat"
    goto menu
)

if "%choice%"=="3" (
    cls
    echo.
    echo Ate logo!
    echo.
    exit /b 0
)

echo Opcao invalida! Digite 1, 2 ou 3.
echo.
echo Pressione qualquer tecla para tentar novamente...
pause >nul
goto menu
