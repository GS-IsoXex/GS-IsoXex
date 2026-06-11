@echo off
title Extract-XISO Config
chcp 65001 >nul
setlocal enabledelayedexpansion
cd /d "%~dp0"

set "BIN_DIR=%~dp0bin"
set "CONFIG_FILE=%~dp0config.json"

node "%BIN_DIR%\config.js" --init >nul 2>&1

:loadConfig
for /f "usebackq delims=" %%A in (`node "%BIN_DIR%\config.js" --get`) do (
  for /f "tokens=1* delims==" %%B in ("%%A") do set "%%B=%%C"
)
goto :menu

:menu
cls
echo =============================================
echo      Extract-XISO Configuracao
echo =============================================
echo.
echo 1. Selecionar pasta de ISOs   : %ISO_DIR%
echo 2. Selecionar pasta de saida : %OUTPUT_DIR%
echo 3. Apagar $SystemUpdate        : %DELETE_SYSTEM_UPDATE%
echo 4. Apagar ISO apos extracao   : %DELETE_ISO_AFTER_EXTRACT%
echo 5. Resetar para padrao
echo 6. Voltar ao menu do Extract
echo.
set /p "choice=Escolha uma opcao: "
if "%choice%"=="1" goto selectIso
if "%choice%"=="2" goto selectOutput
if "%choice%"=="3" goto toggleSystem
if "%choice%"=="4" goto toggleDeleteIso
if "%choice%"=="5" goto resetConfig
if "%choice%"=="6" goto end
echo Opcao invalida. Pressione Enter para continuar...
pause >nul
goto :menu

:selectIso
echo Selecionar pasta de ISOs... 
for /f "usebackq delims=" %%A in (`powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; $d = New-Object System.Windows.Forms.FolderBrowserDialog; $d.SelectedPath = '%ISO_DIR%'; $d.Description = 'Selecione a pasta onde estao seus arquivos ISO'; if ($d.ShowDialog() -eq 'OK') { Write-Output $d.SelectedPath }"`) do set "SELECTED=%%A"
if defined SELECTED (
  node "%BIN_DIR%\config.js" --set isoDir "%SELECTED%" >nul 2>&1
  set "SELECTED="
)
goto :loadConfig

:selectOutput
echo Selecionar pasta de saida... 
for /f "usebackq delims=" %%A in (`powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; $d = New-Object System.Windows.Forms.FolderBrowserDialog; $d.SelectedPath = '%OUTPUT_DIR%'; $d.Description = 'Selecione a pasta onde os arquivos extraidos serao salvos'; if ($d.ShowDialog() -eq 'OK') { Write-Output $d.SelectedPath }"`) do set "SELECTED=%%A"
if defined SELECTED (
  node "%BIN_DIR%\config.js" --set outputDir "%SELECTED%" >nul 2>&1
  set "SELECTED="
)
goto :loadConfig

:toggleSystem
if /i "%DELETE_SYSTEM_UPDATE%"=="true" (
  node "%BIN_DIR%\config.js" --set deleteSystemUpdate false >nul 2>&1
) else (
  node "%BIN_DIR%\config.js" --set deleteSystemUpdate true >nul 2>&1
)
goto :loadConfig

:toggleDeleteIso
if /i "%DELETE_ISO_AFTER_EXTRACT%"=="true" (
  node "%BIN_DIR%\config.js" --set deleteIsoAfterExtract false >nul 2>&1
) else (
  node "%BIN_DIR%\config.js" --set deleteIsoAfterExtract true >nul 2>&1
)
goto :loadConfig

:resetConfig
node "%BIN_DIR%\config.js" --reset >nul 2>&1
goto :loadConfig

:end
echo.
echo Configuracao salva em %CONFIG_FILE%
echo Pressione Enter para voltar ao menu...
pause >nul
endlocal
exit /b 0
