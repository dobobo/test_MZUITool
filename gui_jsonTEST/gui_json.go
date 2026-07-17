//go:build windows

package main

import (
	"fmt"
	"io/ioutil"
	"log"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"gui_jsonTEST/internal/replace"

	"github.com/lxn/walk"
	. "github.com/lxn/walk/declarative"
	"github.com/rentiansheng/xlsx"
)

type MyMainWindow struct {
	*walk.MainWindow
	edit                 *walk.TextEdit
	sourcePath           string
	destPath             string
	transPath            string
	sourceSearchBox      *walk.LineEdit
	destSearchBox        *walk.LineEdit
	transSearchBox       *walk.LineEdit
	selectExcelSheetName *walk.LineEdit
	dir                  string
}

func main() {
	mw := &MyMainWindow{}
	mw.dir, _ = os.Getwd()

	exportDir := readOptionalFile(filepath.Join(mw.dir, "export_dir.txt"))
	importDir := readOptionalFile(filepath.Join(mw.dir, "import_dir.txt"))

	MW := MainWindow{
		AssignTo: &mw.MainWindow,
		Title:    "自動翻訳",
		MinSize:  Size{300, 200},
		Size:     Size{500, 400},
		Layout:   VBox{},
		Children: []Widget{
			GroupBox{
				Layout: HBox{},
				Children: []Widget{
					LineEdit{AssignTo: &mw.transSearchBox},
					PushButton{Text: "翻訳Excelファイル", OnClicked: mw.transPbClicked},
				},
			},
			GroupBox{
				Layout: HBox{},
				Children: []Widget{
					Label{Font: Font{PointSize: 12}, Text: "Excelシート名指定"},
					LineEdit{AssignTo: &mw.selectExcelSheetName},
				},
			},
			GroupBox{
				Layout: HBox{},
				Children: []Widget{
					LineEdit{AssignTo: &mw.sourceSearchBox, Text: string(importDir)},
					PushButton{Text: "元データフォルダ", OnClicked: mw.sourcePbClicked},
				},
			},
			GroupBox{
				Layout: HBox{},
				Children: []Widget{
					LineEdit{AssignTo: &mw.destSearchBox, Text: string(exportDir)},
					PushButton{Text: "保存先フォルダ", OnClicked: mw.dest_pbClicked},
				},
			},
			PushButton{Text: "実行", OnClicked: mw.execute},
		},
	}
	if _, err := MW.Run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func readOptionalFile(path string) []byte {
	b, err := ioutil.ReadFile(path)
	if err != nil {
		fmt.Println(err)
		return nil
	}
	return b
}

func (mw *MyMainWindow) sourcePbClicked() {
	dlg := new(walk.FileDialog)
	dlg.FilePath = mw.sourcePath
	dlg.Title = "翻訳する元データフォルダを選択してください"
	dlg.Filter = "All files (*.*)|*.*"
	if ok, err := dlg.ShowBrowseFolder(mw); err != nil {
		walk.MsgBox(mw, "エラー", "ファイルオープンエラー", walk.MsgBoxOK)
		return
	} else if !ok {
		return
	}
	mw.sourcePath = dlg.FilePath
	mw.sourceSearchBox.SetText(fmt.Sprintf("%s\r\n", mw.sourcePath))
}

func (mw *MyMainWindow) dest_pbClicked() {
	dlg := new(walk.FileDialog)
	dlg.FilePath = mw.destPath
	dlg.Title = "翻訳したファイルを保存するフォルダ先を選択してください"
	dlg.Filter = "All files (*.*)|*.*"
	if ok, err := dlg.ShowBrowseFolder(mw); err != nil {
		walk.MsgBox(mw, "エラー", "ファイルオープンエラー", walk.MsgBoxOK)
		return
	} else if !ok {
		return
	}
	mw.destPath = dlg.FilePath
	mw.destSearchBox.SetText(fmt.Sprintf("%s\r\n", mw.destPath))
}

func (mw *MyMainWindow) transPbClicked() {
	dlg := new(walk.FileDialog)
	dlg.FilePath = mw.transPath
	dlg.Title = "翻訳Excelファイルを選択してください"
	dlg.Filter = "All files (*.*)|*.*"
	if ok, err := dlg.ShowOpen(mw); err != nil {
		walk.MsgBox(mw, "エラー", "ファイルオープンエラー", walk.MsgBoxOK)
		return
	} else if !ok {
		return
	}
	mw.transPath = dlg.FilePath
	mw.transSearchBox.SetText(fmt.Sprintf("%s\r\n", mw.transPath))
}

func (mw *MyMainWindow) execute() {
	transSearchBoxText := strings.TrimRight(mw.transSearchBox.Text(), "\r\n")
	sourceSearchBoxText := strings.TrimRight(mw.sourceSearchBox.Text(), "\r\n")
	destSearchBoxText := strings.TrimRight(mw.destSearchBox.Text(), "\r\n")

	_ = ioutil.WriteFile(filepath.Join(mw.dir, "export_dir.txt"), []byte(destSearchBoxText+"\r\n"), 0666)
	_ = ioutil.WriteFile(filepath.Join(mw.dir, "import_dir.txt"), []byte(sourceSearchBoxText+"\r\n"), 0666)

	if !strings.Contains(transSearchBoxText, ".xlsx") {
		walk.MsgBox(mw, "エラー", "翻訳ファイルはxlsx形式のものを選んでください", walk.MsgBoxOKCancel)
		return
	}

	files, err := ioutil.ReadDir(sourceSearchBoxText)
	if err != nil {
		walk.MsgBox(mw, "エラー", "元データフォルダを読めませんでした", walk.MsgBoxOKCancel)
		return
	}

	excel, err1 := xlsx.OpenFile(transSearchBoxText)
	if err1 != nil {
		walk.MsgBox(mw, "エラー", "Excelファイルを開けませんでした", walk.MsgBoxOKCancel)
		return
	}

	for _, fileInfo := range files {
		sourcePath := filepath.Join(sourceSearchBoxText, fileInfo.Name())
		sourceName := fileInfo.Name()
		if !strings.HasSuffix(strings.ToLower(sourceName), ".json") {
			continue
		}
		sourceName = strings.TrimSuffix(sourceName, filepath.Ext(sourceName))
		if sourceName == "Scripts" {
			walk.MsgBox(mw, "エラー", "このゲームデータは翻訳しないでください。"+sourceName+".rvdata2", walk.MsgBoxOKCancel)
			return
		}

		outputName := sourceName
		sheetName := sourceName
		if mw.selectExcelSheetName.Text() != "" {
			sheetName = mw.selectExcelSheetName.Text()
		}

		sheetNum := -1
		for index, sheet := range excel.Sheets {
			if sheet.Name == sheetName {
				fmt.Println("Excelシートの存在確認: " + sheet.Name)
				sheetNum = index
				break
			}
		}
		if sheetNum < 0 {
			walk.MsgBox(mw, "エラー", "error: 与えられた名前のExcelシートはありません。"+sheetName, walk.MsgBoxOKCancel)
			return
		}

		transMap := map[string]string{}
		for _, row := range excel.Sheets[sheetNum].Rows {
			if len(row.Cells) < 2 {
				continue
			}
			key := row.Cells[0].String()
			value := row.Cells[1].String()
			if key == "" {
				continue
			}
			transMap[key] = value
		}

		jsonBytes, err := ioutil.ReadFile(sourcePath)
		if err != nil {
			walk.MsgBox(mw, "エラー", "一時フォルダからjsonファイルを読み込ませんでした", walk.MsgBoxOKCancel)
			return
		}

		maxOneLine := 50
		if strings.Contains(sheetName, "Map") || strings.Contains(sheetName, "Common") ||
			strings.Contains(outputName, "Map") || strings.Contains(outputName, "Common") {
			maxOneLine = 59
		}

		sourceStr, replacedKeys, skippedLong, unmatched := replace.ApplyTranslations(string(jsonBytes), transMap, maxOneLine)
		for _, key := range skippedLong {
			fmt.Println("改行3回以上必要（スキップ）: " + key + " => " + transMap[key])
		}
		fmt.Printf("%s: replaced=%d skippedLong=%d unmatched=%d\n", outputName, len(replacedKeys), len(skippedLong), len(unmatched))

		if err := replace.ValidateJSON(sourceStr); err != nil {
			walk.MsgBox(mw, "エラー", "差し替え結果が不正なJSONになりました: "+err.Error(), walk.MsgBoxOKCancel)
			return
		}

		if err := os.MkdirAll(filepath.Join(destSearchBoxText, "未翻訳"), 0777); err != nil {
			walk.MsgBox(mw, "エラー", "未翻訳フォルダを作成できませんでした", walk.MsgBoxOKCancel)
			return
		}

		outJSONPath := filepath.Join(destSearchBoxText, outputName+".json")
		_ = os.Remove(outJSONPath)
		transFile, err := os.OpenFile(outJSONPath, os.O_RDWR|os.O_CREATE|os.O_EXCL, 0666)
		if err != nil {
			walk.MsgBox(mw, "エラー", "既に保存するべきファイルが存在するため実行できません", walk.MsgBoxOKCancel)
			log.Fatal(err)
		}
		fmt.Fprintln(transFile, sourceStr)
		transFile.Close()

		untransText := "日本語 : 英語 \r\n"
		for _, key := range unmatched {
			untransText += key + ":" + transMap[key] + "\r\n"
		}
		for _, key := range skippedLong {
			untransText += key + ":" + transMap[key] + "\r\n"
		}

		untransPath := filepath.Join(destSearchBoxText, "未翻訳", outputName+"未翻訳ver.txt")
		_ = os.Remove(untransPath)
		untransFile, err := os.OpenFile(untransPath, os.O_RDWR|os.O_CREATE|os.O_EXCL, 0666)
		if err != nil {
			walk.MsgBox(mw, "エラー", "既に保存するべきファイルが存在するため実行できません", walk.MsgBoxOKCancel)
			log.Fatal(err)
		}
		fmt.Println("----------未翻訳-----------------")
		fmt.Println(untransText)
		fmt.Println("---------------------------------")
		fmt.Fprintln(untransFile, untransText)
		untransFile.Close()

		transJSONBytes, err := ioutil.ReadFile(outJSONPath)
		if err != nil {
			walk.MsgBox(mw, "エラー", "翻訳済みのjsonファイルを読み込ませんでした", walk.MsgBoxOKCancel)
			return
		}

		japaneseKey := "\"" + ".*([ぁ-ん]*[ァ-ヶ]*[亜-熙])+.*" + "\""
		japanesePattern := regexp.MustCompile(japaneseKey)
		foobar := japanesePattern.FindAllStringSubmatch(string(transJSONBytes), -1)
		foobarText := ""
		for index := range foobar {
			foobarText += foobar[index][0] + " \r\n"
		}
		if e := os.MkdirAll(filepath.Join(destSearchBoxText, "未翻訳ver2"), 0777); e != nil {
			walk.MsgBox(mw, "エラー", "未翻訳フォルダver2を作成できませんでした", walk.MsgBoxOKCancel)
			return
		}

		foobarPath := filepath.Join(destSearchBoxText, "未翻訳ver2", outputName+"未翻訳ver.txt")
		_ = os.Remove(foobarPath)
		foobarFile, err := os.OpenFile(foobarPath, os.O_RDWR|os.O_CREATE|os.O_EXCL, 0666)
		if err != nil {
			walk.MsgBox(mw, "エラー", "既に保存するべきファイルが存在するため実行できません", walk.MsgBoxOKCancel)
			log.Fatal(err)
		}
		fmt.Fprintln(foobarFile, foobarText)
		foobarFile.Close()
	}

	walk.MsgBox(mw, "完了", "処理が完了しました", walk.MsgBoxOKCancel)
}
