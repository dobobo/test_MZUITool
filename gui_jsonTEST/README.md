# gui_jsonTEST（自動翻訳 / JSON 差し替え）

RPGツクールMZ の `data/*.json` を、翻訳 Excel（xlsx）の原文→訳文表で差し替える Windows 向けツールです。

## 今回の修正（特殊文字認識）

旧実装では原文キーをそのまま正規表現へ埋め込んでいたため、次の致命的な誤認識が起きていました。

| 入力例 | 旧挙動 | 原因 |
| --- | --- | --- |
| `\C[2]` / `\V[1]` | 実行時エラー（regexp コンパイル失敗） | `\` が正規表現エスケープとして解釈される |
| `配列[0]` など | 一致せず差し替えスキップ | `[` `]` が文字クラスになる |
| Excel の `¥C[2]`（円マーク） | JSON 内の `\C[2]` に一致しない | `\` と `¥`/`￥` を同一視していない |
| 訳文の `\C[n]` | 出力 JSON が壊れる | 訳文側の `\` を JSON エスケープしていない |

対策として、差し替え中核を `internal/replace` に切り出しました。

1. **正規表現マッチを廃止**し、原文の完全一致（`strings.ReplaceAll`）へ変更
2. 検索・置換の両方で **JSON 文字列エスケープ**（`\` → `\\` など）を実施
3. **`¥` / `￥` を `\` に正規化**してから突き合わせ

## テスト（Linux / macOS / Windows）

GUI 依存のない中核だけを検証できます。

```bash
cd gui_jsonTEST
go test ./internal/replace -v
```

## 一括ダウンロード

修正済み一式はリポジトリ直下の `gui_jsonTEST_fixed.zip` にまとめています。

## Windows でのビルド

```bash
cd gui_jsonTEST
go mod tidy
go build -o gui_json.exe .
```

`export_dir.txt` / `import_dir.txt` は実行ファイルと同じフォルダに置いてください。
