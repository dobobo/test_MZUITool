# gui_jsonTEST（自動翻訳 / JSON 差し替え）

RPGツクールMZ の `data/*.json` を、翻訳 Excel（xlsx）の原文→訳文表で差し替える Windows 向けツールです。

## 実行ファイル（どれを使うか）

| ファイル | 説明 |
| --- | --- |
| `gui_json.exe` | 64bit Windows 用（通常はこれ） |
| `gui_json_x86.exe` | 32bit Windows 用 |
| `gui_json_console.exe` | 起動ログ付き（ウィンドウが出ないときの確認用） |

**重要:** 以前ダウンロードした exe を一度起動している場合、Windows が古い状態をキャッシュすることがあります。必ず **新しい ZIP を別フォルダに展開**してから `gui_json.exe` を起動してください。

`export_dir.txt` / `import_dir.txt` / `trans_file.txt` は実行ファイルと同じフォルダに置いてください。  
各ダイアログは前回のフォルダ／ファイルを初期位置にし、存在しない場合はデスクトップから開きます。

一括ダウンロード: リポジトリ直下の `gui_jsonTEST_fixed.zip`

## 起動しない場合

1. 新しいフォルダに ZIP を展開し直す  
2. それでもダメなら `gui_json_console.exe` を起動し、黒い画面のエラーメッセージを確認  
3. SmartScreen が出たら「詳細情報」→「実行」

## 今回の修正（特殊文字認識）

旧実装では原文キーをそのまま正規表現へ埋め込んでいたため、次の致命的な誤認識が起きていました。

| 入力例 | 旧挙動 | 原因 |
| --- | --- | --- |
| `\C[2]` / `\V[1]` | 実行時エラー | `\` が正規表現エスケープとして解釈される |
| `配列[0]` など | 差し替えスキップ | `[` `]` が文字クラスになる |
| Excel の `¥C[2]` | 一致しない | `\` と `¥`/`￥` を同一視していない |
| 訳文の `\C[n]` | JSON 破損 | 訳文側の `\` 未エスケープ |

対策: `internal/replace` で完全一致 + JSON エスケープ + 円マーク正規化。

## テスト

```bash
cd gui_jsonTEST
go test ./internal/replace -v
```

## Windows での再ビルド

```bash
rsrc -manifest app.manifest -arch amd64 -o rsrc_windows_amd64.syso
set CGO_ENABLED=0
set GOOS=windows
set GOARCH=amd64
go build -ldflags="-s -w -H windowsgui" -o gui_json.exe .
```
