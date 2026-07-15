DB_UIComposer Samples Guide
Version: 0.4.27

このフォルダのサンプルは、カテゴリ別に細分化した「標準構成の見本」です。
特にレイヤー順（背景を後ろ、内容を中間、ガイドを前面）を明示し、
前後関係で迷いにくい構成へ再編しています。

------------------------------------------------------------
■ 推奨閲覧順（scene）
------------------------------------------------------------
1) scenes/01_Layering_Basics.scene
   - 背景 / 本文 / ガイド の前後関係の基本
   - zOrder と「ウィンドウ配列順」を確認

2) scenes/02_Text_Log_Basics.scene
   - text / log の最小実用例
   - 複数行、行高さ、ログ領域の調整

3) scenes/03_Gauge_Directions.scene
   - 横/縦/円ゲージと方向設定の比較
   - 反時計回り円ゲージと開始角度の確認

4) scenes/04_Image_Composite_Basics.scene
   - image / compositeImage の基本構成
   - 統合画像パーツの最小テンプレート

5) scenes/05_Button_Choice_Basics.scene
   - button / choiceList / imageChoiceList の基本
   - メニューUI系カテゴリの学習用

------------------------------------------------------------
■ 単体サンプル（group / window / parts）
------------------------------------------------------------
- groups/Layering_Background.group
  背景→内容→前面ガイドの並びをグループ単位で再利用

- groups/Gauge_Comparison.group
  ゲージ比較ブロックをそのまま再利用

- windows/Text_Log_Tutorial.window
  テキストとログ調整を1ウィンドウで試せる構成

- windows/Button_Choice_Tutorial.window
  ボタンと選択肢カテゴリをまとめた構成

- parts/Circle_Gauge_Basic.parts
  円ゲージ単体の最小構成

- parts/Log_Block_Basic.parts
  ログパーツ単体の最小構成

- parts/Choice_List_Basic.parts
  choiceList単体の最小構成

- parts/Image_Choice_List_Basic.parts
  imageChoiceList単体の最小構成

------------------------------------------------------------
■ 運用メモ
------------------------------------------------------------
- まず scene でカテゴリ挙動を確認し、必要部分を group/window/parts として再利用してください。
- 本番向けには、ガイド文言を削除またはガイドグループを非表示にしてください。
- 画像系は画像未指定でも動作確認できるよう、空状態の説明表示を残しています。
