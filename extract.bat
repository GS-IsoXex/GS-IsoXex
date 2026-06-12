@echo off
title Extract-XISO Node.js
chcp 65001 >nul
setlocal enabledelayedexpansion
cd /d "%~dp0"

REM Pasta do projeto (use a pasta do script como root)
set "PROJECT_DIR=%~dp0"
set "BIN_DIR=%PROJECT_DIR%bin"
set "ISO_DIR=%PROJECT_DIR%iso"

REM Verifica se Node.js esta instalado
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

REM Garante que o arquivo de configuracao exista
node "!BIN_DIR!\config.js" --init >nul 2>&1

REM Le a versao atual do package.json
set "PROJECT_VERSION=0.0.0"
for /f "usebackq delims=" %%V in (
ode -p "require('./package.json').version" 2^>nul) do set "PROJECT_VERSION=%%V"

REM Verifica se existe uma nova versao no GitHub
set "UPDATE_STATUS=OK"
set "LOCAL_VERSION=%PROJECT_VERSION%"
set "REMOTE_VERSION=%PROJECT_VERSION%"
set "UPDATE_AVAILABLE=0"
set "UPDATE_URL="
for /f "usebackq tokens=1-5 delims=|" %%A in (
ode "!BIN_DIR!\update-project.js" 2^>^&1) do (
    set "UPDATE_STATUS=%%A"
    set "LOCAL_VERSION=%%B"
    set "REMOTE_VERSION=%%C"
    set "UPDATE_AVAILABLE=%%D"
    set "UPDATE_URL=%%E"
)

REM Loop do menu principal
:menu
cls
echo.
echo ================================================================
echo         Extract-XISO Node.js v%PROJECT_VERSION%
echo ================================================================
echo.
if "%UPDATE_STATUS%"=="ERROR" (
    echo AVISO: Nao foi possivel verificar atualizacoes do GitHub.
    echo Voce podera continuar usando o programa, mas a verificacao falhou.
    echo.
) else if "%UPDATE_AVAILABLE%"=="1" (
    echo ATENCAO: Nova versao disponivel! Atualize para usar o programa.
    echo Versao instalada: %LOCAL_VERSION%
    echo Versao mais recente: %REMOTE_VERSION%
    echo.
)
echo Escolha uma opcao:
echo.
if "%UPDATE_AVAILABLE%"=="1" (
    echo   [1] Atualizar para a versao %REMOTE_VERSION%
    echo   [2] Configuracoes
    echo   [3] Sair
) else (
    echo   [1] Extrair ISO para XEX
    echo   [2] Configuracoes
    echo   [3] Sair
)
echo.
echo ================================================================
echo.

set /p "choice=Digite sua opcao (1, 2 ou 3): "

if "%UPDATE_AVAILABLE%"=="1" (
    if "%choice%"=="1" (
        cls
        echo.
        echo Atualizando o projeto para a versao %REMOTE_VERSION%...
        echo.
        node "!BIN_DIR!\update-project.js" --update
        set "RC=!ERRORLEVEL!"
        if not "!RC!"=="0" (
            echo.
            echo Falha ao atualizar o projeto. Verifique sua conexao de internet e tente novamente.
            echo.
            echo Pressione qualquer tecla para voltar ao menu...
            pause >nul
            goto menu
        )
        echo.
        echo Projeto atualizado com sucesso para a versao %REMOTE_VERSION%.
        echo Pressione qualquer tecla para reiniciar o menu com a nova versao...
        pause >nul
        call "%~f0"
        exit /b 0
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
)

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