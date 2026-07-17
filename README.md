# testgo

## gui_jsonTEST（翻訳 JSON 差し替え）

RPGツクールMZ 用の翻訳文章差し替えアプリです。

- 元データ: `gui_jsonTEST.zip`
- **修正済み一括ダウンロード（exe 同梱）**: [`gui_jsonTEST_fixed.zip`](gui_jsonTEST_fixed.zip)
- 修正済みソース: [`gui_jsonTEST/`](gui_jsonTEST/)
  - `gui_json.exe` … 64bit Windows
  - `gui_json_x86.exe` … 32bit Windows

```bash
cd gui_jsonTEST
go test ./internal/replace -v
```
