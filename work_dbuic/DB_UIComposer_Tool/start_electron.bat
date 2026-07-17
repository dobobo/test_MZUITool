@echo off
setlocal
cd /d "%~dp0"

echo ========================================
echo DB_UIComposer Tool - Electron Start
echo ========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js が見つかりません。
  echo Node.js をインストールしてから再実行してください。
  echo.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm が見つかりません。
  echo Node.js / npm をインストールしてから再実行してください。
  echo.
  pause
  exit /b 1
)

if not exist package.json (
  echo [ERROR] package.json が見つかりません。
  echo このbatは DB_UIComposer_Tool フォルダ内で実行してください。
  echo.
  pause
  exit /b 1
)

if not exist node_modules\electron (
  echo 初回起動のため npm install を実行します。
  echo 数分かかる場合があります。
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo [ERROR] npm install に失敗しました。
    echo 上のエラー内容を確認してください。
    echo.
    pause
    exit /b 1
  )
)

echo.
echo Electron版を起動します。
echo すぐ閉じる場合は、この画面に表示されたエラーを確認してください。
echo.

call npm start
set EXIT_CODE=%ERRORLEVEL%

echo.
if not "%EXIT_CODE%"=="0" (
  echo [ERROR] Electron が終了しました。終了コード: %EXIT_CODE%
) else (
  echo Electron が終了しました。
)
echo.
pause
exit /b %EXIT_CODE%
