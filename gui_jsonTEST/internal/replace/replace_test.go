package replace

import (
	"encoding/json"
	"regexp"
	"strings"
	"testing"
)

// oldEscapeKey は修正前 gui_json.go と同じ手書きエスケープです（回帰比較用）。
func oldEscapeKey(key string) string {
	keyTmp := strings.Replace(key, "*", "\\*", -1)
	keyTmp = strings.Replace(keyTmp, "+", "\\+", -1)
	keyTmp = strings.Replace(keyTmp, "{", "\\{", -1)
	keyTmp = strings.Replace(keyTmp, "}", "\\}", -1)
	keyTmp = strings.Replace(keyTmp, "^", "\\^", -1)
	keyTmp = strings.Replace(keyTmp, "$", "\\$", -1)
	keyTmp = strings.Replace(keyTmp, "-", "\\-", -1)
	keyTmp = strings.Replace(keyTmp, "|", "\\|", -1)
	keyTmp = strings.Replace(keyTmp, "(", "\\(", -1)
	keyTmp = strings.Replace(keyTmp, ")", "\\)", -1)
	keyTmp = strings.Replace(keyTmp, "+", "\\+", -1)
	keyTmp = strings.Replace(keyTmp, "?", "\\?", -1)
	return keyTmp
}

func TestOldLogicFailsOnBackslashAndBrackets(t *testing.T) {
	key := `色\C[2]変更`
	_, err := regexp.Compile(`"` + oldEscapeKey(key) + `"`)
	if err == nil {
		t.Fatal("expected old regex logic to fail on \\C, but it compiled")
	}

	bracketKey := `配列[0]です`
	re, err := regexp.Compile(`"` + oldEscapeKey(bracketKey) + `"`)
	if err != nil {
		t.Fatalf("unexpected compile error: %v", err)
	}
	raw := `{"a":"配列[0]です"}`
	if re.MatchString(raw) {
		t.Fatal("old logic unexpectedly matched bracket text; [0] should have been a char class")
	}
}

func TestNormalizeControlPrefix(t *testing.T) {
	cases := map[string]string{
		`\C[2]`:  `\C[2]`,
		`¥C[2]`:  `\C[2]`,
		`￥V[1]`: `\V[1]`,
		`普通`:   `普通`,
	}
	for in, want := range cases {
		if got := NormalizeControlPrefix(in); got != want {
			t.Fatalf("NormalizeControlPrefix(%q)=%q want %q", in, got, want)
		}
	}
}

func TestJSONEscapeStringDoublesBackslash(t *testing.T) {
	got := JSONEscapeString(`色\C[2]変更`)
	want := `色\\C[2]変更`
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
	// 埋め込んでも JSON として妥当
	raw := `{"t":"` + got + `"}`
	var v map[string]string
	if err := json.Unmarshal([]byte(raw), &v); err != nil {
		t.Fatalf("json invalid: %v", err)
	}
	if v["t"] != `色\C[2]変更` {
		t.Fatalf("decoded=%q", v["t"])
	}
}

func TestApplyTranslationsControlCodesAndBrackets(t *testing.T) {
	// RPGツクールMZの JSON では制御文字の \ が二重化されて格納される
	source := `{"msg":"色\\C[2]変更","arr":"配列[0]です","yen":"円\\\\V[1]表示"}`
	// yen キーは実際のゲームデータでは \\V なので、ここでは通常の制御文字ケースを主に検証

	source = `{"msg":"色\\C[2]変更","arr":"配列[0]です","plain":"こんにちは"}`

	trans := map[string]string{
		`色\C[2]変更`: `Color \C[3] change`, // Excel 上の単一 \
		`配列[0]です`:  `array[0] item`,
		`こんにちは`:   `Hello`,
	}

	// 円マーク表記でも同じ JSON 原文に当たること
	sourceYen := `{"msg":"色\\C[2]変更"}`
	outYen, replaced, _, unmatched := ApplyTranslations(sourceYen, map[string]string{
		`色¥C[2]変更`: `Color \C[9] change`,
	}, 50)
	if len(replaced) != 1 {
		t.Fatalf("yen key not replaced: replaced=%v unmatched=%v out=%s", replaced, unmatched, outYen)
	}
	if err := ValidateJSON(outYen); err != nil {
		t.Fatalf("yen result json invalid: %v\n%s", err, outYen)
	}
	var decodedYen map[string]string
	_ = json.Unmarshal([]byte(outYen), &decodedYen)
	if decodedYen["msg"] != `Color \C[9] change` {
		t.Fatalf("yen decoded msg=%q", decodedYen["msg"])
	}

	out, replaced, skipped, unmatched := ApplyTranslations(source, trans, 50)
	if len(skipped) != 0 {
		t.Fatalf("unexpected skipped: %v", skipped)
	}
	if err := ValidateJSON(out); err != nil {
		t.Fatalf("result json invalid: %v\n%s", err, out)
	}
	var decoded map[string]string
	if err := json.Unmarshal([]byte(out), &decoded); err != nil {
		t.Fatal(err)
	}
	if decoded["msg"] != `Color \C[3] change` {
		t.Fatalf("msg=%q", decoded["msg"])
	}
	if decoded["arr"] != `array[0] item` {
		t.Fatalf("arr=%q", decoded["arr"])
	}
	if decoded["plain"] != `Hello` {
		t.Fatalf("plain=%q", decoded["plain"])
	}
	if len(replaced) < 3 {
		t.Fatalf("expected >=3 replacements, got %v (unmatched=%v)", replaced, unmatched)
	}
}

func TestApplyTranslationsKeepsValidJSONWithQuotes(t *testing.T) {
	source := `{"a":"言う「こんにちは」"}`
	out, _, _, _ := ApplyTranslations(source, map[string]string{
		`言う「こんにちは」`: `say "hello"`,
	}, 50)
	if err := ValidateJSON(out); err != nil {
		t.Fatalf("invalid json: %v\n%s", err, out)
	}
	var decoded map[string]string
	_ = json.Unmarshal([]byte(out), &decoded)
	if decoded["a"] != `say "hello"` {
		t.Fatalf("got %q", decoded["a"])
	}
}

func TestQuotedJSONSearchKeysIncludeEscapedForm(t *testing.T) {
	keys := QuotedJSONSearchKeys(`\V[1]`)
	found := false
	for _, k := range keys {
		if k == `"\\V[1]"` {
			found = true
		}
	}
	if !found {
		t.Fatalf("missing JSON-escaped search key in %v", keys)
	}
}
