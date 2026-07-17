@echo off
setlocal
cd /d "%~dp0"

echo ========================================
echo DB_UIComposer Tool - Electron Debug Start
echo ========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js が見つかりません。
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm が見つかりません。
  pause
  exit /b 1
)

if not exist node_modules\electron (
  echo 初回起動のため npm install を実行します。
  call npm install
  if errorlevel 1 (
    echo [ERROR] npm install に失敗しました。
    pause
    exit /b 1
  )
)

echo 開発者ツール付きで起動します。
call npm run debug
set EXIT_CODE=%ERRORLEVEL%

echo.
echo 終了コード: %EXIT_CODE%
pause
exit /b %EXIT_CODE%
