package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestDialogStartPathUsesExistingPreferred(t *testing.T) {
	dir := t.TempDir()
	file := filepath.Join(dir, "a.xlsx")
	if err := os.WriteFile(file, []byte("x"), 0666); err != nil {
		t.Fatal(err)
	}
	got := dialogStartPath(file, `C:\Desktop`)
	if got != file {
		t.Fatalf("got %q want %q", got, file)
	}
}

func TestDialogStartPathFallsBackToParent(t *testing.T) {
	dir := t.TempDir()
	missing := filepath.Join(dir, "missing.xlsx")
	got := dialogStartPath(missing, `C:\Desktop`)
	if got != dir {
		t.Fatalf("got %q want parent %q", got, dir)
	}
}

func TestDialogStartPathFallsBackToDesktop(t *testing.T) {
	got := dialogStartPath(`Z:\does\not\exist\file.xlsx`, `C:\Desktop`)
	if got != `C:\Desktop` {
		t.Fatalf("got %q", got)
	}
}

func TestCleanPath(t *testing.T) {
	if got := cleanPath("  C:\\a\\b.xlsx\r\n"); got != `C:\a\b.xlsx` {
		t.Fatalf("got %q", got)
	}
}
