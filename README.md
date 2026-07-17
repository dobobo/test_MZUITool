# testgo

## gui_jsonTEST（翻訳 JSON 差し替え）

RPGツクールMZ 用の翻訳文章差し替えアプリです。

- 元データ: `gui_jsonTEST.zip`
- 修正済み一括ダウンロード: [`gui_jsonTEST_fixed.zip`](gui_jsonTEST_fixed.zip)
- 修正済みソース: [`gui_jsonTEST/`](gui_jsonTEST/)
- 特殊文字（`\` / 円マーク / `[]`）認識の修正内容: [`gui_jsonTEST/README.md`](gui_jsonTEST/README.md)

```bash
cd gui_jsonTEST
go test ./internal/replace -v
```
