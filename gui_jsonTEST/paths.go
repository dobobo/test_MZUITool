package main

import (
	"os"
	"path/filepath"
	"strings"
)

func cleanPath(s string) string {
	return strings.TrimSpace(strings.Trim(s, "\"'"))
}

func pathExists(path string) bool {
	if path == "" {
		return false
	}
	_, err := os.Stat(path)
	return err == nil
}

// desktopDir は C ドライブ上のデスクトップを返します。
// 見つからない場合は C:\ を返します。
func desktopDir() string {
	candidates := make([]string, 0, 6)
	if profile := os.Getenv("USERPROFILE"); profile != "" {
		candidates = append(candidates,
			filepath.Join(profile, "Desktop"),
			filepath.Join(profile, "デスクトップ"),
		)
	}
	candidates = append(candidates,
		`C:\Users\Public\Desktop`,
		`C:\Users\Public\デスクトップ`,
		`C:\Desktop`,
		`C:\デスクトップ`,
	)
	for _, p := range candidates {
		if pathExists(p) {
			return p
		}
	}
	return `C:\`
}

// dialogStartPath はダイアログの初期パスを決めます。
// preferred が存在するファイル/フォルダならそれを使い、
// ファイルが消えていても親フォルダがあればそこを使い、
// どちらも無ければ fallback（通常はデスクトップ）を使います。
func dialogStartPath(preferred string, fallback string) string {
	preferred = cleanPath(preferred)
	if preferred == "" {
		return fallback
	}
	if pathExists(preferred) {
		return preferred
	}
	parent := filepath.Dir(preferred)
	if parent != "" && parent != "." && parent != preferred && pathExists(parent) {
		return parent
	}
	return fallback
}

func readPathFile(path string) string {
	b, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	return cleanPath(string(b))
}

func writePathFile(path string, value string) {
	value = cleanPath(value)
	if value == "" {
		return
	}
	_ = os.WriteFile(path, []byte(value+"\r\n"), 0666)
}
