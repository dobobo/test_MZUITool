/*:
 * @target MZ
 * @plugindesc v0.4.63 JSONレイアウトからマップ上UIウィンドウを再現する汎用UIコンポーザー
 * @author DB / ChatGPT
 * @url 
 *
 * @help DB_UIComposer.js
 * ----------------------------------------------------------------------------
 * ■ 概要
 * ----------------------------------------------------------------------------
 * 外部配置ツールで作成したJSONレイアウトを読み込み、
 * マップシーン上にウィンドウ、テキスト、画像、ゲージ、簡易ボタンを表示します。
 *
 * v0.4.05では、一覧ドラッグの末尾ドロップ判定を追加し、移動先が直感的になるよう改善しています。
 * v0.4.06では、同梱サンプルを説明重視の構成に更新し、学習しやすさを向上しています。
 * v0.4.07では、末尾移動の判定を専用行ではなく行下端の境界判定へ変更し、レイヤー操作に近い体験へ調整しています。
 * v0.4.08では、グループ/ウィンドウ行の中央ドロップを無効化し、上下境界帯のみ有効なレイヤー式判定へ調整しています。
 * v0.4.09では、ウィンドウ移動時に他ウィンドウ配下のパーツ行の上下枠へドロップできる判定を追加しています。
 * v0.4.10では、グループ移動時にもウィンドウ/パーツ行の上下枠ドロップで並び替えできるよう調整しています。
 * v0.4.11では、一覧左端のドラッグハンドルを廃止し、行ドラッグのみで操作できるよう整理しています。
 * v0.4.12では、別枠オブジェクト一覧でもグループ/ウィンドウ移動のドロップ判定をメイン一覧と同等に調整しています。
 * v0.4.13では、ツール画面のバージョン表示を最新版へ同期し、一覧の選択ハイライトを常時見やすく強化しています。
 * v0.4.14では、ドラッグ開始時に対象行を自動選択することで、選択状態と移動判定の挙動を統一しています。
 * v0.4.15では、プレビュー上のテキスト/ログをダブルクリックで直接編集できるようにしています。
 * v0.4.16では、重なり時のダブルクリック優先度を調整し、選択中テキストの直接編集を優先するようにしています。
 * v0.4.17では、円ゲージの反時計回り描画ロジックを修正し、表示崩れを防いでいます。
 * v0.4.18では、プレビュー上の直接文字編集を見た目・レイアウトに馴染む表示へ調整しています。
 * v0.4.19では、円ゲージ画像レイヤーの反映と開始角度設定（既定0度）に対応しています。
 * v0.4.20では、プレビュー直接文字編集中に元文字が残らないよう表示を調整しています。
 * v0.4.21では、プレビュー文字編集中のアウトライン残りを解消するためストローク描画を抑制しています。
 * v0.4.22では、ゲージ/画像ボタンの画像読込時に原寸反映し、画像系リサイズの比率固定挙動を統一しています。
 * v0.4.23では、重なり画像の最大サイズを下回らないよう画像読込時のサイズ反映を調整しています。
 * v0.4.24では、画像系パーツにサイズ％入力と原寸へ戻すボタンを追加し、幅/高さと連動するよう調整しています。
 * v0.4.25では、Ctrl+X/C/V の切り取り・コピー・貼り付けショートカットを一覧操作に対応しています。
 * v0.4.26では、プレビュー直接文字編集中に改行時の元文字残像が重ならないよう描画を修正しています。
 * v0.4.27では、同梱サンプルをカテゴリ別に再構成し、背景を背面へ置く標準レイヤー順へ整理しています。
 * v0.4.28では、一覧のグループ/ウィンドウ順と前後関係が一致するよう、描画順同期の向きを修正しています。
 * v0.4.29では、一覧仕様をPhotoshop式（上ほど手前）へ戻し、サンプルの並び順を同仕様に合わせて調整しています。
 * v0.4.30では、左メニューへシーン削除を追加し、削除時に所属グループ/ウィンドウ/パーツも一括削除する仕様にしています。
 * v0.4.31では、ウィンドウ選択時のログプロパティ表示を廃止し、ログ設定はログパーツ側へ統一しています。
 * v0.4.32では、ログの縁取り幅が確実に反映されるよう、ログ描画時の文字スタイル適用順を修正しています。
 * v0.4.33では、プロパティUIの視認性を整理し、表示/ロック切替をアイコン化、表示名/要素IDの上部固定、原寸復帰の即時反映を行っています。
 * v0.4.34では、グループ/ウィンドウ/パーツの「基本」折りたたみを廃止し、名前系入力を折りたたみ外の上部へ統一配置しています。
 * v0.4.35では、パーツ移動開始時にフォーカス中パーツのドラッグを優先し、クリック確定をマウスボタン解放時へ変更しています。
 * v0.4.36では、円ゲージの開始角度基準を0度=右方向へ統一し、円ゲージ画像の不要な円形クリップを解消しています。
 * v0.4.37では、プレビューの右クリック対象決定でフォーカス中パーツを優先し、手前パーツへの誤吸着を抑制しています。
 * v0.4.38では、円ゲージ開始角度の実機基準をツール表示と一致する基準へ再調整しています。
 * v0.4.39では、複合画像はゲーム内で一枚絵（書き出しPNG）を優先表示し、レイヤー個別描画へのフォールバックを抑制しています。
 * v0.4.40では、複合画像追加時にPSD/名前ID選択ダイアログを優先表示し、未登録時はプリセット管理へ誘導する導線へ統一しています。
 * v0.4.41では、統合画像プリセット挿入ウィンドウの更新/挿入ボタンをヘッダーへ移動し、操作導線を改善しています。
 * v0.4.42では、複合画像プリセット適用時に実機用の書き出しPNG参照を自動補完し、表示欠落を起こしにくくしています。
 * v0.4.43では、カタログJS生成時の特殊文字エスケープを強化し、名前変更後の折りたたみ状態が意図せず変わる問題を抑制しています。
 * v0.4.44では、一覧で文字編集中のドラッグ移動を抑止し、一覧クリック時の自動センタースクロールを停止しています。
 * v0.4.45では、複合画像の書き出しPNG参照時に folder/fileName の参照元を一致させ、実機での画像未表示を抑制しています。
 * v0.4.46では、ツール側でMZ出力時の複合画像自動書き出し確認を強化し、未書き出しによる実機表示漏れを起こしにくくしています。
 * v0.4.47では、サンプル管理を基礎編/応用編へ整理し、編集保存とバックアップ初期化の導線を強化しています。
 * v0.4.48では、文字/ゲージにデータベース参照カテゴリを追加し、段階選択と更新タイミング（毎フレーム/手動/表示時）に対応しています。
 * v0.4.49では、アクターの名前/二つ名/プロフィール/職業名のプレビュー仮値が項目名そのものになる問題を修正しています。
 * v0.4.50では、データベースID指定を一覧選択ダイアログ化し、プロジェクトのdataから名前付きで選べるようにしています。
 * v0.4.51では、アイテム等のデータベース参照プレビューが実データを表示するよう修正し、ID=0の表示不整合も解消しています。
 * v0.4.52では、データベース参照のIDキー解決不具合を修正し、アクター一覧選択が常にID1になる問題を解消しています。
 * v0.4.53では、プレビュー用ヘルパー名の不一致による描画エラーを修正対象としました。
 * v0.4.54では、previewDatabaseObjectProp の関数名不一致を修正し、アイテム等への切替プレビューエラーを解消しています。
 * v0.4.55では、データベース参照の「接頭語」表記へ変更し、接頭語/接尾語の連続編集が反映されない不具合を修正しています。
 * v0.4.56では、データベース参照の項目選択を別ウィンドウ一覧化し、接尾語表記を統一しています。
 * v0.4.57では、データベース項目一覧を種類別に整理し、人が分かる日本語名で選べるよう改善しています。
 * v0.4.58では、ゲージのデータベース参照UIが『値』セクション内に見えるよう修正しています。
 * v0.4.59では、データベースのアイコン番号を実際のアイコン表示（\I[n]）へ対応し、drawText系でも描画できるよう改善しています。
 * v0.4.60では、用語のコマンド名を配列indexで正しく取得できるよう修正し、日本語名の一覧選択に対応しています。
 * v0.4.61では、データベース一覧選択を専用アイコンボタン化し、項目右側へ配置しています。
 * v0.4.62では、ピクチャ読込ボタンを専用アイコン化し、プロパティ項目の右側へ配置しています。
 * v0.4.63では、データベース項目一覧に現在値とデフォルト値を表示するよう改善しています。
 * 配置編集は同梱の DB_UIComposer_Tool/index.html で行います。
 *
 * ----------------------------------------------------------------------------
 * ■ 基本運用
 * ----------------------------------------------------------------------------
 * 1. DB_UIComposer_Tool/index.html をブラウザで開く
 * 2. プレビュー上でウィンドウやテキストを配置する
 * 3. 「MZスクリプトをコピー」を押す
 * 4. RPGツクールMZのイベントコマンド「スクリプト」に貼り付けて実行する
 *
 * もしくは JSON を data/uiLayouts/ に保存し、LoadLayoutFile コマンドで読み込みます。
 *
 * ----------------------------------------------------------------------------
 * ■ レイアウトJSON例
 * ----------------------------------------------------------------------------
 * {
 *   "layoutId": "TestMapUI",
 *   "windows": [
 *     {
 *       "id": "statusWindow",
 *       "x": 20,
 *       "y": 20,
 *       "width": 300,
 *       "height": 120,
 *       "opacity": 220,
 *       "layer": "mapUi",
 *       "frameVisible": true,
 *       "backgroundType": "normal",
 *       "items": [
 *         {
 *           "type": "text",
 *           "id": "titleText",
 *           "x": 16,
 *           "y": 12,
 *           "text": "ステータス",
 *           "fontSize": 22
 *         }
 *       ]
 *     }
 *   ]
 * }
 *
 * ----------------------------------------------------------------------------
 * ■ レイヤー
 * ----------------------------------------------------------------------------
 * mapUi:
 *   マップより手前、通常ウィンドウより後ろに表示します。
 *
 * messageAbove:
 *   通常ウィンドウより手前に表示します。
 *
 * overlay:
 *   messageAbove と同等です。将来拡張用です。
 *
 * ----------------------------------------------------------------------------
 * ■ 注意
 * ----------------------------------------------------------------------------
 * ・このプラグインはマップシーン用です。
 * ・ブラウザツールのプレビューとMZ実機のフォント表示は完全一致しない場合があります。
 * ・大量の要素を毎フレーム更新する用途ではなく、値変更時または定期チェックで再描画します。
 * ・ボタンのscript実行は制作中の自分用UI向けです。外部入力を入れないでください。
 *
 * ----------------------------------------------------------------------------
 * ■ プラグインコマンド
 * ----------------------------------------------------------------------------
 * 以下のコマンドを使用できます。
 *
 * @param DefaultLayoutId
 * @text デフォルトレイアウトID
 * @type string
 * @default DefaultLayout
 *
 * @param AutoReapplyOnMapStart
 * @text マップ開始時に再適用
 * @type boolean
 * @default true
 *
 * @param DebugLog
 * @text デバッグログ
 * @type boolean
 * @default false
 *
 * @command ApplyLayoutJson
 * @text JSONから一括配置
 * @desc レイアウトJSON文字列からUIを一括作成します。
 *
 * @arg json
 * @text JSON
 * @type multiline_string
 * @desc 外部ツールから出力したレイアウトJSON文字列。
 * @default {}
 *
 * @arg clearBefore
 * @text 既存UIを消してから配置
 * @type boolean
 * @default true
 *
 * @command LoadLayoutFile
 * @text JSONファイルから一括配置
 * @desc data/uiLayouts/ 内のJSONファイルからUIを一括作成します。
 *
 * @arg fileName
 * @text ファイル名
 * @type string
 * @desc 例: MainMapUI.json
 * @default MainMapUI.json
 *
 * @arg clearBefore
 * @text 既存UIを消してから配置
 * @type boolean
 * @default true
 *
 * @command SetDebugLog
 * @text デバッグログ切替
 * @desc MZ実機側のDB_UIComposerデバッグログをON/OFFします。
 *
 * @arg enabled
 * @text ログを出す
 * @type boolean
 * @default true
 *
 * @command DumpDebugInfo
 * @text デバッグ情報出力
 * @desc 現在保持しているレイアウト、ウィンドウ、パーツ情報をコンソールへ出力します。
 *
 * @command RefreshDatabaseBindings
 * @text データベース参照の手動更新
 * @desc データベース更新タイミングを「プラグインコマンド更新」にしたパーツを手動更新します。
 *
 * @arg layoutId
 * @text レイアウトID（空で全体）
 * @type string
 * @default
 *
 * @arg windowId
 * @text ウィンドウID（空で対象レイアウト全体）
 * @type string
 * @default
 *
 * @arg itemId
 * @text パーツID（空で対象ウィンドウ全体）
 * @type string
 * @default
 *
 * @command AddLogText
 * @text ログを1行追加
 * @desc 指定ウィンドウへログ文字列を追加します。\V[n]や\C[n]などの制御文字に対応します。
 *
 * @arg layoutId
 * @text レイアウトID
 * @type string
 * @default DefaultLayout
 *
 * @arg windowId
 * @text ログウィンドウID
 * @type string
 * @default LogWindow
 *
 * @arg text
 * @text 追加するログ
 * @type multiline_string
 * @default ログを追加しました。
 *
 * @arg maxLines
 * @text 最大保持行数
 * @type number
 * @min 1
 * @default 200
 *
 * @arg scrollToBottom
 * @text 追加後に一番下へスクロール
 * @type boolean
 * @default true
 *
 * @command ClearLog
 * @text ログを消去
 * @desc 指定ウィンドウのログをすべて消去します。
 *
 * @arg layoutId
 * @text レイアウトID
 * @type string
 * @default DefaultLayout
 *
 * @arg windowId
 * @text ログウィンドウID
 * @type string
 * @default LogWindow
 *
 * @command SetLogScroll
 * @text ログスクロール位置変更
 * @desc 指定ウィンドウのログスクロール位置を変更します。0が一番上です。
 *
 * @arg layoutId
 * @text レイアウトID
 * @type string
 * @default DefaultLayout
 *
 * @arg windowId
 * @text ログウィンドウID
 * @type string
 * @default LogWindow
 *
 * @arg scrollY
 * @text スクロールY
 * @type number
 * @min 0
 * @default 0
 *
 * @command ClearAll
 * @text すべて削除
 * @desc このプラグインで作成したUIをすべて削除します。
 *
 * @command ShowLayout
 * @text レイアウト表示
 * @desc 指定レイアウトを表示状態にします。
 *
 * @arg layoutId
 * @text レイアウトID
 * @type string
 * @default DefaultLayout
 *
 * @command HideLayout
 * @text レイアウト非表示
 * @desc 指定レイアウトを非表示状態にします。
 *
 * @arg layoutId
 * @text レイアウトID
 * @type string
 * @default DefaultLayout
 *
 * @command SetWindowVisible
 * @text ウィンドウ表示切替
 * @desc 指定ウィンドウだけ表示/非表示を切り替えます。layoutId指定時は実行時状態として保存されます。
 *
 * @arg layoutId
 * @text レイアウトID（任意）
 * @type string
 * @default 
 *
 * @arg windowId
 * @text ウィンドウID
 * @type string
 * @default window1
 *
 * @arg visible
 * @text 表示する
 * @type boolean
 * @default true
 *
 * @command SetChoiceList
 * @text カスタマイズ選択肢更新
 * @desc カスタマイズ選択肢を作成/更新します。シンプル選択肢の内部内容は変更しません。
 *
 * @arg layoutId
 * @text レイアウトID
 * @type string
 * @default DefaultLayout
 *
 * @arg windowId
 * @text ウィンドウID
 * @type string
 * @default window1
 *
 * @arg itemId
 * @text 選択肢パーツID
 * @type string
 * @default choiceList1
 *
 * @arg choiceRules
 * @text 選択肢条件リスト
 * @type struct<DBUiChoiceRule>[]
 * @desc 選択肢本文・条件・表示状態をリストで設定します。空ならツール側テンプレートを使用します。
 * @default []
 *
 * @arg closeWindowOnSelect
 * @text 選択後にウィンドウを削除
 * @type boolean
 * @default false
 *
 * @arg width
 * @text 幅
 * @type number
 * @min 0
 * @default 0
 * @desc 0ならツール側テンプレート設定を維持し、1以上ならコマンド値で上書きします。
 *
 * @arg rowHeight
 * @text 1項目の高さ
 * @type number
 * @min 0
 * @default 0
 *
 * @arg maxVisibleRows
 * @text 最大表示数
 * @type number
 * @min 0
 * @default 0
 *
 * @arg autoResizeWindow
 * @text 選択肢数でウィンドウ高さ変更
 * @type boolean
 * @default true
 *
 * @arg resultVariableId
 * @text 結果を入れる変数ID
 * @type variable
 * @default 0
 *
 * @arg resultTextVariableId
 * @text 選択文字を入れる変数ID
 * @type variable
 * @default 0
 *
 * @arg commonEventId
 * @text 選択時コモンイベントID
 * @type common_event
 * @default 0
 *
 * @arg script
 * @text 選択時スクリプト
 * @type multiline_string
 * @default
 *
 * @command SetWindowInputEnabled
 * @text ウィンドウ入力有効切替
 * @desc 指定ウィンドウ内のボタン/選択肢クリックを有効・無効にします。表示は維持されます。
 *
 * @arg layoutId
 * @text レイアウトID
 * @type string
 * @default DefaultLayout
 *
 * @arg windowId
 * @text ウィンドウID
 * @type string
 * @default window1
 *
 * @arg enabled
 * @text 入力有効
 * @type boolean
 * @default true
 *
 * @command CreateWindow
 * @text ウィンドウ作成/更新
 * @desc 単体のウィンドウを作成または更新します。
 *
 * @arg layoutId
 * @text レイアウトID
 * @type string
 * @default DefaultLayout
 *
 * @arg windowId
 * @text ウィンドウID
 * @type string
 * @default window1
 *
 * @arg x
 * @text X座標
 * @type number
 * @min -9999
 * @default 20
 *
 * @arg y
 * @text Y座標
 * @type number
 * @min -9999
 * @default 20
 *
 * @arg width
 * @text 幅
 * @type number
 * @min 1
 * @default 300
 *
 * @arg height
 * @text 高さ
 * @type number
 * @min 1
 * @default 120
 *
 * @arg layer
 * @text レイヤー
 * @type select
 * @option mapUi
 * @option messageAbove
 * @option overlay
 * @default mapUi
 *
 * @arg zOrder
 * @text 表示順
 * @type number
 * @min -9999
 * @default 0
 *
 * @arg visible
 * @text 表示する
 * @type boolean
 * @default true
 *
 * @arg opacity
 * @text ウィンドウ透明度
 * @type number
 * @min 0
 * @max 255
 * @default 255
 *
 * @arg contentsOpacity
 * @text 内容透明度
 * @type number
 * @min 0
 * @max 255
 * @default 255
 *
 * @arg frameVisible
 * @text 枠表示
 * @type boolean
 * @default true
 *
 * @arg backgroundType
 * @text 背景タイプ
 * @type select
 * @option normal
 * @option dim
 * @option transparent
 * @default normal
 *
 * @arg backgroundImageEnabled
 * @text 背景画像を使う
 * @type boolean
 * @default false
 *
 * @arg backgroundImageFolder
 * @text 背景画像フォルダ
 * @type select
 * @option pictures
 * @option system
 * @option faces
 * @option enemies
 * @option sv_actors
 * @option sv_enemies
 * @default pictures
 *
 * @arg backgroundImageFileName
 * @text 背景画像ファイル名
 * @type string
 * @default 
 * @desc 拡張子なし。例: img/pictures/Back.png → Back
 *
 * @arg backgroundImageMode
 * @text 背景画像表示方法
 * @type select
 * @option stretch
 * @option cover
 * @option contain
 * @option tile
 * @default stretch
 *
 * @arg backgroundImageOpacity
 * @text 背景画像透明度
 * @type number
 * @min 0
 * @max 255
 * @default 255
 *
 * @arg backgroundImageZOrder
 * @text 背景画像表示順
 * @type number
 * @min -9999
 * @default -100
 *
 * @arg placementExtendLeft
 * @text 配置範囲 左へ拡張
 * @type number
 * @min 0
 * @default 0
 *
 * @arg placementExtendTop
 * @text 配置範囲 上へ拡張
 * @type number
 * @min 0
 * @default 0
 *
 * @arg placementExtendRight
 * @text 配置範囲 右へ拡張
 * @type number
 * @min 0
 * @default 0
 *
 * @arg placementExtendBottom
 * @text 配置範囲 下へ拡張
 * @type number
 * @min 0
 * @default 0
 *
 * @arg decorationImageEnabled
 * @text 装飾画像を使う
 * @type boolean
 * @default false
 *
 * @arg decorationImageFolder
 * @text 装飾画像フォルダ
 * @type select
 * @option pictures
 * @option system
 * @option faces
 * @option enemies
 * @option sv_actors
 * @option sv_enemies
 * @default system
 *
 * @arg decorationImageFileName
 * @text 装飾画像ファイル名
 * @type string
 * @default 
 * @desc 拡張子なし。例: img/system/Frame.png → Frame
 *
 * @arg decorationImageMode
 * @text 装飾画像表示方法
 * @type select
 * @option stretch
 * @option cover
 * @option contain
 * @option tile
 * @default stretch
 *
 * @arg decorationImageOpacity
 * @text 装飾画像透明度
 * @type number
 * @min 0
 * @max 255
 * @default 255
 *
 * @arg decorationImageZOrder
 * @text 装飾画像表示順
 * @type number
 * @min -9999
 * @default 100
 *
 * @command RemoveWindow
 * @text ウィンドウ削除
 * @desc 指定ウィンドウを削除します。
 *
 * @arg windowId
 * @text ウィンドウID
 * @type string
 * @default window1
 *
 * @command AddText
 * @text テキスト追加/更新
 * @desc 指定ウィンドウ内にテキスト要素を追加または更新します。
 *
 * @arg windowId
 * @text ウィンドウID
 * @type string
 * @default window1
 *
 * @arg itemId
 * @text 要素ID
 * @type string
 * @default text1
 *
 * @arg x
 * @text 内部X座標
 * @type number
 * @min -9999
 * @default 16
 *
 * @arg y
 * @text 内部Y座標
 * @type number
 * @min -9999
 * @default 12
 *
 * @arg zOrder
 * @text パーツ表示順
 * @type number
 * @min -9999
 * @default 0
 *
 * @arg visible
 * @text パーツ表示
 * @type boolean
 * @default true
 *
 * @arg allowOutsideWindow
 * @text ウィンドウ外描画
 * @type boolean
 * @default false
 * @desc ONにすると、ウィンドウ本体からはみ出した部分も描画します。OFFではウィンドウ矩形外を隠します。
 *
 * @arg width
 * @text 表示幅
 * @type number
 * @min 0
 * @default 0
 * @desc 0の場合は自動扱いです。
 *
 * @arg text
 * @text 表示文字
 * @type multiline_string
 * @default テキスト
 *
 * @arg fontSize
 * @text 文字サイズ
 * @type number
 * @min 1
 * @default 22
 *
 * @arg color
 * @text 文字色
 * @type string
 * @default 
 * @desc 例: #ffffff。空欄なら通常色。
 *
 * @arg align
 * @text 横揃え
 * @type select
 * @option left
 * @option center
 * @option right
 * @default left
 *
 * @command AddImage
 * @text 画像追加/更新
 * @desc 指定ウィンドウ内に画像要素を追加または更新します。
 *
 * @arg windowId
 * @text ウィンドウID
 * @type string
 * @default window1
 *
 * @arg itemId
 * @text 要素ID
 * @type string
 * @default image1
 *
 * @arg x
 * @text 内部X座標
 * @type number
 * @min -9999
 * @default 16
 *
 * @arg y
 * @text 内部Y座標
 * @type number
 * @min -9999
 * @default 16
 *
 * @arg zOrder
 * @text パーツ表示順
 * @type number
 * @min -9999
 * @default 0
 *
 * @arg visible
 * @text パーツ表示
 * @type boolean
 * @default true
 *
 * @arg allowOutsideWindow
 * @text ウィンドウ外描画
 * @type boolean
 * @default false
 * @desc ONにすると、ウィンドウ本体からはみ出した部分も描画します。OFFではウィンドウ矩形外を隠します。
 *
 * @arg folder
 * @text 画像フォルダ
 * @type select
 * @option pictures
 * @option system
 * @option faces
 * @option enemies
 * @option sv_actors
 * @option sv_enemies
 * @default pictures
 *
 * @arg fileName
 * @text 画像ファイル名
 * @type file
 * @dir img/pictures
 * @default 
 *
 * @arg scaleX
 * @text X拡大率（%）
 * @type number
 * @decimals 2
 * @default 100
 *
 * @arg scaleY
 * @text Y拡大率（%）
 * @type number
 * @decimals 2
 * @default 100
 *
 * @arg opacity
 * @text 透明度
 * @type number
 * @min 0
 * @max 255
 * @default 255
 *
 * @command AddGauge
 * @text ゲージ追加/更新
 * @desc 指定ウィンドウ内にゲージ要素を追加または更新します。
 *
 * @arg windowId
 * @text ウィンドウID
 * @type string
 * @default window1
 *
 * @arg itemId
 * @text 要素ID
 * @type string
 * @default gauge1
 *
 * @arg x
 * @text 内部X座標
 * @type number
 * @min -9999
 * @default 16
 *
 * @arg y
 * @text 内部Y座標
 * @type number
 * @min -9999
 * @default 48
 *
 * @arg zOrder
 * @text パーツ表示順
 * @type number
 * @min -9999
 * @default 0
 *
 * @arg visible
 * @text パーツ表示
 * @type boolean
 * @default true
 *
 * @arg allowOutsideWindow
 * @text ウィンドウ外描画
 * @type boolean
 * @default false
 * @desc ONにすると、ウィンドウ本体からはみ出した部分も描画します。OFFではウィンドウ矩形外を隠します。
 *
 * @arg width
 * @text 幅
 * @type number
 * @min 1
 * @default 220
 *
 * @arg height
 * @text 高さ
 * @type number
 * @min 1
 * @default 14
 *
 * @arg gaugeShape
 * @text ゲージ種類
 * @type select
 * @option 横ゲージ
 * @value horizontal
 * @option 縦ゲージ
 * @value vertical
 * @option 円ゲージ
 * @value circle
 * @default horizontal
 *
 * @arg gaugeDirection
 * @text ゲージ方向
 * @type select
 * @option 左から右へ
 * @value leftToRight
 * @option 右から左へ
 * @value rightToLeft
 * @option 下から上へ
 * @value bottomToTop
 * @option 上から下へ
 * @value topToBottom
 * @option 時計回り
 * @value clockwise
 * @option 反時計回り
 * @value counterClockwise
 * @default leftToRight
 *
 * @arg valueType
 * @text 値タイプ
 * @type select
 * @option variable
 * @option actorHp
 * @option actorMp
 * @option actorTp
 * @option fixed
 * @default variable
 *
 * @arg valueVariableId
 * @text 現在値変数ID
 * @type variable
 * @default 1
 *
 * @arg maxVariableId
 * @text 最大値変数ID
 * @type variable
 * @default 2
 *
 * @arg actorId
 * @text アクターID
 * @type actor
 * @default 1
 *
 * @arg value
 * @text 固定現在値
 * @type number
 * @default 50
 *
 * @arg max
 * @text 固定最大値
 * @type number
 * @default 100
 *
 * @arg label
 * @text ラベル
 * @type string
 * @default 
 *
 * @arg color1
 * @text 色1
 * @type string
 * @default #ff6060
 *
 * @arg color2
 * @text 色2
 * @type string
 * @default #ffa0a0
 *
 * @command AddButton
 * @text ボタン追加/更新
 * @desc 指定ウィンドウ内に簡易ボタン要素を追加または更新します。
 *
 * @arg windowId
 * @text ウィンドウID
 * @type string
 * @default window1
 *
 * @arg itemId
 * @text 要素ID
 * @type string
 * @default button1
 *
 * @arg x
 * @text 内部X座標
 * @type number
 * @min -9999
 * @default 16
 *
 * @arg y
 * @text 内部Y座標
 * @type number
 * @min -9999
 * @default 72
 *
 * @arg zOrder
 * @text パーツ表示順
 * @type number
 * @min -9999
 * @default 0
 *
 * @arg visible
 * @text パーツ表示
 * @type boolean
 * @default true
 *
 * @arg allowOutsideWindow
 * @text ウィンドウ外描画
 * @type boolean
 * @default false
 * @desc ONにすると、ウィンドウ本体からはみ出した部分も描画します。OFFではウィンドウ矩形外を隠します。
 *
 * @arg width
 * @text 幅
 * @type number
 * @min 1
 * @default 120
 *
 * @arg height
 * @text 高さ
 * @type number
 * @min 1
 * @default 36
 *
 * @arg text
 * @text ボタン文字
 * @type string
 * @default OK
 *
 * @arg commonEventId
 * @text コモンイベントID
 * @type common_event
 * @default 0
 *
 * @arg switchId
 * @text ONにするスイッチID
 * @type switch
 * @default 0
 *
 * @arg variableId
 * @text 代入する変数ID
 * @type variable
 * @default 0
 *
 * @arg variableValue
 * @text 代入値
 * @type number
 * @min -999999
 * @default 0
 *
 * @arg script
 * @text 実行スクリプト
 * @type multiline_string
 * @default 
 *

 * @command SetWindowBackgroundImage
 * @text ウィンドウ背景画像変更
 * @desc 指定ウィンドウの背景画像を実行時状態として変更します。セーブ・ロード後も維持されます。
 *
 * @arg layoutId
 * @text レイアウトID
 * @type string
 * @default DefaultLayout
 *
 * @arg windowId
 * @text ウィンドウID
 * @type string
 * @default window1
 *
 * @arg enabled
 * @text 背景画像を使う
 * @type boolean
 * @default true
 *
 * @arg folder
 * @text 画像フォルダ
 * @type string
 * @desc img/からの相対フォルダ。例: pictures/ui または UI
 * @default pictures
 *
 * @arg fileName
 * @text 画像ファイル名
 * @type string
 * @desc 拡張子なし。例: windowBack
 * @default 
 *
 * @arg image
 * @text 画像パス（任意）
 * @type string
 * @desc folder/fileName形式。指定時はfolder/fileNameより優先します。例: UI/windowBack
 * @default 
 *
 * @arg mode
 * @text 表示方法
 * @type select
 * @option stretch
 * @option cover
 * @option contain
 * @option tile
 * @default stretch
 *
 * @arg opacity
 * @text 透明度
 * @type number
 * @min 0
 * @max 255
 * @default 255
 *
 * @arg zOrder
 * @text 表示順
 * @type number
 * @min -9999
 * @default -100
 *
 * @command SetWindowDecorationImage
 * @text ウィンドウ装飾画像変更
 * @desc 指定ウィンドウの装飾画像を実行時状態として変更します。セーブ・ロード後も維持されます。
 *
 * @arg layoutId
 * @text レイアウトID
 * @type string
 * @default DefaultLayout
 *
 * @arg windowId
 * @text ウィンドウID
 * @type string
 * @default window1
 *
 * @arg enabled
 * @text 装飾画像を使う
 * @type boolean
 * @default true
 *
 * @arg folder
 * @text 画像フォルダ
 * @type string
 * @desc img/からの相対フォルダ。例: pictures/ui または UI
 * @default system
 *
 * @arg fileName
 * @text 画像ファイル名
 * @type string
 * @desc 拡張子なし。例: windowFrame
 * @default 
 *
 * @arg image
 * @text 画像パス（任意）
 * @type string
 * @desc folder/fileName形式。指定時はfolder/fileNameより優先します。例: UI/windowFrame
 * @default 
 *
 * @arg mode
 * @text 表示方法
 * @type select
 * @option stretch
 * @option cover
 * @option contain
 * @option tile
 * @default stretch
 *
 * @arg opacity
 * @text 透明度
 * @type number
 * @min 0
 * @max 255
 * @default 255
 *
 * @arg zOrder
 * @text 表示順
 * @type number
 * @min -9999
 * @default 100
 *
 * @command SetItemText
 * @text パーツ文字変更
 * @desc 指定パーツの表示文字を実行時状態として変更します。セーブ・ロード後も維持されます。
 *
 * @arg layoutId
 * @text レイアウトID
 * @type string
 * @default DefaultLayout
 *
 * @arg windowId
 * @text ウィンドウID
 * @type string
 * @default window1
 *
 * @arg itemId
 * @text パーツID
 * @type string
 * @default text1
 *
 * @arg text
 * @text 表示文字
 * @type multiline_string
 * @default 
 *
 * @command AddItemLogText
 * @text ログパーツへ1行追加
 * @desc 文字カテゴリのログパーツへログを追加します。表示時間・フェード・移動時間はパーツ側設定を使用します。
 *
 * @arg layoutId
 * @text レイアウトID
 * @type string
 * @default DefaultLayout
 *
 * @arg windowId
 * @text ウィンドウID
 * @type string
 * @default window1
 *
 * @arg itemId
 * @text ログパーツID
 * @type string
 * @default log1
 *
 * @arg text
 * @text 追加するログ
 * @type multiline_string
 * @default ログを追加しました。
 *
 * @command ClearItemLog
 * @text ログパーツ消去
 * @desc 指定ログパーツの表示ログをすべて消去します。
 *
 * @arg layoutId
 * @text レイアウトID
 * @type string
 * @default DefaultLayout
 *
 * @arg windowId
 * @text ウィンドウID
 * @type string
 * @default window1
 *
 * @arg itemId
 * @text ログパーツID
 * @type string
 * @default log1
 *
 * @command SetItemImage
 * @text パーツ画像変更
 * @desc 指定画像パーツの画像を実行時状態として差し替えます。assetKeyが有効ならレイアウト内assetLibraryを優先して使います。
 *
 * @arg layoutId
 * @text レイアウトID
 * @type string
 * @default DefaultLayout
 *
 * @arg windowId
 * @text ウィンドウID
 * @type string
 * @default window1
 *
 * @arg itemId
 * @text パーツID
 * @type string
 * @default image1
 *
 * @arg folder
 * @text 画像フォルダ
 * @type string
 * @desc img/からの相対フォルダ。例: pictures/ui または UI
 * @default pictures
 *
 * @arg fileName
 * @text 画像ファイル名
 * @type string
 * @desc 拡張子なし。例: portrait_happy
 * @default 
 *
 * @arg assetKey
 * @text アセットキー（任意）
 * @type string
 * @desc レイアウトのassetLibraryに登録しているキー。指定時はfolder/fileNameより優先します。
 * @default 
 *
 * @command SetItemVisible
 * @text パーツ表示切替
 * @desc 指定パーツの表示/非表示を実行時状態として変更します。
 *
 * @arg layoutId
 * @text レイアウトID
 * @type string
 * @default DefaultLayout
 *
 * @arg windowId
 * @text ウィンドウID
 * @type string
 * @default window1
 *
 * @arg itemId
 * @text パーツID
 * @type string
 * @default item1
 *
 * @arg visible
 * @text 表示する
 * @type boolean
 * @default true
 *
 * @command SetItemOpacity
 * @text パーツ透明度変更
 * @desc 指定パーツの透明度を実行時状態として変更します。
 *
 * @arg layoutId
 * @text レイアウトID
 * @type string
 * @default DefaultLayout
 *
 * @arg windowId
 * @text ウィンドウID
 * @type string
 * @default window1
 *
 * @arg itemId
 * @text パーツID
 * @type string
 * @default item1
 *
 * @arg opacity
 * @text 透明度
 * @type number
 * @min 0
 * @max 255
 * @default 255
 *
 * @command SetItemZOrder
 * @text パーツ表示順変更
 * @desc 指定パーツの表示順を実行時状態として変更します。
 *
 * @arg layoutId
 * @text レイアウトID
 * @type string
 * @default DefaultLayout
 *
 * @arg windowId
 * @text ウィンドウID
 * @type string
 * @default window1
 *
 * @arg itemId
 * @text パーツID
 * @type string
 * @default item1
 *
 * @arg zOrder
 * @text 表示順
 * @type number
 * @min -9999
 * @default 0
 *
 * @command SetItemScale
 * @text パーツ拡大率変更
 * @desc 指定画像パーツの拡大率を実行時状態として変更します。
 *
 * @arg layoutId
 * @text レイアウトID
 * @type string
 * @default DefaultLayout
 *
 * @arg windowId
 * @text ウィンドウID
 * @type string
 * @default window1
 *
 * @arg itemId
 * @text パーツID
 * @type string
 * @default image1
 *
 * @arg scaleXPercent
 * @text X拡大率（%）
 * @type number
 * @min 1
 * @default 100
 *
 * @arg scaleYPercent
 * @text Y拡大率（%）
 * @type number
 * @min 1
 * @default 100
 *
 * @command SetItemPosition
 * @text パーツ座標変更
 * @desc 指定パーツの内部座標を実行時状態として変更します。
 *
 * @arg layoutId
 * @text レイアウトID
 * @type string
 * @default DefaultLayout
 *
 * @arg windowId
 * @text ウィンドウID
 * @type string
 * @default window1
 *
 * @arg itemId
 * @text パーツID
 * @type string
 * @default item1
 *
 * @arg x
 * @text 内部X
 * @type number
 * @min -9999
 * @default 0
 *
 * @arg y
 * @text 内部Y
 * @type number
 * @min -9999
 * @default 0
 *
 * @command MoveItem
 * @text パーツ移動
 * @desc 指定パーツを指定フレーム数で移動します。画像/統合画像は拡大率、対応パーツは透明度も変化できます。
 *
 * @arg layoutId
 * @text レイアウトID
 * @type string
 * @default DefaultLayout
 *
 * @arg windowId
 * @text ウィンドウID
 * @type string
 * @default window1
 *
 * @arg itemId
 * @text パーツID
 * @type string
 * @default item1
 *
 * @arg x
 * @text 移動先 内部X
 * @type number
 * @min -9999
 * @default 
 * @desc 空欄なら現在値を維持します。
 *
 * @arg y
 * @text 移動先 内部Y
 * @type number
 * @min -9999
 * @default 
 * @desc 空欄なら現在値を維持します。
 *
 * @arg scaleXPercent
 * @text 移動先 X拡大率（%）
 * @type number
 * @decimals 2
 * @min 0
 * @default 
 * @desc 空欄なら現在値を維持します。主に画像/統合画像向けです。
 *
 * @arg scaleYPercent
 * @text 移動先 Y拡大率（%）
 * @type number
 * @decimals 2
 * @min 0
 * @default 
 * @desc 空欄なら現在値を維持します。主に画像/統合画像向けです。
 *
 * @arg opacity
 * @text 移動先 透明度
 * @type number
 * @min 0
 * @max 255
 * @default 
 * @desc 空欄なら現在値を維持します。
 *
 * @arg duration
 * @text 時間（フレーム）
 * @type number
 * @min 0
 * @default 60
 *
 * @arg wait
 * @text 完了までウェイト
 * @type boolean
 * @default false
 *
 * @arg easing
 * @text イージング
 * @type select
 * @option 一定速度
 * @value linear
 * @option ゆっくり開始
 * @value easeIn
 * @option ゆっくり終了
 * @value easeOut
 * @option ゆっくり開始/終了
 * @value easeInOut
 * @default linear
 *
 * @command ResetItem
 * @text パーツ変更を初期化
 * @desc 指定パーツに対する実行時状態の変更だけを初期状態へ戻します。
 *
 * @arg layoutId
 * @text レイアウトID
 * @type string
 * @default DefaultLayout
 *
 * @arg windowId
 * @text ウィンドウID
 * @type string
 * @default window1
 *
 * @arg itemId
 * @text パーツID
 * @type string
 * @default item1
 *
 * @command ResetLayoutState
 * @text レイアウト変更を初期化
 * @desc 指定レイアウトに対する実行時状態の変更をすべて初期状態へ戻します。
 *
 * @arg layoutId
 * @text レイアウトID
 * @type string
 * @default DefaultLayout
 *
 * @command SetGroupVisible
 * @text グループ表示切替
 * @desc 指定グループに所属するウィンドウをまとめて表示/非表示します。
 *
 * @arg layoutId
 * @text レイアウトID
 * @type string
 * @default DefaultLayout
 *
 * @arg groupId
 * @text グループID
 * @type string
 * @default group1
 *
 * @arg visible
 * @text 表示する
 * @type boolean
 * @default true
 *
 * @command SetCompositeImageSet
 * @text 統合画像の構成変更
 * @desc 指定統合画像パーツのレイヤー構成をJSON文字列で差し替えます。
 *
 * @arg layoutId
 * @text レイアウトID
 * @type string
 * @default DefaultLayout
 *
 * @arg windowId
 * @text ウィンドウID
 * @type string
 * @default window1
 *
 * @arg itemId
 * @text 統合画像パーツID
 * @type string
 * @default compositeImage1
 *
 * @arg layersJson
 * @text レイヤーJSON
 * @type multiline_string
 * @default []
 *
 * @command FadeInCompositeImage
 * @text 統合画像フェードイン
 * @desc 指定統合画像パーツを表示し、透明から現在の不透明度へフェードインします。
 *
 * @arg layoutId
 * @text レイアウトID
 * @type string
 * @default DefaultLayout
 *
 * @arg windowId
 * @text ウィンドウID
 * @type string
 * @default window1
 *
 * @arg itemId
 * @text 統合画像パーツID
 * @type string
 * @default compositeImage1
 *
 * @arg visible
 * @text 表示してから開始
 * @type boolean
 * @default true
 *
 * @arg duration
 * @text フェード時間（フレーム）
 * @type number
 * @min 1
 * @default 30
 *
 * @command RemoveItem
 * @text 要素削除
 * @desc 指定ウィンドウ内の要素を削除します。
 *
 * @arg windowId
 * @text ウィンドウID
 * @type string
 * @default window1
 *
 * @arg itemId
 * @text 要素ID
 * @type string
 * @default text1
 *
 * @command ClearWindowItems
 * @text ウィンドウ内要素全削除
 * @desc 指定ウィンドウ内の要素をすべて削除します。
 *
 * @arg windowId
 * @text ウィンドウID
 * @type string
 * @default window1
 */

/*~struct~DBUiChoiceRule:
 * @param text
 * @text 選択肢本文
 * @type string
 * @desc この行に表示する選択肢の文字です。制御文字も使用できます。
 * @default 選択肢
 *
 * @param conditionType
 * @text 条件
 * @type select
 * @option 常に成立
 * @value always
 * @option スイッチON
 * @value switchOn
 * @option スイッチOFF
 * @value switchOff
 * @option 変数が指定値以上
 * @value variableGte
 * @option 変数が指定値以下
 * @value variableLte
 * @option 変数が指定値と同じ
 * @value variableEq
 * @option スクリプト条件
 * @value script
 * @default always
 *
 * @param switchId
 * @text スイッチID
 * @type switch
 * @default 0
 *
 * @param variableId
 * @text 変数ID
 * @type variable
 * @default 0
 *
 * @param compareValue
 * @text 比較値
 * @type number
 * @min -999999
 * @default 0
 *
 * @param script
 * @text 条件スクリプト
 * @type multiline_string
 * @desc trueなら条件成立。例: $gameVariables.value(1) >= 10
 * @default
 *
 * @param trueState
 * @text 成立時
 * @type select
 * @option 表示して選択可能
 * @value enabled
 * @option 表示するが選択不可
 * @value disabled
 * @option 非表示
 * @value hidden
 * @default enabled
 *
 * @param falseState
 * @text 不成立時
 * @type select
 * @option 表示して選択可能
 * @value enabled
 * @option 表示するが選択不可
 * @value disabled
 * @option 非表示
 * @value hidden
 * @default hidden
 */

(() => {
  "use strict";

  const PLUGIN_NAME = "DB_UIComposer";
  const params = PluginManager.parameters(PLUGIN_NAME);
  const DEFAULT_LAYOUT_ID = String(params.DefaultLayoutId || "DefaultLayout");
  const AUTO_REAPPLY = String(params.AutoReapplyOnMapStart || "true") === "true";
  const PARAM_DEBUG_LOG = String(params.DebugLog || "false") === "true";

  const isDebugEnabled = () => PARAM_DEBUG_LOG || !!($gameSystem && $gameSystem._dbUiComposerDebugLog);

  const log = (...args) => {
    if (isDebugEnabled()) console.log("[DB_UIComposer]", ...args);
  };

  const interactionLog = (...args) => {
    // クリック系は不具合調査で重要なため、DebugLogがOFFでもコンソールへ出します。
    // 出力はホバー毎フレームではなく、押下/選択などのイベント時に限定します。
    console.info("[DB_UIComposer][interaction]", ...args);
  };

  const toBool = (value, defaultValue = false) => {
    if (value === undefined || value === null || value === "") return defaultValue;
    if (typeof value === "boolean") return value;
    return String(value).toLowerCase() === "true";
  };

  const toNumber = (value, defaultValue = 0) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : defaultValue;
  };

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  const withDbUiImageSmoothing = (bitmap, callback) => {
    const ctx = bitmap && bitmap._context ? bitmap._context : null;
    if (!ctx) return callback();
    const oldEnabled = ctx.imageSmoothingEnabled;
    const oldQuality = ctx.imageSmoothingQuality;
    ctx.imageSmoothingEnabled = true;
    if ("imageSmoothingQuality" in ctx) ctx.imageSmoothingQuality = "high";
    try {
      return callback();
    } finally {
      ctx.imageSmoothingEnabled = oldEnabled;
      if (oldQuality !== undefined && "imageSmoothingQuality" in ctx) ctx.imageSmoothingQuality = oldQuality;
    }
  };

  const normalizeMZControlPrefix = text => String(text || "").replace(/[¥￥]/g, "\\");

  const _dbUiComposerRequestedFonts = new Set();

  const layoutFontInfo = settings => {
    const s = settings || {};
    const fileName = String(s.fontFileName || "").trim();
    const family = String(s.fontFace || (fileName ? "DB_UIComposer_LayoutFont" : "")).trim();
    return { family, fileName };
  };

  const cssFontName = family => {
    const text = String(family || "").trim();
    if (!text) return "";
    // カンマを含むfont stackはそのまま扱う。単一familyは引用してdocument.fonts.checkへ渡す。
    if (text.includes(",")) return text;
    return `"${text.replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"`;
  };

  const ensureLayoutFont = settings => {
    const info = layoutFontInfo(settings);
    if (!info.fileName) return info.family;
    const key = `${info.family}|${info.fileName}`;
    if (_dbUiComposerRequestedFonts.has(key)) return info.family;
    _dbUiComposerRequestedFonts.add(key);
    try {
      if (typeof FontManager !== "undefined" && FontManager.load) {
        FontManager.load(info.family, info.fileName);
      } else if (typeof Graphics !== "undefined" && Graphics.loadFont) {
        Graphics.loadFont(info.family, `fonts/${info.fileName}`);
      }
      log("request layout font", info);
    } catch (e) {
      console.warn("[DB_UIComposer] Font load failed", info.fileName, e);
    }
    return info.family;
  };

  const layoutFontReadyState = settings => {
    const info = layoutFontInfo(settings);
    if (!info.fileName) {
      return { ready: true, reason: "no-custom-font", family: info.family, fileName: "" };
    }
    ensureLayoutFont(settings);
    let fontManagerState = "";
    if (typeof FontManager !== "undefined" && FontManager._states) {
      fontManagerState = String(FontManager._states[info.family] || "");
      if (fontManagerState === "loading" || fontManagerState === "") {
        return { ready: false, reason: "fontmanager-loading", family: info.family, fileName: info.fileName, fontManagerState };
      }
      if (fontManagerState === "error") {
        return { ready: true, reason: "fontmanager-error-fallback", family: info.family, fileName: info.fileName, fontManagerState };
      }
    }
    let documentFontsCheck = null;
    if (typeof document !== "undefined" && document.fonts && document.fonts.check) {
      try {
        documentFontsCheck = document.fonts.check(`16px ${cssFontName(info.family)}`);
        if (!documentFontsCheck) {
          return { ready: false, reason: "document-fonts-not-ready", family: info.family, fileName: info.fileName, fontManagerState, documentFontsCheck };
        }
      } catch (e) {
        documentFontsCheck = "check-error";
      }
    }
    return { ready: true, reason: "ready", family: info.family, fileName: info.fileName, fontManagerState, documentFontsCheck };
  };

  const effectiveFontFace = (settings, win, item) => {
    return String(item?.fontFamily || win?.fontFamily || ensureLayoutFont(settings) || "");
  };

  const effectiveFontSize = (settings, win, item, fallback = 0) => {
    return Math.max(1, toNumber(item?.fontSize || win?.fontSize || fallback || settings?.defaultFontSize, 26));
  };

  const effectiveLineHeight = (settings, win, item, fallback = 0) => {
    return Math.max(1, toNumber(item?.lineHeight || win?.lineHeight || fallback || settings?.lineHeight, 36));
  };

  const effectiveTextColor = (settings, win, item) => {
    return String(item?.color || item?.textColor || win?.textColor || settings?.textColor || "");
  };

  const effectiveOutlineColor = (settings, win, item) => {
    return String(item?.outlineColor || win?.outlineColor || settings?.outlineColor || "");
  };

  const effectiveOutlineWidth = (settings, win, item) => {
    return Math.max(0, toNumber(item?.outlineWidth ?? win?.outlineWidth ?? settings?.outlineWidth ?? 0, 0));
  };

  function withBitmapFont(bitmap, style, callback) {
    const oldFace = bitmap.fontFace;
    const oldSize = bitmap.fontSize;
    const oldBold = bitmap.fontBold;
    const oldItalic = bitmap.fontItalic;
    const oldTextColor = bitmap.textColor;
    const oldOutlineColor = bitmap.outlineColor;
    const oldOutlineWidth = bitmap.outlineWidth;
    try {
      if (style.fontFace) bitmap.fontFace = style.fontFace;
      if (style.fontSize) bitmap.fontSize = Math.max(1, toNumber(style.fontSize, oldSize));
      if (style.bold !== undefined) bitmap.fontBold = !!style.bold;
      if (style.italic !== undefined) bitmap.fontItalic = !!style.italic;
      if (style.textColor) bitmap.textColor = style.textColor;
      if (style.outlineColor) bitmap.outlineColor = style.outlineColor;
      if (style.outlineWidth !== undefined) bitmap.outlineWidth = Math.max(0, toNumber(style.outlineWidth, oldOutlineWidth));
      return callback();
    } finally {
      bitmap.fontFace = oldFace;
      bitmap.fontSize = oldSize;
      bitmap.fontBold = oldBold;
      bitmap.fontItalic = oldItalic;
      bitmap.textColor = oldTextColor;
      bitmap.outlineColor = oldOutlineColor;
      bitmap.outlineWidth = oldOutlineWidth;
    }
  }

  const resetBitmapFontState = bitmap => {
    if (!bitmap) return;
    bitmap.fontFace = $gameSystem ? $gameSystem.mainFontFace() : "sans-serif";
    bitmap.fontSize = $gameSystem ? $gameSystem.mainFontSize() : 26;
    bitmap.fontBold = false;
    bitmap.fontItalic = false;
    bitmap.textColor = "#ffffff";
    bitmap.outlineColor = "rgba(0, 0, 0, 0.5)";
    bitmap.outlineWidth = 3;
    bitmap.paintOpacity = 255;
  };

  const bitmapFontDebugState = bitmap => {
    if (!bitmap) return null;
    return {
      fontFace: bitmap.fontFace,
      fontSize: bitmap.fontSize,
      fontBold: bitmap.fontBold,
      fontItalic: bitmap.fontItalic,
      textColor: bitmap.textColor,
      outlineColor: bitmap.outlineColor,
      outlineWidth: bitmap.outlineWidth,
      paintOpacity: bitmap.paintOpacity,
      width: bitmap.width,
      height: bitmap.height
    };
  };

  const interactionAnimationEffect = name => {
    switch (String(name || "none")) {
      case "scaleUp": return { scale: 1.06, opacity: 1, offsetX: 0, offsetY: 0 };
      case "scaleDown": return { scale: 0.96, opacity: 1, offsetX: 0, offsetY: 0 };
      case "fade": return { scale: 1, opacity: 0.78, offsetX: 0, offsetY: 0 };
      case "lift": return { scale: 1, opacity: 1, offsetX: 0, offsetY: -2 };
      default: return { scale: 1, opacity: 1, offsetX: 0, offsetY: 0 };
    }
  };

  const itemInteractionAnimation = (item, stateName) => {
    if (stateName === "press" || stateName === "release") return interactionAnimationEffect(item?.pressAnimation || "none");
    if (stateName === "mouseOn" || stateName === "hover") return interactionAnimationEffect(item?.hoverAnimation || "none");
    return interactionAnimationEffect("none");
  };

  const imageScaleRate = (item, axis) => {
    const percentKey = axis === "scaleY" ? "scaleYPercent" : "scaleXPercent";
    if (item && item[percentKey] !== undefined && item[percentKey] !== null && item[percentKey] !== "") {
      return Math.max(0.01, toNumber(item[percentKey], 100) / 100);
    }
    const raw = item ? item[axis] : undefined;
    const n = toNumber(raw, 1);
    if (n <= 0) return 1;
    // v0.1互換: 1.0 のような値は倍率、100 のような値は%として扱う。
    return n > 10 ? n / 100 : n;
  };

  const normalizeButtonImageDef = src => {
    const def = src && typeof src === "object" ? src : {};
    return {
      folder: String(def.folder || "pictures"),
      fileName: String(def.fileName || ""),
      opacity: clamp(toNumber(def.opacity, 255), 0, 255),
      mode: String(def.mode || "stretch"),
      psdKey: String(def.psdKey || ""),
      psdLabel: String(def.psdLabel || ""),
      presetId: String(def.presetId || ""),
      presetLabel: String(def.presetLabel || "")
    };
  };

  const buttonImageForState = (item, stateName) => {
    const images = item && item.buttonImages && typeof item.buttonImages === "object" ? item.buttonImages : {};
    const preferred = normalizeButtonImageDef(images[stateName]);
    if (preferred.fileName) return preferred;
    return normalizeButtonImageDef(images.mouseOff || preferred);
  };

  const choiceListRows = item => {
    if (Array.isArray(item?.choices)) return item.choices.map(v => String(v ?? ""));
    return String(item?.choicesText || "").split(/\r?\n/).map(v => String(v ?? "")).filter(v => v.length > 0);
  };

  const validChoiceState = value => {
    const state = String(value || "enabled");
    return ["enabled", "disabled", "hidden"].includes(state) ? state : "enabled";
  };

  const parseChoiceRuleListArgument = value => {
    const raw = String(value || "").trim();
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return null;
      return parsed.map(entry => {
        if (typeof entry === "string") {
          try {
            return JSON.parse(entry);
          } catch (error) {
            console.error("[DB_UIComposer] choiceRules entry parse error", error, entry);
            return {};
          }
        }
        return entry && typeof entry === "object" ? entry : {};
      });
    } catch (error) {
      console.error("[DB_UIComposer] choiceRules parse error", error, raw);
      return null;
    }
  };

  const normalizeChoiceRules = item => {
    const rows = choiceListRows(item);
    const src = Array.isArray(item?.choiceRules) ? item.choiceRules : [];
    const legacyEnabled = Array.isArray(item?.choiceEnabled) ? item.choiceEnabled : [];
    const disabled = parseChoiceDisabledIndexes(item?.disabledIndexes);
    return rows.map((_, index) => {
      const rule = Object.assign({}, src[index] || {});
      const legacyState = disabled.has(index) || legacyEnabled[index] === false ? "disabled" : "enabled";
      return {
        conditionType: String(rule.conditionType || "always"),
        switchId: toNumber(rule.switchId, 0),
        variableId: toNumber(rule.variableId, 0),
        compareValue: toNumber(rule.compareValue, 0),
        script: String(rule.script || ""),
        trueState: validChoiceState(rule.trueState || rule.state || legacyState),
        falseState: validChoiceState(rule.falseState || "hidden")
      };
    });
  };

  const evaluateChoiceRuleCondition = rule => {
    const type = String(rule?.conditionType || "always");
    try {
      switch (type) {
        case "always":
          return true;
        case "switchOn":
          return rule.switchId > 0 ? $gameSwitches.value(rule.switchId) === true : false;
        case "switchOff":
          return rule.switchId > 0 ? $gameSwitches.value(rule.switchId) !== true : false;
        case "variableEq":
          return rule.variableId > 0 ? Number($gameVariables.value(rule.variableId)) === Number(rule.compareValue) : false;
        case "variableGte":
          return rule.variableId > 0 ? Number($gameVariables.value(rule.variableId)) >= Number(rule.compareValue) : false;
        case "variableLte":
          return rule.variableId > 0 ? Number($gameVariables.value(rule.variableId)) <= Number(rule.compareValue) : false;
        case "script":
          return !!Function("return (" + String(rule.script || "false") + ");").call(null);
        default:
          return true;
      }
    } catch (error) {
      console.error("[DB_UIComposer] choice rule condition error", error, rule);
      return false;
    }
  };

  const choiceStateAt = (item, index) => {
    if (String(item?.choiceMode || "") === "tool") return "enabled";
    const rule = normalizeChoiceRules(item)[index] || {};
    return evaluateChoiceRuleCondition(rule) ? validChoiceState(rule.trueState) : validChoiceState(rule.falseState);
  };

  const choiceListEntries = item => {
    const rows = choiceListRows(item);
    return rows.map((text, index) => ({
      text,
      index,
      state: choiceStateAt(item, index)
    })).filter(entry => entry.state !== "hidden");
  };

  const parseChoiceDisabledIndexes = value => {
    const set = new Set();
    String(value || "").split(/[,.、，\s]+/).forEach(token => {
      const n = Number(token);
      if (Number.isFinite(n) && n > 0) set.add(Math.floor(n) - 1);
    });
    return set;
  };

  const normalizeChoiceEnabledArray = item => {
    const rows = choiceListRows(item);
    return rows.map((_, index) => choiceStateAt(item, index) === "enabled");
  };

  const isChoiceEnabled = (item, index) => choiceStateAt(item, index) === "enabled";

  const choiceListRowHeight = item => Math.max(1, toNumber(item?.rowHeight, 32));
  const choiceListGap = item => Math.max(0, toNumber(item?.gap, 3));
  const choiceListMaxVisibleRows = item => Math.max(1, toNumber(item?.maxVisibleRows, 6));
  const choiceListVisibleRows = item => Math.max(1, Math.min(choiceListEntries(item).length || 1, choiceListMaxVisibleRows(item)));
  const choiceListHeight = item => {
    const rows = choiceListVisibleRows(item);
    return Math.max(1, rows * choiceListRowHeight(item) + Math.max(0, rows - 1) * choiceListGap(item));
  };

  const imageChoiceOptions = item => Array.isArray(item?.options) ? item.options : [];

  const imageChoiceStateAt = option => {
    const type = String(option?.conditionType || "always");
    let ok = true;
    try {
      switch (type) {
        case "switchOn": ok = toNumber(option.switchId, 0) > 0 && $gameSwitches.value(toNumber(option.switchId, 0)) === true; break;
        case "switchOff": ok = toNumber(option.switchId, 0) > 0 && $gameSwitches.value(toNumber(option.switchId, 0)) !== true; break;
        case "variableEq": ok = toNumber(option.variableId, 0) > 0 && Number($gameVariables.value(toNumber(option.variableId, 0))) === toNumber(option.compareValue, 0); break;
        case "variableGte": ok = toNumber(option.variableId, 0) > 0 && Number($gameVariables.value(toNumber(option.variableId, 0))) >= toNumber(option.compareValue, 0); break;
        case "variableLte": ok = toNumber(option.variableId, 0) > 0 && Number($gameVariables.value(toNumber(option.variableId, 0))) <= toNumber(option.compareValue, 0); break;
        case "script": ok = !!Function("return (" + String(option.script || "false") + ");").call(null); break;
        default: ok = true; break;
      }
    } catch (error) {
      console.error("[DB_UIComposer] image choice condition error", error, option);
      ok = false;
    }
    return validChoiceState(ok ? option?.trueState || "enabled" : option?.falseState || "disabled");
  };

  const imageChoiceBounds = item => {
    const x = toNumber(item?.x, 0);
    const y = toNumber(item?.y, 0);
    let maxX = Math.max(1, toNumber(item?.width, 1));
    let maxY = Math.max(1, toNumber(item?.height, 1));
    for (const option of imageChoiceOptions(item)) {
      if (imageChoiceStateAt(option) === "hidden") continue;
      maxX = Math.max(maxX, toNumber(option.x, 0) + Math.max(1, toNumber(option.width, 160)));
      maxY = Math.max(maxY, toNumber(option.y, 0) + Math.max(1, toNumber(option.height, 44)));
    }
    return { x, y, width: maxX, height: maxY };
  };

  const databaseBindingPropKey = (prefix, baseKey) => {
    const key = String(baseKey || "");
    const p = String(prefix || "");
    if (!p) return key;
    return `${p}${key.charAt(0).toUpperCase()}${key.slice(1)}`;
  };

  const normalizeDatabaseBinding = src => {
    const def = src && typeof src === "object" ? src : {};
    const norm = {
      enabled: toBool(def.enabled, false),
      sourceType: String(def.sourceType || "actor"),
      objectType: String(def.objectType || "item"),
      idMode: String(def.idMode || "fixed"),
      id: Math.max(0, toNumber(def.id, 1)),
      idVariableId: Math.max(0, toNumber(def.idVariableId, 1)),
      fieldPath: String(def.fieldPath || "name"),
      typeCategory: String(def.typeCategory || "weaponTypes"),
      termCategory: String(def.termCategory || "messages"),
      termKey: String(def.termKey || ""),
      updateTiming: String(def.updateTiming || "autoFrame"),
      textPrefix: String(def.textPrefix || ""),
      textSuffix: String(def.textSuffix || ""),
      emptyText: String(def.emptyText || ""),
      decimals: toNumber(def.decimals, -1),
      maxSourceType: String(def.maxSourceType || ""),
      maxObjectType: String(def.maxObjectType || "item"),
      maxIdMode: String(def.maxIdMode || "fixed"),
      maxId: Math.max(0, toNumber(def.maxId, 1)),
      maxIdVariableId: Math.max(0, toNumber(def.maxIdVariableId, 1)),
      maxFieldPath: String(def.maxFieldPath || ""),
      maxTypeCategory: String(def.maxTypeCategory || "weaponTypes"),
      maxTermCategory: String(def.maxTermCategory || "messages"),
      maxTermKey: String(def.maxTermKey || ""),
      maxFallback: Math.max(1, toNumber(def.maxFallback, 100))
    };
    if (!["autoFrame", "pluginCommand", "windowOpen"].includes(norm.updateTiming)) norm.updateTiming = "autoFrame";
    if (!["fixed", "variable"].includes(norm.idMode)) norm.idMode = "fixed";
    if (!["fixed", "variable"].includes(norm.maxIdMode)) norm.maxIdMode = "fixed";
    if (norm.decimals < 0) norm.decimals = -1;
    return norm;
  };

  const dbBindingUpdateTiming = binding => {
    const mode = String(binding?.updateTiming || "autoFrame");
    return ["autoFrame", "pluginCommand", "windowOpen"].includes(mode) ? mode : "autoFrame";
  };

  const databaseBindingIdValue = (binding, keyPrefix = "") => {
    const idMode = String(binding?.[databaseBindingPropKey(keyPrefix, "idMode")] || "fixed");
    const fixedId = Math.max(0, toNumber(binding?.[databaseBindingPropKey(keyPrefix, "id")], 0));
    const variableId = Math.max(0, toNumber(binding?.[databaseBindingPropKey(keyPrefix, "idVariableId")], 0));
    if (idMode === "variable" && variableId > 0) return Math.max(0, toNumber($gameVariables.value(variableId), fixedId || 0));
    return fixedId;
  };

  const resolveObjectPathValue = (base, path) => {
    if (base == null) return null;
    const raw = String(path || "").trim();
    if (!raw || raw === "self") return base;
    const tokens = raw.replace(/\[(\d+)\]/g, '.$1').split('.').map(v => String(v || '').trim()).filter(Boolean);
    let cur = base;
    for (const token of tokens) {
      if (cur == null) return null;
      cur = cur[token];
    }
    return cur;
  };

  const databaseTypeValue = (binding, keyPrefix = "") => {
    const category = String(binding?.[databaseBindingPropKey(keyPrefix, "typeCategory")] || binding?.typeCategory || "weaponTypes");
    const index = databaseBindingIdValue(binding, keyPrefix);
    const system = $dataSystem || {};
    const table = {
      elements: system.elements || [],
      weaponTypes: system.weaponTypes || [],
      armorTypes: system.armorTypes || [],
      skillTypes: system.skillTypes || [],
      equipTypes: system.equipTypes || [],
      params: system.terms?.params || []
    }[category] || [];
    return table[index] ?? "";
  };

  const databaseCommandTermIndexMap = () => ({
    fight: 0,
    escape: 1,
    attack: 2,
    guard: 3,
    item: 4,
    skill: 5,
    equip: 6,
    status: 7,
    formation: 8,
    save: 9,
    gameEnd: 10,
    options: 11,
    weapon: 12,
    armor: 13,
    keyItem: 14,
    equip2: 15,
    optimize: 16,
    clear: 17,
    newGame: 18,
    continue: 19,
    continue_: 19,
    toTitle: 21,
    cancel: 22,
    buy: 24,
    sell: 25
  });

  const resolveDatabaseTermArrayIndex = (category, termKey, fallbackId = 0) => {
    const key = String(termKey || "").trim();
    const cat = String(category || "");
    if (cat === "commands") {
      const map = databaseCommandTermIndexMap();
      if (Object.prototype.hasOwnProperty.call(map, key)) return map[key];
    }
    if (key === "") return Math.max(0, toNumber(fallbackId, 0));
    const n = Number(key);
    return Number.isFinite(n) ? n : -1;
  };

  const databaseTermValue = (binding, keyPrefix = "") => {
    const category = String(binding?.[databaseBindingPropKey(keyPrefix, "termCategory")] || binding?.termCategory || "messages");
    const key = String(binding?.[databaseBindingPropKey(keyPrefix, "termKey")] || binding?.termKey || "currencyUnit");
    const terms = ($dataSystem && $dataSystem.terms) ? $dataSystem.terms : {};
    const table = terms[category];
    if (Array.isArray(table)) {
      const index = resolveDatabaseTermArrayIndex(category, key, databaseBindingIdValue(binding, keyPrefix));
      if (!Number.isFinite(index) || index < 0) return "";
      return table[index] ?? "";
    }
    if (table && typeof table === "object") {
      return table[key] ?? "";
    }
    if (key === "currencyUnit") return String(($dataSystem && $dataSystem.currencyUnit) || "");
    return "";
  };

  const findRuntimeEnemyByDatabaseId = enemyId => {
    if (!$gameTroop || typeof $gameTroop.members !== "function") return null;
    const id = Math.max(0, toNumber(enemyId, 0));
    if (id <= 0) return null;
    const members = $gameTroop.members() || [];
    return members.find(enemy => enemy && typeof enemy.enemyId === "function" && enemy.enemyId() === id) || null;
  };

  const databaseActorFieldValue = (actor, fieldPath) => {
    if (!actor) return null;
    const key = String(fieldPath || "name");
    if (key === "name") return actor.name ? actor.name() : "";
    if (key === "nickname") return actor.nickname ? actor.nickname() : "";
    if (key === "profile") return actor.profile ? actor.profile() : "";
    if (key === "className") return actor.currentClass && actor.currentClass() ? String(actor.currentClass().name || "") : "";
    if (key === "level") return toNumber(actor.level, actor._level || 0);
    if (key === "hp") return toNumber(actor.hp, 0);
    if (key === "mhp") return toNumber(actor.mhp, 1);
    if (key === "mp") return toNumber(actor.mp, 0);
    if (key === "mmp") return toNumber(actor.mmp, 1);
    if (key === "tp") return toNumber(actor.tp, 0);
    if (key === "maxTp") return actor.maxTp ? toNumber(actor.maxTp(), 100) : 100;
    if (key === "currentExp") return actor.currentExp ? toNumber(actor.currentExp(), 0) : 0;
    if (key === "nextRequiredExp") return actor.nextRequiredExp ? toNumber(actor.nextRequiredExp(), 0) : 0;
    const pm = key.match(/^(param|xparam|sparam)\[(\d+)\]$/i);
    if (pm) {
      const idx = toNumber(pm[2], 0);
      if (pm[1] === "param" && actor.param) return toNumber(actor.param(idx), 0);
      if (pm[1] === "xparam" && actor.xparam) return toNumber(actor.xparam(idx), 0);
      if (pm[1] === "sparam" && actor.sparam) return toNumber(actor.sparam(idx), 0);
    }
    return resolveObjectPathValue(actor, key);
  };

  const databaseEnemyFieldValue = (enemyId, fieldPath) => {
    const enemyData = $dataEnemies ? $dataEnemies[Math.max(0, toNumber(enemyId, 0))] : null;
    const battler = findRuntimeEnemyByDatabaseId(enemyId);
    const key = String(fieldPath || "name");
    if (key === "name") return battler && battler.name ? battler.name() : String(enemyData?.name || "");
    if (key === "hp") return battler ? toNumber(battler.hp, 0) : null;
    if (key === "mhp") return battler ? toNumber(battler.mhp, 1) : toNumber(enemyData?.params?.[0], 1);
    if (key === "mp") return battler ? toNumber(battler.mp, 0) : null;
    if (key === "mmp") return battler ? toNumber(battler.mmp, 1) : toNumber(enemyData?.params?.[1], 1);
    if (key === "tp") return battler ? toNumber(battler.tp, 0) : null;
    const pm = key.match(/^param\[(\d+)\]$/i);
    if (pm) {
      const idx = toNumber(pm[1], 0);
      if (battler && battler.param) return toNumber(battler.param(idx), 0);
      return toNumber(enemyData?.params?.[idx], 0);
    }
    const base = battler || enemyData;
    return resolveObjectPathValue(base, key);
  };

  const databaseObjectByTypeAndId = (sourceType, objectType, id) => {
    const sid = Math.max(0, toNumber(id, 0));
    if (sourceType === "variable") return sid > 0 ? $gameVariables.value(sid) : 0;
    if (sourceType === "gold") return $gameParty ? toNumber($gameParty.gold(), 0) : 0;
    if (sourceType === "type") return null;
    if (sourceType === "term") return null;
    if (sourceType === "actor") return $gameActors ? $gameActors.actor(Math.max(1, sid || 1)) : null;
    if (sourceType === "enemy") return sid > 0 && $dataEnemies ? ($dataEnemies[sid] || null) : null;
    if (sourceType === "state") return sid > 0 && $dataStates ? ($dataStates[sid] || null) : null;
    const actual = sourceType === "databaseObject" ? String(objectType || "item") : sourceType;
    const map = {
      item: $dataItems,
      weapon: $dataWeapons,
      armor: $dataArmors,
      skill: $dataSkills,
      class: $dataClasses
    };
    const table = map[actual];
    return table && sid > 0 ? (table[sid] || null) : null;
  };

  const databaseBindingRawValue = (binding, keyPrefix = "") => {
    const sourceKey = databaseBindingPropKey(keyPrefix, "sourceType");
    const objectKey = databaseBindingPropKey(keyPrefix, "objectType");
    const fieldKey = databaseBindingPropKey(keyPrefix, "fieldPath");
    const sourceType = String(binding?.[sourceKey] || binding?.sourceType || "actor");
    if (sourceType === "gold") return $gameParty ? toNumber($gameParty.gold(), 0) : 0;
    if (sourceType === "type") return databaseTypeValue(binding, keyPrefix);
    if (sourceType === "term") return databaseTermValue(binding, keyPrefix);

    const id = databaseBindingIdValue(binding, keyPrefix);
    if (sourceType === "variable") {
      const base = id > 0 ? $gameVariables.value(id) : 0;
      const fieldPath = String(binding?.[fieldKey] || "").trim();
      return fieldPath ? resolveObjectPathValue(base, fieldPath) : base;
    }
    if (sourceType === "actor") {
      const actor = databaseObjectByTypeAndId("actor", "", id);
      return databaseActorFieldValue(actor, binding?.[fieldKey] || "name");
    }
    if (sourceType === "enemy") {
      return databaseEnemyFieldValue(id, binding?.[fieldKey] || "name");
    }
    const base = databaseObjectByTypeAndId(sourceType, binding?.[objectKey] || binding?.objectType, id);
    return resolveObjectPathValue(base, binding?.[fieldKey] || "name");
  };

  const isDatabaseIconIndexField = fieldPath => {
    const key = String(fieldPath || "").trim();
    return key === "iconIndex" || /(^|\.)iconIndex$/i.test(key);
  };

  const formatDatabaseBindingDisplayText = (binding, raw) => {
    const emptyText = String(binding?.emptyText || "");
    if (raw === null || raw === undefined || raw === "") return emptyText;
    let text = "";
    if (isDatabaseIconIndexField(binding?.fieldPath)) {
      const iconIndex = Math.max(0, toNumber(raw, 0));
      text = `\\I[${iconIndex}]`;
    } else if (typeof raw === "number") {
      const dec = toNumber(binding?.decimals, -1);
      text = dec >= 0 ? Number(raw).toFixed(Math.max(0, dec)) : String(raw);
    } else if (typeof raw === "string") {
      text = raw;
    } else {
      try {
        text = JSON.stringify(raw);
      } catch (_) {
        text = String(raw);
      }
    }
    return `${String(binding?.textPrefix || "")}${text}${String(binding?.textSuffix || "")}`;
  };

  const databaseBindingTextValue = binding => {
    if (!binding || binding.enabled !== true) return null;
    const raw = databaseBindingRawValue(binding, "");
    return formatDatabaseBindingDisplayText(binding, raw);
  };

  const databaseBindingGaugeValues = binding => {
    if (!binding || binding.enabled !== true) return null;
    const valueRaw = databaseBindingRawValue(binding, "");
    const hasMaxSource = String(binding.maxSourceType || "").trim().length > 0;
    const maxRaw = hasMaxSource ? databaseBindingRawValue(binding, "max") : null;
    const value = toNumber(valueRaw, 0);
    const max = hasMaxSource ? Math.max(1, toNumber(maxRaw, 1)) : Math.max(1, toNumber(binding.maxFallback, 100));
    return { value, max };
  };

  const adjustWindowDefinitionForChoiceLists = definition => {
    const def = Object.assign({}, definition || {});
    const items = Array.isArray(def.items) ? def.items : [];
    const pad = Math.max(0, toNumber(def.padding, toNumber(def.layoutSettings?.padding, 12)));
    let desiredHeight = toNumber(def.height, 120);
    for (const item of items) {
      if (String(item?.type || "") !== "choiceList" || item.visible === false || item.autoResizeWindow === false) continue;
      const bottom = toNumber(item.y, 0) + choiceListHeight(item) + pad * 2 + toNumber(item.autoResizeBottomMargin, 8);
      desiredHeight = Math.max(48, Math.ceil(bottom));
    }
    def.height = desiredHeight;
    return def;
  };

  const estimatedItemBounds = item => {
    const x = toNumber(item?.x, 0);
    const y = toNumber(item?.y, 0);
    switch (String(item?.type || "text")) {
      case "image": {
        const sx = imageScaleRate(item, "scaleX");
        const sy = imageScaleRate(item, "scaleY");
        const baseW = toNumber(item?.width, 0) > 0 ? toNumber(item.width, 0) : 96;
        const baseH = toNumber(item?.height, 0) > 0 ? toNumber(item.height, 0) : 64;
        return { x, y, width: Math.max(1, Math.round(baseW * sx)), height: Math.max(1, Math.round(baseH * sy)) };
      }
      case "compositeImage":
        return compositeImageBounds(item);
      case "gauge":
        return { x, y, width: Math.max(1, toNumber(item?.width, 220)), height: Math.max(1, toNumber(item?.height, 14)) };
      case "button":
        return { x, y, width: Math.max(1, toNumber(item?.width, 120)), height: Math.max(1, toNumber(item?.height, 36)) };
      case "log":
        return { x, y, width: Math.max(1, toNumber(item?.width, 320)), height: Math.max(1, toNumber(item?.height, 120)) };
      case "choiceList":
        return { x, y, width: Math.max(1, toNumber(item?.width, 240)), height: choiceListHeight(item) };
      case "imageChoiceList":
        return imageChoiceBounds(item);
      case "text":
      default: {
        const size = Math.max(1, toNumber(item?.fontSize, 22));
        const text = String(item?.text || "");
        const lines = text.split(/\r?\n/);
        const width = Math.max(1, toNumber(item?.width, 0) || Math.ceil(Math.max(...lines.map(line => line.length), 1) * size * 0.64));
        const height = Math.max(size + 8, lines.length * Math.max(1, size + 10));
        return { x, y, width, height };
      }
    }
  };

  const cloneJson = obj => JSON.parse(JSON.stringify(obj || {}));

  const repairInvalidJsonEscapes = text => {
    // RPGツクールの制御文字（\V[1], \C[2] など）は、JSON内では \\V[1] のように
    // バックスラッシュを二重化する必要がある。
    // 手貼りなどで単独バックスラッシュになった場合だけ、安全側で補正する。
    return String(text || "")
      .replace(/\u000b/g, "\\v")
      .replace(/\\(?!["\\/bfnrtu])/g, "\\\\");
  };

  const parseLayoutJson = text => {
    const raw = String(text || "{}");
    try {
      return JSON.parse(raw);
    } catch (firstError) {
      try {
        return JSON.parse(repairInvalidJsonEscapes(raw));
      } catch (secondError) {
        secondError._firstError = firstError;
        throw secondError;
      }
    }
  };

  const backgroundTypeNumber = type => {
    switch (String(type || "normal")) {
      case "dim": return 1;
      case "transparent": return 2;
      default: return 0;
    }
  };


  const normalizeImageLayer = (src, defaults) => {
    const def = src && typeof src === "object" ? src : {};
    const mode = ["stretch", "cover", "contain", "tile"].includes(String(def.mode || defaults.mode || "stretch")) ? String(def.mode || defaults.mode || "stretch") : "stretch";
    return {
      enabled: toBool(def.enabled, defaults.enabled || false),
      folder: String(def.folder || defaults.folder || "pictures"),
      fileName: String(def.fileName || ""),
      opacity: clamp(toNumber(def.opacity, defaults.opacity ?? 255), 0, 255),
      mode,
      zOrder: toNumber(def.zOrder, defaults.zOrder || 0)
    };
  };

  const normalizeCompositeBlendMode = value => {
    const mode = String(value || "normal");
    return ["normal", "add", "multiply", "screen"].includes(mode) ? mode : "normal";
  };

  const compositeCanvasOperation = value => {
    switch (normalizeCompositeBlendMode(value)) {
      case "add": return "lighter";
      case "multiply": return "multiply";
      case "screen": return "screen";
      default: return "source-over";
    }
  };

  const normalizeCompositeImageLayer = (src, index = 0) => {
    const def = src && typeof src === "object" ? src : {};
    const rawImagePath = String(def.image || "").trim().replace(/\\/g, "/").replace(/^img\//i, "").replace(/^\/+|\/+$/g, "");
    let parsed = { folder: String(def.folder || "pictures"), fileName: String(def.fileName || "") };
    if (rawImagePath) {
      const slash = rawImagePath.lastIndexOf("/");
      parsed = slash >= 0
        ? { folder: rawImagePath.slice(0, slash), fileName: rawImagePath.slice(slash + 1) }
        : { folder: parsed.folder, fileName: rawImagePath };
    }
    return {
      id: String(def.id || `layer${index + 1}`),
      name: String(def.name || def.id || `layer${index + 1}`),
      visible: toBool(def.visible, true),
      folder: String(parsed.folder || def.folder || "pictures").replace(/^img\//i, "").replace(/^\/+|\/+$/g, ""),
      fileName: String(parsed.fileName || def.fileName || "").replace(/\.(png|jpg|jpeg|webp|gif|bmp)$/i, ""),
      x: toNumber(def.x, 0),
      y: toNumber(def.y, 0),
      width: Math.max(0, toNumber(def.width || def.previewNaturalWidth, 0)),
      height: Math.max(0, toNumber(def.height || def.previewNaturalHeight, 0)),
      opacity: clamp(toNumber(def.opacity, 255), 0, 255),
      priority: toNumber(def.priority, def.zOrder ?? index + 1),
      zOrder: toNumber(def.zOrder, def.priority ?? index + 1),
      blendMode: normalizeCompositeBlendMode(def.blendMode)
    };
  };

  const normalizeCompositeImageLayers = layers => {
    return (Array.isArray(layers) ? layers : []).map((layer, index) => normalizeCompositeImageLayer(layer, index));
  };

  const compositeImageBaseSize = item => {
    const baked = item?.bakedImage || {};
    return {
      width: Math.max(1, toNumber(item?.width || baked.width || item?.previewNaturalWidth, 96)),
      height: Math.max(1, toNumber(item?.height || baked.height || item?.previewNaturalHeight, 64))
    };
  };

  const compositeImageBounds = item => {
    const base = compositeImageBaseSize(item);
    return {
      x: toNumber(item?.x, 0),
      y: toNumber(item?.y, 0),
      width: Math.max(1, Math.round(base.width * imageScaleRate(item, "scaleX"))),
      height: Math.max(1, Math.round(base.height * imageScaleRate(item, "scaleY")))
    };
  };

  const normalizeBackgroundImage = bg => normalizeImageLayer(bg, {
    enabled: false,
    folder: "pictures",
    opacity: 255,
    mode: "stretch",
    zOrder: -100
  });

  const normalizeDecorationImage = deco => normalizeImageLayer(deco, {
    enabled: false,
    folder: "system",
    opacity: 255,
    mode: "stretch",
    zOrder: 100
  });

  const normalizeLogState = log => {
    const src = log && typeof log === "object" ? log : {};
    const lines = Array.isArray(src.lines) ? src.lines.map(line => String(line ?? "")) : [];
    return {
      enabled: toBool(src.enabled, lines.length > 0),
      lines,
      maxLines: Math.max(1, toNumber(src.maxLines, 200)),
      scrollY: Math.max(0, toNumber(src.scrollY, 0)),
      autoScrollBottom: toBool(src.autoScrollBottom, true),
      zOrder: toNumber(src.zOrder, 0),
      fontSize: Math.max(0, toNumber(src.fontSize, 0)),
      lineHeight: Math.max(0, toNumber(src.lineHeight, 0)),
      paddingX: Math.max(0, toNumber(src.paddingX, 4)),
      paddingY: Math.max(0, toNumber(src.paddingY, 4)),
      textColor: String(src.textColor || ""),
      outlineColor: String(src.outlineColor || ""),
      outlineWidth: Math.max(0, toNumber(src.outlineWidth, 0))
    };
  };

  const normalizePlacementArea = area => {
    const src = area && typeof area === "object" ? area : {};
    return {
      extendLeft: Math.max(0, toNumber(src.extendLeft, 0)),
      extendTop: Math.max(0, toNumber(src.extendTop, 0)),
      extendRight: Math.max(0, toNumber(src.extendRight, 0)),
      extendBottom: Math.max(0, toNumber(src.extendBottom, 0))
    };
  };

  const layerBaseOrder = layer => {
    switch (String(layer || "mapUi")) {
      case "messageAbove": return 2000;
      case "overlay": return 3000;
      default: return 1000;
    }
  };

  const zOrderValue = obj => toNumber(obj?.zOrder, 0);

  const compareDisplayOrder = (a, b, baseIndexA = 0, baseIndexB = 0) => {
    const az = zOrderValue(a);
    const bz = zOrderValue(b);
    if (az !== bz) return az - bz;
    return baseIndexA - baseIndexB;
  };

  const debugItemSummary = item => ({
    id: String(item?.id || ""),
    type: String(item?.type || ""),
    x: toNumber(item?.x, 0),
    y: toNumber(item?.y, 0),
    zOrder: zOrderValue(item),
    visible: item?.visible !== false,
    allowOutsideWindow: item?.allowOutsideWindow === true,
    folder: item?.folder,
    fileName: item?.fileName,
    width: item?.width,
    height: item?.height,
    scaleXPercent: item?.scaleXPercent,
    scaleYPercent: item?.scaleYPercent
  });

  const debugWindowSummary = win => ({
    id: String(win?.id || ""),
    x: toNumber(win?.x, 0),
    y: toNumber(win?.y, 0),
    width: toNumber(win?.width, 0),
    height: toNumber(win?.height, 0),
    layer: String(win?.layer || "mapUi"),
    zOrder: zOrderValue(win),
    groupId: String(win?.groupId || ""),
    visible: win?.visible !== false,
    frameVisible: win?.frameVisible !== false,
    backgroundType: String(win?.backgroundType || "normal"),
    placementArea: normalizePlacementArea(win?.placementArea),
    backgroundImage: normalizeBackgroundImage(win?.backgroundImage),
    decorationImage: normalizeDecorationImage(win?.decorationImage),
    log: normalizeLogState(win?.log),
    items: (win?.items || []).map(debugItemSummary)
  });

  const debugLayoutSummary = layout => ({
    layoutId: String(layout?.layoutId || DEFAULT_LAYOUT_ID),
    settings: layout?.settings || {},
    windowCount: (layout?.windows || []).length,
    windows: (layout?.windows || []).map(debugWindowSummary)
  });

  const dumpDebugInfo = () => {
    ensureSystemStore();
    const layouts = $gameSystem._dbUiComposerLayouts || {};
    const data = {
      debugEnabled: isDebugEnabled(),
      layoutCount: Object.keys(layouts).length,
      hiddenLayouts: $gameSystem._dbUiComposerHiddenLayouts || {},
      windowVisible: $gameSystem._dbUiComposerWindowVisible || {},
      runtimeStates: $gameSystem._dbUiComposerRuntimeStates || {},
      layouts: Object.fromEntries(Object.entries(layouts).map(([id, layout]) => [id, debugLayoutSummary(layout)]))
    };
    console.groupCollapsed("[DB_UIComposer] Debug Info");
    console.log(data);
    console.groupEnd();
    return data;
  };

  const normalizeLayout = layout => {
    const src = cloneJson(layout);
    src.layoutId = String(src.layoutId || DEFAULT_LAYOUT_ID);
    src.settings = Object.assign({
      defaultFontSize: 26,
      lineHeight: 36,
      padding: 12,
      textYOffset: 0,
      textColor: "",
      outlineColor: "",
      outlineWidth: 4,
      windowSkinName: "Window",
      fontFileName: "",
      fontFace: ""
    }, src.settings || {});
    src.groups = Array.isArray(src.groups) ? src.groups.map((group, index) => ({
      id: String(group?.id || `group${index + 1}`),
      name: String(group?.name || group?.id || `group${index + 1}`),
      visible: toBool(group?.visible, true),
      locked: toBool(group?.locked, false)
    })) : [];
    src.scenes = Array.isArray(src.scenes) ? src.scenes.map((scene, index) => ({
      id: String(scene?.id || `scene${index + 1}`),
      name: String(scene?.name || scene?.id || `scene${index + 1}`),
      groupIds: Array.isArray(scene?.groupIds) ? scene.groupIds.map(id => String(id || "")).filter(Boolean) : [],
      includeUngrouped: toBool(scene?.includeUngrouped, false)
    })) : [];
    src.activeSceneId = String(src.activeSceneId || "");
    src.windows = Array.isArray(src.windows) ? src.windows : [];
    src.windows.forEach((win, index) => {
      win.id = String(win.id || `window${index + 1}`);
      win.x = toNumber(win.x, 0);
      win.y = toNumber(win.y, 0);
      win.width = Math.max(1, toNumber(win.width, 240));
      win.height = Math.max(1, toNumber(win.height, 120));
      win.opacity = clamp(toNumber(win.opacity, 255), 0, 255);
      win.contentsOpacity = clamp(toNumber(win.contentsOpacity, 255), 0, 255);
      win.layer = String(win.layer || "mapUi");
      win.zOrder = toNumber(win.zOrder, 0);
      win.visible = toBool(win.visible, true);
      win.inputEnabled = toBool(win.inputEnabled, true);
      win.frameVisible = toBool(win.frameVisible, true);
      win.backgroundType = String(win.backgroundType || "normal");
      win.placementArea = normalizePlacementArea(win.placementArea);
      win.backgroundImage = normalizeBackgroundImage(win.backgroundImage);
      win.decorationImage = normalizeDecorationImage(win.decorationImage);
      win.log = normalizeLogState(win.log);
      win.layoutSettings = Object.assign({}, src.settings, win.layoutSettings || {});
      win.items = Array.isArray(win.items) ? win.items : [];
      win.items.forEach((item, itemIndex) => {
        item.id = String(item.id || `${item.type || "item"}${itemIndex + 1}`);
        item.type = String(item.type || "text");
        item.x = toNumber(item.x, 0);
        item.y = toNumber(item.y, 0);
        item.zOrder = toNumber(item.zOrder, 0);
        item.visible = toBool(item.visible, true);
        item.allowOutsideWindow = toBool(item.allowOutsideWindow, false);
        item.databaseBinding = normalizeDatabaseBinding(item.databaseBinding);
        if (item.type === "image") {
          item.width = Math.max(0, toNumber(item.width, 0));
          item.height = Math.max(0, toNumber(item.height, 0));
          if (item.scaleXPercent === undefined && item.scaleX !== undefined) item.scaleXPercent = Math.round(imageScaleRate(item, "scaleX") * 10000) / 100;
          if (item.scaleYPercent === undefined && item.scaleY !== undefined) item.scaleYPercent = Math.round(imageScaleRate(item, "scaleY") * 10000) / 100;
          if (item.scaleXPercent === undefined) item.scaleXPercent = 100;
          if (item.scaleYPercent === undefined) item.scaleYPercent = 100;
        } else if (item.type === "compositeImage") {
          const baked = item.bakedImage || {};
          // item.fileName が空で baked 側を使うケースでは、folder も baked 側へ揃えます。
          // （folder だけ旧値のままだと、存在しないパスへ読みに行くことがあります）
          if (!item.fileName && baked.fileName) {
            item.fileName = String(baked.fileName || "").replace(/\.(png|jpg|jpeg|webp|gif|bmp)$/i, "");
            item.folder = String(baked.folder || item.folder || "pictures");
          } else if (!item.folder && baked.folder) {
            item.folder = String(baked.folder || "pictures");
          }
          item.width = Math.max(0, toNumber(item.width || baked.width, 0));
          item.height = Math.max(0, toNumber(item.height || baked.height, 0));
          if (item.scaleXPercent === undefined && item.scaleX !== undefined) item.scaleXPercent = Math.round(imageScaleRate(item, "scaleX") * 10000) / 100;
          if (item.scaleYPercent === undefined && item.scaleY !== undefined) item.scaleYPercent = Math.round(imageScaleRate(item, "scaleY") * 10000) / 100;
          if (item.scaleXPercent === undefined) item.scaleXPercent = 100;
          if (item.scaleYPercent === undefined) item.scaleYPercent = 100;
          item.layers = normalizeCompositeImageLayers(item.layers);
        } else if (item.type === "choiceList") {
          item.choiceMode = ["tool", "command"].includes(String(item.choiceMode || "")) ? String(item.choiceMode) : "command";
          item.choices = choiceListRows(item);
          item.choiceRules = normalizeChoiceRules(item);
          item.choiceEnabled = normalizeChoiceEnabledArray(item);
          item.closeWindowOnSelect = toBool(item.closeWindowOnSelect, false);
          item.disabledBackColor = String(item.disabledBackColor || "rgba(0,0,0,0.28)");
          item.disabledTextColor = String(item.disabledTextColor || "rgba(180,180,180,0.85)");
        }
      });
    });
    return src;
  };

  const ensureSystemStore = () => {
    if (!$gameSystem) return null;
    if (!$gameSystem._dbUiComposerLayouts) $gameSystem._dbUiComposerLayouts = {};
    if (!$gameSystem._dbUiComposerHiddenLayouts) $gameSystem._dbUiComposerHiddenLayouts = {};
    if (!$gameSystem._dbUiComposerWindowVisible) $gameSystem._dbUiComposerWindowVisible = {};
    if (!$gameSystem._dbUiComposerRuntimeStates) $gameSystem._dbUiComposerRuntimeStates = {};
    if (!$gameSystem._dbUiComposerGroupVisible) $gameSystem._dbUiComposerGroupVisible = {};
    return $gameSystem._dbUiComposerLayouts;
  };

  const allLayouts = () => {
    ensureSystemStore();
    return $gameSystem._dbUiComposerLayouts;
  };

  // 実行時状態はレイアウト定義そのものを書き換えず、セーブデータ側に差分だけ保存します。
  // これにより、ツールで作った初期レイアウトとゲーム中の差し替え状態を分離できます。
  const runtimeStates = () => {
    ensureSystemStore();
    if (!$gameSystem._dbUiComposerRuntimeStates || typeof $gameSystem._dbUiComposerRuntimeStates !== "object") {
      $gameSystem._dbUiComposerRuntimeStates = {};
      $gameSystem._dbUiComposerGroupVisible = {};
    }
    return $gameSystem._dbUiComposerRuntimeStates;
  };

  const runtimeStateForLayout = (layoutId, create = false) => {
    const states = runtimeStates();
    const id = String(layoutId || DEFAULT_LAYOUT_ID);
    if (!states[id] && create) states[id] = { windows: {} };
    return states[id] || null;
  };

  const runtimeWindowOverride = (layoutId, windowId, create = false) => {
    const layoutState = runtimeStateForLayout(layoutId, create);
    if (!layoutState) return null;
    if (!layoutState.windows || typeof layoutState.windows !== "object") layoutState.windows = {};
    const id = String(windowId || "");
    if (!layoutState.windows[id] && create) layoutState.windows[id] = { items: {} };
    const winState = layoutState.windows[id] || null;
    if (winState && (!winState.items || typeof winState.items !== "object")) winState.items = {};
    return winState;
  };

  const runtimeItemOverride = (layoutId, windowId, itemId, create = false) => {
    const winState = runtimeWindowOverride(layoutId, windowId, create);
    if (!winState) return null;
    const id = String(itemId || "");
    if (!winState.items[id] && create) winState.items[id] = {};
    return winState.items[id] || null;
  };

  const cleanupRuntimeState = layoutId => {
    const states = runtimeStates();
    const id = String(layoutId || DEFAULT_LAYOUT_ID);
    const layoutState = states[id];
    if (!layoutState) return;
    for (const [windowId, winState] of Object.entries(layoutState.windows || {})) {
      if (winState?.items && Object.keys(winState.items).length === 0) delete winState.items;
      const keys = Object.keys(winState || {}).filter(key => key !== "items");
      if (keys.length === 0 && (!winState.items || Object.keys(winState.items).length === 0)) delete layoutState.windows[windowId];
    }
    if (!layoutState.windows || Object.keys(layoutState.windows).length === 0) delete states[id];
  };

  const applyRuntimeStateToWindow = (layoutId, definition) => {
    const def = cloneJson(definition);
    const state = runtimeWindowOverride(layoutId, def.id, false);
    if (!state) return def;
    const windowOverride = Object.assign({}, state);
    delete windowOverride.items;
    const effective = Object.assign({}, def, windowOverride);
    effective.items = (def.items || []).map(item => Object.assign({}, item, state.items?.[item.id] || {}));
    return effective;
  };

  const groupRuntimeKey = (layoutId, groupId) => `${String(layoutId || DEFAULT_LAYOUT_ID)}::${String(groupId || "")}`;

  const groupVisibleInRuntime = (layoutId, group) => {
    if (!group || !group.id) return true;
    ensureSystemStore();
    const key = groupRuntimeKey(layoutId, group.id);
    const map = $gameSystem._dbUiComposerGroupVisible || {};
    return map[key] === undefined ? group.visible !== false : map[key] !== false;
  };

  const layoutActiveSceneGroupIds = layout => {
    const activeSceneId = String(layout?.activeSceneId || "");
    if (!activeSceneId) return null;
    const scene = (layout.scenes || []).find(entry => String(entry.id || "") === activeSceneId);
    if (!scene) return null;
    return {
      groupIds: new Set((scene.groupIds || []).map(id => String(id || ""))),
      includeUngrouped: scene.includeUngrouped === true
    };
  };

  const windowAllowedByGroupAndScene = (layoutId, layout, win) => {
    const groupId = String(win?.groupId || "");
    const sceneInfo = layoutActiveSceneGroupIds(layout);
    if (sceneInfo) {
      if (groupId) {
        if (!sceneInfo.groupIds.has(groupId)) return false;
      } else if (!sceneInfo.includeUngrouped) {
        return false;
      }
    }
    if (!groupId) return true;
    const group = (layout.groups || []).find(entry => String(entry.id || "") === groupId) || { id: groupId, visible: true };
    return groupVisibleInRuntime(layoutId, group);
  };


  const resolveAssetImage = (layout, assetKey) => {
    const key = String(assetKey || "").trim();
    if (!key) return null;
    const library = layout?.assetLibrary || layout?.assets || {};
    const asset = library && typeof library === "object" ? library[key] : null;
    if (!asset || typeof asset !== "object") return null;
    const folder = String(asset.folder || "").trim();
    const fileName = String(asset.fileName || asset.name || "").trim();
    if (!folder || !fileName) return null;
    return { folder, fileName };
  };

  const findLayoutById = layoutId => {
    const layouts = allLayouts();
    const id = String(layoutId || "").trim();
    return id && layouts[id] ? { layoutId: id, layout: layouts[id] } : null;
  };

  const findWindowInLayout = (layoutId, windowId) => {
    const found = findLayoutById(layoutId);
    if (!found) return null;
    const win = (found.layout.windows || []).find(entry => entry.id === String(windowId || ""));
    return win ? Object.assign(found, { win }) : null;
  };

  const setRuntimeWindowFields = (layoutId, windowId, fields, commandName) => {
    const found = findWindowInLayout(layoutId, windowId);
    if (!found) {
      console.warn(`[DB_UIComposer] ${commandName} target window not found`, { layoutId, windowId });
      return false;
    }
    Object.assign(runtimeWindowOverride(found.layoutId, found.win.id, true), fields || {});
    log(`${commandName} applied`, { layoutId: found.layoutId, windowId: found.win.id, fields });
    refreshScene();
    return true;
  };

  const appendRuntimeLogText = (layoutId, windowId, text, options = {}) => {
    const found = findWindowInLayout(layoutId, windowId);
    if (!found) {
      console.warn("[DB_UIComposer] AddLogText target window not found", { layoutId, windowId });
      return false;
    }
    const currentWindow = applyRuntimeStateToWindow(found.layoutId, found.win);
    const current = normalizeLogState(currentWindow.log);
    const addLines = String(text ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
    const maxLines = Math.max(1, toNumber(options.maxLines, current.maxLines || 200));
    const nextLines = current.lines.concat(addLines).slice(-maxLines);
    const next = normalizeLogState(Object.assign({}, current, {
      enabled: true,
      lines: nextLines,
      maxLines,
      autoScrollBottom: toBool(options.scrollToBottom, true),
      scrollY: toBool(options.scrollToBottom, true) ? 999999999 : current.scrollY,
      zOrder: options.zOrder === undefined ? current.zOrder : toNumber(options.zOrder, current.zOrder)
    }));
    const winState = runtimeWindowOverride(found.layoutId, found.win.id, true);
    winState.log = next;
    log("AddLogText applied", { layoutId: found.layoutId, windowId: found.win.id, addLines, maxLines, scrollToBottom: next.autoScrollBottom });
    if (!refreshRuntimeWindowOnly(found.layoutId, found.win.id)) refreshScene();
    return true;
  };

  const appendRuntimeItemLogText = (layoutId, windowId, itemId, text) => {
    const found = findWindowInLayout(layoutId, windowId);
    if (!found) {
      console.warn("[DB_UIComposer] AddItemLogText target window not found", { layoutId, windowId, itemId });
      return false;
    }
    const currentWindow = applyRuntimeStateToWindow(found.layoutId, found.win);
    const item = (currentWindow.items || []).find(entry => entry.id === String(itemId || ""));
    if (!item || item.type !== "log") {
      console.warn("[DB_UIComposer] AddItemLogText target log item not found", { layoutId, windowId, itemId });
      return false;
    }
    const currentLines = Array.isArray(item.lines) ? item.lines : [];
    const addLines = String(text ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").map(line => ({ text: line, age: 0 }));
    const maxLines = Math.max(1, toNumber(item.maxLines, 8));
    const nextLines = currentLines.concat(addLines).slice(-maxLines);
    const itemState = runtimeItemOverride(found.layoutId, found.win.id, item.id, true);
    itemState.lines = nextLines;
    log("AddItemLogText applied", { layoutId: found.layoutId, windowId: found.win.id, itemId: item.id, text });
    if (!refreshRuntimeWindowOnly(found.layoutId, found.win.id)) refreshScene();
    return true;
  };

  const clearRuntimeItemLog = (layoutId, windowId, itemId) => {
    const found = findWindowInLayout(layoutId, windowId);
    if (!found) return false;
    const item = (found.win.items || []).find(entry => entry.id === String(itemId || ""));
    if (!item || item.type !== "log") return false;
    runtimeItemOverride(found.layoutId, found.win.id, item.id, true).lines = [];
    if (!refreshRuntimeWindowOnly(found.layoutId, found.win.id)) refreshScene();
    return true;
  };

  const clearRuntimeLog = (layoutId, windowId) => {
    const found = findWindowInLayout(layoutId, windowId);
    if (!found) {
      console.warn("[DB_UIComposer] ClearLog target window not found", { layoutId, windowId });
      return false;
    }
    const currentWindow = applyRuntimeStateToWindow(found.layoutId, found.win);
    const current = normalizeLogState(currentWindow.log);
    const winState = runtimeWindowOverride(found.layoutId, found.win.id, true);
    winState.log = normalizeLogState(Object.assign({}, current, { enabled: true, lines: [], scrollY: 0, autoScrollBottom: true }));
    log("ClearLog applied", { layoutId: found.layoutId, windowId: found.win.id });
    refreshScene();
    return true;
  };

  const setRuntimeLogScroll = (layoutId, windowId, scrollY) => {
    const found = findWindowInLayout(layoutId, windowId);
    if (!found) {
      console.warn("[DB_UIComposer] SetLogScroll target window not found", { layoutId, windowId });
      return false;
    }
    const currentWindow = applyRuntimeStateToWindow(found.layoutId, found.win);
    const current = normalizeLogState(currentWindow.log);
    const winState = runtimeWindowOverride(found.layoutId, found.win.id, true);
    winState.log = normalizeLogState(Object.assign({}, current, {
      enabled: true,
      scrollY: Math.max(0, toNumber(scrollY, 0)),
      autoScrollBottom: false
    }));
    log("SetLogScroll applied", { layoutId: found.layoutId, windowId: found.win.id, scrollY });
    refreshScene();
    return true;
  };

  const parseRuntimeImagePath = (path, fallbackFolder, fallbackFileName) => {
    const text = String(path || "").trim().replace(/\\/g, "/").replace(/^img\//i, "").replace(/^\/+|\/+$/g, "");
    if (!text) {
      return {
        folder: String(fallbackFolder || "pictures").trim(),
        fileName: String(fallbackFileName || "").trim().replace(/\.(png|jpg|jpeg|webp|gif|bmp)$/i, "")
      };
    }
    const index = text.lastIndexOf("/");
    if (index < 0) {
      return {
        folder: String(fallbackFolder || "pictures").trim(),
        fileName: text.replace(/\.(png|jpg|jpeg|webp|gif|bmp)$/i, "")
      };
    }
    return {
      folder: text.slice(0, index),
      fileName: text.slice(index + 1).replace(/\.(png|jpg|jpeg|webp|gif|bmp)$/i, "")
    };
  };

  const setRuntimeWindowImageLayer = (layoutId, windowId, layerName, args, commandName) => {
    const found = findWindowInLayout(layoutId, windowId);
    if (!found) {
      console.warn(`[DB_UIComposer] ${commandName} target window not found`, { layoutId, windowId });
      return false;
    }
    const currentWindow = applyRuntimeStateToWindow(found.layoutId, found.win);
    const normalizer = layerName === "decorationImage" ? normalizeDecorationImage : normalizeBackgroundImage;
    const current = normalizer(currentWindow[layerName]);
    const parsed = parseRuntimeImagePath(args.image, args.folder || current.folder, args.fileName || current.fileName);
    const enabled = toBool(args.enabled, true);
    const fileName = String(parsed.fileName || "").trim();
    if (enabled && !fileName) {
      console.warn(`[DB_UIComposer] ${commandName} fileName is empty`, { layoutId: found.layoutId, windowId: found.win.id, layerName, args });
      return false;
    }
    const next = normalizer(Object.assign({}, current, {
      enabled,
      folder: String(parsed.folder || current.folder || "pictures").trim(),
      fileName,
      mode: String(args.mode || current.mode || "stretch"),
      opacity: clamp(toNumber(args.opacity, current.opacity ?? 255), 0, 255),
      zOrder: toNumber(args.zOrder, current.zOrder ?? (layerName === "decorationImage" ? 100 : -100))
    }));
    return setRuntimeWindowFields(found.layoutId, found.win.id, { [layerName]: next }, commandName);
  };

  const setRuntimeItemFields = (layoutId, windowId, itemId, fields, commandName) => {
    const found = findWindowInLayout(layoutId, windowId);
    if (!found) {
      console.warn(`[DB_UIComposer] ${commandName} target window not found`, { layoutId, windowId, itemId });
      return false;
    }
    const item = (found.win.items || []).find(entry => entry.id === String(itemId || ""));
    if (!item) {
      console.warn(`[DB_UIComposer] ${commandName} target item not found`, { layoutId, windowId, itemId });
      return false;
    }
    Object.assign(runtimeItemOverride(found.layoutId, found.win.id, item.id, true), fields || {});
    log(`${commandName} applied`, { layoutId: found.layoutId, windowId: found.win.id, itemId: item.id, fields });
    if (!refreshRuntimeWindowOnly(found.layoutId, found.win.id)) refreshScene();
    return true;
  };

  const parseCompositeLayersJson = value => {
    const raw = String(value || "[]").trim();
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return normalizeCompositeImageLayers(Array.isArray(parsed) ? parsed : []);
    } catch (error) {
      console.error("[DB_UIComposer] composite layers JSON parse error", error, raw);
      return null;
    }
  };

  const setRuntimeCompositeImageSet = (layoutId, windowId, itemId, layersJson) => {
    const layers = parseCompositeLayersJson(layersJson);
    if (!layers) return false;
    return setRuntimeItemFields(layoutId, windowId, itemId, {
      layers
    }, "SetCompositeImageSet");
  };

  const fadeInRuntimeCompositeImage = (layoutId, windowId, itemId, args = {}) => {
    const found = findWindowInLayout(layoutId, windowId);
    if (!found) {
      console.warn("[DB_UIComposer] FadeInCompositeImage target window not found", { layoutId, windowId, itemId });
      return false;
    }
    const current = applyRuntimeStateToWindow(found.layoutId, found.win);
    const item = (current.items || []).find(entry => String(entry.id || "") === String(itemId || ""));
    if (!item) {
      console.warn("[DB_UIComposer] FadeInCompositeImage target item not found", { layoutId, windowId, itemId });
      return false;
    }
    const targetOpacity = clamp(toNumber(item.opacity, 255), 0, 255);
    const duration = Math.max(1, toNumber(args.duration, 30));
    return setRuntimeItemFields(found.layoutId, found.win.id, item.id, {
      visible: toBool(args.visible, true),
      opacity: 0,
      _dbUiFade: { type: "opacity", from: 0, to: targetOpacity, duration, frame: 0 }
    }, "FadeInCompositeImage");
  };

  const optionalNumber = (value, fallback) => {
    if (value === undefined || value === null) return fallback;
    const raw = String(value).trim();
    if (raw === "") return fallback;
    return toNumber(raw, fallback);
  };

  const normalizedEasingName = value => {
    const name = String(value || "linear");
    return ["linear", "easeIn", "easeOut", "easeInOut"].includes(name) ? name : "linear";
  };

  const easedRate = (rate, easing) => {
    const t = clamp(toNumber(rate, 0), 0, 1);
    switch (normalizedEasingName(easing)) {
      case "easeIn": return t * t;
      case "easeOut": return 1 - Math.pow(1 - t, 2);
      case "easeInOut": return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      default: return t;
    }
  };

  const itemCurrentScalePercent = (item, axis) => {
    const percentKey = axis === "scaleY" ? "scaleYPercent" : "scaleXPercent";
    if (item && item[percentKey] !== undefined && item[percentKey] !== null && item[percentKey] !== "") {
      return Math.max(0.01, toNumber(item[percentKey], 100));
    }
    return Math.max(0.01, imageScaleRate(item, axis) * 100);
  };

  const moveRuntimeItem = (layoutId, windowId, itemId, args = {}) => {
    const found = findWindowInLayout(layoutId, windowId);
    if (!found) {
      console.warn("[DB_UIComposer] MoveItem target window not found", { layoutId, windowId, itemId });
      return null;
    }
    const currentWindow = applyRuntimeStateToWindow(found.layoutId, found.win);
    const item = (currentWindow.items || []).find(entry => String(entry.id || "") === String(itemId || ""));
    if (!item) {
      console.warn("[DB_UIComposer] MoveItem target item not found", { layoutId: found.layoutId, windowId: found.win.id, itemId });
      return null;
    }
    const from = {
      x: toNumber(item.x, 0),
      y: toNumber(item.y, 0),
      scaleXPercent: itemCurrentScalePercent(item, "scaleX"),
      scaleYPercent: itemCurrentScalePercent(item, "scaleY"),
      opacity: clamp(toNumber(item.opacity, 255), 0, 255)
    };
    const to = {
      x: optionalNumber(args.x, from.x),
      y: optionalNumber(args.y, from.y),
      scaleXPercent: Math.max(0.01, optionalNumber(args.scaleXPercent, from.scaleXPercent)),
      scaleYPercent: Math.max(0.01, optionalNumber(args.scaleYPercent, from.scaleYPercent)),
      opacity: clamp(optionalNumber(args.opacity, from.opacity), 0, 255)
    };
    const duration = Math.max(0, Math.floor(toNumber(args.duration, 60)));
    const itemState = runtimeItemOverride(found.layoutId, found.win.id, item.id, true);
    if (duration <= 0) {
      Object.assign(itemState, {
        x: to.x,
        y: to.y,
        scaleXPercent: to.scaleXPercent,
        scaleYPercent: to.scaleYPercent,
        scaleX: to.scaleXPercent / 100,
        scaleY: to.scaleYPercent / 100,
        opacity: to.opacity
      });
      delete itemState._dbUiMove;
      log("MoveItem applied instantly", { layoutId: found.layoutId, windowId: found.win.id, itemId: item.id, to });
      if (!refreshRuntimeWindowOnly(found.layoutId, found.win.id)) refreshScene();
      return { layoutId: found.layoutId, windowId: found.win.id, itemId: item.id, duration: 0 };
    }
    itemState._dbUiMove = {
      type: "moveItem",
      from,
      to,
      duration,
      frame: 0,
      easing: normalizedEasingName(args.easing)
    };
    // 開始値を明示しておくと、途中から別移動をかけた場合にも現在位置から滑らかに繋がります。
    Object.assign(itemState, {
      x: from.x,
      y: from.y,
      scaleXPercent: from.scaleXPercent,
      scaleYPercent: from.scaleYPercent,
      scaleX: from.scaleXPercent / 100,
      scaleY: from.scaleYPercent / 100,
      opacity: from.opacity
    });
    log("MoveItem started", { layoutId: found.layoutId, windowId: found.win.id, itemId: item.id, from, to, duration, easing: itemState._dbUiMove.easing });
    if (!refreshRuntimeWindowOnly(found.layoutId, found.win.id)) refreshScene();
    return { layoutId: found.layoutId, windowId: found.win.id, itemId: item.id, duration };
  };

  const setRuntimeGroupVisible = (layoutId, groupId, visible) => {
    const found = findLayoutById(layoutId || DEFAULT_LAYOUT_ID);
    if (!found) {
      console.warn("[DB_UIComposer] SetGroupVisible target layout not found", { layoutId, groupId });
      return false;
    }
    const id = String(groupId || "");
    if (!id) {
      console.warn("[DB_UIComposer] SetGroupVisible groupId is empty", { layoutId: found.layoutId });
      return false;
    }
    ensureSystemStore();
    $gameSystem._dbUiComposerGroupVisible[groupRuntimeKey(found.layoutId, id)] = !!visible;
    log("SetGroupVisible applied", { layoutId: found.layoutId, groupId: id, visible: !!visible });
    refreshScene();
    return true;
  };

  const findWindowData = windowId => {
    const layouts = allLayouts();
    for (const layoutId of Object.keys(layouts)) {
      const layout = layouts[layoutId];
      const win = (layout.windows || []).find(w => w.id === windowId);
      if (win) return { layout, win };
    }
    return null;
  };

  const findOrCreateLayout = layoutId => {
    const layouts = allLayouts();
    const id = String(layoutId || DEFAULT_LAYOUT_ID);
    if (!layouts[id]) layouts[id] = normalizeLayout({ layoutId: id, windows: [] });
    return layouts[id];
  };

  const findOrCreateWindow = (layoutId, windowId) => {
    const layout = findOrCreateLayout(layoutId);
    let win = layout.windows.find(w => w.id === windowId);
    if (!win) {
      win = {
        id: String(windowId || `window${layout.windows.length + 1}`),
        x: 20,
        y: 20,
        width: 300,
        height: 120,
        opacity: 255,
        contentsOpacity: 255,
        layer: "mapUi",
        zOrder: 0,
        visible: true,
        frameVisible: true,
        backgroundType: "normal",
        placementArea: normalizePlacementArea(null),
        backgroundImage: normalizeBackgroundImage(null),
        decorationImage: normalizeDecorationImage(null),
        items: []
      };
      layout.windows.push(win);
    }
    return win;
  };

  const upsertItem = (win, item) => {
    win.items = Array.isArray(win.items) ? win.items : [];
    const index = win.items.findIndex(i => i.id === item.id);
    if (index >= 0) win.items[index] = Object.assign({}, win.items[index], item);
    else win.items.push(item);
  };

  const refreshScene = () => {
    const scene = SceneManager._scene;
    if (scene && typeof scene.dbUiComposerRefresh === "function") {
      scene.dbUiComposerRefresh();
    }
  };

  const refreshRuntimeWindowOnly = (layoutId, windowId) => {
    const scene = SceneManager._scene;
    const windows = scene && Array.isArray(scene._dbUiComposerWindows) ? scene._dbUiComposerWindows : [];
    const target = windows.find(win =>
      win &&
      win._dbUiComposerLayoutId === layoutId &&
      win._dbUiComposerWindowId === windowId &&
      typeof win.applyDefinition === "function" &&
      typeof win.refresh === "function" &&
      (!win.isDbUiAlive || win.isDbUiAlive())
    );
    if (!target) return false;
    const found = findWindowInLayout(layoutId, windowId);
    if (!found) return false;
    const layout = findOrCreateLayout(found.layoutId);
    const definition = applyRuntimeStateToWindow(found.layoutId, found.win);
    definition.layoutSettings = layout.settings || definition.layoutSettings || {};
    target.applyDefinition(definition);
    target.refresh();
    log("refresh target window only", { layoutId: found.layoutId, windowId: found.win.id });
    return true;
  };

  const applyLayout = (layout, clearBefore) => {
    const layouts = allLayouts();
    const normalized = normalizeLayout(layout);
    if (clearBefore) {
      $gameSystem._dbUiComposerLayouts = {};
      $gameSystem._dbUiComposerHiddenLayouts = {};
      $gameSystem._dbUiComposerWindowVisible = {};
      $gameSystem._dbUiComposerRuntimeStates = {};
    }
    $gameSystem._dbUiComposerLayouts[normalized.layoutId] = normalized;
    delete $gameSystem._dbUiComposerHiddenLayouts[normalized.layoutId];
    log("applyLayout", debugLayoutSummary(normalized));
    refreshScene();
  };

  const loadTextFile = (url, onLoad, onError) => {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", url);
    xhr.overrideMimeType("application/json");
    xhr.onload = () => {
      if (xhr.status < 400) onLoad(xhr.responseText);
      else onError(new Error(`Failed to load ${url}: ${xhr.status}`));
    };
    xhr.onerror = () => onError(new Error(`Failed to load ${url}`));
    xhr.send();
  };

  class DB_UIComposerWindow extends Window_Base {
    initialize(definition) {
      this._dbUiDefinition = cloneJson(definition);
      this._dbUiLastValueSignature = "";
      this._dbUiDisposed = false;
      this._dbUiButtonHoverId = "";
      this._dbUiButtonPressedId = "";
      this._dbUiButtonReleaseId = "";
      this._dbUiButtonReleaseFrames = 0;
      this._dbUiButtonPressFrameId = "";
      this._dbUiButtonPressFrames = 0;
      this._dbUiButtonPressActionId = "";
      this._dbUiChoicePressedId = "";
      this._dbUiChoicePressedIndex = -1;
      this._dbUiChoicePressFrames = 0;
      this._dbUiChoiceTextCache = {};
      this._dbUiTextBitmapCache = {};
      this._dbUiFontWaitTimer = null;
      this._dbUiFontWaitStart = 0;
      this._dbUiFontWaitTimedOut = false;
      this._dbUiImageChoiceHoverId = "";
      this._dbUiImageChoicePressedId = "";
      this._dbUiImageChoicePressFrames = 0;
      this._dbUiWindowScrollBarDrag = null;
      const rect = new Rectangle(
        toNumber(definition.x, 0),
        toNumber(definition.y, 0),
        Math.max(1, toNumber(definition.width, 240)),
        Math.max(1, toNumber(definition.height, 120))
      );
      super.initialize(rect);
      this.createDbUiOverlaySprite();
      this.applyDefinition(definition);
      this.refresh("initialize");
    }

    isDbUiAlive() {
      // Bitmapの非同期読込完了後に、既にScene更新で破棄された古いウィンドウへ
      // refreshが戻ってくることがあります。PIXIのdestroy済みSpriteはpositionがnullに
      // なるため、その状態でx/yを設定すると「Cannot read property 'position' of null」
      // が発生します。ここで古いウィンドウを明確に弾きます。
      return !this._dbUiDisposed && !this.destroyed && !!this.position;
    }

    destroy(options) {
      this._dbUiDisposed = true;
      this._dbUiOverlaySprite = null;
      Window_Base.prototype.destroy.call(this, options);
    }

    applyDefinition(definition) {
      definition = adjustWindowDefinitionForChoiceLists(definition);
      this._dbUiDefinition = cloneJson(definition);
      this._dbUiChoiceTextCache = {};
      this._dbUiTextBitmapCache = {};
      this._dbUiImageChoiceTextCache = {};
      this._dbUiLayoutSettings = Object.assign({}, definition.layoutSettings || {});
      ensureLayoutFont(this._dbUiLayoutSettings);
      const wx = toNumber(definition.x, 0);
      const wy = toNumber(definition.y, 0);
      const ww = Math.max(1, toNumber(definition.width, 240));
      const wh = Math.max(1, toNumber(definition.height, 120));
      // MZのWindowはwidth/heightを直接変えるだけだと、frame/clientAreaが古いサイズのまま残る場合があります。
      // 可変選択肢で高さが変わる時は必ずmove()で標準部品も更新します。
      this.move(wx, wy, ww, wh);
      const pad = Math.max(0, toNumber(definition.padding, toNumber(this._dbUiLayoutSettings.padding, 12)));
      if (this.padding !== pad) this.padding = pad;
      const skinName = String(definition.windowSkinName || this._dbUiLayoutSettings.windowSkinName || "Window").replace(/\.png$/i, "");
      if (skinName) this.windowskin = ImageManager.loadSystem(skinName);
      this.contentsOpacity = clamp(toNumber(definition.contentsOpacity, 255), 0, 255);
      if (this._dbUiOverlaySprite) this._dbUiOverlaySprite.alpha = this.contentsOpacity / 255;
      this.visible = toBool(definition.visible, true);
      this.applyDbUiWindowVisuals(definition);
      this.createContents();
    }

    lineHeight() {
      const w = toNumber(this._dbUiDefinition?.lineHeight, 0);
      if (w > 0) return w;
      const v = toNumber(this._dbUiLayoutSettings?.lineHeight, 0);
      return v > 0 ? v : Window_Base.prototype.lineHeight.call(this);
    }

    resetFontSettings() {
      Window_Base.prototype.resetFontSettings.call(this);
      const s = this._dbUiLayoutSettings || {};
      const fontFamily = ensureLayoutFont(s);
      if (fontFamily) this.contents.fontFace = fontFamily;
      const size = toNumber(s.defaultFontSize, 0);
      if (size > 0) this.contents.fontSize = size;
      if (s.textColor) this.contents.textColor = String(s.textColor);
      if (s.outlineColor) this.contents.outlineColor = String(s.outlineColor);
      if (s.outlineWidth !== undefined) this.contents.outlineWidth = Math.max(0, toNumber(s.outlineWidth, this.contents.outlineWidth));
      const win = this._dbUiDefinition || {};
      if (win.fontFamily) this.contents.fontFace = String(win.fontFamily);
      if (toNumber(win.fontSize, 0) > 0) this.contents.fontSize = Math.max(1, toNumber(win.fontSize, 0));
      if (win.textColor) this.contents.textColor = String(win.textColor);
      if (win.outlineColor) this.contents.outlineColor = String(win.outlineColor);
      if (win.outlineWidth !== undefined) this.contents.outlineWidth = Math.max(0, toNumber(win.outlineWidth, this.contents.outlineWidth));
      // hover等の再描画時に、前に描いたパーツの太字/斜体状態が残らないよう明示的に初期化します。
      this.contents.fontBold = false;
      this.contents.fontItalic = false;
    }

    textYOffset() {
      return toNumber(this._dbUiLayoutSettings?.textYOffset, 0);
    }

    applyDbUiWindowVisuals(definition) {
      const bgType = String(definition.backgroundType || "normal");
      const frameVisible = toBool(definition.frameVisible, true);
      const baseOpacity = clamp(toNumber(definition.opacity, 255), 0, 255);

      // MZ標準の setBackgroundType("transparent") は this.opacity を0にするため、
      // 背景だけでなく標準枠まで消えてしまう。
      // UIComposerでは「透明背景 + 標準枠あり」を使いたいため、
      // 背景透明時は backOpacity を0にし、frameVisibleがONなら opacity を戻して枠だけ表示する。
      this.setBackgroundType(backgroundTypeNumber(bgType));

      if (bgType === "transparent") {
        this.opacity = frameVisible ? baseOpacity : 0;
        this.backOpacity = 0;
      } else if (bgType === "dim") {
        this.opacity = frameVisible ? baseOpacity : 0;
        this.backOpacity = 0;
      } else {
        this.opacity = baseOpacity;
        this.backOpacity = clamp(toNumber(definition.backOpacity, baseOpacity), 0, 255);
      }

      this.setFrameVisible(frameVisible);
    }

    setFrameVisible(visible) {
      this.frameVisible = visible;
      if (this._frameSprite) this._frameSprite.visible = visible;
      if (this._clientArea) this._clientArea.visible = true;
    }

    isDbUiAlive() {
      return !this._dbUiDisposed && !this._destroyed && !!this.transform;
    }

    destroy(options) {
      this._dbUiDisposed = true;
      Window_Base.prototype.destroy.call(this, options);
    }

    createDbUiOverlaySprite() {
      if (!this.isDbUiAlive()) return;
      if (this._dbUiOverlaySprite) {
        if (this._dbUiOverlaySprite.transform) return;
        this._dbUiOverlaySprite = null;
      }
      this._dbUiOverlaySprite = new Sprite();
      this._dbUiOverlaySprite.bitmap = new Bitmap(1, 1);
      this._dbUiOverlaySprite.z = 1000;
      this.addChild(this._dbUiOverlaySprite);
    }

    placementMetrics() {
      const def = this._dbUiDefinition || {};
      const pad = Math.max(0, toNumber(def.padding, toNumber(this._dbUiLayoutSettings?.padding, 12)));
      const area = normalizePlacementArea(def.placementArea);
      const contentLeft = pad - area.extendLeft;
      const contentTop = pad - area.extendTop;
      const contentWidth = Math.max(1, this.width - pad * 2 + area.extendLeft + area.extendRight);
      const contentHeight = Math.max(1, this.height - pad * 2 + area.extendTop + area.extendBottom);

      let minX = Math.min(0, contentLeft);
      let minY = Math.min(0, contentTop);
      let maxX = Math.max(this.width, contentLeft + contentWidth);
      let maxY = Math.max(this.height, contentTop + contentHeight);

      for (const item of def.items || []) {
        if (item.visible === false || item.allowOutsideWindow !== true) continue;
        const b = estimatedItemBounds(item);
        const left = contentLeft + b.x;
        const top = contentTop + b.y;
        minX = Math.min(minX, left);
        minY = Math.min(minY, top);
        maxX = Math.max(maxX, left + b.width);
        maxY = Math.max(maxY, top + b.height);
      }

      const originX = Math.floor(minX);
      const originY = Math.floor(minY);
      return {
        pad,
        contentLeft,
        contentTop,
        contentWidth,
        contentHeight,
        originX,
        originY,
        layerWidth: Math.max(1, Math.ceil(maxX - originX)),
        layerHeight: Math.max(1, Math.ceil(maxY - originY)),
        itemOffsetX: contentLeft - originX,
        itemOffsetY: contentTop - originY,
        contentOffsetX: contentLeft - originX,
        contentOffsetY: contentTop - originY,
        windowOffsetX: -originX,
        windowOffsetY: -originY
      };
    }

    windowScrollEnabled() {
      return toBool(this._dbUiDefinition?.scrollEnabled, false);
    }

    windowScrollbarVisible() {
      return this.windowScrollEnabled() && toBool(this._dbUiDefinition?.scrollbarVisible, true);
    }

    windowAutoScrollContentHeight(metrics) {
      const def = this._dbUiDefinition || {};
      let maxBottom = Math.max(1, metrics.contentHeight);
      for (const item of def.items || []) {
        if (!item || item.visible === false) continue;
        const b = estimatedItemBounds(item);
        maxBottom = Math.max(maxBottom, toNumber(b.y, 0) + Math.max(1, toNumber(b.height, 1)) + 4);
      }
      return Math.max(1, Math.ceil(maxBottom));
    }

    windowScrollContentHeight(metrics) {
      const manual = toNumber(this._dbUiDefinition?.scrollContentHeight, 0);
      return manual > 0 ? Math.max(1, manual) : this.windowAutoScrollContentHeight(metrics);
    }

    windowScrollMax(metrics = null) {
      if (!this.windowScrollEnabled()) return 0;
      metrics = metrics || this.placementMetrics();
      return Math.max(0, Math.ceil(this.windowScrollContentHeight(metrics) - metrics.contentHeight));
    }

    windowScrollY(metrics = null) {
      return clamp(toNumber(this._dbUiDefinition?.scrollY, 0), 0, this.windowScrollMax(metrics));
    }

    setWindowScrollY(value, reason = "windowScroll") {
      const metrics = this.placementMetrics();
      const next = clamp(toNumber(value, 0), 0, this.windowScrollMax(metrics));
      const current = this.windowScrollY(metrics);
      if (next === current) return false;
      this._dbUiDefinition.scrollY = next;
      const layoutId = this._dbUiComposerLayoutId || DEFAULT_LAYOUT_ID;
      const windowId = this._dbUiComposerWindowId || this._dbUiDefinition?.id || "";
      if (layoutId && windowId) {
        const winState = runtimeWindowOverride(layoutId, windowId, true);
        winState.scrollY = next;
      }
      this.refresh(reason);
      return true;
    }

    updateWindowScroll() {
      if (!this.visible || !this.isOpen()) return;
      if (!this.windowScrollEnabled()) return;
      const wheelY = toNumber(TouchInput.wheelY, 0);
      if (!wheelY) return;
      const mx = toNumber(TouchInput.x, -999999);
      const my = toNumber(TouchInput.y, -999999);
      if (mx < this.x || my < this.y || mx >= this.x + this.width || my >= this.y + this.height) return;
      const metrics = this.placementMetrics();
      const current = this.windowScrollY(metrics);
      const max = this.windowScrollMax(metrics);
      if (max <= 0) return;
      const localX = mx - this.x - metrics.contentLeft;
      const localY = my - this.y - metrics.contentTop + current;
      const overChoice = this.choiceListBoxHitAt ? this.choiceListBoxHitAt(localX, localY, mx, my) : null;
      if (overChoice) {
        const choiceMax = Math.max(0, choiceListEntries(overChoice).length - choiceListVisibleRows(overChoice));
        if (choiceMax > 0) return;
      }
      const step = Math.max(8, Math.floor(Math.abs(wheelY)) || 24);
      this.setWindowScrollY(current + (wheelY > 0 ? step : -step), "windowWheelScroll");
    }

    drawWindowScrollbar(metrics) {
      if (!this.windowScrollbarVisible()) return;
      const max = this.windowScrollMax(metrics);
      if (max <= 0) return;
      const scrollY = this.windowScrollY(metrics);
      const width = Math.max(4, toNumber(this._dbUiDefinition?.scrollbarWidth, 8));
      const margin = Math.max(0, toNumber(this._dbUiDefinition?.scrollbarMargin, 4));
      const x = metrics.windowOffsetX + this.width - width - margin;
      const y = metrics.windowOffsetY + metrics.pad;
      const trackH = Math.max(1, this.height - metrics.pad * 2);
      const contentH = this.windowScrollContentHeight(metrics);
      const thumbH = Math.max(12, Math.floor(trackH * metrics.contentHeight / Math.max(metrics.contentHeight, contentH)));
      const thumbRange = Math.max(0, trackH - thumbH);
      const thumbY = y + (max > 0 ? Math.round(thumbRange * scrollY / max) : 0);
      const oldOpacity = this.contents.paintOpacity;
      this.contents.paintOpacity = clamp(toNumber(this._dbUiDefinition?.scrollbarOpacity, 220), 0, 255);
      this.contents.fillRect(x, y, width, trackH, String(this._dbUiDefinition?.scrollbarTrackColor || "rgba(0,0,0,0.35)"));
      this.contents.paintOpacity = 255;
      this.contents.fillRect(x, thumbY, width, thumbH, String(this._dbUiDefinition?.scrollbarThumbColor || "rgba(255,255,255,0.70)"));
      this.contents.paintOpacity = oldOpacity;
    }

    update() {
      super.update();
      this.updateDynamicRefresh();
      this.updateDbUiMoves();
      this.updateDbUiFades();
      this.updateDbUiLogItems();
      this.updateLogScroll();
      this.updateChoiceLists();
      this.updateImageChoiceLists();
      this.updateButtons();
      this.updateWindowScroll();
    }

    updateDbUiMoves() {
      const layoutId = this._dbUiComposerLayoutId;
      const windowId = this._dbUiComposerWindowId;
      if (!layoutId || !windowId) return;
      let changed = false;
      for (const item of this._dbUiDefinition.items || []) {
        const move = item && item._dbUiMove;
        if (!move || move.type !== "moveItem") continue;
        const duration = Math.max(1, toNumber(move.duration, 60));
        const frame = Math.min(duration, Math.max(0, toNumber(move.frame, 0) + 1));
        const from = move.from || {};
        const to = move.to || {};
        const rate = easedRate(frame / duration, move.easing);
        const x = Math.round(toNumber(from.x, toNumber(item.x, 0)) + (toNumber(to.x, toNumber(from.x, toNumber(item.x, 0))) - toNumber(from.x, toNumber(item.x, 0))) * rate);
        const y = Math.round(toNumber(from.y, toNumber(item.y, 0)) + (toNumber(to.y, toNumber(from.y, toNumber(item.y, 0))) - toNumber(from.y, toNumber(item.y, 0))) * rate);
        const sx = Math.max(0.01, Math.round((toNumber(from.scaleXPercent, itemCurrentScalePercent(item, "scaleX")) + (toNumber(to.scaleXPercent, toNumber(from.scaleXPercent, itemCurrentScalePercent(item, "scaleX"))) - toNumber(from.scaleXPercent, itemCurrentScalePercent(item, "scaleX"))) * rate) * 100) / 100);
        const sy = Math.max(0.01, Math.round((toNumber(from.scaleYPercent, itemCurrentScalePercent(item, "scaleY")) + (toNumber(to.scaleYPercent, toNumber(from.scaleYPercent, itemCurrentScalePercent(item, "scaleY"))) - toNumber(from.scaleYPercent, itemCurrentScalePercent(item, "scaleY"))) * rate) * 100) / 100);
        const opacity = clamp(Math.round(toNumber(from.opacity, toNumber(item.opacity, 255)) + (toNumber(to.opacity, toNumber(from.opacity, toNumber(item.opacity, 255))) - toNumber(from.opacity, toNumber(item.opacity, 255))) * rate), 0, 255);
        const itemState = runtimeItemOverride(layoutId, windowId, item.id, true);
        Object.assign(itemState, {
          x,
          y,
          scaleXPercent: sx,
          scaleYPercent: sy,
          scaleX: sx / 100,
          scaleY: sy / 100,
          opacity
        });
        Object.assign(item, itemState);
        if (frame >= duration) {
          delete itemState._dbUiMove;
          delete item._dbUiMove;
        } else {
          itemState._dbUiMove = Object.assign({}, move, { frame });
          item._dbUiMove = itemState._dbUiMove;
        }
        changed = true;
      }
      if (changed) this.refresh("moveItem");
    }

    updateDbUiFades() {
      const layoutId = this._dbUiComposerLayoutId;
      const windowId = this._dbUiComposerWindowId;
      if (!layoutId || !windowId) return;
      let changed = false;
      for (const item of this._dbUiDefinition.items || []) {
        const fade = item && item._dbUiFade;
        if (!fade || fade.type !== "opacity") continue;
        const duration = Math.max(1, toNumber(fade.duration, 30));
        const frame = Math.min(duration, Math.max(0, toNumber(fade.frame, 0) + 1));
        const from = clamp(toNumber(fade.from, 0), 0, 255);
        const to = clamp(toNumber(fade.to, 255), 0, 255);
        const opacity = Math.round(from + (to - from) * frame / duration);
        const itemState = runtimeItemOverride(layoutId, windowId, item.id, true);
        itemState.opacity = opacity;
        if (frame >= duration) {
          delete itemState._dbUiFade;
          delete item._dbUiFade;
        } else {
          itemState._dbUiFade = Object.assign({}, fade, { frame });
          item._dbUiFade = itemState._dbUiFade;
        }
        item.opacity = opacity;
        changed = true;
      }
      if (changed) this.refresh("fade");
    }

    updateDbUiLogItems() {
      const layoutId = this._dbUiComposerLayoutId;
      const windowId = this._dbUiComposerWindowId;
      if (!layoutId || !windowId) return;
      let changed = false;
      for (const item of this._dbUiDefinition.items || []) {
        if (!item || item.type !== "log") continue;
        const lines = Array.isArray(item.lines) ? item.lines : [];
        if (!lines.length) continue;
        const display = Math.max(0, toNumber(item.displayFrames, 180));
        const fade = Math.max(0, toNumber(item.fadeFrames, 30));
        const move = Math.max(0, toNumber(item.moveFrames, 20));
        const total = display + fade + move;
        const next = lines.map(line => {
          const src = line && typeof line === "object" ? line : { text: String(line ?? ""), age: 0 };
          return Object.assign({}, src, { age: Math.max(0, toNumber(src.age, 0)) + 1 });
        }).filter(line => total <= 0 || toNumber(line.age, 0) <= total);
        if (next.length !== lines.length || next.some((line, index) => toNumber(line.age, 0) !== toNumber(lines[index]?.age, 0))) {
          const itemState = runtimeItemOverride(layoutId, windowId, item.id, true);
          itemState.lines = next;
          item.lines = next;
          changed = true;
        }
      }
      if (changed) this.refresh("logItem");
    }

    updateDynamicRefresh() {
      const signature = this.makeValueSignature();
      if (signature !== this._dbUiLastValueSignature) {
        this._dbUiLastValueSignature = signature;
        this.refresh("dynamicValue");
      }
    }

    makeValueSignature() {
      const items = this._dbUiDefinition.items || [];
      const parts = [];
      const logState = normalizeLogState(this._dbUiDefinition.log);
      if (logState.enabled && logState.lines.some(line => String(line).includes("\\V["))) {
        parts.push("log:" + logState.lines.map(line => this.convertEscapeCharacters(String(line))).join("\n"));
      }
      for (const item of items) {
        const binding = normalizeDatabaseBinding(item.databaseBinding);
        const timing = dbBindingUpdateTiming(binding);
        if (item.type === "gauge") {
          if (binding.enabled && timing === "autoFrame") {
            const bound = databaseBindingGaugeValues(binding);
            if (bound) parts.push(`${item.id}:db:${bound.value}/${bound.max}`);
          } else if (!binding.enabled) {
            const v = this.gaugeValues(item);
            parts.push(`${item.id}:${v.value}/${v.max}`);
          }
        } else if (item.type === "choiceList") {
          const text = choiceListRows(item).join("\n");
          if (text.includes("\\V[")) parts.push(`${item.id}:${this.convertEscapeCharacters(text)}`);
        } else if (item.type === "text" || item.type === "button") {
          if (item.type === "text" && binding.enabled && timing === "autoFrame") {
            const dbText = databaseBindingTextValue(binding);
            parts.push(`${item.id}:dbText:${String(dbText ?? "")}`);
          } else {
            const text = normalizeMZControlPrefix(item.text || "");
            if (text.includes("\\V[")) {
              parts.push(`${item.id}:${this.convertEscapeCharacters(text)}`);
            }
          }
        }
      }
      return parts.join("|");
    }

    dbUiComposerFontReadyState() {
      if (this._dbUiFontWaitTimedOut) {
        const state = layoutFontReadyState(this._dbUiLayoutSettings || {});
        return Object.assign({}, state, { ready: true, timedOut: true });
      }
      return layoutFontReadyState(this._dbUiLayoutSettings || {});
    }

    clearDbUiOverlayBitmapForFontWait() {
      if (this.contents) this.contents.clear();
      if (this._dbUiOverlaySprite && this._dbUiOverlaySprite.bitmap) {
        this._dbUiOverlaySprite.bitmap.clear();
      }
    }

    waitForDbUiComposerFont(reason, state) {
      if (this._dbUiFontWaitStart <= 0) this._dbUiFontWaitStart = Date.now();
      const elapsed = Date.now() - this._dbUiFontWaitStart;
      if (isDebugEnabled()) {
        console.info("[DB_UIComposer][font-debug] wait-font", {
          reason,
          elapsed,
          layoutId: this._dbUiComposerLayoutId,
          windowId: this._dbUiComposerWindowId || this._dbUiDefinition?.id || "",
          state
        });
      }
      if (elapsed >= 5000) {
        this._dbUiFontWaitTimedOut = true;
        console.warn("[DB_UIComposer] Font wait timed out. Drawing with current browser fallback.", {
          layoutId: this._dbUiComposerLayoutId,
          windowId: this._dbUiComposerWindowId || this._dbUiDefinition?.id || "",
          state
        });
        this.refresh("fontWaitTimeout");
        return;
      }
      if (this._dbUiFontWaitTimer) return;
      this._dbUiFontWaitTimer = setTimeout(() => {
        this._dbUiFontWaitTimer = null;
        if (this.isDbUiAlive()) this.refresh("fontReadyCheck");
      }, 32);
    }

    refresh(reason = "manual") {
      if (!this.isDbUiAlive() || !this.contents) return;
      const fontState = this.dbUiComposerFontReadyState();
      if (!fontState.ready) {
        this.clearDbUiOverlayBitmapForFontWait();
        this.waitForDbUiComposerFont(reason, fontState);
        return;
      }
      this._dbUiFontWaitStart = 0;
      if (isDebugEnabled()) {
        console.info("[DB_UIComposer][font-debug] refresh:start", {
          reason,
          layoutId: this._dbUiComposerLayoutId,
          windowId: this._dbUiComposerWindowId || this._dbUiDefinition?.id || "",
          fontState,
          contentsBefore: bitmapFontDebugState(this.contents)
        });
      }
      this.contents.clear();
      resetBitmapFontState(this.contents);
      this.resetFontSettings();
      this.refreshOverlayLayer(reason);
      if (isDebugEnabled()) {
        console.info("[DB_UIComposer][font-debug] refresh:end", {
          reason,
          layoutId: this._dbUiComposerLayoutId,
          windowId: this._dbUiComposerWindowId || this._dbUiDefinition?.id || "",
          contentsAfter: bitmapFontDebugState(this.contents),
          overlay: bitmapFontDebugState(this._dbUiOverlaySprite?.bitmap)
        });
      }
    }

    refreshOverlayLayer(reason = "manual") {
      if (!this.isDbUiAlive()) return;
      if (!this._dbUiOverlaySprite || !this._dbUiOverlaySprite.transform) this.createDbUiOverlaySprite();
      if (!this._dbUiOverlaySprite || !this._dbUiOverlaySprite.transform) return;
      const metrics = this.placementMetrics();
      let bitmap = this._dbUiOverlaySprite.bitmap;
      const needNewBitmap = !bitmap || bitmap.width !== metrics.layerWidth || bitmap.height !== metrics.layerHeight;
      if (needNewBitmap) {
        bitmap = new Bitmap(metrics.layerWidth, metrics.layerHeight);
        this._dbUiOverlaySprite.bitmap = bitmap;
      } else {
        bitmap.clear();
      }
      resetBitmapFontState(bitmap);
      if (isDebugEnabled()) {
        console.info("[DB_UIComposer][font-debug] overlay:prepare", {
          reason,
          windowId: this._dbUiComposerWindowId || this._dbUiDefinition?.id || "",
          needNewBitmap,
          metrics,
          overlayBeforeDraw: bitmapFontDebugState(bitmap)
        });
      }
      this._dbUiOverlaySprite.x = metrics.originX;
      this._dbUiOverlaySprite.y = metrics.originY;
      this._dbUiOverlaySprite.alpha = this.contentsOpacity / 255;
      const oldContents = this.contents;
      this.contents = bitmap;
      this.resetFontSettings();
      const entries = [];
      const bg = normalizeBackgroundImage(this._dbUiDefinition.backgroundImage);
      if (bg.enabled && bg.fileName) entries.push({ type: "background", zOrder: bg.zOrder, data: bg, index: -200 });
      const deco = normalizeDecorationImage(this._dbUiDefinition.decorationImage);
      if (deco.enabled && deco.fileName) entries.push({ type: "decoration", zOrder: deco.zOrder, data: deco, index: -100 });
      const logState = normalizeLogState(this._dbUiDefinition.log);
      if (logState.enabled) entries.push({ type: "log", zOrder: logState.zOrder, data: logState, index: 900000 });
      for (const [index, item] of (this._dbUiDefinition.items || []).entries()) {
        if (item.visible !== false) entries.push({ type: "item", zOrder: zOrderValue(item), data: item, index });
      }
      entries.sort((a, b) => {
        const az = toNumber(a.zOrder, 0);
        const bz = toNumber(b.zOrder, 0);
        if (az !== bz) return az - bz;
        return a.index - b.index;
      });
      log("refresh overlay layer", {
        windowId: this._dbUiDefinition.id,
        metrics,
        drawOrder: entries.map(entry => ({
          type: entry.type,
          id: entry.data?.id || entry.data?.fileName || entry.type,
          zOrder: toNumber(entry.zOrder, 0),
          allowOutsideWindow: entry.data?.allowOutsideWindow === true,
          folder: entry.data?.folder,
          fileName: entry.data?.fileName
        }))
      });
      const itemScrollY = this.windowScrollY(metrics);
      for (const entry of entries) {
        if (entry.type === "background") {
          this.drawImageLayer(entry.data, metrics.contentOffsetX, metrics.contentOffsetY, metrics.contentWidth, metrics.contentHeight);
        } else if (entry.type === "decoration") {
          this.drawImageLayer(entry.data, metrics.windowOffsetX, metrics.windowOffsetY, this.width, this.height);
        } else if (entry.type === "log") {
          this.drawDbLog(entry.data, metrics);
        } else {
          if (entry.data.allowOutsideWindow === true) {
            this.drawDbItemOnOverlay(entry.data, metrics.itemOffsetX, metrics.itemOffsetY - itemScrollY);
          } else {
            this.drawDbItemClippedToWindow(entry.data, metrics, itemScrollY);
          }
        }
      }
      this.drawWindowScrollbar(metrics);
      this.contents = oldContents;
    }

    drawDbItemClippedToWindow(item, metrics, scrollY = 0) {
      const oldContents = this.contents;
      const clipBitmap = new Bitmap(Math.max(1, this.width), Math.max(1, this.height));
      resetBitmapFontState(clipBitmap);
      this.contents = clipBitmap;
      this.resetFontSettings();
      this.drawDbItemOnOverlay(item, metrics.itemOffsetX - metrics.windowOffsetX, metrics.itemOffsetY - metrics.windowOffsetY - scrollY);
      this.contents = oldContents;
      oldContents.blt(clipBitmap, 0, 0, clipBitmap.width, clipBitmap.height, metrics.windowOffsetX, metrics.windowOffsetY);
    }

    drawDbItemOnOverlay(item, offsetX, offsetY) {
      const shifted = Object.assign({}, item, {
        x: toNumber(item.x, 0) + offsetX,
        y: toNumber(item.y, 0) + offsetY
      });
      switch (String(item.type || "text")) {
        case "text":
          this.drawDbText(shifted);
          break;
        case "log":
          this.drawDbLogItem(shifted);
          break;
        case "image":
          this.drawDbImage(shifted);
          break;
        case "compositeImage":
          this.drawDbCompositeImage(shifted);
          break;
        case "gauge":
          this.drawDbGauge(shifted);
          break;
        case "button":
          this.drawDbButton(shifted);
          break;
        case "choiceList":
          this.drawDbChoiceList(shifted);
          break;
        case "imageChoiceList":
          this.drawDbImageChoiceList(shifted);
          break;
      }
    }

    drawImageLayer(definition, dx, dy, areaWidth, areaHeight) {
      const def = normalizeImageLayer(definition, { folder: "pictures", opacity: 255, mode: "stretch", zOrder: 0 });
      if (!def.enabled || !def.fileName) return;
      const bitmap = this.imageBitmap(def);
      if (!bitmap) {
        log("image layer bitmap not found", { windowId: this._dbUiDefinition.id, folder: def.folder, fileName: def.fileName, mode: def.mode });
        return;
      }
      if (bitmap.isError && bitmap.isError()) {
        console.warn("[DB_UIComposer] Image layer load failed", {
          windowId: this._dbUiDefinition.id,
          folder: def.folder,
          fileName: def.fileName,
          expectedPath: `img/${String(def.folder || "pictures").replace(/^img\//i, "").replace(/^\/+|\/+$/g, "")}/${def.fileName}.png`,
          mode: def.mode
        });
        return;
      }
      if (!bitmap.isReady()) {
        log("image layer waiting load", { windowId: this._dbUiDefinition.id, folder: def.folder, fileName: def.fileName, mode: def.mode });
        bitmap.addLoadListener(() => { if (this.isDbUiAlive()) this.refresh(); });
        return;
      }

      const oldPaintOpacity = this.contents.paintOpacity;
      this.contents.paintOpacity = clamp(toNumber(def.opacity, 255), 0, 255);
      const cw = Math.max(1, toNumber(areaWidth, this.contents.width));
      const ch = Math.max(1, toNumber(areaHeight, this.contents.height));
      const bw = Math.max(1, bitmap.width);
      const bh = Math.max(1, bitmap.height);
      const mode = ["stretch", "cover", "contain", "tile"].includes(String(def.mode || "stretch")) ? String(def.mode || "stretch") : "stretch";
      const debugPlan = { mode, target: { x: dx, y: dy, width: cw, height: ch }, source: { width: bw, height: bh } };

      if (mode === "tile") {
        let tiles = 0;
        for (let y = 0; y < ch; y += bh) {
          for (let x = 0; x < cw; x += bw) {
            const sw = Math.min(bw, cw - x);
            const sh = Math.min(bh, ch - y);
            withDbUiImageSmoothing(this.contents, () => this.contents.blt(bitmap, 0, 0, sw, sh, dx + x, dy + y, sw, sh));
            tiles++;
          }
        }
        debugPlan.tileCount = tiles;
        debugPlan.tileOrigin = "left-top";
      } else if (mode === "contain") {
        const rate = Math.min(cw / bw, ch / bh);
        const dw = Math.max(1, Math.round(bw * rate));
        const dh = Math.max(1, Math.round(bh * rate));
        const ox = Math.floor((cw - dw) / 2);
        const oy = Math.floor((ch - dh) / 2);
        withDbUiImageSmoothing(this.contents, () => this.contents.blt(bitmap, 0, 0, bw, bh, dx + ox, dy + oy, dw, dh));
        debugPlan.draw = { sx: 0, sy: 0, sw: bw, sh: bh, dx: dx + ox, dy: dy + oy, dw, dh };
      } else if (mode === "cover") {
        // coverは宛先領域外へ描かず、ソース画像を中央基準で切り出します。
        // 旧実装は拡大画像を領域外まで描いており、周囲へ漏れることがありました。
        const rate = Math.max(cw / bw, ch / bh);
        const sw = Math.max(1, Math.min(bw, Math.round(cw / rate)));
        const sh = Math.max(1, Math.min(bh, Math.round(ch / rate)));
        const sx = Math.floor((bw - sw) / 2);
        const sy = Math.floor((bh - sh) / 2);
        withDbUiImageSmoothing(this.contents, () => this.contents.blt(bitmap, sx, sy, sw, sh, dx, dy, cw, ch));
        debugPlan.draw = { sx, sy, sw, sh, dx, dy, dw: cw, dh: ch, crop: "center" };
      } else {
        // stretch: 縦横比を維持せず、領域へ完全に引き伸ばします。
        withDbUiImageSmoothing(this.contents, () => this.contents.blt(bitmap, 0, 0, bw, bh, dx, dy, cw, ch));
        debugPlan.draw = { sx: 0, sy: 0, sw: bw, sh: bh, dx, dy, dw: cw, dh: ch };
      }

      log("draw image layer", {
        windowId: this._dbUiDefinition.id,
        folder: def.folder,
        fileName: def.fileName,
        mode,
        opacity: this.contents.paintOpacity,
        zOrder: def.zOrder,
        plan: debugPlan
      });
      this.contents.paintOpacity = oldPaintOpacity;
    }

    dbLogLineHeight(logState) {
      // lineHeight = 0 は「未指定」として扱います。
      // 以前は 0 が 1px に丸められ、ログが下端に重なって表示される原因になっていました。
      const value = toNumber(logState.lineHeight, 0);
      const fallback = this.lineHeight ? this.lineHeight() : 36;
      return Math.max(1, value > 0 ? value : fallback);
    }

    dbLogPreparedLines(logState, areaWidth) {
      const rawLines = Array.isArray(logState.lines) ? logState.lines : [];
      const result = [];
      const padX = Math.max(0, toNumber(logState.paddingX, 0));
      const maxWidth = Math.max(1, areaWidth - padX * 2);
      const measureWidth = text => {
        const converted = this.convertEscapeCharacters(String(text ?? ""));
        const plain = converted
          .replace(/C\[[^\]]+\]/gi, "")
          .replace(/I\[[^\]]+\]/gi, " ")
          .replace(/\{|\}|\$/g, "");
        return this.textWidth(plain);
      };
      for (const raw of rawLines) {
        const source = normalizeMZControlPrefix(raw ?? "");
        if (source.length === 0) {
          result.push("");
          continue;
        }
        let current = "";
        for (const ch of Array.from(source)) {
          if (ch === "\n") {
            result.push(current);
            current = "";
            continue;
          }
          const test = current + ch;
          if (current && measureWidth(test) > maxWidth) {
            result.push(current);
            current = ch;
          } else {
            current = test;
          }
        }
        result.push(current);
      }
      return result;
    }

    dbLogVisibleRowCount(logState, metrics) {
      const lineHeight = this.dbLogLineHeight(logState);
      const padY = Math.max(0, toNumber(logState.paddingY, 0));
      const usableHeight = Math.max(1, Math.max(1, metrics.contentHeight) - padY * 2);
      return Math.max(1, Math.floor(usableHeight / lineHeight));
    }

    dbLogMaxScroll(logState) {
      const metrics = this.placementMetrics();
      const rows = this.dbLogPreparedLines(logState, Math.max(1, metrics.contentWidth));
      const visibleRows = this.dbLogVisibleRowCount(logState, metrics);
      const lineHeight = this.dbLogLineHeight(logState);
      return Math.max(0, (rows.length - visibleRows) * lineHeight);
    }

    drawDbTextExWithCurrentStyle(text, x, y, width) {
      if (!text) return 0;
      const textState = this.createTextState(String(text), x, y, width);
      this.processAllText(textState);
      return textState.outputWidth;
    }

    drawDbLog(logDefinition, metrics) {
      const logState = normalizeLogState(logDefinition);
      if (!logState.enabled) return;
      const areaWidth = Math.max(1, metrics.contentWidth);
      const areaHeight = Math.max(1, metrics.contentHeight);
      const tempBitmap = new Bitmap(areaWidth, areaHeight);
      const oldContents = this.contents;
      this.contents = tempBitmap;
      this.resetFontSettings();
      if (logState.fontSize > 0) this.contents.fontSize = logState.fontSize;
      if (logState.textColor) this.contents.textColor = logState.textColor;
      if (logState.outlineColor) this.contents.outlineColor = logState.outlineColor;
      this.contents.outlineWidth = Math.max(0, toNumber(logState.outlineWidth, this.contents.outlineWidth));
      const lineHeight = this.dbLogLineHeight(logState);
      const rows = this.dbLogPreparedLines(logState, areaWidth);
      const x = Math.max(0, toNumber(logState.paddingX, 0));
      const padY = Math.max(0, toNumber(logState.paddingY, 0));
      const visibleRows = this.dbLogVisibleRowCount(logState, metrics);
      const maxRowOffset = Math.max(0, rows.length - visibleRows);
      const currentRowOffset = logState.autoScrollBottom
        ? maxRowOffset
        : clamp(Math.floor(toNumber(logState.scrollY, 0) / lineHeight), 0, maxRowOffset);
      const startIndex = currentRowOffset;
      const visible = rows.slice(startIndex, startIndex + visibleRows);
      const textWidth = Math.max(1, areaWidth - x * 2);
      const startY = visible.length < visibleRows
        ? Math.max(padY, areaHeight - padY - visible.length * lineHeight)
        : padY;
      for (let i = 0; i < visible.length; i++) {
        const y = startY + i * lineHeight;
        if (y + lineHeight < 0 || y > areaHeight) continue;
        this.drawDbTextExWithCurrentStyle(String(visible[i] ?? ""), x, y, textWidth);
      }
      this.contents = oldContents;
      oldContents.blt(tempBitmap, 0, 0, areaWidth, areaHeight, metrics.contentOffsetX, metrics.contentOffsetY);

      const layoutId = this._dbUiComposerLayoutId;
      const windowId = this._dbUiComposerWindowId;
      if (layoutId && windowId) {
        const current = runtimeWindowOverride(layoutId, windowId, false);
        if (current?.log) {
          current.log.scrollY = currentRowOffset * lineHeight;
          current.log.autoScrollBottom = !!logState.autoScrollBottom;
        }
      }
    }

    updateLogScroll() {
      const logState = normalizeLogState(this._dbUiDefinition.log);
      if (!logState.enabled || !logState.lines.length) return;
      const wheelY = toNumber(TouchInput.wheelY, 0);
      if (!wheelY) return;
      const mx = toNumber(TouchInput.x, -999999);
      const my = toNumber(TouchInput.y, -999999);
      if (mx < this.x || my < this.y || mx >= this.x + this.width || my >= this.y + this.height) return;
      const metrics = this.placementMetrics();
      const lineHeight = this.dbLogLineHeight(logState);
      const rows = this.dbLogPreparedLines(logState, Math.max(1, metrics.contentWidth));
      const visibleRows = this.dbLogVisibleRowCount(logState, metrics);
      const maxRowOffset = Math.max(0, rows.length - visibleRows);
      const currentRowOffset = logState.autoScrollBottom
        ? maxRowOffset
        : clamp(Math.floor(toNumber(logState.scrollY, 0) / lineHeight), 0, maxRowOffset);
      const rowStep = Math.max(1, Math.floor(Math.abs(wheelY) / 20) || 1);
      const deltaRows = wheelY > 0 ? rowStep : -rowStep;
      const nextRowOffset = clamp(currentRowOffset + deltaRows, 0, maxRowOffset);
      if (nextRowOffset === currentRowOffset && logState.autoScrollBottom === false) return;
      const layoutId = this._dbUiComposerLayoutId;
      const windowId = this._dbUiComposerWindowId;
      if (!layoutId || !windowId) return;
      const winState = runtimeWindowOverride(layoutId, windowId, true);
      winState.log = normalizeLogState(Object.assign({}, logState, { scrollY: nextRowOffset * lineHeight, autoScrollBottom: false }));
      this._dbUiDefinition.log = winState.log;
      this.refresh();
    }

    dbStableTextStyle(item, fallbackSize = 26) {
      const settings = this._dbUiLayoutSettings || {};
      const win = this._dbUiDefinition || {};
      return {
        fontFace: effectiveFontFace(settings, win, item),
        fontSize: effectiveFontSize(settings, win, item, fallbackSize),
        bold: item.bold,
        italic: item.italic,
        textColor: effectiveTextColor(settings, win, item),
        outlineColor: effectiveOutlineColor(settings, win, item),
        outlineWidth: effectiveOutlineWidth(settings, win, item)
      };
    }

    dbApplyTextStyleToBitmap(bitmap, style) {
      if (!bitmap || !style) return;
      if (style.fontFace) bitmap.fontFace = style.fontFace;
      if (style.fontSize) bitmap.fontSize = Math.max(1, toNumber(style.fontSize, bitmap.fontSize || 26));
      bitmap.fontBold = !!style.bold;
      bitmap.fontItalic = !!style.italic;
      if (style.textColor) bitmap.textColor = style.textColor;
      if (style.outlineColor) bitmap.outlineColor = style.outlineColor;
      if (style.outlineWidth !== undefined) bitmap.outlineWidth = Math.max(0, toNumber(style.outlineWidth, bitmap.outlineWidth || 0));
    }

    dbStripEscapeForMeasure(text) {
      return String(text ?? "")
        .replace(/\x1bC\[[^\]]+\]/gi, "")
        .replace(/\x1bI\[[^\]]+\]/gi, "　")
        .replace(/\x1b[\{\}\$!\.\|<>^]/g, "")
        .replace(/\x1b[A-Z]+\[[^\]]*\]/gi, "");
    }

    dbStableTextBitmapSize(item, convertedText, style) {
      const explicitWidth = toNumber(item.width, 0);
      const explicitHeight = toNumber(item.height, 0);
      const lineHeight = effectiveLineHeight(this._dbUiLayoutSettings || {}, this._dbUiDefinition || {}, item, this.lineHeight ? this.lineHeight() : 36);
      const lines = String(convertedText ?? "").split(/\n/);
      let measuredWidth = 1;
      const oldContents = this.contents;
      const measureBitmap = oldContents || new Bitmap(1, 1);
      this.contents = measureBitmap;
      withBitmapFont(measureBitmap, style, () => {
        for (const line of lines) {
          measuredWidth = Math.max(measuredWidth, Math.ceil(this.textWidth(this.dbStripEscapeForMeasure(line)) + 10));
        }
      });
      this.contents = oldContents;
      return {
        width: Math.max(1, explicitWidth > 0 ? explicitWidth : measuredWidth + Math.max(0, toNumber(style.outlineWidth, 0)) * 2 + 4),
        height: Math.max(1, explicitHeight > 0 ? explicitHeight : lines.length * lineHeight + Math.max(0, toNumber(style.outlineWidth, 0)) * 2 + 4),
        lineHeight
      };
    }

    dbStableTextCacheKey(item, convertedText, style, width, height, lineHeight, align) {
      return JSON.stringify({
        id: String(item.id || ""),
        text: String(convertedText ?? ""),
        width,
        height,
        lineHeight,
        align,
        textYOffset: this.textYOffset(),
        style
      });
    }

    dbDrawStableEscapedLine(line, x, y, width, lineHeight, align, style) {
      const hasEscape = String(line).includes("\x1b");
      if (!hasEscape) {
        this.contents.drawText(String(line), x, y, width, lineHeight, align);
        return;
      }

      const baseColor = this.contents.textColor;
      const baseSize = this.contents.fontSize;
      const plainWidth = Math.ceil(this.textWidth(this.dbStripEscapeForMeasure(line)));
      let cursorX = x;
      if (align === "center") cursorX = x + Math.max(0, Math.floor((width - plainWidth) / 2));
      else if (align === "right") cursorX = x + Math.max(0, width - plainWidth);

      let buffer = "";
      const flush = () => {
        if (!buffer) return;
        const partWidth = Math.ceil(this.textWidth(buffer)) + 4;
        this.contents.drawText(buffer, cursorX, y, Math.max(1, partWidth), lineHeight, "left");
        cursorX += partWidth;
        buffer = "";
      };

      const text = String(line);
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (ch !== "\x1b") {
          buffer += ch;
          continue;
        }
        flush();
        const code = text[++i] || "";
        if (code === "C") {
          const rest = text.slice(i + 1);
          const match = rest.match(/^\[(\d+)\]/);
          if (match) {
            this.contents.textColor = ColorManager.textColor(Number(match[1]));
            i += match[0].length;
          }
        } else if (code === "I") {
          const rest = text.slice(i + 1);
          const match = rest.match(/^\[(\d+)\]/);
          if (match) {
            const iconIndex = Number(match[1]);
            if (Number.isFinite(iconIndex) && iconIndex >= 0) {
              this.drawIcon(iconIndex, cursorX, y + Math.floor((lineHeight - ImageManager.iconHeight) / 2));
              cursorX += ImageManager.iconWidth + 4;
            }
            i += match[0].length;
          }
        } else if (code === "{") {
          this.contents.fontSize = Math.min(96, this.contents.fontSize + 12);
        } else if (code === "}") {
          this.contents.fontSize = Math.max(12, this.contents.fontSize - 12);
        } else if (code === "n") {
          // 念のため。通常はsplit済みです。
        }
      }
      flush();
      this.contents.textColor = baseColor;
      this.contents.fontSize = baseSize;
      this.dbApplyTextStyleToBitmap(this.contents, style);
    }

    dbStableTextBitmap(item, style) {
      this._dbUiTextBitmapCache = this._dbUiTextBitmapCache || {};
      const binding = normalizeDatabaseBinding(item.databaseBinding);
      const sourceText = binding.enabled ? databaseBindingTextValue(binding) : item.text;
      const rawText = normalizeMZControlPrefix(sourceText || "");
      const convertedText = this.convertEscapeCharacters(rawText);
      const align = String(item.align || "left");
      const size = this.dbStableTextBitmapSize(item, convertedText, style);
      const cacheId = String(item.id || `text_${toNumber(item.x, 0)}_${toNumber(item.y, 0)}`);
      const key = this.dbStableTextCacheKey(item, convertedText, style, size.width, size.height, size.lineHeight, align);
      const cached = this._dbUiTextBitmapCache[cacheId];
      if (cached && cached.key === key && cached.bitmap && cached.bitmap.width > 0) return cached.bitmap;

      const bitmap = new Bitmap(size.width, size.height);
      resetBitmapFontState(bitmap);
      this.dbApplyTextStyleToBitmap(bitmap, style);

      const oldContents = this.contents;
      this.contents = bitmap;
      this.dbApplyTextStyleToBitmap(bitmap, style);
      const lines = String(convertedText ?? "").split(/\n/);
      const outlinePad = Math.max(0, toNumber(style.outlineWidth, 0));
      for (let i = 0; i < lines.length; i++) {
        this.dbApplyTextStyleToBitmap(bitmap, style);
        this.dbDrawStableEscapedLine(lines[i], outlinePad, outlinePad + i * size.lineHeight, Math.max(1, size.width - outlinePad * 2), size.lineHeight, align, style);
      }
      this.contents = oldContents;

      this._dbUiTextBitmapCache[cacheId] = { key, bitmap };
      return bitmap;
    }

    drawDbEscapedAlignedText(text, x, y, width, align = "left", lineHeight = null) {
      const lh = Math.max(1, toNumber(lineHeight, this.lineHeight ? this.lineHeight() : 36));
      const style = {
        fontFace: this.contents.fontFace,
        fontSize: this.contents.fontSize,
        bold: !!this.contents.fontBold,
        italic: !!this.contents.fontItalic,
        textColor: this.contents.textColor,
        outlineColor: this.contents.outlineColor,
        outlineWidth: this.contents.outlineWidth
      };
      const converted = this.convertEscapeCharacters(normalizeMZControlPrefix(text));
      this.dbDrawStableEscapedLine(converted, x, y, Math.max(1, width), lh, align, style);
    }

    drawDbText(item) {
      const settings = this._dbUiLayoutSettings || {};
      const style = this.dbStableTextStyle(item, settings.defaultFontSize || 26);
      const x = toNumber(item.x, 0);
      const y = toNumber(item.y, 0) + this.textYOffset();
      const bitmap = this.dbStableTextBitmap(item, style);
      const oldPaintOpacity = this.contents.paintOpacity;
      this.contents.paintOpacity = clamp(toNumber(item.opacity, 255), 0, 255);
      this.contents.blt(bitmap, 0, 0, bitmap.width, bitmap.height, x, y);
      this.contents.paintOpacity = oldPaintOpacity;
    }

    imageBitmap(item) {
      // ツール側では img 配下の任意フォルダを選択できます。
      // 例: folder="UI", fileName="タイトルなし" → img/UI/タイトルなし.png
      //     folder="pictures/ui", fileName="button" → img/pictures/ui/button.png
      // MZ標準フォルダ以外を pictures 扱いへ落とさないことが重要です。
      let folder = String(item.folder || "pictures")
        .replace(/\\/g, "/")
        .replace(/^img\//i, "")
        .replace(/^\/+|\/+$/g, "");
      let fileName = String(item.fileName || "")
        .replace(/\\/g, "/")
        .replace(/^img\//i, "")
        .replace(/\.(png|jpg|jpeg|webp|gif|bmp)$/i, "");

      // 旧データや手入力で fileName にフォルダ込みのパスが入っている場合も救済します。
      // folder が未指定または既定の pictures のときだけ、fileName 側のパスを優先します。
      if (fileName.includes("/")) {
        const slash = fileName.lastIndexOf("/");
        const pathFolder = fileName.slice(0, slash).replace(/^\/+|\/+$/g, "");
        const pathName = fileName.slice(slash + 1);
        if (pathFolder && (!folder || folder === "pictures")) folder = pathFolder;
        fileName = pathName;
      }
      if (!fileName) return null;

      const standardLoaders = {
        system: name => ImageManager.loadSystem(name),
        faces: name => ImageManager.loadFace(name),
        enemies: name => ImageManager.loadEnemy(name),
        sv_actors: name => ImageManager.loadSvActor(name),
        sv_enemies: name => ImageManager.loadSvEnemy(name),
        characters: name => ImageManager.loadCharacter(name),
        parallaxes: name => ImageManager.loadParallax(name),
        tilesets: name => ImageManager.loadTileset(name),
        animations: name => ImageManager.loadAnimation(name),
        battlebacks1: name => ImageManager.loadBattleback1(name),
        battlebacks2: name => ImageManager.loadBattleback2(name),
        titles1: name => ImageManager.loadTitle1(name),
        titles2: name => ImageManager.loadTitle2(name),
        pictures: name => ImageManager.loadPicture(name)
      };
      const normalized = String(folder || "pictures");
      const key = normalized.toLowerCase();
      const loader = standardLoaders[key];
      if (loader && !normalized.includes("/")) {
        return loader(fileName);
      }

      // カスタムフォルダ、または入れ子フォルダは汎用ローダーで実パスを指定します。
      const path = `img/${normalized}/`;
      log("load custom image folder", { folder: normalized, fileName, path: `${path}${fileName}.png` });
      return ImageManager.loadBitmap(path, fileName);
    }

    drawDbImage(item) {
      const bitmap = this.imageBitmap(item);
      if (!bitmap) {
        log("item image bitmap not found", { windowId: this._dbUiDefinition.id, itemId: item.id, folder: item.folder, fileName: item.fileName });
        return;
      }
      if (bitmap.isError && bitmap.isError()) {
        console.warn("[DB_UIComposer] Item image load failed", {
          windowId: this._dbUiDefinition.id,
          itemId: item.id,
          folder: item.folder,
          fileName: item.fileName,
          expectedPath: `img/${String(item.folder || "pictures").replace(/^img\//i, "").replace(/^\/+|\/+$/g, "")}/${item.fileName}.png`
        });
        return;
      }
      if (!bitmap.isReady()) {
        log("item image waiting load", { windowId: this._dbUiDefinition.id, itemId: item.id, folder: item.folder, fileName: item.fileName });
        bitmap.addLoadListener(() => { if (this.isDbUiAlive()) this.refresh(); });
        return;
      }
      const x = toNumber(item.x, 0);
      const y = toNumber(item.y, 0);
      const sx = imageScaleRate(item, "scaleX");
      const sy = imageScaleRate(item, "scaleY");
      const baseW = toNumber(item.width, 0) > 0 ? toNumber(item.width, bitmap.width) : bitmap.width;
      const baseH = toNumber(item.height, 0) > 0 ? toNumber(item.height, bitmap.height) : bitmap.height;
      const dw = Math.max(1, Math.round(baseW * sx));
      const dh = Math.max(1, Math.round(baseH * sy));
      log("draw item image", { windowId: this._dbUiDefinition.id, itemId: item.id, folder: item.folder, fileName: item.fileName, x, y, width: dw, height: dh, allowOutsideWindow: item.allowOutsideWindow === true, zOrder: item.zOrder });
      const oldPaintOpacity = this.contents.paintOpacity;
      this.contents.paintOpacity = clamp(toNumber(item.opacity, 255), 0, 255);
      withDbUiImageSmoothing(this.contents, () => this.contents.blt(bitmap, 0, 0, bitmap.width, bitmap.height, x, y, dw, dh));
      this.contents.paintOpacity = oldPaintOpacity;
    }

    drawDbCompositeImage(item) {
      // 複合画像は、MZ実行時は書き出し済みPNG（1枚絵）として扱います。
      const baked = item.bakedImage || {};
      const useItemImage = !!String(item.fileName || "").trim();
      const resolvedFileName = String(useItemImage ? item.fileName : baked.fileName || "").trim();
      const resolvedFolder = String(useItemImage ? item.folder : (baked.folder || item.folder) || "pictures").trim();
      if (resolvedFileName) {
        const imageItem = Object.assign({}, item, {
          type: "image",
          folder: resolvedFolder || "pictures",
          fileName: resolvedFileName.replace(/\.(png|jpg|jpeg|webp|gif|bmp)$/i, ""),
          width: Math.max(0, toNumber(item.width || baked.width, 0)),
          height: Math.max(0, toNumber(item.height || baked.height, 0))
        });
        this.drawDbImage(imageItem);
        return;
      }
      // 複合画像はゲーム内で一枚絵表示に統一します。
      // 書き出しPNG未指定時は何も描かず、個別レイヤー描画には戻しません。
    }

    gaugeValues(item) {
      const binding = normalizeDatabaseBinding(item.databaseBinding);
      if (binding.enabled) {
        const values = databaseBindingGaugeValues(binding);
        if (values) return values;
      }
      const type = String(item.valueType || "variable");
      if (type === "actorHp" || type === "actorMp" || type === "actorTp") {
        const actor = $gameActors.actor(toNumber(item.actorId, 1));
        if (!actor) return { value: 0, max: 1 };
        if (type === "actorHp") return { value: actor.hp, max: actor.mhp };
        if (type === "actorMp") return { value: actor.mp, max: actor.mmp };
        return { value: actor.tp, max: 100 };
      }
      if (type === "fixed") {
        return {
          value: toNumber(item.value, 0),
          max: Math.max(1, toNumber(item.max, 100))
        };
      }
      const valueVariableId = toNumber(item.valueVariableId, 0);
      const maxVariableId = toNumber(item.maxVariableId, 0);
      const value = valueVariableId > 0 ? $gameVariables.value(valueVariableId) : toNumber(item.value, 0);
      const max = maxVariableId > 0 ? $gameVariables.value(maxVariableId) : toNumber(item.max, 100);
      return { value: toNumber(value, 0), max: Math.max(1, toNumber(max, 1)) };
    }

    drawGaugeImageLayer(definition, x, y, width, height, clipRate = null, shape = "horizontal", direction = "leftToRight", startAngleDeg = 0) {
      const def = Object.assign({ enabled: false, folder: "pictures", fileName: "", opacity: 255, mode: "stretch" }, definition || {});
      if (!def.enabled || !def.fileName) return false;
      if (clipRate === null) {
        this.drawImageLayer(def, x, y, width, height);
        return true;
      }

      const oldContents = this.contents;
      const tempBitmap = new Bitmap(Math.max(1, width), Math.max(1, height));
      this.contents = tempBitmap;
      this.drawImageLayer(def, 0, 0, width, height);
      this.contents = oldContents;
      const rate = clamp(clipRate, 0, 1);
      if (shape === "circle") {
        if (rate <= 0) return true;
        const ctx = this.contents && this.contents._context;
        const canvas = tempBitmap && (tempBitmap._canvas || tempBitmap.canvas);
        if (!ctx || !canvas) return false;
        const cx = x + width / 2;
        const cy = y + height / 2;
        const radius = Math.max(width, height) * 2;
        const startRad = ((toNumber(startAngleDeg, 0) - 90) * Math.PI) / 180;
        const sweep = Math.PI * 2 * rate * (direction === "counterClockwise" ? -1 : 1);
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, radius, startRad, startRad + sweep, direction === "counterClockwise");
        ctx.closePath();
        ctx.clip();
        const oldAlpha = ctx.globalAlpha;
        ctx.globalAlpha = clamp(toNumber(def.opacity, 255), 0, 255) / 255;
        ctx.drawImage(canvas, x, y, width, height);
        ctx.globalAlpha = oldAlpha;
        ctx.restore();
        if (this.contents._baseTexture) this.contents._baseTexture.update();
        return true;
      }
      const oldPaintOpacity = this.contents.paintOpacity;
      this.contents.paintOpacity = 255;
      if (shape === "vertical") {
        const drawHeight = Math.max(0, Math.min(height, Math.floor(height * rate)));
        if (drawHeight > 0) {
          const sy = direction === "topToBottom" ? 0 : height - drawHeight;
          const dy = direction === "topToBottom" ? y : y + height - drawHeight;
          this.contents.blt(tempBitmap, 0, sy, width, drawHeight, x, dy, width, drawHeight);
        }
      } else {
        const drawWidth = Math.max(0, Math.min(width, Math.floor(width * rate)));
        if (drawWidth > 0) {
          const sx = direction === "rightToLeft" ? width - drawWidth : 0;
          const dx = direction === "rightToLeft" ? x + width - drawWidth : x;
          this.contents.blt(tempBitmap, sx, 0, drawWidth, height, dx, y, drawWidth, height);
        }
      }
      this.contents.paintOpacity = oldPaintOpacity;
      return true;
    }

    drawDbLogItem(item) {
      const width = Math.max(1, toNumber(item.width, 320));
      const height = Math.max(1, toNumber(item.height, 120));
      const x = toNumber(item.x, 0);
      const y = toNumber(item.y, 0);
      const lineHeight = Math.max(1, toNumber(item.lineHeight, 28));
      const padX = Math.max(0, toNumber(item.paddingX, 4));
      const padY = Math.max(0, toNumber(item.paddingY, 4));
      const display = Math.max(0, toNumber(item.displayFrames, 180));
      const fade = Math.max(0, toNumber(item.fadeFrames, 30));
      const move = Math.max(0, toNumber(item.moveFrames, 20));
      const lines = (Array.isArray(item.lines) ? item.lines : []).map(line => line && typeof line === "object" ? line : { text: String(line ?? ""), age: 0 });
      const maxRows = Math.max(1, Math.floor(Math.max(1, height - padY * 2) / lineHeight));
      const visible = lines.slice(-maxRows);
      const oldFace = this.contents.fontFace;
      const oldSize = this.contents.fontSize;
      const oldColor = this.contents.textColor;
      const oldOutlineColor = this.contents.outlineColor;
      const oldOutlineWidth = this.contents.outlineWidth;
      const oldOpacity = this.contents.paintOpacity;
      if (item.fontFamily) this.contents.fontFace = String(item.fontFamily);
      if (item.fontSize) this.contents.fontSize = Math.max(1, toNumber(item.fontSize, this.contents.fontSize));
      if (item.color) this.contents.textColor = String(item.color);
      if (item.outlineColor) this.contents.outlineColor = String(item.outlineColor);
      if (item.outlineWidth !== undefined) this.contents.outlineWidth = Math.max(0, toNumber(item.outlineWidth, this.contents.outlineWidth));
      const startY = y + Math.max(padY, height - padY - visible.length * lineHeight);
      const textWidth = Math.max(1, width - padX * 2);
      for (let i = 0; i < visible.length; i++) {
        const entry = visible[i];
        const age = Math.max(0, toNumber(entry.age, 0));
        let opacity = clamp(toNumber(item.opacity, 255), 0, 255);
        if (fade > 0 && age > display) opacity = Math.round(opacity * clamp(1 - (age - display) / fade, 0, 1));
        let moveOffset = 0;
        if (move > 0 && age > display + fade) moveOffset = -lineHeight * clamp((age - display - fade) / move, 0, 1);
        this.contents.paintOpacity = opacity;
        this.drawTextEx(String(entry.text ?? ""), x + padX, startY + i * lineHeight + moveOffset, textWidth);
      }
      this.contents.paintOpacity = oldOpacity;
      this.contents.fontFace = oldFace;
      this.contents.fontSize = oldSize;
      this.contents.textColor = oldColor;
      this.contents.outlineColor = oldOutlineColor;
      this.contents.outlineWidth = oldOutlineWidth;
    }

    drawCircleGaugeFill(x, y, width, height, rate, color1, color2, direction, startAngleDeg = 0) {
      const ctx = this.contents && this.contents._context;
      if (!ctx) return false;
      const cx = x + width / 2;
      const cy = y + height / 2;
      const radius = Math.max(1, Math.min(width, height) / 2);
      const inner = radius * 0.58;
      const start = ((toNumber(startAngleDeg, 0) - 90) * Math.PI) / 180;
      const end = start + (direction === "counterClockwise" ? -1 : 1) * Math.PI * 2 * clamp(rate, 0, 1);
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.arc(cx, cy, inner, Math.PI * 2, 0, true);
      ctx.closePath();
      ctx.fillStyle = ColorManager.gaugeBackColor();
      ctx.fill();
      if (rate > 0) {
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, radius, start, end, direction === "counterClockwise");
        ctx.closePath();
        ctx.fillStyle = color1;
        ctx.fill();
        ctx.globalCompositeOperation = "destination-out";
        ctx.beginPath();
        ctx.arc(cx, cy, inner, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = "source-over";
      }
      ctx.restore();
      if (this.contents._baseTexture) this.contents._baseTexture.update();
      return true;
    }

    drawDbGauge(item) {
      const x = toNumber(item.x, 0);
      const y = toNumber(item.y, 0);
      const width = Math.max(1, toNumber(item.width, 200));
      const height = Math.max(1, toNumber(item.height, 14));
      const values = this.gaugeValues(item);
      const rate = clamp(values.value / Math.max(1, values.max), 0, 1);
      const color1 = String(item.color1 || "#ff6060");
      const color2 = String(item.color2 || "#ffa0a0");
      const shape = String(item.gaugeShape || item.gaugeType || "horizontal");
      const direction = String(item.gaugeDirection || (shape === "vertical" ? "bottomToTop" : shape === "circle" ? "clockwise" : "leftToRight"));
      const startAngleDeg = toNumber(item.gaugeStartAngle, 0);

      const backImage = item.gaugeBackImage || {};
      const fillImage = item.gaugeFillImage || {};
      const frontImage = item.gaugeFrontImage || {};

      if (shape === "circle") {
        const backDrawn = this.drawGaugeImageLayer(backImage, x, y, width, height, null, shape, direction, startAngleDeg);
        if (!backDrawn) this.drawCircleGaugeFill(x, y, width, height, 1, ColorManager.gaugeBackColor(), ColorManager.gaugeBackColor(), "clockwise", startAngleDeg);
        const fillDrawn = this.drawGaugeImageLayer(fillImage, x, y, width, height, rate, shape, direction, startAngleDeg);
        if (!fillDrawn) this.drawCircleGaugeFill(x, y, width, height, rate, color1, color2, direction, startAngleDeg);
        this.drawGaugeImageLayer(frontImage, x, y, width, height, null, shape, direction, startAngleDeg);
      } else {
        const backDrawn = this.drawGaugeImageLayer(backImage, x, y, width, height, null, shape, direction, startAngleDeg);
        if (!backDrawn) {
          this.contents.fillRect(x, y, width, height, ColorManager.gaugeBackColor());
        }

        const fillDrawn = this.drawGaugeImageLayer(fillImage, x, y, width, height, rate, shape, direction, startAngleDeg);
        if (!fillDrawn) {
          if (shape === "vertical") {
            const drawHeight = Math.floor(height * rate);
            const dy = direction === "topToBottom" ? y : y + height - drawHeight;
            this.contents.gradientFillRect(x, dy, width, drawHeight, color1, color2, true);
          } else {
            const drawWidth = Math.floor(width * rate);
            const dx = direction === "rightToLeft" ? x + width - drawWidth : x;
            this.contents.gradientFillRect(dx, y, drawWidth, height, color1, color2);
          }
        }

        this.drawGaugeImageLayer(frontImage, x, y, width, height, null, shape, direction, startAngleDeg);
      }

      if (item.label) {
        const oldSize = this.contents.fontSize;
        const oldFace = this.contents.fontFace;
        const oldColor = this.contents.textColor;
        const oldOutlineColor = this.contents.outlineColor;
        const oldOutlineWidth = this.contents.outlineWidth;
        const fontFamily = ensureLayoutFont(this._dbUiLayoutSettings);
        if (fontFamily) this.contents.fontFace = fontFamily;
        this.contents.fontSize = Math.max(1, toNumber(item.fontSize, 18));
        if (item.color) this.contents.textColor = String(item.color);
        else this.resetTextColor();
        if (item.outlineColor) this.contents.outlineColor = String(item.outlineColor);
        if (item.outlineWidth !== undefined) this.contents.outlineWidth = Math.max(0, toNumber(item.outlineWidth, this.contents.outlineWidth));
        this.drawDbEscapedAlignedText(`${item.label} ${values.value}/${values.max}`, x, y - 2 + this.textYOffset(), width, "center");
        this.contents.fontSize = oldSize;
        this.contents.fontFace = oldFace;
        this.contents.textColor = oldColor;
        this.contents.outlineColor = oldOutlineColor;
        this.contents.outlineWidth = oldOutlineWidth;
      }
    }

    windowInputEnabled() {
      return toBool(this._dbUiDefinition?.inputEnabled, true);
    }

    closeComposerWindowAfterChoice() {
      const layoutId = this._dbUiComposerLayoutId || DEFAULT_LAYOUT_ID;
      const windowId = this._dbUiComposerWindowId || this._dbUiDefinition?.id || "";
      if (layoutId && windowId) {
        Object.assign(runtimeWindowOverride(layoutId, windowId, true), { visible: false });
        log("choice close window", { layoutId, windowId });
      }
      this.visible = false;
      const scene = SceneManager._scene;
      if (scene && typeof scene.dbUiComposerRefresh === "function") scene.dbUiComposerRefresh();
    }

    imageChoiceTextCacheKey(item, option, index, width, height) {
      const settings = this._dbUiLayoutSettings || {};
      const win = this._dbUiDefinition || {};
      const text = this.convertEscapeCharacters(normalizeMZControlPrefix(String(option.text || option.id || `choice${index + 1}`)));
      return JSON.stringify({
        itemId: String(item?.id || ""),
        optionId: String(option?.id || ""),
        index,
        text,
        width,
        height,
        fontFace: effectiveFontFace(settings, win, option),
        fontSize: effectiveFontSize(settings, win, option, 18),
        textColor: effectiveTextColor(settings, win, option),
        outlineColor: effectiveOutlineColor(settings, win, option),
        outlineWidth: effectiveOutlineWidth(settings, win, option),
        bold: !!option.bold,
        italic: !!option.italic
      });
    }

    imageChoiceTextBitmap(item, option, index, width, height) {
      this._dbUiImageChoiceTextCache = this._dbUiImageChoiceTextCache || {};
      const cacheId = `${String(item?.id || "")}:${String(option?.id || index)}`;
      const key = this.imageChoiceTextCacheKey(item, option, index, width, height);
      const cached = this._dbUiImageChoiceTextCache[cacheId];
      if (cached && cached.key === key && cached.bitmap && cached.bitmap.width > 0) return cached.bitmap;

      const settings = this._dbUiLayoutSettings || {};
      const win = this._dbUiDefinition || {};
      const bitmap = new Bitmap(Math.max(1, width), Math.max(1, height));
      resetBitmapFontState(bitmap);
      const style = {
        fontFace: effectiveFontFace(settings, win, option),
        fontSize: effectiveFontSize(settings, win, option, 18),
        bold: option.bold,
        italic: option.italic,
        textColor: effectiveTextColor(settings, win, option),
        outlineColor: effectiveOutlineColor(settings, win, option),
        outlineWidth: effectiveOutlineWidth(settings, win, option)
      };
      const oldContents = this.contents;
      this.contents = bitmap;
      withBitmapFont(bitmap, style, () => {
        const text = String(option.text || option.id || `choice${index + 1}`);
        this.drawDbEscapedAlignedText(text, 0, Math.floor((height - this.lineHeight()) / 2), width, "center");
      });
      this.contents = oldContents;
      this._dbUiImageChoiceTextCache[cacheId] = { key, bitmap };
      return bitmap;
    }

    imageChoiceImageForState(option, stateName) {
      const fallback = option.enabledImage || option.normalImage || {};
      if (stateName === "disabled") return (option.disabledImage && option.disabledImage.fileName) ? option.disabledImage : fallback;
      if (stateName === "hover") return (option.hoverImage && option.hoverImage.fileName) ? option.hoverImage : fallback;
      if (stateName === "press") return (option.pressImage && option.pressImage.fileName) ? option.pressImage : ((option.hoverImage && option.hoverImage.fileName) ? option.hoverImage : fallback);
      return fallback;
    }

    drawImageChoiceBitmap(bitmap, imageDef, dx, dy, dw, dh) {
      if (!bitmap || !bitmap.isReady || !bitmap.isReady()) return false;
      const bw = Math.max(1, bitmap.width);
      const bh = Math.max(1, bitmap.height);
      const mode = ["stretch", "cover", "contain", "tile"].includes(String(imageDef?.mode || "stretch"))
        ? String(imageDef?.mode || "stretch")
        : "stretch";

      if (mode === "tile") {
        for (let ty = 0; ty < dh; ty += bh) {
          for (let tx = 0; tx < dw; tx += bw) {
            const sw = Math.min(bw, dw - tx);
            const sh = Math.min(bh, dh - ty);
            withDbUiImageSmoothing(this.contents, () => this.contents.blt(bitmap, 0, 0, sw, sh, dx + tx, dy + ty, sw, sh));
          }
        }
      } else if (mode === "contain") {
        const rate = Math.min(dw / bw, dh / bh);
        const destW = Math.max(1, Math.round(bw * rate));
        const destH = Math.max(1, Math.round(bh * rate));
        const ox = Math.floor((dw - destW) / 2);
        const oy = Math.floor((dh - destH) / 2);
        withDbUiImageSmoothing(this.contents, () => this.contents.blt(bitmap, 0, 0, bw, bh, dx + ox, dy + oy, destW, destH));
      } else if (mode === "cover") {
        const rate = Math.max(dw / bw, dh / bh);
        const srcW = Math.max(1, Math.min(bw, Math.round(dw / rate)));
        const srcH = Math.max(1, Math.min(bh, Math.round(dh / rate)));
        const sx = Math.floor((bw - srcW) / 2);
        const sy = Math.floor((bh - srcH) / 2);
        withDbUiImageSmoothing(this.contents, () => this.contents.blt(bitmap, sx, sy, srcW, srcH, dx, dy, dw, dh));
      } else {
        withDbUiImageSmoothing(this.contents, () => this.contents.blt(bitmap, 0, 0, bw, bh, dx, dy, dw, dh));
      }
      return true;
    }

    drawDbImageChoiceList(item) {
      const itemId = String(item.id || "");
      const baseX = toNumber(item.x, 0);
      const baseY = toNumber(item.y, 0);
      for (const [index, option] of imageChoiceOptions(item).entries()) {
        const state = imageChoiceStateAt(option);
        if (state === "hidden") continue;
        const enabled = state === "enabled";
        const key = `${itemId}:${index}`;
        const isPress = this._dbUiImageChoicePressFrames > 0 && this._dbUiImageChoicePressedId === key && enabled;
        const isHover = this._dbUiImageChoiceHoverId === key && enabled;
        const stateName = !enabled ? "disabled" : isPress ? "press" : isHover ? "hover" : "enabled";
        const imageDef = this.imageChoiceImageForState(option, stateName);
        const normalDef = option.enabledImage || option.normalImage || {};
        const w = Math.max(1, toNumber(option.width, 160));
        const h = Math.max(1, toNumber(option.height, 44));
        const scale = stateName === "press" ? toNumber(option.pressScalePercent, 96) / 100 : stateName === "hover" ? toNumber(option.hoverScalePercent, 105) / 100 : 1;
        const dw = Math.max(1, Math.round(w * scale));
        const dh = Math.max(1, Math.round(h * scale));
        const dx = baseX + toNumber(option.x, 0) - Math.floor((dw - w) / 2);
        const dy = baseY + toNumber(option.y, 0) - Math.floor((dh - h) / 2);
        const opacity = stateName === "press" ? toNumber(option.pressOpacity, 230) : stateName === "hover" ? toNumber(option.hoverOpacity, 255) : !enabled ? toNumber(option.disabledOpacity, 190) : toNumber(imageDef.opacity, 255);
        const bitmap = this.imageBitmap(imageDef);
        const oldOpacity = this.contents.paintOpacity;
        this.contents.paintOpacity = clamp(opacity, 0, 255);

        let drawn = false;
        if (bitmap && bitmap.isReady && bitmap.isReady()) {
          drawn = this.drawImageChoiceBitmap(bitmap, imageDef, dx, dy, dw, dh);
        } else {
          if (bitmap && bitmap.addLoadListener) {
            bitmap.addLoadListener(() => { if (this.isDbUiAlive()) this.refresh("imageChoiceImageLoad"); });
          }

          // hover/press専用画像は、初回ホバー時にまだ読み込みが終わっていないことがあります。
          // その瞬間に未指定用の四角+文字を描くとチラつくため、通常画像が読込済みなら通常画像を代替表示します。
          if (imageDef && imageDef.fileName && normalDef && normalDef.fileName) {
            const normalBitmap = this.imageBitmap(normalDef);
            if (normalBitmap && normalBitmap.isReady && normalBitmap.isReady()) {
              drawn = this.drawImageChoiceBitmap(normalBitmap, normalDef, dx, dy, dw, dh);
            } else if (normalBitmap && normalBitmap.addLoadListener) {
              normalBitmap.addLoadListener(() => { if (this.isDbUiAlive()) this.refresh("imageChoiceFallbackImageLoad"); });
            }
          }
        }

        if (!drawn) {
          // 画像ファイル自体が未指定の場合だけ代替表示を出します。
          // 画像指定済みだが未読込の時は、読み込み完了後のrefreshを待ち、未指定表示を一瞬出さないようにします。
          if (!imageDef || !imageDef.fileName) {
            this.contents.fillRect(dx, dy, dw, dh, enabled ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.28)");
            this.contents.fillRect(dx, dy, dw, 1, "rgba(255,255,255,0.45)");
            const textBitmap = this.imageChoiceTextBitmap(item, option, index, w, h);
            this.contents.blt(textBitmap, 0, 0, textBitmap.width, textBitmap.height, dx, dy, dw, dh);
          }
        }

        log("draw image choice", {
          windowId: this._dbUiDefinition.id,
          itemId,
          optionId: option.id,
          stateName,
          imageFile: imageDef?.fileName || "",
          drawn,
          waitingImage: !!(imageDef && imageDef.fileName && !drawn),
          target: { x: dx, y: dy, width: dw, height: dh }
        });
        this.contents.paintOpacity = oldOpacity;
      }
    }

    imageChoiceHitAt(localX, localY, screenX, screenY) {
      const items = [...(this._dbUiDefinition.items || [])].map((item, index) => ({ item, index }))
        .sort((a, b) => -compareDisplayOrder(a.item, b.item, a.index, b.index))
        .map(entry => entry.item);
      for (const item of items) {
        if (item.type !== "imageChoiceList" || item.visible === false) continue;
        if (item.allowOutsideWindow !== true) {
          if (screenX < this.x || screenX >= this.x + this.width || screenY < this.y || screenY >= this.y + this.height) continue;
        }
        const baseX = toNumber(item.x, 0);
        const baseY = toNumber(item.y, 0);
        const options = imageChoiceOptions(item);
        for (let index = options.length - 1; index >= 0; index--) {
          const option = options[index];
          const state = imageChoiceStateAt(option);
          if (state === "hidden") continue;
          const x = baseX + toNumber(option.x, 0);
          const y = baseY + toNumber(option.y, 0);
          const w = Math.max(1, toNumber(option.width, 160));
          const h = Math.max(1, toNumber(option.height, 44));
          if (localX >= x && localY >= y && localX < x + w && localY < y + h) return { item, option, index, state };
        }
      }
      return null;
    }

    updateImageChoiceLists() {
      if (!this.visible || !this.isOpen()) return;
      if (!this.windowInputEnabled()) return;
      let needsRefresh = false;
      if (this._dbUiImageChoicePressFrames > 0) {
        this._dbUiImageChoicePressFrames--;
        if (this._dbUiImageChoicePressFrames <= 0) { this._dbUiImageChoicePressedId = ""; needsRefresh = true; }
      }
      const metrics = this.placementMetrics();
      const localX = TouchInput.x - this.x - metrics.contentLeft;
      const localY = TouchInput.y - this.y - metrics.contentTop + this.windowScrollY(metrics);
      const hit = this.imageChoiceHitAt(localX, localY, TouchInput.x, TouchInput.y);
      const hoverId = hit ? `${hit.item.id || ""}:${hit.index}` : "";
      if (hoverId !== this._dbUiImageChoiceHoverId) { this._dbUiImageChoiceHoverId = hoverId; needsRefresh = true; }
      if (TouchInput.isTriggered() && hit) {
        const enabled = hit.state === "enabled";
        interactionLog(enabled ? "image choice click" : "image choice disabled click", { windowId: this._dbUiComposerWindowId, itemId: hit.item.id, index: hit.index, text: hit.option.text, enabled });
        if (enabled) {
          this._dbUiImageChoicePressedId = `${hit.item.id || ""}:${hit.index}`;
          this._dbUiImageChoicePressFrames = 6;
          this.executeImageChoice(hit.item, hit.option, hit.index);
          needsRefresh = true;
        }
      }
      if (needsRefresh) this.refresh("imageChoiceHoverOrClick");
    }

    executeImageChoice(item, option, index) {
      const variableId = toNumber(option.resultVariableId, toNumber(item.resultVariableId, 0));
      if (variableId > 0) $gameVariables.setValue(variableId, index + 1);
      const textVariableId = toNumber(option.resultTextVariableId, toNumber(item.resultTextVariableId, 0));
      if (textVariableId > 0) $gameVariables.setValue(textVariableId, String(option.text || ""));
      const commonEventId = toNumber(option.commonEventId, 0);
      if (commonEventId > 0) $gameTemp.reserveCommonEvent(commonEventId);
      const script = String(option.scriptOnSelect || option.script || "");
      if (script) {
        try { Function(String(script)).call(this, index, option.text || "", option, item); }
        catch (error) { console.error("[DB_UIComposer] ImageChoice script error", error, option); }
      }
      if (toBool(item.closeWindowOnSelect, false)) this.closeComposerWindowAfterChoice();
    }

    choiceListTextCacheKey(item, entries, scroll, visibleRows, style, textRightPadding) {
      const visible = entries.slice(scroll, scroll + visibleRows).map(entry => ({
        index: entry.index,
        text: entry.text,
        state: entry.state
      }));
      return JSON.stringify({
        id: String(item.id || ""),
        width: Math.max(1, toNumber(item.width, 240)),
        height: choiceListHeight(item),
        rowHeight: choiceListRowHeight(item),
        gap: choiceListGap(item),
        scroll,
        visibleRows,
        textRightPadding,
        align: String(item.align || "center"),
        disabledTextColor: String(item.disabledTextColor || "rgba(180,180,180,0.85)"),
        style,
        visible
      });
    }

    choiceListTextBitmap(item, entries, scroll, visibleRows, style, textRightPadding) {
      this._dbUiChoiceTextCache = this._dbUiChoiceTextCache || {};
      const id = String(item.id || "");
      const key = this.choiceListTextCacheKey(item, entries, scroll, visibleRows, style, textRightPadding);
      const cached = this._dbUiChoiceTextCache[id];
      if (cached && cached.key === key && cached.bitmap && cached.bitmap.width > 0) return cached.bitmap;

      const width = Math.max(1, toNumber(item.width, 240));
      const height = choiceListHeight(item);
      const rowHeight = choiceListRowHeight(item);
      const gap = choiceListGap(item);
      const align = String(item.align || "center");
      const disabledTextColor = String(item.disabledTextColor || "rgba(180,180,180,0.85)");
      const bitmap = new Bitmap(width, height);
      resetBitmapFontState(bitmap);

      const oldContents = this.contents;
      this.contents = bitmap;
      withBitmapFont(bitmap, style, () => {
        for (let row = 0; row < visibleRows; row++) {
          const entry = entries[scroll + row];
          if (!entry) continue;
          const yy = row * (rowHeight + gap);
          const oldRowColor = bitmap.textColor;
          if (entry.state !== "enabled") bitmap.textColor = disabledTextColor;
          this.drawDbEscapedAlignedText(
            entry.text !== undefined ? entry.text : "",
            6,
            yy + Math.floor((rowHeight - this.lineHeight()) / 2) + this.textYOffset(),
            Math.max(1, width - 12 - textRightPadding),
            align
          );
          bitmap.textColor = oldRowColor;
        }
      });
      this.contents = oldContents;

      this._dbUiChoiceTextCache[id] = { key, bitmap };
      return bitmap;
    }

    drawDbChoiceList(item) {
      const x = toNumber(item.x, 0);
      const y = toNumber(item.y, 0);
      const width = Math.max(1, toNumber(item.width, 240));
      const rowHeight = choiceListRowHeight(item);
      const gap = choiceListGap(item);
      const entries = choiceListEntries(item);
      const visibleRows = choiceListVisibleRows(item);
      const totalRows = entries.length;
      const itemId = String(item.id || "");
      const maxScroll = Math.max(0, totalRows - visibleRows);
      this._dbUiChoiceScroll = this._dbUiChoiceScroll || {};
      const scroll = clamp(toNumber(this._dbUiChoiceScroll[itemId], 0), 0, maxScroll);
      this._dbUiChoiceScroll[itemId] = scroll;
      const hoverIndex = this._dbUiChoiceHoverId === itemId ? toNumber(this._dbUiChoiceHoverIndex, -1) : -1;
      const selectedIndex = toNumber(item.selectedIndex, -1);
      const pressedIndex = (this._dbUiChoicePressFrames > 0 && this._dbUiChoicePressedId === itemId)
        ? toNumber(this._dbUiChoicePressedIndex, -1)
        : -1;
      const normalBack = String(item.normalBackColor || "rgba(255,255,255,0.10)");
      const hoverBack = String(item.hoverBackColor || "rgba(255,255,255,0.22)");
      const selectedBack = String(item.selectedBackColor || "rgba(98,169,255,0.35)");
      const pressedBack = String(item.pressedBackColor || item.clickBackColor || selectedBack || "rgba(255,220,120,0.45)");
      const disabledBack = String(item.disabledBackColor || "rgba(0,0,0,0.28)");
      const borderColor = String(item.borderColor || "rgba(255,255,255,0.35)");
      const needScrollbar = maxScroll > 0;
      const scrollbarWidth = needScrollbar ? Math.max(4, toNumber(item.scrollbarWidth, 8)) : 0;
      const textRightPadding = needScrollbar ? scrollbarWidth + 8 : 0;
      const oldPaintOpacity = this.contents.paintOpacity;

      const settings = this._dbUiLayoutSettings || {};
      const win = this._dbUiDefinition || {};
      const style = {
        fontFace: effectiveFontFace(settings, win, item),
        fontSize: effectiveFontSize(settings, win, item, 18),
        bold: item.bold,
        italic: item.italic,
        textColor: effectiveTextColor(settings, win, item),
        outlineColor: effectiveOutlineColor(settings, win, item),
        outlineWidth: effectiveOutlineWidth(settings, win, item)
      };

      if (isDebugEnabled()) {
        console.info("[DB_UIComposer][font-debug] choice:style", {
          windowId: this._dbUiComposerWindowId || this._dbUiDefinition?.id || "",
          itemId,
          style,
          beforeChoiceDraw: bitmapFontDebugState(this.contents),
          hoverIndex,
          selectedIndex,
          textCache: !!this._dbUiChoiceTextCache?.[itemId],
          entries: entries.map(entry => ({ index: entry.index, text: entry.text, state: entry.state }))
        });
      }

      // 重要:
      // hover/選択状態が変わるたびに文字まで再描画すると、Canvasのフォントレンダリング差で
      // 一瞬だけ文字が太る/細るように見える環境があります。
      // そのため、通常のhover更新では背景と枠だけ描き直し、文字はキャッシュBitmapをbltします。
      for (let row = 0; row < visibleRows; row++) {
        const entry = entries[scroll + row];
        if (!entry) continue;
        const index = entry.index;
        const yy = y + row * (rowHeight + gap);
        const enabled = entry.state === "enabled";
        const back = !enabled ? disabledBack : index === pressedIndex ? pressedBack : index === selectedIndex ? selectedBack : index === hoverIndex ? hoverBack : normalBack;
        const effect = enabled && index === pressedIndex ? interactionAnimationEffect(item.pressAnimation || "none") : enabled && index === hoverIndex ? interactionAnimationEffect(item.hoverAnimation || "none") : interactionAnimationEffect("none");
        const drawW = Math.max(1, Math.round(width * effect.scale));
        const drawH = Math.max(1, Math.round(rowHeight * effect.scale));
        const drawX = x + effect.offsetX - Math.floor((drawW - width) / 2);
        const drawY = yy + effect.offsetY - Math.floor((drawH - rowHeight) / 2);
        const rowOldOpacity = this.contents.paintOpacity;
        this.contents.paintOpacity = clamp(rowOldOpacity * effect.opacity, 0, 255);
        this.contents.fillRect(drawX, drawY, drawW, drawH, back);
        this.contents.fillRect(drawX, drawY, drawW, 1, borderColor);
        this.contents.fillRect(drawX, drawY + drawH - 1, drawW, 1, borderColor);
        this.contents.fillRect(drawX, drawY, 1, drawH, borderColor);
        this.contents.fillRect(drawX + drawW - 1, drawY, 1, drawH, borderColor);
        this.contents.paintOpacity = rowOldOpacity;
      }

      if (needScrollbar) {
        const listHeight = choiceListHeight(item);
        const trackX = x + width - scrollbarWidth - 2;
        const trackY = y + 2;
        const trackH = Math.max(1, listHeight - 4);
        const thumbH = Math.max(12, Math.floor(trackH * visibleRows / Math.max(1, totalRows)));
        const thumbRange = Math.max(0, trackH - thumbH);
        const thumbY = trackY + (maxScroll > 0 ? Math.round(thumbRange * scroll / maxScroll) : 0);
        const trackColor = String(item.scrollbarTrackColor || "rgba(0,0,0,0.35)");
        const thumbColor = String(item.scrollbarThumbColor || "rgba(255,255,255,0.70)");
        this.contents.paintOpacity = clamp(toNumber(item.scrollbarOpacity, 220), 0, 255);
        this.contents.fillRect(trackX, trackY, scrollbarWidth, trackH, trackColor);
        this.contents.paintOpacity = 255;
        this.contents.fillRect(trackX, thumbY, scrollbarWidth, thumbH, thumbColor);
      }

      const textBitmap = this.choiceListTextBitmap(item, entries, scroll, visibleRows, style, textRightPadding);
      this.contents.paintOpacity = 255;
      this.contents.blt(textBitmap, 0, 0, textBitmap.width, textBitmap.height, x, y);
      this.contents.paintOpacity = oldPaintOpacity;
    }

    choiceListBoxHitAt(localX, localY, screenX, screenY) {
      const items = [...(this._dbUiDefinition.items || [])].map((item, index) => ({ item, index }))
        .sort((a, b) => -compareDisplayOrder(a.item, b.item, a.index, b.index))
        .map(entry => entry.item);
      for (const item of items) {
        if (item.type !== "choiceList" || item.visible === false) continue;
        const x = toNumber(item.x, 0);
        const y = toNumber(item.y, 0);
        const width = Math.max(1, toNumber(item.width, 240));
        const height = choiceListHeight(item);
        if (item.allowOutsideWindow !== true) {
          if (screenX < this.x || screenX >= this.x + this.width || screenY < this.y || screenY >= this.y + this.height) continue;
        }
        if (localX >= x && localX < x + width && localY >= y && localY < y + height) return item;
      }
      return null;
    }

    choiceListHitItemAt(localX, localY, screenX, screenY) {
      const items = [...(this._dbUiDefinition.items || [])].map((item, index) => ({ item, index }))
        .sort((a, b) => -compareDisplayOrder(a.item, b.item, a.index, b.index))
        .map(entry => entry.item);
      for (const item of items) {
        if (item.type !== "choiceList" || item.visible === false) continue;
        const x = toNumber(item.x, 0);
        const y = toNumber(item.y, 0);
        const width = Math.max(1, toNumber(item.width, 240));
        const height = choiceListHeight(item);
        if (item.allowOutsideWindow !== true) {
          if (screenX < this.x || screenX >= this.x + this.width || screenY < this.y || screenY >= this.y + this.height) continue;
        }
        if (localX >= x && localX < x + width && localY >= y && localY < y + height) {
          const rowHeight = choiceListRowHeight(item);
          const gap = choiceListGap(item);
          const localRowY = localY - y;
          const row = Math.floor(localRowY / (rowHeight + gap));
          if (row < 0 || row >= choiceListVisibleRows(item)) return null;
          if ((localRowY % (rowHeight + gap)) >= rowHeight) return null;
          const entries = choiceListEntries(item);
          const scroll = clamp(toNumber(this._dbUiChoiceScroll?.[String(item.id || "")], 0), 0, Math.max(0, entries.length - choiceListVisibleRows(item)));
          const entry = entries[scroll + row];
          if (!entry) return null;
          return { item, index: entry.index };
        }
      }
      return null;
    }

    updateChoiceLists() {
      if (!this.visible || !this.isOpen()) return;
      if (!this.windowInputEnabled()) return;
      let needsRefresh = false;
      if (this._dbUiChoicePressFrames > 0) {
        this._dbUiChoicePressFrames--;
        if (this._dbUiChoicePressFrames <= 0) {
          this._dbUiChoicePressedId = "";
          this._dbUiChoicePressedIndex = -1;
          needsRefresh = true;
        }
      }
      this._dbUiChoiceScroll = this._dbUiChoiceScroll || {};
      const metrics = this.placementMetrics();
      const localX = TouchInput.x - this.x - metrics.contentLeft;
      const localY = TouchInput.y - this.y - metrics.contentTop + this.windowScrollY(metrics);
      const overItem = this.choiceListBoxHitAt(localX, localY, TouchInput.x, TouchInput.y);
      const hit = this.choiceListHitItemAt(localX, localY, TouchInput.x, TouchInput.y);
      const oldHoverKey = `${this._dbUiChoiceHoverId || ""}:${this._dbUiChoiceHoverIndex ?? -1}`;
      this._dbUiChoiceHoverId = hit ? String(hit.item.id || "") : "";
      this._dbUiChoiceHoverIndex = hit ? hit.index : -1;
      const newHoverKey = `${this._dbUiChoiceHoverId || ""}:${this._dbUiChoiceHoverIndex ?? -1}`;
      needsRefresh = needsRefresh || oldHoverKey !== newHoverKey;
      if (oldHoverKey !== newHoverKey) log("choice hover", { windowId: this._dbUiComposerWindowId, oldHoverKey, newHoverKey });

      const wheelY = toNumber(TouchInput.wheelY, 0);
      if (wheelY && overItem) {
        const id = String(overItem.id || "");
        const rows = choiceListEntries(overItem);
        const maxScroll = Math.max(0, rows.length - choiceListVisibleRows(overItem));
        const current = clamp(toNumber(this._dbUiChoiceScroll[id], 0), 0, maxScroll);
        const step = Math.max(1, Math.floor(Math.abs(wheelY) / 20) || 1);
        const next = clamp(current + (wheelY > 0 ? step : -step), 0, maxScroll);
        if (next !== current) {
          this._dbUiChoiceScroll[id] = next;
          needsRefresh = true;
        }
      }

      if (TouchInput.isTriggered() && hit) {
        const id = String(hit.item.id || "");
        const enabled = isChoiceEnabled(hit.item, hit.index);
        interactionLog(enabled ? "choice click" : "choice disabled click", {
          layoutId: this._dbUiComposerLayoutId,
          windowId: this._dbUiComposerWindowId,
          itemId: id,
          index: hit.index,
          text: choiceListRows(hit.item)[hit.index] || "",
          enabled,
          mouse: { x: TouchInput.x, y: TouchInput.y },
          local: { x: localX, y: localY }
        });
        if (enabled) {
          this._dbUiChoicePressedId = id;
          this._dbUiChoicePressedIndex = hit.index;
          this._dbUiChoicePressFrames = Math.max(6, toNumber(hit.item.pressHoldFrames, 6));
          this.executeChoiceList(hit.item, hit.index);
          needsRefresh = true;
        }
      }

      if (needsRefresh) this.refresh("choiceHoverOrClick");
    }

    executeChoiceList(item, index) {
      if (!isChoiceEnabled(item, index)) {
        interactionLog("choice execution blocked", {
          layoutId: this._dbUiComposerLayoutId,
          windowId: this._dbUiComposerWindowId,
          itemId: String(item.id || ""),
          index
        });
        return;
      }
      const rows = choiceListRows(item);
      const text = rows[index] !== undefined ? rows[index] : "";
      item.selectedIndex = index;
      interactionLog("choice selected", {
        layoutId: this._dbUiComposerLayoutId,
        windowId: this._dbUiComposerWindowId,
        itemId: String(item.id || ""),
        index,
        text,
        resultVariableId: toNumber(item.resultVariableId, 0),
        commonEventId: toNumber(item.commonEventId, 0)
      });
      const variableId = toNumber(item.resultVariableId, 0);
      if (variableId > 0) $gameVariables.setValue(variableId, index + 1);
      const textVariableId = toNumber(item.resultTextVariableId, 0);
      if (textVariableId > 0) $gameVariables.setValue(textVariableId, text);
      const commonEventId = toNumber(item.commonEventId, 0);
      if (commonEventId > 0) $gameTemp.reserveCommonEvent(commonEventId);
      if (item.script) {
        try {
          Function(String(item.script)).call(this, index, text, item);
        } catch (error) {
          console.error("[DB_UIComposer] ChoiceList script error", error, item);
        }
      }
      if (toBool(item.closeWindowOnSelect, false)) {
        this.closeComposerWindowAfterChoice();
      }
    }

    buttonStateConfig(item, stateName) {
      const states = item && item.buttonStates && typeof item.buttonStates === "object" ? item.buttonStates : {};
      const src = states[stateName] && typeof states[stateName] === "object" ? states[stateName] : {};
      return {
        enabled: toBool(src.enabled, false),
        backColor: String(src.backColor || ""),
        borderColor: String(src.borderColor || ""),
        textColor: String(src.textColor || ""),
        opacity: clamp(toNumber(src.opacity, 255), 0, 255),
        scaleXPercent: Math.max(1, toNumber(src.scaleXPercent, 100)),
        scaleYPercent: Math.max(1, toNumber(src.scaleYPercent, 100)),
        offsetX: toNumber(src.offsetX, 0),
        offsetY: toNumber(src.offsetY, 0),
        actionEnabled: toBool(src.actionEnabled, false),
        commonEventId: toNumber(src.commonEventId, 0),
        switchId: toNumber(src.switchId, 0),
        variableId: toNumber(src.variableId, 0),
        variableValue: toNumber(src.variableValue, 0),
        script: String(src.script || "")
      };
    }

    currentButtonStateName(item) {
      const id = String(item.id || "");
      // 優先度: クリック押下 > クリック離す > マウスON > マウスOFF
      // 押下フレームを最低数フレーム保持し、mouseOnに即座に上書きされないようにします。
      if (this._dbUiButtonPressedId === id) return "press";
      if (this._dbUiButtonPressFrames > 0 && this._dbUiButtonPressFrameId === id) return "press";
      if (this._dbUiButtonReleaseFrames > 0 && this._dbUiButtonReleaseId === id) return "release";
      if (this._dbUiButtonHoverId === id) return "mouseOn";
      return "mouseOff";
    }

    buttonHitItemAt(localX, localY, screenX, screenY) {
      const items = [...(this._dbUiDefinition.items || [])].map((item, index) => ({ item, index }))
        .sort((a, b) => -compareDisplayOrder(a.item, b.item, a.index, b.index))
        .map(entry => entry.item);
      for (const item of items) {
        if (item.type !== "button" || item.visible === false) continue;
        const x = toNumber(item.x, 0);
        const y = toNumber(item.y, 0);
        const width = Math.max(1, toNumber(item.width, 120));
        const height = Math.max(1, toNumber(item.height, 36));
        if (item.allowOutsideWindow !== true) {
          if (screenX < this.x || screenX >= this.x + this.width || screenY < this.y || screenY >= this.y + this.height) continue;
        }
        if (localX >= x && localX < x + width && localY >= y && localY < y + height) return item;
      }
      return null;
    }

    executeButtonStateAction(item, stateName) {
      const state = this.buttonStateConfig(item, stateName);
      if (!state.actionEnabled) return;
      if (state.switchId > 0) $gameSwitches.setValue(state.switchId, true);
      if (state.variableId > 0) $gameVariables.setValue(state.variableId, state.variableValue);
      if (state.commonEventId > 0) $gameTemp.reserveCommonEvent(state.commonEventId);
      if (state.script) {
        try {
          Function(String(state.script)).call(this, item, stateName);
        } catch (error) {
          console.error("[DB_UIComposer] Button state script error", error, stateName, item);
        }
      }
    }

    drawDbButton(item) {
      const stateName = this.currentButtonStateName(item);
      const state = this.buttonStateConfig(item, stateName);
      const baseX = toNumber(item.x, 0);
      const baseY = toNumber(item.y, 0);
      const baseW = Math.max(1, toNumber(item.width, 120));
      const baseH = Math.max(1, toNumber(item.height, 36));
      const useState = state.enabled;
      const anim = itemInteractionAnimation(item, stateName);
      const sx = (useState ? state.scaleXPercent / 100 : 1) * anim.scale;
      const sy = (useState ? state.scaleYPercent / 100 : 1) * anim.scale;
      const width = Math.max(1, Math.round(baseW * sx));
      const height = Math.max(1, Math.round(baseH * sy));
      const x = baseX + (useState ? state.offsetX : 0) + anim.offsetX - Math.floor((width - baseW) / 2);
      const y = baseY + (useState ? state.offsetY : 0) + anim.offsetY - Math.floor((height - baseH) / 2);
      const backColor = String(useState && state.backColor ? state.backColor : item.backColor || "rgba(255,255,255,0.18)");
      const borderColor = String(useState && state.borderColor ? state.borderColor : item.borderColor || "rgba(255,255,255,0.55)");
      const overrideTextColor = String(useState && state.textColor ? state.textColor : item.color || item.textColor || "");
      const oldPaintOpacity = this.contents.paintOpacity;
      this.contents.paintOpacity = clamp((useState ? state.opacity : clamp(toNumber(item.opacity, 255), 0, 255)) * anim.opacity, 0, 255);

      const visualMode = String(item.buttonVisualMode || "normal");
      const imageDef = visualMode !== "normal" ? buttonImageForState(item, stateName) : null;
      if (imageDef && imageDef.fileName) {
        const bitmap = this.imageBitmap(imageDef);
        if (bitmap && bitmap.isReady && bitmap.isReady()) {
          const imageOpacity = clamp(toNumber(imageDef.opacity, 255), 0, 255);
          this.contents.paintOpacity = clamp(this.contents.paintOpacity * imageOpacity / 255, 0, 255);
          this.contents.blt(bitmap, 0, 0, Math.max(1, bitmap.width), Math.max(1, bitmap.height), x, y, width, height);
        } else if (bitmap && bitmap.addLoadListener) {
          bitmap.addLoadListener(() => { if (this.isDbUiAlive()) this.refresh("buttonImageLoaded"); });
        }
      } else {
        this.contents.fillRect(x, y, width, height, backColor);
        this.contents.fillRect(x, y, width, 1, borderColor);
        this.contents.fillRect(x, y + height - 1, width, 1, borderColor);
        this.contents.fillRect(x, y, 1, height, borderColor);
        this.contents.fillRect(x + width - 1, y, 1, height, borderColor);
      }

      const settings = this._dbUiLayoutSettings || {};
      const win = this._dbUiDefinition || {};
      const style = {
        fontFace: effectiveFontFace(settings, win, item),
        fontSize: effectiveFontSize(settings, win, item, 20),
        bold: item.bold,
        italic: item.italic,
        textColor: overrideTextColor || effectiveTextColor(settings, win, item),
        outlineColor: effectiveOutlineColor(settings, win, item),
        outlineWidth: effectiveOutlineWidth(settings, win, item)
      };
      if (String(item.text || "").length > 0) {
        this.contents.paintOpacity = oldPaintOpacity;
        withBitmapFont(this.contents, style, () => {
          this.drawDbEscapedAlignedText(item.text || "", x, y + Math.floor((height - this.lineHeight()) / 2) + this.textYOffset(), width, "center");
        });
      }
      this.contents.paintOpacity = oldPaintOpacity;
    }

    updateButtons() {
      if (!this.visible || !this.isOpen()) return;
      if (!this.windowInputEnabled()) return;
      let needsRefresh = false;
      if (this._dbUiButtonReleaseFrames > 0) {
        this._dbUiButtonReleaseFrames--;
        if (this._dbUiButtonReleaseFrames <= 0) {
          this._dbUiButtonReleaseId = "";
          needsRefresh = true;
        }
      }
      if (this._dbUiButtonPressFrames > 0) {
        this._dbUiButtonPressFrames--;
        if (this._dbUiButtonPressFrames <= 0) {
          this._dbUiButtonPressFrameId = "";
          needsRefresh = true;
        }
      }
      const metrics = this.placementMetrics();
      const localX = TouchInput.x - this.x - metrics.contentLeft;
      const localY = TouchInput.y - this.y - metrics.contentTop + this.windowScrollY(metrics);
      const hovered = this.buttonHitItemAt(localX, localY, TouchInput.x, TouchInput.y);
      const oldHoverId = this._dbUiButtonHoverId || "";
      const newHoverId = hovered ? String(hovered.id || "") : "";
      const pressedNow = !!((TouchInput.isPressed && TouchInput.isPressed()) || TouchInput._mousePressed || TouchInput._screenPressed);
      const triggeredNow = !!(TouchInput.isTriggered && TouchInput.isTriggered());
      const releasedNow = !!(TouchInput.isReleased && TouchInput.isReleased());

      if (oldHoverId !== newHoverId) {
        const oldItem = (this._dbUiDefinition.items || []).find(item => String(item.id || "") === oldHoverId);
        if (oldItem) this.executeButtonStateAction(oldItem, "mouseOff");
        if (hovered) this.executeButtonStateAction(hovered, "mouseOn");
        this._dbUiButtonHoverId = newHoverId;
        log("button hover", { windowId: this._dbUiComposerWindowId, oldHoverId, newHoverId });
        needsRefresh = true;
      }

      if ((triggeredNow || pressedNow) && hovered) {
        if (this._dbUiButtonPressedId !== newHoverId || this._dbUiButtonPressFrames <= 0) {
          this._dbUiButtonPressedId = newHoverId;
          this._dbUiButtonPressFrameId = newHoverId;
          this._dbUiButtonPressFrames = Math.max(6, toNumber(hovered.pressHoldFrames, 6));
          this._dbUiButtonReleaseId = "";
          this._dbUiButtonReleaseFrames = 0;
          this._dbUiButtonPressActionId = "";
          interactionLog("button press visual", { windowId: this._dbUiComposerWindowId, buttonId: newHoverId, pressedNow, triggeredNow });
          needsRefresh = true;
        }
        if (this._dbUiButtonPressActionId !== newHoverId) {
          this.executeButtonStateAction(hovered, "press");
          this._dbUiButtonPressActionId = newHoverId;
        }
      }

      if (releasedNow || (!pressedNow && this._dbUiButtonPressedId)) {
        const pressedId = this._dbUiButtonPressedId || this._dbUiButtonPressFrameId || "";
        const pressedItem = (this._dbUiDefinition.items || []).find(item => String(item.id || "") === pressedId);
        if (pressedItem) {
          // pressを視認できるように、押下保持フレームが残っている間はrelease表示を遅らせます。
          if (this._dbUiButtonPressFrames <= 0) {
            this._dbUiButtonReleaseId = pressedId;
            this._dbUiButtonReleaseFrames = 8;
          }
          this.executeButtonStateAction(pressedItem, "release");
          if (newHoverId === pressedId) this.executeButton(pressedItem);
          interactionLog("button release", { windowId: this._dbUiComposerWindowId, buttonId: pressedId, hoverId: newHoverId, releasedNow, pressedNow });
          needsRefresh = true;
        }
        this._dbUiButtonPressedId = "";
        this._dbUiButtonPressActionId = "";
      }

      if (needsRefresh) this.refresh();
    }

    executeButton(item) {
      SoundManager.playOk();
      const commonEventId = toNumber(item.commonEventId, 0);
      const switchId = toNumber(item.switchId, 0);
      const variableId = toNumber(item.variableId, 0);
      if (switchId > 0) $gameSwitches.setValue(switchId, true);
      if (variableId > 0) $gameVariables.setValue(variableId, toNumber(item.variableValue, 0));
      if (commonEventId > 0) $gameTemp.reserveCommonEvent(commonEventId);
      if (item.script) {
        try {
          Function(String(item.script)).call(this);
        } catch (error) {
          console.error("[DB_UIComposer] Button script error", error, item);
        }
      }
    }
  }

  const _Game_System_initialize = Game_System.prototype.initialize;
  Game_System.prototype.initialize = function() {
    _Game_System_initialize.call(this);
    this._dbUiComposerLayouts = {};
    this._dbUiComposerHiddenLayouts = {};
    this._dbUiComposerWindowVisible = {};
    this._dbUiComposerRuntimeStates = {};
    this._dbUiComposerGroupVisible = {};
    this._dbUiComposerDebugLog = PARAM_DEBUG_LOG;
  };

  const _Scene_Map_createDisplayObjects = Scene_Map.prototype.createDisplayObjects;
  Scene_Map.prototype.createDisplayObjects = function() {
    _Scene_Map_createDisplayObjects.call(this);
    this.dbUiComposerCreateLayers();
    if (AUTO_REAPPLY) this.dbUiComposerRefresh();
  };

  Scene_Map.prototype.dbUiComposerCreateLayers = function() {
    this.dbUiComposerRemoveLayers();
    this._dbUiComposerMapLayer = new PIXI.Container();
    this._dbUiComposerFrontLayer = new PIXI.Container();
    const windowLayerIndex = this.children.indexOf(this._windowLayer);
    if (windowLayerIndex >= 0) {
      this.addChildAt(this._dbUiComposerMapLayer, windowLayerIndex);
      this.addChild(this._dbUiComposerFrontLayer);
    } else {
      this.addChild(this._dbUiComposerMapLayer);
      this.addChild(this._dbUiComposerFrontLayer);
    }
  };

  Scene_Map.prototype.dbUiComposerRemoveLayers = function() {
    if (this._dbUiComposerMapLayer && this._dbUiComposerMapLayer.parent) {
      this._dbUiComposerMapLayer.parent.removeChild(this._dbUiComposerMapLayer);
    }
    if (this._dbUiComposerFrontLayer && this._dbUiComposerFrontLayer.parent) {
      this._dbUiComposerFrontLayer.parent.removeChild(this._dbUiComposerFrontLayer);
    }
    this._dbUiComposerMapLayer = null;
    this._dbUiComposerFrontLayer = null;
    this._dbUiComposerWindows = [];
  };

  Scene_Map.prototype.dbUiComposerClearSceneWindows = function() {
    if (this._dbUiComposerWindows) {
      for (const win of this._dbUiComposerWindows) {
        win._dbUiDisposed = true;
        if (win.parent) win.parent.removeChild(win);
        if (typeof win.destroy === "function") win.destroy({ children: true });
      }
    }
    this._dbUiComposerWindows = [];
    if (this._dbUiComposerMapLayer) this._dbUiComposerMapLayer.removeChildren();
    if (this._dbUiComposerFrontLayer) this._dbUiComposerFrontLayer.removeChildren();
  };

  Scene_Map.prototype.dbUiComposerRefresh = function() {
    if (!this._dbUiComposerMapLayer || !this._dbUiComposerFrontLayer) return;
    this.dbUiComposerClearSceneWindows();
    ensureSystemStore();
    const layouts = $gameSystem._dbUiComposerLayouts || {};
    const hiddenLayouts = $gameSystem._dbUiComposerHiddenLayouts || {};
    const windowVisible = $gameSystem._dbUiComposerWindowVisible || {};
    log("Scene_Map.dbUiComposerRefresh start", {
      layoutCount: Object.keys(layouts).length,
      hiddenLayouts,
      windowVisible
    });
    for (const layoutId of Object.keys(layouts)) {
      if (hiddenLayouts[layoutId]) continue;
      const layout = normalizeLayout(layouts[layoutId]);
      log("refresh layout", debugLayoutSummary(layout));
      const orderedWindows = [...(layout.windows || [])]
        .map((definition, index) => ({ def: applyRuntimeStateToWindow(layoutId, definition), index }))
        .sort((a, b) => {
          const la = layerBaseOrder(a.def.layer);
          const lb = layerBaseOrder(b.def.layer);
          if (la !== lb) return la - lb;
          return compareDisplayOrder(a.def, b.def, a.index, b.index);
        })
        .map(entry => entry.def);
      for (const def of orderedWindows) {
        if (def.visible === false || windowVisible[def.id] === false) continue;
        if (!windowAllowedByGroupAndScene(layoutId, layout, def)) continue;
        const win = new DB_UIComposerWindow(Object.assign({}, def, { layoutSettings: layout.settings || def.layoutSettings || {} }));
        win._dbUiComposerLayoutId = layoutId;
        win._dbUiComposerWindowId = def.id;
        const layerName = String(def.layer || "mapUi");
        if (layerName === "messageAbove" || layerName === "overlay") {
          this._dbUiComposerFrontLayer.addChild(win);
        } else {
          this._dbUiComposerMapLayer.addChild(win);
        }
        this._dbUiComposerWindows.push(win);
        log("create scene window", { layoutId, window: debugWindowSummary(def), layerName });
      }
    }
    log("Scene_Map.dbUiComposerRefresh done", { sceneWindowCount: this._dbUiComposerWindows.length });
  };

  Scene_Map.prototype.dbUiComposerUpdateWindows = function() {
    const frame = Graphics && Graphics.frameCount !== undefined ? Graphics.frameCount : 0;
    const windows = Array.isArray(this._dbUiComposerWindows) ? this._dbUiComposerWindows : [];
    for (const win of windows) {
      if (!win || !win.parent || win._dbUiDisposed) continue;
      if (win._dbUiComposerLastUpdateFrame === frame) continue;
      win._dbUiComposerLastUpdateFrame = frame;
      if (typeof win.update === "function") win.update();
    }
  };

  Scene_Map.prototype.dbUiComposerRefreshDatabaseBindings = function(options = {}) {
    const layoutId = String(options.layoutId || "").trim();
    const windowId = String(options.windowId || "").trim();
    const itemId = String(options.itemId || "").trim();
    const windows = Array.isArray(this._dbUiComposerWindows) ? this._dbUiComposerWindows : [];
    for (const win of windows) {
      if (!win || win._dbUiDisposed) continue;
      if (layoutId && String(win._dbUiComposerLayoutId || "") !== layoutId) continue;
      if (windowId && String(win._dbUiComposerWindowId || "") !== windowId) continue;
      if (itemId) {
        const items = win._dbUiDefinition?.items || [];
        if (!items.some(item => String(item?.id || "") === itemId)) continue;
      }
      if (typeof win.refresh === "function") win.refresh("databaseBindingCommand");
    }
  };

  const _Scene_Map_update = Scene_Map.prototype.update;
  Scene_Map.prototype.update = function() {
    _Scene_Map_update.call(this);
    // DB_UIComposerのウィンドウは通常のWindowLayerではなく専用PIXI.Containerへ入れているため、
    // Scene標準のupdateChildrenだけではWindow.updateが呼ばれない環境があります。
    // ここで明示的に更新し、マウスON・クリック・ホイールスクロールを動作させます。
    this.dbUiComposerUpdateWindows?.();
  };

  const _Scene_Map_terminate = Scene_Map.prototype.terminate;
  Scene_Map.prototype.terminate = function() {
    this.dbUiComposerClearSceneWindows?.();
    _Scene_Map_terminate.call(this);
  };

  PluginManager.registerCommand(PLUGIN_NAME, "ApplyLayoutJson", args => {
    try {
      const json = String(args.json || "{}");
      const layout = parseLayoutJson(json);
      applyLayout(layout, toBool(args.clearBefore, true));
    } catch (error) {
      console.error("[DB_UIComposer] ApplyLayoutJson parse error", error, error._firstError || "", args.json);
    }
  });

  PluginManager.registerCommand(PLUGIN_NAME, "LoadLayoutFile", args => {
    const fileName = String(args.fileName || "").trim();
    if (!fileName) return;
    const url = `data/uiLayouts/${fileName}`;
    loadTextFile(url, text => {
      try {
        applyLayout(parseLayoutJson(text), toBool(args.clearBefore, true));
      } catch (error) {
        console.error("[DB_UIComposer] LoadLayoutFile parse error", error, error._firstError || "", url);
      }
    }, error => console.error("[DB_UIComposer]", error));
  });

  PluginManager.registerCommand(PLUGIN_NAME, "SetDebugLog", args => {
    ensureSystemStore();
    $gameSystem._dbUiComposerDebugLog = toBool(args.enabled, true);
    console.log("[DB_UIComposer] DebugLog", $gameSystem._dbUiComposerDebugLog ? "ON" : "OFF");
  });

  PluginManager.registerCommand(PLUGIN_NAME, "DumpDebugInfo", () => {
    dumpDebugInfo();
  });

  PluginManager.registerCommand(PLUGIN_NAME, "RefreshDatabaseBindings", args => {
    const scene = SceneManager._scene;
    if (scene && typeof scene.dbUiComposerRefreshDatabaseBindings === "function") {
      scene.dbUiComposerRefreshDatabaseBindings({
        layoutId: String(args.layoutId || ""),
        windowId: String(args.windowId || ""),
        itemId: String(args.itemId || "")
      });
    } else if (scene && typeof scene.dbUiComposerRefresh === "function") {
      scene.dbUiComposerRefresh();
    }
  });

  PluginManager.registerCommand(PLUGIN_NAME, "AddLogText", args => {
    appendRuntimeLogText(String(args.layoutId || DEFAULT_LAYOUT_ID), String(args.windowId || ""), String(args.text ?? ""), {
      maxLines: toNumber(args.maxLines, 200),
      scrollToBottom: toBool(args.scrollToBottom, true)
    });
  });

  PluginManager.registerCommand(PLUGIN_NAME, "ClearLog", args => {
    clearRuntimeLog(String(args.layoutId || DEFAULT_LAYOUT_ID), String(args.windowId || ""));
  });

  PluginManager.registerCommand(PLUGIN_NAME, "SetLogScroll", args => {
    setRuntimeLogScroll(String(args.layoutId || DEFAULT_LAYOUT_ID), String(args.windowId || ""), toNumber(args.scrollY, 0));
  });

  PluginManager.registerCommand(PLUGIN_NAME, "ClearAll", () => {
    ensureSystemStore();
    $gameSystem._dbUiComposerLayouts = {};
    $gameSystem._dbUiComposerHiddenLayouts = {};
    $gameSystem._dbUiComposerWindowVisible = {};
    $gameSystem._dbUiComposerRuntimeStates = {};
    $gameSystem._dbUiComposerGroupVisible = {};
    refreshScene();
  });

  PluginManager.registerCommand(PLUGIN_NAME, "ShowLayout", args => {
    ensureSystemStore();
    delete $gameSystem._dbUiComposerHiddenLayouts[String(args.layoutId || DEFAULT_LAYOUT_ID)];
    refreshScene();
  });

  PluginManager.registerCommand(PLUGIN_NAME, "HideLayout", args => {
    ensureSystemStore();
    $gameSystem._dbUiComposerHiddenLayouts[String(args.layoutId || DEFAULT_LAYOUT_ID)] = true;
    refreshScene();
  });

  PluginManager.registerCommand(PLUGIN_NAME, "SetWindowVisible", args => {
    ensureSystemStore();
    const windowId = String(args.windowId || "");
    const visible = toBool(args.visible, true);
    const layoutId = String(args.layoutId || "").trim();
    if (layoutId) {
      const found = findWindowInLayout(layoutId, windowId);
      if (!found) return console.warn("[DB_UIComposer] SetWindowVisible target window not found", { layoutId, windowId });
      Object.assign(runtimeWindowOverride(found.layoutId, found.win.id, true), { visible });
      log("SetWindowVisible applied", { layoutId: found.layoutId, windowId: found.win.id, visible });
    } else {
      // v0.2.82以前との互換: layoutIdが省略された場合は従来のグローバル表示状態を使います。
      $gameSystem._dbUiComposerWindowVisible[windowId] = visible;
    }
    refreshScene();
  });

  PluginManager.registerCommand(PLUGIN_NAME, "SetGroupVisible", args => {
    setRuntimeGroupVisible(
      String(args.layoutId || DEFAULT_LAYOUT_ID),
      String(args.groupId || ""),
      toBool(args.visible, true)
    );
  });

  PluginManager.registerCommand(PLUGIN_NAME, "SetCompositeImageSet", args => {
    setRuntimeCompositeImageSet(
      String(args.layoutId || DEFAULT_LAYOUT_ID),
      String(args.windowId || ""),
      String(args.itemId || ""),
      String(args.layersJson || "[]")
    );
  });

  PluginManager.registerCommand(PLUGIN_NAME, "FadeInCompositeImage", args => {
    fadeInRuntimeCompositeImage(
      String(args.layoutId || DEFAULT_LAYOUT_ID),
      String(args.windowId || ""),
      String(args.itemId || ""),
      args
    );
  });

  PluginManager.registerCommand(PLUGIN_NAME, "SetWindowInputEnabled", args => {
    setRuntimeWindowFields(
      String(args.layoutId || DEFAULT_LAYOUT_ID),
      String(args.windowId || ""),
      { inputEnabled: toBool(args.enabled, true) },
      "SetWindowInputEnabled"
    );
  });

  PluginManager.registerCommand(PLUGIN_NAME, "SetWindowScroll", args => {
    setRuntimeWindowFields(
      String(args.layoutId || DEFAULT_LAYOUT_ID),
      String(args.windowId || ""),
      {
        scrollEnabled: toBool(args.enabled, true),
        scrollY: Math.max(0, toNumber(args.scrollY, 0))
      },
      "SetWindowScroll"
    );
  });

  PluginManager.registerCommand(PLUGIN_NAME, "SetWindowBackgroundImage", args => {
    setRuntimeWindowImageLayer(
      String(args.layoutId || DEFAULT_LAYOUT_ID),
      String(args.windowId || ""),
      "backgroundImage",
      args,
      "SetWindowBackgroundImage"
    );
  });

  PluginManager.registerCommand(PLUGIN_NAME, "SetWindowDecorationImage", args => {
    setRuntimeWindowImageLayer(
      String(args.layoutId || DEFAULT_LAYOUT_ID),
      String(args.windowId || ""),
      "decorationImage",
      args,
      "SetWindowDecorationImage"
    );
  });

  PluginManager.registerCommand(PLUGIN_NAME, "SetItemText", args => {
    setRuntimeItemFields(String(args.layoutId || DEFAULT_LAYOUT_ID), String(args.windowId || ""), String(args.itemId || ""), {
      text: String(args.text ?? "")
    }, "SetItemText");
  });

  PluginManager.registerCommand(PLUGIN_NAME, "AddItemLogText", args => {
    appendRuntimeItemLogText(String(args.layoutId || DEFAULT_LAYOUT_ID), String(args.windowId || ""), String(args.itemId || ""), String(args.text ?? ""));
  });

  PluginManager.registerCommand(PLUGIN_NAME, "ClearItemLog", args => {
    clearRuntimeItemLog(String(args.layoutId || DEFAULT_LAYOUT_ID), String(args.windowId || ""), String(args.itemId || ""));
  });

  PluginManager.registerCommand(PLUGIN_NAME, "SetItemImage", args => {
    const layoutId = String(args.layoutId || DEFAULT_LAYOUT_ID);
    const found = findWindowInLayout(layoutId, String(args.windowId || ""));
    if (!found) return console.warn("[DB_UIComposer] SetItemImage target window not found", { layoutId, windowId: args.windowId, itemId: args.itemId });
    const asset = resolveAssetImage(found.layout, args.assetKey);
    const folder = String(asset?.folder || args.folder || "pictures").trim();
    const fileName = String(asset?.fileName || args.fileName || "").trim().replace(/\.(png|jpg|jpeg|webp|gif|bmp)$/i, "");
    if (!fileName) return console.warn("[DB_UIComposer] SetItemImage fileName is empty", { layoutId, windowId: args.windowId, itemId: args.itemId, assetKey: args.assetKey });
    setRuntimeItemFields(layoutId, String(args.windowId || ""), String(args.itemId || ""), { folder, fileName }, "SetItemImage");
  });

  PluginManager.registerCommand(PLUGIN_NAME, "SetItemVisible", args => {
    setRuntimeItemFields(String(args.layoutId || DEFAULT_LAYOUT_ID), String(args.windowId || ""), String(args.itemId || ""), {
      visible: toBool(args.visible, true)
    }, "SetItemVisible");
  });

  PluginManager.registerCommand(PLUGIN_NAME, "SetItemOpacity", args => {
    setRuntimeItemFields(String(args.layoutId || DEFAULT_LAYOUT_ID), String(args.windowId || ""), String(args.itemId || ""), {
      opacity: clamp(toNumber(args.opacity, 255), 0, 255)
    }, "SetItemOpacity");
  });

  PluginManager.registerCommand(PLUGIN_NAME, "SetItemZOrder", args => {
    setRuntimeItemFields(String(args.layoutId || DEFAULT_LAYOUT_ID), String(args.windowId || ""), String(args.itemId || ""), {
      zOrder: toNumber(args.zOrder, 0)
    }, "SetItemZOrder");
  });

  PluginManager.registerCommand(PLUGIN_NAME, "SetItemScale", args => {
    const sx = Math.max(0.01, toNumber(args.scaleXPercent, 100));
    const sy = Math.max(0.01, toNumber(args.scaleYPercent, 100));
    setRuntimeItemFields(String(args.layoutId || DEFAULT_LAYOUT_ID), String(args.windowId || ""), String(args.itemId || ""), {
      scaleXPercent: sx,
      scaleYPercent: sy,
      scaleX: sx / 100,
      scaleY: sy / 100
    }, "SetItemScale");
  });

  PluginManager.registerCommand(PLUGIN_NAME, "SetItemPosition", args => {
    setRuntimeItemFields(String(args.layoutId || DEFAULT_LAYOUT_ID), String(args.windowId || ""), String(args.itemId || ""), {
      x: toNumber(args.x, 0),
      y: toNumber(args.y, 0)
    }, "SetItemPosition");
  });

  PluginManager.registerCommand(PLUGIN_NAME, "MoveItem", function(args) {
    const result = moveRuntimeItem(
      String(args.layoutId || DEFAULT_LAYOUT_ID),
      String(args.windowId || ""),
      String(args.itemId || ""),
      args || {}
    );
    if (result && result.duration > 0 && toBool(args.wait, false) && this && typeof this.wait === "function") {
      this.wait(result.duration);
    }
  });

  PluginManager.registerCommand(PLUGIN_NAME, "ResetItem", args => {
    const layoutId = String(args.layoutId || DEFAULT_LAYOUT_ID);
    const windowId = String(args.windowId || "");
    const itemId = String(args.itemId || "");
    const winState = runtimeWindowOverride(layoutId, windowId, false);
    if (winState?.items) delete winState.items[itemId];
    cleanupRuntimeState(layoutId);
    log("ResetItem applied", { layoutId, windowId, itemId });
    refreshScene();
  });

  PluginManager.registerCommand(PLUGIN_NAME, "ResetLayoutState", args => {
    ensureSystemStore();
    const layoutId = String(args.layoutId || DEFAULT_LAYOUT_ID);
    if ($gameSystem._dbUiComposerRuntimeStates) delete $gameSystem._dbUiComposerRuntimeStates[layoutId];
    const layout = $gameSystem._dbUiComposerLayouts?.[layoutId];
    for (const win of layout?.windows || []) delete $gameSystem._dbUiComposerWindowVisible[win.id];
    log("ResetLayoutState applied", { layoutId });
    refreshScene();
  });

  PluginManager.registerCommand(PLUGIN_NAME, "CreateWindow", args => {
    const win = findOrCreateWindow(args.layoutId, String(args.windowId || "window1"));
    Object.assign(win, {
      id: String(args.windowId || win.id),
      x: toNumber(args.x, win.x),
      y: toNumber(args.y, win.y),
      width: Math.max(1, toNumber(args.width, win.width)),
      height: Math.max(1, toNumber(args.height, win.height)),
      layer: String(args.layer || win.layer || "mapUi"),
      zOrder: toNumber(args.zOrder, win.zOrder || 0),
      visible: toBool(args.visible, win.visible !== false),
      opacity: clamp(toNumber(args.opacity, win.opacity), 0, 255),
      contentsOpacity: clamp(toNumber(args.contentsOpacity, win.contentsOpacity), 0, 255),
      frameVisible: toBool(args.frameVisible, win.frameVisible),
      backgroundType: String(args.backgroundType || win.backgroundType || "normal"),
      placementArea: {
        extendLeft: Math.max(0, toNumber(args.placementExtendLeft, win.placementArea?.extendLeft || 0)),
        extendTop: Math.max(0, toNumber(args.placementExtendTop, win.placementArea?.extendTop || 0)),
        extendRight: Math.max(0, toNumber(args.placementExtendRight, win.placementArea?.extendRight || 0)),
        extendBottom: Math.max(0, toNumber(args.placementExtendBottom, win.placementArea?.extendBottom || 0))
      },
      backgroundImage: {
        enabled: toBool(args.backgroundImageEnabled, win.backgroundImage?.enabled || false),
        folder: String(args.backgroundImageFolder || win.backgroundImage?.folder || "pictures"),
        fileName: String(args.backgroundImageFileName || win.backgroundImage?.fileName || ""),
        mode: String(args.backgroundImageMode || win.backgroundImage?.mode || "stretch"),
        opacity: clamp(toNumber(args.backgroundImageOpacity, win.backgroundImage?.opacity ?? 255), 0, 255),
        zOrder: toNumber(args.backgroundImageZOrder, win.backgroundImage?.zOrder ?? -100)
      },
      decorationImage: {
        enabled: toBool(args.decorationImageEnabled, win.decorationImage?.enabled || false),
        folder: String(args.decorationImageFolder || win.decorationImage?.folder || "system"),
        fileName: String(args.decorationImageFileName || win.decorationImage?.fileName || ""),
        mode: String(args.decorationImageMode || win.decorationImage?.mode || "stretch"),
        opacity: clamp(toNumber(args.decorationImageOpacity, win.decorationImage?.opacity ?? 255), 0, 255),
        zOrder: toNumber(args.decorationImageZOrder, win.decorationImage?.zOrder ?? 100)
      }
    });
    refreshScene();
  });

  PluginManager.registerCommand(PLUGIN_NAME, "RemoveWindow", args => {
    const windowId = String(args.windowId || "");
    const layouts = allLayouts();
    for (const layoutId of Object.keys(layouts)) {
      const layout = layouts[layoutId];
      layout.windows = (layout.windows || []).filter(w => w.id !== windowId);
      const layoutState = runtimeStateForLayout(layoutId, false);
      if (layoutState?.windows) delete layoutState.windows[windowId];
      cleanupRuntimeState(layoutId);
    }
    refreshScene();
  });

  PluginManager.registerCommand(PLUGIN_NAME, "AddText", args => {
    const found = findWindowData(String(args.windowId || ""));
    if (!found) return console.warn("[DB_UIComposer] AddText target window not found", args.windowId);
    upsertItem(found.win, {
      type: "text",
      id: String(args.itemId || "text1"),
      x: toNumber(args.x, 0),
      y: toNumber(args.y, 0),
      zOrder: toNumber(args.zOrder, 0),
      visible: toBool(args.visible, true),
      allowOutsideWindow: toBool(args.allowOutsideWindow, false),
      width: toNumber(args.width, 0),
      text: String(args.text || ""),
      fontSize: toNumber(args.fontSize, 22),
      lineHeight: toNumber(args.lineHeight, 0),
      fontFamily: String(args.fontFamily || ""),
      color: String(args.color || ""),
      outlineColor: String(args.outlineColor || ""),
      outlineWidth: Math.max(0, toNumber(args.outlineWidth, 0)),
      bold: toBool(args.bold, false),
      italic: toBool(args.italic, false),
      align: String(args.align || "left")
    });
    refreshScene();
  });

  PluginManager.registerCommand(PLUGIN_NAME, "AddImage", args => {
    const found = findWindowData(String(args.windowId || ""));
    if (!found) return console.warn("[DB_UIComposer] AddImage target window not found", args.windowId);
    upsertItem(found.win, {
      type: "image",
      id: String(args.itemId || "image1"),
      x: toNumber(args.x, 0),
      y: toNumber(args.y, 0),
      zOrder: toNumber(args.zOrder, 0),
      visible: toBool(args.visible, true),
      allowOutsideWindow: toBool(args.allowOutsideWindow, false),
      folder: String(args.folder || "pictures"),
      fileName: String(args.fileName || ""),
      scaleX: toNumber(args.scaleX, 100),
      scaleY: toNumber(args.scaleY, 100),
      scaleXPercent: toNumber(args.scaleX, 100) > 10 ? toNumber(args.scaleX, 100) : toNumber(args.scaleX, 100) * 100,
      scaleYPercent: toNumber(args.scaleY, 100) > 10 ? toNumber(args.scaleY, 100) : toNumber(args.scaleY, 100) * 100,
      opacity: clamp(toNumber(args.opacity, 255), 0, 255)
    });
    refreshScene();
  });

  PluginManager.registerCommand(PLUGIN_NAME, "AddGauge", args => {
    const found = findWindowData(String(args.windowId || ""));
    if (!found) return console.warn("[DB_UIComposer] AddGauge target window not found", args.windowId);
    upsertItem(found.win, {
      type: "gauge",
      id: String(args.itemId || "gauge1"),
      x: toNumber(args.x, 0),
      y: toNumber(args.y, 0),
      zOrder: toNumber(args.zOrder, 0),
      visible: toBool(args.visible, true),
      allowOutsideWindow: toBool(args.allowOutsideWindow, false),
      width: Math.max(1, toNumber(args.width, 220)),
      height: Math.max(1, toNumber(args.height, 14)),
      gaugeShape: String(args.gaugeShape || "horizontal"),
      gaugeDirection: String(args.gaugeDirection || "leftToRight"),
      valueType: String(args.valueType || "variable"),
      valueVariableId: toNumber(args.valueVariableId, 0),
      maxVariableId: toNumber(args.maxVariableId, 0),
      actorId: toNumber(args.actorId, 1),
      value: toNumber(args.value, 0),
      max: Math.max(1, toNumber(args.max, 100)),
      label: String(args.label || ""),
      color1: String(args.color1 || "#ff6060"),
      color2: String(args.color2 || "#ffa0a0")
    });
    refreshScene();
  });

  PluginManager.registerCommand(PLUGIN_NAME, "AddButton", args => {
    const found = findWindowData(String(args.windowId || ""));
    if (!found) return console.warn("[DB_UIComposer] AddButton target window not found", args.windowId);
    upsertItem(found.win, {
      type: "button",
      id: String(args.itemId || "button1"),
      x: toNumber(args.x, 0),
      y: toNumber(args.y, 0),
      zOrder: toNumber(args.zOrder, 0),
      visible: toBool(args.visible, true),
      allowOutsideWindow: toBool(args.allowOutsideWindow, false),
      width: Math.max(1, toNumber(args.width, 120)),
      height: Math.max(1, toNumber(args.height, 36)),
      text: String(args.text || ""),
      commonEventId: toNumber(args.commonEventId, 0),
      switchId: toNumber(args.switchId, 0),
      variableId: toNumber(args.variableId, 0),
      variableValue: toNumber(args.variableValue, 0),
      script: String(args.script || "")
    });
    refreshScene();
  });

  PluginManager.registerCommand(PLUGIN_NAME, "SetChoiceList", args => {
    const layoutId = String(args.layoutId || DEFAULT_LAYOUT_ID);
    const windowId = String(args.windowId || "window1");
    const win = findOrCreateWindow(layoutId, windowId);
    const itemId = String(args.itemId || "choiceList1");
    const existingItems = Array.isArray(win.items) ? win.items : [];
    const oldItem = existingItems.find(item => item.id === itemId) || {};
    if (oldItem.type === "choiceList" && String(oldItem.choiceMode || "command") === "tool") {
      console.warn("[DB_UIComposer] SetChoiceList はシンプル選択肢の内部内容を変更しません。カスタマイズ選択肢を指定してください。", { layoutId, windowId, itemId });
      return;
    }
    const templateItem = oldItem.type === "choiceList"
      ? oldItem
      : (existingItems.find(item => item && item.type === "choiceList") || oldItem);
    const structuredRules = parseChoiceRuleListArgument(args.choiceRules);
    const commandRules = structuredRules || null;
    const templateRows = choiceListRows(templateItem);
    const legacyChoices = String(args.choices || "")
      .split(/\r?\n/)
      .map(line => String(line ?? ""))
      .filter(line => line.length > 0);
    const choices = commandRules
      ? commandRules.map((rule, index) => String(rule?.text ?? rule?.choice ?? rule?.label ?? templateRows[index] ?? ""))
      : (legacyChoices.length > 0 ? legacyChoices : templateRows);
    const commandOrTemplate = (value, templateValue, fallback, min = 1) => {
      const n = toNumber(value, 0);
      // 1以上ならプラグインコマンド値で上書き、0ならツール側テンプレート設定を使用します。
      if (n > 0) return Math.max(min, n);
      return Math.max(min, toNumber(templateValue, fallback));
    };
    const nextItem = Object.assign({}, templateItem, oldItem, {
      type: "choiceList",
      choiceMode: "command",
      id: itemId,
      // X/Y座標はツール側テンプレートで管理します。プラグインコマンドでは上書きしません。
      x: toNumber(templateItem.x, toNumber(oldItem.x, 16)),
      y: toNumber(templateItem.y, toNumber(oldItem.y, 16)),
      zOrder: toNumber(templateItem.zOrder, toNumber(oldItem.zOrder, 0)),
      visible: true,
      allowOutsideWindow: toBool(templateItem.allowOutsideWindow, toBool(oldItem.allowOutsideWindow, false)),
      width: commandOrTemplate(args.width, templateItem.width, 240),
      rowHeight: commandOrTemplate(args.rowHeight, templateItem.rowHeight, 32),
      maxVisibleRows: commandOrTemplate(args.maxVisibleRows, templateItem.maxVisibleRows, 6),
      autoResizeWindow: toBool(args.autoResizeWindow, templateItem.autoResizeWindow !== false),
      closeWindowOnSelect: toBool(args.closeWindowOnSelect, toBool(templateItem.closeWindowOnSelect, false)),
      choices,
      choiceRules: (() => {
        const baseRules = commandRules || (Array.isArray(templateItem.choiceRules) ? templateItem.choiceRules : []);
        return choices.map((text, index) => {
          const rule = Object.assign({}, baseRules[index] || {});
          rule.text = String(rule.text ?? rule.choice ?? rule.label ?? text ?? "");
          return rule;
        });
      })(),
      choiceEnabled: (() => {
        const base = Array.isArray(templateItem.choiceEnabled) ? templateItem.choiceEnabled.map(v => toBool(v, true)) : [];
        return choices.map((_, index) => base[index] !== undefined ? base[index] : true);
      })(),
      disabledIndexes: String(templateItem.disabledIndexes || ""),
      normalBackColor: templateItem.normalBackColor || oldItem.normalBackColor || "rgba(255,255,255,0.10)",
      hoverBackColor: templateItem.hoverBackColor || oldItem.hoverBackColor || "rgba(255,255,255,0.22)",
      selectedBackColor: templateItem.selectedBackColor || oldItem.selectedBackColor || "rgba(98,169,255,0.35)",
      disabledBackColor: templateItem.disabledBackColor || oldItem.disabledBackColor || "rgba(0,0,0,0.28)",
      disabledTextColor: templateItem.disabledTextColor || oldItem.disabledTextColor || "rgba(180,180,180,0.85)",
      borderColor: templateItem.borderColor || oldItem.borderColor || "rgba(255,255,255,0.35)",
      textColor: templateItem.textColor || templateItem.color || oldItem.textColor || oldItem.color || "",
      fontSize: Math.max(1, toNumber(templateItem.fontSize, toNumber(oldItem.fontSize, 18))),
      align: templateItem.align || oldItem.align || "center",
      resultVariableId: toNumber(args.resultVariableId, toNumber(oldItem.resultVariableId, 0)),
      resultTextVariableId: toNumber(args.resultTextVariableId, toNumber(oldItem.resultTextVariableId, 0)),
      commonEventId: toNumber(args.commonEventId, toNumber(oldItem.commonEventId, 0)),
      script: String(args.script || oldItem.script || "")
    });
    upsertItem(win, nextItem);
    log("SetChoiceList applied", {
      layoutId, windowId, itemId,
      choices: choices.length,
      width: nextItem.width,
      rowHeight: nextItem.rowHeight,
      maxVisibleRows: nextItem.maxVisibleRows,
      closeWindowOnSelect: nextItem.closeWindowOnSelect,
      choiceEnabled: nextItem.choiceEnabled,
      choiceRules: nextItem.choiceRules,
      x: nextItem.x,
      y: nextItem.y,
      templateItemId: templateItem.id || "",
      oldItemId: oldItem.id || ""
    });
    refreshScene();
  });

  PluginManager.registerCommand(PLUGIN_NAME, "RemoveItem", args => {
    const found = findWindowData(String(args.windowId || ""));
    if (!found) return console.warn("[DB_UIComposer] RemoveItem target window not found", args.windowId);
    const itemId = String(args.itemId || "");
    found.win.items = (found.win.items || []).filter(item => item.id !== itemId);
    const winState = runtimeWindowOverride(found.layout.layoutId, found.win.id, false);
    if (winState?.items) delete winState.items[itemId];
    cleanupRuntimeState(found.layout.layoutId);
    refreshScene();
  });

  PluginManager.registerCommand(PLUGIN_NAME, "ClearWindowItems", args => {
    const found = findWindowData(String(args.windowId || ""));
    if (!found) return console.warn("[DB_UIComposer] ClearWindowItems target window not found", args.windowId);
    found.win.items = [];
    const winState = runtimeWindowOverride(found.layout.layoutId, found.win.id, false);
    if (winState) winState.items = {};
    cleanupRuntimeState(found.layout.layoutId);
    refreshScene();
  });

  window.DB_UIComposer = {
    version: "0.4.63",
    applyLayout,
    refreshScene,
    normalizeLayout,
    dumpDebugInfo,
    resetLayoutState(layoutId) {
      ensureSystemStore();
      const id = String(layoutId || DEFAULT_LAYOUT_ID);
      delete $gameSystem._dbUiComposerRuntimeStates[id];
      refreshScene();
    },
    setDebugLog(enabled) {
      ensureSystemStore();
      $gameSystem._dbUiComposerDebugLog = !!enabled;
    }
  };
})();
