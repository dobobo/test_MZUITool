// Package replace は RPGツクールMZ の JSON に対する翻訳差し替えの中核処理です。
//
// Excel 上の原文・訳文に含まれる制御文字（\C[n], \V[n] など）や [] を、
// 正規表現のメタ文字として誤解釈せず、JSON 文字列として正しく突き合わせて置換します。
package replace

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"unicode/utf8"
)

// NormalizeControlPrefix は、日本語環境で円マークに見える制御文字プレフィックスを
// RPGツクールが解釈するバックスラッシュへ正規化します。
//
// - U+005C (\) : そのまま
// - U+00A5 (¥) : 半角円記号 → \
// - U+FFE5 (￥): 全角円記号 → \
func NormalizeControlPrefix(s string) string {
	if s == "" {
		return s
	}
	r := strings.NewReplacer("¥", `\`, "￥", `\`)
	return r.Replace(s)
}

// JSONEscapeString は JSON の文字列値（二重引用符の内側）向けにエスケープします。
// 制御文字 \C[1] の先頭 \ も \\ に変換されるため、生成結果を JSON へ埋め込んでも壊れません。
func JSONEscapeString(s string) string {
	var b strings.Builder
	b.Grow(len(s) + 8)
	for i := 0; i < len(s); {
		r, size := utf8.DecodeRuneInString(s[i:])
		i += size
		switch r {
		case '"':
			b.WriteString(`\"`)
		case '\\':
			b.WriteString(`\\`)
		case '\b':
			b.WriteString(`\b`)
		case '\f':
			b.WriteString(`\f`)
		case '\n':
			b.WriteString(`\n`)
		case '\r':
			b.WriteString(`\r`)
		case '\t':
			b.WriteString(`\t`)
		default:
			if r < 0x20 {
				b.WriteString(fmt.Sprintf(`\u%04x`, r))
			} else {
				b.WriteRune(r)
			}
		}
	}
	return b.String()
}

// QuotedJSONSearchKeys は、生 JSON テキスト内で原文を探すための候補（"..." 形式）を返します。
// Excel が単一 \ / 円マーク / 既に JSON 風の二重 \ のどれで持っていても当たるよう、複数形を返します。
func QuotedJSONSearchKeys(key string) []string {
	norm := NormalizeControlPrefix(key)
	candidates := []string{
		`"` + JSONEscapeString(norm) + `"`,
		`"` + JSONEscapeString(key) + `"`,
		`"` + key + `"`,
		`"` + norm + `"`,
	}
	return uniqueNonEmpty(candidates)
}

// QuotedJSONReplacement は差し込み用の "訳文" 断片を返します。
func QuotedJSONReplacement(value string) string {
	return `"` + JSONEscapeString(NormalizeControlPrefix(value)) + `"`
}

// WrapLongValue は従来ロジックに近い行長調整を行います。
// 戻り値は「論理文字列」（まだ JSON エスケープ前）です。改行は実文字の \r\n を使います。
func WrapLongValue(value string, maxOneLine int) (wrapped string, skippedTooLong bool) {
	if maxOneLine <= 0 {
		maxOneLine = 50
	}
	value = strings.ReplaceAll(value, "\r\n", " ")
	value = strings.ReplaceAll(value, "\n", " ")
	value = strings.ReplaceAll(value, "\r", " ")

	runeCount := utf8.RuneCountInString(value)
	if runeCount <= maxOneLine {
		return value, false
	}
	// 旧実装: 177 バイト超はスキップ。文字数ベースに直しつつ、極端に長い文は従来どおり見送ります。
	if runeCount > 177 {
		return value, true
	}

	words := strings.Split(value, " ")
	var parts []string
	lineLen := 0
	for _, word := range words {
		wlen := utf8.RuneCountInString(word)
		if lineLen > 0 && lineLen+1+wlen > maxOneLine {
			parts = append(parts, "\r\n"+word)
			lineLen = wlen
			continue
		}
		if len(parts) == 0 {
			parts = append(parts, word)
		} else {
			parts = append(parts, " "+word)
		}
		if lineLen == 0 {
			lineLen = wlen
		} else {
			lineLen += 1 + wlen
		}
	}
	return strings.Join(parts, ""), false
}

// ApplyTranslations は raw JSON テキストに対し、原文→訳文の差し替えを行います。
//
// 旧実装の問題点:
//   - 原文を正規表現に埋め込む際、\ や [] を QuoteMeta しておらず、\C でコンパイルエラー、
//     [0] は文字クラスになって一致せずスキップされていた
//   - 訳文の \ を JSON エスケープせず埋め込んでおり、\C[n] 入り訳文で JSON が壊れていた
//   - 円マーク (¥/￥) とバックスラッシュを同一視していなかった
func ApplyTranslations(sourceJSON string, transMap map[string]string, maxOneLine int) (result string, replacedKeys []string, skippedLong []string, unmatched []string) {
	result = sourceJSON
	replacedKeys = make([]string, 0)
	skippedLong = make([]string, 0)
	unmatched = make([]string, 0)

	// map の反復順は不定なので、長いキーから置換して部分一致の食い合いを減らします。
	keys := make([]string, 0, len(transMap))
	for k := range transMap {
		keys = append(keys, k)
	}
	sort.Slice(keys, func(i, j int) bool {
		return len(keys[i]) > len(keys[j])
	})

	for _, key := range keys {
		value := transMap[key]
		wrapped, tooLong := WrapLongValue(value, maxOneLine)
		if tooLong {
			skippedLong = append(skippedLong, key)
			continue
		}

		replacement := QuotedJSONReplacement(wrapped)
		before := result
		for _, needle := range QuotedJSONSearchKeys(key) {
			if needle == `""` || !strings.Contains(result, needle) {
				continue
			}
			result = strings.ReplaceAll(result, needle, replacement)
		}
		if result != before {
			replacedKeys = append(replacedKeys, key)
		} else {
			unmatched = append(unmatched, key)
		}
	}
	return result, replacedKeys, skippedLong, unmatched
}

// ValidateJSON は差し替え後のテキストが JSON として読めるか確認します。
func ValidateJSON(text string) error {
	var v interface{}
	return json.Unmarshal([]byte(text), &v)
}

func uniqueNonEmpty(items []string) []string {
	seen := make(map[string]struct{}, len(items))
	out := make([]string, 0, len(items))
	for _, item := range items {
		if item == "" {
			continue
		}
		if _, ok := seen[item]; ok {
			continue
		}
		seen[item] = struct{}{}
		out = append(out, item)
	}
	return out
}
