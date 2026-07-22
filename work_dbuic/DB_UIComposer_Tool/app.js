(() => {
  "use strict";

  const $ = id => document.getElementById(id);
  const preview = $("preview");
  const objectList = $("objectList");
  const props = $("properties");
  const toast = $("toast");

  let state = createDefaultState();
  let mode = "screen";
  let globalWindowPositionLocked = false;
  let globalPartPositionLocked = false;
  let selected = null;
  let drag = null;
  let doubleClickCycle = null;
  let objectListClickCycle = null;
  let objectListDragPayload = null;
  // クリックのたびに描画DOMを再生成するため、ブラウザ標準の dblclick は
  // 対象要素が変わって発火しないことがあります。ここでは pointerdown を使って
  // 独自にダブルクリックを判定します。
  let lastPreviewPrimaryDown = null;
  let projectAssets = createProjectAssets();

  // v0.2.92: ゲーム中UI変更命令の編集用ドラフト。
  // レイアウト本体とは分離し、ここで操作しても配置データを直接変更しません。
  let runtimeCommandTargetKey = "";
  let runtimeCommandDraft = null;

  // v0.2.94: 左一覧の折りたたみ状態。配置データには影響しない、ツール表示専用です。
  const objectListCollapsedGroups = new Set();
  const objectListCollapsedWindows = new Set();
  const UNGROUPED_COLLAPSE_KEY = "__ungrouped__";

  // v0.2.92: レイアウト編集の操作履歴。
  // stateだけでなく、復元後にどのオブジェクトを選ぶか・どの配置モードへ戻すかも保持する。
  const HISTORY_LIMIT = 100;
  const undoHistory = [];
  const redoHistory = [];
  let historyRestoring = false;
  const debugLogs = [];
  const debugOnceKeys = new Set();
  let debugConsoleVisible = false;
  const TOOL_VERSION = "0.4.62";
  const TOOL_DATA_TYPE = "DB_UIComposer_ToolData";
  const IDB_NAME = "DB_UIComposer_ToolDB";
  const IDB_STORE = "kv";
  const PROJECT_HANDLE_KEY = "projectDirectoryHandle";
  const SAMPLE_SCENE_CUSTOM_KEY = "DB_UIComposer.sampleSceneCustom.v1";
  const CATALOG_HANDLE_KEY = "commandCatalogFileHandle";
  const CATALOG_SAVE_MODE_KEY = "DB_UIComposer.catalogSaveMode";
  const CATALOG_SAVE_MODE_PROJECT = "projectRelative";
  const CATALOG_SAVE_MODE_FILE = "fileHandle";
  // カタログJSの保存先。初回保存後は Ctrl+S / 保存ボタンで自動更新します。
  // projectRelative の場合は、現在読み込んでいるツクールプロジェクトの js/plugins/ に相対保存します。
  let currentCatalogPluginFileHandle = null;
  let currentCatalogPluginFileName = "DB_UIComposer_CommandCatalog.js";
  let catalogSaveMode = localStorage.getItem(CATALOG_SAVE_MODE_KEY) || "";
  // 現在編集中のツールデータ保存先。File System Access API が使える環境では
  // ファイルハンドルを保持し、Ctrl+S で同じファイルへ上書き保存します。
  let currentToolDataFileHandle = null;
  let currentToolDataFileName = "";
  let previewSettingsApplyTimer = 0;
  const PSD_IMPORT_CACHE_FILE_NAME = "_psd_import_cache.json";
  const PSD_IMPORT_ROOT_FOLDER = "psd_import";
  const COMPOSITE_EXPORT_ROOT_FOLDER = "composite_export";
  const toolVersionLabel = $("toolVersionLabel");
  if (toolVersionLabel) toolVersionLabel.textContent = `v${TOOL_VERSION}`;
  document.title = `DB_UIComposer Tool v${TOOL_VERSION}`;

  // プレビュー上でオブジェクトを選択した時、左の一覧でも同じ行が
  // 確実に見える位置までスクロールするための予約フラグです。
  // render() が一覧DOMを作り直した後にだけ実行します。
  let pendingObjectListReveal = false;
  let objectClipboard = null;
  let previewInlineEditClickCycle = null;
  let previewInlineTextEditorState = null;
  let pendingPreviewClick = null;

  function isObjectListControlTarget(target) {
    return !!target?.closest?.("button,input,select,textarea,.object-row-control-strip,.object-row-actions,.object-row-mini-button");
  }

  function consumeObjectListDoubleClick(ev, key) {
    if (!ev || !key || isObjectListControlTarget(ev.target)) {
      objectListClickCycle = null;
      return false;
    }
    const now = performance.now();
    const prev = objectListClickCycle;
    const isSecond = !!prev
      && prev.key === key
      && now - prev.time <= 550
      && Math.abs((prev.x || 0) - (ev.clientX || 0)) <= 8
      && Math.abs((prev.y || 0) - (ev.clientY || 0)) <= 8;
    objectListClickCycle = isSecond ? null : {
      key,
      time: now,
      x: ev.clientX || 0,
      y: ev.clientY || 0
    };
    return isSecond;
  }

  function beginObjectListRenameFromEvent(ev) {
    const label = ev?.target?.closest?.(".object-row-label");
    if (label && typeof label._dbStartRename === "function") {
      label._dbStartRename(ev);
      return true;
    }
    return false;
  }

  function safeSetPointerCapture(el, pointerId) {
    if (!el || typeof el.setPointerCapture !== "function") return false;
    if (pointerId === undefined || pointerId === null || pointerId < 0) return false;
    try {
      el.setPointerCapture(pointerId);
      return true;
    } catch (error) {
      // Electron/Chromiumでは、イベント発生元や再描画タイミングによって
      // setPointerCapture が InvalidStateError になることがある。
      // ドラッグ自体は window 側 pointermove で追跡しているため、ここでは赤エラーにしない。
      return false;
    }
  }

  function createDefaultState() {
    return {
      layoutId: "TestMapUI",
      screenWidth: 816,
      screenHeight: 624,
      settings: createDefaultSettings(),
      groups: [],
      scenes: [],
      activeSceneId: "",
      sceneSampleLinks: {},
      compositePresetLibraries: [],
      componentTemplates: [],
      windows: [
        {
          id: "statusWindow",
          groupId: "",
          x: 20,
          y: 20,
          width: 300,
          height: 128,
          opacity: 220,
          contentsOpacity: 255,
          layer: "mapUi",
          zOrder: 0,
          visible: true,
          frameVisible: true,
          backgroundType: "normal",
          scrollEnabled: false,
          scrollbarVisible: true,
          scrollY: 0,
          scrollContentHeight: 0,
          scrollbarWidth: 8,
          scrollbarOpacity: 220,
          placementArea: createDefaultPlacementArea(),
          backgroundImage: createDefaultWindowBackgroundImage(),
          decorationImage: createDefaultWindowDecorationImage(),
          items: [
            { type: "text", id: "titleText", x: 16, y: 8, width: 240, text: "ステータス", fontSize: 22, color: "", align: "left", zOrder: 0, visible: true },
            { type: "text", id: "nameText", x: 16, y: 40, width: 240, text: "主人公", fontSize: 20, color: "", align: "left", zOrder: 0, visible: true },
            { type: "gauge", id: "hpGauge", x: 16, y: 72, width: 220, height: 14, valueType: "fixed", value: 75, max: 100, label: "HP", color1: "#ff6060", color2: "#ffa0a0", zOrder: 0, visible: true }
          ]
        }
      ]
    };
  }

  function createDefaultSettings() {
    return {
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      fontFileName: '',
      defaultFontSize: 26,
      lineHeight: 36,
      padding: 12,
      textYOffset: 0,
      textColor: '',
      outlineColor: '',
      outlineWidth: 4,
      windowSkinName: 'Window',
      useWindowSkinPreview: true,
      previewVariables: '1=0\n2=100',
      previewActorHp: 75,
      previewActorMhp: 100,
      previewActorMp: 30,
      previewActorMmp: 50,
      previewActorTp: 0,
      previewFocusDim: true,
      dragStartThreshold: 5,
      previewZoomPercent: 100
    };
  }

  function createDefaultWindowBackgroundImage() {
    return {
      enabled: false,
      folder: "pictures",
      fileName: "",
      opacity: 255,
      mode: "stretch",
      zOrder: -100,
      previewName: "",
      previewSrc: "",
      previewNaturalWidth: 0,
      previewNaturalHeight: 0
    };
  }

  function createDefaultWindowDecorationImage() {
    return {
      enabled: false,
      folder: "system",
      fileName: "",
      opacity: 255,
      mode: "stretch",
      zOrder: 100,
      previewName: "",
      previewSrc: "",
      previewNaturalWidth: 0,
      previewNaturalHeight: 0
    };
  }

  function createDefaultGaugeImageLayer(kind = "back") {
    return {
      enabled: false,
      folder: "pictures",
      fileName: "",
      opacity: 255,
      mode: "stretch",
      previewName: "",
      previewSrc: "",
      previewNaturalWidth: 0,
      previewNaturalHeight: 0,
      kind
    };
  }

  function createDefaultDatabaseBinding() {
    return {
      enabled: false,
      sourceType: "actor",
      objectType: "item",
      idMode: "fixed",
      id: 1,
      idVariableId: 1,
      fieldPath: "name",
      typeCategory: "weaponTypes",
      termCategory: "messages",
      termKey: "currencyUnit",
      updateTiming: "autoFrame",
      textPrefix: "",
      textSuffix: "",
      emptyText: "",
      decimals: -1,
      maxSourceType: "",
      maxObjectType: "item",
      maxIdMode: "fixed",
      maxId: 1,
      maxIdVariableId: 1,
      maxFieldPath: "",
      maxTypeCategory: "weaponTypes",
      maxTermCategory: "messages",
      maxTermKey: "",
      maxFallback: 100
    };
  }

  function databaseBindingPropKey(prefix, baseKey) {
    const key = String(baseKey || "");
    const p = String(prefix || "");
    if (!p) return key;
    return `${p}${key.charAt(0).toUpperCase()}${key.slice(1)}`;
  }

  function ensureDatabaseBinding(item) {
    if (!item || typeof item !== "object") return createDefaultDatabaseBinding();
    // Keep the same object identity. Replacing databaseBinding on every ensure()
    // breaks property-panel closures that skipProperties re-renders intentionally keep alive
    // (e.g. textPrefix/textSuffix inputs stop updating the live binding after the first commit).
    if (!item.databaseBinding || typeof item.databaseBinding !== "object") {
      item.databaseBinding = createDefaultDatabaseBinding();
    } else {
      const defaults = createDefaultDatabaseBinding();
      for (const key of Object.keys(defaults)) {
        if (item.databaseBinding[key] === undefined) item.databaseBinding[key] = defaults[key];
      }
    }
    const db = item.databaseBinding;
    db.enabled = db.enabled === true;
    if (!["fixed", "variable"].includes(String(db.idMode || ""))) db.idMode = "fixed";
    if (!["fixed", "variable"].includes(String(db.maxIdMode || ""))) db.maxIdMode = "fixed";
    if (!["autoFrame", "pluginCommand", "windowOpen"].includes(String(db.updateTiming || ""))) db.updateTiming = "autoFrame";
    db.id = Math.max(0, Number.isFinite(Number(db.id)) ? Number(db.id) : 1);
    db.idVariableId = Math.max(0, Number.isFinite(Number(db.idVariableId)) ? Number(db.idVariableId) : 1);
    db.maxId = Math.max(0, Number.isFinite(Number(db.maxId)) ? Number(db.maxId) : 1);
    db.maxIdVariableId = Math.max(0, Number.isFinite(Number(db.maxIdVariableId)) ? Number(db.maxIdVariableId) : 1);
    db.decimals = Number.isFinite(Number(db.decimals)) ? Number(db.decimals) : -1;
    db.maxFallback = Math.max(1, Number(db.maxFallback || 100));
    return db;
  }

  function ensureGaugeImageLayer(item, key, kind) {
    if (!item[key] || typeof item[key] !== "object") item[key] = createDefaultGaugeImageLayer(kind);
    const layer = item[key];
    layer.enabled = !!layer.enabled;
    layer.folder = normalizeImageFolder(layer.folder || "pictures") || "pictures";
    layer.fileName = stripImageExtension(layer.fileName || "");
    layer.opacity = clamp(Number(layer.opacity ?? 255), 0, 255);
    layer.mode = String(layer.mode || "stretch");
    layer.previewName = String(layer.previewName || "");
    layer.previewSrc = String(layer.previewSrc || "");
    layer.previewNaturalWidth = Math.max(0, Number(layer.previewNaturalWidth || 0));
    layer.previewNaturalHeight = Math.max(0, Number(layer.previewNaturalHeight || 0));
    layer.kind = kind;
    return layer;
  }

  function createDefaultButtonState() {
    return {
      enabled: false,
      backColor: "",
      borderColor: "",
      textColor: "",
      opacity: 255,
      scaleXPercent: 100,
      scaleYPercent: 100,
      offsetX: 0,
      offsetY: 0,
      actionEnabled: false,
      commonEventId: 0,
      switchId: 0,
      variableId: 0,
      variableValue: 0,
      script: ""
    };
  }

  function createButtonImageDef() {
    return { folder: "pictures", fileName: "", previewSrc: "", previewName: "", previewNaturalWidth: 0, previewNaturalHeight: 0, opacity: 255, mode: "stretch", psdKey: "", psdLabel: "", presetId: "", presetLabel: "" };
  }

  function ensureButtonImages(item) {
    if (!item.buttonImages || typeof item.buttonImages !== "object") item.buttonImages = {};
    for (const key of ["mouseOff", "mouseOn", "press", "release"]) {
      item.buttonImages[key] = Object.assign(createButtonImageDef(), item.buttonImages[key] || {});
      item.buttonImages[key].folder = normalizeImageFolder(item.buttonImages[key].folder || "pictures") || "pictures";
      item.buttonImages[key].fileName = stripImageExtension(item.buttonImages[key].fileName || "");
      item.buttonImages[key].opacity = clamp(Number(item.buttonImages[key].opacity ?? 255), 0, 255);
    }
    return item.buttonImages;
  }

  function buttonImageForState(item, key) {
    const images = ensureButtonImages(item || {});
    const preferred = images[key] || images.mouseOff || createButtonImageDef();
    if (preferred.fileName || preferred.previewSrc) return preferred;
    return images.mouseOff || preferred;
  }

  function buttonVisualModeLabel(mode) {
    switch (String(mode || "normal")) {
      case "image": return "画像ボタン";
      case "psd": return "PSDボタン";
      default: return "通常ボタン";
    }
  }

  function ensureButtonStates(item) {
    if (!item.buttonStates || typeof item.buttonStates !== "object") item.buttonStates = {};
    for (const key of ["mouseOff", "mouseOn", "press", "release"]) {
      item.buttonStates[key] = Object.assign(createDefaultButtonState(), item.buttonStates[key] || {});
    }
    return item.buttonStates;
  }

  function buttonStateLabel(key) {
    return {
      mouseOff: "マウスOFF",
      mouseOn: "マウスON",
      press: "クリック押下",
      release: "クリック離す"
    }[key] || key;
  }

  function buttonStateOptions() {
    return ["mouseOff", "mouseOn", "press", "release"];
  }

  function choiceConditionOptions() {
    return [
      { value: "always", label: "常に成立" },
      { value: "switchOn", label: "スイッチON" },
      { value: "switchOff", label: "スイッチOFF" },
      { value: "variableGte", label: "変数が指定値以上" },
      { value: "variableLte", label: "変数が指定値以下" },
      { value: "variableEq", label: "変数が指定値と同じ" },
      { value: "script", label: "スクリプト条件" }
    ];
  }

  function choiceStateOptions() {
    return [
      { value: "enabled", label: "表示して選択可能" },
      { value: "disabled", label: "表示するが選択不可" },
      { value: "hidden", label: "非表示" }
    ];
  }

  function interactionAnimationOptions() {
    return [
      { value: "none", label: "なし" },
      { value: "scaleUp", label: "少し拡大" },
      { value: "scaleDown", label: "少し縮小" },
      { value: "fade", label: "薄くする" },
      { value: "lift", label: "少し上へ" }
    ];
  }

  function choiceModeLabel(mode) {
    return String(mode || "command") === "tool" ? "シンプル選択肢" : "カスタマイズ選択肢";
  }

  function itemTypeLabel(item) {
    const type = String(item?.type || "");
    if (type === "choiceList") return choiceModeLabel(item?.choiceMode);
    if (type === "imageChoiceList") return "画像選択肢";
    return {
      text: "通常テキスト",
      log: "ログ",
      gauge: "ゲージ",
      button: buttonVisualModeLabel(item?.buttonVisualMode),
      image: "通常画像",
      compositeImage: "複合画像"
    }[type] || type || "不明なパーツ";
  }

  function createDefaultLogItem() {
    return {
      width: 320,
      height: 120,
      sampleText: "ログを追加しました。",
      lines: [],
      maxLines: 8,
      fontSize: 20,
      lineHeight: 28,
      color: "",
      outlineColor: "",
      outlineWidth: 0,
      paddingX: 4,
      paddingY: 4,
      displayFrames: 180,
      fadeFrames: 30,
      moveFrames: 20,
      scrollToBottom: true
    };
  }

  function createDefaultChoiceListItem(choiceMode = "tool") {
    return {
      choiceMode,
      width: 240,
      rowHeight: 32,
      maxVisibleRows: 6,
      choices: choiceMode === "command" ? ["選択肢1", "選択肢2", "選択肢3"] : ["探索", "休憩", "戻る"],
      choiceRules: [
        { text: choiceMode === "command" ? "選択肢1" : "探索", conditionType: "always", trueState: "enabled", falseState: "hidden", switchId: 0, variableId: 0, compareValue: 0, script: "" },
        { text: choiceMode === "command" ? "選択肢2" : "休憩", conditionType: "always", trueState: "enabled", falseState: "hidden", switchId: 0, variableId: 0, compareValue: 0, script: "" },
        { text: choiceMode === "command" ? "選択肢3" : "戻る", conditionType: "always", trueState: "enabled", falseState: "hidden", switchId: 0, variableId: 0, compareValue: 0, script: "" }
      ],
      autoResizeWindow: true,
      normalBackColor: "rgba(255,255,255,.10)",
      hoverBackColor: "rgba(255,255,255,.22)",
      selectedBackColor: "rgba(98,169,255,.35)",
      disabledBackColor: "rgba(0,0,0,.28)",
      disabledTextColor: "rgba(180,180,180,.85)",
      borderColor: "rgba(255,255,255,.35)",
      textColor: "",
      fontSize: 18,
      align: "center",
      closeWindowOnSelect: false,
      choiceEnabled: [true, true, true],
      disabledIndexes: "",
      resultVariableId: 0,
      commonEventId: 0,
      script: ""
    };
  }

  function createImageChoiceImage() {
    return { folder: "pictures", fileName: "", previewSrc: "", previewName: "", opacity: 255, mode: "stretch" };
  }

  function createDefaultImageChoiceOption(index = 0) {
    const n = index + 1;
    return {
      id: `choice${n}`,
      text: `選択肢${n}`,
      x: 0,
      y: index * 52,
      width: 160,
      height: 44,
      enabledImage: createImageChoiceImage(),
      disabledImage: createImageChoiceImage(),
      hoverImage: createImageChoiceImage(),
      pressImage: createImageChoiceImage(),
      conditionType: "always",
      switchId: 0,
      variableId: 0,
      compareValue: 0,
      script: "",
      trueState: "enabled",
      falseState: "disabled",
      previewCondition: true,
      hoverScalePercent: 105,
      hoverOpacity: 255,
      pressScalePercent: 96,
      pressOpacity: 230,
      resultVariableId: 0,
      commonEventId: 0,
      scriptOnSelect: ""
    };
  }

  function createDefaultImageChoiceListItem() {
    return {
      width: 180,
      height: 110,
      selectedOptionIndex: 0,
      closeWindowOnSelect: false,
      options: [createDefaultImageChoiceOption(0), createDefaultImageChoiceOption(1)]
    };
  }

  function createDefaultCompositeImageLayer(index = 0) {
    const n = index + 1;
    return {
      id: `layer${n}`,
      name: `レイヤー${n}`,
      layerKind: "compositeImageLayer",
      visible: true,
      folder: "pictures",
      fileName: "",
      previewSrc: "",
      previewName: "",
      previewNaturalWidth: 0,
      previewNaturalHeight: 0,
      x: 0,
      y: 0,
      width: 96,
      height: 64,
      opacity: 255,
      priority: n,
      blendMode: "normal"
    };
  }

  function createDefaultCompositeImageItem() {
    return {
      width: 96,
      height: 64,
      scaleX: 1,
      scaleY: 1,
      scaleXPercent: 100,
      scaleYPercent: 100,
      opacity: 255,
      exportBaseName: "",
      exportPresetName: "",
      selectedLayerIndex: 0,
      selectedPresetId: "",
      compositePresets: [],
      layers: [createDefaultCompositeImageLayer(0)]
    };
  }

  function ensureCompositeImageLayers(item) {
    if (!Array.isArray(item.layers) || item.layers.length <= 0) item.layers = [createDefaultCompositeImageLayer(0)];
    const rawLayers = Array.isArray(item.layers) ? item.layers.slice() : [];
    const selectedIdBefore = rawLayers[clamp(item.selectedLayerIndex ?? 0, 0, Math.max(0, rawLayers.length - 1))]?.id || "";
    item.layers = rawLayers.map((layer, index) => {
      const merged = Object.assign(createDefaultCompositeImageLayer(index), layer || {});
      merged.id = safeId(merged.id || `layer${index + 1}`, `layer${index + 1}`);
      merged.name = String(merged.name || merged.id || `レイヤー${index + 1}`);
      merged.layerKind = "compositeImageLayer";
      merged.visible = merged.visible !== false;
      merged.folder = normalizeImageFolder(merged.folder || "pictures") || "pictures";
      merged.fileName = stripImageExtension(merged.fileName || "");
      merged.previewSrc = String(merged.previewSrc || "");
      merged.previewName = String(merged.previewName || "");
      merged.previewNaturalWidth = Math.max(0, Number(merged.previewNaturalWidth || 0));
      merged.previewNaturalHeight = Math.max(0, Number(merged.previewNaturalHeight || 0));
      merged.x = Number(merged.x || 0);
      merged.y = Number(merged.y || 0);
      merged.width = Math.max(1, Number(merged.width || merged.previewNaturalWidth || 96));
      merged.height = Math.max(1, Number(merged.height || merged.previewNaturalHeight || 64));
      if (item.psdImport && Number(merged.opacity) > 0 && Number(merged.opacity) <= 1) {
        merged.opacity = normalizePsdOpacity(merged.opacity);
      } else {
        merged.opacity = clamp(Number(merged.opacity ?? 255), 0, 255);
      }
      merged.priority = Number.isFinite(Number(merged.priority)) ? Number(merged.priority) : (index + 1);
      merged.blendMode = ["normal", "add", "multiply", "screen"].includes(String(merged.blendMode || "normal")) ? String(merged.blendMode || "normal") : "normal";
      merged.__sourceIndex = index;
      return merged;
    });
    item.layers.sort((a, b) => {
      const pa = Number.isFinite(Number(a.priority)) ? Number(a.priority) : 999999;
      const pb = Number.isFinite(Number(b.priority)) ? Number(b.priority) : 999999;
      if (pa !== pb) return pa - pb;
      return Number(a.__sourceIndex || 0) - Number(b.__sourceIndex || 0);
    });
    item.layers.forEach((layer, index) => {
      layer.priority = index + 1;
      delete layer.__sourceIndex;
    });
    const selectedIndex = item.layers.findIndex(layer => String(layer.id || "") === String(selectedIdBefore || ""));
    item.selectedLayerIndex = selectedIndex >= 0 ? selectedIndex : clamp(item.selectedLayerIndex ?? 0, 0, item.layers.length - 1);
    if (item.scaleXPercent === undefined) item.scaleXPercent = imageScalePercent(item, "scaleX");
    if (item.scaleYPercent === undefined) item.scaleYPercent = imageScalePercent(item, "scaleY");
    item.scaleX = Math.round((Number(item.scaleXPercent || 100) / 100) * 10000) / 10000;
    item.scaleY = Math.round((Number(item.scaleYPercent || 100) / 100) * 10000) / 10000;
    item.width = Math.max(1, Number(item.width || item.layers[0]?.width || 96));
    item.height = Math.max(1, Number(item.height || item.layers[0]?.height || 64));
    item.opacity = clamp(Number(item.opacity ?? 255), 0, 255);
    return item.layers;
  }

  function compositeLayerByIndex(item, index) {
    ensureCompositeImageLayers(item);
    return item.layers[clamp(index ?? 0, 0, item.layers.length - 1)] || null;
  }

  function moveCompositeLayer(item, fromIndex, toIndex) {
    ensureCompositeImageLayers(item);
    if (!Array.isArray(item.layers) || item.layers.length <= 1) return;
    const from = clamp(fromIndex, 0, item.layers.length - 1);
    const to = clamp(toIndex, 0, item.layers.length - 1);
    if (from === to) return;
    const [layer] = item.layers.splice(from, 1);
    item.layers.splice(to, 0, layer);
    item.layers.forEach((entry, index) => { entry.priority = index + 1; });
    item.selectedLayerIndex = to;
  }

  function setCompositeLayerPriority(item, layerIndex, nextPriority) {
    ensureCompositeImageLayers(item);
    const index = clamp(layerIndex ?? 0, 0, item.layers.length - 1);
    const layer = item.layers[index];
    if (!layer) return;
    layer.priority = clamp(Math.round(Number(nextPriority) || 1), 1, item.layers.length);
    ensureCompositeImageLayers(item);
    item.selectedLayerIndex = item.layers.findIndex(entry => entry.id === layer.id);
  }

  function normalizeProjectPsdPath(path) {
    let value = String(path || "").replace(/\\/g, "/");
    const projectName = String(projectAssets?.name || "");
    if (projectName && value.toLowerCase().startsWith(projectName.toLowerCase() + "/")) value = value.slice(projectName.length + 1);
    const index = value.toLowerCase().indexOf("psd/");
    if (index < 0) return "";
    value = value.slice(index).replace(/^\/+/, "");
    if (!/\.psd$/i.test(value)) return "";
    return value;
  }

  function psdFileKeyFromPath(path) {
    const rel = normalizeProjectPsdPath(path);
    return rel ? `psdfile:${rel.toLowerCase()}` : "";
  }

  function psdFileLabelFromPath(path) {
    const rel = normalizeProjectPsdPath(path);
    return rel ? rel.replace(/^PSD\//i, "") : String(path || "PSD");
  }

  function projectPsdFileEntryByKey(key) {
    const wanted = String(key || "");
    return projectAssets?.psdFiles?.get(wanted) || null;
  }

  function collectProjectPsdFileEntries() {
    return Array.from(projectAssets?.psdFiles?.values?.() || []).sort((a, b) => String(a.label || "").localeCompare(String(b.label || "")));
  }

  function ensureCompositePresetLibraries() {
    if (!Array.isArray(state.compositePresetLibraries)) state.compositePresetLibraries = [];
    return state.compositePresetLibraries;
  }

  function compositePresetLibraryKey(item) {
    if (!item || item.type !== "compositeImage") return "";
    const psd = item.psdImport || {};
    const sourcePathKey = psdFileKeyFromPath(psd.sourcePath || "");
    if (sourcePathKey) return sourcePathKey;
    const folder = normalizeImageFolder(psd.assetFolder || "") || "";
    const file = sanitizeImportName(psd.sourceFileName || "", "");
    const base = sanitizeImportName(psd.sourceBaseName || "", "");
    if (folder || file || base) return `psd:${folder || file || base}`;
    return `item:${safeId(item.id || "composite", "composite")}`;
  }

  function compositePresetLibraryLabel(item) {
    if (!item || item.type !== "compositeImage") return "";
    const psd = item.psdImport || {};
    if (psd.sourcePath) return psdFileLabelFromPath(psd.sourcePath);
    return String(psd.sourceFileName || psd.sourceBaseName || item.id || "統合画像");
  }

  function ensureCompositePresetLibrary(item) {
    if (!item || item.type !== "compositeImage") return null;
    const key = compositePresetLibraryKey(item);
    const libraries = ensureCompositePresetLibraries();
    let library = libraries.find(entry => String(entry.key || "") === key) || null;
    if (!library && item.psdPresetLibraryDisabled === true) {
      item.compositePresets = [];
      item.selectedPresetId = "";
      return null;
    }
    if (!library) {
      library = { key, label: compositePresetLibraryLabel(item), selectedPresetId: "", presets: [] };
      libraries.push(library);
    }
    item.psdPresetLibraryDisabled = false;
    library.label = compositePresetLibraryLabel(item);
    if (!Array.isArray(library.presets)) library.presets = [];
    if (library.presets.length <= 0 && Array.isArray(item.compositePresets) && item.compositePresets.length > 0) {
      library.presets = cloneForHistory(item.compositePresets);
      library.selectedPresetId = String(item.selectedPresetId || library.presets[0]?.id || "");
    }
    item.compositePresets = library.presets;
    if (item.selectedPresetId && item.compositePresets.some(preset => preset.id === item.selectedPresetId)) {
      library.selectedPresetId = String(item.selectedPresetId);
    }
    item.selectedPresetId = String(library.selectedPresetId || item.selectedPresetId || item.compositePresets[0]?.id || "");
    library.selectedPresetId = String(item.selectedPresetId || "");
    return library;
  }

  function syncCompositePresetLibraryFromItem(item) {
    const library = ensureCompositePresetLibrary(item);
    if (!library) return null;
    library.presets = Array.isArray(item.compositePresets) ? item.compositePresets : [];
    library.selectedPresetId = String(item.selectedPresetId || library.presets[0]?.id || "");
    item.compositePresets = library.presets;
    item.selectedPresetId = library.selectedPresetId;
    return library;
  }

  function compositeLayerAssetKey(layer) {
    const folder = normalizeImageFolder(layer?.folder || "pictures") || "pictures";
    const fileName = stripImageExtension(layer?.fileName || "");
    if (fileName) return `${folder}/${fileName}`;
    return safeId(String(layer?.id || "layer"), "layer");
  }

  function normalizeCompositeLayerAsset(asset, fallbackLayer = null) {
    const source = asset || fallbackLayer || {};
    const normalized = {
      key: String(source.key || source.assetKey || compositeLayerAssetKey(source)),
      id: String(source.id || fallbackLayer?.id || ""),
      name: String(source.name || fallbackLayer?.name || source.id || ""),
      folder: normalizeImageFolder(source.folder || fallbackLayer?.folder || "pictures") || "pictures",
      fileName: stripImageExtension(source.fileName || fallbackLayer?.fileName || ""),
      previewSrc: String(source.previewSrc || fallbackLayer?.previewSrc || ""),
      previewName: String(source.previewName || fallbackLayer?.previewName || ""),
      previewNaturalWidth: Math.max(0, Number(source.previewNaturalWidth || fallbackLayer?.previewNaturalWidth || 0)),
      previewNaturalHeight: Math.max(0, Number(source.previewNaturalHeight || fallbackLayer?.previewNaturalHeight || 0)),
      width: Math.max(1, Number(source.width || fallbackLayer?.width || source.previewNaturalWidth || fallbackLayer?.previewNaturalWidth || 96)),
      height: Math.max(1, Number(source.height || fallbackLayer?.height || source.previewNaturalHeight || fallbackLayer?.previewNaturalHeight || 64)),
      x: Number(source.x || fallbackLayer?.x || 0),
      y: Number(source.y || fallbackLayer?.y || 0),
      opacity: clamp(Number(source.opacity ?? fallbackLayer?.opacity ?? 255), 0, 255),
      blendMode: String(source.blendMode || fallbackLayer?.blendMode || "normal")
    };
    return normalized;
  }

  function ensureCompositeLayerAssets(item) {
    if (!item || item.type !== "compositeImage") return [];
    if (!Array.isArray(item.compositeLayerAssets)) item.compositeLayerAssets = [];
    const merged = new Map();
    for (const entry of item.compositeLayerAssets) {
      const asset = normalizeCompositeLayerAsset(entry);
      merged.set(asset.key, asset);
    }
    const ingestLayer = layer => {
      if (!layer) return;
      const asset = normalizeCompositeLayerAsset(layer);
      const prev = merged.get(asset.key) || {};
      merged.set(asset.key, Object.assign({}, prev, asset, {
        name: asset.name || prev.name || String(layer.id || ""),
        previewSrc: asset.previewSrc || prev.previewSrc || "",
        previewName: asset.previewName || prev.previewName || "",
        previewNaturalWidth: Math.max(0, Number(asset.previewNaturalWidth || prev.previewNaturalWidth || 0)),
        previewNaturalHeight: Math.max(0, Number(asset.previewNaturalHeight || prev.previewNaturalHeight || 0))
      }));
    };
    ensureCompositeImageLayers(item).forEach(ingestLayer);
    if (Array.isArray(item.compositePresets)) {
      for (const preset of item.compositePresets) {
        for (const layer of (preset?.layers || [])) ingestLayer(layer);
      }
    }
    item.compositeLayerAssets = Array.from(merged.values());
    return item.compositeLayerAssets;
  }

  function compositeLayerAssetByKey(item, key) {
    return ensureCompositeLayerAssets(item).find(asset => String(asset.key || "") === String(key || "")) || null;
  }

  function resolveCompositePresetLayer(item, layer, layerIndex = 0) {
    const base = createDefaultCompositeImageLayer(layerIndex);
    const assetKey = String(layer?.assetKey || compositeLayerAssetKey(layer));
    const asset = compositeLayerAssetByKey(item, assetKey);
    const merged = Object.assign(base, asset || {}, layer || {});
    merged.assetKey = assetKey;
    merged.visible = merged.visible !== false;
    merged.opacity = clamp(Number(merged.opacity ?? 255), 0, 255);
    merged.priority = Math.max(1, Number(merged.priority || (layerIndex + 1)));
    merged.folder = normalizeImageFolder(merged.folder || "pictures") || "pictures";
    merged.fileName = stripImageExtension(merged.fileName || "");
    merged.width = Math.max(1, Number(merged.width || merged.previewNaturalWidth || 96));
    merged.height = Math.max(1, Number(merged.height || merged.previewNaturalHeight || 64));
    return merged;
  }

  function compositePresetLayerSnapshot(item) {
    ensureCompositeLayerAssets(item);
    return ensureCompositeImageLayers(item).map(layer => ({
      id: layer.id,
      assetKey: String(layer.assetKey || compositeLayerAssetKey(layer)),
      name: layer.name,
      visible: layer.visible !== false,
      folder: normalizeImageFolder(layer.folder || "pictures") || "pictures",
      fileName: String(layer.fileName || ""),
      previewSrc: String(layer.previewSrc || ""),
      previewName: String(layer.previewName || ""),
      previewNaturalWidth: Math.max(0, Number(layer.previewNaturalWidth || 0)),
      previewNaturalHeight: Math.max(0, Number(layer.previewNaturalHeight || 0)),
      x: Number(layer.x || 0),
      y: Number(layer.y || 0),
      width: Math.max(1, Number(layer.width || layer.previewNaturalWidth || 96)),
      height: Math.max(1, Number(layer.height || layer.previewNaturalHeight || 64)),
      opacity: clamp(Number(layer.opacity ?? 255), 0, 255),
      priority: Math.max(1, Number(layer.priority || 1)),
      blendMode: String(layer.blendMode || "normal")
    }));
  }

  function compositePresetPictureSnapshot(item) {
    return {
      x: Number(item.x || 0),
      y: Number(item.y || 0),
      width: Math.max(1, Number(item.width || 96)),
      height: Math.max(1, Number(item.height || 64)),
      scaleXPercent: imageScalePercent(item, "scaleX"),
      scaleYPercent: imageScalePercent(item, "scaleY"),
      opacity: clamp(Number(item.opacity ?? 255), 0, 255),
      zOrder: Number(item.zOrder || 0),
      visible: item.visible !== false
    };
  }

  function nextCompositePresetId(item, base = "preset") {
    ensureCompositeImagePresets(item);
    const safeBase = safeId(sanitizeImportName(base, "preset"), "preset");
    const used = new Set(item.compositePresets.map(preset => String(preset.id || "")));
    if (!used.has(safeBase)) return safeBase;
    let n = 2;
    while (used.has(`${safeBase}_${n}`)) n += 1;
    return `${safeBase}_${n}`;
  }

  function createCompositeImagePreset(item, id = "") {
    ensureCompositeLayerAssets(item);
    const presetId = nextCompositePresetId(item, id || item.exportPresetName || "preset");
    return {
      id: presetId,
      label: presetId,
      exportBaseName: String(item.exportBaseName || ""),
      exportPresetName: presetId,
      layers: compositePresetLayerSnapshot(item),
      picture: compositePresetPictureSnapshot(item),
      exportedImage: null
    };
  }

  function normalizeCompositePreset(item, preset, index = 0) {
    const id = safeId(sanitizeImportName(preset?.id || `preset_${index + 1}`, `preset_${index + 1}`), `preset_${index + 1}`);
    const layers = Array.isArray(preset?.layers) && preset.layers.length ? preset.layers : compositePresetLayerSnapshot(item);
    const basePicture = compositePresetPictureSnapshot(item);
    const picture = Object.assign({}, basePicture, preset?.picture || {});
    picture.x = Number(picture.x || 0);
    picture.y = Number(picture.y || 0);
    picture.width = Math.max(1, Number(picture.width || basePicture.width || 96));
    picture.height = Math.max(1, Number(picture.height || basePicture.height || 64));
    picture.scaleXPercent = Math.max(1, Number(picture.scaleXPercent || 100));
    picture.scaleYPercent = Math.max(1, Number(picture.scaleYPercent || 100));
    picture.opacity = clamp(Number(picture.opacity ?? 255), 0, 255);
    picture.zOrder = Number(picture.zOrder || 0);
    picture.visible = picture.visible !== false;
    return {
      id,
      label: String(preset?.label || id),
      exportBaseName: String(preset?.exportBaseName || item.exportBaseName || ""),
      exportPresetName: String(preset?.exportPresetName || id),
      layers: layers.map((layer, layerIndex) => resolveCompositePresetLayer(item, layer, layerIndex)),
      picture,
      exportedImage: preset?.exportedImage || null
    };
  }

  function ensureCompositeImagePresets(item) {
    if (!item || item.type !== "compositeImage") return [];
    ensureCompositeLayerAssets(item);
    if (!Array.isArray(item.compositePresets)) item.compositePresets = [];
    item.compositePresets = item.compositePresets.map((preset, index) => normalizeCompositePreset(item, preset, index));
    if (!item.selectedPresetId && item.compositePresets[0]) item.selectedPresetId = item.compositePresets[0].id;
    if (item.selectedPresetId && !item.compositePresets.some(preset => preset.id === item.selectedPresetId)) item.selectedPresetId = item.compositePresets[0]?.id || "";
    return item.compositePresets;
  }

  function compositePresetById(item, presetId) {
    return ensureCompositeImagePresets(item).find(preset => preset.id === presetId) || null;
  }

  function compositeDraftPresetFromData(item, draft = {}) {
    const base = {
      id: String(draft?.id || item?.exportPresetName || "preset"),
      label: String(draft?.label || ""),
      exportBaseName: String(draft?.exportBaseName || item?.exportBaseName || ""),
      exportPresetName: String(draft?.exportPresetName || draft?.id || item?.exportPresetName || "preset"),
      layers: Array.isArray(draft?.layers) ? draft.layers : compositePresetLayerSnapshot(item),
      picture: Object.assign({}, compositePresetPictureSnapshot(item), draft?.picture || {}),
      exportedImage: draft?.exportedImage || null
    };
    return normalizeCompositePreset(item, base, Math.max(0, Number(item?.compositePresets?.length || 0)));
  }

  function compositeItemCloneForPreset(item, preset) {
    const clone = cloneForHistory(item);
    clone.layers = cloneForHistory(preset.layers || []);
    clone.width = Math.max(1, Number(preset.picture?.width || item.width || 96));
    clone.height = Math.max(1, Number(preset.picture?.height || item.height || 64));
    clone.opacity = clamp(Number(preset.picture?.opacity ?? item.opacity ?? 255), 0, 255);
    clone.scaleXPercent = Math.max(1, Number(preset.picture?.scaleXPercent || imageScalePercent(item, "scaleX")));
    clone.scaleYPercent = Math.max(1, Number(preset.picture?.scaleYPercent || imageScalePercent(item, "scaleY")));
    clone.scaleX = Math.round((clone.scaleXPercent / 100) * 10000) / 10000;
    clone.scaleY = Math.round((clone.scaleYPercent / 100) * 10000) / 10000;
    delete clone.compositePresets;
    return clone;
  }

  function applyCompositePresetToItem(item, preset) {
    if (!item || !preset) return;
    item.layers = cloneForHistory(preset.layers || []);
    const picture = preset.picture || {};
    item.x = Number(picture.x || 0);
    item.y = Number(picture.y || 0);
    item.width = Math.max(1, Number(picture.width || item.width || 96));
    item.height = Math.max(1, Number(picture.height || item.height || 64));
    item.opacity = clamp(Number(picture.opacity ?? item.opacity ?? 255), 0, 255);
    item.zOrder = Number(picture.zOrder || 0);
    item.visible = picture.visible !== false;
    item.scaleXPercent = Math.max(1, Number(picture.scaleXPercent || 100));
    item.scaleYPercent = Math.max(1, Number(picture.scaleYPercent || 100));
    item.scaleX = Math.round((item.scaleXPercent / 100) * 10000) / 10000;
    item.scaleY = Math.round((item.scaleYPercent / 100) * 10000) / 10000;
    item.exportBaseName = String(preset.exportBaseName || item.exportBaseName || "");
    item.exportPresetName = String(preset.exportPresetName || preset.id || "");
    item.selectedPresetId = preset.id;
    ensureCompositeImageLayers(item);
  }

  function applyCompositePresetLayersOnly(item, preset) {
    if (!item || !preset) return;
    item.layers = cloneForHistory(preset.layers || []);
    item.selectedPresetId = preset.id;
    item.exportBaseName = String(preset.exportBaseName || item.exportBaseName || "");
    item.exportPresetName = String(preset.exportPresetName || preset.id || "");
    ensureCompositeImageLayers(item);
  }

  function compositePresetReferenceKey(item) {
    if (!item || item.type !== "compositeImage") return "";
    return String(item.compositePresetPsdKey || item.psdKey || compositePresetLibraryKey(item) || "");
  }

  function compositePresetReferenceLibrary(item) {
    const key = compositePresetReferenceKey(item);
    return key ? compositePresetLibraryByKey(key) : null;
  }

  function compositePresetReferenceLabel(item) {
    const lib = compositePresetReferenceLibrary(item);
    return String(lib?.label || item?.compositePresetPsdLabel || item?.psdLabel || compositePresetLibraryLabel(item) || "");
  }

  function compositePresetOptionsForItem(item) {
    if (!item || item.type !== "compositeImage") return [];
    const lib = compositePresetReferenceLibrary(item);
    if (lib) {
      const normalized = normalizeCompositePresetLibrary(lib);
      return normalized.presets.map(preset => ({ value: preset.id, label: `${preset.label || preset.id} (${preset.id})` }));
    }
    return [];
  }

  function applyLibraryPresetToCompositeItem(item, library, preset, options = {}) {
    if (!item || !library || !preset) return false;
    const lib = normalizeCompositePresetLibrary(library);
    const normalized = normalizeLibraryPreset(lib, preset, 0);
    const picture = normalized.picture || compositePresetDefaultPictureFromLayers(normalized.layers);
    item.type = "compositeImage";
    item.compositePresetPsdKey = lib.key;
    item.compositePresetPsdLabel = lib.label;
    item.selectedPresetId = normalized.id;
    item.compositePresetNameId = normalized.id;
    item.compositePresetSourcePath = lib.sourcePath || "";
    item.layers = cloneForHistory(normalized.layers || []);
    item.width = Math.max(1, Number(picture.width || item.width || 96));
    item.height = Math.max(1, Number(picture.height || item.height || 64));
    item.opacity = clamp(Number(picture.opacity ?? item.opacity ?? 255), 0, 255);
    item.scaleXPercent = Math.max(1, Number(picture.scaleXPercent || item.scaleXPercent || 100));
    item.scaleYPercent = Math.max(1, Number(picture.scaleYPercent || item.scaleYPercent || 100));
    item.scaleX = Math.round((item.scaleXPercent / 100) * 10000) / 10000;
    item.scaleY = Math.round((item.scaleYPercent / 100) * 10000) / 10000;
    item.visible = picture.visible !== false;
    if (!options.keepPlacement) {
      item.x = Number(picture.x || item.x || 0);
      item.y = Number(picture.y || item.y || 0);
      item.zOrder = Number(picture.zOrder || item.zOrder || 0);
    }
    item.exportBaseName = String(normalized.exportBaseName || lib.exportAutoBaseName || "");
    item.exportPresetName = String(normalized.exportPresetName || normalized.id || "");
    item.compositePresets = [];
    ensureCompositeImageLayers(item);
    applyCompositePresetBakedImage(item, lib, normalized);
    return true;
  }

  function compositePresetBakedImageForItem(item, library, preset) {
    if (!item || item.type !== "compositeImage" || !library || !preset) return null;
    const exported = preset.exportedImage || {};
    const rect = compositeImageDrawRect(item);
    const folder = normalizeImageFolder(exported.folder || `pictures/${COMPOSITE_EXPORT_ROOT_FOLDER}`) || `pictures/${COMPOSITE_EXPORT_ROOT_FOLDER}`;
    const rawFileName = String(exported.fileName || libraryExportFileName(library, preset) || "");
    const fileName = stripImageExtension(rawFileName);
    if (!fileName) return null;
    const ref = findProjectImage({ folder, fileName });
    return {
      folder,
      fileName,
      width: Math.max(1, Number(exported.width || rect.width || item.width || 96)),
      height: Math.max(1, Number(exported.height || rect.height || item.height || 64)),
      offsetX: Number(exported.offsetX ?? rect.minX ?? 0),
      offsetY: Number(exported.offsetY ?? rect.minY ?? 0),
      exportedAt: String(exported.exportedAt || ""),
      layerCount: Math.max(1, Number(exported.layerCount || (item.layers || []).filter(layer => layer.visible !== false && layer.fileName).length || 1)),
      previewSrc: ref?.url || String(exported.previewSrc || ""),
      previewName: `${folder}/${fileName}`,
      exportBaseName: compositeExportBaseName(item, findWindowByItemId(item.id)),
      exportPresetName: compositeExportPresetName(item)
    };
  }

  function applyCompositePresetBakedImage(item, library, preset) {
    const baked = compositePresetBakedImageForItem(item, library, preset);
    if (!baked) return;
    item.bakedImage = baked;
  }

  function runtimeBakedImageForCompositeItem(item) {
    const baked = item?.bakedImage || {};
    if (baked.fileName) return baked;
    const psdKey = String(item?.compositePresetPsdKey || "");
    const presetId = String(item?.selectedPresetId || item?.compositePresetNameId || "");
    if (!psdKey || !presetId) return null;
    const libRaw = compositePresetLibraryByKey(psdKey);
    if (!libRaw) return null;
    const lib = normalizeCompositePresetLibrary(libRaw);
    const preset = (lib.presets || []).find(entry => entry.id === presetId);
    if (!preset) return null;
    const virtualItem = Object.assign({}, item, { type: "compositeImage", layers: cloneForHistory(preset.layers || item.layers || []) });
    return compositePresetBakedImageForItem(virtualItem, lib, preset);
  }

  function resolveCompositePresetForItem(item) {
    if (!item || item.type !== "compositeImage") return null;
    const psdKey = String(item.compositePresetPsdKey || "");
    const presetId = String(item.selectedPresetId || item.compositePresetNameId || "");
    if (!psdKey || !presetId) return null;
    const libRaw = compositePresetLibraryByKey(psdKey);
    if (!libRaw) return null;
    const lib = normalizeCompositePresetLibrary(libRaw);
    const preset = (lib.presets || []).find(entry => entry.id === presetId);
    if (!preset) return null;
    return { psdKey, presetId, lib, preset };
  }

  async function ensureCompositeRuntimePngExports(options = {}) {
    const reason = String(options.reason || "runtimeExport");
    const targets = [];
    for (const win of state.windows || []) {
      for (const item of win.items || []) {
        if (item?.type === "compositeImage") targets.push({ win, item });
      }
    }
    if (targets.length <= 0) return true;

    if (!projectAssets.loaded || !projectAssets.directoryHandle) {
      debugLog("warn", "複合画像の自動書き出しに必要なプロジェクト情報が未読込です。", { reason, compositeCount: targets.length });
      showToast("複合画像の自動書き出しには、先に『ツクールプロジェクト読込』が必要です");
      return false;
    }
    const writeOk = await ensureDirectoryWritePermission(projectAssets.directoryHandle);
    if (!writeOk) {
      debugLog("warn", "複合画像の自動書き出しに必要な書込権限がありません。", { reason });
      showToast("複合画像の自動書き出しに必要な書込権限がありません");
      return false;
    }

    await refreshProjectAssetsQuietly();
    const exportJobs = new Map();
    let unresolved = 0;
    for (const target of targets) {
      const resolved = resolveCompositePresetForItem(target.item);
      if (!resolved) continue;
      const expected = compositePresetBakedImageForItem(target.item, resolved.lib, resolved.preset);
      const expectedExists = !!(expected?.fileName && findProjectImage({ folder: expected.folder, fileName: expected.fileName }));
      const exported = resolved.preset?.exportedImage || {};
      if (!expectedExists || !exported.fileName) {
        const key = `${resolved.psdKey}\n${resolved.presetId}`;
        if (!exportJobs.has(key)) exportJobs.set(key, { target, resolved, expected });
      }
      if (!expected?.fileName) unresolved += 1;
    }

    if (unresolved > 0) {
      debugLog("warn", "複合画像の書き出し先ファイル名を解決できない項目があります。", { reason, unresolved });
    }

    let exportedCount = 0;
    let failedCount = 0;
    for (const job of exportJobs.values()) {
      try {
        const baked = await exportCompositePresetPng(job.target.item, job.resolved.preset);
        if (baked?.fileName) {
          exportedCount += 1;
        } else {
          failedCount += 1;
          debugLog("error", "複合画像の自動書き出しに失敗しました。", {
            reason,
            psdKey: job.resolved.psdKey,
            presetId: job.resolved.presetId
          });
        }
      } catch (error) {
        failedCount += 1;
        debugLog("error", "複合画像の自動書き出しで例外が発生しました。", {
          reason,
          psdKey: job.resolved.psdKey,
          presetId: job.resolved.presetId,
          message: error?.message || String(error)
        });
      }
    }

    if (exportedCount > 0) await refreshProjectAssetsQuietly();
    let synced = false;
    for (const target of targets) {
      const resolved = resolveCompositePresetForItem(target.item);
      if (!resolved) continue;
      const before = JSON.stringify(target.item.bakedImage || null);
      applyCompositePresetBakedImage(target.item, resolved.lib, resolved.preset);
      const after = JSON.stringify(target.item.bakedImage || null);
      if (before !== after) synced = true;
    }
    if (synced) render();
    debugLog("info", "複合画像の自動書き出し確認を完了しました。", {
      reason,
      compositeCount: targets.length,
      exportJobCount: exportJobs.size,
      exportedCount,
      failedCount
    });
    return failedCount <= 0;
  }

  function deleteCompositePresetLibraryByKey(psdKey) {
    const key = String(psdKey || "");
    if (!key) return false;
    let removed = false;
    runStateMutation("PSDプリセット登録削除", () => {
      const libraries = ensureCompositePresetLibraries();
      const index = libraries.findIndex(entry => String(entry.key || "") === key);
      if (index >= 0) {
        libraries.splice(index, 1);
        removed = true;
      }
    });
    if (removed) showToast("PSDプリセット登録を削除しました");
    return removed;
  }

  function compositePresetTargetForLibraryKeyOrSelected(psdKey, fallbackRef = "") {
    return findCompositePresetTargetByLibraryKey(psdKey) || compositePresetTargetFromRef(fallbackRef) || selectedCompositeImageTarget() || allCompositeImageTargets()[0] || null;
  }

  function compositePresetCallScript(item, preset, options = {}) {
    const target = compositePresetTargetFromRef(options.itemRef || compositePresetTargetRef(findWindowByItemId(item?.id), item)) || { win: findWindowByItemId(item?.id), item };
    const win = target.win || findWindowByItemId(item?.id);
    const psdKey = compositePresetLibraryKey(item);
    const presetId = preset?.id || item?.selectedPresetId || "";
    const picture = Object.assign({}, compositePresetPictureSnapshot(item), preset?.picture || {}, options.picture || {});
    const lines = [];
    lines.push(`// DB_UIComposer 統合画像プリセット呼び出し`);
    lines.push(`// PSD: ${psdKey}`);
    lines.push(`// 名前ID: ${presetId}`);
    lines.push(`PluginManager.callCommand(this, "DB_UIComposer_CommandCatalog", "SetCompositePresetByNameId", ${JSON.stringify({ layoutId: state.layoutId, windowId: win?.id || "", itemId: item?.id || "", psdKey, nameId: presetId })});`);
    lines.push(`PluginManager.callCommand(this, "DB_UIComposer", "SetItemPosition", ${JSON.stringify({ layoutId: state.layoutId, windowId: win?.id || "", itemId: item?.id || "", x: String(Number(picture.x || item?.x || 0)), y: String(Number(picture.y || item?.y || 0)) })});`);
    lines.push(`PluginManager.callCommand(this, "DB_UIComposer", "SetItemScale", ${JSON.stringify({ layoutId: state.layoutId, windowId: win?.id || "", itemId: item?.id || "", scaleXPercent: String(Math.max(1, Number(picture.scaleXPercent || 100))), scaleYPercent: String(Math.max(1, Number(picture.scaleYPercent || 100))) })});`);
    lines.push(`PluginManager.callCommand(this, "DB_UIComposer", "SetItemOpacity", ${JSON.stringify({ layoutId: state.layoutId, windowId: win?.id || "", itemId: item?.id || "", opacity: String(clamp(Number(picture.opacity ?? 255), 0, 255)) })});`);
    lines.push(`PluginManager.callCommand(this, "DB_UIComposer", "SetItemVisible", ${JSON.stringify({ layoutId: state.layoutId, windowId: win?.id || "", itemId: item?.id || "", visible: String(picture.visible !== false) })});`);
    return lines.join("\n");
  }

  function compositeImageBounds(item) {
    const layers = ensureCompositeImageLayers(item);
    let maxX = Math.max(1, Number(item.width || 1));
    let maxY = Math.max(1, Number(item.height || 1));
    for (const layer of layers) {
      if (layer.visible === false) continue;
      maxX = Math.max(maxX, Number(layer.x || 0) + Math.max(1, Number(layer.width || layer.previewNaturalWidth || 96)));
      maxY = Math.max(maxY, Number(layer.y || 0) + Math.max(1, Number(layer.height || layer.previewNaturalHeight || 64)));
    }
    return {
      width: Math.max(1, Math.round(maxX)),
      height: Math.max(1, Math.round(maxY))
    };
  }

  function imageChoiceOptions(item) {
    if (!Array.isArray(item.options) || item.options.length <= 0) item.options = [createDefaultImageChoiceOption(0)];
    item.options.forEach((opt, index) => {
      opt.id = opt.id || `choice${index + 1}`;
      opt.text = opt.text || `選択肢${index + 1}`;
      opt.width = Math.max(1, Number(opt.width || 160));
      opt.height = Math.max(1, Number(opt.height || 44));
      opt.enabledImage = Object.assign(createImageChoiceImage(), opt.enabledImage || opt.normalImage || {});
      opt.disabledImage = Object.assign(createImageChoiceImage(), opt.disabledImage || {});
      opt.hoverImage = Object.assign(createImageChoiceImage(), opt.hoverImage || {});
      opt.pressImage = Object.assign(createImageChoiceImage(), opt.pressImage || {});
      opt.conditionType = opt.conditionType || "always";
      opt.trueState = validChoiceState(opt.trueState || "enabled");
      opt.falseState = validChoiceState(opt.falseState || "disabled");
      if (opt.previewCondition === undefined) opt.previewCondition = true;
      if (!opt.hoverScalePercent) opt.hoverScalePercent = 105;
      if (!opt.pressScalePercent) opt.pressScalePercent = 96;
      if (opt.hoverOpacity === undefined) opt.hoverOpacity = 255;
      if (opt.pressOpacity === undefined) opt.pressOpacity = 230;
    });
    return item.options;
  }

  function imageChoiceStateForPreview(opt) {
    const ok = String(opt.conditionType || "always") === "always" ? true : opt.previewCondition !== false;
    return validChoiceState(ok ? opt.trueState : opt.falseState);
  }

  function choiceListRows(item) {
    if (Array.isArray(item.choices) && item.choices.length > 0) return item.choices.map(v => String(v ?? ""));
    if (Array.isArray(item.choiceRules) && item.choiceRules.length > 0) {
      return item.choiceRules.map((rule, index) => String(rule?.text ?? rule?.choice ?? rule?.label ?? `選択肢${index + 1}`));
    }
    return String(item.choicesText || "").split(/\r?\n/).map(v => String(v ?? "")).filter(v => v.length > 0);
  }

  function choiceListGap(item) {
    return Math.max(0, Number(item.gap ?? 3));
  }

  function choiceListVisibleRows(item) {
    const rows = choiceListPreviewEntries(item);
    return Math.max(1, Math.min(rows.length || 1, Number(item.maxVisibleRows || 6)));
  }

  function choiceListHeightForRows(item, rows) {
    const rowHeight = Math.max(1, Number(item.rowHeight || 32));
    const count = Math.max(1, Number(rows || 1));
    return Math.max(1, count * rowHeight + Math.max(0, count - 1) * choiceListGap(item));
  }

  function choiceListPreviewHeight(item) {
    return choiceListHeightForRows(item, choiceListVisibleRows(item));
  }

  function choiceListPreviewRowsForWindow(item, win) {
    const rows = choiceListPreviewEntries(item);
    return win?.scrollEnabled === true ? Math.max(1, rows.length || 1) : choiceListVisibleRows(item);
  }

  function choiceListPreviewHeightForWindow(item, win) {
    return choiceListHeightForRows(item, choiceListPreviewRowsForWindow(item, win));
  }

  function validChoiceState(value) {
    return ["enabled", "disabled", "hidden"].includes(String(value || "")) ? String(value) : "enabled";
  }

  function defaultChoiceRule() {
    return { conditionType: "always", trueState: "enabled", falseState: "hidden", switchId: 0, variableId: 0, compareValue: 0, script: "", previewCondition: true };
  }

  function ensureChoiceRulesArray(item) {
    const rows = Array.isArray(item.choices) && item.choices.length > 0
      ? item.choices.map(v => String(v ?? ""))
      : Array.isArray(item.choiceRules) && item.choiceRules.length > 0
        ? item.choiceRules.map((rule, index) => String(rule?.text ?? rule?.choice ?? rule?.label ?? `選択肢${index + 1}`))
        : choiceListRows(item);
    if (!Array.isArray(item.choiceRules)) item.choiceRules = [];
    item.choiceRules = rows.map((rowText, index) => Object.assign(defaultChoiceRule(), { text: rowText }, item.choiceRules[index] || {}));
    item.choices = rows;
    item.choicesText = rows.join("\n");
    return item.choiceRules;
  }

  function choiceRuleStateForPreview(rule, item = null) {
    if (String(item?.choiceMode || "") === "tool") return "enabled";
    const r = Object.assign(defaultChoiceRule(), rule || {});
    const ok = r.conditionType === "always" ? true : r.previewCondition !== false;
    return validChoiceState(ok ? r.trueState : r.falseState);
  }

  function choiceListPreviewEntries(item) {
    const rows = choiceListRows(item);
    const rules = ensureChoiceRulesArray(item);
    return rows.map((text, index) => ({
      text: String(rules[index]?.text ?? text ?? ""),
      index,
      state: choiceRuleStateForPreview(rules[index], item)
    })).filter(entry => entry.state !== "hidden");
  }

  function setChoiceListRows(item, text) {
    item.choices = String(text || "").split(/\r?\n/).map(v => String(v ?? "")).filter(v => v.length > 0);
    item.choicesText = item.choices.join("\n");
    ensureChoiceRulesArray(item);
    item.choiceRules.forEach((rule, index) => { rule.text = item.choices[index] || rule.text || `選択肢${index + 1}`; });
    ensureChoiceEnabledArray(item);
  }

  function ensureChoiceEnabledArray(item) {
    const rows = choiceListRows(item);
    if (!Array.isArray(item.choiceEnabled)) item.choiceEnabled = [];
    ensureChoiceRulesArray(item);
    item.choiceEnabled = rows.map((_, index) => choiceRuleStateForPreview(item.choiceRules[index], item) === "enabled");
    item.disabledIndexes = item.choiceRules
      .map((rule, index) => choiceRuleStateForPreview(rule, item) === "disabled" ? String(index + 1) : "")
      .filter(Boolean)
      .join(",");
    return item.choiceEnabled;
  }

  function isPreviewChoiceEnabled(item, index) {
    return ensureChoiceEnabledArray(item)[index] !== false;
  }

  function effectiveButtonPreviewState(item, key) {
    const states = ensureButtonStates(item);
    return states[key] || createDefaultButtonState();
  }

  function applyButtonPreviewState(el, item, key) {
    const st = effectiveButtonPreviewState(item, key);
    const baseBack = item.backColor || "rgba(255,255,255,.14)";
    const baseBorder = item.borderColor || "rgba(255,255,255,.48)";
    const baseText = item.color || "";
    const enabled = st.enabled === true;
    el.style.background = enabled && st.backColor ? st.backColor : baseBack;
    el.style.borderColor = enabled && st.borderColor ? st.borderColor : baseBorder;
    if (enabled && st.textColor) el.style.color = st.textColor;
    else if (baseText) el.style.color = baseText;
    el.style.opacity = String(clamp(Number(enabled ? st.opacity : item.opacity ?? 255) / 255, 0, 1));
    const sx = Math.max(1, Number(enabled ? st.scaleXPercent : 100) || 100) / 100;
    const sy = Math.max(1, Number(enabled ? st.scaleYPercent : 100) || 100) / 100;
    const ox = Number(enabled ? st.offsetX : 0) || 0;
    const oy = Number(enabled ? st.offsetY : 0) || 0;
    el.style.transform = `translate(${ox}px, ${oy}px) scale(${sx}, ${sy})`;
    el.style.transformOrigin = "center center";
    if (String(item?.buttonVisualMode || "normal") !== "normal") {
      const imgDef = buttonImageForState(item, key);
      const img = el.querySelector("img.button-preview-image");
      const src = imgDef.previewSrc || findProjectImage(imgDef)?.url || "";
      if (img) {
        img.src = src || "";
        img.alt = imgDef.presetId || imgDef.fileName || "button";
        img.style.opacity = String(clamp(Number(imgDef.opacity ?? 255) / 255, 0, 1));
        img.hidden = !src;
      }
      el.classList.toggle("has-button-image", !!src);
      el.classList.toggle("no-button-image", !src);
    }
  }

  function createDefaultPlacementArea() {
    return {
      extendLeft: 0,
      extendTop: 0,
      extendRight: 0,
      extendBottom: 0
    };
  }

  function createProjectAssets() {
    return {
      loaded: false,
      name: '',
      files: new Map(),
      images: new Map(),
      psdFiles: new Map(),
      system: null,
      database: createEmptyProjectDatabase(),
      windowSkinUrl: '',
      windowSkinImage: null,
      windowSkinReady: false,
      iconSetUrl: '',
      iconSetImage: null,
      iconSetReady: false,
      fontUrl: '',
      fontStyleEl: null,
      directoryHandle: null,
      directoryHandleStored: false,
      restoreStatus: ''
    };
  }

  function createEmptyProjectDatabase() {
    return {
      actors: [],
      classes: [],
      skills: [],
      items: [],
      weapons: [],
      armors: [],
      enemies: [],
      states: [],
      loadedKeys: []
    };
  }

  function cloneForHistory(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function createHistorySnapshot() {
    return {
      state: cloneForHistory(state),
      selected: selected ? Object.assign({}, selected) : null,
      clipboardKind: objectClipboard?.kind || "",
      templateCount: ensureComponentTemplates().length,
      mode,
      globalWindowPositionLocked,
      globalPartPositionLocked
    };
  }

  function historyStateSignature(snapshot) {
    return JSON.stringify(snapshot?.state || {});
  }

  function updateHistoryControls() {
    const undoButton = $("undoBtn");
    const redoButton = $("redoBtn");
    if (undoButton) {
      undoButton.disabled = undoHistory.length <= 0;
      undoButton.title = undoHistory.length > 0
        ? `元に戻す（Ctrl+Z）: ${undoHistory[undoHistory.length - 1].label}`
        : '元に戻す（Ctrl+Z）: 戻せる操作はありません';
    }
    if (redoButton) {
      redoButton.disabled = redoHistory.length <= 0;
      redoButton.title = redoHistory.length > 0
        ? `やり直す（Ctrl+Shift+Z）: ${redoHistory[redoHistory.length - 1].label}`
        : 'やり直す（Ctrl+Shift+Z）: やり直せる操作はありません';
    }
  }

  // 変更前のスナップショットを、変更が実際に起きた時だけ履歴へ積む。
  function commitHistorySnapshot(before, label = '編集') {
    if (historyRestoring || !before) return false;
    const current = createHistorySnapshot();
    if (historyStateSignature(before) === historyStateSignature(current)) return false;
    undoHistory.push({ snapshot: before, label: String(label || '編集') });
    if (undoHistory.length > HISTORY_LIMIT) undoHistory.splice(0, undoHistory.length - HISTORY_LIMIT);
    redoHistory.length = 0;
    updateHistoryControls();
    return true;
  }

  function runStateMutation(label, mutate, options = {}) {
    const before = createHistorySnapshot();
    const result = mutate();
    commitHistorySnapshot(before, label);
    if (options.render !== false) render(options.renderOptions || {});
    return result;
  }

  function restoreHistorySnapshot(snapshot) {
    if (!snapshot || !snapshot.state) return;
    historyRestoring = true;
    state = cloneForHistory(snapshot.state);
    normalizeImportedState(state);
    selected = snapshot.selected ? Object.assign({}, snapshot.selected) : null;
    mode = snapshot.mode === 'inside' ? 'inside' : 'screen';
    doubleClickCycle = null;
    lastPreviewPrimaryDown = null;
    objectListClickCycle = null;
    updateModeButtons();
    historyRestoring = false;
    render();
  }

  function undoLastMutation() {
    const entry = undoHistory.pop();
    if (!entry) {
      showToast('戻せる操作はありません');
      updateHistoryControls();
      return;
    }
    redoHistory.push({ snapshot: createHistorySnapshot(), label: entry.label });
    restoreHistorySnapshot(entry.snapshot);
    updateHistoryControls();
    showToast(`元に戻しました: ${entry.label}`);
  }

  function redoLastMutation() {
    const entry = redoHistory.pop();
    if (!entry) {
      showToast('やり直せる操作はありません');
      updateHistoryControls();
      return;
    }
    undoHistory.push({ snapshot: createHistorySnapshot(), label: entry.label });
    restoreHistorySnapshot(entry.snapshot);
    updateHistoryControls();
    showToast(`やり直しました: ${entry.label}`);
  }

  function clearHistory() {
    undoHistory.length = 0;
    redoHistory.length = 0;
    updateHistoryControls();
  }

  function isTextEditingElement(element) {
    if (!(element instanceof HTMLElement)) return false;
    if (element.isContentEditable) return true;
    const tag = element.tagName;
    return (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') && !element.disabled && !element.readOnly;
  }

  function shouldSuppressObjectListDrag(ev) {
    const active = document.activeElement;
    if (isTextEditingElement(active) || isTextEditingElement(ev?.target)) return true;
    const selection = typeof window.getSelection === "function" ? window.getSelection() : null;
    return !!selection && selection.type === "Range" && String(selection.toString() || "").length > 0;
  }

  function supportsDirectoryPicker() {
    return typeof window.showDirectoryPicker === "function";
  }

  function supportsToolDataSavePicker() {
    return typeof window.showSaveFilePicker === "function";
  }

  function supportsToolDataOpenPicker() {
    return typeof window.showOpenFilePicker === "function";
  }

  function openToolDb() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) return reject(new Error("IndexedDBが使用できません。"));
      const request = indexedDB.open(IDB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("IndexedDB open error"));
    });
  }

  async function idbSet(key, value) {
    const db = await openToolDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put(value, key);
      tx.oncomplete = () => { db.close(); resolve(true); };
      tx.onerror = () => { const err = tx.error; db.close(); reject(err || new Error("IndexedDB write error")); };
    });
  }

  async function idbGet(key) {
    const db = await openToolDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error || new Error("IndexedDB read error"));
      tx.oncomplete = () => db.close();
    });
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => toast.classList.remove("show"), 1400);
  }

  const HELP_TEXT = {
    "レイアウトID": "この配置データの識別名です。MZ側で表示/非表示を管理する時の目印にもなります。",
    "画面幅": "MZのゲーム画面幅です。ツクールプロジェクト読込時はSystem.jsonから取得します。",
    "画面高さ": "MZのゲーム画面高さです。ツクールプロジェクト読込時はSystem.jsonから取得します。",
    "基本文字サイズ": "プレビューとMZ再現で使う基本文字サイズです。このレイアウト限定で保存されます。",
    "行高さ": "テキスト描画時の行間・高さ補正です。MZとの差がある場合に調整します。",
    "内部余白": "ウィンドウ内部の基準余白です。MZのWindow_Base paddingに近い値です。",
    "文字Y補正": "文字の縦位置だけを微調整する補正値です。",
    "Window.png風プレビュー": "img/system/Window.pngをMZ風に切り出してプレビュー表示します。",
    "変数プレビュー値": "\V[1] などの制御文字プレビューに使う仮の変数値です。例: 1=75",
    "Actor HP": "actorHpゲージのプレビュー用現在HPです。",
    "Actor 最大HP": "actorHpゲージのプレビュー用最大HPです。",
    "Actor MP": "actorMpゲージのプレビュー用現在MPです。",
    "Actor 最大MP": "actorMpゲージのプレビュー用最大MPです。",
    "Actor TP": "actorTpゲージのプレビュー用TPです。",
    "ID": "ウィンドウIDです。半角英数字とアンダースコア中心を推奨します。",
    "X": "ゲーム画面左上を基準にしたウィンドウX座標です。",
    "Y": "ゲーム画面左上を基準にしたウィンドウY座標です。",
    "幅": "ウィンドウまたはパーツの幅です。",
    "高さ": "ウィンドウまたはパーツの高さです。",
    "不透明度": "0で透明、255で不透明です。",
    "内容不透明度": "ウィンドウ内に描画する内容全体の不透明度です。",
    "ウィンドウ表示": "このウィンドウを表示するかどうかです。",
    "レイヤー": "MZ側での大まかな表示階層です。mapUi/messageAbove/overlayから選びます。",
    "表示順": "同じレイヤー内での前後順です。数値が大きいほど手前です。",
    "背景タイプ": "標準背景、暗い背景、透明背景を切り替えます。",
    "標準枠表示": "MZ標準のWindow.png枠を表示するかどうかです。",
    "左へ拡張": "ウィンドウ外にもパーツを置ける配置可能範囲を左方向へ広げます。",
    "上へ拡張": "ウィンドウ外にもパーツを置ける配置可能範囲を上方向へ広げます。",
    "右へ拡張": "ウィンドウ外にもパーツを置ける配置可能範囲を右方向へ広げます。",
    "下へ拡張": "ウィンドウ外にもパーツを置ける配置可能範囲を下方向へ広げます。",
    "背景画像を使う": "ウィンドウ内側に背景画像を描画します。",
    "背景画像を選択": "プロジェクト内画像からウィンドウ背景画像を選択します。",
    "背景画像を解除": "選択中の背景画像設定を解除します。",
    "選択中背景": "現在指定されている背景画像のMZ用パスです。",
    "背景表示方法": "stretch=縦横比を無視して領域いっぱいへ伸縮、cover=縦横比を維持して領域を覆い余りを中央で切り抜き、contain=縦横比を維持して全体を収め、tile=原寸で左上から繰り返します。",
    "背景不透明度": "背景画像の不透明度です。0で透明、255で不透明です。",
    "背景表示順": "背景画像の表示順です。パーツや装飾と重ね順を調整します。",
    "装飾画像を使う": "標準枠とは別に、ウィンドウ装飾画像を重ねて表示します。",
    "装飾画像を選択": "プロジェクト内画像から装飾画像を選択します。",
    "装飾画像を解除": "選択中の装飾画像設定を解除します。",
    "選択中装飾": "現在指定されている装飾画像のMZ用パスです。",
    "装飾表示方法": "stretch=縦横比を無視して領域いっぱいへ伸縮、cover=縦横比を維持して領域を覆い余りを中央で切り抜き、contain=縦横比を維持して全体を収め、tile=原寸で左上から繰り返します。",
    "装飾不透明度": "装飾画像の不透明度です。",
    "装飾表示順": "装飾画像の表示順です。ボタンや画像を枠より手前に出す時に調整します。",
    "要素ID": "ウィンドウ内パーツの識別IDです。",
    "タイプ": "パーツの種類です。",
    "内部X": "対象ウィンドウの内部基準位置から見たX座標です。",
    "内部Y": "対象ウィンドウの内部基準位置から見たY座標です。",
    "パーツ表示": "このパーツを表示するかどうかです。",
    "パーツ表示順": "ウィンドウ内での重ね順です。数値が大きいほど手前です。",
    "ウィンドウ外描画": "ONにすると、ウィンドウ外にはみ出した部分もMZ側で描画します。OFFでは外側を隠します。",
    "表示文字": "表示する文字です。\V[1]などのMZ制御文字も使用できます。",
    "表示幅（0で自動）": "テキストの描画幅です。0の場合は自動扱いです。",
    "文字サイズ": "このテキストの文字サイズです。",
    "文字色": "#ffffff などのCSSカラーです。空欄なら通常色です。",
    "横揃え": "テキストの横揃えです。",
    "値タイプ": "ゲージ値の取得方法です。fixed/variable/actorHpなどから選びます。",
    "固定現在値": "値タイプfixed時の現在値です。",
    "固定最大値": "値タイプfixed時の最大値です。",
    "現在値変数ID": "値タイプvariable時に現在値として読む変数IDです。",
    "最大値変数ID": "値タイプvariable時に最大値として読む変数IDです。",
    "アクターID": "actorHp/actorMp/actorTp時に参照するアクターIDです。",
    "ラベル": "ゲージ上に表示する文字です。",
    "ラベル文字サイズ": "ゲージラベルの文字サイズです。",
    "色1": "ゲージ左側の色です。",
    "色2": "ゲージ右側の色です。",
    "ボタン文字": "ボタン上に表示する文字です。",
    "コモンイベントID": "クリック時に予約するコモンイベントIDです。0なら使用しません。",
    "ONにするスイッチID": "クリック時にONにするスイッチIDです。0なら使用しません。",
    "代入する変数ID": "クリック時に値を代入する変数IDです。0なら使用しません。",
    "代入値": "クリック時に変数へ代入する値です。",
    "実行スクリプト": "クリック時に実行するJSコードです。必要な場合だけ使用してください。",
    "プロジェクト画像から選択": "読み込んだツクールプロジェクトのimg配下から画像を選びます。",
    "選択中画像": "現在指定されている画像のMZ用パスです。",
    "基準幅": "画像の元サイズまたは基準表示幅です。",
    "基準高さ": "画像の元サイズまたは基準表示高さです。",
    "X拡大率（%）": "画像の横拡大率です。100で等倍です。",
    "Y拡大率（%）": "画像の縦拡大率です。100で等倍です。"
  };

  function helpFor(label, fallback = "") {
    return HELP_TEXT[String(label || "").trim()] || fallback || String(label || "").trim();
  }

  function setHoverHelp(el, label, fallback = "") {
    if (!el) return el;
    const help = helpFor(label, fallback);
    if (help) {
      el.title = help;
      el.classList.add("tool-hover-help");
      if (typeof el.querySelectorAll === "function") {
        el.querySelectorAll("input, select, textarea, button").forEach(child => {
          if (!child.title) child.title = help;
        });
      }
    }
    return el;
  }

  function labelOwnText(label) {
    return Array.from(label.childNodes || [])
      .filter(node => node.nodeType === Node.TEXT_NODE)
      .map(node => node.textContent || "")
      .join("")
      .trim();
  }

  function applyStaticHoverHelp() {
    document.querySelectorAll("label").forEach(label => {
      if (!label.title) setHoverHelp(label, labelOwnText(label));
      if (label.title) {
        label.querySelectorAll("input, select, textarea, button").forEach(child => {
          if (!child.title) child.title = label.title;
        });
      }
    });
    document.querySelectorAll(".section-toggle").forEach(btn => {
      const text = btn.textContent.replace(/[▾▸]/g, "").trim();
      if (!btn.title) setHoverHelp(btn, text, `${text}セクションを開閉します。`);
    });
    document.querySelectorAll("button").forEach(btn => {
      const text = (btn.getAttribute("aria-label") || btn.textContent || "").trim();
      if (!btn.title && text) setHoverHelp(btn, text);
    });
  }


  function debugLog(level, message, data) {
    const normalized = ["info", "warn", "error"].includes(level) ? level : "info";
    const entry = {
      time: new Date().toLocaleTimeString(),
      level: normalized,
      message: String(message || ""),
      data: data === undefined ? null : data
    };
    debugLogs.push(entry);
    if (debugLogs.length > 300) debugLogs.shift();
    const consoleMethod = normalized === "error" ? "error" : normalized === "warn" ? "warn" : "log";
    try {
      console[consoleMethod](`[DB_UIComposer Tool] ${entry.message}`, entry.data ?? "");
    } catch (_) {}
    renderDebugConsole();
  }

  function debugOnce(key, level, message, data) {
    if (debugOnceKeys.has(key)) return;
    debugOnceKeys.add(key);
    debugLog(level, message, data);
  }

  function safeDebugData(data) {
    if (data == null) return "";
    try {
      return JSON.stringify(data, null, 2);
    } catch (e) {
      return String(data);
    }
  }

  function renderDebugConsole() {
    const panel = $("debugConsole");
    const list = $("debugLogList");
    const summary = $("debugConsoleSummary");
    if (!panel || !list) return;
    panel.hidden = !debugConsoleVisible;
    if (summary) summary.textContent = `ログ ${debugLogs.length}件`;
    if (!debugConsoleVisible) return;
    list.innerHTML = "";
    if (!debugLogs.length) {
      const empty = document.createElement("div");
      empty.className = "debug-log-entry info";
      empty.innerHTML = `<div class="debug-log-message">ログはまだありません。「状態出力」で現在の読込状態を確認できます。</div>`;
      list.appendChild(empty);
      return;
    }
    for (const entry of debugLogs) {
      const row = document.createElement("div");
      row.className = `debug-log-entry ${entry.level}`;
      const dataText = safeDebugData(entry.data);
      row.innerHTML = `
        <div class="debug-log-meta">[${escapeHtml(entry.time)}] ${escapeHtml(entry.level.toUpperCase())}</div>
        <div class="debug-log-message">${escapeHtml(entry.message)}</div>
        ${dataText ? `<div class="debug-log-data">${escapeHtml(dataText)}</div>` : ""}
      `;
      list.appendChild(row);
    }
    list.scrollTop = list.scrollHeight;
  }

  function toggleDebugConsole(force) {
    debugConsoleVisible = typeof force === "boolean" ? force : !debugConsoleVisible;
    renderDebugConsole();
  }

  function debugSnapshot() {
    const s = previewSettings();
    const imageKeys = Array.from(projectAssets.images.keys());
    const sampleImageKeys = imageKeys.slice(0, 20);
    debugLog("info", "現在のツール状態を出力しました。", {
      projectLoaded: projectAssets.loaded,
      projectName: projectAssets.name,
      fileCount: projectAssets.files.size,
      imageCount: projectAssets.images.size,
      directoryHandleStored: !!projectAssets.directoryHandleStored,
      directoryHandleName: projectAssets.directoryHandle?.name || "",
      supportsDirectoryPicker: supportsDirectoryPicker(),
      sampleImageKeys,
      windowSkin: {
        urlExists: !!projectAssets.windowSkinUrl,
        imageExists: !!projectAssets.windowSkinImage,
        ready: !!projectAssets.windowSkinReady,
        naturalWidth: projectAssets.windowSkinImage?.naturalWidth || 0,
        naturalHeight: projectAssets.windowSkinImage?.naturalHeight || 0,
        settingEnabled: !!s.useWindowSkinPreview
      },
      settings: {
        fontFamily: s.fontFamily,
        fontFileName: s.fontFileName,
        defaultFontSize: s.defaultFontSize,
        lineHeight: s.lineHeight,
        padding: s.padding,
        textYOffset: s.textYOffset,
        textColor: s.textColor,
        outlineColor: s.outlineColor,
        outlineWidth: s.outlineWidth,
        editingFocusWindowId: focusedInsideWindowId(),
        editingFocusRaisedInPreview: mode === "inside" && !!focusedInsideWindowId()
      },
      layout: {
        layoutId: state.layoutId,
        screenWidth: state.screenWidth,
        screenHeight: state.screenHeight,
        windowCount: state.windows.length
      }
    });
  }

  function copyDebugLog() {
    const text = debugLogs.map(entry => {
      const dataText = safeDebugData(entry.data);
      return `[${entry.time}] ${entry.level.toUpperCase()} ${entry.message}${dataText ? `\n${dataText}` : ""}`;
    }).join("\n\n");
    copyText(text || "ログはありません");
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, Number(n) || 0));
  }

  function uid(prefix) {
    let i = 1;
    const exists = new Set();
    for (const w of state.windows) {
      exists.add(w.id);
      for (const item of w.items || []) exists.add(item.id);
    }
    while (exists.has(`${prefix}${i}`)) i += 1;
    return `${prefix}${i}`;
  }

  function selectedWindow() {
    if (!selected) return null;
    if (selected.kind === "window") return state.windows.find(w => w.id === selected.windowId) || null;
    if (selected.kind === "item") return state.windows.find(w => w.id === selected.windowId) || null;
    return null;
  }

  function selectedItem() {
    if (!selected || selected.kind !== "item") return null;
    const win = selectedWindow();
    return win ? (win.items || []).find(i => i.id === selected.itemId) || null : null;
  }

  function selectedGroup() {
    if (!selected || selected.kind !== "group") return null;
    return groupById(selected.groupId);
  }

  function selectedScene() {
    if (!selected || selected.kind !== "scene") return null;
    return sceneById(selected.sceneId);
  }

  function ensureSceneSampleLinks() {
    if (!state.sceneSampleLinks || typeof state.sceneSampleLinks !== "object") state.sceneSampleLinks = {};
    return state.sceneSampleLinks;
  }

  function layoutForExport() {
    const data = JSON.parse(JSON.stringify({
      layoutId: state.layoutId,
      screenWidth: state.screenWidth,
      screenHeight: state.screenHeight,
      settings: state.settings || createDefaultSettings(),
      groups: normalizeGroupsForExport(),
      scenes: normalizeScenesForExport(),
      activeSceneId: normalizeSceneId(state.activeSceneId || ""),
      sceneSampleLinks: ensureSceneSampleLinks(),
      compositePresetLibraries: ensureCompositePresetLibraries(),
      componentTemplates: ensureComponentTemplates(),
      windows: state.windows
    }));
    scrubPreviewOnlyFields(data);
    return data;
  }

  function layoutForMzRuntimeExport() {
    const data = JSON.parse(JSON.stringify({
      layoutId: state.layoutId,
      screenWidth: state.screenWidth,
      screenHeight: state.screenHeight,
      settings: state.settings || createDefaultSettings(),
      groups: normalizeGroupsForExport(),
      scenes: normalizeScenesForExport(),
      activeSceneId: normalizeSceneId(state.activeSceneId || ""),
      windows: state.windows
    }));
    for (const win of data.windows || []) {
      win.items = (win.items || []).map(item => {
        if (item.type !== "compositeImage") return item;
        const baked = runtimeBakedImageForCompositeItem(item) || {};
        if (!baked.fileName) return item;
        const out = Object.assign({}, item, {
          type: "image",
          folder: normalizeImageFolder(baked.folder || `pictures/${COMPOSITE_EXPORT_ROOT_FOLDER}`) || `pictures/${COMPOSITE_EXPORT_ROOT_FOLDER}`,
          fileName: stripImageExtension(baked.fileName || ""),
          width: Math.max(1, Number(baked.width || item.width || 96)),
          height: Math.max(1, Number(baked.height || item.height || 64)),
          x: Number(item.x || 0) + Number(baked.offsetX || 0),
          y: Number(item.y || 0) + Number(baked.offsetY || 0),
          previewNaturalWidth: Math.max(1, Number(baked.width || item.width || 96)),
          previewNaturalHeight: Math.max(1, Number(baked.height || item.height || 64))
        });
        delete out.layers;
        delete out.selectedLayerIndex;
        delete out.psdImport;
        delete out.bakedImage;
        delete out.exportBaseName;
        delete out.exportPresetName;
        return out;
      });
    }
    scrubPreviewOnlyFields(data);
    return data;
  }

  function buildMZLayoutJsonText() {
    return JSON.stringify(layoutForMzRuntimeExport(), null, 2);
  }

  function buildLayoutJsonText() {
    return JSON.stringify(layoutForExport(), null, 2);
  }

  function buildMZScriptText() {
    const json = buildMZLayoutJsonText();
    // MZのイベントコマンド「スクリプト」に貼った時、\V[1] などの制御文字が
    // JSON.parse前に壊れないよう、JSON文字列そのものをさらにJS文字列として安全にエスケープする。
    const jsonAsJsString = JSON.stringify(json);
    return `PluginManager.callCommand(this, "DB_UIComposer", "ApplyLayoutJson", {
  json: ${jsonAsJsString},
  clearBefore: "true"
});`;
  }

  // v0.2.92: 右側の出力欄は廃止。render()から呼ばれても副作用を持たない互換用関数です。
  function updateOutputs() {}

  function render(options = {}) {
    if (previewInlineTextEditorState?.input && !document.contains(previewInlineTextEditorState.input)) {
      previewInlineTextEditorState = null;
    }
    // v0.3.92: 初回描画前に階層を正規化します。
    // activeSceneId が空のままだと、最初のプレビューだけ windowInActiveScene() が false になり、
    // クリック後の再描画まで何も出ないことがありました。
    ensureScenes();
    normalizeWindowIds();
    for (const win of state.windows || []) normalizeWindowItemIdentity(win);
    $("layoutIdInput").value = state.layoutId;
    $("screenWidthInput").value = state.screenWidth;
    $("screenHeightInput").value = state.screenHeight;
    const zoomRate = previewZoomRate();
    $("previewSizeLabel").textContent = `${state.screenWidth} × ${state.screenHeight} / ${Math.round(zoomRate * 100)}%`;
    syncSettingsInputs();
    $("currentSelection").textContent = selectionLabel();
    const scaleWrap = $("previewScaleWrap");
    if (scaleWrap) {
      scaleWrap.style.width = `${Math.ceil(state.screenWidth * zoomRate)}px`;
      scaleWrap.style.height = `${Math.ceil(state.screenHeight * zoomRate)}px`;
    }
    preview.style.width = `${state.screenWidth}px`;
    preview.style.height = `${state.screenHeight}px`;
    preview.style.transform = `scale(${zoomRate})`;
    preview.style.transformOrigin = "left top";
    preview.style.fontFamily = previewFontFamily();
    preview.dataset.mode = mode;
    preview.dataset.focusDim = previewSettings().previewFocusDim ? "true" : "false";
    const dimTargetWindowIds = previewDimTargetWindowIds();
    preview.dataset.focusEditingFront = !!focusedInsideWindowId() ? "true" : "false";
    preview.dataset.focusDimActive = dimTargetWindowIds && dimTargetWindowIds.size ? "true" : "false";
    preview.style.setProperty('--db-preview-line-height', `${previewLineHeight()}px`);
    preview.innerHTML = "";

    for (const win of sortedWindowsForPreview()) {
      if (win.visible === false || !groupVisible(win.groupId) || !windowInActiveScene(win)) continue;
      try {
        preview.appendChild(renderWindow(win));
      } catch (e) {
        debugLog("error", "ウィンドウのプレビュー描画中にエラーが発生しました。", {
          windowId: win?.id || "",
          message: e?.message || String(e),
          stack: e?.stack || ""
        });
      }
    }
    renderPreviewSelectionFrame();
    renderFocusResizeHandle();
    renderObjectList();
    revealSelectedObjectInListIfRequested();
    if (!options.skipProperties) {
      renderProperties();
      renderRuntimeCommandPanel();
    }
    updateOutputs();
    updateHistoryControls();
    syncDetachedObjectListWindow();
    applyStaticHoverHelp();
  }

  function selectionLabel() {
    if (!selected) return "選択: なし";
    if (selected.kind === "scene") return `選択: シーン ${sceneName(selected.sceneId)}`;
    if (selected.kind === "group") return `選択: グループ ${groupName(selected.groupId)}`;
    if (selected.kind === "window") return `選択: ウィンドウ ${selected.windowId}`;
    return `選択: 要素 ${selected.itemId} / ${selected.windowId}`;
  }


  function zOrderValue(obj) {
    return Number(obj?.zOrder || 0);
  }

  function sortedWindowsForPreview() {
    return [...state.windows].sort((a, b) => {
      const az = layerZ(a.layer, a);
      const bz = layerZ(b.layer, b);
      if (az !== bz) return az - bz;
      return state.windows.indexOf(a) - state.windows.indexOf(b);
    });
  }

  function sortedItemsForPreview(win) {
    return [...(win.items || [])].sort((a, b) => {
      const az = zOrderValue(a);
      const bz = zOrderValue(b);
      if (az !== bz) return az - bz;
      return (win.items || []).indexOf(a) - (win.items || []).indexOf(b);
    });
  }

  function selectedWindowObject() {
    if (!selected?.windowId) return null;
    return state.windows.find(w => w.id === selected.windowId) || null;
  }

  function groupPreviewBounds(groupId) {
    const id = normalizeGroupId(groupId || "");
    const wins = (state.windows || []).filter(win => {
      if (normalizeGroupId(win.groupId || "") !== id) return false;
      if (win.visible === false) return false;
      if (!groupVisible(win.groupId)) return false;
      if (!windowInActiveScene(win)) return false;
      return true;
    });
    if (!wins.length) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const win of wins) {
      const x = Number(win.x || 0);
      const y = Number(win.y || 0);
      const w = Math.max(1, Number(win.width || 1));
      const h = Math.max(1, Number(win.height || 1));
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + w);
      maxY = Math.max(maxY, y + h);
    }
    return {
      kind: "group",
      groupId: id,
      x: Math.round(minX),
      y: Math.round(minY),
      width: Math.max(1, Math.round(maxX - minX)),
      height: Math.max(1, Math.round(maxY - minY))
    };
  }

  function selectedItemObject() {
    if (selected?.kind !== "item") return null;
    const win = selectedWindowObject();
    const item = win?.items?.find(i => i.id === selected.itemId);
    return item ? { win, item } : null;
  }

  function selectedObjectPreviewRect() {
    if (!selected) return null;
    if (selected.kind === "window") {
      const win = selectedWindowObject();
      if (!win || win.visible === false || !groupVisible(win.groupId) || !windowInActiveScene(win)) return null;
      return {
        kind: "window",
        windowId: win.id,
        x: Number(win.x || 0),
        y: Number(win.y || 0),
        width: Math.max(1, Number(win.width || 1)),
        height: Math.max(1, Number(win.height || 1))
      };
    }
    if (selected.kind === "group") {
      const group = selectedGroup();
      if (!group || group.visible === false) return null;
      const scene = activeScene();
      if (scene && !sceneIncludesGroup(scene, group.id)) return null;
      return groupPreviewBounds(group.id);
    }
    if (selected.kind === "item") {
      const found = selectedItemObject();
      if (!found || found.win.visible === false || !groupVisible(found.win.groupId) || !windowInActiveScene(found.win) || found.item.visible === false) return null;
      const metrics = windowLayerMetrics(found.win);
      const b = itemPreviewBounds(found.item, found.win);
      const scrollY = previewWindowScrollY(found.win, metrics);
      // v0.3.50: renderItem() と同じ実描画座標に揃える。
      // 以前の itemOffsetX/Y 基準だと、ウィンドウ外描画やマイナス座標で
      // metrics.originX/originY 分だけ右下へズレ、ハンドルが画像角から離れていた。
      return {
        kind: "item",
        windowId: found.win.id,
        itemId: found.item.id,
        x: Number(found.win.x || 0) + metrics.contentLeft + b.x,
        y: Number(found.win.y || 0) + metrics.contentTop - scrollY + b.y,
        width: Math.max(1, b.width),
        height: Math.max(1, b.height)
      };
    }
    return null;
  }

  function startGroupFrameDrag(ev, rect) {
    ev.stopPropagation();
    ev.preventDefault();
    if (!rect || rect.kind !== "group") return;
    const group = groupById(rect.groupId);
    if (!group) return;
    if (group.locked === true) {
      showToast("このグループはロックされています");
      return;
    }
    const movableWindows = windowsInGroup(group.id).filter(win => win.locked !== true);
    if (!movableWindows.length) {
      showToast("このグループ内のウィンドウはすべて位置ロックされています");
      return;
    }
    selected = { kind: "group", groupId: group.id };
    drag = {
      type: "moveGroup",
      groupId: group.id,
      startX: ev.clientX,
      startY: ev.clientY,
      baseWindows: movableWindows.map(win => ({ id: win.id, x: Number(win.x || 0), y: Number(win.y || 0) })),
      started: false,
      historySnapshot: createHistorySnapshot(),
      historyLabel: "グループ移動"
    };
    safeSetPointerCapture(ev.currentTarget, ev.pointerId);
  }

  function startFocusedResize(ev, rect) {
    ev.stopPropagation();
    ev.preventDefault();
    if (!rect) return;
    if (rect.kind === "window") {
      const win = state.windows.find(w => w.id === rect.windowId);
      if (!win) return;
      const reason = positionLockReason(win);
      if (reason) { showToast(reason); return; }
      selectWindow(win.id);
      drag = {
        type: "resize",
        windowId: win.id,
        startX: ev.clientX,
        startY: ev.clientY,
        startW: Number(win.width || rect.width),
        startH: Number(win.height || rect.height),
        started: false,
        historySnapshot: createHistorySnapshot(),
        historyLabel: "ウィンドウサイズ変更"
      };
    } else if (rect.kind === "item") {
      const win = state.windows.find(w => w.id === rect.windowId);
      const item = win?.items?.find(i => i.id === rect.itemId);
      if (!item) return;
      const reason = positionLockReason(win, item);
      if (reason) { showToast(reason); return; }
      selectItem(win.id, item.id);
      const itemType = String(item.type || "text");
      const scaleResize = itemType === "image" || itemType === "compositeImage";
      drag = {
        type: "resizeItem",
        windowId: win.id,
        itemId: item.id,
        startX: ev.clientX,
        startY: ev.clientY,
        startW: rect.width,
        startH: rect.height,
        baseW: Number(item.width || rect.width),
        baseH: Number(item.height || rect.height),
        baseScaleX: imageScaleRate(item, "scaleX"),
        baseScaleY: imageScaleRate(item, "scaleY"),
        startScaleXPercent: imageScalePercent(item, "scaleX"),
        startScaleYPercent: imageScalePercent(item, "scaleY"),
        itemType,
        scaleResize,
        started: false,
        historySnapshot: createHistorySnapshot(),
        historyLabel: scaleResize ? "画像拡大率変更" : "パーツサイズ変更"
      };
    }
    safeSetPointerCapture(ev.currentTarget, ev.pointerId);
  }

  function renderPreviewSelectionFrame() {
    const rect = selectedObjectPreviewRect();
    if (!rect || rect.kind !== "group") return;
    const frame = document.createElement("div");
    frame.className = "preview-selection-frame preview-selection-group";
    frame.style.left = `${rect.x}px`;
    frame.style.top = `${rect.y}px`;
    frame.style.width = `${rect.width}px`;
    frame.style.height = `${rect.height}px`;
    frame.title = `選択中グループ: ${groupName(rect.groupId)} / 線をドラッグしてグループ全体を移動`;
    ["top", "right", "bottom", "left"].forEach(edgeName => {
      const edge = document.createElement("div");
      edge.className = `preview-selection-group-edge ${edgeName}`;
      edge.title = "この線をドラッグしてグループ全体を移動します";
      edge.addEventListener("pointerdown", ev => startGroupFrameDrag(ev, rect));
      frame.appendChild(edge);
    });
    preview.appendChild(frame);
  }

  function renderFocusResizeHandle() {
    const rect = selectedObjectPreviewRect();
    if (!rect || rect.kind === "group") return;
    const handle = document.createElement("div");
    handle.className = `focus-resize-handle focus-resize-${rect.kind}`;
    let itemForHandle = null;
    if (rect.kind === "item") {
      const win = state.windows.find(w => w.id === rect.windowId);
      itemForHandle = win?.items?.find(i => i.id === rect.itemId) || null;
    }
    const itemTypeForHandle = String(itemForHandle?.type || "");
    const isImageScaleHandle = itemTypeForHandle === "image"
      || itemTypeForHandle === "compositeImage"
      || (itemTypeForHandle === "button" && String(itemForHandle?.buttonVisualMode || "normal") !== "normal");
    if (isImageScaleHandle) handle.classList.add("focus-scale-handle");
    handle.title = rect.kind === "window"
      ? "選択中ウィンドウをリサイズします。重なっていてもこのハンドルが優先されます。"
      : isImageScaleHandle
        ? "選択中画像の拡大率をドラッグで変更します。通常ドラッグでは縦横比を固定します。Shiftキーを押しながらドラッグするとX/Yを別々に変更できます。"
        : "選択中パーツをリサイズします。重なっていてもこのハンドルが優先されます。";
    const handleSize = 22;
    // v0.3.50: ハンドルの中心を選択矩形の右下角へ合わせる。
    handle.style.left = `${rect.x + rect.width - handleSize / 2}px`;
    handle.style.top = `${rect.y + rect.height - handleSize / 2}px`;
    handle.addEventListener("pointerdown", ev => startFocusedResize(ev, rect));
    preview.appendChild(handle);
  }

  function renderWindow(win) {
    const el = document.createElement("div");
    el.className = "ui-window";
    if (selected?.kind === "window" && selected.windowId === win.id) el.classList.add("selected");
    const focusId = focusedInsideWindowId();
    const dimTargetWindowIds = previewDimTargetWindowIds();
    const isPreviewDimTarget = !!dimTargetWindowIds && dimTargetWindowIds.has(win.id);
    const isEditingFocus = !!focusId && win.id === focusId;
    if (dimTargetWindowIds && dimTargetWindowIds.size) {
      if (isPreviewDimTarget) el.classList.add("focus-target");
      else el.classList.add("focus-dimmed");
    }
    if (isEditingFocus) el.classList.add("editing-front");
    if (!win.frameVisible) el.classList.add("no-frame");
    if (win.backgroundType === "transparent") el.classList.add("transparent");
    if (win.backgroundType === "dim") el.classList.add("dim");
    el.style.left = `${win.x}px`;
    el.style.top = `${win.y}px`;
    el.style.width = `${win.width}px`;
    el.style.height = `${win.height}px`;
    const normalPreviewZ = layerZ(win.layer, win);
    // ウィンドウ内配置モードでは、編集対象のウィンドウと内部パーツをプレビュー専用で
    // 一時的に最前面化します。実際の zOrder / layer は一切書き換えません。
    // これにより、奥側ウィンドウをフォーカスしていても、手前の別ウィンドウに
    // pointerdown を奪われず、その内部パーツを確実にドラッグできます。
    const previewZ = isEditingFocus ? 100000 + normalPreviewZ : normalPreviewZ;
    el.style.zIndex = String(previewZ);
    if (isEditingFocus) {
      el.dataset.editingFront = "true";
      el.title = "ウィンドウ内配置モードの編集対象です。プレビュー上だけ一時的に最前面表示されています。";
    }
    el.dataset.windowId = win.id;
    el.dataset.groupId = win.groupId || "";
    const skinCanvas = createWindowSkinPreviewCanvas(win);
    if (skinCanvas) {
      el.classList.add("mz-windowskin");
      el.appendChild(skinCanvas);
    }

    const title = document.createElement("div");
    title.className = "ui-window-title";
    title.textContent = `${win.id} / ${win.layer || "mapUi"}${win.groupId ? " / " + groupName(win.groupId) : ""}`;
    el.appendChild(title);

    const metrics = windowLayerMetrics(win);
    const layer = document.createElement("div");
    layer.className = "ui-window-layer";
    layer.style.left = `${metrics.originX}px`;
    layer.style.top = `${metrics.originY}px`;
    layer.style.width = `${metrics.layerWidth}px`;
    layer.style.height = `${metrics.layerHeight}px`;
    el.appendChild(layer);

    const layerParts = [];
    const backgroundEl = renderWindowBackgroundImage(win, metrics);
    if (backgroundEl) layerParts.push({ zOrder: normalizeWindowBackgroundImage(win.backgroundImage).zOrder, el: backgroundEl });
    const decorationEl = renderWindowDecorationImage(win, metrics);
    if (decorationEl) layerParts.push({ zOrder: normalizeWindowDecorationImage(win.decorationImage).zOrder, el: decorationEl });
    for (const item of sortedItemsForPreview(win)) {
      if (item.visible === false) continue;
      layerParts.push({ zOrder: zOrderValue(item), el: renderItemLayerPart(win, item, metrics) });
    }
    layerParts.sort((a, b) => (Number(a.zOrder || 0) - Number(b.zOrder || 0)));
    for (const part of layerParts) layer.appendChild(part.el);
    const scrollBar = renderPreviewWindowScrollbar(win, metrics);
    if (scrollBar) el.appendChild(scrollBar);

    const resizer = document.createElement("div");
    resizer.className = "resizer";
    resizer.addEventListener("pointerdown", ev => {
      ev.stopPropagation();
      const reason = positionLockReason(win);
      if (reason) { showToast(reason); return; }
      selectWindow(win.id);
      drag = { type: "resize", windowId: win.id, startX: ev.clientX, startY: ev.clientY, startW: win.width, startH: win.height, started: false, historySnapshot: createHistorySnapshot(), historyLabel: "ウィンドウサイズ変更" };
      safeSetPointerCapture(resizer, ev.pointerId);
    });
    el.appendChild(resizer);

    el.addEventListener("pointerdown", ev => {
      if (ev.target.closest(".ui-item")) return;
      ev.stopPropagation();
      selectWindow(win.id);
      const reason = positionLockReason(win);
      if (reason) { showToast(reason); return; }
      drag = { type: "moveWindow", windowId: win.id, startX: ev.clientX, startY: ev.clientY, baseX: win.x, baseY: win.y, started: false, historySnapshot: createHistorySnapshot(), historyLabel: "ウィンドウ移動" };
      safeSetPointerCapture(el, ev.pointerId);
    });

    return el;
  }

  function layerZ(layer, obj) {
    const base = (() => {
      switch (layer) {
        case "messageAbove": return 2000;
        case "overlay": return 3000;
        default: return 1000;
      }
    })();
    return base + zOrderValue(obj);
  }

  function cssLayerZ(value) {
    return 10000 + Number(value || 0);
  }

  function focusedInsideWindowId() {
    if (selected?.kind === "item" || selected?.kind === "window") return selected.windowId || "";
    return "";
  }

  function previewDimTargetWindowIds() {
    if (!previewSettings().previewFocusDim || !selected) return null;
    if (selected.kind === "window" || selected.kind === "item") {
      return selected.windowId ? new Set([selected.windowId]) : null;
    }
    if (selected.kind === "group") {
      const groupId = normalizeGroupId(selected.groupId || "");
      const ids = (state.windows || [])
        .filter(win => normalizeGroupId(win.groupId || "") === groupId)
        .map(win => win.id);
      return ids.length ? new Set(ids) : null;
    }
    return null;
  }

  function itemPreviewBounds(item, win = null) {
    const x = Number(item.x || 0);
    const y = Number(item.y || 0);
    if (item.type === "image") {
      return { x, y, width: Math.max(1, Math.round(imageBaseWidth(item) * imageScaleRate(item, "scaleX"))), height: Math.max(1, Math.round(imageBaseHeight(item) * imageScaleRate(item, "scaleY"))) };
    }
    if (item.type === "compositeImage") {
      const bounds = compositeImageBounds(item);
      return { x, y, width: Math.max(1, Math.round(bounds.width * imageScaleRate(item, "scaleX"))), height: Math.max(1, Math.round(bounds.height * imageScaleRate(item, "scaleY"))) };
    }
    if (item.type === "gauge") return { x, y, width: Math.max(1, Number(item.width || 220)), height: Math.max(1, Number(item.height || 14)) };
    if (item.type === "button") return { x, y, width: Math.max(1, Number(item.width || 120)), height: Math.max(1, Number(item.height || 36)) };
    if (item.type === "log") return { x, y, width: Math.max(1, Number(item.width || 320)), height: Math.max(1, Number(item.height || 120)) };
    if (item.type === "choiceList") {
      return { x, y, width: Math.max(1, Number(item.width || 240)), height: choiceListPreviewHeightForWindow(item, win) };
    }
    if (item.type === "imageChoiceList") {
      const options = imageChoiceOptions(item);
      let maxX = Math.max(1, Number(item.width || 1));
      let maxY = Math.max(1, Number(item.height || 1));
      for (const opt of options) {
        if (imageChoiceStateForPreview(opt) === "hidden") continue;
        maxX = Math.max(maxX, Number(opt.x || 0) + Math.max(1, Number(opt.width || 160)));
        maxY = Math.max(maxY, Number(opt.y || 0) + Math.max(1, Number(opt.height || 44)));
      }
      return { x, y, width: Math.max(1, maxX), height: Math.max(1, maxY) };
    }
    const size = Number(item.fontSize || previewDefaultFontSize());
    const text = convertPreviewText(item.text || "");
    const lines = String(text).split(/\r?\n/);
    const autoWidth = Math.max(24, Math.ceil(Math.max(...lines.map(line => line.length), 1) * size * 0.62));
    const width = Math.max(1, Number(item.width || autoWidth));
    const height = Math.max(previewLineHeight(), lines.length * previewLineHeight());
    return { x, y, width, height };
  }

  function windowLayerMetrics(win) {
    const pad = previewPadding(win);
    const area = ensurePlacementArea(win);
    const contentLeft = pad - Number(area.extendLeft || 0);
    const contentTop = pad - Number(area.extendTop || 0);
    const contentWidth = Math.max(1, Number(win.width || 1) - pad * 2 + Number(area.extendLeft || 0) + Number(area.extendRight || 0));
    const contentHeight = Math.max(1, Number(win.height || 1) - pad * 2 + Number(area.extendTop || 0) + Number(area.extendBottom || 0));
    let minX = Math.min(0, contentLeft);
    let minY = Math.min(0, contentTop);
    let maxX = Math.max(Number(win.width || 1), contentLeft + contentWidth);
    let maxY = Math.max(Number(win.height || 1), contentTop + contentHeight);

    for (const item of win.items || []) {
      if (item.visible === false || item.allowOutsideWindow !== true) continue;
      const b = itemPreviewBounds(item, win);
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

  function previewWindowAutoScrollContentHeight(win, metrics) {
    let maxBottom = Math.max(1, metrics.contentHeight);
    for (const item of win.items || []) {
      if (!item || item.visible === false) continue;
      const b = itemPreviewBounds(item, win);
      maxBottom = Math.max(maxBottom, Number(b.y || 0) + Math.max(1, Number(b.height || 1)) + 4);
    }
    return Math.ceil(maxBottom);
  }

  function previewWindowScrollContentHeight(win, metrics) {
    const manual = Number(win.scrollContentHeight || 0);
    return manual > 0 ? Math.max(1, manual) : previewWindowAutoScrollContentHeight(win, metrics);
  }

  function previewWindowScrollMax(win, metrics) {
    if (win.scrollEnabled !== true) return 0;
    return Math.max(0, previewWindowScrollContentHeight(win, metrics) - metrics.contentHeight);
  }

  function previewWindowScrollY(win, metrics) {
    return clamp(Number(win.scrollY || 0), 0, previewWindowScrollMax(win, metrics));
  }

  function renderPreviewWindowScrollbar(win, metrics) {
    if (win.scrollEnabled !== true || win.scrollbarVisible === false) return null;
    const max = previewWindowScrollMax(win, metrics);
    if (max <= 0) return null;
    const bar = document.createElement("div");
    bar.className = "ui-window-scrollbar-preview";
    const width = Math.max(4, Number(win.scrollbarWidth || 8));
    const margin = 4;
    const trackTop = metrics.pad;
    const trackHeight = Math.max(1, Number(win.height || 1) - metrics.pad * 2);
    const contentHeight = previewWindowScrollContentHeight(win, metrics);
    const thumbHeight = Math.max(12, Math.floor(trackHeight * metrics.contentHeight / Math.max(metrics.contentHeight, contentHeight)));
    const thumbTop = trackTop + Math.round((trackHeight - thumbHeight) * previewWindowScrollY(win, metrics) / max);
    bar.style.position = "absolute";
    bar.style.left = `${Number(win.width || 1) - width - margin}px`;
    bar.style.top = `${trackTop}px`;
    bar.style.width = `${width}px`;
    bar.style.height = `${trackHeight}px`;
    bar.style.background = win.scrollbarTrackColor || "rgba(0,0,0,.35)";
    bar.style.opacity = String(clamp(Number(win.scrollbarOpacity ?? 220) / 255, 0, 1));
    bar.style.zIndex = "999999";
    bar.style.pointerEvents = "none";
    const thumb = document.createElement("div");
    thumb.style.position = "absolute";
    thumb.style.left = "0";
    thumb.style.top = `${thumbTop - trackTop}px`;
    thumb.style.width = "100%";
    thumb.style.height = `${thumbHeight}px`;
    thumb.style.background = win.scrollbarThumbColor || "rgba(255,255,255,.70)";
    bar.appendChild(thumb);
    return bar;
  }

  function setLayerPartRect(el, left, top, width, height) {
    el.classList.add("ui-window-layer-part");
    el.style.left = `${Math.round(Number(left || 0))}px`;
    el.style.top = `${Math.round(Number(top || 0))}px`;
    el.style.width = `${Math.max(1, Math.round(Number(width || 1)))}px`;
    el.style.height = `${Math.max(1, Math.round(Number(height || 1)))}px`;
  }

  function normalizedDisplayMode(value) {
    const mode = String(value || "stretch");
    return ["stretch", "cover", "contain", "tile"].includes(mode) ? mode : "stretch";
  }

  function imageLayerTargetSize(el) {
    // setLayerPartRect が設定した実ピクセルサイズを優先します。
    // レイアウト確定前でも描画式がぶれないよう、clientWidthではなくstyle値を基準にします。
    const width = Math.max(1, Math.round(Number.parseFloat(el.style.width) || el.clientWidth || 1));
    const height = Math.max(1, Math.round(Number.parseFloat(el.style.height) || el.clientHeight || 1));
    return { width, height };
  }

  function drawImageLayerCanvas(canvas, image, mode, targetWidth, targetHeight) {
    const ctx = canvas.getContext("2d");
    const iw = Math.max(1, Number(image.naturalWidth || image.width || 1));
    const ih = Math.max(1, Number(image.naturalHeight || image.height || 1));
    const tw = Math.max(1, Math.round(targetWidth));
    const th = Math.max(1, Math.round(targetHeight));
    canvas.width = tw;
    canvas.height = th;
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.display = "block";
    canvas.style.pointerEvents = "none";
    ctx.clearRect(0, 0, tw, th);

    if (mode === "tile") {
      // MZ側と同様に、元画像の原寸を左上基準で繰り返します。
      for (let y = 0; y < th; y += ih) {
        for (let x = 0; x < tw; x += iw) {
          const sw = Math.min(iw, tw - x);
          const sh = Math.min(ih, th - y);
          ctx.drawImage(image, 0, 0, sw, sh, x, y, sw, sh);
        }
      }
      return { mode, source: { width: iw, height: ih }, target: { width: tw, height: th }, tileOrigin: "left-top" };
    }

    if (mode === "contain") {
      const rate = Math.min(tw / iw, th / ih);
      const dw = Math.max(1, iw * rate);
      const dh = Math.max(1, ih * rate);
      const dx = (tw - dw) / 2;
      const dy = (th - dh) / 2;
      ctx.drawImage(image, 0, 0, iw, ih, dx, dy, dw, dh);
      return { mode, source: { width: iw, height: ih }, target: { width: tw, height: th }, draw: { sx: 0, sy: 0, sw: iw, sh: ih, dx, dy, dw, dh } };
    }

    if (mode === "cover") {
      // 対象領域を完全に覆う比率で、余るソース側を中央基準で切り抜きます。
      const rate = Math.max(tw / iw, th / ih);
      const sw = Math.max(1, Math.min(iw, tw / rate));
      const sh = Math.max(1, Math.min(ih, th / rate));
      const sx = (iw - sw) / 2;
      const sy = (ih - sh) / 2;
      ctx.drawImage(image, sx, sy, sw, sh, 0, 0, tw, th);
      return { mode, source: { width: iw, height: ih }, target: { width: tw, height: th }, draw: { sx, sy, sw, sh, dx: 0, dy: 0, dw: tw, dh: th, crop: "center" } };
    }

    // stretch: 比率を維持せず、対象領域いっぱいに引き伸ばします。
    ctx.drawImage(image, 0, 0, iw, ih, 0, 0, tw, th);
    return { mode: "stretch", source: { width: iw, height: ih }, target: { width: tw, height: th }, draw: { sx: 0, sy: 0, sw: iw, sh: ih, dx: 0, dy: 0, dw: tw, dh: th } };
  }

  function applyImageLayerPreview(el, definition, src, altText) {
    const mode = normalizedDisplayMode(definition?.mode);
    el.dataset.displayMode = mode;
    const target = imageLayerTargetSize(el);
    el.title = `${altText || "画像"} / ${mode} / ${target.width}×${target.height}`;
    if (!src) return false;

    // object-fit はローカルfile:読込時や既存CSSの競合で cover/contain が同じ見た目に
    // なるケースがあったため、ツール側はCanvasでMZと同じ計算式をそのまま描画します。
    const canvas = document.createElement("canvas");
    canvas.className = "ui-image-layer-canvas";
    const image = new Image();
    image.decoding = "async";
    image.addEventListener("load", () => {
      try {
        const plan = drawImageLayerCanvas(canvas, image, mode, target.width, target.height);
        canvas.dataset.drawPlan = JSON.stringify(plan);
      } catch (error) {
        el.classList.add("missing");
        el.textContent = `${altText || "画像"}を描画できません`;
        debugLog("ERROR", "画像レイヤープレビューのCanvas描画に失敗しました。", {
          folder: definition?.folder || "",
          fileName: definition?.fileName || "",
          mode,
          error: String(error?.message || error)
        });
      }
    }, { once: true });
    image.addEventListener("error", () => {
      el.classList.add("missing");
      el.textContent = `${altText || "画像"}を読み込めません`;
      debugLog("WARN", "画像レイヤープレビューの読み込みに失敗しました。", {
        folder: definition?.folder || "",
        fileName: definition?.fileName || "",
        mode
      });
    }, { once: true });
    image.src = src;
    el.appendChild(canvas);

    // ブラウザキャッシュ済みの画像ではload済みの場合があるため、保険として即時描画します。
    if (image.complete && image.naturalWidth > 0) {
      try {
        const plan = drawImageLayerCanvas(canvas, image, mode, target.width, target.height);
        canvas.dataset.drawPlan = JSON.stringify(plan);
      } catch (_) {
        // loadイベント側でエラー表示します。
      }
    }
    return true;
  }

  function renderWindowBackgroundImage(win, metrics) {
    const bg = normalizeWindowBackgroundImage(win.backgroundImage);
    if (!bg.enabled || !bg.fileName) return null;
    const m = metrics || windowLayerMetrics(win);
    const projectImage = findProjectImage(bg);
    const src = bg.previewSrc || projectImage?.url || "";
    const mode = normalizedDisplayMode(bg.mode);
    const el = document.createElement("div");
    el.className = `ui-window-bg-image mode-${mode}`;
    setLayerPartRect(el, m.contentOffsetX, m.contentOffsetY, m.contentWidth, m.contentHeight);
    el.style.opacity = String(clamp((bg.opacity ?? 255) / 255, 0, 1));
    if (!applyImageLayerPreview(el, Object.assign({}, bg, { mode }), src, bg.fileName || "background")) {
      el.textContent = bg.fileName ? `背景画像\n${bg.folder || "pictures"}/${bg.fileName}` : "背景画像";
      el.classList.add("missing");
    }
    return el;
  }

  function renderWindowDecorationImage(win, metrics) {
    const deco = normalizeWindowDecorationImage(win.decorationImage);
    if (!deco.enabled || !deco.fileName) return null;
    const m = metrics || windowLayerMetrics(win);
    const projectImage = findProjectImage(deco);
    const src = deco.previewSrc || projectImage?.url || "";
    const mode = normalizedDisplayMode(deco.mode);
    const el = document.createElement("div");
    el.className = `ui-window-decoration-image mode-${mode}`;
    // 装飾画像はウィンドウ全体を基準に描画する。
    // 配置可能範囲を拡張している場合でも、layer座標上のウィンドウ本体位置へ合わせる。
    setLayerPartRect(el, m.windowOffsetX, m.windowOffsetY, Number(win.width || 1), Number(win.height || 1));
    el.style.opacity = String(clamp((deco.opacity ?? 255) / 255, 0, 1));
    if (!applyImageLayerPreview(el, Object.assign({}, deco, { mode }), src, deco.fileName || "decoration")) {
      el.textContent = deco.fileName ? `装飾画像\n${deco.folder || "system"}/${deco.fileName}` : "装飾画像";
      el.classList.add("missing");
    }
    return el;
  }

  function renderItemLayerPart(win, item, metrics) {
    metrics = metrics || windowLayerMetrics(win);
    const scrollY = previewWindowScrollY(win, metrics);
    if (item.allowOutsideWindow === true) {
      return renderItem(win, item, metrics.itemOffsetX, metrics.itemOffsetY - scrollY);
    }
    const clip = document.createElement("div");
    clip.className = "ui-item-clip-wrapper";
    setLayerPartRect(clip, metrics.windowOffsetX, metrics.windowOffsetY, Number(win.width || 1), Number(win.height || 1));
    clip.style.zIndex = cssLayerZ(zOrderValue(item));
    const child = renderItem(win, item, metrics.itemOffsetX - metrics.windowOffsetX, metrics.itemOffsetY - metrics.windowOffsetY - scrollY);
    clip.appendChild(child);
    return clip;
  }

  function renderItem(win, item, offsetX = 0, offsetY = 0) {
    const el = document.createElement("div");
    el.className = `ui-item ui-${item.type || "text"}`;
    if (selected?.kind === "item" && selected.windowId === win.id && selected.itemId === item.id) {
      el.classList.add("selected");
    }
    el.style.left = `${offsetX + (Number(item.x) || 0)}px`;
    el.style.top = `${offsetY + (Number(item.y) || 0)}px`;
    el.style.zIndex = cssLayerZ(zOrderValue(item));
    el.dataset.windowId = win.id;
    el.dataset.itemId = item.id;

    if (item.type === "text") {
      const dbText = previewDatabaseTextValue(item);
      const previewText = dbText != null ? dbText : (item.text || "");
      setPreviewRichText(el, previewText, win, item, previewDefaultFontSize());
      applyPreviewTextStyle(el, win, item, previewDefaultFontSize());
      el.style.transform = `translateY(${previewTextYOffset()}px)`;
      if (item.width > 0) {
        el.style.width = `${item.width}px`;
        el.style.textAlign = item.align || "left";
      }
    } else if (item.type === "log") {
      const w = Math.max(1, Number(item.width || 320));
      const h = Math.max(1, Number(item.height || 120));
      const lh = Math.max(1, Number(item.lineHeight || 28));
      const px = Math.max(0, Number(item.paddingX || 4));
      const py = Math.max(0, Number(item.paddingY || 4));
      el.style.width = `${w}px`;
      el.style.height = `${h}px`;
      el.style.overflow = "hidden";
      applyPreviewTextStyle(el, win, item, Number(item.fontSize || 20));
      el.style.lineHeight = `${lh}px`;
      const sample = String(item.sampleText || "ログを追加しました。").split(/\r?\n/).filter(Boolean);
      const lines = sample.length ? sample : ["ログを追加しました。"];
      const maxRows = Math.max(1, Math.floor((h - py * 2) / lh));
      const shown = lines.slice(-Math.min(maxRows, Math.max(1, Number(item.maxLines || 8))));
      const startY = Math.max(py, h - py - shown.length * lh);
      shown.forEach((line, index) => {
        const row = document.createElement("div");
        row.textContent = line;
        row.style.position = "absolute";
        row.style.left = `${px}px`;
        row.style.top = `${startY + index * lh}px`;
        row.style.width = `${Math.max(1, w - px * 2)}px`;
        row.style.whiteSpace = "nowrap";
        row.style.overflow = "hidden";
        row.style.textOverflow = "ellipsis";
        applyPreviewTextStyle(row, win, item, Number(item.fontSize || 20));
        row.style.lineHeight = `${lh}px`;
        el.appendChild(row);
      });
    } else if (item.type === "gauge") {
      const gaugeWidth = Math.max(1, Number(item.width || 220));
      const gaugeHeight = Math.max(1, Number(item.height || 14));
      el.style.width = `${gaugeWidth}px`;
      el.style.height = `${gaugeHeight}px`;
      const values = previewGaugeValues(item);
      const rate = clamp(values.value / Math.max(1, values.max), 0, 1);
      const gaugeShape = String(item.gaugeShape || item.gaugeType || "horizontal");
      const gaugeDirection = String(item.gaugeDirection || (gaugeShape === "vertical" ? "bottomToTop" : "leftToRight"));
      const gaugeStartAngle = ((Number(item.gaugeStartAngle ?? 0) % 360) + 360) % 360;
      const cssStartDeg = gaugeStartAngle;
      el.dataset.gaugeShape = gaugeShape;
      el.dataset.gaugeDirection = gaugeDirection;

      const addGaugeImage = (layer, className, clipRate = null) => {
        const def = layer || {};
        if (!def.enabled || !def.fileName) return null;
        const asset = findProjectImage(def);
        const src = def.previewSrc || asset?.url || "";
        if (!src) return null;
        const holder = document.createElement("div");
        holder.className = className;
        holder.style.opacity = String(clamp(Number(def.opacity ?? 255) / 255, 0, 1));
        holder.style.overflow = clipRate !== null ? "hidden" : "visible";
        if (gaugeShape === "circle") {
          holder.style.width = "100%";
          holder.style.height = "100%";
        }
        if (clipRate !== null) {
          const rate = clamp(Number(clipRate || 0), 0, 1);
          const pct = `${rate * 100}%`;
          if (gaugeShape === "vertical") {
            holder.style.height = pct;
            holder.style.width = "100%";
            holder.style.top = gaugeDirection === "topToBottom" ? "0" : "auto";
            holder.style.bottom = gaugeDirection === "topToBottom" ? "auto" : "0";
          } else if (gaugeShape === "circle") {
            const deg = clamp(rate * 360, 0, 360);
            if (gaugeDirection === "counterClockwise") {
              const start = Math.max(0, 360 - deg);
              holder.style.maskImage = `conic-gradient(from ${cssStartDeg}deg, transparent 0deg ${start}deg, #000 ${start}deg 360deg)`;
              holder.style.webkitMaskImage = holder.style.maskImage;
            } else {
              holder.style.maskImage = `conic-gradient(from ${cssStartDeg}deg, #000 0deg ${deg}deg, transparent ${deg}deg 360deg)`;
              holder.style.webkitMaskImage = holder.style.maskImage;
            }
          } else {
            holder.style.width = pct;
            holder.style.height = "100%";
            holder.style.left = gaugeDirection === "rightToLeft" ? "auto" : "0";
            holder.style.right = gaugeDirection === "rightToLeft" ? "0" : "auto";
          }
        }
        const img = document.createElement("img");
        img.src = src;
        img.alt = def.fileName || "gauge";
        img.draggable = false;
        img.style.width = `${gaugeWidth}px`;
        img.style.height = `${gaugeHeight}px`;
        img.style.objectFit = def.mode === "contain" ? "contain" : def.mode === "cover" ? "cover" : "fill";
        if (clipRate !== null) {
          img.style.position = "absolute";
          if (gaugeShape === "vertical") img.style[gaugeDirection === "topToBottom" ? "top" : "bottom"] = "0";
          else img.style[gaugeDirection === "rightToLeft" ? "right" : "left"] = "0";
        }
        holder.appendChild(img);
        el.appendChild(holder);
        return holder;
      };

      const backLayer = ensureGaugeImageLayer(item, "gaugeBackImage", "back");
      const fillLayer = ensureGaugeImageLayer(item, "gaugeFillImage", "fill");
      const frontLayer = ensureGaugeImageLayer(item, "gaugeFrontImage", "front");

      const backDrawn = addGaugeImage(backLayer, "ui-gauge-image ui-gauge-back-image");
      if (!backDrawn) {
        el.style.background = gaugeShape === "circle" ? `radial-gradient(circle at center, rgba(0,0,0,.72) 58%, transparent 59%), conic-gradient(rgba(0,0,0,.58) 0 100%)` : "rgba(0,0,0,.58)";
      } else {
        el.style.background = "transparent";
      }

      const imageFillDrawn = addGaugeImage(fillLayer, "ui-gauge-image ui-gauge-fill-image", rate);
      if (!imageFillDrawn) {
        const fill = document.createElement("div");
        fill.className = "ui-gauge-fill";
        if (gaugeShape === "vertical") {
          fill.style.width = "100%";
          fill.style.height = `${rate * 100}%`;
          fill.style.top = gaugeDirection === "topToBottom" ? "0" : "auto";
          fill.style.bottom = gaugeDirection === "topToBottom" ? "auto" : "0";
          fill.style.background = `linear-gradient(0deg, ${item.color1 || "#ff6060"}, ${item.color2 || "#ffa0a0"})`;
        } else if (gaugeShape === "circle") {
          const deg = clamp(rate * 360, 0, 360);
          const color1 = item.color1 || "#ff6060";
          const color2 = item.color2 || "#ffa0a0";
          const isCounterClockwise = gaugeDirection === "counterClockwise";
          fill.style.inset = "0";
          fill.style.width = "100%";
          fill.style.height = "100%";
          fill.style.borderRadius = "50%";
          if (isCounterClockwise) {
            const start = Math.max(0, 360 - deg);
            fill.style.background = `radial-gradient(circle at center, rgba(0,0,0,.72) 58%, transparent 59%), conic-gradient(from ${cssStartDeg}deg, transparent 0deg ${start}deg, ${color1} ${start}deg, ${color2} 360deg)`;
          } else {
            fill.style.background = `radial-gradient(circle at center, rgba(0,0,0,.72) 58%, transparent 59%), conic-gradient(from ${cssStartDeg}deg, ${color1} 0deg, ${color2} ${deg}deg, transparent ${deg}deg 360deg)`;
          }
        } else {
          fill.style.width = `${rate * 100}%`;
          fill.style.height = "100%";
          fill.style.left = gaugeDirection === "rightToLeft" ? "auto" : "0";
          fill.style.right = gaugeDirection === "rightToLeft" ? "0" : "auto";
          fill.style.background = `linear-gradient(90deg, ${item.color1 || "#ff6060"}, ${item.color2 || "#ffa0a0"})`;
        }
        el.appendChild(fill);
      }

      addGaugeImage(frontLayer, "ui-gauge-image ui-gauge-front-image");

      if (item.label) {
        const label = document.createElement("div");
        label.className = "ui-gauge-label";
        setPreviewRichText(label, `${item.label || ""} ${values.value}/${values.max}`, win, item, 18);
        applyPreviewTextStyle(label, win, item, 18);
        label.style.transform = `translateY(${previewTextYOffset()}px)`;
        el.appendChild(label);
      }
    } else if (item.type === "choiceList") {
      el.classList.add("ui-choice-list-preview");
      const rows = choiceListPreviewEntries(item);
      const rowHeight = Math.max(1, Number(item.rowHeight || 32));
      const visibleRows = choiceListPreviewRowsForWindow(item, win);
      const gap = choiceListGap(item);
      const integratedScroll = win?.scrollEnabled === true;
      el.style.width = `${item.width || 240}px`;
      el.style.height = `${choiceListPreviewHeightForWindow(item, win)}px`;
      el.style.overflowY = integratedScroll ? "hidden" : rows.length > visibleRows ? "scroll" : "hidden";
      el.style.setProperty("--choice-row-height", `${rowHeight}px`);
      el.style.setProperty("--choice-gap", `${gap}px`);
      for (let i = 0; i < rows.length; i++) {
        const entry = rows[i];
        const originalIndex = entry.index;
        const row = document.createElement("div");
        row.className = "ui-choice-row-preview";
        row.style.height = `${rowHeight}px`;
        row.style.lineHeight = `${rowHeight}px`;
        row.style.marginBottom = i < rows.length - 1 ? `${gap}px` : "0";
        const enabled = entry.state === "enabled";
        row.classList.toggle("disabled", !enabled);
        row.style.cursor = enabled ? "pointer" : "not-allowed";
        row.style.color = !enabled && (item.disabledTextColor || "") ? item.disabledTextColor : "";
        row.style.background = !enabled
          ? (item.disabledBackColor || "rgba(0,0,0,.28)")
          : Number(item.previewSelectedIndex ?? -1) === originalIndex
            ? (item.selectedBackColor || "rgba(98,169,255,.35)")
            : (item.normalBackColor || "rgba(255,255,255,.10)");
        row.style.borderColor = item.borderColor || "rgba(255,255,255,.35)";
        row.style.textAlign = item.align || "center";
        setPreviewRichText(row, entry.text, win, item, item.fontSize || 18);
        applyPreviewTextStyle(row, win, item, item.fontSize || 18);
        row.addEventListener("mouseenter", () => {
          if (!enabled) {
            row.style.background = item.disabledBackColor || "rgba(0,0,0,.28)";
            return;
          }
          row.style.background = Number(item.previewSelectedIndex ?? -1) === originalIndex
            ? (item.selectedBackColor || "rgba(98,169,255,.35)")
            : (item.hoverBackColor || "rgba(255,255,255,.22)");
        });
        row.addEventListener("mouseleave", () => {
          if (!enabled) {
            row.style.background = item.disabledBackColor || "rgba(0,0,0,.28)";
            return;
          }
          row.style.background = Number(item.previewSelectedIndex ?? -1) === originalIndex
            ? (item.selectedBackColor || "rgba(98,169,255,.35)")
            : (item.normalBackColor || "rgba(255,255,255,.10)");
        });
        row.addEventListener("pointerdown", () => {
          if (!enabled) return;
          row.style.background = item.pressedBackColor || item.clickBackColor || item.selectedBackColor || "rgba(255,220,120,.45)";
        });
        row.addEventListener("click", () => {
          if (!enabled) return;
          item.previewSelectedIndex = originalIndex;
          render();
        });
        el.appendChild(row);
      }
    } else if (item.type === "imageChoiceList") {
      el.classList.add("ui-image-choice-list-preview");
      const bounds = itemPreviewBounds(item);
      el.style.width = `${bounds.width}px`;
      el.style.height = `${bounds.height}px`;
      const opts = imageChoiceOptions(item);
      opts.forEach((opt, index) => {
        const state = imageChoiceStateForPreview(opt);
        if (state === "hidden") return;
        const enabled = state === "enabled";
        const node = document.createElement("div");
        node.className = "ui-image-choice-option";
        node.classList.toggle("disabled", !enabled);
        node.style.left = `${Number(opt.x || 0)}px`;
        node.style.top = `${Number(opt.y || 0)}px`;
        node.style.width = `${Math.max(1, Number(opt.width || 160))}px`;
        node.style.height = `${Math.max(1, Number(opt.height || 44))}px`;
        node.style.opacity = String(clamp((enabled ? 255 : 190) / 255, 0, 1));
        const imageDef = (enabled ? opt.enabledImage : opt.disabledImage) || opt.enabledImage || {};
        const asset = findProjectImage(imageDef);
        const src = imageDef.previewSrc || asset?.url || "";
        if (src) {
          const img = document.createElement("img");
          img.src = src;
          img.draggable = false;
          img.style.width = "100%";
          img.style.height = "100%";
          img.style.objectFit = imageDef.mode === "contain" ? "contain" : imageDef.mode === "cover" ? "cover" : "fill";
          node.appendChild(img);
        } else {
          node.textContent = opt.text || `選択肢${index + 1}`;
        }
        node.addEventListener("mouseenter", () => {
          if (!enabled) return;
          const hover = opt.hoverImage && opt.hoverImage.fileName ? opt.hoverImage : imageDef;
          const asset2 = findProjectImage(hover);
          const src2 = hover.previewSrc || asset2?.url || src;
          const img = node.querySelector("img");
          if (img && src2) img.src = src2;
          node.style.transform = `scale(${Number(opt.hoverScalePercent || 105) / 100})`;
          node.style.opacity = String(clamp(Number(opt.hoverOpacity ?? 255) / 255, 0, 1));
        });
        node.addEventListener("mouseleave", () => {
          const img = node.querySelector("img");
          if (img && src) img.src = src;
          node.style.transform = "";
          node.style.opacity = String(clamp((enabled ? 255 : 190) / 255, 0, 1));
        });
        node.addEventListener("pointerdown", () => {
          if (!enabled) return;
          const press = opt.pressImage && opt.pressImage.fileName ? opt.pressImage : (opt.hoverImage && opt.hoverImage.fileName ? opt.hoverImage : imageDef);
          const asset3 = findProjectImage(press);
          const src3 = press.previewSrc || asset3?.url || src;
          const img = node.querySelector("img");
          if (img && src3) img.src = src3;
          node.style.transform = `scale(${Number(opt.pressScalePercent || 96) / 100})`;
          node.style.opacity = String(clamp(Number(opt.pressOpacity ?? 230) / 255, 0, 1));
        });
        el.appendChild(node);
      });
    } else if (item.type === "compositeImage") {
      el.classList.add("ui-image-preview", "ui-composite-image-preview");
      const bounds = compositeImageBounds(item);
      const scaleX = imageScaleRate(item, "scaleX");
      const scaleY = imageScaleRate(item, "scaleY");
      el.style.width = `${Math.max(1, Math.round(bounds.width * scaleX))}px`;
      el.style.height = `${Math.max(1, Math.round(bounds.height * scaleY))}px`;
      el.style.opacity = String(clamp((item.opacity ?? 255) / 255, 0, 1));
      let drawn = false;
      const compositeLayers = ensureCompositeImageLayers(item);
      for (const layer of compositeLayers) {
        if (layer.visible === false) continue;
        const layerNode = document.createElement("div");
        layerNode.className = "ui-composite-image-layer";
        layerNode.style.left = `${Math.round(Number(layer.x || 0) * scaleX)}px`;
        layerNode.style.top = `${Math.round(Number(layer.y || 0) * scaleY)}px`;
        layerNode.style.width = `${Math.max(1, Math.round(Number(layer.width || layer.previewNaturalWidth || 96) * scaleX))}px`;
        layerNode.style.height = `${Math.max(1, Math.round(Number(layer.height || layer.previewNaturalHeight || 64) * scaleY))}px`;
        layerNode.style.opacity = String(clamp((layer.opacity ?? 255) / 255, 0, 1));
        layerNode.style.zIndex = String(Number(layer.priority || 0));
        layerNode.style.mixBlendMode = String(layer.blendMode || "normal");
        const projectImage = findProjectImage(layer);
        const src = layer.previewSrc || projectImage?.url || "";
        if (src) {
          const img = document.createElement("img");
          img.src = src;
          img.alt = layer.fileName || layer.name || "layer";
          img.draggable = false;
          layerNode.appendChild(img);
          drawn = true;
        } else {
          layerNode.classList.add("no-image");
          layerNode.textContent = layer.name || layer.id || "layer";
        }
        el.appendChild(layerNode);
      }
      if (drawn) el.classList.add("has-image");
      else {
        el.classList.add("no-image");
        if (!el.textContent) el.textContent = "統合画像";
      }
    } else if (item.type === "button") {
      const visualMode = String(item.buttonVisualMode || "normal");
      el.classList.add("ui-button-preview");
      if (visualMode !== "normal") el.classList.add("ui-button-image-preview");
      el.style.width = `${item.width || 120}px`;
      el.style.height = `${item.height || 36}px`;
      if (visualMode !== "normal") {
        const img = document.createElement("img");
        img.className = "button-preview-image";
        img.draggable = false;
        el.appendChild(img);
        const label = document.createElement("span");
        label.className = "button-preview-label";
        label.textContent = item.text || "";
        if (item.text) el.appendChild(label);
        else el.appendChild(Object.assign(document.createElement("span"), { className: "button-preview-empty", textContent: visualMode === "psd" ? "PSDボタン" : "画像ボタン" }));
      } else {
        setPreviewRichText(el, item.text || "Button", win, item, 18);
      }
      applyPreviewTextStyle(el, win, item, 18);
      let previewButtonPressed = false;
      applyButtonPreviewState(el, item, "mouseOff");
      el.addEventListener("mouseenter", () => {
        if (!previewButtonPressed) applyButtonPreviewState(el, item, "mouseOn");
      });
      el.addEventListener("mouseleave", () => {
        previewButtonPressed = false;
        applyButtonPreviewState(el, item, "mouseOff");
      });
      el.addEventListener("pointerdown", () => {
        previewButtonPressed = true;
        applyButtonPreviewState(el, item, "press");
      });
      el.addEventListener("pointerup", () => {
        previewButtonPressed = false;
        applyButtonPreviewState(el, item, "release");
        setTimeout(() => {
          if (el.matches(":hover")) applyButtonPreviewState(el, item, "mouseOn");
          else applyButtonPreviewState(el, item, "mouseOff");
        }, 120);
      });
    } else if (item.type === "image") {
      el.classList.add("ui-image-preview");
      const baseW = imageBaseWidth(item);
      const baseH = imageBaseHeight(item);
      const scaleX = imageScaleRate(item, "scaleX");
      const scaleY = imageScaleRate(item, "scaleY");
      el.style.width = `${Math.max(1, Math.round(baseW * scaleX))}px`;
      el.style.height = `${Math.max(1, Math.round(baseH * scaleY))}px`;
      el.style.opacity = String(clamp((item.opacity ?? 255) / 255, 0, 1));
      const projectImage = findProjectImage(item);
      const src = item.previewSrc || projectImage?.url || "";
      if (src) {
        el.classList.add("has-image");
        const img = document.createElement("img");
        img.src = src;
        img.alt = item.fileName || "image";
        img.draggable = false;
        el.appendChild(img);
      } else {
        el.classList.add("no-image");
        el.textContent = item.fileName ? `image\n${item.fileName}` : "image";
      }
    }

    el.addEventListener("pointerdown", ev => {
      ev.stopPropagation();
      const itemKey = `item:${win.id}/${item.id}`;
      const isInlineEditable = item.type === "text" || item.type === "log";
      if (isInlineEditable && consumePreviewInlineEditDoubleClick(ev, itemKey)) {
        ev.preventDefault();
        selectItem(win.id, item.id, { revealInList: false });
        beginPreviewInlineTextEdit(win, item, el);
        return;
      }
      pendingPreviewClick = { kind: "item", windowId: win.id, itemId: item.id, pointerId: ev.pointerId };

      let dragWindowId = win.id;
      let dragItemId = item.id;
      // クリック位置に現在フォーカス中パーツが重なっている場合は、
      // 最前面要素よりもフォーカス中パーツのドラッグを優先します。
      if (selected?.kind === "item" && !globalPartPositionLocked) {
        const selectedKey = `item:${selected.windowId || ""}/${selected.itemId || ""}`;
        const hits = hitInsideCandidatesAtPoint(ev.clientX, ev.clientY);
        const selectedHit = hits.find(candidate => candidateKey(candidate) === selectedKey);
        if (selectedHit?.kind === "item") {
          dragWindowId = selectedHit.windowId;
          dragItemId = selectedHit.itemId;
        }
      }
      const dragWin = state.windows.find(w => w.id === dragWindowId);
      const dragItem = dragWin?.items?.find(i => i.id === dragItemId);
      if (!dragWin || !dragItem) return;
      const reason = positionLockReason(dragWin, dragItem);
      if (reason) { showToast(reason); return; }
      drag = { type: "moveItem", windowId: dragWindowId, itemId: dragItemId, startX: ev.clientX, startY: ev.clientY, baseX: dragItem.x || 0, baseY: dragItem.y || 0, started: false, historySnapshot: createHistorySnapshot(), historyLabel: "パーツ移動" };
      safeSetPointerCapture(el, ev.pointerId);
    });
    return el;
  }

  function normalizeGroupId(value) {
    return safeId(value, "").replace(/[^\w\-:.]/g, "_");
  }

  function ensureGroups() {
    if (!Array.isArray(state.groups)) state.groups = [];
    const byId = new Map();
    state.groups = state.groups.map((group, index) => {
      const id = normalizeGroupId(group?.id || `group${index + 1}`) || `group${index + 1}`;
      const normalized = Object.assign({}, group || {}, {
        id,
        name: String(group?.name || id),
        visible: group?.visible !== false,
        locked: group?.locked === true
      });
      if (byId.has(id)) {
        let n = 2;
        let nextId = `${id}_${n}`;
        while (byId.has(nextId)) nextId = `${id}_${++n}`;
        normalized.id = nextId;
      }
      byId.set(normalized.id, normalized);
      return normalized;
    });

    // v0.3.89: 未グループを廃止。ウィンドウは必ず何らかのグループへ所属させます。
    const windows = Array.isArray(state.windows) ? state.windows : [];
    if (!state.groups.length && windows.length) {
      const group = { id: "main_group", name: "メイングループ", visible: true, locked: false };
      state.groups.push(group);
      byId.set(group.id, group);
    }
    const fallbackGroupId = state.groups[0]?.id || "";
    for (const win of windows) {
      const groupId = normalizeGroupId(win.groupId || "");
      if (groupId && !byId.has(groupId)) {
        const group = { id: groupId, name: groupId, visible: true, locked: false };
        state.groups.push(group);
        byId.set(groupId, group);
        win.groupId = groupId;
      } else {
        win.groupId = groupId || fallbackGroupId;
      }
    }
    return state.groups;
  }

  function normalizeGroupsForExport() {
    return ensureGroups().map(group => ({
      id: group.id,
      name: group.name || group.id,
      visible: group.visible !== false,
      locked: group.locked === true
    }));
  }

  function normalizeSceneId(value) {
    return safeId(value, "").replace(/[^\w\-:.]/g, "_");
  }

  function ensureScenes() {
    if (!Array.isArray(state.scenes)) state.scenes = [];
    ensureGroups();
    const groups = state.groups || [];
    const groupIds = new Set(groups.map(group => group.id));
    const byId = new Map();
    state.scenes = state.scenes.map((scene, index) => {
      const id = normalizeSceneId(scene?.id || `scene${index + 1}`) || `scene${index + 1}`;
      const normalized = Object.assign({}, scene || {}, {
        id,
        name: String(scene?.name || id),
        groupIds: Array.isArray(scene?.groupIds)
          ? Array.from(new Set(scene.groupIds.map(normalizeGroupId).filter(groupId => groupIds.has(groupId))))
          : [],
        includeUngrouped: false
      });
      if (byId.has(normalized.id)) {
        let n = 2;
        let nextId = `${normalized.id}_${n}`;
        while (byId.has(nextId)) nextId = `${normalized.id}_${++n}`;
        normalized.id = nextId;
      }
      byId.set(normalized.id, normalized);
      return normalized;
    });

    // v0.3.89: 全シーン管理を廃止。必ずアクティブなシーンを持ちます。
    if (!state.scenes.length) {
      const scene = {
        id: "main_scene",
        name: "メインシーン",
        groupIds: groups.map(group => group.id),
        includeUngrouped: false
      };
      state.scenes.push(scene);
      byId.set(scene.id, scene);
    }

    state.activeSceneId = normalizeSceneId(state.activeSceneId || "");
    if (!state.activeSceneId || !byId.has(state.activeSceneId)) state.activeSceneId = state.scenes[0]?.id || "";

    const active = state.scenes.find(scene => scene.id === state.activeSceneId) || state.scenes[0];
    const assigned = new Set();
    for (const scene of state.scenes) {
      scene.includeUngrouped = false;
      scene.groupIds = Array.isArray(scene.groupIds)
        ? Array.from(new Set(scene.groupIds.map(normalizeGroupId).filter(groupId => groupIds.has(groupId))))
        : [];
      for (const groupId of scene.groupIds) assigned.add(groupId);
    }
    if (active) {
      active.groupIds = Array.isArray(active.groupIds) ? active.groupIds : [];
      for (const group of groups) {
        if (!assigned.has(group.id)) {
          active.groupIds.push(group.id);
          assigned.add(group.id);
        }
      }
      active.groupIds = Array.from(new Set(active.groupIds));
    }
    return state.scenes;
  }

  function normalizeScenesForExport() {
    return ensureScenes().map(scene => ({
      id: scene.id,
      name: scene.name || scene.id,
      groupIds: Array.isArray(scene.groupIds) ? scene.groupIds.slice() : [],
      includeUngrouped: false
    }));
  }

  function sceneById(sceneId) {
    const id = normalizeSceneId(sceneId || "");
    if (!id) return null;
    return ensureScenes().find(scene => scene.id === id) || null;
  }

  function activeScene() {
    return sceneById(state.activeSceneId || "");
  }

  function sceneName(sceneId) {
    const scene = sceneById(sceneId);
    return scene ? (scene.name || scene.id) : "";
  }

  function sceneOptions() {
    return ensureScenes().map(scene => ({ value: scene.id, label: `${scene.name || scene.id} (${scene.id})` }));
  }

  function nextSceneId(base = "scene") {
    const safeBase = normalizeSceneId(base) || "scene";
    const used = new Set(ensureScenes().map(scene => scene.id));
    let index = 1;
    let id = `${safeBase}${index}`;
    while (used.has(id)) id = `${safeBase}${++index}`;
    return id;
  }

  function createSceneObject(name = "新規シーン") {
    const id = nextSceneId("scene");
    ensureScenes().push({
      id,
      name,
      // シーンは「グループの集まり」として扱うため、新規シーンには既存グループを自動混入させません。
      // 必要なものだけをコピー／移動で追加できるよう、データ構造は groupIds のまま保持します。
      groupIds: [],
      includeUngrouped: false
    });
    state.activeSceneId = id;
    return id;
  }

  function sceneIncludesGroup(scene, groupId) {
    const id = normalizeGroupId(groupId || "");
    if (!scene || !id) return false;
    return Array.isArray(scene.groupIds) && scene.groupIds.includes(id);
  }

  function windowInActiveScene(win) {
    const scene = activeScene();
    if (!scene) return false;
    return sceneIncludesGroup(scene, win?.groupId || "");
  }

  function addGroupIdToScene(scene, groupId) {
    const id = normalizeGroupId(groupId || "");
    if (!scene || !id || !groupById(id)) return "";
    scene.groupIds = Array.isArray(scene.groupIds) ? scene.groupIds : [];
    if (!scene.groupIds.includes(id)) scene.groupIds.push(id);
    return id;
  }

  function addGroupIdToActiveScene(groupId) {
    return addGroupIdToScene(activeScene(), groupId);
  }

  function sceneForContextTarget(target = null) {
    if (target?.kind === "scene") return sceneById(target.sceneId || "");
    return activeScene();
  }

  function sceneIdForContextTarget(target = null) {
    const id = target?.kind === "scene"
      ? normalizeSceneId(target.sceneId || "")
      : normalizeSceneId(state.activeSceneId || "");
    return id && sceneById(id) ? id : "";
  }

  function attachGroupIdToSceneId(sceneId, groupId) {
    const sid = normalizeSceneId(sceneId || "");
    const gid = normalizeGroupId(groupId || "");
    if (!sid || !gid) return null;
    ensureScenes();
    const scene = (state.scenes || []).find(entry => entry.id === sid) || null;
    if (!scene) return null;
    scene.groupIds = Array.isArray(scene.groupIds) ? scene.groupIds : [];
    if (!scene.groupIds.includes(gid)) scene.groupIds.push(gid);
    return scene;
  }

  function resolveGroupForWindowPasteTarget(target = null, preferredGroupId = "") {
    const targetGroupId = target?.kind === "group" ? normalizeGroupId(target.groupId || "") : "";
    const targetScene = sceneForContextTarget(target);
    if (targetGroupId && groupById(targetGroupId)) {
      if (targetScene) addGroupIdToScene(targetScene, targetGroupId);
      return targetGroupId;
    }

    const preferred = normalizeGroupId(preferredGroupId || "");
    if (!targetScene) return preferred && groupById(preferred) ? preferred : "";

    // 別シーンへ単体ウィンドウを貼るとき、コピー元グループをそのまま含めると
    // そのグループ配下の既存ウィンドウまで表示されてしまうため、
    // 既に貼り付け先シーンに含まれているグループだけを再利用します。
    if (preferred && groupById(preferred) && sceneIncludesGroup(targetScene, preferred)) return preferred;

    const firstSceneGroupId = (Array.isArray(targetScene.groupIds) ? targetScene.groupIds : []).find(groupId => groupById(groupId));
    if (firstSceneGroupId) return firstSceneGroupId;

    const sourceGroup = preferred ? groupById(preferred) : null;
    const nameBase = sourceGroup ? `${sourceGroup.name || sourceGroup.id} コピー` : "貼り付けグループ";
    const newGroupId = createGroupObject(uniqueDisplayName(nameBase, ensureGroups()));
    addGroupIdToScene(targetScene, newGroupId);
    return newGroupId;
  }

  function firstWindowInActiveScene() {
    return (state.windows || []).find(win => windowInActiveScene(win)) || null;
  }

  function firstWindowInGroup(groupId) {
    const id = normalizeGroupId(groupId || "");
    if (!id) return null;
    return (state.windows || []).find(win => normalizeGroupId(win.groupId || "") === id && windowInActiveScene(win)) || null;
  }

  function resolveGroupForNewWindow(preferredGroupId = "", options = {}) {
    const scene = activeScene();
    const preferred = normalizeGroupId(preferredGroupId || "");
    if (!scene) return preferred;

    if (preferred && groupById(preferred) && sceneIncludesGroup(scene, preferred)) return preferred;
    if (options.attachPreferred === true && preferred && groupById(preferred)) return addGroupIdToScene(scene, preferred);

    if (selected?.kind === "group" && sceneIncludesGroup(scene, selected.groupId || "")) {
      return normalizeGroupId(selected.groupId || "");
    }

    const win = selectedWindow();
    const selectedGroupId = normalizeGroupId(win?.groupId || "");
    if (selectedGroupId && groupById(selectedGroupId) && sceneIncludesGroup(scene, selectedGroupId)) return selectedGroupId;

    const firstSceneGroupId = (Array.isArray(scene.groupIds) ? scene.groupIds : []).find(groupId => groupById(groupId));
    if (firstSceneGroupId) return firstSceneGroupId;

    const newGroupId = createGroupObject(uniqueDisplayName("新規グループ", ensureGroups()));
    addGroupIdToScene(scene, newGroupId);
    return newGroupId;
  }

  function selectionBelongsToActiveScene() {
    if (!selected) return true;
    const scene = activeScene();
    if (!scene) return true;
    if (selected.kind === "scene") return true;
    if (selected.kind === "group") return sceneIncludesGroup(scene, selected.groupId || "");
    if (selected.kind === "window" || selected.kind === "item") {
      const win = state.windows.find(entry => entry.id === selected.windowId);
      return !!win && windowInActiveScene(win);
    }
    return true;
  }

  function clearSelectionIfOutsideActiveScene() {
    if (!selectionBelongsToActiveScene()) selected = null;
  }

  function toggleGroupInActiveScene(groupId) {
    const scene = activeScene();
    if (!scene) {
      showToast("シーンを選択してから、含めるグループを切り替えてください");
      return;
    }
    const id = normalizeGroupId(groupId || "");
    runStateMutation("シーン内グループ切替", () => {
      scene.groupIds = Array.isArray(scene.groupIds) ? scene.groupIds : [];
      const index = scene.groupIds.indexOf(id);
      if (index >= 0) scene.groupIds.splice(index, 1);
      else if (id) scene.groupIds.push(id);
    });
  }

  function setGroupSceneMembership(groupId, sceneId, include) {
    const gid = normalizeGroupId(groupId || "");
    const sid = normalizeSceneId(sceneId || "");
    const group = groupById(gid);
    const scene = sceneById(sid);
    if (!gid || !sid || !group || !scene) {
      showToast("対象のグループまたはシーンが見つかりません");
      return false;
    }
    runStateMutation("グループのシーン所属変更", () => {
      scene.groupIds = Array.isArray(scene.groupIds) ? scene.groupIds : [];
      const index = scene.groupIds.indexOf(gid);
      if (include && index < 0) scene.groupIds.push(gid);
      if (!include && index >= 0) scene.groupIds.splice(index, 1);
      selected = { kind: "group", groupId: gid };
      pendingObjectListReveal = true;
    });
    return true;
  }

  function toggleGroupSceneMembership(groupId, sceneId) {
    const scene = sceneById(sceneId || "");
    const gid = normalizeGroupId(groupId || "");
    if (!scene || !gid) {
      showToast("対象のグループまたはシーンが見つかりません");
      return false;
    }
    return setGroupSceneMembership(gid, scene.id, !sceneIncludesGroup(scene, gid));
  }

  function moveGroupToOnlyScene(groupId, sceneId) {
    const gid = normalizeGroupId(groupId || "");
    const sid = normalizeSceneId(sceneId || "");
    const group = groupById(gid);
    const targetScene = sceneById(sid);
    if (!gid || !sid || !group || !targetScene) {
      showToast("対象のグループまたはシーンが見つかりません");
      return false;
    }
    runStateMutation("グループをシーンへ移動", () => {
      for (const scene of ensureScenes()) {
        scene.groupIds = Array.isArray(scene.groupIds) ? scene.groupIds : [];
        scene.groupIds = scene.groupIds.filter(id => id !== gid);
      }
      targetScene.groupIds = Array.isArray(targetScene.groupIds) ? targetScene.groupIds : [];
      if (!targetScene.groupIds.includes(gid)) targetScene.groupIds.push(gid);
      state.activeSceneId = targetScene.id;
      selected = { kind: "group", groupId: gid };
      pendingObjectListReveal = true;
    });
    showToast(`グループをシーン「${targetScene.name || targetScene.id}」へ移動しました`);
    return true;
  }

  function setActiveSceneId(sceneId, options = {}) {
    const id = normalizeSceneId(sceneId || "");
    runStateMutation("プレビューシーン切替", () => {
      state.activeSceneId = id && sceneById(id) ? id : "";
      if (options.selectScene === true) {
        selected = state.activeSceneId ? { kind: "scene", sceneId: state.activeSceneId } : null;
        pendingObjectListReveal = true;
      } else {
        clearSelectionIfOutsideActiveScene();
      }
    });
  }

  function deleteScene(sceneId) {
    const id = normalizeSceneId(sceneId || "");
    if (!id) return;
    const scene = sceneById(id);
    if (!scene) return;
    const targetGroupIds = new Set(
      Array.isArray(scene.groupIds)
        ? scene.groupIds.map(groupId => normalizeGroupId(groupId || "")).filter(Boolean)
        : []
    );
    const deletedWindowIds = new Set(
      (state.windows || [])
        .filter(win => {
          const groupId = normalizeGroupId(win.groupId || "");
          if (targetGroupIds.has(groupId)) return true;
          return scene.includeUngrouped === true && !groupId;
        })
        .map(win => win.id)
    );
    const ok = !window.confirm || window.confirm(`シーン「${scene.name || scene.id}」を削除します。所属グループ・ウィンドウ・パーツも一緒に削除されます。よろしいですか？`);
    if (!ok) return;
    runStateMutation("シーン削除", () => {
      for (const groupId of targetGroupIds) objectListCollapsedGroups.delete(groupId);
      for (const windowId of deletedWindowIds) objectListCollapsedWindows.delete(windowId);
      state.windows = (state.windows || []).filter(win => !deletedWindowIds.has(win.id));
      state.groups = ensureGroups().filter(group => !targetGroupIds.has(group.id));
      for (const entry of ensureScenes()) {
        entry.groupIds = (entry.groupIds || []).filter(groupId => !targetGroupIds.has(normalizeGroupId(groupId || "")));
      }
      state.scenes = ensureScenes().filter(entry => entry.id !== id);
      delete ensureSceneSampleLinks()[id];
      if (state.activeSceneId === id) state.activeSceneId = state.scenes[0]?.id || "";
      if (selected?.kind === "scene" && selected.sceneId === id) selected = state.activeSceneId ? { kind: "scene", sceneId: state.activeSceneId } : null;
      if (selected?.kind === "group" && targetGroupIds.has(normalizeGroupId(selected.groupId || ""))) selected = null;
      if (selected?.kind === "window" && deletedWindowIds.has(selected.windowId || "")) selected = null;
      if (selected?.kind === "item" && deletedWindowIds.has(selected.windowId || "")) selected = null;
    });
    showToast(`シーン「${scene.name || scene.id}」と関連オブジェクトを削除しました`);
  }

  function groupById(groupId) {
    const id = normalizeGroupId(groupId || "");
    if (!id) return null;
    return ensureGroups().find(group => group.id === id) || null;
  }

  function groupName(groupId) {
    const group = groupById(groupId);
    return group ? (group.name || group.id) : "未グループ";
  }

  function groupOptions() {
    return [
      { value: "", label: "未グループ" },
      ...ensureGroups().map(group => ({ value: group.id, label: `${group.name || group.id} (${group.id})` }))
    ];
  }

  function nextGroupId(base = "group") {
    const safeBase = normalizeGroupId(base) || "group";
    const used = new Set(ensureGroups().map(group => group.id));
    let index = 1;
    let id = `${safeBase}${index}`;
    while (used.has(id)) id = `${safeBase}${++index}`;
    return id;
  }

  function createGroupObject(name = "新規グループ") {
    const id = nextGroupId("group");
    ensureGroups().push({ id, name, visible: true, locked: false });
    objectListCollapsedGroups.delete(id);
    return id;
  }

  function addGroup(name = "新規グループ") {
    let id = "";
    runStateMutation("グループ追加", () => {
      id = createGroupObject(name);
      addGroupIdToActiveScene(id);
    });
    return id;
  }

  function isObjectListGroupCollapsed(groupId) {
    const id = groupId === UNGROUPED_COLLAPSE_KEY ? UNGROUPED_COLLAPSE_KEY : normalizeGroupId(groupId || "");
    return !!id && objectListCollapsedGroups.has(id);
  }

  function toggleObjectListGroupCollapsed(groupId) {
    const id = groupId === UNGROUPED_COLLAPSE_KEY ? UNGROUPED_COLLAPSE_KEY : normalizeGroupId(groupId || "");
    if (!id) return;
    if (objectListCollapsedGroups.has(id)) objectListCollapsedGroups.delete(id);
    else objectListCollapsedGroups.add(id);
    renderObjectList();
  }

  function isObjectListWindowCollapsed(windowId) {
    const id = String(windowId || "");
    return !!id && objectListCollapsedWindows.has(id);
  }

  function toggleObjectListWindowCollapsed(windowId) {
    const id = String(windowId || "");
    if (!id) return;
    if (objectListCollapsedWindows.has(id)) objectListCollapsedWindows.delete(id);
    else objectListCollapsedWindows.add(id);
    renderObjectList();
  }

  function expandObjectListContainersForSelection() {
    if (!selected) return;
    if (selected.kind === "group") {
      objectListCollapsedGroups.delete(normalizeGroupId(selected.groupId || ""));
      return;
    }
    if (selected.kind !== "window" && selected.kind !== "item") return;
    const win = state.windows.find(entry => entry.id === selected.windowId);
    if (!win) return;
    const groupId = normalizeGroupId(win.groupId || "");
    objectListCollapsedGroups.delete(groupId || UNGROUPED_COLLAPSE_KEY);
    if (selected.kind === "item") objectListCollapsedWindows.delete(win.id);
  }

  function deleteGroup(groupId) {
    const id = normalizeGroupId(groupId || "");
    if (!id) return;
    runStateMutation("グループとウィンドウ削除", () => {
      state.windows = (state.windows || []).filter(win => normalizeGroupId(win.groupId || "") !== id);
      state.groups = ensureGroups().filter(group => group.id !== id);
      if (Array.isArray(state.scenes)) {
        for (const scene of state.scenes) {
          scene.groupIds = (scene.groupIds || []).filter(groupId => groupId !== id);
        }
      }
      objectListCollapsedGroups.delete(id);
      if (selected?.kind === "group" && selected.groupId === id) selected = null;
    });
  }

  function windowsInGroup(groupId) {
    const id = normalizeGroupId(groupId || "");
    return (state.windows || []).filter(win => normalizeGroupId(win.groupId || "") === id);
  }

  function groupBounds(groupId) {
    const wins = windowsInGroup(groupId);
    if (!wins.length) return { x: 0, y: 0, width: 0, height: 0, count: 0 };
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const win of wins) {
      const x = Number(win.x || 0);
      const y = Number(win.y || 0);
      const w = Math.max(1, Number(win.width || 1));
      const h = Math.max(1, Number(win.height || 1));
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + w);
      maxY = Math.max(maxY, y + h);
    }
    return { x: Math.round(minX), y: Math.round(minY), width: Math.round(maxX - minX), height: Math.round(maxY - minY), count: wins.length };
  }

  function moveGroupTo(groupId, x, y) {
    const group = groupById(groupId);
    if (!group) return;
    if (group.locked === true) {
      showToast("このグループはロックされています");
      return;
    }
    const bounds = groupBounds(groupId);
    const dx = Math.round(Number(x || 0) - bounds.x);
    const dy = Math.round(Number(y || 0) - bounds.y);
    if (!dx && !dy) return;
    runStateMutation("グループ移動", () => {
      for (const win of windowsInGroup(groupId)) {
        win.x = Math.round(Number(win.x || 0) + dx);
        win.y = Math.round(Number(win.y || 0) + dy);
      }
    });
  }

  function makeUniqueIdFromSet(baseId, used, fallback = "item") {
    const base = safeId(baseId || fallback, fallback);
    let index = 1;
    let candidate = `${base}_copy${index}`;
    while (used.has(candidate)) candidate = `${base}_copy${++index}`;
    used.add(candidate);
    return candidate;
  }

  function makeUniqueIdPreserveFromSet(baseId, used, fallback = "item") {
    const base = safeId(baseId || fallback, fallback);
    if (!used.has(base)) {
      used.add(base);
      return base;
    }
    let index = 1;
    let candidate = `${base}_copy${index}`;
    while (used.has(candidate)) candidate = `${base}_copy${++index}`;
    used.add(candidate);
    return candidate;
  }

  function maxWindowZOrder() {
    return Math.max(-1, ...(state.windows || []).map(win => Number(win.zOrder || 0)).filter(Number.isFinite));
  }

  function maxItemZOrder(win) {
    return Math.max(-1, ...((win?.items || []).map(item => Number(item.zOrder || 0)).filter(Number.isFinite)));
  }

  function cloneWindowForPaste(source, groupId, usedWindowIds, offset = 24, options = {}) {
    const copy = cloneForHistory(source || {});
    copy.id = makeUniqueIdPreserveFromSet(copy.id || "window", usedWindowIds, "window");
    copy.groupId = normalizeGroupId(groupId || "");
    copy.x = Math.round(Number(copy.x || 0) + Number(offset || 0));
    copy.y = Math.round(Number(copy.y || 0) + Number(offset || 0));
    if (options.zOrder !== undefined) copy.zOrder = Number(options.zOrder) || 0;
    const usedItemIds = new Set();
    copy.items = (copy.items || []).map(item => {
      const itemCopy = cloneForHistory(item);
      itemCopy.id = makeUniqueIdPreserveFromSet(itemCopy.id || itemCopy.type, usedItemIds, "item");
      return itemCopy;
    });
    normalizeWindowItemIdentity(copy);
    return copy;
  }

  function duplicateGroup(groupId) {
    const group = groupById(groupId);
    if (!group) {
      showToast("複製するグループが見つかりません");
      return;
    }
    const sourceWindows = windowsInGroup(group.id);
    let newId = "";
    runStateMutation("グループ複製", () => {
      newId = nextGroupId(group.id || "group");
      ensureGroups().push({ id: newId, name: `${group.name || group.id} コピー`, visible: group.visible !== false, locked: false });
      const scene = activeScene();
      if (scene && sceneIncludesGroup(scene, group.id) && !scene.groupIds.includes(newId)) scene.groupIds.push(newId);
      objectListCollapsedGroups.delete(newId);
      const usedWindowIds = new Set((state.windows || []).map(win => win.id));
      for (const source of sourceWindows) {
        const copy = cloneForHistory(source);
        copy.id = makeUniqueIdFromSet(source.id, usedWindowIds, "window");
        copy.groupId = newId;
        copy.x = Math.round(Number(copy.x || 0) + 24);
        copy.y = Math.round(Number(copy.y || 0) + 24);
        const usedItemIds = new Set();
        copy.items = (copy.items || []).map(item => {
          const itemCopy = cloneForHistory(item);
          itemCopy.id = makeUniqueIdFromSet(itemCopy.id || itemCopy.type, usedItemIds, "item");
          return itemCopy;
        });
        normalizeWindowItemIdentity(copy);
        state.windows.push(copy);
      }
      selected = { kind: "group", groupId: newId };
    });
    showToast("グループを複製しました");
  }

  function deleteGroupWindows(groupId) {
    deleteGroup(groupId);
  }

  function setGroupVisible(groupId, visible) {
    const group = groupById(groupId);
    if (!group) return;
    runStateMutation("グループ表示切替", () => { group.visible = visible; });
  }

  function groupVisible(groupId) {
    const group = groupById(groupId);
    return !group || group.visible !== false;
  }

  function groupLocked(groupId) {
    const group = groupById(groupId);
    return !!group && group.locked === true;
  }

  function windowPositionLocked(win) {
    return !!win && (win.locked === true || groupLocked(win.groupId));
  }

  function itemPositionLocked(win, item) {
    return !!item && (item.locked === true || groupLocked(win?.groupId));
  }

  function positionLockReason(win, item = null) {
    if (groupLocked(win?.groupId)) return "このグループはロックされています";
    if (item) {
      if (globalPartPositionLocked) return "パーツ位置ロックがONです";
      if (item.locked === true) return "このパーツはロックされています";
      return "";
    }
    if (globalWindowPositionLocked) return "ウィンドウ位置ロックがONです";
    if (win?.locked === true) return "このウィンドウはロックされています";
    return "";
  }

  function windowGroupLabel(win) {
    return win?.groupId ? ` / ${groupName(win.groupId)}` : "";
  }

  function stopObjectListControlEvent(ev) {
    ev.preventDefault();
    ev.stopPropagation();
  }

  function protectObjectListControl(el) {
    if (!el) return el;
    ["pointerdown", "mousedown", "mouseup", "dblclick", "contextmenu", "dragstart"].forEach(type => {
      el.addEventListener(type, stopObjectListControlEvent);
    });
    return el;
  }

  function createObjectListControlStrip(...children) {
    const strip = document.createElement("div");
    strip.className = "object-row-control-strip";
    protectObjectListControl(strip);
    children.filter(Boolean).forEach(child => strip.appendChild(child));
    return strip;
  }

  function createObjectListVisibilityButton(visible, title, onToggle) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "object-visible-toggle object-icon-toggle";
    button.title = title || (visible ? "クリックで非表示" : "クリックで表示");
    button.setAttribute("aria-label", button.title);
    const img = document.createElement("img");
    img.src = visible ? "assets/ake.png" : "assets/toji.png";
    img.alt = visible ? "表示" : "非表示";
    img.draggable = false;
    button.appendChild(img);
    protectObjectListControl(button);
    button.addEventListener("click", ev => {
      stopObjectListControlEvent(ev);
      onToggle();
    });
    return button;
  }

  function createObjectListLockButton(locked, title, onToggle) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "object-lock-toggle";
    button.textContent = locked ? "🔒" : "🔓";
    button.title = title || (locked ? "クリックで位置ロック解除" : "クリックで位置ロック");
    button.setAttribute("aria-label", button.title);
    protectObjectListControl(button);
    button.addEventListener("click", ev => {
      stopObjectListControlEvent(ev);
      onToggle();
    });
    return button;
  }


  function createObjectListCollapseButton(collapsed, title, onToggle) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "object-collapse-toggle";
    button.textContent = collapsed ? "▸" : "▾";
    button.title = title || (collapsed ? "一覧を展開" : "一覧を折りたたみ");
    button.setAttribute("aria-label", button.title);
    protectObjectListControl(button);
    button.addEventListener("click", ev => {
      stopObjectListControlEvent(ev);
      if (typeof onToggle === "function") onToggle();
    });
    return button;
  }

  function createObjectListDeleteButton(title, onDelete) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "object-delete-button";
    button.textContent = "×";
    button.title = title || "削除";
    button.setAttribute("aria-label", button.title);
    button.addEventListener("click", ev => {
      ev.preventDefault();
      ev.stopPropagation();
      onDelete();
    });
    return button;
  }


  function createObjectListIconButton(kind, title, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `object-row-mini-button object-icon-file-button object-${kind}-button`;
    button.title = title || (kind === "load" ? "読み込み" : "保存");
    button.setAttribute("aria-label", button.title);
    const img = document.createElement("img");
    img.src = kind === "load" ? "assets/yomikomi.png" : "assets/hozon.png";
    img.alt = kind === "load" ? "読込" : "保存";
    button.appendChild(img);
    protectObjectListControl(button);
    button.addEventListener("click", ev => {
      stopObjectListControlEvent(ev);
      onClick();
    });
    return button;
  }

  function createObjectListSaveButton(title, onSave) {
    return createObjectListIconButton("save", title || "部品として保存", onSave);
  }

  function createObjectListLoadButton(title, onLoad) {
    return createObjectListIconButton("load", title || "部品を読み込み", onLoad);
  }

  function templateFileExtension(kind) {
    switch (String(kind || "")) {
      case "scene": return "scene";
      case "group": return "group";
      case "window": return "window";
      case "item": return "parts";
      default: return "json";
    }
  }

  function safeTemplateFileName(name, kind) {
    const base = String(name || templateKindLabel(kind) || "component")
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
      .replace(/\s+/g, "_")
      .replace(/^\.+/, "")
      .slice(0, 80) || "component";
    return `${base}.${templateFileExtension(kind)}`;
  }

  function normalizeComponentTemplateEntry(entry, fallbackKind = "item") {
    const kind = ["scene", "group", "window", "item"].includes(String(entry?.kind || "")) ? String(entry.kind) : fallbackKind;
    return {
      id: safeId(entry?.id || `${kind}Template`, `${kind}Template`),
      kind,
      name: String(entry?.name || `${templateKindLabel(kind)}テンプレート`),
      savedAt: String(entry?.savedAt || ""),
      version: String(entry?.version || TOOL_VERSION),
      data: cloneForHistory(entry?.data || {})
    };
  }

  async function saveComponentTemplateFile(entry) {
    const normalized = normalizeComponentTemplateEntry(entry, entry?.kind || "item");
    const defaultFileName = safeTemplateFileName(normalized.name || normalized.id, normalized.kind);
    const payload = JSON.stringify(normalized, null, 2);
    try {
      if (window.DB_UIComposerElectron?.saveComponentTemplateFile) {
        const result = await window.DB_UIComposerElectron.saveComponentTemplateFile({
          kind: normalized.kind,
          defaultFileName,
          payload
        });
        if (result?.canceled) return false;
        if (result?.ok) return true;
        showToast(result?.message || "部品ファイル保存に失敗しました");
        return false;
      }
    } catch (error) {
      console.warn("[DB_UIComposer] component template file save failed", error);
      showToast(error?.message || "部品ファイル保存に失敗しました");
      return false;
    }
    try {
      const blob = new Blob([payload], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = defaultFileName;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      return true;
    } catch (error) {
      showToast(error?.message || "部品ファイル保存に失敗しました");
      return false;
    }
  }

  function parseComponentTemplateFileText(text, expectedKind = "") {
    const parsed = JSON.parse(String(text || "{}"));
    const entry = normalizeComponentTemplateEntry(parsed, expectedKind || parsed.kind || "item");
    if (expectedKind && entry.kind !== expectedKind) {
      throw new Error(`${templateKindLabel(expectedKind)}ファイルではありません。選択されたファイルは ${templateKindLabel(entry.kind)} です。`);
    }
    if (!entry.data || typeof entry.data !== "object") throw new Error("部品ファイルのdataがありません。");
    return entry;
  }

  async function openComponentTemplateFile(expectedKind = "") {
    try {
      if (window.DB_UIComposerElectron?.openComponentTemplateFile) {
        const result = await window.DB_UIComposerElectron.openComponentTemplateFile({ kind: expectedKind || "" });
        if (result?.canceled) return null;
        if (!result?.ok) throw new Error(result?.message || "部品ファイルを読み込めませんでした");
        return parseComponentTemplateFileText(result.text || "", expectedKind);
      }
    } catch (error) {
      showToast(error?.message || "部品ファイルを読み込めませんでした");
      return null;
    }
    return new Promise(resolve => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = expectedKind ? `.${templateFileExtension(expectedKind)}` : ".scene,.group,.groop,.window,.parts,.json";
      input.addEventListener("change", () => {
        const file = input.files && input.files[0];
        if (!file) return resolve(null);
        const reader = new FileReader();
        reader.onload = () => {
          try { resolve(parseComponentTemplateFileText(String(reader.result || ""), expectedKind)); }
          catch (error) { showToast(error?.message || "部品ファイルを読み込めませんでした"); resolve(null); }
        };
        reader.onerror = () => { showToast("部品ファイルを読み込めませんでした"); resolve(null); };
        reader.readAsText(file, "utf-8");
      }, { once: true });
      input.click();
    });
  }

  function normalizeComponentTemplates(list) {
    const src = Array.isArray(list) ? list : [];
    return src.map((entry, index) => {
      const normalized = normalizeComponentTemplateEntry(entry, "item");
      normalized.id = safeId(entry?.id || `template${index + 1}`, `template${index + 1}`);
      return normalized;
    });
  }

  function ensureComponentTemplates() {
    state.componentTemplates = normalizeComponentTemplates(state.componentTemplates);
    return state.componentTemplates;
  }

  function templateKindLabel(kind) {
    switch (String(kind || "")) {
      case "scene": return "シーン";
      case "group": return "グループ";
      case "window": return "ウィンドウ";
      case "item": return "パーツ";
      default: return "部品";
    }
  }

  function nextTemplateId(base = "template") {
    const safeBase = safeId(base || "template", "template");
    const used = new Set(ensureComponentTemplates().map(entry => entry.id));
    let index = 1;
    let id = `${safeBase}${index}`;
    while (used.has(id)) id = `${safeBase}${++index}`;
    return id;
  }

  function defaultTemplateName(target) {
    if (!target) return "部品";
    if (target.kind === "scene") {
      const scene = sceneById(target.sceneId || "") || activeScene() || ensureScenes()[0];
      return `シーン_${scene?.name || scene?.id || "scene"}`;
    }
    if (target.kind === "group") {
      const group = groupById(target.groupId || "");
      return `グループ_${group?.name || group?.id || "group"}`;
    }
    if (target.kind === "window") {
      const win = (state.windows || []).find(entry => entry.id === target.windowId);
      return `ウィンドウ_${win?.id || "window"}`;
    }
    if (target.kind === "item") {
      const win = (state.windows || []).find(entry => entry.id === target.windowId);
      const item = win?.items?.find(entry => entry.id === target.itemId);
      return `パーツ_${item?.id || item?.type || "item"}`;
    }
    return "部品";
  }

  function scrubTemplateData(data) {
    const copy = cloneForHistory(data || {});
    const windows = [];
    if (Array.isArray(copy.windows)) windows.push(...copy.windows);
    if (copy.window) windows.push(copy.window);
    for (const win of windows) {
      if (win?.backgroundImage) scrubPreviewImageFields(win.backgroundImage);
      if (win?.decorationImage) scrubPreviewImageFields(win.decorationImage);
      for (const item of win?.items || []) {
        if (item.type === "image") scrubPreviewImageFields(item);
        if (item.type === "compositeImage") for (const layer of item.layers || []) scrubPreviewImageFields(layer);
      }
    }
    if (copy.item) {
      if (copy.item.type === "image") scrubPreviewImageFields(copy.item);
      if (copy.item.type === "compositeImage") for (const layer of copy.item.layers || []) scrubPreviewImageFields(layer);
    }
    return copy;
  }

  function buildTemplatePayload(target) {
    if (!target) return null;
    if (target.kind === "scene") {
      const scene = sceneById(target.sceneId || "") || activeScene();
      if (!scene) return null;
      const groupIds = new Set(Array.isArray(scene.groupIds) ? scene.groupIds : []);
      const groups = ensureGroups().filter(group => groupIds.has(group.id)).map(group => cloneForHistory(group));
      const windows = (state.windows || []).filter(win => {
        const gid = normalizeGroupId(win.groupId || "");
        return gid ? groupIds.has(gid) : scene.includeUngrouped === true;
      }).map(win => cloneForHistory(win));
      return { scene: cloneForHistory(scene), groups, windows };
    }
    if (target.kind === "group") {
      const group = groupById(target.groupId || "");
      if (!group) return null;
      return { group: cloneForHistory(group), windows: windowsInGroup(group.id).map(win => cloneForHistory(win)) };
    }
    if (target.kind === "window") {
      const win = (state.windows || []).find(entry => entry.id === target.windowId);
      if (!win) return null;
      return { window: cloneForHistory(win) };
    }
    if (target.kind === "item") {
      const win = (state.windows || []).find(entry => entry.id === target.windowId);
      const item = win?.items?.find(entry => entry.id === target.itemId);
      if (!win || !item) return null;
      return { sourceWindowId: win.id, item: cloneForHistory(item) };
    }
    return null;
  }

  async function saveObjectTemplate(target) {
    const payload = buildTemplatePayload(target);
    if (!payload) {
      showToast("保存する対象が見つかりません");
      return false;
    }
    const kind = String(target?.kind || "item");
    const fallback = defaultTemplateName(target);
    const entry = {
      id: nextTemplateId(`${kind}Template`),
      kind,
      name: String(fallback || templateKindLabel(kind)).trim() || templateKindLabel(kind),
      savedAt: new Date().toISOString(),
      version: TOOL_VERSION,
      data: scrubTemplateData(payload)
    };
    const ok = await saveComponentTemplateFile(entry);
    if (!ok) return false;
    runStateMutation("部品テンプレート保存履歴", () => {
      ensureComponentTemplates().push(entry);
    });
    showToast(`${templateKindLabel(kind)}をファイル保存しました`);
    return true;
  }

  function saveSelectedOrActiveSceneTemplate() {
    let scene = selected?.kind === "scene" ? sceneById(selected.sceneId || "") : activeScene();
    if (!scene) scene = ensureScenes()[0] || null;
    if (!scene) {
      showToast("保存するシーンがありません。先にシーンを作成してください");
      return false;
    }
    return saveObjectTemplate({ kind: "scene", sceneId: scene.id });
  }

  function describeTemplate(entry, index) {
    return `${index + 1}. [${templateKindLabel(entry.kind)}] ${entry.name || entry.id}`;
  }

  function chooseComponentTemplate() {
    const list = ensureComponentTemplates();
    if (!list.length) {
      showToast("保存済み部品がありません");
      return null;
    }
    const message = ["読み込む部品番号を入力してください。", "", ...list.map(describeTemplate)].join("\n");
    const raw = window.prompt ? window.prompt(message, "1") : "1";
    if (raw === null) return null;
    const index = Math.max(0, Number(raw) - 1);
    if (!Number.isFinite(index) || !list[index]) {
      showToast("指定番号の部品がありません");
      return null;
    }
    return list[index];
  }

  function importWindowTemplate(sourceWindow, target = null) {
    if (!sourceWindow) return false;
    const targetSceneId = sceneIdForContextTarget(target || selected);
    let attachedSceneName = "";
    runStateMutation("ウィンドウ部品読込", () => {
      const groupId = resolveGroupForWindowPasteTarget(target || selected, sourceWindow.groupId || "");
      const usedWindowIds = new Set((state.windows || []).map(win => win.id));
      const copy = cloneWindowForPaste(sourceWindow, groupId, usedWindowIds, 24, { zOrder: maxWindowZOrder() + 1 });
      const attachedScene = targetSceneId && groupId ? attachGroupIdToSceneId(targetSceneId, groupId) : null;
      if (attachedScene) {
        state.activeSceneId = attachedScene.id;
        attachedSceneName = attachedScene.name || attachedScene.id;
      }
      state.windows.push(copy);
      selected = { kind: "window", windowId: copy.id };
      pendingObjectListReveal = true;
    });
    showToast(attachedSceneName ? `ウィンドウ部品をシーン「${attachedSceneName}」へ読み込みました` : "ウィンドウ部品を読み込みました");
    return true;
  }

  function importItemTemplate(sourceItem, target = null) {
    if (!sourceItem) return false;
    let targetWin = null;
    if (target?.kind === "window") targetWin = (state.windows || []).find(win => win.id === target.windowId) || null;
    else if (target?.kind === "item") targetWin = (state.windows || []).find(win => win.id === target.windowId) || null;
    if (!targetWin) targetWin = selectedWindow();
    if (!targetWin) targetWin = firstWindowInActiveScene() || state.windows[0] || null;
    if (!targetWin) {
      addWindow();
      targetWin = selectedWindow();
    }
    if (!targetWin) return false;
    runStateMutation("パーツ部品読込", () => {
      const copy = cloneForHistory(sourceItem);
      const usedItemIds = new Set((targetWin.items || []).map(item => item.id));
      copy.id = makeUniqueIdPreserveFromSet(copy.id || copy.type || "item", usedItemIds, "item");
      copy.x = Math.round(Number(copy.x || 0) + 12);
      copy.y = Math.round(Number(copy.y || 0) + 12);
      copy.zOrder = maxItemZOrder(targetWin) + 1;
      targetWin.items = targetWin.items || [];
      targetWin.items.push(copy);
      mode = "inside";
      selected = { kind: "item", windowId: targetWin.id, itemId: copy.id };
      pendingObjectListReveal = true;
    });
    updateModeButtons();
    showToast("パーツ部品を読み込みました");
    return true;
  }

  function importGroupTemplate(payload, target = null) {
    const sourceGroup = payload?.group || null;
    if (!sourceGroup) return false;
    const targetSceneId = sceneIdForContextTarget(target || selected);
    let attachedSceneName = "";
    let newGroupId = "";
    runStateMutation("グループ部品読込", () => {
      const groups = ensureGroups();
      const usedGroupIds = new Set(groups.map(group => group.id));
      newGroupId = makeUniqueIdPreserveFromSet(sourceGroup.id || "group", usedGroupIds, "group");
      groups.push({
        id: newGroupId,
        name: uniqueDisplayName(sourceGroup.name || sourceGroup.id || "グループ", groups),
        visible: sourceGroup.visible !== false,
        locked: false
      });
      const scene = targetSceneId ? attachGroupIdToSceneId(targetSceneId, newGroupId) : activeScene();
      if (scene) {
        addGroupIdToScene(scene, newGroupId);
        state.activeSceneId = scene.id;
        attachedSceneName = scene.name || scene.id;
      }
      objectListCollapsedGroups.delete(newGroupId);
      const usedWindowIds = new Set((state.windows || []).map(win => win.id));
      let nextZ = maxWindowZOrder() + 1;
      for (const sourceWindow of payload.windows || []) {
        state.windows.push(cloneWindowForPaste(sourceWindow, newGroupId, usedWindowIds, 24, { zOrder: nextZ++ }));
      }
      selected = { kind: "group", groupId: newGroupId };
      pendingObjectListReveal = true;
    });
    showToast(attachedSceneName ? `グループ部品をシーン「${attachedSceneName}」へ読み込みました` : "グループ部品を読み込みました");
    return true;
  }

  function importSceneTemplate(payload, options = {}) {
    const sourceScene = payload?.scene || null;
    if (!sourceScene) return false;
    let newSceneId = "";
    runStateMutation("シーン部品読込", () => {
      const scenes = ensureScenes();
      const usedSceneIds = new Set(scenes.map(scene => scene.id));
      newSceneId = makeUniqueIdPreserveFromSet(sourceScene.id || "scene", usedSceneIds, "scene");
      const groupMap = new Map();
      const usedWindowIds = new Set((state.windows || []).map(win => win.id));
      const groups = ensureGroups();
      const usedGroupIds = new Set(groups.map(group => group.id));
      for (const sourceGroup of payload.groups || []) {
        const newGroupId = makeUniqueIdPreserveFromSet(sourceGroup.id || "group", usedGroupIds, "group");
        groupMap.set(sourceGroup.id, newGroupId);
        groups.push({
          id: newGroupId,
          name: uniqueDisplayName(sourceGroup.name || sourceGroup.id || "グループ", groups),
          visible: sourceGroup.visible !== false,
          locked: false
        });
      }
      let nextZ = maxWindowZOrder() + 1;
      for (const sourceWindow of payload.windows || []) {
        const oldGroupId = normalizeGroupId(sourceWindow.groupId || "");
        const newGroupId = oldGroupId ? (groupMap.get(oldGroupId) || "") : "";
        state.windows.push(cloneWindowForPaste(sourceWindow, newGroupId, usedWindowIds, 0, { zOrder: nextZ++ }));
      }
      const scene = {
        id: newSceneId,
        name: uniqueDisplayName(sourceScene.name || sourceScene.id || "シーン", scenes),
        groupIds: Array.from(groupMap.values()),
        includeUngrouped: sourceScene.includeUngrouped === true
      };
      scenes.push(scene);
      if (options.sampleTemplateId) {
        const links = ensureSceneSampleLinks();
        links[scene.id] = {
          sampleId: String(options.sampleTemplateId || ""),
          category: String(options.sampleCategory || "advanced"),
          name: String(options.sampleName || scene.name || scene.id)
        };
      }
      state.activeSceneId = scene.id;
      selected = { kind: "scene", sceneId: scene.id };
      pendingObjectListReveal = true;
    });
    showToast("シーン部品を読み込みました");
    return true;
  }

  function loadComponentTemplate(entry = null, target = null) {
    const template = entry || chooseComponentTemplate();
    if (!template) return false;
    const data = cloneForHistory(template.data || {});
    if (template.kind === "scene") {
      return importSceneTemplate(data, {
        sampleTemplateId: template.sampleId || template.id || "",
        sampleCategory: template.category || "advanced",
        sampleName: template.name || ""
      });
    }
    if (template.kind === "group") return importGroupTemplate(data, target);
    if (template.kind === "window") return importWindowTemplate(data.window, target);
    if (template.kind === "item") return importItemTemplate(data.item, target);
    showToast("対応していない部品形式です");
    return false;
  }

  async function loadComponentTemplateFromFile(expectedKind = "", target = null) {
    const template = await openComponentTemplateFile(expectedKind || "");
    if (!template) return false;
    return loadComponentTemplate(template, target || selected);
  }

  function sampleTextItem(id, x, y, text, fontSize = 20, width = 180, extra = {}) {
    return Object.assign({ type: "text", id, x, y, width, text, fontSize, color: "", align: "left", zOrder: 0, visible: true }, extra || {});
  }

  function sampleGaugeItem(id, x, y, width, height, value, max, label, color1, color2, shape = "horizontal", direction = "leftToRight", startAngle = 0) {
    return {
      type: "gauge", id, x, y, width, height,
      gaugeShape: shape,
      gaugeDirection: direction,
      gaugeStartAngle: startAngle,
      valueType: "fixed", value, max, label,
      color1, color2,
      zOrder: 0,
      visible: true
    };
  }

  function sampleWindowBase(id, groupId, x, y, width, height, items = [], extra = {}) {
    return Object.assign({
      id, groupId, x, y, width, height,
      opacity: 220,
      contentsOpacity: 255,
      layer: "mapUi",
      zOrder: 0,
      visible: true,
      frameVisible: true,
      backgroundType: "normal",
      items
    }, extra || {});
  }

  function sampleImagePlaceholderItem(id, x, y, width, height, note = "", extra = {}) {
    return Object.assign({
      type: "image",
      id,
      x,
      y,
      width,
      height,
      folder: "pictures",
      fileName: "",
      opacity: 255,
      mode: "stretch",
      visible: true,
      zOrder: 0,
      help: note || "ここに画像を設定してください。"
    }, extra || {});
  }

  function createSampleSceneTemplates() {
    return [
      {
        id: "basicSceneConcepts",
        kind: "scene",
        category: "basic",
        name: "基礎編 01：シーン/グループ/ウィンドウの概念",
        description: "シーン階層の役割を確認する学習用サンプルです。",
        savedAt: "sample",
        version: TOOL_VERSION,
        data: {
          scene: { id: "Basic_01_SceneConcepts", name: "Basic_01_SceneConcepts", groupIds: ["tutorial_scene", "tutorial_groups", "tutorial_windows"], includeUngrouped: false },
          groups: [
            { id: "tutorial_scene", name: "1 シーン説明", visible: true, locked: false },
            { id: "tutorial_groups", name: "2 グループ説明", visible: true, locked: false },
            { id: "tutorial_windows", name: "3 ウィンドウ説明", visible: true, locked: false }
          ],
          windows: [
            sampleWindowBase("Tutorial_Title_Window", "tutorial_scene", 34, 28, 748, 84, [
              sampleTextItem("Tutorial_Title", 20, 12, "DB_UIComposer 基礎編 01", 28, 420, { color: "#ffffff" }),
              sampleTextItem("Tutorial_Sub", 22, 48, "シーン → グループ → ウィンドウの役割を確認します。", 16, 690, { color: "#cfe0ff" })
            ], { opacity: 210 }),
            sampleWindowBase("Scene_Explain_Window", "tutorial_scene", 46, 132, 704, 118, [
              sampleTextItem("Scene_H", 18, 12, "1. シーン", 24, 180, { color: "#ffe7a0" }),
              sampleTextItem("Scene_Body", 22, 48, "シーンは1画面分の構成です。ステータス画面やHUD画面など、用途ごとに保存・読込できます。", 16, 650, { color: "#ffffff" })
            ]),
            sampleWindowBase("Group_Explain_Window", "tutorial_groups", 46, 270, 704, 126, [
              sampleTextItem("Group_H", 18, 12, "2. グループ", 24, 180, { color: "#b8ffce" }),
              sampleTextItem("Group_Body", 22, 48, "グループは複数ウィンドウをまとめる単位です。表示/非表示やロックをまとめて切り替えられます。", 16, 650, { color: "#ffffff" })
            ]),
            sampleWindowBase("Window_Explain_Window", "tutorial_windows", 46, 416, 704, 126, [
              sampleTextItem("Window_H", 18, 12, "3. ウィンドウ", 24, 180, { color: "#b8d4ff" }),
              sampleTextItem("Window_Body", 22, 48, "ウィンドウはパーツを配置する枠です。中へテキスト・画像・ゲージ・ログ・ボタンを置きます。", 16, 650, { color: "#ffffff" })
            ])
          ]
        }
      },
      {
        id: "basicPartsGuide",
        kind: "scene",
        category: "basic",
        name: "基礎編 02：主要パーツの用途",
        description: "テキスト/画像/ゲージ/ログ/ボタンの用途を確認する基礎サンプルです。",
        savedAt: "sample",
        version: TOOL_VERSION,
        data: {
          scene: { id: "Basic_02_PartsGuide", name: "Basic_02_PartsGuide", groupIds: ["tutorial_parts"], includeUngrouped: false },
          groups: [{ id: "tutorial_parts", name: "パーツ説明", visible: true, locked: false }],
          windows: [
            sampleWindowBase("Parts_Explain_Window", "tutorial_parts", 38, 34, 742, 514, [
              sampleTextItem("Parts_Title", 20, 12, "パーツの基本", 28, 300, { color: "#ffffff" }),
              sampleTextItem("Text_Label", 30, 70, "テキスト：名前、説明、数値表示に使用。", 16, 640, { color: "#ffffff" }),
              sampleTextItem("Image_Label", 30, 114, "画像：立ち絵や背景に使用。下に差し替えスロットを用意。", 16, 640, { color: "#ffffff" }),
              sampleImagePlaceholderItem("Image_Slot_Basic", 52, 150, 180, 120, "任意画像を設定してください"),
              sampleTextItem("Image_Slot_Note", 248, 188, "↑ 画像パーツの差し替えスロット", 15, 220, { color: "#cfe0ff" }),
              sampleTextItem("Gauge_Label", 30, 292, "ゲージ：横/縦/円に対応。", 16, 640, { color: "#ffffff" }),
              sampleGaugeItem("Tutorial_HP_Gauge", 54, 328, 260, 18, 80, 100, "", "#ff6060", "#ffb0b0", "horizontal", "leftToRight"),
              sampleGaugeItem("Tutorial_V_Gauge", 364, 320, 28, 86, 55, 100, "", "#66ccff", "#d0f1ff", "vertical", "bottomToTop"),
              sampleGaugeItem("Tutorial_C_Gauge", 448, 320, 86, 86, 45, 100, "", "#ffd25a", "#fff0a8", "circle", "clockwise"),
              { type: "log", id: "Tutorial_Log", x: 54, y: 430, width: 520, height: 64, fontSize: 16, lineHeight: 24, color: "#ffffff", paddingX: 8, paddingY: 8, maxLines: 2, lineVisibleFrames: 180, fadeFrames: 30, moveFrames: 20, sampleText: "ログパーツです。\nゲーム内で文章を追加できます。", zOrder: 0, visible: true }
            ])
          ]
        }
      },
      {
        id: "basicSaveReuse",
        kind: "scene",
        category: "basic",
        name: "基礎編 03：保存/読込と再利用",
        description: "サンプル編集後の保存や、部品としての再利用手順を確認できます。",
        savedAt: "sample",
        version: TOOL_VERSION,
        data: {
          scene: { id: "Basic_03_SaveReuse", name: "Basic_03_SaveReuse", groupIds: ["tutorial_reuse", "tutorial_save_targets"], includeUngrouped: false },
          groups: [
            { id: "tutorial_reuse", name: "保存読込の説明", visible: true, locked: false },
            { id: "tutorial_save_targets", name: "保存して試す部品", visible: true, locked: false }
          ],
          windows: [
            sampleWindowBase("Reuse_Guide_Window", "tutorial_reuse", 38, 40, 742, 206, [
              sampleTextItem("Reuse_Title", 20, 12, "保存・読込チュートリアル", 28, 380, { color: "#ffffff" }),
              sampleTextItem("Reuse_1", 24, 62, "1. このサンプルを読み込んで編集", 16, 680, { color: "#ffffff" }),
              sampleTextItem("Reuse_2", 24, 96, "2. サンプル管理画面で『現在シーンを保存』", 16, 680, { color: "#ffffff" }),
              sampleTextItem("Reuse_3", 24, 130, "3. 壊れたら同画面の『初期化』で復元", 16, 680, { color: "#ffffff" })
            ]),
            sampleWindowBase("Reusable_Status_Block", "tutorial_save_targets", 76, 286, 304, 170, [
              sampleTextItem("Reusable_Name", 18, 14, "再利用用ステータス部品", 20, 230, { color: "#ffffff" }),
              sampleTextItem("Reusable_Hp_Label", 20, 62, "HP", 16, 40, { color: "#ffc0c0" }),
              sampleGaugeItem("Reusable_Hp", 64, 66, 190, 14, 62, 100, "", "#ff6060", "#ffb0b0", "horizontal", "leftToRight")
            ], { opacity: 220 }),
            sampleWindowBase("Reusable_Image_Block", "tutorial_save_targets", 428, 286, 256, 170, [
              sampleImagePlaceholderItem("Reusable_Image_Slot", 20, 24, 100, 100, "好みのアイコン/立ち絵を設定"),
              sampleTextItem("Reusable_Image_Note", 132, 54, "画像差し替え用\nスロット", 14, 96, { align: "center", color: "#cfe0ff" })
            ], { opacity: 220 })
          ]
        }
      },
      {
        id: "advStatusMenu",
        kind: "scene",
        category: "advanced",
        name: "応用編 01：ステータスメニュー構成",
        description: "実ゲームのステータス画面を想定した改変用サンプルです。",
        savedAt: "sample",
        version: TOOL_VERSION,
        data: {
          scene: { id: "Adv_StatusMenu", name: "Adv_StatusMenu", groupIds: ["status_root", "actor_info", "gauge_group", "param_group"], includeUngrouped: false },
          groups: [
            { id: "status_root", name: "背景・立ち絵枠", visible: true, locked: false },
            { id: "actor_info", name: "名前・職業ブロック", visible: true, locked: false },
            { id: "gauge_group", name: "HP/MP/TPゲージ", visible: true, locked: false },
            { id: "param_group", name: "能力値リスト", visible: true, locked: false }
          ],
          windows: [
            sampleWindowBase("Status_Background_Window", "status_root", 40, 36, 736, 520, [
              sampleTextItem("Status_Title", 22, 14, "STATUS", 30, 240, { color: "#ffffff" }),
              sampleImagePlaceholderItem("Status_BG_Slot", 22, 72, 690, 430, "背景画像を設定してください"),
              sampleTextItem("Status_BG_Note", 26, 80, "背景画像スロット", 14, 180, { color: "#a8bad8" })
            ], { opacity: 210 }),
            sampleWindowBase("Actor_Stand_Window", "status_root", 62, 118, 220, 360, [
              sampleImagePlaceholderItem("Actor_Stand_Slot", 12, 12, 190, 300, "立ち絵画像を設定してください"),
              sampleTextItem("Stand_Note", 18, 320, "立ち絵差し替え用", 14, 180, { align: "center", color: "#9fb0c8" })
            ]),
            sampleWindowBase("Actor_Info_Window", "actor_info", 310, 108, 420, 116, [
              sampleTextItem("Actor_Name", 22, 12, "主人公", 28, 180, { color: "#ffffff" }),
              sampleTextItem("Actor_Level", 250, 18, "Lv 12", 22, 100, { color: "#ffffff" }),
              sampleTextItem("Actor_Class", 24, 58, "クラス：見習い冒険者", 18, 260, { color: "#cfe0ff" })
            ]),
            sampleWindowBase("Gauge_Window", "gauge_group", 310, 242, 420, 160, [
              sampleTextItem("Hp_Label", 20, 16, "HP", 18, 50, { color: "#ffc0c0" }),
              sampleGaugeItem("Hp_Gauge", 70, 20, 250, 16, 75, 100, "", "#ff5a5a", "#ffb0b0"),
              sampleTextItem("Mp_Label", 20, 52, "MP", 18, 50, { color: "#b8d4ff" }),
              sampleGaugeItem("Mp_Gauge", 70, 56, 250, 16, 42, 80, "", "#4b8bff", "#b8d4ff"),
              sampleTextItem("Tp_Label", 338, 18, "TP", 16, 50, { align: "center", color: "#ffe7a0" }),
              sampleGaugeItem("Tp_Circle", 332, 42, 58, 58, 35, 100, "", "#ffd15a", "#fff0a8", "circle", "clockwise", 0)
            ]),
            sampleWindowBase("Parameter_Window", "param_group", 310, 420, 420, 92, [
              sampleTextItem("Param_ATK", 20, 10, "攻撃  24", 18, 120),
              sampleTextItem("Param_DEF", 160, 10, "防御  18", 18, 120),
              sampleTextItem("Param_MAT", 20, 42, "魔法  31", 18, 120),
              sampleTextItem("Param_AGI", 160, 42, "敏捷  22", 18, 120)
            ])
          ]
        }
      },
      {
        id: "advBattleHud",
        kind: "scene",
        category: "advanced",
        name: "応用編 02：戦闘HUD構成",
        description: "戦闘中UI（HP/MPや敵情報表示）を想定した改変用サンプルです。",
        savedAt: "sample",
        version: TOOL_VERSION,
        data: {
          scene: { id: "Adv_BattleHud", name: "Adv_BattleHud", groupIds: ["hud_player", "hud_enemy", "hud_fx"], includeUngrouped: false },
          groups: [
            { id: "hud_player", name: "プレイヤーHUD", visible: true, locked: false },
            { id: "hud_enemy", name: "敵表示", visible: true, locked: false },
            { id: "hud_fx", name: "演出ラベル", visible: true, locked: false }
          ],
          windows: [
            sampleWindowBase("PlayerHud_Window", "hud_player", 24, 468, 430, 132, [
              sampleImagePlaceholderItem("PlayerFace_Slot", 12, 12, 96, 96, "顔グラ差し替え"),
              sampleTextItem("Player_Name", 124, 14, "主人公", 22, 180, { color: "#ffffff" }),
              sampleGaugeItem("Battle_HP", 124, 50, 250, 14, 78, 100, "", "#ff5a5a", "#ffb0b0"),
              sampleGaugeItem("Battle_MP", 124, 76, 250, 14, 44, 100, "", "#4b8bff", "#b8d4ff")
            ], { opacity: 215 }),
            sampleWindowBase("EnemyHud_Window", "hud_enemy", 504, 32, 288, 180, [
              sampleImagePlaceholderItem("EnemyPortrait_Slot", 20, 18, 112, 112, "敵画像差し替え"),
              sampleTextItem("Enemy_Name", 146, 26, "Enemy", 20, 120, { color: "#ffffff" }),
              sampleGaugeItem("Enemy_HP", 146, 62, 118, 12, 55, 100, "", "#ff6a6a", "#ffc0c0")
            ]),
            sampleWindowBase("BattleFx_Window", "hud_fx", 266, 24, 250, 56, [
              sampleTextItem("Fx_Label", 16, 12, "CRITICAL!", 30, 220, { align: "center", color: "#ffe17d" })
            ], { opacity: 150 })
          ]
        }
      },
      {
        id: "advDialogueChoice",
        kind: "scene",
        category: "advanced",
        name: "応用編 03：会話 + 選択肢UI",
        description: "会話ウィンドウ・立ち絵・選択肢を組み合わせた実戦サンプルです。",
        savedAt: "sample",
        version: TOOL_VERSION,
        data: {
          scene: { id: "Adv_DialogueChoice", name: "Adv_DialogueChoice", groupIds: ["dialogue_bg", "dialogue_message", "dialogue_choices"], includeUngrouped: false },
          groups: [
            { id: "dialogue_bg", name: "背景・立ち絵", visible: true, locked: false },
            { id: "dialogue_message", name: "会話ウィンドウ", visible: true, locked: false },
            { id: "dialogue_choices", name: "選択肢", visible: true, locked: false }
          ],
          windows: [
            sampleWindowBase("Dialogue_Background_Window", "dialogue_bg", 22, 20, 772, 372, [
              sampleImagePlaceholderItem("Dialogue_BG_Slot", 12, 12, 744, 344, "背景画像を設定"),
              sampleImagePlaceholderItem("Dialogue_Stand_Slot", 490, 32, 250, 314, "立ち絵を設定")
            ], { opacity: 200 }),
            sampleWindowBase("Dialogue_Message_Window", "dialogue_message", 30, 404, 760, 152, [
              sampleTextItem("Speaker_Name", 18, 12, "案内役", 22, 180, { color: "#ffe7a0" }),
              sampleTextItem("Message_Line", 20, 54, "ここに会話文を表示します。改行して複数行にもできます。", 18, 700, { color: "#ffffff" })
            ]),
            sampleWindowBase("Dialogue_Choice_Window", "dialogue_choices", 548, 250, 230, 132, [
              { type: "choiceList", id: "Dialogue_Choices", x: 16, y: 16, width: 190, lineHeight: 30, choices: ["はい", "いいえ", "あとで"], zOrder: 0, visible: true }
            ], { opacity: 218 })
          ]
        }
      }
    ];
  }

  function normalizeSampleCategory(category) {
    const value = String(category || "advanced").toLowerCase();
    if (value === "basic") return "basic";
    if (value === "advanced") return "advanced";
    return "custom";
  }

  function sampleCategoryLabel(category) {
    const value = normalizeSampleCategory(category);
    if (value === "basic") return "基礎編";
    if (value === "advanced") return "応用編";
    return "カスタム";
  }

  function sampleCategoryOrder(category) {
    const value = normalizeSampleCategory(category);
    if (value === "basic") return 1;
    if (value === "advanced") return 2;
    return 3;
  }

  function normalizeSampleSceneTemplateEntry(entry, fallbackCategory = "advanced") {
    const base = normalizeComponentTemplateEntry(entry, "scene");
    return Object.assign(base, {
      sampleId: safeId(entry?.sampleId || base.id || "sampleScene", "sampleScene"),
      category: normalizeSampleCategory(entry?.category || fallbackCategory),
      description: String(entry?.description || ""),
      source: String(entry?.source || "builtin"),
      backupAvailable: entry?.backupAvailable === true,
      isCustom: entry?.isCustom === true
    });
  }

  function builtinSampleSceneTemplates() {
    return createSampleSceneTemplates().map(entry => normalizeSampleSceneTemplateEntry(Object.assign({}, entry, {
      source: "builtin",
      backupAvailable: false,
      isCustom: false
    }), entry.category || "advanced"));
  }

  function loadCustomSampleSceneTemplates() {
    try {
      const raw = localStorage.getItem(SAMPLE_SCENE_CUSTOM_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.map(entry => normalizeSampleSceneTemplateEntry(Object.assign({}, entry, {
        source: "custom",
        isCustom: true
      }), entry?.category || "custom"));
    } catch (_) {
      return [];
    }
  }

  function saveCustomSampleSceneTemplates(list) {
    try {
      localStorage.setItem(SAMPLE_SCENE_CUSTOM_KEY, JSON.stringify(Array.isArray(list) ? list : []));
      return true;
    } catch (_) {
      showToast("サンプル保存に失敗しました（ブラウザ保存領域）");
      return false;
    }
  }

  function sampleSceneTemplates() {
    const builtins = builtinSampleSceneTemplates();
    const builtinsById = new Map(builtins.map(entry => [entry.sampleId, entry]));
    const custom = loadCustomSampleSceneTemplates();
    const merged = new Map();
    for (const builtin of builtins) {
      merged.set(builtin.sampleId, normalizeSampleSceneTemplateEntry(Object.assign({}, builtin, {
        source: "builtin",
        backupAvailable: false,
        isCustom: false
      }), builtin.category));
    }
    for (const customEntry of custom) {
      const sampleId = customEntry.sampleId;
      const hasBackup = builtinsById.has(sampleId);
      merged.set(sampleId, normalizeSampleSceneTemplateEntry(Object.assign({}, customEntry, {
        source: hasBackup ? "custom-override" : "custom",
        backupAvailable: hasBackup,
        isCustom: true
      }), customEntry.category));
    }
    return Array.from(merged.values()).sort((a, b) => {
      const ao = sampleCategoryOrder(a.category);
      const bo = sampleCategoryOrder(b.category);
      if (ao !== bo) return ao - bo;
      return String(a.name || a.sampleId).localeCompare(String(b.name || b.sampleId), "ja");
    });
  }

  function activeSceneSampleLink() {
    const scene = activeScene();
    if (!scene) return null;
    const links = ensureSceneSampleLinks();
    return links[scene.id] || null;
  }

  function saveCurrentSceneToSampleEntry(sampleDef = {}) {
    const scene = activeScene();
    if (!scene) {
      showToast("保存対象シーンがありません");
      return false;
    }
    const payload = buildTemplatePayload({ kind: "scene", sceneId: scene.id });
    if (!payload?.scene) {
      showToast("シーン保存データを作成できませんでした");
      return false;
    }
    const sampleId = safeId(sampleDef.sampleId || sampleDef.id || scene.id || "sampleScene", "sampleScene");
    const category = normalizeSampleCategory(sampleDef.category || activeSceneSampleLink()?.category || "custom");
    const name = String(sampleDef.name || scene.name || sampleId).trim() || sampleId;
    const description = String(sampleDef.description || "").trim();
    const customList = loadCustomSampleSceneTemplates();
    const next = normalizeSampleSceneTemplateEntry({
      id: sampleId,
      sampleId,
      kind: "scene",
      name,
      category,
      description,
      savedAt: new Date().toISOString(),
      version: TOOL_VERSION,
      source: "custom",
      data: scrubTemplateData(payload)
    }, category);
    const filtered = customList.filter(entry => String(entry.sampleId || entry.id || "") !== sampleId);
    filtered.push(next);
    if (!saveCustomSampleSceneTemplates(filtered)) return false;
    runStateMutation("シーンサンプル紐付け", () => {
      const links = ensureSceneSampleLinks();
      links[scene.id] = { sampleId, category, name };
    });
    showToast(`サンプル保存しました: ${name}`);
    return true;
  }

  function saveCurrentSceneAsNewSamplePrompt() {
    const scene = activeScene();
    if (!scene) {
      showToast("保存対象シーンがありません");
      return false;
    }
    const defaultName = scene.name || scene.id || "新規サンプル";
    const name = window.prompt ? window.prompt("サンプル名を入力してください", defaultName) : defaultName;
    if (name === null) return false;
    const defaultId = safeId(`${scene.id || "sample"}_custom`, "sample_custom");
    const sampleId = window.prompt ? window.prompt("サンプルIDを入力してください（半角英数/記号）", defaultId) : defaultId;
    if (sampleId === null) return false;
    const categoryRaw = window.prompt ? window.prompt("カテゴリを入力してください（basic / advanced / custom）", "custom") : "custom";
    if (categoryRaw === null) return false;
    return saveCurrentSceneToSampleEntry({
      sampleId,
      name: String(name || "").trim() || defaultName,
      category: normalizeSampleCategory(categoryRaw),
      description: `ユーザー保存 (${new Date().toLocaleString("ja-JP")})`
    });
  }

  function saveCurrentSceneToLinkedSample() {
    const linked = activeSceneSampleLink();
    if (!linked?.sampleId) {
      showToast("このシーンはサンプルに紐付いていません。新規保存を使ってください。");
      return false;
    }
    const current = sampleSceneTemplates().find(entry => entry.sampleId === linked.sampleId);
    return saveCurrentSceneToSampleEntry({
      sampleId: linked.sampleId,
      name: current?.name || linked.name || activeScene()?.name || linked.sampleId,
      category: current?.category || linked.category || "custom",
      description: current?.description || ""
    });
  }

  function resetSampleSceneToBackup(sampleId) {
    const key = String(sampleId || "").trim();
    if (!key) return false;
    const custom = loadCustomSampleSceneTemplates();
    const next = custom.filter(entry => String(entry.sampleId || entry.id || "") !== key);
    if (next.length === custom.length) return false;
    if (!saveCustomSampleSceneTemplates(next)) return false;
    showToast(`サンプルを初期化しました: ${key}`);
    return true;
  }

  function resetAllSampleSceneCustomizations() {
    if (!saveCustomSampleSceneTemplates([])) return false;
    showToast("サンプルのカスタム保存をすべて初期化しました");
    return true;
  }

  function chooseSampleSceneTemplateAsync() {
    if (!sampleSceneTemplates().length) {
      showToast("読み込めるサンプルがありません");
      return Promise.resolve(null);
    }
    return new Promise(resolve => {
      const existing = document.getElementById("dbSamplePickerOverlay");
      if (existing) existing.remove();
      const overlay = document.createElement("div");
      overlay.id = "dbSamplePickerOverlay";
      overlay.style.cssText = "position:fixed;inset:0;z-index:999999;background:rgba(0,0,0,.58);display:flex;align-items:center;justify-content:center;";
      const panel = document.createElement("div");
      panel.style.cssText = "width:min(780px,calc(100vw - 40px));max-height:calc(100vh - 60px);overflow:auto;background:#161d2b;color:#eef4ff;border:1px solid #40506d;border-radius:12px;box-shadow:0 18px 48px rgba(0,0,0,.45);padding:16px;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;";
      const title = document.createElement("div");
      title.textContent = "サンプル管理";
      title.style.cssText = "font-size:18px;font-weight:800;margin-bottom:6px;";
      const help = document.createElement("div");
      help.textContent = "基礎編/応用編を選んで読み込みます。現在シーンの保存や初期化（バックアップ復元）もここで実行できます。";
      help.style.cssText = "font-size:12px;color:#b9c8df;margin-bottom:12px;";
      const controls = document.createElement("div");
      controls.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;";
      const saveNewBtn = document.createElement("button");
      saveNewBtn.type = "button";
      saveNewBtn.textContent = "現在シーンを新規サンプル保存";
      saveNewBtn.style.cssText = "border:1px solid #466ca1;background:#2a4668;color:#fff;border-radius:8px;padding:8px 10px;cursor:pointer;";
      const saveLinkedBtn = document.createElement("button");
      saveLinkedBtn.type = "button";
      saveLinkedBtn.textContent = "現在シーンを紐付サンプルへ上書き";
      saveLinkedBtn.style.cssText = "border:1px solid #4a5b76;background:#283449;color:#fff;border-radius:8px;padding:8px 10px;cursor:pointer;";
      const resetAllBtn = document.createElement("button");
      resetAllBtn.type = "button";
      resetAllBtn.textContent = "サンプル編集を全初期化";
      resetAllBtn.style.cssText = "border:1px solid #8d5562;background:#4d2d38;color:#fff;border-radius:8px;padding:8px 10px;cursor:pointer;";
      controls.appendChild(saveNewBtn);
      controls.appendChild(saveLinkedBtn);
      controls.appendChild(resetAllBtn);
      const listBox = document.createElement("div");
      listBox.style.cssText = "display:flex;flex-direction:column;gap:8px;";
      const cleanup = value => {
        overlay.remove();
        document.removeEventListener("keydown", onKeyDown, true);
        resolve(value);
      };
      const onKeyDown = ev => {
        if (ev.key === "Escape") {
          ev.preventDefault();
          ev.stopPropagation();
          cleanup(null);
        }
      };
      document.addEventListener("keydown", onKeyDown, true);

      const renderList = () => {
        listBox.innerHTML = "";
        const grouped = new Map([["basic", []], ["advanced", []], ["custom", []]]);
        for (const entry of sampleSceneTemplates()) {
          const category = normalizeSampleCategory(entry.category);
          if (!grouped.has(category)) grouped.set(category, []);
          grouped.get(category).push(entry);
        }
        for (const category of ["basic", "advanced", "custom"]) {
          const entries = grouped.get(category) || [];
          if (!entries.length) continue;
          const heading = document.createElement("div");
          heading.textContent = sampleCategoryLabel(category);
          heading.style.cssText = "font-size:13px;font-weight:800;color:#c9d8f4;margin:8px 0 4px;";
          listBox.appendChild(heading);
          for (const entry of entries) {
            const card = document.createElement("div");
            card.style.cssText = "border:1px solid #435574;background:#222d42;border-radius:8px;padding:10px 12px;";
            const titleRow = document.createElement("div");
            titleRow.style.cssText = "display:flex;gap:8px;align-items:flex-start;justify-content:space-between;";
            const info = document.createElement("div");
            info.innerHTML = `<div style="font-weight:800;">${escapeHtml(entry.name || entry.sampleId)}</div><div style="font-size:11px;color:#aebbd1;margin-top:3px;">${escapeHtml(entry.sampleId || "sample")}</div>${entry.description ? `<div style="font-size:11px;color:#c7d7f2;margin-top:4px;">${escapeHtml(entry.description)}</div>` : ""}`;
            const actions = document.createElement("div");
            actions.style.cssText = "display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;";
            const loadBtn = document.createElement("button");
            loadBtn.type = "button";
            loadBtn.textContent = "読込";
            loadBtn.style.cssText = "border:1px solid #4f6991;background:#32507a;color:#fff;border-radius:7px;padding:6px 10px;cursor:pointer;";
            loadBtn.addEventListener("click", ev => {
              ev.preventDefault();
              ev.stopPropagation();
              cleanup(entry);
            });
            const saveBtn = document.createElement("button");
            saveBtn.type = "button";
            saveBtn.textContent = "現在シーンで上書き";
            saveBtn.style.cssText = "border:1px solid #4a5b76;background:#2b394f;color:#fff;border-radius:7px;padding:6px 10px;cursor:pointer;";
            saveBtn.addEventListener("click", ev => {
              ev.preventDefault();
              ev.stopPropagation();
              if (saveCurrentSceneToSampleEntry({
                sampleId: entry.sampleId,
                name: entry.name,
                category: entry.category,
                description: entry.description
              })) renderList();
            });
            actions.appendChild(loadBtn);
            actions.appendChild(saveBtn);
            if (entry.isCustom) {
              const resetBtn = document.createElement("button");
              resetBtn.type = "button";
              resetBtn.textContent = entry.backupAvailable ? "初期化" : "削除";
              resetBtn.style.cssText = "border:1px solid #875566;background:#4d2f3b;color:#fff;border-radius:7px;padding:6px 10px;cursor:pointer;";
              resetBtn.addEventListener("click", ev => {
                ev.preventDefault();
                ev.stopPropagation();
                const message = entry.backupAvailable
                  ? `サンプル「${entry.name}」を初期状態へ戻します。よろしいですか？`
                  : `カスタムサンプル「${entry.name}」を削除します。よろしいですか？`;
                if (!confirm(message)) return;
                if (resetSampleSceneToBackup(entry.sampleId)) renderList();
              });
              actions.appendChild(resetBtn);
            }
            titleRow.appendChild(info);
            titleRow.appendChild(actions);
            card.appendChild(titleRow);
            listBox.appendChild(card);
          }
        }
      };

      saveNewBtn.addEventListener("click", ev => {
        ev.preventDefault();
        ev.stopPropagation();
        if (saveCurrentSceneAsNewSamplePrompt()) renderList();
      });
      saveLinkedBtn.addEventListener("click", ev => {
        ev.preventDefault();
        ev.stopPropagation();
        if (saveCurrentSceneToLinkedSample()) renderList();
      });
      resetAllBtn.addEventListener("click", ev => {
        ev.preventDefault();
        ev.stopPropagation();
        if (!confirm("カスタム保存したサンプルをすべて初期化します。よろしいですか？")) return;
        if (resetAllSampleSceneCustomizations()) renderList();
      });

      renderList();
      const footer = document.createElement("div");
      footer.style.cssText = "display:flex;justify-content:flex-end;margin-top:14px;";
      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.textContent = "閉じる";
      cancel.style.cssText = "border:1px solid #4a5b76;background:#283449;color:#fff;border-radius:8px;padding:8px 12px;cursor:pointer;";
      cancel.addEventListener("click", ev => {
        ev.preventDefault();
        ev.stopPropagation();
        cleanup(null);
      });
      footer.appendChild(cancel);
      panel.appendChild(title);
      panel.appendChild(help);
      panel.appendChild(controls);
      panel.appendChild(listBox);
      panel.appendChild(footer);
      overlay.appendChild(panel);
      overlay.addEventListener("click", ev => {
        if (ev.target === overlay) cleanup(null);
      });
      document.body.appendChild(overlay);
      const first = listBox.querySelector("button");
      if (first) first.focus();
    });
  }

  async function loadSampleScene() {
    const sample = await chooseSampleSceneTemplateAsync();
    if (!sample) return false;
    const ok = loadComponentTemplate(sample, { kind: "scene", sceneId: state.activeSceneId || "" });
    if (ok) showToast(`サンプル「${sample.name}」を最後尾へ追加しました`);
    return ok;
  }

  function confirmDeleteWindowFromList(win) {
    if (!win) return;
    if (!confirm(`ウィンドウ「${win.id}」を削除します。よろしいですか？`)) return;
    deleteWindow(win.id);
  }

  function confirmDeleteItemFromList(win, item) {
    if (!win || !item) return;
    if (!confirm(`パーツ「${item.id}」を削除します。よろしいですか？`)) return;
    deleteItem(win.id, item.id);
  }

  function confirmDeleteGroupFromList(group) {
    if (!group) return;
    const count = windowsInGroup(group.id).length;
    if (!confirm(`グループ「${group.name || group.id}」を削除します。所属ウィンドウ ${count}件も一緒に削除されます。よろしいですか？`)) return;
    deleteGroup(group.id);
  }

  function confirmDeleteSelectedObject() {
    if (!selected) return false;
    if (selected.kind === "window") {
      const win = selectedWindow();
      if (!win) return false;
      if (!confirm(`ウィンドウ「${win.id}」を削除します。よろしいですか？`)) return false;
      return deleteSelectedObject();
    }
    if (selected.kind === "item") {
      const win = selectedWindow();
      const item = selectedItem();
      if (!win || !item) return false;
      if (!confirm(`パーツ「${item.id}」を削除します。よろしいですか？`)) return false;
      return deleteSelectedObject();
    }
    if (selected.kind === "group") {
      const group = selectedGroup();
      if (!group) return false;
      const count = windowsInGroup(group.id).length;
      if (!confirm(`グループ「${group.name || group.id}」を削除します。所属ウィンドウ ${count}件も一緒に削除されます。よろしいですか？`)) return false;
      return deleteSelectedObject();
    }
    return false;
  }

  function createObjectTypeBadge(kind = "", text = "") {
    const badge = document.createElement("span");
    const normalizedKind = String(kind || "").toLowerCase();
    badge.className = `object-type-badge object-type-${normalizedKind}`.trim();
    badge.textContent = String(text || kind || "").trim() || "OBJ";
    return badge;
  }

  function createObjectRowLabel(primaryText, metaText = "", noteText = "", typeKind = "", typeText = "") {
    const label = document.createElement("span");
    label.className = "object-row-label";

    if (typeKind || typeText) {
      label.appendChild(createObjectTypeBadge(typeKind || typeText, typeText || typeKind));
    }

    const main = document.createElement("span");
    main.className = "object-row-label-main";
    main.textContent = String(primaryText || "");
    label.appendChild(main);

    if (metaText) {
      const meta = document.createElement("small");
      meta.className = "object-row-label-meta";
      meta.textContent = String(metaText);
      label.appendChild(meta);
    }

    if (noteText) {
      const note = document.createElement("small");
      note.className = "object-row-label-note";
      note.textContent = String(noteText);
      label.appendChild(note);
    }

    return label;
  }


  function makeObjectRowNameEditable(label, options = {}) {
    const main = label?.querySelector?.(".object-row-label-main");
    if (!main || typeof options.onCommit !== "function") return label;
    const originalTitle = main.title || "";
    main.classList.add("object-row-name-editable");
    main.title = [originalTitle, "ダブルクリックで名前編集"].filter(Boolean).join(" / ");

    const startEdit = ev => {
      if (ev) {
        ev.preventDefault();
        ev.stopPropagation();
      }
      if (main.querySelector("input")) return;
      const displayText = main.textContent;
      const input = document.createElement("input");
      input.type = "text";
      input.className = "object-row-rename-input";
      input.value = String(typeof options.getValue === "function" ? options.getValue() : displayText || "");
      main.textContent = "";
      main.appendChild(input);
      ["click", "dblclick", "pointerdown", "mousedown", "mouseup", "contextmenu", "dragstart"].forEach(type => {
        input.addEventListener(type, e => e.stopPropagation());
      });
      let done = false;
      const finish = commit => {
        if (done) return;
        done = true;
        const value = String(input.value || "").trim();
        if (commit && value) {
          options.onCommit(value);
        } else {
          main.textContent = displayText;
        }
      };
      input.addEventListener("keydown", e => {
        e.stopPropagation();
        if (e.key === "Enter") {
          e.preventDefault();
          finish(true);
        } else if (e.key === "Escape") {
          e.preventDefault();
          finish(false);
        }
      });
      input.addEventListener("blur", () => finish(true));
      setTimeout(() => {
        input.focus();
        input.select();
      }, 0);
    };

    // 名前文字のわずかな位置ズレやバッジ側を押してしまう場合でも、
    // ラベル内の操作ボタン以外なら名前編集へ入れるようにする。
    label._dbStartRename = startEdit;
    main.addEventListener("dblclick", startEdit);
    label.addEventListener("dblclick", ev => {
      const target = ev.target;
      if (target?.closest?.("button,input,select,textarea,.object-row-control-strip,.object-row-actions")) return;
      startEdit(ev);
    });
    return label;
  }

  function createGroupRowLabel(primaryText, metaText = "", collapsed = false, onToggle = null) {
    const label = document.createElement("span");
    label.className = "object-row-label group-row-label";
    label.appendChild(createObjectTypeBadge("group", "GROUP"));

    const main = document.createElement("span");
    main.className = "object-row-label-main";
    main.textContent = String(primaryText || "");
    label.appendChild(main);

    if (metaText) {
      const meta = document.createElement("small");
      meta.className = "object-row-label-meta";
      meta.textContent = String(metaText);
      label.appendChild(meta);
    }

    return label;
  }


  function createWindowRowLabel(primaryText, metaText = "", noteText = "", collapsed = false, onToggle = null) {
    const label = document.createElement("span");
    label.className = "object-row-label window-row-label";
    label.appendChild(createObjectTypeBadge("window", "WINDOW"));

    const main = document.createElement("span");
    main.className = "object-row-label-main";
    main.textContent = String(primaryText || "");
    label.appendChild(main);

    if (metaText) {
      const meta = document.createElement("small");
      meta.className = "object-row-label-meta";
      meta.textContent = String(metaText);
      label.appendChild(meta);
    }

    if (noteText) {
      const note = document.createElement("small");
      note.className = "object-row-label-note";
      note.textContent = String(noteText);
      label.appendChild(note);
    }

    return label;
  }


  function objectListStatusText(parts) {
    return (parts || []).filter(Boolean).join(" / ");
  }

  function createObjectRowActions() {
    const actions = document.createElement("div");
    actions.className = "object-row-actions";
    return actions;
  }

  function promptObjectName(message, fallback) {
    try {
      if (typeof window.prompt === "function") {
        const value = window.prompt(message, fallback);
        if (value === null) return null;
        return String(value || fallback).trim() || fallback;
      }
    } catch (e) {
      debugLog("warn", "名前入力ダイアログを表示できなかったため既定名で作成します。", { message: e?.message || String(e) });
    }
    return fallback;
  }

  function uniqueDisplayName(base, entries) {
    const label = String(base || "新規").trim() || "新規";
    const used = new Set((entries || []).map(entry => String(entry?.name || "").trim()).filter(Boolean));
    if (!used.has(label)) return label;
    let index = 2;
    let candidate = `${label}${index}`;
    while (used.has(candidate)) candidate = `${label}${++index}`;
    return candidate;
  }

  function createSceneFromListAction(name = "") {
    const sceneLabel = String(name || "").trim() || uniqueDisplayName("新規シーン", ensureScenes());
    let id = "";
    runStateMutation("シーン追加", () => {
      id = createSceneObject(sceneLabel);
      selected = { kind: "scene", sceneId: id };
      pendingObjectListReveal = true;
    });
    if (id) showToast("シーンを追加しました。名前は右側プロパティで変更できます");
    return id;
  }

  function createGroupFromListAction(name = "") {
    const groupLabel = String(name || "").trim() || uniqueDisplayName("新規グループ", ensureGroups());
    let id = "";
    runStateMutation("グループ追加", () => {
      ensureScenes();
      id = createGroupObject(groupLabel);
      addGroupIdToActiveScene(id);
      // 新規グループ作成は空グループとして追加します。
      // 以前は選択中ウィンドウを新規グループへ移していましたが、一覧整理中に事故りやすいため廃止しました。
      selected = { kind: "group", groupId: id };
      objectListCollapsedGroups.delete(id);
      pendingObjectListReveal = true;
    });
    if (id) showToast("グループを追加しました。必要ならウィンドウをドラッグで移動してください");
    return id;
  }


  function syncHierarchyZOrderFromList() {
    const scene = activeScene();
    const sceneGroupIds = scene && Array.isArray(scene.groupIds) ? scene.groupIds : [];
    const groupOrder = scene ? sceneGroupIds : (state.groups || []).map(group => group.id);
    const orderedWindows = [];
    for (const groupId of groupOrder) {
      for (const win of state.windows || []) {
        if (normalizeGroupId(win.groupId || "") === normalizeGroupId(groupId)) orderedWindows.push(win);
      }
    }
    for (const win of state.windows || []) {
      if (!orderedWindows.includes(win)) orderedWindows.push(win);
    }
    // 一覧は Photoshop レイヤー同様に「上ほど手前、下ほど奥」で同期します。
    const totalWin = orderedWindows.length;
    orderedWindows.forEach((win, index) => { win.zOrder = totalWin - index; });
    for (const win of state.windows || []) {
      const items = Array.isArray(win.items) ? win.items : [];
      const total = items.length;
      items.forEach((item, index) => { item.zOrder = total - index; });
    }
  }

  function reorderIds(list, movedId, targetId, position = "before") {
    const arr = Array.isArray(list) ? list.slice() : [];
    const from = arr.indexOf(movedId);
    if (from >= 0) arr.splice(from, 1);
    let to = targetId ? arr.indexOf(targetId) : arr.length;
    if (to < 0) to = arr.length;
    if (position === "after") to += 1;
    arr.splice(Math.max(0, Math.min(arr.length, to)), 0, movedId);
    return arr.filter((id, index, self) => id && self.indexOf(id) === index);
  }

  function reorderGroupByList(groupId, targetGroupId, position = "before") {
    if (!groupById(groupId) || !groupById(targetGroupId) || groupId === targetGroupId) return;
    runStateMutation("一覧グループ順変更", () => {
      const scene = activeScene();
      if (scene) scene.groupIds = reorderIds(scene.groupIds || [], groupId, targetGroupId, position);
      const order = reorderIds((state.groups || []).map(group => group.id), groupId, targetGroupId, position);
      state.groups = order.map(id => (state.groups || []).find(group => group.id === id)).filter(Boolean);
      selected = { kind: "group", groupId };
      syncHierarchyZOrderFromList();
    });
  }

  function moveWindowToGroupAt(windowId, targetGroupId, targetWindowId = "", position = "after") {
    const win = (state.windows || []).find(entry => entry.id === windowId);
    if (!win) return;
    runStateMutation("一覧ウィンドウ順変更", () => {
      const groupId = normalizeGroupId(targetGroupId || win.groupId || "");
      if (groupId) {
        const scene = activeScene();
        if (scene) addGroupIdToScene(scene, groupId);
      }
      win.groupId = groupId;
      const others = (state.windows || []).filter(entry => entry !== win);
      const groupWins = others.filter(entry => normalizeGroupId(entry.groupId || "") === groupId);
      let insertIndexInGroup = groupWins.length;
      if (targetWindowId) {
        const targetIndex = groupWins.findIndex(entry => entry.id === targetWindowId);
        if (targetIndex >= 0) insertIndexInGroup = targetIndex + (position === "after" ? 1 : 0);
      } else if (position === "before") {
        insertIndexInGroup = 0;
      }
      groupWins.splice(Math.max(0, Math.min(groupWins.length, insertIndexInGroup)), 0, win);
      const rebuilt = [];
      const seen = new Set();
      for (const group of ensureGroups()) {
        const gid = normalizeGroupId(group.id || "");
        const list = gid === groupId ? groupWins : others.filter(entry => normalizeGroupId(entry.groupId || "") === gid);
        for (const entry of list) if (!seen.has(entry)) { rebuilt.push(entry); seen.add(entry); }
      }
      for (const entry of others) if (!seen.has(entry)) { rebuilt.push(entry); seen.add(entry); }
      state.windows = rebuilt;
      normalizeWindowIds();
      selected = { kind: "window", windowId: win.id };
      objectListCollapsedGroups.delete(groupId);
      syncHierarchyZOrderFromList();
    });
  }

  function moveItemToWindowAt(sourceWindowId, itemId, targetWindowId, targetItemId = "", position = "after") {
    const sourceWin = (state.windows || []).find(entry => entry.id === sourceWindowId);
    const targetWin = (state.windows || []).find(entry => entry.id === targetWindowId);
    const item = sourceWin?.items?.find(entry => entry.id === itemId);
    if (!sourceWin || !targetWin || !item) return;
    runStateMutation("一覧パーツ順変更", () => {
      sourceWin.items = (sourceWin.items || []).filter(entry => entry !== item);
      targetWin.items = Array.isArray(targetWin.items) ? targetWin.items : [];
      item.id = safeItemIdForWindow(targetWin, item.id, item.id || "item", item);
      item.displayName = safeItemDisplayNameForWindow(targetWin, itemDisplayName(item), item.id || "要素", item);
      let index = targetWin.items.length;
      if (targetItemId) {
        const targetIndex = targetWin.items.findIndex(entry => entry.id === targetItemId);
        if (targetIndex >= 0) index = targetIndex + (position === "after" ? 1 : 0);
      } else if (position === "before") {
        index = 0;
      }
      targetWin.items.splice(Math.max(0, Math.min(targetWin.items.length, index)), 0, item);
      selected = { kind: "item", windowId: targetWin.id, itemId: item.id };
      objectListCollapsedWindows.delete(targetWin.id);
      syncHierarchyZOrderFromList();
    });
  }

  function moveItemToGroupAt(sourceWindowId, itemId, targetGroupId, position = "after") {
    const groupId = normalizeGroupId(targetGroupId || "");
    if (!groupId) return;
    const targetWin = (state.windows || []).find(entry => normalizeGroupId(entry.groupId || "") === groupId) || null;
    if (!targetWin) {
      showToast("移動先グループにウィンドウがありません。先にウィンドウを作成してください。");
      return;
    }
    moveItemToWindowAt(sourceWindowId, itemId, targetWin.id, "", position);
  }

  function parseObjectListDragData(ev) {
    const raw = ev.dataTransfer?.getData("application/x-db-uicomposer-object") || ev.dataTransfer?.getData("text/plain") || "";
    try { return JSON.parse(raw); } catch (_) {}
    if (raw.startsWith("window:")) return { kind: "window", windowId: raw.slice("window:".length) };
    if (raw.startsWith("item:")) {
      const [windowId, itemId] = raw.slice("item:".length).split("/");
      return { kind: "item", windowId, itemId };
    }
    if (raw.startsWith("group:")) return { kind: "group", groupId: raw.slice("group:".length) };
    return objectListDragPayload && typeof objectListDragPayload === "object"
      ? Object.assign({}, objectListDragPayload)
      : null;
  }

  function clearObjectListDropMarks() {
    objectList.querySelectorAll(".drop-before,.drop-after,.drop-into").forEach(el => {
      el.classList.remove("drop-before", "drop-after", "drop-into");
      delete el.dataset.dropHint;
    });
  }

  function setObjectListSelectionDuringDrag(nextSelection, row) {
    if (!nextSelection || typeof nextSelection !== "object") return;
    selected = nextSelection;
    pendingObjectListReveal = false;
    const label = $("currentSelection");
    if (label) label.textContent = selectionLabel();
    const key = selectedObjectListKey();
    objectList.querySelectorAll(".object-row.active").forEach(el => el.classList.remove("active"));
    if (row?.classList?.contains("object-row")) {
      row.classList.add("active");
      return;
    }
    for (const el of objectList.querySelectorAll(".object-row[data-object-key]")) {
      if (el.dataset.objectKey === key) {
        el.classList.add("active");
        break;
      }
    }
  }

  function consumePreviewInlineEditDoubleClick(ev, key) {
    if (!ev || !key || ev.button !== 0) {
      previewInlineEditClickCycle = null;
      return false;
    }
    const now = performance.now();
    const prev = previewInlineEditClickCycle;
    const isSecond = !!prev
      && prev.key === key
      && now - prev.time <= 550
      && Math.abs((prev.x || 0) - (ev.clientX || 0)) <= 8
      && Math.abs((prev.y || 0) - (ev.clientY || 0)) <= 8;
    previewInlineEditClickCycle = isSecond ? null : {
      key,
      time: now,
      x: ev.clientX || 0,
      y: ev.clientY || 0
    };
    return isSecond;
  }

  function closePreviewInlineTextEditor(commit = true) {
    const session = previewInlineTextEditorState;
    if (!session) return;
    previewInlineTextEditorState = null;
    const { input, item, initialText, kind, row } = session;
    const nextText = String(input?.value ?? "");
    try { input?.remove(); } catch (_) {}
    row?.classList?.remove("preview-inline-editing");
    if (!commit || !item || nextText === initialText) return;
    runPropertyValueMutation(kind === "log" ? "プレビュー上ログ文字編集" : "プレビュー上テキスト編集", () => {
      if (kind === "log") item.sampleText = nextText;
      else item.text = nextText;
    });
  }

  function beginPreviewInlineTextEdit(win, item, row) {
    if (!win || !item || !row) return;
    const kind = item.type === "log" ? "log" : "text";
    if (kind !== "text" && kind !== "log") return;
    closePreviewInlineTextEditor(true);
    const input = document.createElement("textarea");
    input.className = "preview-inline-text-editor";
    if (kind === "log") input.classList.add("preview-inline-text-editor-log");
    else input.classList.add("preview-inline-text-editor-text");
    const initialText = String(kind === "log" ? (item.sampleText || "") : (item.text || ""));
    input.value = initialText;
    const computed = window.getComputedStyle(row);
    input.style.color = computed.color || "";
    input.style.textShadow = computed.textShadow || "none";
    input.style.fontFamily = computed.fontFamily || "";
    input.style.fontSize = computed.fontSize || "";
    input.style.fontWeight = computed.fontWeight || "";
    input.style.fontStyle = computed.fontStyle || "";
    input.style.webkitTextStroke = "0 transparent";
    input.style.paintOrder = "normal";
    input.style.textAlign = String(item.align || "left");
    input.style.lineHeight = `${previewLineHeight()}px`;
    row.classList.add("preview-inline-editing");
    row.appendChild(input);
    previewInlineTextEditorState = { input, item, initialText, kind, row };
    ["pointerdown", "mousedown", "click", "dblclick", "dragstart", "contextmenu"].forEach(type => {
      input.addEventListener(type, ev => {
        ev.stopPropagation();
      });
    });
    input.addEventListener("keydown", ev => {
      ev.stopPropagation();
      if (ev.key === "Escape") {
        ev.preventDefault();
        closePreviewInlineTextEditor(false);
      } else if ((ev.ctrlKey || ev.metaKey) && ev.key === "Enter") {
        ev.preventDefault();
        closePreviewInlineTextEditor(true);
      }
    });
    input.addEventListener("blur", () => closePreviewInlineTextEditor(true));
    setTimeout(() => {
      input.focus();
      input.select();
    }, 0);
  }

  function tryBeginFocusedInlineEditFromCapture(ev, hits) {
    if (selected?.kind !== "item") return false;
    const win = selectedWindow();
    const item = selectedItem();
    if (!win || !item) return false;
    if (item.type !== "text" && item.type !== "log") return false;
    const key = selectedCandidateKey();
    if (!key || !(hits || []).some(candidate => candidateKey(candidate) === key)) return false;
    const selectedRow = Array.from(preview.querySelectorAll(".ui-item.selected")).find(el =>
      el.dataset.windowId === win.id && el.dataset.itemId === item.id
    );
    const pointedRow = ev?.target?.closest?.(".ui-item");
    const targetRow = selectedRow || pointedRow;
    if (!targetRow) return false;
    if (targetRow.dataset.windowId !== win.id || targetRow.dataset.itemId !== item.id) return false;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    ev.stopPropagation();
    beginPreviewInlineTextEdit(win, item, targetRow);
    return true;
  }

  function autoScrollObjectListWhileDragging(clientY) {
    if (!objectListDragPayload) return;
    const rect = objectList.getBoundingClientRect();
    const edge = 44;
    const maxStep = 28;
    if (clientY < rect.top + edge) {
      const ratio = Math.max(0, (rect.top + edge - clientY) / edge);
      objectList.scrollTop -= Math.ceil(maxStep * ratio);
    } else if (clientY > rect.bottom - edge) {
      const ratio = Math.max(0, (clientY - (rect.bottom - edge)) / edge);
      objectList.scrollTop += Math.ceil(maxStep * ratio);
    }
  }

  function bindObjectListRowDrop(row, target) {
    const resolveDropPlacement = (ev, data) => {
      const rect = row.getBoundingClientRect();
      const edgeBand = Math.max(6, Math.min(12, Math.floor(rect.height * 0.24)));
      const nearTop = ev.clientY <= rect.top + edgeBand;
      const nearBottom = ev.clientY >= rect.bottom - edgeBand;
      const containerDrop = (target.kind === "group" && data.kind === "window")
        || (target.kind === "window" && data.kind === "item");
      const windowOverItemDrop = target.kind === "item" && data.kind === "window";
      const groupOverDescendantDrop = data.kind === "group" && (target.kind === "window" || target.kind === "item");
      if (containerDrop) {
        if (nearTop) return "before";
        if (nearBottom) return "after";
        return "";
      }
      if (windowOverItemDrop) {
        if (nearTop) return "before";
        if (nearBottom) return "after";
        return "";
      }
      if (groupOverDescendantDrop) {
        if (nearTop) return "before";
        if (nearBottom) return "after";
        return "";
      }
      return ev.clientY > rect.top + rect.height / 2 ? "after" : "before";
    };

    row.addEventListener("dragover", ev => {
      const data = parseObjectListDragData(ev);
      if (!data) return;
      let allowed = false;
      if (data.kind === "group" && target.kind === "group" && data.groupId !== target.groupId) allowed = true;
      if (data.kind === "group" && target.kind === "window") {
        const targetWin = (state.windows || []).find(entry => entry.id === target.windowId);
        const targetGroupId = normalizeGroupId(targetWin?.groupId || "");
        if (targetGroupId && data.groupId !== targetGroupId) allowed = true;
      }
      if (data.kind === "group" && target.kind === "item") {
        const targetWin = (state.windows || []).find(entry => entry.id === target.windowId);
        const targetGroupId = normalizeGroupId(targetWin?.groupId || "");
        if (targetGroupId && data.groupId !== targetGroupId) allowed = true;
      }
      if (data.kind === "window" && (target.kind === "group" || target.kind === "window")) allowed = true;
      if (data.kind === "window" && target.kind === "item" && data.windowId !== target.windowId) allowed = true;
      if (data.kind === "item" && (target.kind === "window" || target.kind === "item")) allowed = true;
      if (!allowed) return;
      const placement = resolveDropPlacement(ev, data);
      if (!placement) return;
      ev.preventDefault();
      autoScrollObjectListWhileDragging(ev.clientY);
      if (ev.dataTransfer) ev.dataTransfer.dropEffect = "move";
      clearObjectListDropMarks();
      row.classList.add(placement === "after" ? "drop-after" : "drop-before");
      const parentName = target.kind === "group" ? (groupName(target.groupId) || target.groupId) : target.kind === "window" ? target.windowId : target.kind === "item" ? target.windowId : "";
      if (placement === "after" && (target.kind === "group" || target.kind === "window")) {
        row.dataset.dropHint = `末尾へ移動: ${parentName}`;
      } else if (placement === "before" && (target.kind === "group" || target.kind === "window")) {
        row.dataset.dropHint = `先頭へ移動: ${parentName}`;
      } else if (target.kind === "item" && data.kind === "window") {
        row.dataset.dropHint = `${placement === "after" ? "下" : "上"}へ移動: ${target.windowId}`;
      } else if (data.kind === "group" && (target.kind === "window" || target.kind === "item")) {
        row.dataset.dropHint = `${placement === "after" ? "下" : "上"}へ移動: ${target.windowId}`;
      } else {
        row.dataset.dropHint = `${placement === "after" ? "下" : "上"}へ移動: ${parentName}`;
      }
    });
    row.addEventListener("dragleave", ev => {
      if (!row.contains(ev.relatedTarget)) clearObjectListDropMarks();
    });
    row.addEventListener("drop", ev => {
      const data = parseObjectListDragData(ev);
      if (!data) return;
      ev.preventDefault();
      ev.stopPropagation();
      const placement = resolveDropPlacement(ev, data);
      if (!placement) {
        clearObjectListDropMarks();
        return;
      }
      const position = placement === "before" ? "before" : "after";
      clearObjectListDropMarks();
      if (data.kind === "group" && target.kind === "group") return reorderGroupByList(data.groupId, target.groupId, position);
      if (data.kind === "group" && target.kind === "window") {
        const targetWin = (state.windows || []).find(entry => entry.id === target.windowId);
        const targetGroupId = normalizeGroupId(targetWin?.groupId || "");
        if (!targetGroupId || data.groupId === targetGroupId) return;
        return reorderGroupByList(data.groupId, targetGroupId, position);
      }
      if (data.kind === "group" && target.kind === "item") {
        const targetWin = (state.windows || []).find(entry => entry.id === target.windowId);
        const targetGroupId = normalizeGroupId(targetWin?.groupId || "");
        if (!targetGroupId || data.groupId === targetGroupId) return;
        return reorderGroupByList(data.groupId, targetGroupId, position);
      }
      if (data.kind === "window" && target.kind === "group") return moveWindowToGroupAt(data.windowId, target.groupId, "", position);
      if (data.kind === "window" && target.kind === "window") return moveWindowToGroupAt(data.windowId, target.groupId, target.windowId, position);
      if (data.kind === "window" && target.kind === "item") {
        const targetWin = (state.windows || []).find(entry => entry.id === target.windowId);
        if (!targetWin) return;
        const targetGroupId = normalizeGroupId(targetWin.groupId || "");
        return moveWindowToGroupAt(data.windowId, targetGroupId, target.windowId, position);
      }
      if (data.kind === "item" && target.kind === "window") return moveItemToWindowAt(data.windowId, data.itemId, target.windowId, "", position);
      if (data.kind === "item" && target.kind === "item") return moveItemToWindowAt(data.windowId, data.itemId, target.windowId, target.itemId, position);
    });
  }

  function renderObjectList() {
    if (pendingObjectListReveal) expandObjectListContainersForSelection();
    objectList.innerHTML = "";
    const groups = ensureGroups();
    const scenes = ensureScenes();
    const currentScene = activeScene();
    syncHierarchyZOrderFromList();

    const toolbar = document.createElement("div");
    toolbar.className = "object-list-toolbar object-list-toolbar-with-scenes";

    const sceneSelect = document.createElement("select");
    sceneSelect.className = "object-list-scene-select";
    sceneSelect.title = "プレビューに表示するシーンを切り替えます。選択中シーンでは、そのシーンに所属するグループだけを表示します。";
    for (const option of sceneOptions()) {
      const el = document.createElement("option");
      el.value = option.value;
      el.textContent = option.label;
      if ((state.activeSceneId || "") === option.value) el.selected = true;
      sceneSelect.appendChild(el);
    }
    sceneSelect.addEventListener("change", ev => {
      ev.preventDefault();
      ev.stopPropagation();
      setActiveSceneId(sceneSelect.value || "", { selectScene: true });
    });
    toolbar.appendChild(sceneSelect);

    const addSceneBtn = document.createElement("button");
    addSceneBtn.type = "button";
    addSceneBtn.textContent = "＋シーン";
    addSceneBtn.className = "object-list-compact-button";
    addSceneBtn.title = "新規シーンを追加します。作成後、右側プロパティで名前を変更できます。";
    addSceneBtn.addEventListener("click", ev => {
      ev.preventDefault();
      ev.stopPropagation();
      createSceneFromListAction();
    });
    toolbar.appendChild(addSceneBtn);

    const deleteSceneBtn = document.createElement("button");
    deleteSceneBtn.type = "button";
    deleteSceneBtn.textContent = "シーン削除";
    deleteSceneBtn.className = "object-list-compact-button object-list-danger-button";
    deleteSceneBtn.title = "選択中シーン（未選択なら現在プレビュー中シーン）を削除します。所属グループ・ウィンドウ・パーツも一緒に削除します。";
    const selectedSceneId = selected?.kind === "scene" ? selected.sceneId : "";
    const activeOrFallbackSceneId = selectedSceneId || state.activeSceneId || ensureScenes()[0]?.id || "";
    deleteSceneBtn.disabled = !sceneById(activeOrFallbackSceneId);
    deleteSceneBtn.addEventListener("click", ev => {
      ev.preventDefault();
      ev.stopPropagation();
      const targetSceneId = selected?.kind === "scene"
        ? selected.sceneId
        : (state.activeSceneId || ensureScenes()[0]?.id || "");
      if (!targetSceneId) {
        showToast("削除するシーンがありません");
        return;
      }
      deleteScene(targetSceneId);
    });
    toolbar.appendChild(deleteSceneBtn);


    const saveSceneBtn = createObjectListSaveButton("現在のシーンをファイル保存", () => saveSelectedOrActiveSceneTemplate());
    saveSceneBtn.classList.add("toolbar-icon-button");
    toolbar.appendChild(saveSceneBtn);

    const loadSceneBtn = createObjectListLoadButton("シーンファイルを読み込み", () => loadComponentTemplateFromFile("scene", selected));
    loadSceneBtn.classList.add("toolbar-icon-button");
    toolbar.appendChild(loadSceneBtn);

    const loadGroupBtn = createObjectListLoadButton("グループファイルを現在のシーンへ読み込み", () => loadComponentTemplateFromFile("group", { kind: "scene", sceneId: state.activeSceneId || "" }));
    loadGroupBtn.classList.add("toolbar-icon-button");
    toolbar.appendChild(loadGroupBtn);

    objectList.appendChild(toolbar);

    const bindListContextMenu = (row, target) => {
      const open = ev => {
        ev.preventDefault();
        ev.stopPropagation();
        void openContextMenuForTarget(ev, target);
      };
      row.addEventListener("contextmenu", open, true);
    };

    const makeDropTarget = (row, targetGroupId) => {
      row.classList.add("object-list-drop-target");
      row.addEventListener("dragover", ev => {
        const hasText = Array.from(ev.dataTransfer?.types || []).includes("text/plain");
        if (!hasText && !objectListDragPayload) return;
        ev.preventDefault();
        autoScrollObjectListWhileDragging(ev.clientY);
        row.classList.add("drag-over");
        if (ev.dataTransfer) ev.dataTransfer.dropEffect = "move";
      });
      row.addEventListener("dragleave", () => row.classList.remove("drag-over"));
      row.addEventListener("drop", ev => {
        const data = ev.dataTransfer?.getData("text/plain") || "";
        if (!data.startsWith("window:")) return;
        ev.preventDefault();
        row.classList.remove("drag-over");
        const windowId = data.slice("window:".length);
        moveWindowToGroup(windowId, targetGroupId);
      });
    };

    if (!objectList.dataset.dragWheelBound) {
      objectList.addEventListener("dragover", ev => {
        if (!objectListDragPayload) return;
        ev.preventDefault();
        autoScrollObjectListWhileDragging(ev.clientY);
        if (ev.dataTransfer) ev.dataTransfer.dropEffect = "move";
      });
      objectList.addEventListener("wheel", ev => {
        if (!objectListDragPayload) return;
        ev.preventDefault();
        objectList.scrollTop += ev.deltaY;
      }, { passive: false });
      objectList.dataset.dragWheelBound = "1";
    }

    const makeWindowDraggable = (row, win) => {
      row.draggable = true;
      row.title = [row.title, "ドラッグして別グループへ移動できます"].filter(Boolean).join(" / ");
      row.addEventListener("dragstart", ev => {
        if (shouldSuppressObjectListDrag(ev)) {
          ev.preventDefault();
          return;
        }
        ev.stopPropagation();
        setObjectListSelectionDuringDrag({ kind: "window", windowId: win.id }, row);
        const payload = { kind: "window", windowId: win.id };
        objectListDragPayload = payload;
        if (ev.dataTransfer) {
          ev.dataTransfer.effectAllowed = "move";
          ev.dataTransfer.setData("application/x-db-uicomposer-object", JSON.stringify(payload));
          ev.dataTransfer.setData("text/plain", `window:${win.id}`);
        }
        row.classList.add("dragging");
      });
      row.addEventListener("dragend", () => {
        row.classList.remove("dragging");
        objectListDragPayload = null;
      });
    };

    const renderSceneRows = () => {
      if (!scenes.length) return;
      const header = document.createElement("div");
      header.className = "object-list-subtitle";
      header.textContent = "シーン";
      objectList.appendChild(header);
      for (const scene of scenes) {
        const row = document.createElement("div");
        row.className = "object-row scene-row";
        row.dataset.objectKey = `scene:${scene.id}`;
        if (selected?.kind === "scene" && selected.sceneId === scene.id) row.classList.add("active");
        if ((state.activeSceneId || "") === scene.id) row.classList.add("preview-active");

        const activate = document.createElement("button");
        activate.type = "button";
        activate.className = "object-visible-toggle scene-activate-button";
        activate.textContent = (state.activeSceneId || "") === scene.id ? "●" : "○";
        activate.title = "このシーンをプレビュー表示";
        protectObjectListControl(activate);
        activate.addEventListener("click", ev => {
          stopObjectListControlEvent(ev);
          setActiveSceneId(scene.id);
        });
        row.appendChild(activate);
        const sceneLabel = createObjectRowLabel(
          scene.name || scene.id,
          objectListStatusText([scene.id, `${(scene.groupIds || []).length}グループ`, scene.includeUngrouped === true ? "未グループ含む" : ""]),
          (state.activeSceneId || "") === scene.id ? "プレビュー中" : "",
          "scene",
          "SCENE"
        );
        makeObjectRowNameEditable(sceneLabel, {
          getValue: () => scene.name || scene.id,
          onCommit: value => runStateMutation("一覧シーン名変更", () => { scene.name = value || scene.id; })
        });
        row.appendChild(sceneLabel);
        const actions = createObjectRowActions();
        actions.appendChild(createObjectListSaveButton("このシーンをファイル保存", () => saveObjectTemplate({ kind: "scene", sceneId: scene.id })));
        actions.appendChild(createObjectListLoadButton("シーンファイルを読み込み", () => loadComponentTemplateFromFile("scene", { kind: "scene", sceneId: scene.id })));
        actions.appendChild(createObjectListDeleteButton("このシーンを削除", () => deleteScene(scene.id)));
        row.appendChild(actions);
        row.addEventListener("click", ev => {
          const rowKey = `scene:${scene.id}`;
          if (consumeObjectListDoubleClick(ev, rowKey)) {
            if (beginObjectListRenameFromEvent(ev)) return;
            setActiveSceneId(scene.id);
            return;
          }
          selected = { kind: "scene", sceneId: scene.id };
          render();
        });
        bindListContextMenu(row, { kind: "scene", sceneId: scene.id });
        objectList.appendChild(row);
      }
    };

    const renderWindowRows = (winList, indent = false) => {
      for (const win of winList) {
        const row = document.createElement("div");
        row.className = "object-row window-row";
        if (indent) row.classList.add("group-child-row");
        row.dataset.objectKey = `window:${win.id}`;
        if (selected?.kind === "window" && selected.windowId === win.id) row.classList.add("active");
        const groupHidden = win.groupId && !groupVisible(win.groupId);
        const sceneHidden = !windowInActiveScene(win);
        const windowCollapsed = isObjectListWindowCollapsed(win.id);
        if (sceneHidden) row.classList.add("scene-hidden");
        makeWindowDraggable(row, win);

        row.appendChild(createObjectListControlStrip(
          createObjectListCollapseButton(windowCollapsed, windowCollapsed ? "パーツ一覧を展開" : "パーツ一覧を折りたたみ", () => toggleObjectListWindowCollapsed(win.id)),
          createObjectListVisibilityButton(win.visible !== false, win.visible === false ? "このウィンドウを表示" : "このウィンドウを非表示", () => {
            runStateMutation("一覧ウィンドウ表示切替", () => { win.visible = win.visible === false; });
          }),
          createObjectListLockButton(win.locked === true, win.locked === true ? "このウィンドウの位置ロックを解除" : "このウィンドウの位置をロック", () => {
            runStateMutation("一覧ウィンドウ位置ロック切替", () => { win.locked = win.locked !== true; });
          })
        ));
        const windowLabel = createWindowRowLabel(
          win.id || "(idなし)",
          objectListStatusText([win.groupId ? groupName(win.groupId) : "", `${(win.items || []).length}パーツ`]),
          objectListStatusText([win.visible === false ? "非表示" : "", win.locked === true ? "位置ロック" : "", groupHidden ? "グループ非表示" : "", sceneHidden ? "シーン外" : ""]),
          windowCollapsed,
          () => toggleObjectListWindowCollapsed(win.id)
        );
        makeObjectRowNameEditable(windowLabel, {
          getValue: () => win.id || "",
          onCommit: value => runStateMutation("一覧ウィンドウID変更", () => {
            const oldId = win.id;
            win.id = safeWindowIdInState(value, oldId || "window", win);
            if (selected?.kind === "window" && selected.windowId === oldId) selected.windowId = win.id;
            if (selected?.kind === "item" && selected.windowId === oldId) selected.windowId = win.id;
          })
        });
        row.appendChild(windowLabel);
        const actions = createObjectRowActions();
        actions.appendChild(createObjectListSaveButton("このウィンドウをファイル保存", () => saveObjectTemplate({ kind: "window", windowId: win.id })));
        actions.appendChild(createObjectListLoadButton("このウィンドウへパーツファイルを読み込み", () => loadComponentTemplateFromFile("item", { kind: "window", windowId: win.id })));
        actions.appendChild(createObjectListDeleteButton("このウィンドウを削除", () => confirmDeleteWindowFromList(win)));
        row.appendChild(actions);

        row.addEventListener("click", ev => {
          const rowKey = `window:${win.id}`;
          if (consumeObjectListDoubleClick(ev, rowKey)) {
            if (beginObjectListRenameFromEvent(ev)) return;
          }
          selectWindow(win.id, { revealInList: false });
        });
        bindObjectListRowDrop(row, { kind: "window", windowId: win.id, groupId: normalizeGroupId(win.groupId || "") });
        bindListContextMenu(row, { kind: "window", windowId: win.id });
        objectList.appendChild(row);

        if (windowCollapsed) continue;

        for (const item of win.items || []) {
          const itemRow = document.createElement("div");
          itemRow.className = "object-row item-row part-row";
          itemRow.dataset.objectKey = `item:${win.id}/${item.id}`;
          itemRow.style.marginLeft = "0";
          itemRow.style.paddingLeft = indent ? "28px" : "14px";
          // v0.3.98: 旧モード廃止。パーツ行は常に選択可能です。
          if (selected?.kind === "item" && selected.windowId === win.id && selected.itemId === item.id) itemRow.classList.add("active");
          if (sceneHidden) itemRow.classList.add("scene-hidden");

          itemRow.appendChild(createObjectListControlStrip(
            createObjectListVisibilityButton(item.visible !== false, item.visible === false ? "このパーツを表示" : "このパーツを非表示", () => {
              runStateMutation("一覧パーツ表示切替", () => { item.visible = item.visible === false; });
            }),
            createObjectListLockButton(item.locked === true, item.locked === true ? "このパーツの位置ロックを解除" : "このパーツの位置をロック", () => {
              runStateMutation("一覧パーツ位置ロック切替", () => { item.locked = item.locked !== true; });
            })
          ));
          const itemLabel = createObjectRowLabel(
            itemDisplayName(item) || "(名称なし)",
            objectListStatusText([item.id || "(idなし)", item.type || "item"]),
            objectListStatusText([item.visible === false ? "非表示" : "", item.locked === true ? "位置ロック" : ""]),
            "part",
            "PART"
          );
          makeObjectRowNameEditable(itemLabel, {
            getValue: () => itemDisplayName(item),
            onCommit: value => runStateMutation("一覧パーツ表示名変更", () => {
              item.displayName = safeItemDisplayNameForWindow(win, value, item.id || "要素", item);
            })
          });
          itemRow.appendChild(itemLabel);
          const itemActions = createObjectRowActions();
          itemActions.appendChild(createObjectListSaveButton("このパーツをファイル保存", () => saveObjectTemplate({ kind: "item", windowId: win.id, itemId: item.id })));
          itemActions.appendChild(createObjectListDeleteButton("このパーツを削除", () => confirmDeleteItemFromList(win, item)));
          itemRow.appendChild(itemActions);

          itemRow.addEventListener("click", ev => {
            const rowKey = `item:${win.id}/${item.id}`;
            if (consumeObjectListDoubleClick(ev, rowKey)) {
              if (beginObjectListRenameFromEvent(ev)) return;
            }
            selectItem(win.id, item.id, { revealInList: false });
          });
          itemRow.draggable = true;
          itemRow.addEventListener("dragstart", ev => {
            if (shouldSuppressObjectListDrag(ev)) {
              ev.preventDefault();
              return;
            }
            ev.stopPropagation();
            setObjectListSelectionDuringDrag({ kind: "item", windowId: win.id, itemId: item.id }, itemRow);
            const payload = { kind: "item", windowId: win.id, itemId: item.id };
            objectListDragPayload = payload;
            if (ev.dataTransfer) {
              ev.dataTransfer.effectAllowed = "move";
              ev.dataTransfer.setData("application/x-db-uicomposer-object", JSON.stringify(payload));
              ev.dataTransfer.setData("text/plain", `item:${win.id}/${item.id}`);
            }
            itemRow.classList.add("dragging");
          });
          itemRow.addEventListener("dragend", () => {
            itemRow.classList.remove("dragging");
            objectListDragPayload = null;
            clearObjectListDropMarks();
          });
          bindObjectListRowDrop(itemRow, { kind: "item", windowId: win.id, itemId: item.id });
          bindListContextMenu(itemRow, { kind: "item", windowId: win.id, itemId: item.id });
          objectList.appendChild(itemRow);
        }

      }
    };

    // シーンは上部のセレクトボックスだけで管理するため、
    // 一覧本体にはシーン行を表示しません。

    const groupHeader = document.createElement("div");
    groupHeader.className = "object-list-subtitle object-list-subtitle-with-actions";
    const groupHeaderText = document.createElement("span");
    groupHeaderText.textContent = currentScene ? `グループ / ${currentScene.name || currentScene.id}` : "グループ / 全シーン管理";
    groupHeader.appendChild(groupHeaderText);
    const addGroupAtHeaderBtn = document.createElement("button");
    addGroupAtHeaderBtn.type = "button";
    addGroupAtHeaderBtn.className = "object-list-compact-button object-list-add-group-button";
    addGroupAtHeaderBtn.textContent = "＋グループ";
    addGroupAtHeaderBtn.title = "新規グループを追加します。ウィンドウ選択中なら、そのウィンドウを新規グループへ入れます。";
    protectObjectListControl(addGroupAtHeaderBtn);
    addGroupAtHeaderBtn.addEventListener("click", ev => {
      stopObjectListControlEvent(ev);
      createGroupFromListAction();
    });
    groupHeader.appendChild(addGroupAtHeaderBtn);
    objectList.appendChild(groupHeader);

    const groupsForList = currentScene
      ? groups.filter(group => sceneIncludesGroup(currentScene, group.id))
      : groups;

    for (const group of groupsForList) {
      const groupWindows = (state.windows || []).filter(win => normalizeGroupId(win.groupId || "") === group.id);
      const collapsed = isObjectListGroupCollapsed(group.id);
      const inCurrentScene = !currentScene || sceneIncludesGroup(currentScene, group.id);
      const row = document.createElement("div");
      row.className = "object-row group-row";
      if (collapsed) row.classList.add("collapsed");
      if (!inCurrentScene) row.classList.add("scene-hidden");
      row.dataset.objectKey = `group:${group.id}`;
      if (selected?.kind === "group" && selected.groupId === group.id) row.classList.add("active");
      row.appendChild(createObjectListControlStrip(
        createObjectListCollapseButton(collapsed, collapsed ? "グループを展開" : "グループを折りたたみ", () => toggleObjectListGroupCollapsed(group.id)),
        createObjectListVisibilityButton(group.visible !== false, group.visible === false ? "このグループを表示" : "このグループを非表示", () => {
          setGroupVisible(group.id, group.visible === false);
        }),
        createObjectListLockButton(group.locked === true, group.locked === true ? "このグループの位置ロックを解除" : "このグループの位置をロック", () => {
          runStateMutation("一覧グループ位置ロック切替", () => { group.locked = group.locked !== true; });
        })
      ));
      const groupLabel = createGroupRowLabel(
        group.name || group.id,
        objectListStatusText([group.id, `${groupWindows.length}件`, group.visible === false ? "非表示" : "", group.locked === true ? "位置ロック" : "", !inCurrentScene ? "シーン外" : ""]),
        collapsed,
        () => toggleObjectListGroupCollapsed(group.id)
      );
      makeObjectRowNameEditable(groupLabel, {
        getValue: () => group.name || group.id,
        onCommit: value => runStateMutation("一覧グループ名変更", () => {
          const target = groupById(group.id);
          if (target) target.name = String(value || target.id).trim() || target.id;
        })
      });
      row.appendChild(groupLabel);
      const groupActions = createObjectRowActions();

      // v0.3.89: グループは必ずシーンに所属するため、一覧上のS切替は廃止。

      const duplicate = document.createElement("button");
      duplicate.type = "button";
      duplicate.className = "object-row-mini-button group-duplicate";
      duplicate.textContent = "複製";
      duplicate.title = "このグループを複製";
      duplicate.addEventListener("click", ev => {
        ev.preventDefault();
        ev.stopPropagation();
        duplicateGroup(group.id);
      });
      groupActions.appendChild(duplicate);
      groupActions.appendChild(createObjectListSaveButton("このグループをファイル保存", () => saveObjectTemplate({ kind: "group", groupId: group.id })));
      groupActions.appendChild(createObjectListLoadButton("このグループへウィンドウファイルを読み込み", () => loadComponentTemplateFromFile("window", { kind: "group", groupId: group.id })));
      groupActions.appendChild(createObjectListDeleteButton("このグループを削除（所属ウィンドウも削除）", () => confirmDeleteGroupFromList(group)));
      row.appendChild(groupActions);

      row.addEventListener("click", ev => {
        const rowKey = `group:${group.id}`;
        if (consumeObjectListDoubleClick(ev, rowKey)) {
          if (beginObjectListRenameFromEvent(ev)) return;
          toggleObjectListGroupCollapsed(group.id);
          return;
        }
        selectGroup(group.id, { revealInList: false });
      });
      row.draggable = true;
      row.addEventListener("dragstart", ev => {
        if (shouldSuppressObjectListDrag(ev)) {
          ev.preventDefault();
          return;
        }
        ev.stopPropagation();
        setObjectListSelectionDuringDrag({ kind: "group", groupId: group.id }, row);
        const payload = { kind: "group", groupId: group.id };
        objectListDragPayload = payload;
        if (ev.dataTransfer) {
          ev.dataTransfer.effectAllowed = "move";
          ev.dataTransfer.setData("application/x-db-uicomposer-object", JSON.stringify(payload));
          ev.dataTransfer.setData("text/plain", `group:${group.id}`);
        }
        row.classList.add("dragging");
      });
      row.addEventListener("dragend", () => {
        row.classList.remove("dragging");
        objectListDragPayload = null;
        clearObjectListDropMarks();
      });
      bindObjectListRowDrop(row, { kind: "group", groupId: group.id });
      bindListContextMenu(row, { kind: "group", groupId: group.id });
      objectList.appendChild(row);
      if (!collapsed) {
        renderWindowRows(groupWindows, true);
      }
    }

    // v0.3.89: 未グループは廃止。ensureScenes() で必ず所属を補正します.

  }

  function objectListSnapshot() {
    ensureGroups();
    ensureScenes();
    for (const win of state.windows || []) normalizeWindowItemIdentity(win);
    return {
      version: TOOL_VERSION,
      layoutId: state.layoutId,
      activeSceneId: state.activeSceneId || "",
      scenes: (state.scenes || []).map(scene => ({
        id: scene.id,
        name: scene.name || scene.id,
        groupIds: Array.isArray(scene.groupIds) ? scene.groupIds.slice() : [],
        includeUngrouped: false
      })),
      groups: (state.groups || []).map(group => ({
        id: group.id,
        name: group.name || group.id,
        visible: group.visible !== false,
        locked: group.locked === true
      })),
      windows: (state.windows || []).map(win => ({
        id: win.id,
        groupId: win.groupId || "",
        visible: win.visible !== false,
        locked: win.locked === true,
        itemCount: (win.items || []).length,
        items: (win.items || []).map(item => ({
          id: item.id,
          displayName: itemDisplayName(item),
          type: item.type || "item",
          visible: item.visible !== false,
          locked: item.locked === true
        }))
      })),
      selected: selected ? Object.assign({}, selected) : null,
      clipboardKind: objectClipboard?.kind || "",
      templateCount: ensureComponentTemplates().length,
      mode,
      globalWindowPositionLocked,
      globalPartPositionLocked
    };
  }

  function syncDetachedObjectListWindow() {
    const api = window.DB_UIComposerElectron;
    if (!api?.isElectron || typeof api.sendObjectListState !== "function") return;
    try {
      api.sendObjectListState(objectListSnapshot());
    } catch (e) {
      debugOnce("detachedList.syncFailed", "warn", "別ウィンドウ一覧への同期に失敗しました。", { message: e?.message || String(e) });
    }
  }

  async function openDetachedObjectListWindow() {
    const api = window.DB_UIComposerElectron;
    if (!api?.isElectron || typeof api.openObjectListWindow !== "function") {
      showToast("別ウィンドウ一覧はElectron版で使用できます");
      return;
    }
    try {
      await api.openObjectListWindow();
      syncDetachedObjectListWindow();
    } catch (e) {
      debugLog("warn", "一覧ウィンドウを開けませんでした。", { message: e?.message || String(e) });
      showToast("一覧ウィンドウを開けませんでした");
    }
  }

  function executeDetachedObjectListCommand(command) {
    const type = String(command?.type || "");
    if (!type) return;
    if (type === "contextMenuCommand") {
      const target = command.target || null;
      setSelectedFromContextTarget(target);
      executeContextMenuCommand(command.command || "", target);
      return;
    }
    if (type === "selectWindow") return selectWindow(String(command.windowId || ""));
    if (type === "selectItem") return selectItem(String(command.windowId || ""), String(command.itemId || ""));
    if (type === "selectGroup") return selectGroup(String(command.groupId || ""));
    if (type === "selectScene") {
      const id = normalizeSceneId(command.sceneId || "");
      if (!sceneById(id)) return;
      selected = { kind: "scene", sceneId: id };
      pendingObjectListReveal = true;
      render();
      return;
    }
    if (type === "renameScene") {
      const scene = sceneById(command.sceneId || "");
      if (scene) runStateMutation("一覧シーン名変更", () => { scene.name = String(command.name || scene.name || scene.id).trim() || scene.id; });
      return;
    }
    if (type === "renameGroup") {
      const group = groupById(command.groupId || "");
      if (group) runStateMutation("一覧グループ名変更", () => { group.name = String(command.name || group.name || group.id).trim() || group.id; });
      return;
    }
    if (type === "renameWindow") {
      const win = (state.windows || []).find(entry => entry.id === command.windowId);
      if (win) runStateMutation("一覧ウィンドウID変更", () => {
        const oldId = win.id;
        win.id = safeWindowIdInState(command.name || command.id || oldId, oldId || "window", win);
        if (selected?.kind === "window" && selected.windowId === oldId) selected.windowId = win.id;
        if (selected?.kind === "item" && selected.windowId === oldId) selected.windowId = win.id;
      });
      return;
    }
    if (type === "renameItem") {
      const win = (state.windows || []).find(entry => entry.id === command.windowId);
      const item = win?.items?.find(entry => entry.id === command.itemId);
      if (item) runStateMutation("一覧パーツID変更", () => {
        const oldId = item.id;
        item.id = safeItemIdForWindow(win, command.name || command.id || oldId, oldId || "item", item);
        if (selected?.kind === "item" && selected.windowId === win.id && selected.itemId === oldId) selected.itemId = item.id;
      });
      return;
    }
    if (type === "renameItemDisplayName") {
      const win = (state.windows || []).find(entry => entry.id === command.windowId);
      const item = win?.items?.find(entry => entry.id === command.itemId);
      if (item) runStateMutation("一覧パーツ表示名変更", () => {
        item.displayName = safeItemDisplayNameForWindow(win, command.name || itemDisplayName(item) || item.id || "要素", item.id || "要素", item);
      });
      return;
    }
    if (type === "activateScene") return setActiveSceneId(command.sceneId || "", { selectScene: command.selectScene === true });
    if (type === "createScene") {
      createSceneFromListAction(command.name || "");
      return;
    }
    if (type === "deleteScene") return deleteScene(command.sceneId || "");
    if (type === "toggleGroupInScene") return toggleGroupInActiveScene(command.groupId || "");
    if (type === "toggleUngroupedInScene") {
      const scene = activeScene();
      if (!scene) return;
      runStateMutation("シーン未グループ切替", () => { scene.includeUngrouped = scene.includeUngrouped !== true; });
      return;
    }
    if (type === "createGroup") {
      createGroupFromListAction(command.name || "");
      return;
    }
    if (type === "saveSceneTemplate") return void saveObjectTemplate({ kind: "scene", sceneId: command.sceneId || state.activeSceneId || "" });
    if (type === "saveGroupTemplate") return void saveObjectTemplate({ kind: "group", groupId: command.groupId || "" });
    if (type === "saveWindowTemplate") return void saveObjectTemplate({ kind: "window", windowId: command.windowId || "" });
    if (type === "saveItemTemplate") return void saveObjectTemplate({ kind: "item", windowId: command.windowId || "", itemId: command.itemId || "" });
    if (type === "loadSceneTemplate") return void loadComponentTemplateFromFile("scene", selected);
    if (type === "loadGroupTemplate") return void loadComponentTemplateFromFile("group", { kind: "scene", sceneId: command.sceneId || state.activeSceneId || "" });
    if (type === "loadWindowTemplate") return void loadComponentTemplateFromFile("window", { kind: "group", groupId: command.groupId || "" });
    if (type === "loadItemTemplate") return void loadComponentTemplateFromFile("item", { kind: "window", windowId: command.windowId || "" });
    if (type === "loadComponentTemplate") return void loadComponentTemplateFromFile("", selected);
    if (type === "toggleWindowVisible") {
      const win = (state.windows || []).find(entry => entry.id === command.windowId);
      if (!win) return;
      runStateMutation("一覧ウィンドウ表示切替", () => { win.visible = win.visible === false; });
      return;
    }
    if (type === "toggleItemVisible") {
      const win = (state.windows || []).find(entry => entry.id === command.windowId);
      const item = win?.items?.find(entry => entry.id === command.itemId);
      if (!item) return;
      runStateMutation("一覧パーツ表示切替", () => { item.visible = item.visible === false; });
      return;
    }
    if (type === "toggleGroupVisible") return setGroupVisible(command.groupId || "", !groupVisible(command.groupId || ""));
    if (type === "toggleGroupLock") { const group = groupById(command.groupId || ""); if (group) runStateMutation("一覧グループ位置ロック切替", () => { group.locked = group.locked !== true; }); return; }
    if (type === "toggleWindowLock") { const win = (state.windows || []).find(entry => entry.id === command.windowId); if (win) runStateMutation("一覧ウィンドウ位置ロック切替", () => { win.locked = win.locked !== true; }); return; }
    if (type === "toggleItemLock") { const win = (state.windows || []).find(entry => entry.id === command.windowId); const item = win?.items?.find(entry => entry.id === command.itemId); if (item) runStateMutation("一覧パーツ位置ロック切替", () => { item.locked = item.locked !== true; }); return; }
    if (type === "reorderGroupByList") return reorderGroupByList(String(command.groupId || ""), String(command.targetGroupId || ""), String(command.position || "before"));
    if (type === "moveWindowToGroupAt") return moveWindowToGroupAt(String(command.windowId || ""), String(command.groupId || ""), String(command.targetWindowId || ""), String(command.position || "after"));
    if (type === "moveWindowToGroup") return moveWindowToGroup(String(command.windowId || ""), String(command.groupId || ""));
    if (type === "moveItemToWindow") return moveItemToWindowAt(String(command.sourceWindowId || ""), String(command.itemId || ""), String(command.targetWindowId || ""), String(command.targetItemId || ""), String(command.position || "after"));
    if (type === "moveItemToGroup") return moveItemToGroupAt(String(command.sourceWindowId || ""), String(command.itemId || ""), String(command.groupId || ""), String(command.position || "after"));
    if (type === "deleteWindow") {
      const win = (state.windows || []).find(entry => entry.id === command.windowId);
      if (win) confirmDeleteWindowFromList(win);
      return;
    }
    if (type === "deleteGroup") { const group = groupById(command.groupId || ""); if (group) confirmDeleteGroupFromList(group); return; }
    if (type === "duplicateGroup") return duplicateGroup(command.groupId || "");
  }

  function selectedObjectListKey() {
    if (!selected) return "";
    if (selected.kind === "scene") return `scene:${selected.sceneId}`;
    if (selected.kind === "group") return `group:${selected.groupId}`;
    if (selected.kind === "item") return `item:${selected.windowId}/${selected.itemId}`;
    if (selected.kind === "window") return `window:${selected.windowId}`;
    return "";
  }

  function expandObjectListSection() {
    const section = document.querySelector('.collapsible-section[data-collapse-key="object-list"]');
    if (!section || !section.classList.contains("collapsed")) return;
    section.classList.remove("collapsed");
    const button = section.querySelector(".section-toggle");
    if (button) button.setAttribute("aria-expanded", "true");
    try {
      localStorage.setItem("DB_UIComposer_collapsed_object-list", "0");
    } catch (_) {
      // localStorage が使えない環境でも、今回の表示は開いた状態にします。
    }
  }

  function revealSelectedObjectInListIfRequested() {
    if (!pendingObjectListReveal) return;
    pendingObjectListReveal = false;

    const key = selectedObjectListKey();
    if (!key) return;
    expandObjectListSection();

    // 一覧DOMの再作成・折りたたみ解除後に寸法が確定してから、
    // 左パネル全体ではなく一覧スクロール領域だけを移動します。
    requestAnimationFrame(() => {
      const row = Array.from(objectList.querySelectorAll(".object-row"))
        .find(element => element.dataset.objectKey === key);
      if (!row) return;

      const listRect = objectList.getBoundingClientRect();
      const rowRect = row.getBoundingClientRect();
      const desiredTop = objectList.scrollTop
        + (rowRect.top - listRect.top)
        - (listRect.height - rowRect.height) / 2;
      const maxTop = Math.max(0, objectList.scrollHeight - objectList.clientHeight);
      const top = Math.max(0, Math.min(maxTop, desiredTop));

      if (typeof objectList.scrollTo === "function") {
        objectList.scrollTo({ top, behavior: "smooth" });
      } else {
        objectList.scrollTop = top;
      }
      row.classList.add("list-auto-revealed");
      window.setTimeout(() => row.classList.remove("list-auto-revealed"), 750);
    });
  }

  function runtimeTargetFromSelection() {
    if (!selected) return null;
    const win = selectedWindow();
    if (!win) return null;
    if (selected.kind === "window") {
      return { kind: "window", layoutId: state.layoutId, windowId: win.id, win };
    }
    const item = selectedItem();
    if (!item) return null;
    return { kind: "item", layoutId: state.layoutId, windowId: win.id, itemId: item.id, win, item };
  }

  function runtimeTargetKeyOf(target) {
    if (!target) return "";
    return target.kind === "item"
      ? `item:${target.layoutId}/${target.windowId}/${target.itemId}`
      : `window:${target.layoutId}/${target.windowId}`;
  }

  function defaultRuntimeActionForTarget(target) {
    if (!target) return "";
    if (target.kind === "window") return "SetWindowVisible";
    if (target.item.type === "compositeImage") return "SetCompositeImageSet";
    if (target.item.type === "image") return "SetItemImage";
    if (target.item.type === "text" || target.item.type === "button") return "SetItemText";
    return "SetItemVisible";
  }

  function ensureRuntimeCommandDraft() {
    const target = runtimeTargetFromSelection();
    const key = runtimeTargetKeyOf(target);
    if (!target) {
      runtimeCommandTargetKey = "";
      runtimeCommandDraft = null;
      return null;
    }
    if (runtimeCommandTargetKey !== key || !runtimeCommandDraft) {
      const item = target.item || {};
      runtimeCommandTargetKey = key;
      runtimeCommandDraft = {
        action: defaultRuntimeActionForTarget(target),
        text: String(item.text ?? ""),
        image: {
          folder: normalizeImageFolder(item.folder || "pictures") || "pictures",
          fileName: String(item.fileName || ""),
          previewName: item.previewName || "",
          previewSrc: item.previewSrc || "",
          previewNaturalWidth: Number(item.previewNaturalWidth || item.width || 0),
          previewNaturalHeight: Number(item.previewNaturalHeight || item.height || 0)
        },
        compositeLayersJson: target.kind === "item" && item.type === "compositeImage" ? JSON.stringify((ensureCompositeImageLayers(item).map(layer => ({ id: layer.id, name: layer.name, visible: layer.visible !== false, folder: normalizeImageFolder(layer.folder || "pictures") || "pictures", fileName: String(layer.fileName || ""), x: Number(layer.x || 0), y: Number(layer.y || 0), width: Math.max(1, Number(layer.width || layer.previewNaturalWidth || 96)), height: Math.max(1, Number(layer.height || layer.previewNaturalHeight || 64)), opacity: normalizePsdOpacity(layer.opacity ?? 255), priority: Math.max(1, Number(layer.priority || 1)), blendMode: String(layer.blendMode || "normal") }))), null, 2) : "[]",
        fadeDuration: 30,
        visible: target.kind === "window" ? target.win.visible !== false : item.visible !== false,
        opacity: Number(item.opacity ?? 255),
        zOrder: Number(item.zOrder || 0),
        scaleXPercent: target.kind === "item" && (item.type === "image" || item.type === "compositeImage") ? imageScalePercent(item, "scaleX") : 100,
        scaleYPercent: target.kind === "item" && (item.type === "image" || item.type === "compositeImage") ? imageScalePercent(item, "scaleY") : 100,
        x: Number(item.x || 0),
        y: Number(item.y || 0),
        moveDuration: 60,
        moveWait: false,
        moveEasing: "linear",
        logText: "",
        logMaxLines: 200,
        logScrollToBottom: true
      };
    }
    return { target, draft: runtimeCommandDraft };
  }

  function runtimeActionsForTarget(target) {
    if (!target) return [];
    if (target.kind === "window") {
      return [
        ["SetWindowVisible", "ウィンドウ表示切替"],
        ["AddLogText", "ログを1行追加"],
        ["ClearLog", "ログを消去"],
        ["ResetLayoutState", "レイアウトの変更を初期化"]
      ];
    }
    const base = [
      ["SetItemVisible", "パーツ表示切替"],
      ["SetItemOpacity", "パーツ不透明度変更"],
      ["SetItemZOrder", "パーツ表示順変更"],
      ["SetItemPosition", "パーツ座標変更"],
      ["MoveItem", "パーツ移動"],
      ["ResetItem", "パーツ変更を初期化"]
    ];
    if (target.item.type === "compositeImage") base.unshift(["SetCompositeImageSet", "統合画像の構成変更"], ["FadeInCompositeImage", "統合画像をフェードイン表示"], ["SetItemScale", "パーツ拡大率変更"]);
    if (target.item.type === "image") base.unshift(["SetItemImage", "パーツ画像変更"], ["SetItemScale", "パーツ拡大率変更"]);
    if (target.item.type === "text" || target.item.type === "button") base.unshift(["SetItemText", "パーツ文字変更"]);
    return base;
  }

  function appendRuntimeLabel(parent, labelText, control, help = "") {
    const label = document.createElement("label");
    setHoverHelp(label, labelText, help);
    label.textContent = labelText;
    label.appendChild(control);
    parent.appendChild(label);
    return control;
  }

  function appendRuntimeNumberPair(parent, labelA, valueA, onA, labelB, valueB, onB, min = -9999, max = 9999, fieldA = "", fieldB = "", step = "") {
    const wrap = document.createElement("div");
    wrap.className = "grid2";
    const a = document.createElement("input");
    a.type = "number"; a.min = min; a.max = max; a.value = valueA;
    if (step !== "") a.step = step;
    if (fieldA) a.dataset.runtimeField = fieldA;
    a.addEventListener("input", () => { onA(Number(a.value)); });
    appendRuntimeLabel(wrap, labelA, a);
    const b = document.createElement("input");
    b.type = "number"; b.min = min; b.max = max; b.value = valueB;
    if (step !== "") b.step = step;
    if (fieldB) b.dataset.runtimeField = fieldB;
    b.addEventListener("input", () => { onB(Number(b.value)); });
    appendRuntimeLabel(wrap, labelB, b);
    parent.appendChild(wrap);
  }

  function syncRuntimeCommandDraftFromPanel(ready) {
    if (!ready || !ready.draft) return;
    const panel = $("runtimeCommandPanel");
    if (!panel) return;
    const draft = ready.draft;
    draft._rawFields = draft._rawFields || {};
    panel.querySelectorAll("[data-runtime-field]").forEach(control => {
      const field = control.dataset.runtimeField;
      if (!field) return;
      if (control.type === "checkbox") {
        draft[field] = !!control.checked;
        draft._rawFields[field] = String(!!control.checked);
        return;
      }
      const raw = String(control.value ?? "").trim();
      draft._rawFields[field] = raw;
      const n = Number(raw);
      if (Number.isFinite(n)) draft[field] = n;
    });
  }

  function runtimeNumberArg(draft, field, fallback = 0, min = -Infinity, max = Infinity) {
    const rawMap = draft && draft._rawFields ? draft._rawFields : {};
    const raw = rawMap[field] !== undefined ? String(rawMap[field]).trim() : String(draft?.[field] ?? "").trim();
    const n = Number(raw);
    const value = Number.isFinite(n) ? n : Number(fallback);
    const clamped = Math.max(min, Math.min(max, Number.isFinite(value) ? value : Number(fallback) || 0));
    if (raw !== "" && Number.isFinite(n) && n === clamped) return raw;
    return String(clamped);
  }

  function renderRuntimeCommandPanel() {
    const panel = $("runtimeCommandPanel");
    const copyButton = $("copyRuntimeCommandBtn");
    if (!panel) return;
    panel.innerHTML = "";
    const ready = ensureRuntimeCommandDraft();
    if (!ready) {
      panel.classList.add("empty");
      panel.textContent = "プレビューまたは一覧から、変更したいウィンドウ／パーツを選択してください。";
      if (copyButton) copyButton.disabled = true;
      return;
    }
    panel.classList.remove("empty");
    const { target, draft } = ready;
    if (copyButton) copyButton.disabled = false;

    const targetInfo = document.createElement("div");
    targetInfo.className = "runtime-command-target";
    targetInfo.innerHTML = `<strong>対象</strong><span>${escapeHtml(target.layoutId)} / ${escapeHtml(target.windowId)}${target.kind === "item" ? ` / ${escapeHtml(target.itemId)}` : ""}</span>`;
    panel.appendChild(targetInfo);

    const actionSelect = document.createElement("select");
    for (const [value, label] of runtimeActionsForTarget(target)) {
      const opt = document.createElement("option");
      opt.value = value;
      opt.textContent = label;
      actionSelect.appendChild(opt);
    }
    if (!Array.from(actionSelect.options).some(option => option.value === draft.action)) draft.action = actionSelect.options[0]?.value || "";
    actionSelect.value = draft.action;
    actionSelect.addEventListener("change", () => {
      draft.action = actionSelect.value;
      renderRuntimeCommandPanel();
    });
    appendRuntimeLabel(panel, "変更内容", actionSelect, "ゲーム中に実行するUI変更命令を選びます。ここでの入力はレイアウト本体を直接変更しません。");

    if (draft.action === "SetItemText") {
      const input = document.createElement("textarea");
      input.className = "small-textarea";
      input.value = draft.text;
      input.addEventListener("input", () => { draft.text = input.value; });
      appendRuntimeLabel(panel, "変更後の文字", input, "\V[1]などのMZ制御文字も指定できます。");
    } else if (draft.action === "SetItemImage") {
      const path = document.createElement("input");
      path.disabled = true;
      path.value = `MZ画像パス: ${normalizeImageFolder(draft.image.folder) || "pictures"}/${draft.image.fileName || "未指定"}`;
      appendRuntimeLabel(panel, "変更後の画像", path, "選択した画像のfolder/fileNameを使って、ゲーム中に画像パーツを差し替えます。");
      const pick = document.createElement("button");
      pick.type = "button";
      pick.textContent = "変更画像を選択";
      setHoverHelp(pick, "変更画像を選択", "ツクールプロジェクト読込済みの画像一覧から、ゲーム中に差し替える画像を選択します。");
      pick.addEventListener("click", () => {
        openProjectImagePicker(draft.image);
      });
      panel.appendChild(pick);
    } else if (draft.action === "SetCompositeImageSet") {
      const note = document.createElement("div");
      note.className = "runtime-command-note";
      note.textContent = "現在の統合レイヤー構成をJSON文字列として渡します。必要なら内容を直接編集してからコピーしてください。";
      panel.appendChild(note);
      const input = document.createElement("textarea");
      input.className = "small-textarea";
      input.style.minHeight = "180px";
      input.value = draft.compositeLayersJson || "[]";
      input.addEventListener("input", () => { draft.compositeLayersJson = input.value; });
      appendRuntimeLabel(panel, "統合レイヤーJSON", input, "folder / fileName / x / y / width / height / visible / opacity（不透明度0〜255） / priority / blendMode を配列で指定します。priority が大きいほど手前です。");
    } else if (draft.action === "FadeInCompositeImage") {
      const visible = document.createElement("input");
      visible.type = "checkbox";
      visible.checked = !!draft.visible;
      visible.addEventListener("change", () => { draft.visible = visible.checked; });
      appendRuntimeLabel(panel, "表示してからフェード", visible, "ONなら表示状態にしてからフェードインを開始します。");
      const duration = document.createElement("input");
      duration.type = "number";
      duration.min = "1";
      duration.value = String(Math.max(1, Number(draft.fadeDuration || 30)));
      duration.addEventListener("input", () => { draft.fadeDuration = Math.max(1, Number(duration.value) || 1); });
      appendRuntimeLabel(panel, "フェード時間（フレーム）", duration, "30で約0.5秒、60で約1秒です。");
    } else if (draft.action === "SetItemVisible" || draft.action === "SetWindowVisible") {
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = !!draft.visible;
      input.addEventListener("change", () => { draft.visible = input.checked; });
      appendRuntimeLabel(panel, "表示する", input, "ONなら表示、OFFなら非表示にします。変更状態はセーブデータに保存されます。");
    } else if (draft.action === "AddLogText") {
      const input = document.createElement("textarea");
      input.className = "small-textarea";
      input.value = draft.logText;
      input.placeholder = "追加するログ。\\V[1] / \\C[27] など使用可";
      input.addEventListener("input", () => { draft.logText = input.value; });
      appendRuntimeLabel(panel, "追加するログ", input, "指定ウィンドウへログを追加します。\\V[n]や\\C[n]などのMZ制御文字に対応します。");
      const maxInput = document.createElement("input");
      maxInput.type = "number"; maxInput.min = "1"; maxInput.value = draft.logMaxLines;
      maxInput.addEventListener("input", () => { draft.logMaxLines = Math.max(1, Number(maxInput.value) || 1); });
      appendRuntimeLabel(panel, "最大保持行数", maxInput, "古いログを残す最大行数です。超えた分は古い行から削除されます。");
      const bottom = document.createElement("input");
      bottom.type = "checkbox"; bottom.checked = !!draft.logScrollToBottom;
      bottom.addEventListener("change", () => { draft.logScrollToBottom = bottom.checked; });
      appendRuntimeLabel(panel, "追加後に一番下へ", bottom, "ONならログ追加後に末尾へスクロールします。");
    } else if (draft.action === "ClearLog") {
      const note = document.createElement("div");
      note.className = "runtime-command-note";
      note.textContent = "このウィンドウのログをすべて消去します。";
      panel.appendChild(note);
    } else if (draft.action === "SetItemOpacity") {
      const input = document.createElement("input");
      input.type = "number"; input.min = "0"; input.max = "255"; input.value = draft.opacity;
      input.addEventListener("input", () => { draft.opacity = clamp(Number(input.value), 0, 255); });
      appendRuntimeLabel(panel, "変更後の不透明度", input, "0で透明、255で不透明です。");
    } else if (draft.action === "SetItemZOrder") {
      const input = document.createElement("input");
      input.type = "number"; input.value = draft.zOrder;
      input.addEventListener("input", () => { draft.zOrder = Number(input.value) || 0; });
      appendRuntimeLabel(panel, "変更後の表示順", input, "同じウィンドウ内では数値が大きいほど手前です。");
    } else if (draft.action === "SetItemScale") {
      appendRuntimeNumberPair(panel, "X拡大率（%）", draft.scaleXPercent, value => { draft.scaleXPercent = Math.max(1, value || 1); }, "Y拡大率（%）", draft.scaleYPercent, value => { draft.scaleYPercent = Math.max(1, value || 1); }, 1, 10000, "scaleXPercent", "scaleYPercent", "0.01");
    } else if (draft.action === "SetItemPosition") {
      appendRuntimeNumberPair(panel, "変更後の内部X", draft.x, value => { draft.x = Number(value) || 0; }, "変更後の内部Y", draft.y, value => { draft.y = Number(value) || 0; }, -9999, 9999, "x", "y", "1");
    } else if (draft.action === "MoveItem") {
      appendRuntimeNumberPair(panel, "移動先 内部X", draft.x, value => { draft.x = Number(value) || 0; }, "移動先 内部Y", draft.y, value => { draft.y = Number(value) || 0; }, -9999, 9999, "x", "y", "1");
      appendRuntimeNumberPair(panel, "X拡大率（%）", draft.scaleXPercent, value => { draft.scaleXPercent = Math.max(1, value || 1); }, "Y拡大率（%）", draft.scaleYPercent, value => { draft.scaleYPercent = Math.max(1, value || 1); }, 1, 10000, "scaleXPercent", "scaleYPercent", "0.01");
      const opacity = document.createElement("input");
      opacity.type = "number"; opacity.min = "0"; opacity.max = "255"; opacity.value = draft.opacity; opacity.dataset.runtimeField = "opacity";
      opacity.addEventListener("input", () => { draft.opacity = clamp(Number(opacity.value), 0, 255); });
      appendRuntimeLabel(panel, "移動先 不透明度", opacity, "0で透明、255で不透明です。空欄維持を使いたい場合は、コピー後のコマンド引数からopacityを消してください。");
      const duration = document.createElement("input");
      duration.type = "number"; duration.min = "0"; duration.value = String(Math.max(0, Number(draft.moveDuration || 60))); duration.dataset.runtimeField = "moveDuration";
      duration.addEventListener("input", () => { draft.moveDuration = Math.max(0, Number(duration.value) || 0); });
      appendRuntimeLabel(panel, "時間（フレーム）", duration, "60で約1秒です。0なら即時変更します。");
      const easing = document.createElement("select");
      [["linear", "一定速度"], ["easeIn", "ゆっくり開始"], ["easeOut", "ゆっくり終了"], ["easeInOut", "ゆっくり開始/終了"]].forEach(([value, label]) => {
        const opt = document.createElement("option"); opt.value = value; opt.textContent = label; easing.appendChild(opt);
      });
      easing.value = draft.moveEasing || "linear";
      easing.addEventListener("change", () => { draft.moveEasing = easing.value; });
      appendRuntimeLabel(panel, "イージング", easing, "移動中の速度変化です。");
      const wait = document.createElement("input");
      wait.type = "checkbox"; wait.checked = !!draft.moveWait;
      wait.addEventListener("change", () => { draft.moveWait = wait.checked; });
      appendRuntimeLabel(panel, "完了までウェイト", wait, "ONならこの移動が終わるまでイベント処理を待ちます。");
    } else if (draft.action === "ResetItem" || draft.action === "ResetLayoutState") {
      const note = document.createElement("div");
      note.className = "runtime-command-note";
      note.textContent = draft.action === "ResetItem"
        ? "このパーツに対してゲーム中に行った変更だけを、レイアウトの初期値へ戻します。"
        : "このレイアウトに対してゲーム中に行った変更をすべて、レイアウトの初期値へ戻します。";
      panel.appendChild(note);
    }
  }

  function runtimeCommandDisplayName(command) {
    const names = {
      SetWindowVisible: "ウィンドウ表示切替",
      AddLogText: "ログを1行追加",
      ClearLog: "ログを消去",
      ResetLayoutState: "レイアウト変更を初期化",
      SetItemText: "パーツ文字変更",
      SetItemImage: "パーツ画像変更",
      SetCompositeImageSet: "統合画像の構成変更",
      FadeInCompositeImage: "統合画像をフェードイン表示",
      SetItemVisible: "パーツ表示切替",
      SetItemOpacity: "パーツ透明度変更",
      SetItemZOrder: "パーツ表示順変更",
      SetItemScale: "パーツ拡大率変更",
      SetItemPosition: "パーツ座標変更",
      MoveItem: "パーツ移動",
      ResetItem: "パーツ変更を初期化"
    };
    return names[String(command || "")] || String(command || "");
  }

  function buildRuntimeCommandPayload() {
    const ready = ensureRuntimeCommandDraft();
    if (!ready) return null;
    syncRuntimeCommandDraftFromPanel(ready);
    const { target, draft } = ready;
    const args = { layoutId: target.layoutId };
    let command = draft.action;
    if (command === "ResetLayoutState") {
      // layoutIdのみ
    } else if (target.kind === "window") {
      args.windowId = target.windowId;
      if (command === "AddLogText") {
        args.text = String(draft.logText ?? "");
        args.maxLines = String(Math.max(1, Number(draft.logMaxLines) || 1));
        args.scrollToBottom = String(!!draft.logScrollToBottom);
      } else if (command === "ClearLog") {
        // layoutId + windowIdのみ
      } else {
        command = "SetWindowVisible";
        args.visible = String(!!draft.visible);
      }
    } else {
      args.windowId = target.windowId;
      args.itemId = target.itemId;
      switch (command) {
        case "SetItemText": args.text = String(draft.text ?? ""); break;
        case "SetItemImage":
          args.folder = normalizeImageFolder(draft.image.folder) || "pictures";
          args.fileName = String(draft.image.fileName || "");
          break;
        case "SetCompositeImageSet":
          args.layersJson = String(draft.compositeLayersJson || "[]");
          break;
        case "FadeInCompositeImage":
          args.visible = String(!!draft.visible);
          args.duration = String(Math.max(1, Number(draft.fadeDuration) || 1));
          break;
        case "SetItemVisible": args.visible = String(!!draft.visible); break;
        case "SetItemOpacity": args.opacity = runtimeNumberArg(draft, "opacity", 255, 0, 255); break;
        case "SetItemZOrder": args.zOrder = String(Number(draft.zOrder) || 0); break;
        case "SetItemScale":
          args.scaleXPercent = runtimeNumberArg(draft, "scaleXPercent", 100, 1, 10000);
          args.scaleYPercent = runtimeNumberArg(draft, "scaleYPercent", 100, 1, 10000);
          break;
        case "SetItemPosition":
          args.x = runtimeNumberArg(draft, "x", 0, -9999, 9999);
          args.y = runtimeNumberArg(draft, "y", 0, -9999, 9999);
          break;
        case "MoveItem":
          args.x = runtimeNumberArg(draft, "x", 0, -9999, 9999);
          args.y = runtimeNumberArg(draft, "y", 0, -9999, 9999);
          args.scaleXPercent = runtimeNumberArg(draft, "scaleXPercent", 100, 1, 10000);
          args.scaleYPercent = runtimeNumberArg(draft, "scaleYPercent", 100, 1, 10000);
          args.opacity = runtimeNumberArg(draft, "opacity", 255, 0, 255);
          args.duration = runtimeNumberArg(draft, "moveDuration", 60, 0, 999999);
          args.wait = String(!!draft.moveWait);
          args.easing = String(draft.moveEasing || "linear");
          break;
        case "ResetItem": break;
        default: command = "SetItemVisible"; args.visible = "true"; break;
      }
    }
    return { command, args };
  }

  function buildRuntimeCommandText() {
    const payload = buildRuntimeCommandPayload();
    if (!payload) return "";
    return `PluginManager.callCommand(this, "DB_UIComposer", ${JSON.stringify(payload.command)}, ${JSON.stringify(payload.args, null, 2)});`;
  }

  function buildRuntimeEventCommandList() {
    const payload = buildRuntimeCommandPayload();
    if (!payload) return [];
    // RPGツクールMZのイベントコマンド「プラグインコマンド」として貼り付けるための形式。
    // code 357 はMZのプラグインコマンド本体で、parameters[3] にコマンド引数を持たせます。
    return [{
      code: 357,
      indent: 0,
      parameters: [
        "DB_UIComposer",
        payload.command,
        runtimeCommandDisplayName(payload.command),
        payload.args
      ]
    }];
  }

  function buildRuntimeEventCommandText() {
    const commandList = buildRuntimeEventCommandList();
    return commandList.length > 0 ? JSON.stringify(commandList, null, 2) : "";
  }

  async function copyMzEventCommandList(commandList) {
    const list = Array.isArray(commandList) ? commandList : [];
    if (list.length <= 0) {
      showToast("コピーするMZイベントコマンドがありません");
      return false;
    }
    try {
      if (window.DB_UIComposerElectron?.writeMzEventCommands) {
        const result = await window.DB_UIComposerElectron.writeMzEventCommands(list);
        if (result === true || result?.ok) {
          showToast("MZイベントコマンドとしてコピーしました");
          return true;
        }
      }
      await navigator.clipboard.writeText(JSON.stringify(list, null, 2));
      showToast("通常テキストとしてコピーしました（MZへの直接貼り付けはElectron版で行ってください）");
      return true;
    } catch (error) {
      console.error("[DB_UIComposer Tool] MZ event command clipboard copy failed", error);
      showToast("MZイベントコマンドのコピーに失敗しました");
      return false;
    }
  }


  function commandCatalogSafeText(value, fallback = "未設定") {
    const raw = value == null ? "" : String(value);
    const text = raw
      .replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, " ")
      .replace(/[\r\n]+/g, " ")
      .replace(/\s+/g, " ")
      .replace(/\*\//g, "＊／")
      .replace(/\/\*/g, "／＊")
      .trim();
    return text || fallback;
  }

  function escapeEmbeddedJsonForScript(text) {
    return String(text || "")
      .replace(/\u2028/g, "\\u2028")
      .replace(/\u2029/g, "\\u2029");
  }

  function commandCatalogDefaultText(value) {
    return commandCatalogSafeText(value, "");
  }

  function catalogSyntaxErrorLine(text, error) {
    const message = error && error.message ? String(error.message) : String(error);
    const stack = error && error.stack ? String(error.stack) : "";
    const match = stack.match(/<anonymous>:(\d+):(\d+)/) || stack.match(/Function:(\d+):(\d+)/);
    const line = match ? Math.max(1, Number(match[1]) - 2) : 0;
    const column = match ? Number(match[2]) : 0;
    if (!line) return { message, line: 0, column: 0, context: "" };
    const lines = String(text || "").split(/\n/);
    const start = Math.max(1, line - 4);
    const end = Math.min(lines.length, line + 4);
    const context = [];
    for (let i = start; i <= end; i++) {
      const prefix = i === line ? "> " : "  ";
      context.push(prefix + String(i).padStart(5, " ") + ": " + lines[i - 1]);
    }
    return { message, line, column, context: context.join("\n") };
  }

  function commandCatalogOptionLines(options, indent = " * ") {
    const unique = [];
    const seen = new Set();
    for (const raw of options || []) {
      const value = commandCatalogSafeText(raw.value, "");
      if (!value || seen.has(value)) continue;
      seen.add(value);
      unique.push({
        label: commandCatalogSafeText(raw.label || raw.value, value),
        value
      });
    }
    if (unique.length <= 0) unique.push({ label: "未登録", value: "" });
    return unique.map(entry => `${indent}@option ${entry.label}\n${indent}@value ${entry.value}`).join("\n");
  }

  function commandCatalogTargetGroups() {
    const layoutId = commandCatalogSafeText(state.layoutId, "DefaultLayout");
    const groups = {
      all: [],
      windows: [],
      items: [],
      textItems: [],
      imageItems: [],
      compositeImageItems: [],
      visibleTargets: [],
      opacityItems: [],
      zOrderItems: [],
      scaleItems: [],
      positionItems: [],
      groupTargets: []
    };
    const add = (groupName, entry) => {
      if (groups[groupName]) groups[groupName].push(entry);
    };
    for (const group of ensureGroups()) {
      const groupId = commandCatalogSafeText(group.id, "group");
      const groupEntry = {
        label: `${layoutId} / ${commandCatalogSafeText(group.name || group.id, groupId)} [group]`,
        value: `group|${layoutId}|${groupId}`
      };
      add("groupTargets", groupEntry);
    }
    for (const win of state.windows || []) {
      const windowId = commandCatalogSafeText(win.id, "window");
      const windowEntry = {
        label: `${layoutId} / ${windowId} [window]`,
        value: `window|${layoutId}|${windowId}`
      };
      add("all", windowEntry);
      add("windows", windowEntry);
      add("visibleTargets", windowEntry);
      for (const item of win.items || []) {
        const itemId = commandCatalogSafeText(item.id, "item");
        const type = commandCatalogSafeText(item.type || "item", "item");
        const itemEntry = {
          label: `${layoutId} / ${windowId} / ${itemId} [${type}]`,
          value: `item|${layoutId}|${windowId}|${itemId}`
        };
        add("all", itemEntry);
        add("items", itemEntry);
        add("visibleTargets", itemEntry);
        add("opacityItems", itemEntry);
        add("zOrderItems", itemEntry);
        add("positionItems", itemEntry);
        if (type === "text" || type === "button" || type === "log") add("textItems", itemEntry);
        if (type === "image") {
          add("imageItems", itemEntry);
          add("scaleItems", itemEntry);
        }
        if (type === "compositeImage") {
          add("compositeImageItems", itemEntry);
          add("scaleItems", itemEntry);
        }
      }
    }
    return groups;
  }

  function commandCatalogTargets() {
    return commandCatalogTargetGroups().all;
  }

  function commandCatalogLayouts() {
    const layoutId = commandCatalogSafeText(state.layoutId, "DefaultLayout");
    return [{ label: layoutId, value: layoutId }];
  }

  function collectLayoutImageOptions(map) {
    const add = (folder, fileName) => {
      const f = normalizeImageFolder(folder || "");
      const n = stripImageExtension(fileName || "");
      if (!f || !n) return;
      const key = `${f}/${n}`;
      const lower = key.toLowerCase();
      if (!map.has(lower)) map.set(lower, { label: key, value: key });
    };
    for (const win of state.windows || []) {
      if (win.backgroundImage?.enabled || win.backgroundImage?.fileName) add(win.backgroundImage.folder, win.backgroundImage.fileName);
      if (win.decorationImage?.enabled || win.decorationImage?.fileName) add(win.decorationImage.folder, win.decorationImage.fileName);
      for (const item of win.items || []) {
        if (item.type === "image") add(item.folder, item.fileName);
        if (item.type === "compositeImage") {
          if (item.bakedImage?.fileName) add(item.bakedImage.folder, item.bakedImage.fileName);
          for (const layer of ensureCompositeImageLayers(item)) add(layer.folder, layer.fileName);
        }
      }
    }
  }

  function commandCatalogImages() {
    const map = new Map();
    collectLayoutImageOptions(map);
    if (projectAssets.loaded && projectAssets.images && projectAssets.images.size > 0) {
      for (const [key, asset] of projectAssets.images.entries()) {
        const folder = normalizeImageFolder(asset.folder || String(key).replace(/\/[^/]+$/, ""));
        const fileName = stripImageExtension(asset.baseName || String(key).split("/").pop() || "");
        if (!folder || !fileName) continue;
        const value = `${folder}/${fileName}`;
        const lower = value.toLowerCase();
        if (!map.has(lower)) map.set(lower, { label: value, value });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.value.localeCompare(b.value, undefined, { sensitivity: "base" }));
  }

  function choiceRuleStructComment() {
    return `/*~struct~DBUiChoiceRule:
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
`;
  }

  function buildCommandCatalogPluginText() {
    const targetGroups = commandCatalogTargetGroups();
    const targets = targetGroups.all;
    const layouts = commandCatalogLayouts();
    const images = commandCatalogImages();
    const targetOptions = commandCatalogOptionLines(targets);
    const textTargetOptions = commandCatalogOptionLines(targetGroups.textItems);
    const imageTargetOptions = commandCatalogOptionLines(targetGroups.imageItems);
    const compositeImageTargetOptions = commandCatalogOptionLines(targetGroups.compositeImageItems || []);
    const visibleTargetOptions = commandCatalogOptionLines(targetGroups.visibleTargets);
    const itemTargetOptions = commandCatalogOptionLines(targetGroups.items);
    const windowTargetOptions = commandCatalogOptionLines(targetGroups.windows);
    const groupTargetOptions = commandCatalogOptionLines(targetGroups.groupTargets);
    const scaleTargetOptions = commandCatalogOptionLines(targetGroups.scaleItems);
    const layoutOptions = commandCatalogOptionLines(layouts);
    const imageOptions = commandCatalogOptionLines(images);
    const defaultTextTarget = targetGroups.textItems[0]?.value || "";
    const defaultImageTarget = targetGroups.imageItems[0]?.value || "";
    const defaultCompositeImageTarget = targetGroups.compositeImageItems?.[0]?.value || "";
    const defaultVisibleTarget = targetGroups.visibleTargets[0]?.value || "";
    const defaultItemTarget = targetGroups.items[0]?.value || "";
    const defaultWindowTarget = targetGroups.windows[0]?.value || "";
    const defaultGroupTarget = targetGroups.groupTargets[0]?.value || "";
    const defaultScaleTarget = targetGroups.scaleItems[0]?.value || "";
    const defaultAnyTarget = targets[0]?.value || "";
    const compositePresetImageTable = {};
    for (const rawLib of registeredCompositePresetLibraries()) {
      const lib = normalizeCompositePresetLibrary(rawLib);
      for (const preset of lib.presets || []) {
        const fileName = preset.exportedImage?.fileName || libraryExportFileName(lib, preset);
        const folder = preset.exportedImage?.folder || `pictures/${COMPOSITE_EXPORT_ROOT_FOLDER}`;
        compositePresetImageTable[`${lib.key}\n${preset.id}`] = { folder, fileName };
      }
    }
    const compositePresetImageTableJson = escapeEmbeddedJsonForScript(JSON.stringify(compositePresetImageTable, null, 2));
    const layoutId = commandCatalogSafeText(state.layoutId, "DefaultLayout");
    return `/*:
 * @target MZ
 * @plugindesc v0.3.80 DB_UIComposer用 選択式コマンドカタログ（${layoutId}）
 * @author DB / ChatGPT
 * @base DB_UIComposer
 * @orderAfter DB_UIComposer
 *
 * @help DB_UIComposer_CommandCatalog.js
 * ----------------------------------------------------------------------------
 * このファイルは DB_UIComposer Tool から生成された補助プラグインです。
 * DB_UIComposer.js 本体のプラグインコマンドを、ツクールエディタ上で
 * ウィンドウID・パーツIDを選択しながら呼び出すためのカタログです。
 * コマンドごとに対象候補を絞り込むため、画像変更では画像パーツのみ、
 * 文字変更ではテキスト/ボタン系パーツのみを選べます。
 *
 * UI構成や画像を変更した場合は、ツールから再度「カタログJS保存」を行い、
 * このファイルを差し替えてください。
 *
 * 注意:
 * - 必ず DB_UIComposer.js より下に配置してください。
 * - この補助プラグイン自体は描画処理を持ちません。
 * - 実処理は DB_UIComposer.js に転送します。
 *
 * @command SetTargetText
 * @text 指定文字パーツの文字変更
 * @desc 対象パーツで指定したテキスト/ボタン系パーツの文字を変更します。
 *
 * @arg target
 * @text 対象文字パーツ
 * @type select
${textTargetOptions}
 * @default ${commandCatalogDefaultText(defaultTextTarget)}
 *
 * @arg text
 * @text 文字
 * @type multiline_string
 * @default 
 *
 * @command SetTargetImage
 * @text 指定画像パーツの画像変更
 * @desc 対象画像パーツで指定した画像パーツの画像を変更します。
 *
 * @arg target
 * @text 対象画像パーツ
 * @type select
${imageTargetOptions}
 * @default ${commandCatalogDefaultText(defaultImageTarget)}
 *
 * @arg image
 * @text 画像
 * @type select
${imageOptions}
 * @default ${commandCatalogDefaultText(images[0]?.value || "")}
 *
 * @command SetTargetImageByName
 * @text 指定画像パーツの画像変更（文字列指定）
 * @desc 対象画像パーツで指定した画像パーツの画像を、文字列のパスまたはファイル名で変更します。例: pictures/composite_export/heroine_happy または heroine_happy
 *
 * @arg target
 * @text 対象画像パーツ
 * @type select
${imageTargetOptions}
 * @default ${commandCatalogDefaultText(defaultImageTarget)}
 *
 * @arg folder
 * @text 既定フォルダ
 * @type string
 * @default pictures/composite_export
 *
 * @arg imageName
 * @text 画像名またはパス
 * @type string
 * @default heroine_happy
 *
 * @command SetTargetImageByVariable
 * @text 指定画像パーツの画像変更（変数指定）
 * @desc 変数に入っている画像名またはパスで、対象画像パーツの画像を変更します。変数値が heroine_happy なら既定フォルダ配下、pictures/composite_export/heroine_happy のように入れればそのパスを優先します。
 *
 * @arg target
 * @text 対象画像パーツ
 * @type select
${imageTargetOptions}
 * @default ${commandCatalogDefaultText(defaultImageTarget)}
 *
 * @arg folder
 * @text 既定フォルダ
 * @type string
 * @default pictures/composite_export
 *
 * @arg variableId
 * @text 画像名が入った変数ID
 * @type variable
 * @default 1
 *
 * @command SetCompositePresetByNameId
 * @text 統合画像プリセット呼び出し
 * @desc PSDキーと名前IDで統合画像プリセットの書き出しPNGを呼び出します。位置・拡大率などは別コマンドで指定します。
 *
 * @arg layoutId
 * @text レイアウトID
 * @type string
 * @default ${layoutId}
 *
 * @arg windowId
 * @text ウィンドウID
 * @type string
 * @default 
 *
 * @arg itemId
 * @text 統合画像パーツID
 * @type string
 * @default 
 *
 * @arg psdKey
 * @text PSDキー
 * @type string
 * @default 
 *
 * @arg nameId
 * @text 名前ID
 * @type string
 * @default 
 *
 * @command SetCompositeTargetImages
 * @text 指定統合画像パーツの構成変更
 * @desc 対象統合画像パーツで指定した統合画像のレイヤー構成をJSON文字列で差し替えます。
 *
 * @arg target
 * @text 対象統合画像パーツ
 * @type select
${compositeImageTargetOptions}
 * @default ${commandCatalogDefaultText(defaultCompositeImageTarget)}
 *
 * @arg layersJson
 * @text レイヤーJSON
 * @type multiline_string
 * @default []
 *
 * @command FadeInCompositeTarget
 * @text 指定統合画像パーツをフェードイン表示
 * @desc 対象統合画像パーツを再表示しつつ、指定時間でフェードインします。
 *
 * @arg target
 * @text 対象統合画像パーツ
 * @type select
${compositeImageTargetOptions}
 * @default ${commandCatalogDefaultText(defaultCompositeImageTarget)}
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
 * @command SetWindowBackgroundImage
 * @text 指定ウィンドウの背景画像変更
 * @desc 対象ウィンドウで指定したウィンドウの背景画像を変更します。
 *
 * @arg target
 * @text 対象ウィンドウ
 * @type select
${windowTargetOptions}
 * @default ${commandCatalogDefaultText(defaultWindowTarget)}
 *
 * @arg enabled
 * @text 背景画像を使う
 * @type boolean
 * @default true
 *
 * @arg image
 * @text 画像
 * @type select
${imageOptions}
 * @default ${commandCatalogDefaultText(images[0]?.value || "")}
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
 * @text 不透明度
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
 * @text 指定ウィンドウの装飾画像変更
 * @desc 対象ウィンドウで指定したウィンドウの装飾画像を変更します。
 *
 * @arg target
 * @text 対象ウィンドウ
 * @type select
${windowTargetOptions}
 * @default ${commandCatalogDefaultText(defaultWindowTarget)}
 *
 * @arg enabled
 * @text 装飾画像を使う
 * @type boolean
 * @default true
 *
 * @arg image
 * @text 画像
 * @type select
${imageOptions}
 * @default ${commandCatalogDefaultText(images[0]?.value || "")}
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
 * @text 不透明度
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
 * @command AddLogText
 * @text 指定ウィンドウへログ追加
 * @desc 対象ウィンドウで指定したウィンドウへログを1行追加します。\V[n]や\C[n]などの制御文字に対応します。
 *
 * @arg target
 * @text 対象ウィンドウ
 * @type select
${windowTargetOptions}
 * @default ${commandCatalogDefaultText(defaultWindowTarget)}
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
 * @text 追加後に一番下へ
 * @type boolean
 * @default true
 *
 * @command ClearLog
 * @text 指定ウィンドウのログ消去
 * @desc 対象ウィンドウで指定したウィンドウのログをすべて消去します。
 *
 * @arg target
 * @text 対象ウィンドウ
 * @type select
${windowTargetOptions}
 * @default ${commandCatalogDefaultText(defaultWindowTarget)}
 *
 * @command SetChoiceList
 * @text 指定ウィンドウ内のカスタマイズ選択肢更新
 * @desc 対象ウィンドウで指定したウィンドウ内のカスタマイズ選択肢を作成/更新します。シンプル選択肢の内部内容は変更しません。
 *
 * @arg target
 * @text 対象ウィンドウ
 * @type select
${windowTargetOptions}
 * @default ${commandCatalogDefaultText(defaultWindowTarget)}
 *
 * @arg itemId
 * @text 選択肢パーツID
 * @type string
 * @default choiceList1
 *
 * @arg choiceRules
 * @text 選択肢条件リスト
 * @type struct<DBUiChoiceRule>[]
 * @desc 選択肢本文・条件・成立時/不成立時の表示状態をリストで設定します。空欄ならツールテンプレートを使います。
 * @default []
 *
 * @arg width
 * @text 幅
 * @type number
 * @min 0
 * @default 0
 * @desc 0なら既存テンプレート設定を維持し、1以上ならコマンド値で上書きします。
 *
 * @arg rowHeight
 * @text 1項目の高さ
 * @type number
 * @min 0
 * @default 0
 * @desc 0なら既存テンプレート設定を維持し、1以上ならコマンド値で上書きします。
 *
 * @arg maxVisibleRows
 * @text 最大表示数
 * @type number
 * @min 0
 * @default 0
 * @desc 0なら既存テンプレート設定を維持し、1以上ならコマンド値で上書きします。
 *
 * @arg autoResizeWindow
 * @text 選択肢数でウィンドウ高さ変更
 * @type boolean
 * @default true
 *
 * @arg closeWindowOnSelect
 * @text 選択後にウィンドウを削除
 * @type boolean
 * @default false
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
 * @text 指定ウィンドウの入力有効切替
 * @desc 対象ウィンドウで指定したウィンドウ内のボタン/選択肢クリックを有効・無効にします。
 *
 * @arg target
 * @text 対象ウィンドウ
 * @type select
${windowTargetOptions}
 * @default ${commandCatalogDefaultText(defaultWindowTarget)}
 *
 * @arg enabled
 * @text 入力有効
 * @type boolean
 * @default true
 *
 * @command SetWindowScroll
 * @text 指定ウィンドウのスクロール設定
 * @desc 対象ウィンドウのスクロール有効状態とスクロール位置を変更します。
 *
 * @arg target
 * @text 対象ウィンドウ
 * @type select
${windowTargetOptions}
 * @default ${commandCatalogDefaultText(defaultWindowTarget)}
 *
 * @arg enabled
 * @text スクロール有効
 * @type boolean
 * @default true
 *
 * @arg scrollY
 * @text スクロールY
 * @type number
 * @min 0
 * @default 0
 *
 * @command SetGroupVisible
 * @text 指定グループの表示切替
 * @desc 対象グループで指定したグループに所属するウィンドウをまとめて表示/非表示します。
 *
 * @arg target
 * @text 対象グループ
 * @type select
${groupTargetOptions}
 * @default ${commandCatalogDefaultText(defaultGroupTarget)}
 *
 * @arg visible
 * @text 表示する
 * @type boolean
 * @default true
 *
 * @command SetTargetVisible
 * @text 指定ウィンドウ/パーツの表示切替
 * @desc 対象で指定したウィンドウまたはパーツの表示/非表示を切り替えます。
 *
 * @arg target
 * @text 対象ウィンドウ/パーツ
 * @type select
${visibleTargetOptions}
 * @default ${commandCatalogDefaultText(defaultVisibleTarget)}
 *
 * @arg visible
 * @text 表示する
 * @type boolean
 * @default true
 *
 * @command SetTargetOpacity
 * @text 指定パーツの不透明度変更
 * @desc 対象パーツで指定したパーツの不透明度を変更します。
 *
 * @arg target
 * @text 対象パーツ
 * @type select
${itemTargetOptions}
 * @default ${commandCatalogDefaultText(defaultItemTarget)}
 *
 * @arg opacity
 * @text 不透明度
 * @type number
 * @min 0
 * @max 255
 * @default 255
 *
 * @command SetTargetZOrder
 * @text 指定パーツの表示順変更
 * @desc 対象パーツで指定したパーツの表示順を変更します。
 *
 * @arg target
 * @text 対象パーツ
 * @type select
${itemTargetOptions}
 * @default ${commandCatalogDefaultText(defaultItemTarget)}
 *
 * @arg zOrder
 * @text 表示順
 * @type number
 * @min -9999
 * @default 0
 *
 * @command SetTargetScale
 * @text 指定対象の拡大率変更
 * @desc 選択した画像パーツの拡大率を変更します。
 *
 * @arg target
 * @text 対象
 * @type select
${scaleTargetOptions}
 * @default ${commandCatalogDefaultText(defaultScaleTarget)}
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
 * @command SetTargetPosition
 * @text 指定対象の座標変更
 * @desc 対象パーツで指定したパーツの内部座標を変更します。ウィンドウ本体を選んだ場合は無視されます。
 *
 * @arg target
 * @text 対象パーツ
 * @type select
${itemTargetOptions}
 * @default ${commandCatalogDefaultText(defaultItemTarget)}
 *
 * @arg x
 * @text X
 * @type number
 * @min -9999
 * @default 0
 *
 * @arg y
 * @text Y
 * @type number
 * @min -9999
 * @default 0
 *
 * @command MoveTarget
 * @text 指定パーツの移動
 * @desc 対象パーツで指定したパーツを、指定フレーム数で移動します。
 *
 * @arg target
 * @text 対象パーツ
 * @type select
${itemTargetOptions}
 * @default ${commandCatalogDefaultText(defaultItemTarget)}
 *
 * @arg x
 * @text 移動先X
 * @type number
 * @min -9999
 * @default 0
 *
 * @arg y
 * @text 移動先Y
 * @type number
 * @min -9999
 * @default 0
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
 * @arg opacity
 * @text 不透明度
 * @type number
 * @min 0
 * @max 255
 * @default 255
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
 * @command ResetTarget
 * @text 指定パーツの状態を初期化
 * @desc 対象パーツで指定したパーツの実行時変更を初期化します。ウィンドウ本体を選んだ場合はそのレイアウト全体を初期化します。
 *
 * @arg target
 * @text 対象
 * @type select
${targetOptions}
 * @default ${commandCatalogDefaultText(defaultAnyTarget)}
 *
 * @command ResetLayoutState
 * @text 指定レイアウト状態を初期化
 * @desc 対象レイアウトで指定したレイアウトの実行時変更をすべて初期化します。
 *
 * @arg layoutId
 * @text 対象レイアウト
 * @type select
${layoutOptions}
 * @default ${commandCatalogDefaultText(layouts[0]?.value || "")}
 */
${choiceRuleStructComment()}
(() => {
  "use strict";

  const PLUGIN_NAME = "DB_UIComposer_CommandCatalog";
  const MAIN_PLUGIN_NAME = "DB_UIComposer";
  const COMPOSITE_PRESET_IMAGE_TABLE = ${compositePresetImageTableJson};

  function parseTarget(value) {
    const parts = String(value || "").split("|");
    if (parts[0] === "item") {
      return { kind: "item", layoutId: parts[1] || "", windowId: parts[2] || "", itemId: parts[3] || "" };
    }
    if (parts[0] === "window") {
      return { kind: "window", layoutId: parts[1] || "", windowId: parts[2] || "" };
    }
    if (parts[0] === "group") {
      return { kind: "group", layoutId: parts[1] || "", groupId: parts[2] || "" };
    }
    return { kind: "", layoutId: "", windowId: "", itemId: "" };
  }

  function parseImage(value) {
    const stripExt = function(name) {
      return String(name || "").replace(/[.](png|jpg|jpeg|webp|gif|bmp)$/i, "");
    };
    const path = String(value || "").split(String.fromCharCode(92)).join("/").replace(/^img[/]/i, "").replace(/^[/]+|[/]+$/g, "");
    const index = path.lastIndexOf("/");
    if (index < 0) return { folder: "pictures", fileName: stripExt(path) };
    return {
      folder: path.slice(0, index),
      fileName: stripExt(path.slice(index + 1))
    };
  }

  function parseImageFromText(folderValue, imageNameValue) {
    const fallbackFolder = String(folderValue || "pictures").trim() || "pictures";
    const raw = String(imageNameValue || "").trim();
    if (!raw) return { folder: fallbackFolder, fileName: "" };
    const normalized = raw.split(String.fromCharCode(92)).join("/");
    if (normalized.includes("/")) return parseImage(normalized);
    return { folder: fallbackFolder.replace(/^img[/]/i, "").replace(/^[/]+|[/]+$/g, "") || "pictures", fileName: raw.replace(/[.](png|jpg|jpeg|webp|gif|bmp)$/i, "") };
  }

  function callMain(context, command, args) {
    PluginManager.callCommand(context, MAIN_PLUGIN_NAME, command, args);
  }

  function itemOnly(target, commandName) {
    if (target.kind !== "item") {
      console.warn("[" + PLUGIN_NAME + "] " + commandName + " はパーツ対象専用です。", target);
      return false;
    }
    return true;
  }

  PluginManager.registerCommand(PLUGIN_NAME, "SetTargetText", function(args) {
    const target = parseTarget(args.target);
    if (!itemOnly(target, "SetTargetText")) return;
    callMain(this, "SetItemText", {
      layoutId: target.layoutId,
      windowId: target.windowId,
      itemId: target.itemId,
      text: String(args.text == null ? "" : args.text)
    });
  });

  PluginManager.registerCommand(PLUGIN_NAME, "SetTargetImage", function(args) {
    const target = parseTarget(args.target);
    if (!itemOnly(target, "SetTargetImage")) return;
    const image = parseImage(args.image);
    callMain(this, "SetItemImage", {
      layoutId: target.layoutId,
      windowId: target.windowId,
      itemId: target.itemId,
      folder: image.folder,
      fileName: image.fileName
    });
  });

  PluginManager.registerCommand(PLUGIN_NAME, "SetTargetImageByName", function(args) {
    const target = parseTarget(args.target);
    if (!itemOnly(target, "SetTargetImageByName")) return;
    const image = parseImageFromText(args.folder, args.imageName);
    callMain(this, "SetItemImage", {
      layoutId: target.layoutId,
      windowId: target.windowId,
      itemId: target.itemId,
      folder: image.folder,
      fileName: image.fileName
    });
  });

  PluginManager.registerCommand(PLUGIN_NAME, "SetTargetImageByVariable", function(args) {
    const target = parseTarget(args.target);
    if (!itemOnly(target, "SetTargetImageByVariable")) return;
    const variableId = Number(args.variableId || 0) || 0;
    const variableValue = variableId > 0 && $gameVariables ? $gameVariables.value(variableId) : "";
    const image = parseImageFromText(args.folder, variableValue);
    callMain(this, "SetItemImage", {
      layoutId: target.layoutId,
      windowId: target.windowId,
      itemId: target.itemId,
      folder: image.folder,
      fileName: image.fileName
    });
  });

  PluginManager.registerCommand(PLUGIN_NAME, "SetCompositePresetByNameId", function(args) {
    const layoutId = String(args.layoutId || "");
    const windowId = String(args.windowId || "");
    const itemId = String(args.itemId || "");
    const psdKey = String(args.psdKey || "");
    const nameId = String(args.nameId || "");
    const image = COMPOSITE_PRESET_IMAGE_TABLE[psdKey + "\n" + nameId];
    if (!image) {
      console.warn("[" + PLUGIN_NAME + "] 統合画像プリセットが見つかりません。", { psdKey: psdKey, nameId: nameId });
      return;
    }
    callMain(this, "SetItemImage", {
      layoutId: layoutId,
      windowId: windowId,
      itemId: itemId,
      folder: image.folder,
      fileName: image.fileName
    });
  });

  PluginManager.registerCommand(PLUGIN_NAME, "SetCompositeTargetImages", function(args) {
    const target = parseTarget(args.target);
    if (!itemOnly(target, "SetCompositeTargetImages")) return;
    callMain(this, "SetCompositeImageSet", {
      layoutId: target.layoutId,
      windowId: target.windowId,
      itemId: target.itemId,
      layersJson: String(args.layersJson || "[]")
    });
  });

  PluginManager.registerCommand(PLUGIN_NAME, "FadeInCompositeTarget", function(args) {
    const target = parseTarget(args.target);
    if (!itemOnly(target, "FadeInCompositeTarget")) return;
    callMain(this, "FadeInCompositeImage", {
      layoutId: target.layoutId,
      windowId: target.windowId,
      itemId: target.itemId,
      visible: String(args.visible === true || args.visible === "true"),
      duration: String(Number(args.duration || 30))
    });
  });

  function windowOnly(target, commandName) {
    if (target.kind !== "window") {
      console.warn("[" + PLUGIN_NAME + "] " + commandName + " はウィンドウ対象専用です。", target);
      return false;
    }
    return true;
  }

  PluginManager.registerCommand(PLUGIN_NAME, "SetWindowBackgroundImage", function(args) {
    const target = parseTarget(args.target);
    if (!windowOnly(target, "SetWindowBackgroundImage")) return;
    const image = parseImage(args.image);
    callMain(this, "SetWindowBackgroundImage", {
      layoutId: target.layoutId,
      windowId: target.windowId,
      enabled: String(args.enabled === true || args.enabled === "true"),
      folder: image.folder,
      fileName: image.fileName,
      mode: String(args.mode || "stretch"),
      opacity: String(Number(args.opacity || 255)),
      zOrder: String(Number(args.zOrder || -100))
    });
  });

  PluginManager.registerCommand(PLUGIN_NAME, "SetWindowDecorationImage", function(args) {
    const target = parseTarget(args.target);
    if (!windowOnly(target, "SetWindowDecorationImage")) return;
    const image = parseImage(args.image);
    callMain(this, "SetWindowDecorationImage", {
      layoutId: target.layoutId,
      windowId: target.windowId,
      enabled: String(args.enabled === true || args.enabled === "true"),
      folder: image.folder,
      fileName: image.fileName,
      mode: String(args.mode || "stretch"),
      opacity: String(Number(args.opacity || 255)),
      zOrder: String(Number(args.zOrder || 100))
    });
  });

  PluginManager.registerCommand(PLUGIN_NAME, "AddLogText", function(args) {
    const target = parseTarget(args.target);
    if (!windowOnly(target, "AddLogText")) return;
    callMain(this, "AddLogText", {
      layoutId: target.layoutId,
      windowId: target.windowId,
      text: String(args.text == null ? "" : args.text),
      maxLines: String(Number(args.maxLines || 200)),
      scrollToBottom: String(args.scrollToBottom === true || args.scrollToBottom === "true")
    });
  });

  PluginManager.registerCommand(PLUGIN_NAME, "ClearLog", function(args) {
    const target = parseTarget(args.target);
    if (!windowOnly(target, "ClearLog")) return;
    callMain(this, "ClearLog", {
      layoutId: target.layoutId,
      windowId: target.windowId
    });
  });

  PluginManager.registerCommand(PLUGIN_NAME, "SetChoiceList", function(args) {
    const target = parseTarget(args.target);
    if (!windowOnly(target, "SetChoiceList")) return;
    callMain(this, "SetChoiceList", {
      layoutId: target.layoutId,
      windowId: target.windowId,
      itemId: String(args.itemId || "choiceList1"),
      choiceRules: String(args.choiceRules || ""),
      width: String(Number(args.width || 0)),
      rowHeight: String(Number(args.rowHeight || 0)),
      maxVisibleRows: String(Number(args.maxVisibleRows || 0)),
      autoResizeWindow: String(args.autoResizeWindow === true || args.autoResizeWindow === "true"),
      closeWindowOnSelect: String(args.closeWindowOnSelect === true || args.closeWindowOnSelect === "true"),
      resultVariableId: String(Number(args.resultVariableId || 0)),
      resultTextVariableId: String(Number(args.resultTextVariableId || 0)),
      commonEventId: String(Number(args.commonEventId || 0)),
      script: String(args.script || "")
    });
  });

  PluginManager.registerCommand(PLUGIN_NAME, "SetWindowInputEnabled", function(args) {
    const target = parseTarget(args.target);
    if (!windowOnly(target, "SetWindowInputEnabled")) return;
    callMain(this, "SetWindowInputEnabled", {
      layoutId: target.layoutId,
      windowId: target.windowId,
      enabled: String(args.enabled === true || args.enabled === "true")
    });
  });

  PluginManager.registerCommand(PLUGIN_NAME, "SetWindowScroll", function(args) {
    const target = parseTarget(args.target);
    if (!windowOnly(target, "SetWindowScroll")) return;
    callMain(this, "SetWindowScroll", {
      layoutId: target.layoutId,
      windowId: target.windowId,
      enabled: String(args.enabled === true || args.enabled === "true"),
      scrollY: String(Number(args.scrollY || 0))
    });
  });

  PluginManager.registerCommand(PLUGIN_NAME, "SetGroupVisible", function(args) {
    const target = parseTarget(args.target);
    if (target.kind !== "group") {
      console.warn("[" + PLUGIN_NAME + "] SetGroupVisible はグループ対象専用です。", target);
      return;
    }
    callMain(this, "SetGroupVisible", {
      layoutId: target.layoutId,
      groupId: target.groupId,
      visible: String(args.visible || "true")
    });
  });

  PluginManager.registerCommand(PLUGIN_NAME, "SetTargetVisible", function(args) {
    const target = parseTarget(args.target);
    if (target.kind === "window") {
      callMain(this, "SetWindowVisible", {
        layoutId: target.layoutId,
        windowId: target.windowId,
        visible: String(args.visible === true || args.visible === "true")
      });
    } else if (target.kind === "item") {
      callMain(this, "SetItemVisible", {
        layoutId: target.layoutId,
        windowId: target.windowId,
        itemId: target.itemId,
        visible: String(args.visible === true || args.visible === "true")
      });
    }
  });

  PluginManager.registerCommand(PLUGIN_NAME, "SetTargetOpacity", function(args) {
    const target = parseTarget(args.target);
    if (!itemOnly(target, "SetTargetOpacity")) return;
    callMain(this, "SetItemOpacity", {
      layoutId: target.layoutId,
      windowId: target.windowId,
      itemId: target.itemId,
      opacity: String(Number(args.opacity || 255))
    });
  });

  PluginManager.registerCommand(PLUGIN_NAME, "SetTargetZOrder", function(args) {
    const target = parseTarget(args.target);
    if (!itemOnly(target, "SetTargetZOrder")) return;
    callMain(this, "SetItemZOrder", {
      layoutId: target.layoutId,
      windowId: target.windowId,
      itemId: target.itemId,
      zOrder: String(Number(args.zOrder || 0))
    });
  });

  PluginManager.registerCommand(PLUGIN_NAME, "SetTargetScale", function(args) {
    const target = parseTarget(args.target);
    if (!itemOnly(target, "SetTargetScale")) return;
    callMain(this, "SetItemScale", {
      layoutId: target.layoutId,
      windowId: target.windowId,
      itemId: target.itemId,
      scaleXPercent: String(Number(args.scaleXPercent || 100)),
      scaleYPercent: String(Number(args.scaleYPercent || 100))
    });
  });

  PluginManager.registerCommand(PLUGIN_NAME, "SetTargetPosition", function(args) {
    const target = parseTarget(args.target);
    if (!itemOnly(target, "SetTargetPosition")) return;
    callMain(this, "SetItemPosition", {
      layoutId: target.layoutId,
      windowId: target.windowId,
      itemId: target.itemId,
      x: String(Number(args.x || 0)),
      y: String(Number(args.y || 0))
    });
  });

  PluginManager.registerCommand(PLUGIN_NAME, "MoveTarget", function(args) {
    const target = parseTarget(args.target);
    if (!itemOnly(target, "MoveTarget")) return;
    callMain(this, "MoveItem", {
      layoutId: target.layoutId,
      windowId: target.windowId,
      itemId: target.itemId,
      x: String(Number(args.x || 0)),
      y: String(Number(args.y || 0)),
      scaleXPercent: String(Number(args.scaleXPercent || 100)),
      scaleYPercent: String(Number(args.scaleYPercent || 100)),
      opacity: String(Number(args.opacity || 255)),
      duration: String(Number(args.duration || 60)),
      wait: String(args.wait === true || args.wait === "true"),
      easing: String(args.easing || "linear")
    });
  });

  PluginManager.registerCommand(PLUGIN_NAME, "ResetTarget", function(args) {
    const target = parseTarget(args.target);
    if (target.kind === "item") {
      callMain(this, "ResetItem", {
        layoutId: target.layoutId,
        windowId: target.windowId,
        itemId: target.itemId
      });
    } else if (target.kind === "window") {
      callMain(this, "ResetLayoutState", { layoutId: target.layoutId });
    }
  });

  PluginManager.registerCommand(PLUGIN_NAME, "ResetLayoutState", function(args) {
    callMain(this, "ResetLayoutState", { layoutId: String(args.layoutId || "") });
  });
})();
`;
  }

  function validateCommandCatalogPluginText(text) {
    try {
      // Generated catalog must be valid JavaScript before it is saved for MZ.
      // This catches accidental comment termination by asset names and template generation mistakes.
      new Function(text);
      return null;
    } catch (error) {
      const detail = catalogSyntaxErrorLine(text, error);
      console.error("[DB_UIComposer Tool] DB_UIComposer_CommandCatalog.js syntax check failed", error, detail);
      debugLog("error", "カタログJSの構文チェックに失敗しました。", detail);
      return detail;
    }
  }

  function catalogSaveRegistered() {
    return catalogSaveMode === CATALOG_SAVE_MODE_PROJECT || catalogSaveMode === CATALOG_SAVE_MODE_FILE || !!currentCatalogPluginFileHandle;
  }

  function updateCatalogSaveUi() {
    const btn = $("saveCatalogPluginBtn");
    if (!btn) return;
    const suffix = catalogSaveRegistered() ? "（登録済み。保存ボタンでも自動更新）" : "";
    btn.textContent = catalogSaveRegistered() ? "カタログJS更新" : "カタログJS保存";
    if (catalogSaveMode === CATALOG_SAVE_MODE_PROJECT) {
      btn.title = `現在のレイアウトから ${projectAssets.name || "ツクールプロジェクト"}/js/plugins/DB_UIComposer_CommandCatalog.js を更新します${suffix}。`;
    } else if (currentCatalogPluginFileHandle) {
      btn.title = `現在のレイアウトから ${currentCatalogPluginFileName || "DB_UIComposer_CommandCatalog.js"} を更新します${suffix}。`;
    } else {
      btn.title = "現在のレイアウトのウィンドウID・パーツID・画像候補を選択肢化した補助プラグインJSを保存します。初回保存後は、通常の保存ボタンでも自動更新します。";
    }
  }

  async function ensureFileWritePermission(handle) {
    if (!handle) return false;
    const options = { mode: "readwrite" };
    try {
      if (typeof handle.queryPermission === "function") {
        const status = await handle.queryPermission(options);
        if (status === "granted") return true;
      }
      if (typeof handle.requestPermission === "function") {
        const status = await handle.requestPermission(options);
        return status === "granted";
      }
      return true;
    } catch (e) {
      debugLog("warn", "ファイルの書込権限を確認できませんでした。", { message: e?.message || String(e), name: e?.name || "" });
      return false;
    }
  }

  async function ensureDirectoryWritePermission(handle) {
    if (!handle) return false;
    const options = { mode: "readwrite" };
    try {
      if (typeof handle.queryPermission === "function") {
        const status = await handle.queryPermission(options);
        if (status === "granted") return true;
      }
      if (typeof handle.requestPermission === "function") {
        const status = await handle.requestPermission(options);
        return status === "granted";
      }
      return true;
    } catch (e) {
      debugLog("warn", "プロジェクトフォルダの書込権限を確認できませんでした。", { message: e?.message || String(e), name: e?.name || "" });
      return false;
    }
  }

  async function getProjectCatalogFileHandle(options = {}) {
    if (!projectAssets.directoryHandle) return null;
    const ok = await ensureDirectoryWritePermission(projectAssets.directoryHandle);
    if (!ok) return null;
    try {
      const jsDir = await projectAssets.directoryHandle.getDirectoryHandle("js", { create: !!options.create });
      const pluginsDir = await jsDir.getDirectoryHandle("plugins", { create: !!options.create });
      return await pluginsDir.getFileHandle("DB_UIComposer_CommandCatalog.js", { create: !!options.create });
    } catch (e) {
      debugLog("warn", "ツクールプロジェクトの js/plugins へカタログJSを保存できませんでした。", {
        message: e?.message || String(e),
        name: e?.name || "",
        projectName: projectAssets.name || ""
      });
      return null;
    }
  }

  async function writeTextToFileHandle(handle, text) {
    const writable = await handle.createWritable();
    await writable.write(new Blob([text], { type: "application/javascript" }));
    await writable.close();
  }

  async function writeCatalogToHandle(handle, text, options = {}) {
    if (!handle) return false;
    const ok = await ensureFileWritePermission(handle);
    if (!ok) return false;
    await writeTextToFileHandle(handle, text);
    currentCatalogPluginFileHandle = handle;
    currentCatalogPluginFileName = handle.name || "DB_UIComposer_CommandCatalog.js";
    if (options.mode === CATALOG_SAVE_MODE_FILE) {
      catalogSaveMode = CATALOG_SAVE_MODE_FILE;
      localStorage.setItem(CATALOG_SAVE_MODE_KEY, catalogSaveMode);
      try { await idbSet(CATALOG_HANDLE_KEY, handle); } catch (_) {}
    }
    updateCatalogSaveUi();
    if (!options.quiet) showToast("カタログJSを保存しました");
    debugLog("info", options.auto ? "カタログJSを自動更新しました。" : "DB_UIComposer_CommandCatalog.js を保存しました。", {
      layoutId: state.layoutId,
      fileName: currentCatalogPluginFileName,
      mode: options.mode || catalogSaveMode || "file",
      auto: !!options.auto,
      targetCount: commandCatalogTargets().length,
      imageCount: commandCatalogImages().length,
      filteredCommands: true,
      syntaxChecked: true
    });
    return true;
  }

  async function writeCatalogToProjectRelative(text, options = {}) {
    const handle = await getProjectCatalogFileHandle({ create: true });
    if (!handle) return false;
    await writeTextToFileHandle(handle, text);
    currentCatalogPluginFileHandle = null;
    currentCatalogPluginFileName = "js/plugins/DB_UIComposer_CommandCatalog.js";
    catalogSaveMode = CATALOG_SAVE_MODE_PROJECT;
    localStorage.setItem(CATALOG_SAVE_MODE_KEY, catalogSaveMode);
    updateCatalogSaveUi();
    if (!options.quiet) showToast("プロジェクトの js/plugins にカタログJSを保存しました");
    debugLog("info", options.auto ? "プロジェクト相対パスのカタログJSを自動更新しました。" : "プロジェクト相対パスへカタログJSを保存しました。", {
      layoutId: state.layoutId,
      projectName: projectAssets.name || "",
      relativePath: "js/plugins/DB_UIComposer_CommandCatalog.js",
      auto: !!options.auto,
      targetCount: commandCatalogTargets().length,
      imageCount: commandCatalogImages().length,
      filteredCommands: true,
      syntaxChecked: true
    });
    return true;
  }

  function downloadCommandCatalogPlugin(text) {
    const blob = new Blob([text], { type: "application/javascript" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "DB_UIComposer_CommandCatalog.js";
    a.click();
    URL.revokeObjectURL(a.href);
    currentCatalogPluginFileHandle = null;
    currentCatalogPluginFileName = "DB_UIComposer_CommandCatalog.js";
    catalogSaveMode = "";
    localStorage.removeItem(CATALOG_SAVE_MODE_KEY);
    updateCatalogSaveUi();
    showToast("カタログ補助プラグインをダウンロード保存しました");
    debugLog("info", "DB_UIComposer_CommandCatalog.js をダウンロード生成しました。", {
      layoutId: state.layoutId,
      targetCount: commandCatalogTargets().length,
      imageCount: commandCatalogImages().length,
      filteredCommands: true,
      syntaxChecked: true
    });
  }

  async function saveCommandCatalogPlugin(options = {}) {
    const text = buildCommandCatalogPluginText();
    const detail = validateCommandCatalogPluginText(text);
    if (detail) {
      if (!options.auto) {
        alert("カタログJSの構文チェックに失敗しました。\n" + detail.message + (detail.line ? "\nline: " + detail.line + " column: " + detail.column : "") + "\nコンソールの詳細ログを確認してください。");
      }
      return false;
    }

    // 自動更新時は、すでに登録済みの保存先だけを使い、ダイアログは出しません。
    if (options.auto) {
      try {
        if (catalogSaveMode === CATALOG_SAVE_MODE_PROJECT) return await writeCatalogToProjectRelative(text, { auto: true, quiet: true });
        if (currentCatalogPluginFileHandle) return await writeCatalogToHandle(currentCatalogPluginFileHandle, text, { auto: true, quiet: true, mode: CATALOG_SAVE_MODE_FILE });
        if (catalogSaveMode === CATALOG_SAVE_MODE_FILE) {
          const restored = await restoreCatalogFileHandle();
          if (restored && currentCatalogPluginFileHandle) return await writeCatalogToHandle(currentCatalogPluginFileHandle, text, { auto: true, quiet: true, mode: CATALOG_SAVE_MODE_FILE });
        }
      } catch (e) {
        debugLog("warn", "カタログJSの自動更新に失敗しました。必要なら『カタログJS保存』で保存先を再指定してください。", {
          message: e?.message || String(e), name: e?.name || "", mode: catalogSaveMode || ""
        });
      }
      return false;
    }

    // 通常保存時は、まずプロジェクト相対パス js/plugins を優先します。
    try {
      if (projectAssets.directoryHandle) {
        const saved = await writeCatalogToProjectRelative(text, { auto: false, quiet: false });
        if (saved) return true;
      }
      if (currentCatalogPluginFileHandle) {
        const saved = await writeCatalogToHandle(currentCatalogPluginFileHandle, text, { auto: false, quiet: false, mode: CATALOG_SAVE_MODE_FILE });
        if (saved) return true;
      }
      if (supportsToolDataSavePicker()) {
        const handle = await window.showSaveFilePicker({
          suggestedName: "DB_UIComposer_CommandCatalog.js",
          types: [{ description: "RPGツクールMZ プラグインJS", accept: { "application/javascript": [".js"], "text/javascript": [".js"] } }]
        });
        return await writeCatalogToHandle(handle, text, { auto: false, quiet: false, mode: CATALOG_SAVE_MODE_FILE });
      }
    } catch (e) {
      if (e?.name === "AbortError") {
        showToast("カタログJS保存をキャンセルしました");
        return false;
      }
      debugLog("warn", "カタログJSの保存先指定に失敗したため、ダウンロード保存へ切り替えます。", { message: e?.message || String(e), name: e?.name || "" });
    }
    downloadCommandCatalogPlugin(text);
    return true;
  }

  async function restoreCatalogFileHandle() {
    if (currentCatalogPluginFileHandle) return true;
    try {
      const handle = await idbGet(CATALOG_HANDLE_KEY);
      if (!handle) return false;
      currentCatalogPluginFileHandle = handle;
      currentCatalogPluginFileName = handle.name || "DB_UIComposer_CommandCatalog.js";
      updateCatalogSaveUi();
      return true;
    } catch (e) {
      debugLog("warn", "保存済みカタログJSファイル情報を読み込めませんでした。", { message: e?.message || String(e), name: e?.name || "" });
      return false;
    }
  }

  async function autoUpdateCatalogAfterToolSave() {
    if (!catalogSaveRegistered()) return false;
    const updated = await saveCommandCatalogPlugin({ auto: true });
    if (updated) {
      showToast("ツールデータ保存＋カタログJS更新完了");
    }
    return updated;
  }

  let currentPropertySectionBody = null;
  let currentPropertySectionIndex = 0;
  const propertySectionOpenState = new Map();
  const propertyTargetObjectKeys = new WeakMap();
  let propertyTargetObjectKeySerial = 1;

  function appendPropertyControl(element) {
    (currentPropertySectionBody || props).appendChild(element);
  }

  function shouldOpenPropertySection(title) {
    return /基本|内容|配置|サイズ|画像設定|見た目|値|データベース/.test(String(title || ""));
  }

  function addPropertySubheader(text) {
    const div = document.createElement("div");
    div.className = "property-subheader";
    setHoverHelp(div, text);
    div.textContent = text;
    appendPropertyControl(div);
  }

  function currentPropertyTargetKey() {
    if (!selected) return "none";
    const stableObjectKey = (prefix, obj, fallback) => {
      if (!obj || (typeof obj !== "object" && typeof obj !== "function")) return `${prefix}:${fallback}`;
      let key = propertyTargetObjectKeys.get(obj);
      if (!key) {
        key = `${prefix}@${propertyTargetObjectKeySerial++}`;
        propertyTargetObjectKeys.set(obj, key);
      }
      return key;
    };
    if (selected.kind === "group") {
      const group = selectedGroup();
      return stableObjectKey("group", group, selected.groupId || "");
    }
    if (selected.kind === "window") {
      const win = selectedWindow();
      return stableObjectKey("window", win, selected.windowId || "");
    }
    const item = selectedItem();
    return stableObjectKey("item", item, `${selected.windowId || ""}:${selected.itemId || ""}`);
  }

  function propertySectionKey(title) {
    const index = currentPropertySectionIndex++;
    return `${currentPropertyTargetKey()}::${index}::${String(title || "")}`;
  }

  function addPropertyHeader(title, subtitle = "") {
    const box = document.createElement("div");
    box.className = "property-header-card";
    const h = document.createElement("div");
    h.className = "property-header-title";
    h.textContent = title;
    box.appendChild(h);
    if (subtitle) {
      const s = document.createElement("div");
      s.className = "property-header-subtitle";
      s.textContent = subtitle;
      box.appendChild(s);
    }
    props.appendChild(box);
  }

  function addTopSwitches(items) {
    const row = document.createElement("div");
    row.className = "property-top-switches";
    for (const item of items) {
      if (item.kind === "visibility") {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "property-top-icon-toggle property-top-icon-visible";
        button.title = item.help || (item.value ? "クリックで非表示" : "クリックで表示");
        button.setAttribute("aria-label", button.title);
        setHoverHelp(button, item.label || "表示", item.help || "");
        const img = document.createElement("img");
        img.src = item.value ? "assets/ake.png" : "assets/toji.png";
        img.alt = item.value ? "表示" : "非表示";
        img.draggable = false;
        const text = document.createElement("span");
        text.textContent = item.label || "表示";
        button.appendChild(img);
        button.appendChild(text);
        button.addEventListener("click", () => {
          runStateMutation(`${item.label}変更`, () => item.onChange(!item.value));
        });
        row.appendChild(button);
        continue;
      }
      if (item.kind === "lock") {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "property-top-icon-toggle property-top-icon-lock";
        button.title = item.help || (item.value ? "クリックで位置ロック解除" : "クリックで位置ロック");
        button.setAttribute("aria-label", button.title);
        setHoverHelp(button, item.label || "位置ロック", item.help || "");
        const icon = document.createElement("span");
        icon.className = "property-top-lock-glyph";
        icon.textContent = item.value ? "🔒" : "🔓";
        const text = document.createElement("span");
        text.textContent = item.label || "位置ロック";
        button.appendChild(icon);
        button.appendChild(text);
        button.addEventListener("click", () => {
          runStateMutation(`${item.label}変更`, () => item.onChange(!item.value));
        });
        row.appendChild(button);
        continue;
      }
      const label = document.createElement("label");
      label.className = "property-top-switch";
      setHoverHelp(label, item.label, item.help || "");
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = !!item.value;
      input.addEventListener("change", () => {
        runStateMutation(`${item.label}変更`, () => item.onChange(input.checked));
      });
      const span = document.createElement("span");
      span.textContent = item.label;
      label.appendChild(input);
      label.appendChild(span);
      row.appendChild(label);
    }
    props.appendChild(row);
  }

  function addPropertyButtonRow(buttons) {
    const row = document.createElement("div");
    row.className = "property-button-row";
    for (const info of buttons) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = info.text;
      if (info.className) button.className = info.className;
      setHoverHelp(button, info.text, info.help || "");
      button.addEventListener("click", info.onClick);
      row.appendChild(button);
    }
    props.appendChild(row);
  }

  function addTopIdentityInputs(entries) {
    const row = document.createElement("div");
    row.className = "property-top-identity";
    if ((entries?.length || 0) <= 1) row.classList.add("single");
    for (const entry of entries) {
      const label = document.createElement("label");
      label.className = "property-top-identity-field";
      setHoverHelp(label, entry.label, entry.help || "");
      const title = document.createElement("span");
      title.className = "property-top-identity-label";
      title.textContent = entry.label;
      const input = document.createElement("input");
      input.type = "text";
      input.value = String(entry.value ?? "");
      input.placeholder = entry.placeholder || "";
      input.disabled = entry.readonly === true;
      if (typeof entry.onChange === "function" && entry.readonly !== true) {
        input.addEventListener("change", () => {
          runPropertyValueMutation(`${entry.label}変更`, () => entry.onChange(input.value));
        });
      }
      label.appendChild(title);
      label.appendChild(input);
      row.appendChild(label);
    }
    props.appendChild(row);
  }

  function renderProperties() {
    props.innerHTML = "";
    currentPropertySectionBody = null;
    currentPropertySectionIndex = 0;
    props.classList.remove("empty");
    if (!selected) {
      props.classList.add("empty");
      props.textContent = "オブジェクトを選択してください。";
      return;
    }
    if (selected.kind === "scene") renderSceneProperties(selectedScene());
    else if (selected.kind === "group") renderGroupProperties(selectedGroup());
    else if (selected.kind === "window") renderWindowProperties(selectedWindow());
    else renderItemProperties(selectedWindow(), selectedItem());
  }

  function renderSceneProperties(scene) {
    if (!scene) return;
    ensureScenes();
    const groupCount = Array.isArray(scene.groupIds) ? scene.groupIds.length : 0;
    addPropertyHeader("シーン", `${scene.name || scene.id} / ${scene.id} / ${groupCount}グループ`);
    addPropertyButtonRow([
      { text: "このシーンをプレビュー表示", onClick: () => setActiveSceneId(scene.id), help: "プレビューに表示するウィンドウを、このシーンに含まれるグループだけへ切り替えます。" }
    ]);

    addPropertyDivider("基本");
    addReadonly("シーンID", scene.id);
    addTextInput("シーン名", scene.name || scene.id, value => { scene.name = value || scene.id; });
    addReadonly("現在のプレビュー", (state.activeSceneId || "") === scene.id ? "このシーン" : "別シーン / 全表示");
    addInfo("シーンは『グループの集まり』です。ここでONにしたグループだけが、このシーンを選んだ時のプレビューに表示されます。");

    addPropertyDivider("含めるグループ");
    scene.groupIds = Array.isArray(scene.groupIds) ? scene.groupIds : [];
    addCheckbox("未グループのウィンドウを含める", scene.includeUngrouped === true, value => { scene.includeUngrouped = value; }, "どのグループにも所属していないウィンドウを、このシーンに表示するかを決めます。");
    for (const group of ensureGroups()) {
      addCheckbox(`${group.name || group.id} (${group.id})`, scene.groupIds.includes(group.id), value => {
        scene.groupIds = Array.isArray(scene.groupIds) ? scene.groupIds : [];
        const index = scene.groupIds.indexOf(group.id);
        if (value && index < 0) scene.groupIds.push(group.id);
        if (!value && index >= 0) scene.groupIds.splice(index, 1);
      }, "このグループを現在のシーンに含めるかどうかです。");
    }
  }

  function renderGroupProperties(group) {
    if (!group) return;
    const bounds = groupBounds(group.id);
    addPropertyHeader("グループ", `${group.name || group.id} / ${group.id} / ${bounds.count}件`);
    addTopSwitches([
      { label: "表示", kind: "visibility", value: group.visible !== false, onChange: value => { group.visible = value; }, help: "このグループ内のウィンドウをまとめて表示/非表示します。" },
      { label: "位置ロック", kind: "lock", value: group.locked === true, onChange: value => { group.locked = value; }, help: "ONにすると、このグループ内のウィンドウ/パーツ移動を禁止します。" }
    ]);
    addPropertyButtonRow([
      { text: "グループ複製", onClick: () => duplicateGroup(group.id), help: "グループ内のウィンドウもまとめて複製します。" },
      { text: "削除", className: "danger", onClick: () => deleteGroup(group.id), help: "グループを削除し、所属ウィンドウも一緒に削除します。" }
    ]);

    addTopIdentityInputs([
      {
        label: "グループ名",
        value: group.name || group.id,
        onChange: value => {
          const target = groupById(group.id);
          if (target) target.name = String(value || target.id).trim() || target.id;
        }
      },
      {
        label: "グループID",
        value: group.id,
        readonly: true
      }
    ]);
    addReadonly("所属ウィンドウ数", `${bounds.count}`);

    addPropertyDivider("配置・サイズ");
    addInfo("グループX/Yを変えると、所属ウィンドウをまとめて移動します。ロック中は移動できません。");
    addNumberPair("グループX", bounds.x, "グループY", bounds.y, (a, b) => moveGroupTo(group.id, a, b));
    addReadonly("グループ範囲", `${bounds.width} × ${bounds.height}`);

    addPropertyDivider("操作");
    addButtonControl("グループを複製", () => duplicateGroup(group.id));
    addButtonControl("グループ削除（所属ウィンドウも削除）", () => deleteGroup(group.id));
  }

  function renderWindowProperties(win) {
    if (!win) return;

    addPropertyHeader("ウィンドウ", `${win.id || "(idなし)"}${win.groupId ? " / " + groupName(win.groupId) : ""} / ${Math.round(win.x || 0)}, ${Math.round(win.y || 0)} / ${Math.round(win.width || 0)}×${Math.round(win.height || 0)}`);
    addTopSwitches([
      { label: "表示", kind: "visibility", value: win.visible !== false, onChange: value => { win.visible = value; }, help: "このウィンドウ全体の表示/非表示です。" },
      { label: "位置ロック", kind: "lock", value: win.locked === true, onChange: value => { win.locked = value; }, help: "ONにすると、このウィンドウ本体の移動/リサイズを禁止します。" },
      { label: "入力有効", value: win.inputEnabled !== false, onChange: value => { win.inputEnabled = value; }, help: "OFFにすると、このウィンドウ内のボタンや選択肢クリックを無効化します。" },
      { label: "スクロール", value: win.scrollEnabled === true, onChange: value => { win.scrollEnabled = value; }, help: "ONにすると、ウィンドウ内コンテンツをマウスホイールで縦スクロールできます。" }
    ]);
    addPropertyButtonRow([
      { text: "複製", onClick: () => duplicateSelectedObject(), help: "選択中のウィンドウを複製します。" },
      { text: "削除", className: "danger", onClick: () => deleteSelectedObject(), help: "選択中のウィンドウを削除します。Ctrl+Zで戻せます。" }
    ]);

    addTopIdentityInputs([
      {
        label: "ウィンドウID",
        value: win.id,
        onChange: value => {
          const old = win.id;
          win.id = safeWindowIdInState(value, old, win);
          if (selected?.windowId === old) selected.windowId = win.id;
        }
      }
    ]);
    addSelect("レイヤー", win.layer || "mapUi", [
      { value: "mapUi", label: "mapUi：通常UI" },
      { value: "messageAbove", label: "messageAbove：メッセージより前" },
      { value: "overlay", label: "overlay：最前面" }
    ], value => { win.layer = value; });
    addInfo("前後順は一覧の上下順で決まります。上にあるほど手前に表示されます。");

    addPropertyDivider("グループ");
    addSelect("所属グループ", win.groupId || "", groupOptions(), value => {
      const id = normalizeGroupId(value || "");
      win.groupId = id;
      const scene = activeScene();
      if (scene && id) addGroupIdToScene(scene, id);
      if (scene && !id) scene.includeUngrouped = true;
    });
    addInfo("グループ間の移動は、一覧のウィンドウ行をドラッグして別グループへ落とすことでも変更できます。新規グループ作成は一覧側の＋グループを使ってください。");
    if (win.groupId) {
      const group = groupById(win.groupId);
      if (group) {
        addReadonly("所属グループ名", group.name || group.id);
        addButtonControl("このグループを解除", () => moveWindowToGroup(win.id, ""));
      }
    }

    addPropertyDivider("配置・サイズ");
    addNumberPair("X", win.x, "Y", win.y, (a, b) => { win.x = a; win.y = b; });
    addNumberPair("幅", win.width, "高さ", win.height, (a, b) => { win.width = Math.max(1, a); win.height = Math.max(1, b); });

    addPropertyDivider("ウィンドウ不透明度・背景タイプ");
    addNumberInput("ウィンドウ不透明度", win.opacity ?? 255, value => { win.opacity = clamp(value, 0, 255); }, 0, 255);
    addNumberInput("内容不透明度", win.contentsOpacity ?? 255, value => { win.contentsOpacity = clamp(value, 0, 255); }, 0, 255);
    addSelect("背景タイプ", win.backgroundType || "normal", [
      { value: "normal", label: "通常" },
      { value: "dim", label: "暗くする" },
      { value: "transparent", label: "透明" }
    ], value => { win.backgroundType = value; });
    addCheckbox("標準枠を表示", win.frameVisible !== false, value => { win.frameVisible = value; });

    addPropertyDivider("スクロール");
    addCheckbox("スクロールバーを表示", win.scrollbarVisible !== false, value => { win.scrollbarVisible = value; }, "OFFにすると、スクロールは可能でもスクロールバーを表示しません。");
    addNumberInput("プレビュースクロールY", win.scrollY || 0, value => { win.scrollY = Math.max(0, value); }, 0);
    addNumberInput("スクロール範囲高さ（0で自動）", win.scrollContentHeight || 0, value => { win.scrollContentHeight = Math.max(0, value); }, 0);
    addNumberInput("スクロールバー幅", win.scrollbarWidth || 8, value => { win.scrollbarWidth = Math.max(4, value); }, 4);
    addNumberInput("スクロールバー不透明度", win.scrollbarOpacity ?? 220, value => { win.scrollbarOpacity = clamp(value, 0, 255); }, 0, 255);

    addPropertyDivider("文字スタイル");
    addTextInput("フォント名", win.fontFamily || "", value => { win.fontFamily = value; }, "空欄で全体設定を使用");
    addNumberInput("基本文字サイズ（0で継承）", win.fontSize || 0, value => { win.fontSize = Math.max(0, value); }, 0);
    addNumberInput("行高さ（0で継承）", win.lineHeight || 0, value => { win.lineHeight = Math.max(0, value); }, 0);
    addTextInput("文字色", win.textColor || "", value => { win.textColor = value; }, "例: #ffffff / 空欄で継承");
    addTextInput("縁取り色", win.outlineColor || "", value => { win.outlineColor = value; }, "例: rgba(0,0,0,0.85) / 空欄で継承");
    addNumberInput("縁取り幅", win.outlineWidth ?? 0, value => { win.outlineWidth = Math.max(0, value); }, 0);

    const area = ensurePlacementArea(win);
    addPropertyDivider("ウィンドウ外描画範囲");
    addInfo("ウィンドウ枠の外へパーツを描く時だけ調整します。通常は触らなくて大丈夫です。");
    addNumberPair("左へ拡張", area.extendLeft || 0, "上へ拡張", area.extendTop || 0, (a, b) => { area.extendLeft = Math.max(0, a); area.extendTop = Math.max(0, b); });
    addNumberPair("右へ拡張", area.extendRight || 0, "下へ拡張", area.extendBottom || 0, (a, b) => { area.extendRight = Math.max(0, a); area.extendBottom = Math.max(0, b); });

    const bg = ensureWindowBackgroundImage(win);
    addPropertyDivider("背景画像");
    addCheckbox("背景画像を使う", bg.enabled === true, value => { bg.enabled = value; });
    addReadonlyWithPicturePicker("選択中背景", bg.fileName ? imageSelectionLabel(bg) : "未指定", () => openProjectImagePicker(bg));
    addButtonControl("背景画像を解除", () => {
      runStateMutation("背景画像を解除", () => { win.backgroundImage = createDefaultWindowBackgroundImage(); });
    });
    addSelect("背景表示方法", bg.mode || "stretch", ["stretch", "cover", "contain", "tile"], value => { bg.mode = value; });
    addNumberInput("背景不透明度", bg.opacity ?? 255, value => { bg.opacity = clamp(value, 0, 255); }, 0, 255);
    addNumberInput("背景表示順", bg.zOrder ?? -100, value => { bg.zOrder = Number(value) || 0; });

    const deco = ensureWindowDecorationImage(win);
    addPropertyDivider("装飾画像");
    addCheckbox("装飾画像を使う", deco.enabled === true, value => { deco.enabled = value; });
    addReadonlyWithPicturePicker("選択中装飾", deco.fileName ? imageSelectionLabel(deco) : "未指定", () => openProjectImagePicker(deco));
    addButtonControl("装飾画像を解除", () => {
      runStateMutation("装飾画像を解除", () => { win.decorationImage = createDefaultWindowDecorationImage(); });
    });
    addSelect("装飾表示方法", deco.mode || "stretch", ["stretch", "cover", "contain", "tile"], value => { deco.mode = value; });
    addNumberInput("装飾不透明度", deco.opacity ?? 255, value => { deco.opacity = clamp(value, 0, 255); }, 0, 255);
    addNumberInput("装飾表示順", deco.zOrder ?? 100, value => { deco.zOrder = Number(value) || 0; });
  }

  async function loadProjectDatabaseTables() {
    projectAssets.database = createEmptyProjectDatabase();
    const tableMap = {
      actors: /(?:^|\/)data\/actors\.json$/i,
      classes: /(?:^|\/)data\/classes\.json$/i,
      skills: /(?:^|\/)data\/skills\.json$/i,
      items: /(?:^|\/)data\/items\.json$/i,
      weapons: /(?:^|\/)data\/weapons\.json$/i,
      armors: /(?:^|\/)data\/armors\.json$/i,
      enemies: /(?:^|\/)data\/enemies\.json$/i,
      states: /(?:^|\/)data\/states\.json$/i
    };
    const loadedKeys = [];
    for (const [key, pattern] of Object.entries(tableMap)) {
      const entry = [...projectAssets.files.entries()].find(([p]) => pattern.test(p));
      if (!entry) continue;
      try {
        const parsed = JSON.parse(await readTextFile(entry[1]));
        projectAssets.database[key] = Array.isArray(parsed) ? parsed : [];
        loadedKeys.push(key);
      } catch (e) {
        debugLog("error", `${key} の読込に失敗しました。`, { message: e.message, stack: e.stack });
        projectAssets.database[key] = [];
      }
    }
    projectAssets.database.loadedKeys = loadedKeys;
    debugLog("info", "データベースJSONを読み込みました。", {
      loadedKeys,
      actorCount: Math.max(0, (projectAssets.database.actors || []).filter(Boolean).length),
      itemCount: Math.max(0, (projectAssets.database.items || []).filter(Boolean).length)
    });
  }

  function projectDatabaseTable(kind) {
    const db = projectAssets.database || createEmptyProjectDatabase();
    const map = {
      actor: db.actors,
      class: db.classes,
      skill: db.skills,
      item: db.items,
      weapon: db.weapons,
      armor: db.armors,
      enemy: db.enemies,
      state: db.states
    };
    return Array.isArray(map[kind]) ? map[kind] : [];
  }

  function projectSystemNamedList(kind) {
    const sys = projectAssets.system || {};
    if (kind === "variable") return Array.isArray(sys.variables) ? sys.variables : [];
    if (kind === "switch") return Array.isArray(sys.switches) ? sys.switches : [];
    if (kind === "elements") return Array.isArray(sys.elements) ? sys.elements : [];
    if (kind === "weaponTypes") return Array.isArray(sys.weaponTypes) ? sys.weaponTypes : [];
    if (kind === "armorTypes") return Array.isArray(sys.armorTypes) ? sys.armorTypes : [];
    if (kind === "skillTypes") return Array.isArray(sys.skillTypes) ? sys.skillTypes : [];
    if (kind === "equipTypes") return Array.isArray(sys.equipTypes) ? sys.equipTypes : [];
    if (kind === "params") return Array.isArray(sys.terms?.params) ? sys.terms.params : [];
    return [];
  }

  function databasePickerKindFromBinding(sourceType, objectType, typeCategory) {
    const src = String(sourceType || "");
    if (src === "actor") return "actor";
    if (src === "enemy") return "enemy";
    if (src === "state") return "state";
    if (src === "variable") return "variable";
    if (src === "type") return String(typeCategory || "weaponTypes");
    if (src === "databaseObject") return String(objectType || "item");
    return "";
  }

  function databasePickerTitle(kind) {
    return ({
      actor: "アクター一覧",
      class: "職業一覧",
      skill: "スキル一覧",
      item: "アイテム一覧",
      weapon: "武器一覧",
      armor: "防具一覧",
      enemy: "エネミー一覧",
      state: "ステート一覧",
      variable: "変数一覧",
      switch: "スイッチ一覧",
      elements: "属性一覧",
      weaponTypes: "武器タイプ一覧",
      armorTypes: "防具タイプ一覧",
      skillTypes: "スキルタイプ一覧",
      equipTypes: "装備タイプ一覧",
      params: "能力値名一覧"
    })[kind] || "データベース一覧";
  }

  function listDatabasePickerEntries(kind) {
    const key = String(kind || "");
    const namedKinds = new Set(["variable", "switch", "elements", "weaponTypes", "armorTypes", "skillTypes", "equipTypes", "params"]);
    if (namedKinds.has(key)) {
      const rows = projectSystemNamedList(key);
      return rows.map((name, id) => {
        if (id <= 0 && key !== "elements" && key !== "params") return null;
        const label = String(name || "").trim();
        if (!label && id === 0) return null;
        return {
          id,
          name: label || `(未設定 ${id})`,
          detail: key === "variable" ? `変数ID ${id}` : key === "switch" ? `スイッチID ${id}` : `index ${id}`
        };
      }).filter(Boolean);
    }
    const rows = projectDatabaseTable(key);
    return rows.map((row, id) => {
      if (!row || typeof row !== "object") return null;
      const name = String(row.name || "").trim() || `(無題 ${id})`;
      const detailParts = [];
      if (row.nickname) detailParts.push(String(row.nickname));
      if (row.description) detailParts.push(String(row.description).replace(/\r?\n/g, " "));
      if (row.message1) detailParts.push(String(row.message1));
      if (Array.isArray(row.params)) detailParts.push(`params:${row.params.slice(0, 4).join("/")}`);
      return {
        id,
        name,
        detail: detailParts.filter(Boolean).join(" / ").slice(0, 120)
      };
    }).filter(Boolean);
  }

  function findDatabasePickerEntry(kind, id) {
    const n = Math.max(0, Number(id || 0));
    return listDatabasePickerEntries(kind).find(entry => Number(entry.id) === n) || null;
  }

  function databasePickerSelectionLabel(kind, id) {
    const entry = findDatabasePickerEntry(kind, id);
    if (!entry) return `ID ${Math.max(0, Number(id || 0))}（未読込または該当なし）`;
    return `#${entry.id} ${entry.name}`;
  }

  function openDatabaseIdPicker(options = {}) {
    const kind = String(options.kind || "");
    if (!kind) {
      showToast("選択対象のデータベース種別が不正です");
      return;
    }
    if (!projectAssets.loaded) {
      showToast("先に上部の『ツクールプロジェクト読込』でプロジェクトを読み込んでください");
      return;
    }
    const entries = listDatabasePickerEntries(kind);
    if (entries.length <= 0) {
      showToast(`${databasePickerTitle(kind)} のデータが見つかりません。プロジェクトの data フォルダを確認してください`);
      return;
    }

    const overlay = document.createElement("div");
    overlay.className = "image-picker-overlay db-picker-overlay";
    const dialog = document.createElement("div");
    dialog.className = "image-picker-dialog db-picker-dialog";
    overlay.appendChild(dialog);

    const header = document.createElement("div");
    header.className = "image-picker-header";
    header.innerHTML = `<strong>${escapeHtml(options.title || databasePickerTitle(kind))}</strong><span>${escapeHtml(projectAssets.name || "ツクールプロジェクト")} / ${escapeHtml(kind)}（${entries.length}件）</span>`;
    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "閉じる";
    close.addEventListener("click", () => overlay.remove());
    header.appendChild(close);
    dialog.appendChild(header);

    const controls = document.createElement("div");
    controls.className = "image-picker-controls db-picker-controls";
    const search = document.createElement("input");
    search.type = "search";
    search.placeholder = "ID・名前・説明で検索";
    controls.appendChild(search);
    dialog.appendChild(controls);

    const list = document.createElement("div");
    list.className = "db-picker-list";
    dialog.appendChild(list);

    const currentId = Math.max(0, Number(options.currentId || 0));
    const renderList = () => {
      list.innerHTML = "";
      const q = search.value.trim().toLowerCase();
      const filtered = entries.filter(entry => {
        if (!q) return true;
        return String(entry.id).includes(q)
          || String(entry.name || "").toLowerCase().includes(q)
          || String(entry.detail || "").toLowerCase().includes(q);
      });
      if (filtered.length <= 0) {
        const empty = document.createElement("div");
        empty.className = "image-picker-empty";
        empty.textContent = "該当する項目がありません。";
        list.appendChild(empty);
        return;
      }
      for (const entry of filtered) {
        const row = document.createElement("button");
        row.type = "button";
        row.className = "db-picker-row";
        if (Number(entry.id) === currentId) row.classList.add("active");
        row.innerHTML = `<span class="db-picker-id">#${entry.id}</span><span class="db-picker-name">${escapeHtml(entry.name)}</span><span class="db-picker-detail">${escapeHtml(entry.detail || "")}</span>`;
        row.addEventListener("click", () => {
          if (typeof options.onSelect === "function") options.onSelect(Number(entry.id), entry);
          overlay.remove();
        });
        list.appendChild(row);
      }
    };
    search.addEventListener("input", renderList);
    renderList();
    overlay.addEventListener("click", ev => { if (ev.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
    setTimeout(() => search.focus(), 0);
  }

  function databaseFieldSelectionLabel(fieldPath, optionsList = []) {
    const value = String(fieldPath || "").trim();
    const hit = (optionsList || []).find(opt => String(opt.value) === value);
    if (hit) {
      const group = String(hit.group || "").trim();
      return group ? `${group} / ${hit.label}` : String(hit.label || hit.value);
    }
    if (!value) return "未選択";
    return `カスタム: ${value}`;
  }

  function openDatabaseFieldPicker(options = {}) {
    const entries = Array.isArray(options.options) ? options.options.slice() : [];
    if (entries.length <= 0) {
      showToast("選択できる項目がありません");
      return;
    }

    const overlay = document.createElement("div");
    overlay.className = "image-picker-overlay db-picker-overlay";
    const dialog = document.createElement("div");
    dialog.className = "image-picker-dialog db-picker-dialog";
    overlay.appendChild(dialog);

    const header = document.createElement("div");
    header.className = "image-picker-header";
    header.innerHTML = `<strong>${escapeHtml(options.title || "項目を選択")}</strong><span>${escapeHtml(options.subtitle || `${entries.length}件`)}</span>`;
    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "閉じる";
    close.addEventListener("click", () => overlay.remove());
    header.appendChild(close);
    dialog.appendChild(header);

    const controls = document.createElement("div");
    controls.className = "image-picker-controls db-picker-controls";
    const search = document.createElement("input");
    search.type = "search";
    search.placeholder = "種類・項目名・パスで検索";
    controls.appendChild(search);
    dialog.appendChild(controls);

    const list = document.createElement("div");
    list.className = "db-picker-list";
    dialog.appendChild(list);

    const currentValue = String(options.currentValue || "");
    const renderList = () => {
      list.innerHTML = "";
      const q = search.value.trim().toLowerCase();
      const filtered = entries.filter(entry => {
        if (!q) return true;
        return String(entry.value || "").toLowerCase().includes(q)
          || String(entry.label || "").toLowerCase().includes(q)
          || String(entry.group || "").toLowerCase().includes(q)
          || String(entry.detail || "").toLowerCase().includes(q);
      });
      if (filtered.length <= 0) {
        const empty = document.createElement("div");
        empty.className = "image-picker-empty";
        empty.textContent = "該当する項目がありません。";
        list.appendChild(empty);
        return;
      }
      for (const entry of filtered) {
        const row = document.createElement("button");
        row.type = "button";
        row.className = "db-picker-row db-field-picker-row";
        if (String(entry.value) === currentValue) row.classList.add("active");
        const group = String(entry.group || "その他");
        const detail = String(entry.detail || entry.value || "");
        row.innerHTML = `<span class="db-picker-id">${escapeHtml(group)}</span><span class="db-picker-name">${escapeHtml(entry.label || entry.value || "")}</span><span class="db-picker-detail">${escapeHtml(detail)}</span>`;
        row.title = `${group} / ${entry.label || ""} / ${entry.value || ""}`;
        row.addEventListener("click", () => {
          if (typeof options.onSelect === "function") options.onSelect(String(entry.value || ""), entry);
          overlay.remove();
        });
        list.appendChild(row);
      }
    };
    search.addEventListener("input", renderList);
    renderList();
    overlay.addEventListener("click", ev => { if (ev.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
    setTimeout(() => search.focus(), 0);
  }

  function databaseFieldOptionRows(rows) {
    return (rows || []).map(row => {
      if (Array.isArray(row)) {
        const [value, label, group = "", detail = ""] = row;
        return {
          value: String(value || ""),
          label: String(label || value || ""),
          group: String(group || ""),
          detail: String(detail || value || "")
        };
      }
      return {
        value: String(row?.value || ""),
        label: String(row?.label || row?.value || ""),
        group: String(row?.group || ""),
        detail: String(row?.detail || row?.value || "")
      };
    });
  }

  function databaseEquipParamFieldRows(groupLabel = "装備の能力変化") {
    return [
      ["params[0]", "最大HPの増減", groupLabel, "params[0]"],
      ["params[1]", "最大MPの増減", groupLabel, "params[1]"],
      ["params[2]", "攻撃力の増減", groupLabel, "params[2]"],
      ["params[3]", "防御力の増減", groupLabel, "params[3]"],
      ["params[4]", "魔法力の増減", groupLabel, "params[4]"],
      ["params[5]", "魔法防御の増減", groupLabel, "params[5]"],
      ["params[6]", "敏捷性の増減", groupLabel, "params[6]"],
      ["params[7]", "運の増減", groupLabel, "params[7]"]
    ];
  }

  function databaseEnemyParamFieldRows(groupLabel = "エネミー能力値") {
    return [
      ["params[0]", "最大HP", groupLabel, "params[0]"],
      ["params[1]", "最大MP", groupLabel, "params[1]"],
      ["params[2]", "攻撃力", groupLabel, "params[2]"],
      ["params[3]", "防御力", groupLabel, "params[3]"],
      ["params[4]", "魔法力", groupLabel, "params[4]"],
      ["params[5]", "魔法防御", groupLabel, "params[5]"],
      ["params[6]", "敏捷性", groupLabel, "params[6]"],
      ["params[7]", "運", groupLabel, "params[7]"]
    ];
  }

  function syncDatabaseBindingFieldPath(db, sourceType, objectType, fieldKey) {
    const optionsList = databaseFieldOptionsForSource(sourceType, objectType);
    const current = String(db?.[fieldKey] || "").trim();
    if (current && optionsList.some(opt => String(opt.value) === current)) return optionsList;
    if (optionsList[0]) db[fieldKey] = optionsList[0].value;
    else if (!current) db[fieldKey] = "name";
    return optionsList;
  }

  function databaseFieldOptionsForSource(sourceType, objectType = "item") {
    const actor = [
      ["name", "名前", "基本"], ["nickname", "二つ名", "基本"], ["profile", "プロフィール", "基本"], ["className", "職業名", "基本"],
      ["level", "レベル", "成長"], ["hp", "現在HP", "戦闘中ステータス"], ["mhp", "最大HP", "戦闘中ステータス"], ["mp", "現在MP", "戦闘中ステータス"], ["mmp", "最大MP", "戦闘中ステータス"], ["tp", "現在TP", "戦闘中ステータス"], ["maxTp", "最大TP", "戦闘中ステータス"],
      ["currentExp", "現在経験値", "成長"], ["nextRequiredExp", "次のレベルに必要な経験値", "成長"],
      ["param[0]", "最大HP", "能力値"], ["param[1]", "最大MP", "能力値"], ["param[2]", "攻撃力", "能力値"], ["param[3]", "防御力", "能力値"],
      ["param[4]", "魔法力", "能力値"], ["param[5]", "魔法防御", "能力値"], ["param[6]", "敏捷性", "能力値"], ["param[7]", "運", "能力値"],
      ["xparam[0]", "命中率", "追加能力値"], ["xparam[1]", "回避率", "追加能力値"], ["xparam[2]", "会心率", "追加能力値"], ["xparam[3]", "会心回避率", "追加能力値"],
      ["xparam[4]", "魔法回避率", "追加能力値"], ["xparam[5]", "魔法反射率", "追加能力値"], ["xparam[6]", "反撃率", "追加能力値"], ["xparam[7]", "HP再生率", "追加能力値"],
      ["xparam[8]", "MP再生率", "追加能力値"], ["xparam[9]", "TP再生率", "追加能力値"],
      ["sparam[0]", "狙われ率", "特殊能力値"], ["sparam[1]", "防御効果率", "特殊能力値"], ["sparam[2]", "回復効果率", "特殊能力値"], ["sparam[3]", "薬の知識", "特殊能力値"],
      ["sparam[4]", "MP消費率", "特殊能力値"], ["sparam[5]", "TPチャージ率", "特殊能力値"], ["sparam[6]", "物理ダメージ率", "特殊能力値"], ["sparam[7]", "魔法ダメージ率", "特殊能力値"],
      ["sparam[8]", "床ダメージ率", "特殊能力値"], ["sparam[9]", "経験獲得率", "特殊能力値"]
    ];
    const itemBase = [
      ["name", "名前", "基本"], ["description", "説明", "基本"], ["iconIndex", "アイコン", "基本"],
      ["price", "価格", "基本"], ["consumable", "消耗するか", "基本"], ["itypeId", "アイテムタイプID", "基本"],
      ["scope", "効果範囲", "使用効果"], ["occasion", "使用可能時", "使用効果"], ["speed", "速度補正", "使用効果"],
      ["successRate", "成功率", "使用効果"], ["repeats", "連続回数", "使用効果"], ["tpGain", "得TP", "使用効果"],
      ["hitType", "命中タイプ", "使用効果"], ["animationId", "アニメーションID", "使用効果"],
      ["damage.type", "ダメージタイプ", "ダメージ"], ["damage.elementId", "ダメージ属性ID", "ダメージ"],
      ["damage.formula", "ダメージ計算式", "ダメージ"], ["damage.variance", "ダメージ分散度", "ダメージ"], ["damage.critical", "会心あり", "ダメージ"],
      ["note", "メモ", "メモ"], ["meta", "メモタグ(JSON)", "メモ"]
    ];
    const skill = [
      ["name", "名前", "基本"], ["description", "説明", "基本"], ["iconIndex", "アイコン", "基本"],
      ["stypeId", "スキルタイプID", "基本"], ["mpCost", "消費MP", "コスト"], ["tpCost", "消費TP", "コスト"],
      ["scope", "効果範囲", "使用効果"], ["occasion", "使用可能時", "使用効果"], ["speed", "速度補正", "使用効果"],
      ["successRate", "成功率", "使用効果"], ["repeats", "連続回数", "使用効果"], ["tpGain", "得TP", "使用効果"],
      ["hitType", "命中タイプ", "使用効果"], ["animationId", "アニメーションID", "使用効果"],
      ["requiredWtypeId1", "必要武器タイプ1", "条件"], ["requiredWtypeId2", "必要武器タイプ2", "条件"],
      ["message1", "使用メッセージ1", "メッセージ"], ["message2", "使用メッセージ2", "メッセージ"],
      ["damage.type", "ダメージタイプ", "ダメージ"], ["damage.elementId", "ダメージ属性ID", "ダメージ"],
      ["damage.formula", "ダメージ計算式", "ダメージ"], ["damage.variance", "ダメージ分散度", "ダメージ"], ["damage.critical", "会心あり", "ダメージ"],
      ["note", "メモ", "メモ"], ["meta", "メモタグ(JSON)", "メモ"]
    ];
    const weapon = [
      ["name", "名前", "基本"], ["description", "説明", "基本"], ["iconIndex", "アイコン", "基本"],
      ["price", "価格", "基本"], ["etypeId", "装備タイプID", "基本"], ["wtypeId", "武器タイプID", "基本"],
      ["animationId", "攻撃アニメーションID", "基本"],
      ...databaseEquipParamFieldRows("装備の能力変化"),
      ["note", "メモ", "メモ"], ["meta", "メモタグ(JSON)", "メモ"]
    ];
    const armor = [
      ["name", "名前", "基本"], ["description", "説明", "基本"], ["iconIndex", "アイコン", "基本"],
      ["price", "価格", "基本"], ["etypeId", "装備タイプID", "基本"], ["atypeId", "防具タイプID", "基本"],
      ...databaseEquipParamFieldRows("装備の能力変化"),
      ["note", "メモ", "メモ"], ["meta", "メモタグ(JSON)", "メモ"]
    ];
    const enemy = [
      ["name", "名前", "基本"],
      ["hp", "現在HP(戦闘中)", "戦闘中ステータス"], ["mhp", "最大HP", "戦闘中ステータス"],
      ["mp", "現在MP(戦闘中)", "戦闘中ステータス"], ["mmp", "最大MP", "戦闘中ステータス"], ["tp", "現在TP(戦闘中)", "戦闘中ステータス"],
      ["exp", "経験値", "報酬"], ["gold", "所持金", "報酬"],
      ...databaseEnemyParamFieldRows("データベース能力値"),
      ["note", "メモ", "メモ"], ["meta", "メモタグ(JSON)", "メモ"]
    ];
    const stateRows = [
      ["name", "名前", "基本"], ["description", "説明", "基本"], ["iconIndex", "アイコン", "基本"], ["priority", "優先度", "基本"],
      ["message1", "付与メッセージ", "メッセージ"], ["message2", "継続メッセージ", "メッセージ"],
      ["message3", "解除メッセージ", "メッセージ"], ["message4", "味方解除メッセージ", "メッセージ"],
      ["note", "メモ", "メモ"], ["meta", "メモタグ(JSON)", "メモ"]
    ];
    const classRows = [
      ["name", "名前", "基本"],
      ["expParams", "経験値曲線(JSON)", "成長"],
      ["params", "レベル別能力値テーブル(JSON)", "成長"],
      ["learnings", "習得スキル一覧(JSON)", "成長"],
      ["note", "メモ", "メモ"], ["meta", "メモタグ(JSON)", "メモ"]
    ];
    const bySource = {
      actor,
      variable: [["self", "変数の値", "変数"], ["toString", "文字列化", "変数"]],
      enemy,
      state: stateRows,
      item: itemBase,
      weapon,
      armor,
      skill,
      class: classRows
    };
    const src = sourceType === "databaseObject" ? String(objectType || "item") : String(sourceType || "actor");
    const rows = bySource[src] || [["name", "名前", "基本"], ["self", "全体(JSON)", "その他"]];
    return databaseFieldOptionRows(rows);
  }

  function databaseCommandTermIndexMap() {
    // $dataSystem.terms.commands は配列。TextManager の command(id) と同じ対応。
    return {
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
    };
  }

  function resolveDatabaseTermArrayIndex(category, termKey, fallbackId = 0) {
    const key = String(termKey || "").trim();
    const cat = String(category || "");
    if (cat === "commands") {
      const map = databaseCommandTermIndexMap();
      if (Object.prototype.hasOwnProperty.call(map, key)) return map[key];
      // 旧データで continue 以外の名前キーが入っていた場合も数値化を試す
    }
    if (key === "") return Math.max(0, Number(fallbackId) || 0);
    const n = Number(key);
    return Number.isFinite(n) ? n : -1;
  }

  function databaseTermKeyOptions(category) {
    const c = String(category || "messages");
    if (c === "messages") {
      return [
        ["alwaysDash", "ダッシュをデフォルトにする"],
        ["commandRemember", "コマンド記憶"],
        ["touchUI", "タッチUI"],
        ["bgmVolume", "BGM音量"],
        ["bgsVolume", "BGS音量"],
        ["meVolume", "ME音量"],
        ["seVolume", "SE音量"],
        ["possession", "持っている数"],
        ["expTotal", "現在の経験値"],
        ["expNext", "次のレベルまでの経験値"],
        ["saveMessage", "セーブメッセージ"],
        ["loadMessage", "ロードメッセージ"],
        ["file", "ファイル"],
        ["autosave", "オートセーブ"],
        ["partyName", "パーティ名"],
        ["emerge", "出現"],
        ["preemptive", "先制攻撃"],
        ["surprise", "不意打ち"],
        ["escapeStart", "逃走開始"],
        ["escapeFailure", "逃走失敗"],
        ["victory", "勝利"],
        ["defeat", "敗北"],
        ["obtainExp", "経験値入手"],
        ["obtainGold", "お金入手"],
        ["obtainItem", "アイテム入手"],
        ["levelUp", "レベルアップ"],
        ["obtainSkill", "スキル習得"],
        ["useItem", "アイテム使用"],
        ["criticalToEnemy", "敵への会心"],
        ["criticalToActor", "味方への会心"],
        ["actorDamage", "味方ダメージ"],
        ["actorRecovery", "味方回復"],
        ["actorGain", "味方増加"],
        ["actorLoss", "味方減少"],
        ["actorDrain", "味方吸収"],
        ["actorNoDamage", "味方ノーダメージ"],
        ["actorNoHit", "味方ミス"],
        ["enemyDamage", "敵ダメージ"],
        ["enemyRecovery", "敵回復"],
        ["enemyGain", "敵増加"],
        ["enemyLoss", "敵減少"],
        ["enemyDrain", "敵吸収"],
        ["enemyNoDamage", "敵ノーダメージ"],
        ["enemyNoHit", "敵ミス"],
        ["evasion", "回避"],
        ["magicEvasion", "魔法回避"],
        ["magicReflection", "魔法反射"],
        ["counterAttack", "反撃"],
        ["substitute", "身代わり"],
        ["buffAdd", "強化"],
        ["debuffAdd", "弱体"],
        ["buffRemove", "強化解除"],
        ["actionFailure", "行動失敗"]
      ].map(([value, label]) => ({ value, label, group: "メッセージ", detail: value }));
    }
    if (c === "commands") {
      return [
        [0, "戦う", "fight"],
        [1, "逃げる", "escape"],
        [2, "攻撃", "attack"],
        [3, "防御", "guard"],
        [4, "アイテム", "item"],
        [5, "スキル", "skill"],
        [6, "装備", "equip"],
        [7, "ステータス", "status"],
        [8, "並び替え", "formation"],
        [9, "セーブ", "save"],
        [10, "ゲーム終了", "gameEnd"],
        [11, "オプション", "options"],
        [12, "武器", "weapon"],
        [13, "防具", "armor"],
        [14, "大事なもの", "keyItem"],
        [15, "装備変更", "equip2"],
        [16, "最強装備", "optimize"],
        [17, "全て外す", "clear"],
        [18, "ニューゲーム", "newGame"],
        [19, "コンティニュー", "continue"],
        [21, "タイトルへ", "toTitle"],
        [22, "キャンセル", "cancel"],
        [24, "購入する", "buy"],
        [25, "売却する", "sell"]
      ].map(([index, label, detail]) => ({ value: String(index), label, group: "コマンド名", detail }));
    }
    if (c === "basic") {
      return [
        [0, "レベル"], [1, "レベル(略)"], [2, "HP"], [3, "HP(略)"], [4, "MP"], [5, "MP(略)"],
        [6, "TP"], [7, "TP(略)"], [8, "経験値"], [9, "経験値(略)"]
      ].map(([index, label]) => ({ value: String(index), label, group: "基本ステータス", detail: `basic[${index}]` }));
    }
    if (c === "params") {
      return [
        [0, "最大HP"], [1, "最大MP"], [2, "攻撃力"], [3, "防御力"],
        [4, "魔法力"], [5, "魔法防御"], [6, "敏捷性"], [7, "運"]
      ].map(([index, label]) => ({ value: String(index), label, group: "能力値名", detail: `params[${index}]` }));
    }
    return [{ value: "currencyUnit", label: "通貨単位", group: "その他", detail: "currencyUnit" }];
  }

  function resolveDatabaseTermValue(terms, category, termKey, fallbackId = 0) {
    const cat = String(category || "messages");
    const key = String(termKey || "").trim();
    const table = terms?.[cat];
    if (Array.isArray(table)) {
      const index = resolveDatabaseTermArrayIndex(cat, key, fallbackId);
      if (!Number.isFinite(index) || index < 0) return "";
      return table[index] ?? "";
    }
    if (table && typeof table === "object") {
      if (Object.prototype.hasOwnProperty.call(table, key)) return table[key] ?? "";
      // コマンド名を誤って messages 側キー扱いにしていた旧データ向け救済は不要
      return table[key] ?? "";
    }
    if (key === "currencyUnit" || cat === "currencyUnit") {
      return String(projectAssets.system?.currencyUnit || "G");
    }
    return "";
  }


  function renderDatabaseBindingSection(item, options = {}) {
    const db = ensureDatabaseBinding(item);
    const mode = String(options.mode || "text");
    const prefix = options.prefix || "";
    const labelPrefix = options.labelPrefix || "";
    const sourceKey = databaseBindingPropKey(prefix, "sourceType");
    const objectKey = databaseBindingPropKey(prefix, "objectType");
    const idModeKey = databaseBindingPropKey(prefix, "idMode");
    const idKey = databaseBindingPropKey(prefix, "id");
    const idVarKey = databaseBindingPropKey(prefix, "idVariableId");
    const fieldKey = databaseBindingPropKey(prefix, "fieldPath");
    const typeCategoryKey = databaseBindingPropKey(prefix, "typeCategory");
    const termCategoryKey = databaseBindingPropKey(prefix, "termCategory");
    const termKeyKey = databaseBindingPropKey(prefix, "termKey");

    const sourceOptions = [
      { value: "actor", label: "アクターデータ" },
      { value: "databaseObject", label: "アイテム/武器/防具/スキル/職業" },
      { value: "variable", label: "変数" },
      { value: "enemy", label: "エネミーデータ" },
      { value: "state", label: "ステート" },
      { value: "type", label: "タイプ" },
      { value: "term", label: "用語" },
      { value: "gold", label: "所持金" }
    ];
    if (prefix === "max") sourceOptions.unshift({ value: "", label: "未指定（フォールバック最大値を使用）" });
    addSelect(`${labelPrefix}データ元`, (prefix === "max" ? (db[sourceKey] ?? "") : (db[sourceKey] || "actor")), sourceOptions, value => {
      db[sourceKey] = value;
      if (String(value || "").trim()) syncDatabaseBindingFieldPath(db, db[sourceKey], db[objectKey], fieldKey);
    });

    // 最大値参照は未指定のとき、以降のID/項目UIを出さない（フォールバック最大値を使う）
    if (prefix === "max" && !String(db[sourceKey] || "").trim()) {
      addInfo("最大値参照は未設定です。下のフォールバック最大値を使用します。");
      return;
    }

    if (db[sourceKey] === "databaseObject") {
      addSelect(`${labelPrefix}データ種別`, db[objectKey] || "item", [
        { value: "item", label: "アイテム" },
        { value: "weapon", label: "武器" },
        { value: "armor", label: "防具" },
        { value: "skill", label: "スキル" },
        { value: "class", label: "職業" }
      ], value => {
        db[objectKey] = value;
        syncDatabaseBindingFieldPath(db, db[sourceKey], db[objectKey], fieldKey);
      });
    }

    if (!["gold", "term"].includes(String(db[sourceKey]))) {
      addSelect(`${labelPrefix}ID参照`, db[idModeKey] || "fixed", [
        { value: "fixed", label: "固定ID" },
        { value: "variable", label: "変数でID指定" }
      ], value => { db[idModeKey] = value; });
      const pickerKind = databasePickerKindFromBinding(db[sourceKey], db[objectKey], db[typeCategoryKey]);
      if (db[idModeKey] === "variable") {
        addReadonlyWithDatabasePicker(
          `${labelPrefix}選択中のID変数`,
          databasePickerSelectionLabel("variable", Number.isFinite(Number(db[idVarKey])) ? Number(db[idVarKey]) : 1),
          () => {
            openDatabaseIdPicker({
              kind: "variable",
              title: "ID変数を選択",
              currentId: Number.isFinite(Number(db[idVarKey])) ? Number(db[idVarKey]) : 1,
              onSelect: (id) => {
                runStateMutation(`${labelPrefix}ID変数選択`, () => {
                  db[idVarKey] = Math.max(0, Number(id) || 0);
                });
              }
            });
          }
        );
        addNumberInput(`${labelPrefix}ID変数`, Number.isFinite(Number(db[idVarKey])) ? Number(db[idVarKey]) : 1, value => { db[idVarKey] = Math.max(0, value); }, 0);
      } else {
        const pickId = pickerKind ? () => {
          openDatabaseIdPicker({
            kind: pickerKind,
            title: databasePickerTitle(pickerKind),
            currentId: Number.isFinite(Number(db[idKey])) ? Number(db[idKey]) : 1,
            onSelect: (id) => {
              runStateMutation(`${labelPrefix}ID選択`, () => {
                db[idKey] = Math.max(0, Number(id) || 0);
              });
            }
          });
        } : null;
        addReadonlyWithDatabasePicker(
          `${labelPrefix}選択中`,
          pickerKind ? databasePickerSelectionLabel(pickerKind, Number.isFinite(Number(db[idKey])) ? Number(db[idKey]) : 1) : `ID ${Number.isFinite(Number(db[idKey])) ? Number(db[idKey]) : 1}`,
          pickId
        );
        if (pickId) {
          addNumberInputWithDatabasePicker(
            `${labelPrefix}ID`,
            Number.isFinite(Number(db[idKey])) ? Number(db[idKey]) : 1,
            value => { db[idKey] = Math.max(0, value); },
            pickId,
            0
          );
        } else {
          addNumberInput(`${labelPrefix}ID`, Number.isFinite(Number(db[idKey])) ? Number(db[idKey]) : 1, value => { db[idKey] = Math.max(0, value); }, 0);
        }
      }
    }

    if (db[sourceKey] === "type") {
      addSelect(`${labelPrefix}タイプ分類`, db[typeCategoryKey] || "weaponTypes", [
        { value: "elements", label: "属性" },
        { value: "weaponTypes", label: "武器タイプ" },
        { value: "armorTypes", label: "防具タイプ" },
        { value: "skillTypes", label: "スキルタイプ" },
        { value: "equipTypes", label: "装備タイプ" },
        { value: "params", label: "能力値名" }
      ], value => { db[typeCategoryKey] = value; });
    } else if (db[sourceKey] === "term") {
      addSelect(`${labelPrefix}用語分類`, db[termCategoryKey] || "messages", [
        { value: "messages", label: "メッセージ" },
        { value: "commands", label: "コマンド名" },
        { value: "params", label: "能力値名" },
        { value: "basic", label: "基本ステータス" }
      ], value => {
        db[termCategoryKey] = value;
        const opts = databaseTermKeyOptions(value);
        if (opts.length) db[termKeyKey] = opts[0].value;
      });
      const termOptions = databaseTermKeyOptions(db[termCategoryKey] || "messages");
      // 旧データで commands が fight 等の名前キーのまま残っている場合は配列indexへ正規化
      if (String(db[termCategoryKey] || "") === "commands") {
        const idx = resolveDatabaseTermArrayIndex("commands", db[termKeyKey], 0);
        if (idx >= 0) db[termKeyKey] = String(idx);
      }
      const currentTerm = String(db[termKeyKey] || termOptions[0]?.value || "");
      const termLabel = termOptions.find(opt => String(opt.value) === currentTerm);
      addReadonlyWithDatabasePicker(
        `${labelPrefix}選択中の用語`,
        termLabel ? `${termLabel.label}` : (currentTerm || "未選択"),
        () => {
          openDatabaseFieldPicker({
            title: `${labelPrefix}用語を選択`.trim() || "用語を選択",
            subtitle: `${db[termCategoryKey] || "messages"}（${termOptions.length}件）`,
            options: termOptions,
            currentValue: currentTerm,
            onSelect: (value) => {
              runStateMutation(`${labelPrefix}用語選択`, () => {
                db[termKeyKey] = String(value || "");
              });
            }
          });
        }
      );
    } else if (db[sourceKey] !== "gold") {
      const optionsList = syncDatabaseBindingFieldPath(db, db[sourceKey], db[objectKey], fieldKey);
      const kindLabel = db[sourceKey] === "databaseObject" ? (db[objectKey] || "item") : (db[sourceKey] || "actor");
      const pickField = optionsList.length ? () => {
        openDatabaseFieldPicker({
          title: `${labelPrefix}項目を選択`.trim() || "項目を選択",
          subtitle: `${kindLabel}向けの参照項目（${optionsList.length}件）`,
          options: optionsList,
          currentValue: db[fieldKey] || "",
          onSelect: (value) => {
            runStateMutation(`${labelPrefix}項目選択`, () => {
              db[fieldKey] = String(value || "");
            });
          }
        });
      } : null;
      addReadonlyWithDatabasePicker(
        `${labelPrefix}選択中の項目`,
        databaseFieldSelectionLabel(db[fieldKey], optionsList),
        pickField
      );
      addTextInput(`${labelPrefix}任意項目パス`, db[fieldKey] || "", value => { db[fieldKey] = value; }, "例: meta.myTag / damage.formula");
    }

    if (mode === "text") {
      addTextInput("接頭語", db.textPrefix || "", value => { db.textPrefix = value; });
      addTextInput("接尾語", db.textSuffix || "", value => { db.textSuffix = value; });
      addTextInput("空時の表示", db.emptyText || "", value => { db.emptyText = value; });
      addNumberInput("小数桁数(-1でそのまま)", db.decimals ?? -1, value => { db.decimals = value; }, -1);
    }
  }

  function renderItemProperties(win, item) {
    if (!win || !item) return;

    addPropertyHeader(itemTypeLabel(item), `${win.id || "(window)"} > ${itemDisplayName(item) || item.id || "(idなし)"}`);
    addTopSwitches([
      { label: "表示", kind: "visibility", value: item.visible !== false, onChange: value => { item.visible = value; }, help: "このパーツの表示/非表示です。" },
      { label: "位置ロック", kind: "lock", value: item.locked === true, onChange: value => { item.locked = value; }, help: "ONにすると、このパーツの移動/リサイズを禁止します。" },
      { label: "外にも表示", value: item.allowOutsideWindow === true, onChange: value => { item.allowOutsideWindow = value; }, help: "ONにするとウィンドウ本体からはみ出した部分も表示します。" }
    ]);
    addPropertyButtonRow([
      { text: "複製", onClick: () => duplicateSelectedObject(), help: "選択中のパーツを複製します。" },
      { text: "削除", className: "danger", onClick: () => deleteSelectedObject(), help: "選択中のパーツを削除します。Ctrl+Zで戻せます。" }
    ]);

    addTopIdentityInputs([
      {
        label: "表示名",
        value: itemDisplayName(item),
        onChange: value => {
          item.displayName = safeItemDisplayNameForWindow(win, value, item.id || "要素", item);
        }
      },
      {
        label: "要素ID",
        value: item.id,
        onChange: value => {
          const old = item.id;
          item.id = safeItemIdForWindow(win, value, old, item);
          if (selected?.itemId === old) selected.itemId = item.id;
        }
      }
    ]);

    addInfo("前後順は一覧の上下順で決まります。上にあるほど手前に表示されます。");

    addPropertyDivider("配置・サイズ");
    addNumberPair("内部X", item.x || 0, "内部Y", item.y || 0, (a, b) => { item.x = a; item.y = b; });

    if (item.type === "text") {
      addPropertyDivider("内容");
      addTextarea("表示文字", item.text || "", value => { item.text = value; });
      addNumberInput("表示幅（0で自動）", item.width || 0, value => { item.width = Math.max(0, value); });

      addPropertyDivider("データベース");
      const textDb = ensureDatabaseBinding(item);
      addCheckbox("データベースから取得", textDb.enabled === true, value => { textDb.enabled = value; });
      if (textDb.enabled) {
        renderDatabaseBindingSection(item, { mode: "text" });
        addSelect("更新タイミング", textDb.updateTiming || "autoFrame", [
          { value: "autoFrame", label: "毎フレーム自動更新" },
          { value: "pluginCommand", label: "プラグインコマンド更新" },
          { value: "windowOpen", label: "ウィンドウ表示時のみ" }
        ], value => { textDb.updateTiming = value; });
        addInfo("pluginCommand選択時は、プラグインコマンド『RefreshDatabaseBindings』で更新できます。\n表示文字はデータベース値で上書きされます。");
      }

      addPropertyDivider("文字スタイル");
      addNumberInput("文字サイズ", item.fontSize || previewDefaultFontSize(), value => { item.fontSize = Math.max(1, value); });
      addNumberInput("行高さ（0で継承）", item.lineHeight || 0, value => { item.lineHeight = Math.max(0, value); }, 0);
      addSelect("横揃え", item.align || "left", [
        { value: "left", label: "左揃え" },
        { value: "center", label: "中央" },
        { value: "right", label: "右揃え" }
      ], value => { item.align = value; });
      addTextInput("フォント名", item.fontFamily || "", value => { item.fontFamily = value; }, "空欄でウィンドウ/全体設定を使用");
      addTextInput("文字色", item.color || "", value => { item.color = value; }, "例: #ffffff / 空欄で通常色");
      addTextInput("縁取り色", item.outlineColor || "", value => { item.outlineColor = value; }, "空欄で継承");
      addNumberInput("縁取り幅", item.outlineWidth ?? 0, value => { item.outlineWidth = Math.max(0, value); }, 0);
      addCheckbox("太字", item.bold === true, value => { item.bold = value; });
      addCheckbox("斜体", item.italic === true, value => { item.italic = value; });
    } else if (item.type === "log") {
      addNumberPair("幅", item.width || 320, "高さ", item.height || 120, (a, b) => { item.width = Math.max(1, a); item.height = Math.max(1, b); });
      addTextarea("プレビュー用ログ", item.sampleText || "ログを追加しました。", value => { item.sampleText = value; });
      addNumberInput("最大保持行数", item.maxLines || 8, value => { item.maxLines = Math.max(1, value); }, 1);
      addNumberInput("1行あたり表示時間（フレーム）", item.displayFrames ?? 180, value => { item.displayFrames = Math.max(0, value); }, 0);
      addNumberInput("消える時間（フレーム）", item.fadeFrames ?? 30, value => { item.fadeFrames = Math.max(0, value); }, 0);
      addNumberInput("消えて移動する時間（フレーム）", item.moveFrames ?? 20, value => { item.moveFrames = Math.max(0, value); }, 0);
      addPropertyDivider("文字スタイル");
      addNumberInput("文字サイズ", item.fontSize || 20, value => { item.fontSize = Math.max(1, value); }, 1);
      addNumberInput("行高さ", item.lineHeight || 28, value => { item.lineHeight = Math.max(1, value); }, 1);
      addNumberPair("左右余白", item.paddingX ?? 4, "上下余白", item.paddingY ?? 4, (a, b) => { item.paddingX = Math.max(0, a); item.paddingY = Math.max(0, b); });
      addTextInput("文字色", item.color || "", value => { item.color = value; }, "空欄で継承");
      addTextInput("縁取り色", item.outlineColor || "", value => { item.outlineColor = value; }, "空欄で継承");
      addNumberInput("縁取り幅", item.outlineWidth ?? 0, value => { item.outlineWidth = Math.max(0, value); }, 0);
    } else if (item.type === "gauge") {
      addNumberPair("幅", item.width || 220, "高さ", item.height || 14, (a, b) => {
        item.width = Math.max(1, a);
        item.height = Math.max(1, b);
        syncOwnerSizePercent(item);
      });
      addNumberPair("幅率（%）", ownerSizePercent(item, "x"), "高さ率（%）", ownerSizePercent(item, "y"), (a, b) => {
        applyOwnerSizePercent(item, a, b);
      });
      addButtonControl("原寸に戻す", () => {
        runStateMutation("原寸に戻す", () => {
          applyOwnerSizePercent(item, 100, 100);
        });
      });
      addSelect("ゲージ種類", item.gaugeShape || item.gaugeType || "horizontal", [
        { value: "horizontal", label: "横ゲージ" },
        { value: "vertical", label: "縦ゲージ" },
        { value: "circle", label: "円ゲージ" }
      ], value => {
        item.gaugeShape = value;
        if (value === "vertical" && !["bottomToTop", "topToBottom"].includes(String(item.gaugeDirection || ""))) item.gaugeDirection = "bottomToTop";
        if (value === "horizontal" && !["leftToRight", "rightToLeft"].includes(String(item.gaugeDirection || ""))) item.gaugeDirection = "leftToRight";
        if (value === "circle") {
          if (!["clockwise", "counterClockwise"].includes(String(item.gaugeDirection || ""))) item.gaugeDirection = "clockwise";
          if (item.gaugeStartAngle === undefined || item.gaugeStartAngle === null || item.gaugeStartAngle === "") item.gaugeStartAngle = 0;
        }
      });
      const shape = String(item.gaugeShape || item.gaugeType || "horizontal");
      const directionOptions = shape === "vertical" ? [
        { value: "bottomToTop", label: "下から上へ減る/増える" },
        { value: "topToBottom", label: "上から下へ減る/増える" }
      ] : shape === "circle" ? [
        { value: "clockwise", label: "時計回り" },
        { value: "counterClockwise", label: "反時計回り" }
      ] : [
        { value: "leftToRight", label: "左から右へ" },
        { value: "rightToLeft", label: "右から左へ" }
      ];
      addSelect("ゲージ方向", item.gaugeDirection || directionOptions[0].value, directionOptions, value => { item.gaugeDirection = value; });
      if (shape === "circle") {
        addNumberInput("開始角度(度)", item.gaugeStartAngle ?? 0, value => { item.gaugeStartAngle = value; }, -3600);
        addInfo("円ゲージの開始角度です。0度は上方向、90度は右方向、180度は下方向、270度は左方向です。");
      }

      addPropertyDivider("値");
      const gaugeDb = ensureDatabaseBinding(item);
      addCheckbox("データベースから取得", gaugeDb.enabled === true, value => { gaugeDb.enabled = value; });
      if (gaugeDb.enabled) {
        addInfo("現在値と最大値は下で個別に設定できます。最大値参照が未設定のときはフォールバック最大値を使います。");
        // 折りたたみ見出しを分けると『値』内に設定が無く見えるため、同一セクション内に出す
        addPropertySubheader("現在値参照");
        renderDatabaseBindingSection(item, { mode: "gauge" });
        addPropertySubheader("最大値参照");
        renderDatabaseBindingSection(item, { mode: "gauge", prefix: "max", labelPrefix: "最大値" });
        addNumberInput("フォールバック最大値", gaugeDb.maxFallback || 100, value => { gaugeDb.maxFallback = Math.max(1, value); }, 1);
        addSelect("更新タイミング", gaugeDb.updateTiming || "autoFrame", [
          { value: "autoFrame", label: "毎フレーム自動更新" },
          { value: "pluginCommand", label: "プラグインコマンド更新" },
          { value: "windowOpen", label: "ウィンドウ表示時のみ" }
        ], value => { gaugeDb.updateTiming = value; });
        addInfo("pluginCommand選択時は、プラグインコマンド『RefreshDatabaseBindings』で更新できます。\n最大値参照のデータ元を指定しない場合はフォールバック最大値を使用します。");
      } else {
        addSelect("値タイプ", item.valueType || "fixed", [
          { value: "fixed", label: "固定値" },
          { value: "variable", label: "変数" },
          { value: "actorHp", label: "アクターHP" },
          { value: "actorMp", label: "アクターMP" },
          { value: "actorTp", label: "アクターTP" }
        ], value => { item.valueType = value; });
        addNumberPair("固定現在値", item.value || 50, "固定最大値", item.max || 100, (a, b) => { item.value = a; item.max = Math.max(1, b); });
        addNumberPair("現在値変数ID", item.valueVariableId || 1, "最大値変数ID", item.maxVariableId || 2, (a, b) => { item.valueVariableId = a; item.maxVariableId = b; });
        addNumberInput("アクターID", item.actorId || 1, value => { item.actorId = Math.max(1, value); });
      }

      addPropertyDivider("ラベル・色");
      addTextInput("ラベル", item.label || "", value => { item.label = value; });
      addNumberInput("ラベル文字サイズ", item.fontSize || 18, value => { item.fontSize = Math.max(1, value); });
      addTextInput("ラベル文字色", item.color || "", value => { item.color = value; }, "空欄で継承");
      addTextInput("ラベル縁取り色", item.outlineColor || "", value => { item.outlineColor = value; }, "空欄で継承");
      addNumberInput("ラベル縁取り幅", item.outlineWidth ?? 0, value => { item.outlineWidth = Math.max(0, value); }, 0);
      addTextInput("色1", item.color1 || "#ff6060", value => { item.color1 = value; });
      addTextInput("色2", item.color2 || "#ffa0a0", value => { item.color2 = value; });

      const addGaugeImagePicker = (title, key, kind, help) => {
        const layer = ensureGaugeImageLayer(item, key, kind);
        addPropertyDivider(title);
        addCheckbox("使う", layer.enabled === true, value => { layer.enabled = value; });
        addReadonlyWithPicturePicker(
          "選択中画像",
          layer.fileName ? `MZ画像パス: ${normalizeImageFolder(layer.folder)}/${layer.fileName}` : "未指定",
          () => openProjectImagePicker(layer, { ownerItem: item, fitOwnerSize: true })
        );
        addSelect("表示方法", layer.mode || "stretch", ["stretch", "cover", "contain"], value => { layer.mode = value; });
        addNumberInput("不透明度", layer.opacity ?? 255, value => { layer.opacity = clamp(value, 0, 255); }, 0);
      };
      addGaugeImagePicker("ゲージ背景画像", "gaugeBackImage", "back", "ゲージの奥に表示する画像です。");
      addGaugeImagePicker("ゲージ画像", "gaugeFillImage", "fill", "現在値の割合に応じて方向指定どおりにクリップ表示されます。円ゲージでも反映されます。");
      addGaugeImagePicker("ゲージ装飾画像", "gaugeFrontImage", "front", "ゲージの手前に重ねる飾り画像です。");
    } else if (item.type === "choiceList") {
      item.choiceMode = item.choiceMode || "command";
      const isCommandChoice = item.choiceMode === "command";

      addPropertyDivider("配置・項目");
      addNumberInput("幅", item.width || 240, value => { item.width = Math.max(1, value); }, 1);
      addNumberInput("1項目の高さ", item.rowHeight || 32, value => { item.rowHeight = Math.max(1, value); }, 1);
      addNumberInput("項目間隔", item.gap ?? 3, value => { item.gap = Math.max(0, value); }, 0);
      addNumberInput("最大表示数", item.maxVisibleRows || 6, value => { item.maxVisibleRows = Math.max(1, value); }, 1);
      addInfo("親ウィンドウのスクロールがONの場合、選択肢の内部スクロールバーは出さず、ウィンドウ側スクロールバーへ統合されます。");
      addCheckbox("選択肢数でウィンドウ高さ変更", item.autoResizeWindow !== false, value => { item.autoResizeWindow = value; }, "ONにすると、選択肢数に応じて親ウィンドウ高さを自動調整します。ウィンドウスクロールON時は自動拡張せず、スクロール側へ統合します。");

      addPropertyDivider("内容");
      if (isCommandChoice) {
        addInfo("カスタマイズ選択肢：プラグインコマンドで内容・条件を細かく差し替える用途です。");
        addTextarea("プレビュー用サンプル選択肢", choiceListRows(item).join("\n"), value => { setChoiceListRows(item, value); });
      } else {
        addInfo("シンプル選択肢：選択肢の個数・文字をこのツール側で設定する用途です。");
        addTextarea("選択肢", choiceListRows(item).join("\n"), value => {
          setChoiceListRows(item, value);
          item.choiceRules = choiceListRows(item).map(text => ({ text, conditionType: "always", trueState: "enabled", falseState: "enabled", switchId: 0, variableId: 0, compareValue: 0, script: "" }));
          item.choiceEnabled = choiceListRows(item).map(() => true);
          item.disabledIndexes = "";
        });
      }

      if (isCommandChoice) {
        addPropertyDivider("条件");
        ensureChoiceRulesArray(item);
        choiceListRows(item).forEach((choiceText, index) => {
          const rule = item.choiceRules[index];
          const head = `${index + 1}: ${choiceText || "(空)"}`;
          addPropertyDivider(head);
          addSelect("条件", rule.conditionType || "always", choiceConditionOptions(), value => { rule.conditionType = value; });
          addNumberInput("スイッチID", rule.switchId || 0, value => { rule.switchId = Math.max(0, value); }, 0);
          addNumberInput("変数ID", rule.variableId || 0, value => { rule.variableId = Math.max(0, value); }, 0);
          addNumberInput("比較値", rule.compareValue || 0, value => { rule.compareValue = value; });
          addTextarea("条件スクリプト", rule.script || "", value => { rule.script = value; });
          addSelect("成立時", rule.trueState || "enabled", choiceStateOptions(), value => { rule.trueState = value; ensureChoiceEnabledArray(item); });
          addSelect("不成立時", rule.falseState || "hidden", choiceStateOptions(), value => { rule.falseState = value; ensureChoiceEnabledArray(item); });
          addCheckbox("プレビュー条件成立", rule.previewCondition !== false, value => { rule.previewCondition = value; ensureChoiceEnabledArray(item); }, "ツールプレビュー用です。ゲームでは実際のスイッチ/変数/スクリプトで判定します。");
        });
      }

      addPropertyDivider("選択肢の背景色・文字色");
      addTextInput("通常背景色", item.normalBackColor || "rgba(255,255,255,.10)", value => { item.normalBackColor = value; });
      addTextInput("マウスON背景色", item.hoverBackColor || "rgba(255,255,255,.22)", value => { item.hoverBackColor = value; });
      addTextInput("選択背景色", item.selectedBackColor || "rgba(98,169,255,.35)", value => { item.selectedBackColor = value; });
      if (isCommandChoice) {
        addTextInput("無効背景色", item.disabledBackColor || "rgba(0,0,0,.28)", value => { item.disabledBackColor = value; });
        addTextInput("無効文字色", item.disabledTextColor || "rgba(180,180,180,.85)", value => { item.disabledTextColor = value; });
      }
      addTextInput("枠色", item.borderColor || "rgba(255,255,255,.35)", value => { item.borderColor = value; });
      addTextInput("文字色", item.textColor || item.color || "", value => { item.textColor = value; item.color = value; }, "空欄で継承");
      addNumberInput("文字サイズ", item.fontSize || 18, value => { item.fontSize = Math.max(1, value); }, 1);
      addSelect("横揃え", item.align || "center", ["left", "center", "right"], value => { item.align = value; });

      addPropertyDivider("アニメ");
      addSelect("マウスONアニメ", item.hoverAnimation || "none", interactionAnimationOptions(), value => { item.hoverAnimation = value; });
      addSelect("クリックアニメ", item.pressAnimation || "none", interactionAnimationOptions(), value => { item.pressAnimation = value; });

      addPropertyDivider("動作");
      if (isCommandChoice) addCheckbox("選択後にウィンドウを削除", item.closeWindowOnSelect === true, value => { item.closeWindowOnSelect = value; });
      addNumberInput("結果を入れる変数ID", item.resultVariableId || 0, value => { item.resultVariableId = Math.max(0, value); });
      addNumberInput("選択文字を入れる変数ID", item.resultTextVariableId || 0, value => { item.resultTextVariableId = Math.max(0, value); });
      addNumberInput("選択時コモンイベントID", item.commonEventId || 0, value => { item.commonEventId = Math.max(0, value); });
      addTextarea("選択時スクリプト", item.script || "", value => { item.script = value; });
    } else if (item.type === "imageChoiceList") {
      addPropertyDivider("全体");
      addInfo("画像選択肢：選択肢ごとに画像・位置・有効/無効条件・マウスON/クリック時の見た目を設定します。");
      const opts = imageChoiceOptions(item);
      addNumberPair("基準幅", item.width || 180, "基準高さ", item.height || 110, (a, b) => { item.width = Math.max(1, a); item.height = Math.max(1, b); });
      addCheckbox("選択後にウィンドウを削除", item.closeWindowOnSelect === true, value => { item.closeWindowOnSelect = value; });
      const optionChoices = opts.map((opt, index) => ({ value: String(index), label: `${index + 1}: ${opt.text || opt.id || "選択肢"}` }));
      addSelect("編集する画像選択肢", String(clamp(item.selectedOptionIndex ?? 0, 0, opts.length - 1)), optionChoices, value => { item.selectedOptionIndex = Number(value); });
      addButtonControl("画像選択肢を追加", () => {
        runStateMutation("画像選択肢追加", () => {
          const opt = createDefaultImageChoiceOption(opts.length);
          opt.y = Math.max(0, ...opts.map(o => Number(o.y || 0) + Number(o.height || 44) + 8));
          item.options.push(opt);
          item.selectedOptionIndex = item.options.length - 1;
        });
      });
      if (opts.length > 1) {
        addButtonControl("現在の画像選択肢を削除", () => {
          runStateMutation("画像選択肢削除", () => {
            item.options.splice(clamp(item.selectedOptionIndex ?? 0, 0, item.options.length - 1), 1);
            item.selectedOptionIndex = 0;
          });
        });
      }
      const opt = opts[clamp(item.selectedOptionIndex ?? 0, 0, opts.length - 1)];

      addPropertyDivider(`選択肢 ${Number(item.selectedOptionIndex || 0) + 1}：基本`);
      addTextInput("選択肢ID", opt.id || "", value => { opt.id = safeId(value, opt.id || "choice"); });
      addTextInput("選択肢名", opt.text || "", value => { opt.text = value; });
      addNumberPair("選択肢X", opt.x || 0, "選択肢Y", opt.y || 0, (a, b) => { opt.x = a; opt.y = b; });
      addNumberPair("選択肢幅", opt.width || 160, "選択肢高さ", opt.height || 44, (a, b) => { opt.width = Math.max(1, a); opt.height = Math.max(1, b); });

      addPropertyDivider("条件");
      addSelect("条件", opt.conditionType || "always", choiceConditionOptions(), value => { opt.conditionType = value; });
      addNumberInput("スイッチID", opt.switchId || 0, value => { opt.switchId = Math.max(0, value); }, 0);
      addNumberInput("変数ID", opt.variableId || 0, value => { opt.variableId = Math.max(0, value); }, 0);
      addNumberInput("比較値", opt.compareValue || 0, value => { opt.compareValue = value; });
      addTextarea("条件スクリプト", opt.script || "", value => { opt.script = value; });
      addSelect("成立時", opt.trueState || "enabled", choiceStateOptions(), value => { opt.trueState = value; });
      addSelect("不成立時", opt.falseState || "disabled", choiceStateOptions(), value => { opt.falseState = value; });
      addCheckbox("プレビュー条件成立", opt.previewCondition !== false, value => { opt.previewCondition = value; });

      const addOptImage = (label, key) => {
        const imgDef = opt[key] || (opt[key] = createImageChoiceImage());
        addPropertyDivider(label);
        addReadonlyWithPicturePicker(
          "選択中画像",
          imgDef.fileName ? imageSelectionLabel(imgDef) : "未指定",
          () => openProjectImagePicker(imgDef)
        );
        addSelect("表示方法", imgDef.mode || "stretch", ["stretch", "cover", "contain"], value => { imgDef.mode = value; });
        addNumberInput("不透明度", imgDef.opacity ?? 255, value => { imgDef.opacity = clamp(value, 0, 255); }, 0, 255);
      };
      addOptImage("有効画像", "enabledImage");
      addOptImage("無効画像", "disabledImage");
      addOptImage("マウスON画像", "hoverImage");
      addOptImage("クリック画像", "pressImage");

      addPropertyDivider("アニメ");
      addNumberInput("マウスON拡大率%", opt.hoverScalePercent || 105, value => { opt.hoverScalePercent = Math.max(1, value); }, 1);
      addNumberInput("マウスON不透明度", opt.hoverOpacity ?? 255, value => { opt.hoverOpacity = clamp(value, 0, 255); }, 0, 255);
      addNumberInput("クリック拡大率%", opt.pressScalePercent || 96, value => { opt.pressScalePercent = Math.max(1, value); }, 1);
      addNumberInput("クリック不透明度", opt.pressOpacity ?? 230, value => { opt.pressOpacity = clamp(value, 0, 255); }, 0, 255);

      addPropertyDivider("動作");
      addNumberInput("結果を入れる変数ID", opt.resultVariableId || item.resultVariableId || 0, value => { opt.resultVariableId = Math.max(0, value); });
      addNumberInput("選択時コモンイベントID", opt.commonEventId || 0, value => { opt.commonEventId = Math.max(0, value); });
      addTextarea("選択時スクリプト", opt.scriptOnSelect || "", value => { opt.scriptOnSelect = value; });
    } else if (item.type === "button") {
      addNumberPair("幅", item.width || 120, "高さ", item.height || 36, (a, b) => {
        item.width = Math.max(1, a);
        item.height = Math.max(1, b);
        syncOwnerSizePercent(item);
      });
      addNumberPair("幅率（%）", ownerSizePercent(item, "x"), "高さ率（%）", ownerSizePercent(item, "y"), (a, b) => {
        applyOwnerSizePercent(item, a, b);
      });
      addButtonControl("原寸に戻す", () => {
        runStateMutation("原寸に戻す", () => {
          applyOwnerSizePercent(item, 100, 100);
        });
      });

      addPropertyDivider("ボタン種類");
      addSelect("種類", item.buttonVisualMode || "normal", [
        { value: "normal", label: "通常ボタン" },
        { value: "image", label: "画像ボタン" },
        { value: "psd", label: "PSDボタン" }
      ], value => { item.buttonVisualMode = value; ensureButtonImages(item); });

      addPropertyDivider("内容");
      addTextInput("ボタン文字", item.text || "OK", value => { item.text = value; });

      addPropertyDivider("通常ボタンの背景色・枠色");
      addTextInput("通常背景色", item.backColor || "", value => { item.backColor = value; }, "空欄で既定");
      addTextInput("通常枠色", item.borderColor || "", value => { item.borderColor = value; }, "空欄で既定");

      addPropertyDivider("アニメ");
      addSelect("マウスONアニメ", item.hoverAnimation || "none", interactionAnimationOptions(), value => { item.hoverAnimation = value; });
      addSelect("クリックアニメ", item.pressAnimation || "none", interactionAnimationOptions(), value => { item.pressAnimation = value; });

      addPropertyDivider("クリック動作");
      addNumberInput("クリック時コモンイベントID", item.commonEventId || 0, value => { item.commonEventId = Math.max(0, value); });
      addNumberInput("クリック時ONスイッチID", item.switchId || 0, value => { item.switchId = Math.max(0, value); });
      addNumberPair("クリック時変数ID", item.variableId || 0, "代入値", item.variableValue || 0, (a, b) => { item.variableId = Math.max(0, a); item.variableValue = b; });
      addTextarea("クリック時スクリプト", item.script || "", value => { item.script = value; });

      addPropertyDivider("状態別設定");
      ensureButtonStates(item);
      const editKey = item.buttonStateEdit || "mouseOn";
      addSelect("編集する状態", editKey, buttonStateOptions(), value => { item.buttonStateEdit = value; });
      const stateKey = item.buttonStateEdit || editKey;
      const st = ensureButtonStates(item)[stateKey];
      const label = buttonStateLabel(stateKey);
      if (String(item.buttonVisualMode || "normal") !== "normal") {
        const imgDef = ensureButtonImages(item)[stateKey];
        addPropertyDivider(`${label}：画像`);
        if (String(item.buttonVisualMode || "normal") === "psd") {
          addButtonControl(`${label}のPSD名前IDを選択`, () => openCompositePresetInsertPicker(item));
          addReadonly("選択中PSD", imgDef.psdLabel || "未指定");
          addReadonly("選択中名前ID", imgDef.presetId || "未指定");
          addReadonly("MZ画像パス", imgDef.fileName ? `${imgDef.folder}/${imgDef.fileName}` : "未指定");
        } else {
          addReadonlyWithPicturePicker(
            "選択中画像",
            imgDef.fileName ? imageSelectionLabel(imgDef) : "未指定",
            () => openProjectImagePicker(imgDef, { ownerItem: item, fitOwnerSize: true })
          );
        }
        addNumberInput(`${label}画像不透明度`, imgDef.opacity ?? 255, value => { imgDef.opacity = clamp(value, 0, 255); }, 0, 255);
      }
      addCheckbox(`${label}の見た目を使う`, st.enabled === true, value => { st.enabled = value; }, "ONにすると、このマウス状態の見た目を通常ボタンから上書きします。");
      addTextInput(`${label}背景色`, st.backColor || "", value => { st.backColor = value; }, "例: rgba(255,255,255,.25) / #ffffff");
      addTextInput(`${label}枠色`, st.borderColor || "", value => { st.borderColor = value; }, "空欄で通常枠色");
      addTextInput(`${label}文字色`, st.textColor || "", value => { st.textColor = value; }, "空欄で通常文字色");
      addNumberInput(`${label}不透明度`, st.opacity ?? 255, value => { st.opacity = clamp(value, 0, 255); }, 0, 255);
      addNumberPair(`${label}X拡大率%`, st.scaleXPercent ?? 100, `${label}Y拡大率%`, st.scaleYPercent ?? 100, (a, b) => { st.scaleXPercent = Math.max(1, a); st.scaleYPercent = Math.max(1, b); });
      addNumberPair(`${label}Xずらし`, st.offsetX || 0, `${label}Yずらし`, st.offsetY || 0, (a, b) => { st.offsetX = a; st.offsetY = b; });
      addCheckbox(`${label}の動作を使う`, st.actionEnabled === true, value => { st.actionEnabled = value; }, "ONにすると、この状態へ入った時に下の動作を実行します。");
      addNumberInput(`${label}コモンイベントID`, st.commonEventId || 0, value => { st.commonEventId = Math.max(0, value); });
      addNumberInput(`${label}ONスイッチID`, st.switchId || 0, value => { st.switchId = Math.max(0, value); });
      addNumberPair(`${label}変数ID`, st.variableId || 0, "代入値", st.variableValue || 0, (a, b) => { st.variableId = Math.max(0, a); st.variableValue = b; });
      addTextarea(`${label}スクリプト`, st.script || "", value => { st.script = value; });
    } else if (item.type === "compositeImage") {
      ensureCompositeImageLayers(item);
      const bounds = compositeImageBounds(item);
      addInfo("複数画像を1つの表示物として扱う複合画像です。ゲーム内では書き出し済みPNG（1枚絵）として表示できます。");
      addNumberPair("基準幅", Math.max(1, Number(item.width || bounds.width)), "基準高さ", Math.max(1, Number(item.height || bounds.height)), (a, b) => { item.width = Math.max(1, a); item.height = Math.max(1, b); });

      addPropertyDivider("複合画像の拡大率・不透明度");
      addNumberPair("X拡大率（%）", imageScalePercent(item, "scaleX"), "Y拡大率（%）", imageScalePercent(item, "scaleY"), (a, b) => { setImageScalePercent(item, "scaleX", a); setImageScalePercent(item, "scaleY", b); });
      addButtonControl("原寸に戻す", () => {
        runStateMutation("原寸に戻す", () => {
          const naturalW = Math.max(1, Number(bounds.width || item.width || 1));
          const naturalH = Math.max(1, Number(bounds.height || item.height || 1));
          item.width = naturalW;
          item.height = naturalH;
          setImageScalePercent(item, "scaleX", 100);
          setImageScalePercent(item, "scaleY", 100);
        });
      });
      addNumberInput("不透明度", item.opacity ?? 255, value => { item.opacity = clamp(value, 0, 255); }, 0, 255);

      addPropertyDivider("PSD / 名前ID 呼び出し");
      const layerCount = ensureCompositeImageLayers(item).length;
      const psdLabel = compositePresetReferenceLabel(item);
      const psdKey = compositePresetReferenceKey(item);
      const lib = compositePresetReferenceLibrary(item);
      const presetOptions = compositePresetOptionsForItem(item);
      addReadonly("PSD", psdLabel || "未選択");
      if (presetOptions.length) {
        addSelect("呼び出す名前ID", item.selectedPresetId || item.compositePresetNameId || presetOptions[0].value, presetOptions, value => {
          const library = compositePresetReferenceLibrary(item);
          const normalized = library ? normalizeCompositePresetLibrary(library) : null;
          const preset = normalized?.presets?.find(p => p.id === value);
          if (preset) applyLibraryPresetToCompositeItem(item, normalized, preset, { keepPlacement: true });
        });
      } else {
        addReadonly("呼び出す名前ID", psdKey ? "このPSDに保存済み名前IDがありません" : "未選択");
      }
      addButtonControl("登録済み名前IDから選択", () => openCompositePresetInsertPicker(item));
      addInfo(`メイン側は、登録済みPSDライブラリの名前IDを呼び出して表示します。ここではレイヤー構成を編集しません。現在のPSD: ${psdLabel || "未選択"} / レイヤー数: ${layerCount}`);
      if (lib && item.selectedPresetId) {
        const normalized = normalizeCompositePresetLibrary(lib);
        const preset = normalized.presets.find(p => p.id === item.selectedPresetId);
        if (preset) addReadonly("出力予定PNG", `img/pictures/${COMPOSITE_EXPORT_ROOT_FOLDER}/${libraryExportFileName(normalized, preset)}.png`);
      }
      if (item.bakedImage && item.bakedImage.fileName) {
        addReadonly("MZ出力PNG", `img/${item.bakedImage.folder}/${item.bakedImage.fileName}.png`);
        addReadonly("出力PNGサイズ", `${Math.round(item.bakedImage.width || 0)} × ${Math.round(item.bakedImage.height || 0)}`);
      }
    } else if (item.type === "image") {
      addNumberPair("基準幅", imageBaseWidth(item), "基準高さ", imageBaseHeight(item), (a, b) => { item.width = Math.max(1, a); item.height = Math.max(1, b); });

      addPropertyDivider("画像設定");
      addReadonlyWithPicturePicker("選択中画像", imageSelectionLabel(item), () => openProjectImagePicker(item));

      addPropertyDivider("画像の拡大率・不透明度");
      addNumberPair("X拡大率（%）", imageScalePercent(item, "scaleX"), "Y拡大率（%）", imageScalePercent(item, "scaleY"), (a, b) => { setImageScalePercent(item, "scaleX", a); setImageScalePercent(item, "scaleY", b); });
      addButtonControl("原寸に戻す", () => {
        runStateMutation("原寸に戻す", () => {
          item.width = Math.max(1, Number(item.previewNaturalWidth || item.width || 1));
          item.height = Math.max(1, Number(item.previewNaturalHeight || item.height || 1));
          setImageScalePercent(item, "scaleX", 100);
          setImageScalePercent(item, "scaleY", 100);
        });
      });
      addNumberInput("不透明度", item.opacity ?? 255, value => { item.opacity = clamp(value, 0, 255); }, 0, 255);
    }
  }


  function databasePickerIconSrc() {
    return "assets/db-picker.png";
  }

  function createDatabasePickerIconButton(title, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "db-picker-icon-button";
    setHoverHelp(button, title || "データベース一覧から選択");
    button.title = title || "データベース一覧から選択";
    button.setAttribute("aria-label", title || "データベース一覧から選択");
    const img = document.createElement("img");
    img.src = databasePickerIconSrc();
    img.alt = "";
    img.draggable = false;
    button.appendChild(img);
    button.addEventListener("click", ev => {
      ev.preventDefault();
      ev.stopPropagation();
      if (typeof onClick === "function") onClick();
    });
    return button;
  }

  function addReadonlyWithDatabasePicker(label, value, onPick, help = "") {
    const wrap = document.createElement("div");
    wrap.className = "db-picker-field";
    setHoverHelp(wrap, label, help || "右側のアイコンからデータベース一覧を開けます。");
    const title = document.createElement("div");
    title.className = "db-picker-field-title";
    title.textContent = label;
    const row = document.createElement("div");
    row.className = "db-picker-field-row";
    const input = document.createElement("input");
    input.value = value;
    input.disabled = true;
    row.appendChild(input);
    if (typeof onPick === "function") {
      row.appendChild(createDatabasePickerIconButton(`${label}を一覧から選択`, onPick));
    }
    wrap.appendChild(title);
    wrap.appendChild(row);
    appendPropertyControl(wrap);
  }

  function addNumberInputWithDatabasePicker(label, value, onChange, onPick, min = -999999, max = 999999) {
    const wrap = document.createElement("div");
    wrap.className = "db-picker-field";
    setHoverHelp(wrap, label, "右側のアイコンからデータベース一覧を開けます。");
    const title = document.createElement("div");
    title.className = "db-picker-field-title";
    title.textContent = label;
    const row = document.createElement("div");
    row.className = "db-picker-field-row";
    const input = document.createElement("input");
    input.type = "number";
    input.min = min;
    input.max = max;
    input.value = value;
    input.addEventListener("change", () => {
      runPropertyValueMutation(`${label}変更`, () => onChange(Number(input.value)));
    });
    row.appendChild(input);
    if (typeof onPick === "function") {
      row.appendChild(createDatabasePickerIconButton(`${label}を一覧から選択`, onPick));
    }
    wrap.appendChild(title);
    wrap.appendChild(row);
    appendPropertyControl(wrap);
  }

  function picturePickerIconSrc() {
    return "assets/picture-picker.png";
  }

  function createPicturePickerIconButton(title, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "db-picker-icon-button picture-picker-icon-button";
    setHoverHelp(button, title || "ピクチャを選択");
    button.title = title || "ピクチャを選択";
    button.setAttribute("aria-label", title || "ピクチャを選択");
    const img = document.createElement("img");
    img.src = picturePickerIconSrc();
    img.alt = "";
    img.draggable = false;
    button.appendChild(img);
    button.addEventListener("click", ev => {
      ev.preventDefault();
      ev.stopPropagation();
      if (typeof onClick === "function") onClick();
    });
    return button;
  }

  function addReadonlyWithPicturePicker(label, value, onPick, help = "") {
    const wrap = document.createElement("div");
    wrap.className = "db-picker-field";
    setHoverHelp(wrap, label, help || "右側のアイコンからプロジェクト画像を選べます。");
    const title = document.createElement("div");
    title.className = "db-picker-field-title";
    title.textContent = label;
    const row = document.createElement("div");
    row.className = "db-picker-field-row";
    const input = document.createElement("input");
    input.value = value;
    input.disabled = true;
    row.appendChild(input);
    if (typeof onPick === "function") {
      row.appendChild(createPicturePickerIconButton(label || "ピクチャを選択", onPick));
    }
    wrap.appendChild(title);
    wrap.appendChild(row);
    appendPropertyControl(wrap);
  }

  function addReadonly(label, value) {
    const div = document.createElement("label");
    setHoverHelp(div, label);
    div.textContent = label;
    const input = document.createElement("input");
    input.value = value;
    input.disabled = true;
    div.appendChild(input);
    appendPropertyControl(div);
  }

  function addTypeHint(text) {
    const div = document.createElement("div");
    div.className = "type-hint";
    div.textContent = text;
    appendPropertyControl(div);
  }

  function addInfo(text) {
    const div = document.createElement("div");
    div.className = "property-info";
    div.textContent = text;
    appendPropertyControl(div);
  }

  function normalizeColorPickerValue(value) {
    const text = String(value || "").trim();
    if (/^#[0-9a-fA-F]{6}$/.test(text)) return text;
    if (/^#[0-9a-fA-F]{3}$/.test(text)) {
      return "#" + text.slice(1).split("").map(ch => ch + ch).join("");
    }
    return "#ffffff";
  }

  function shouldUseColorPicker(label, value = "") {
    const name = String(label || "");
    return /色|カラー|color/i.test(name);
  }

  function addTextInput(label, value, onChange, placeholder = "") {
    const div = document.createElement("label");
    setHoverHelp(div, label, placeholder);
    div.textContent = label;

    if (shouldUseColorPicker(label, value)) {
      div.classList.add("property-color-label");
      const row = document.createElement("div");
      row.className = "property-color-row";

      const color = document.createElement("input");
      color.type = "color";
      color.className = "property-color-picker";
      color.value = normalizeColorPickerValue(value);
      color.title = "カラーパレットから選択";

      const paletteBtn = document.createElement("button");
      paletteBtn.type = "button";
      paletteBtn.className = "property-color-open-button";
      paletteBtn.textContent = "🎨";
      paletteBtn.title = "カラーパレットを開く";
      paletteBtn.addEventListener("click", ev => {
        ev.preventDefault();
        ev.stopPropagation();
        try {
          if (typeof color.showPicker === "function") color.showPicker();
          else color.click();
        } catch (_) {
          color.click();
        }
      });

      const input = document.createElement("input");
      input.type = "text";
      input.className = "property-color-text";
      input.value = value;
      input.placeholder = placeholder || "#FFFFFF / rgba(...) / 空欄";
      input.spellcheck = false;

      const commitText = () => {
        const next = input.value;
        const normalized = normalizeColorPickerValue(next);
        if (/^#[0-9a-fA-F]{3}$/.test(String(next).trim()) || /^#[0-9a-fA-F]{6}$/.test(String(next).trim())) {
          color.value = normalized;
        }
        runPropertyValueMutation(`${label}変更`, () => onChange(next));
      };

      color.addEventListener("input", () => {
        input.value = color.value.toUpperCase();
      });
      color.addEventListener("change", () => {
        const next = color.value.toUpperCase();
        input.value = next;
        runPropertyValueMutation(`${label}変更`, () => onChange(next));
      });
      input.addEventListener("change", commitText);
      input.addEventListener("keydown", ev => {
        if (ev.key === "Enter") {
          ev.preventDefault();
          commitText();
        }
      });

      row.appendChild(color);
      row.appendChild(paletteBtn);
      row.appendChild(input);
      div.appendChild(row);
      appendPropertyControl(div);
      return;
    }

    const input = document.createElement("input");
    input.type = "text";
    input.value = value;
    input.placeholder = placeholder;
    input.addEventListener("change", () => {
      runPropertyValueMutation(`${label}変更`, () => onChange(input.value));
    });
    div.appendChild(input);
    appendPropertyControl(div);
  }

  function addTextarea(label, value, onChange) {
    const div = document.createElement("label");
    setHoverHelp(div, label);
    div.textContent = label;
    const input = document.createElement("textarea");
    input.className = "small-textarea";
    input.value = value;
    input.addEventListener("change", () => {
      runPropertyValueMutation(`${label}変更`, () => onChange(input.value));
    });
    div.appendChild(input);
    appendPropertyControl(div);
  }

  function runPropertyValueMutation(label, mutate) {
    // 右プロパティの数値欄を変更した時に、プロパティ欄自体まで再描画すると
    // 入力中のフォーカスが消え、ホイール連続変更やTab移動が壊れる。
    // ここではプレビューと一覧だけを更新し、入力中のDOMは維持する。
    runStateMutation(label, mutate, { renderOptions: { skipProperties: true } });
  }

  function addNumberInput(label, value, onChange, min = -999999, max = 999999) {
    const div = document.createElement("label");
    setHoverHelp(div, label);
    div.textContent = label;
    const input = document.createElement("input");
    input.type = "number";
    input.min = min;
    input.max = max;
    input.value = value;
    input.addEventListener("change", () => {
      runPropertyValueMutation(`${label}変更`, () => onChange(Number(input.value)));
    });
    div.appendChild(input);
    appendPropertyControl(div);
  }

  function addNumberPair(labelA, valueA, labelB, valueB, onChange) {
    const wrap = document.createElement("div");
    wrap.className = "inline-row";
    const a = document.createElement("label");
    setHoverHelp(a, labelA);
    a.textContent = labelA;
    const ai = document.createElement("input");
    ai.type = "number";
    ai.value = valueA;
    a.appendChild(ai);
    const b = document.createElement("label");
    setHoverHelp(b, labelB);
    b.textContent = labelB;
    const bi = document.createElement("input");
    bi.type = "number";
    bi.value = valueB;
    b.appendChild(bi);
    const update = () => {
      runPropertyValueMutation(`${labelA}・${labelB}変更`, () => onChange(Number(ai.value), Number(bi.value)));
    };
    ai.addEventListener("change", update);
    bi.addEventListener("change", update);
    wrap.appendChild(a);
    wrap.appendChild(b);
    appendPropertyControl(wrap);
  }

  function addSelect(label, value, options, onChange) {
    const div = document.createElement("label");
    setHoverHelp(div, label);
    div.textContent = label;
    const select = document.createElement("select");
    for (const opt of options) {
      const option = document.createElement("option");
      if (opt && typeof opt === "object") {
        option.value = String(opt.value);
        option.textContent = String(opt.label ?? opt.value);
      } else {
        option.value = String(opt);
        option.textContent = String(opt);
      }
      select.appendChild(option);
    }
    select.value = String(value);
    select.addEventListener("change", () => {
      runStateMutation(`${label}変更`, () => onChange(select.value));
    });
    div.appendChild(select);
    appendPropertyControl(div);
  }

  function addCheckbox(label, value, onChange, help = "") {
    const div = document.createElement("label");
    div.className = "check-row";
    setHoverHelp(div, label, help);
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = value;
    input.addEventListener("change", () => {
      runStateMutation(`${label}変更`, () => onChange(input.checked));
    });
    const span = document.createElement("span");
    span.textContent = label;
    div.appendChild(input);
    div.appendChild(span);
    appendPropertyControl(div);
  }

  function addButtonControl(text, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    setHoverHelp(button, text);
    button.textContent = text;
    button.addEventListener("click", onClick);
    appendPropertyControl(button);
  }

  function addPropertyDivider(text) {
    const details = document.createElement("details");
    details.className = "property-section";
    const key = propertySectionKey(text);
    details.dataset.sectionKey = key;
    details.open = propertySectionOpenState.has(key)
      ? propertySectionOpenState.get(key) === true
      : shouldOpenPropertySection(text);

    const summary = document.createElement("summary");
    summary.className = "property-divider";
    setHoverHelp(summary, text);
    summary.textContent = text;

    const body = document.createElement("div");
    body.className = "property-section-body";

    // input/select操作でプロパティ全体が再描画されても、開閉状態を維持します。
    // これがないと「値を選ぶたびに折りたたまれる」ように見えます。
    details.addEventListener("toggle", () => {
      propertySectionOpenState.set(key, details.open === true);
    });
    body.addEventListener("click", event => {
      // 念のため、本文側のクリックを親details/summaryへ伝播させません。
      event.stopPropagation();
    });

    details.appendChild(summary);
    details.appendChild(body);
    props.appendChild(details);
    currentPropertySectionBody = body;
  }


  function choosePreviewImage(item) {
    // 通常UIからは呼び出さない。単体ファイル選択ではブラウザ仕様上、
    // img/system などの親フォルダを取得できないため、MZ画像パス確定には使わない。
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.addEventListener("change", () => {
      const file = input.files && input.files[0];
      if (!file) return;
      const inferred = inferImageFileInfo(file);
      const reader = new FileReader();
      reader.onload = () => {
        const src = String(reader.result || "");
        const img = new Image();
        img.onload = () => {
          runStateMutation("画像指定", () => {
            applyImageSelection(item, {
              folder: inferred.folder || item.folder || "",
              fileName: inferred.fileName || item.fileName || stripImageExtension(file.name),
              url: src,
              displayName: inferred.displayName || file.name,
              naturalWidth: img.naturalWidth || 96,
              naturalHeight: img.naturalHeight || 64,
              forcePreviewSrc: true
            });
          });
        };
        img.src = src;
      };
      reader.readAsDataURL(file);
    });
    input.click();
  }

  function normalizeImageFolder(value) {
    return String(value || "")
      .replace(/\\/g, "/")
      .replace(/^img\//i, "")
      .replace(/^\/+|\/+$/g, "")
      .replace(/\/{2,}/g, "/");
  }

  function imageSelectionLabel(item) {
    const folder = normalizeImageFolder(item.folder) || "未指定";
    const fileName = item.fileName || "未指定";
    const preview = item.previewName ? ` / プレビュー: ${item.previewName}` : "";
    return `MZ画像パス: ${folder}/${fileName}${preview}`;
  }

  // img/pictures/ui/button のような入れ子フォルダも、親フォルダを含めて列挙する。
  // value は実パス、label は選択画面用のインデント表示。
  function imageFolderOptions() {
    const defaults = [
      "pictures", "system", "faces", "enemies", "sv_actors", "sv_enemies",
      "characters", "parallaxes", "tilesets", "animations", "battlebacks1", "battlebacks2", "titles1", "titles2"
    ];
    const byLower = new Map();
    const addFolderAndParents = rawFolder => {
      const folder = normalizeImageFolder(rawFolder);
      if (!folder) return;
      const parts = folder.split("/").filter(Boolean);
      for (let i = 1; i <= parts.length; i++) {
        const current = parts.slice(0, i).join("/");
        const lower = current.toLowerCase();
        if (!byLower.has(lower)) byLower.set(lower, current);
      }
    };
    defaults.forEach(addFolderAndParents);
    for (const [key, asset] of projectAssets.images.entries()) {
      addFolderAndParents(asset.folder || String(key).replace(/\/[^/]+$/, ""));
    }
    return Array.from(byLower.values())
      .sort((a, b) => {
        const depthA = a.split("/").length;
        const depthB = b.split("/").length;
        if (depthA !== depthB) return depthA - depthB;
        return a.localeCompare(b, undefined, { sensitivity: "base" });
      })
      .map(value => {
        const depth = Math.max(0, value.split("/").length - 1);
        return {
          value,
          label: `${"　".repeat(depth)}${depth ? "└ " : ""}${value}`,
          depth
        };
      });
  }

  function inferImageFileInfo(file) {
    const rawPath = String(file.webkitRelativePath || file.name || "").replace(/\\/g, "/");
    const match = rawPath.match(/(?:^|\/)img\/(.+)\/([^/]+)\.(png|jpg|jpeg|webp|gif|bmp)$/i);
    if (match) {
      const folder = normalizeImageFolder(match[1]);
      const fileName = stripImageExtension(match[2]);
      return {
        folder,
        fileName,
        displayName: `${folder}/${fileName}`
      };
    }

    const base = stripImageExtension(file.name || rawPath).toLowerCase();
    if (projectAssets.loaded && base) {
      const hits = [];
      for (const [key, asset] of projectAssets.images.entries()) {
        if (String(asset.baseName || "").toLowerCase() === base) hits.push({ key, asset });
      }
      if (hits.length === 1) {
        const asset = hits[0].asset;
        const folder = normalizeImageFolder(asset.folder || hits[0].key.replace(/\/[^/]+$/, ""));
        const fileName = asset.baseName || stripImageExtension(file.name || rawPath);
        return { folder, fileName, displayName: `${folder}/${fileName}` };
      }
    }
    return { folder: "", fileName: stripImageExtension(file.name || rawPath), displayName: file.name || rawPath };
  }

  function clearPreviewIfDifferentProjectImage(item) {
    // 手動でfolder/fileNameを変えた場合、以前の外部プレビュー画像が残ると誤認しやすいので解除する。
    item.previewSrc = "";
    item.previewName = "";
    render();
  }

  function ownerOverlayImageDefs(ownerItem) {
    if (!ownerItem || typeof ownerItem !== "object") return [];
    if (ownerItem.type === "gauge") {
      return [
        ensureGaugeImageLayer(ownerItem, "gaugeBackImage", "back"),
        ensureGaugeImageLayer(ownerItem, "gaugeFillImage", "fill"),
        ensureGaugeImageLayer(ownerItem, "gaugeFrontImage", "front")
      ].filter(Boolean);
    }
    if (ownerItem.type === "button" && String(ownerItem.buttonVisualMode || "normal") !== "normal") {
      const images = ensureButtonImages(ownerItem);
      return Object.values(images || {}).filter(def => def && typeof def === "object");
    }
    return [];
  }

  function ownerOverlayNaturalSize(ownerItem) {
    const defs = ownerOverlayImageDefs(ownerItem);
    let maxW = 0;
    let maxH = 0;
    for (const def of defs) {
      maxW = Math.max(maxW, Math.max(0, Number(def?.previewNaturalWidth || 0)));
      maxH = Math.max(maxH, Math.max(0, Number(def?.previewNaturalHeight || 0)));
    }
    if (maxW > 0 && maxH > 0 && ownerItem && typeof ownerItem === "object") {
      ownerItem.sizeNaturalWidth = Math.max(1, Math.round(maxW));
      ownerItem.sizeNaturalHeight = Math.max(1, Math.round(maxH));
    }
    if (maxW <= 0) maxW = Math.max(1, Number(ownerItem?.sizeNaturalWidth || ownerItem?.width || 1));
    if (maxH <= 0) maxH = Math.max(1, Number(ownerItem?.sizeNaturalHeight || ownerItem?.height || 1));
    return { width: maxW, height: maxH };
  }

  function ownerSizePercent(ownerItem, axis) {
    const natural = ownerOverlayNaturalSize(ownerItem);
    const current = axis === "y"
      ? Math.max(1, Number(ownerItem?.height || natural.height || 1))
      : Math.max(1, Number(ownerItem?.width || natural.width || 1));
    const base = axis === "y" ? Math.max(1, natural.height) : Math.max(1, natural.width);
    return Math.max(1, Math.round((current / base) * 10000) / 100);
  }

  function syncOwnerSizePercent(ownerItem) {
    if (!ownerItem || typeof ownerItem !== "object") return;
    ownerItem.sizeScaleXPercent = ownerSizePercent(ownerItem, "x");
    ownerItem.sizeScaleYPercent = ownerSizePercent(ownerItem, "y");
  }

  function applyOwnerSizePercent(ownerItem, xPercent, yPercent) {
    if (!ownerItem || typeof ownerItem !== "object") return;
    const natural = ownerOverlayNaturalSize(ownerItem);
    const nx = Math.max(1, Number(xPercent) || 100);
    const ny = Math.max(1, Number(yPercent) || 100);
    ownerItem.sizeScaleXPercent = nx;
    ownerItem.sizeScaleYPercent = ny;
    ownerItem.width = Math.max(1, Math.round(Math.max(1, natural.width) * (nx / 100)));
    ownerItem.height = Math.max(1, Math.round(Math.max(1, natural.height) * (ny / 100)));
  }

  function applyImageSelection(item, info, options = {}) {
    // 大文字小文字を含む実際の相対パスを保持する。デプロイ先が大小文字を区別する場合にも安全。
    const oldFolder = normalizeImageFolder(item.folder || "pictures") || "pictures";
    const oldFileName = stripImageExtension(item.fileName || "");
    const folder = normalizeImageFolder(info.folder || "pictures") || "pictures";
    const fileName = stripImageExtension(info.fileName || "");
    const changedImage = oldFolder !== folder || oldFileName !== fileName;

    item.folder = folder;
    item.fileName = fileName;
    item.previewName = info.displayName || `${item.folder}/${item.fileName}`;
    item.previewNaturalWidth = Math.max(1, Number(info.naturalWidth || 96));
    item.previewNaturalHeight = Math.max(1, Number(info.naturalHeight || 64));
    if (info.forcePreviewSrc) {
      item.previewSrc = info.url || "";
    } else {
      item.previewSrc = "";
    }

    // 画像パーツの差し替え時は、前画像の基準幅・基準高さ・拡大率を引き継がない。
    // ここが残ると、見た目では100%なのに縦長/横長になることがある。
    if (item.layerKind === "compositeImageLayer" && changedImage) {
      item.width = item.previewNaturalWidth || item.width || 96;
      item.height = item.previewNaturalHeight || item.height || 64;
    } else if (item.type === "image" && changedImage) {
      item.width = item.previewNaturalWidth;
      item.height = item.previewNaturalHeight;
      item.scaleXPercent = 100;
      item.scaleYPercent = 100;
      item.scaleX = 1;
      item.scaleY = 1;
    } else if (item.type === "image") {
      if (!item.width || !item.height || (Number(item.width) === 96 && Number(item.height) === 64)) {
        item.width = item.previewNaturalWidth;
        item.height = item.previewNaturalHeight;
      }
      if (!item.scaleXPercent && item.scaleXPercent !== 0) item.scaleXPercent = imageScalePercent(item, "scaleX");
      if (!item.scaleYPercent && item.scaleYPercent !== 0) item.scaleYPercent = imageScalePercent(item, "scaleY");
      item.scaleX = Math.round((Number(item.scaleXPercent || 100) / 100) * 10000) / 10000;
      item.scaleY = Math.round((Number(item.scaleYPercent || 100) / 100) * 10000) / 10000;
    }
    const ownerItem = options?.ownerItem && typeof options.ownerItem === "object" ? options.ownerItem : null;
    if (changedImage && ownerItem && options?.fitOwnerSize === true) {
      const defs = ownerOverlayImageDefs(ownerItem);
      let maxW = Math.max(1, Number(item.previewNaturalWidth || 1));
      let maxH = Math.max(1, Number(item.previewNaturalHeight || 1));
      for (const def of defs) {
        maxW = Math.max(maxW, Math.max(1, Number(def.previewNaturalWidth || 0)));
        maxH = Math.max(maxH, Math.max(1, Number(def.previewNaturalHeight || 0)));
      }
      ownerItem.width = maxW;
      ownerItem.height = maxH;
    }
    if (Object.prototype.hasOwnProperty.call(item, "enabled")) item.enabled = true;
  }

  function openProjectImagePicker(item, options = {}) {
    if (!projectAssets.loaded || projectAssets.images.size <= 0) {
      showToast("先に上部の『ツクールプロジェクト読込』でプロジェクトフォルダを読み込んでください");
      debugLog("warn", "画像選択ダイアログを開けません。ツクールプロジェクトが未読込です。", { loaded: projectAssets.loaded, imageCount: projectAssets.images.size });
      return;
    }
    const overlay = document.createElement("div");
    overlay.className = "image-picker-overlay";
    const dialog = document.createElement("div");
    dialog.className = "image-picker-dialog";
    overlay.appendChild(dialog);

    const header = document.createElement("div");
    header.className = "image-picker-header";
    header.innerHTML = `<strong>プロジェクト画像から選択</strong><span>${escapeHtml(projectAssets.name || "ツクールプロジェクト")}</span>`;
    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "閉じる";
    close.addEventListener("click", () => overlay.remove());
    header.appendChild(close);
    dialog.appendChild(header);

    const controls = document.createElement("div");
    controls.className = "image-picker-controls";
    const folderSelect = document.createElement("select");
    const folderOptions = imageFolderOptions();
    for (const entry of folderOptions) {
      const opt = document.createElement("option");
      opt.value = entry.value;
      opt.textContent = entry.label;
      opt.title = `img/${entry.value}/`;
      folderSelect.appendChild(opt);
    }
    const selectedFolder = normalizeImageFolder(item.folder || "pictures") || "pictures";
    const selectedOption = folderOptions.find(entry => entry.value === selectedFolder)
      || folderOptions.find(entry => entry.value.toLowerCase() === selectedFolder.toLowerCase());
    if (!selectedOption) {
      const opt = document.createElement("option");
      opt.value = selectedFolder;
      opt.textContent = selectedFolder;
      opt.title = `img/${selectedFolder}/`;
      folderSelect.appendChild(opt);
    }
    folderSelect.value = selectedOption ? selectedOption.value : selectedFolder;
    const search = document.createElement("input");
    search.type = "search";
    search.placeholder = "画像名で検索";
    controls.appendChild(folderSelect);
    controls.appendChild(search);
    dialog.appendChild(controls);

    const grid = document.createElement("div");
    grid.className = "image-picker-grid";
    dialog.appendChild(grid);

    const renderGrid = () => {
      grid.innerHTML = "";
      const folder = normalizeImageFolder(folderSelect.value);
      const q = search.value.trim().toLowerCase();
      // 選択したフォルダ自身にある画像だけを表示する。
      // 入れ子フォルダはセレクトに別項目として出すため、親フォルダ選択時に重複表示しない。
      const entries = Array.from(projectAssets.images.entries())
        .filter(([key, asset]) => normalizeImageFolder(asset.folder || String(key).replace(/\/[^/]+$/, "")).toLowerCase() === folder.toLowerCase())
        .filter(([key, asset]) => !q || key.includes(q) || String(asset.baseName || "").toLowerCase().includes(q))
        .sort((a, b) => a[0].localeCompare(b[0]));
      if (entries.length <= 0) {
        const empty = document.createElement("div");
        empty.className = "image-picker-empty";
        empty.textContent = "該当する画像がありません。";
        grid.appendChild(empty);
        return;
      }
      for (const [key, asset] of entries) {
        const assetFolder = normalizeImageFolder(asset.folder || String(key).replace(/\/[^/]+$/, ""));
        const assetName = asset.baseName || key.split("/").pop();
        const card = document.createElement("button");
        card.type = "button";
        card.className = "image-picker-card";
        const img = document.createElement("img");
        img.src = asset.url;
        img.alt = assetName;
        const name = document.createElement("span");
        name.textContent = assetName;
        card.appendChild(img);
        card.appendChild(name);
        card.addEventListener("click", () => {
          const probe = new Image();
          probe.onload = () => {
            runStateMutation("画像指定", () => {
              applyImageSelection(item, {
                folder: assetFolder,
                fileName: assetName,
                url: asset.url,
                displayName: `${assetFolder}/${assetName}`,
                naturalWidth: probe.naturalWidth || 96,
                naturalHeight: probe.naturalHeight || 64,
                forcePreviewSrc: false
              }, options);
            });
            debugLog("info", "プロジェクト画像を選択しました。", { folder: assetFolder, fileName: assetName, key, naturalWidth: probe.naturalWidth, naturalHeight: probe.naturalHeight });
            overlay.remove();
          };
          probe.onerror = () => {
            runStateMutation("画像指定", () => {
              applyImageSelection(item, {
                folder: assetFolder,
                fileName: assetName,
                url: asset.url,
                displayName: `${assetFolder}/${assetName}`,
                forcePreviewSrc: false
              }, options);
            });
            debugLog("warn", "プロジェクト画像のサイズ取得に失敗しましたが、選択自体は反映しました。", { folder: assetFolder, fileName: assetName, key });
            overlay.remove();
          };
          probe.src = asset.url;
        });
        grid.appendChild(card);
      }
    };
    folderSelect.addEventListener("change", renderGrid);
    search.addEventListener("input", renderGrid);
    overlay.addEventListener("click", ev => { if (ev.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
    renderGrid();
  }

  function stripImageExtension(value) {
    return String(value || "")
      .replace(/^.*[\\/]/, "")
      .replace(/\.(png|jpg|jpeg|webp|gif|bmp)$/i, "");
  }

  function sanitizeImportName(value, fallback = "item") {
    const raw = String(value || "").trim().replace(/^.*[\\/]/, "");
    const cleaned = raw
      .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
      .replace(/\s+/g, " ")
      .replace(/^\.+/, "")
      .trim();
    return cleaned || fallback;
  }

  function normalizePsdBlendMode(value) {
    const mode = String(value || "normal").toLowerCase();
    if (["normal", "multiply", "screen", "add"].includes(mode)) return mode;
    if (["linear dodge", "lineardodge", "additive", "lighter color", "lighten"].includes(mode)) return "add";
    return "normal";
  }

  function normalizePsdOpacity(value, fallback = 255) {
    const n = Number(value);
    if (!Number.isFinite(n)) return clamp(fallback, 0, 255);
    // ag-psd の layer.opacity は 0.0〜1.0 系で返る場合がある。
    // そのまま 0〜255 として扱うと 100% 不透明が 1/255 になり、プレビュー上ほぼ透明になる。
    if (n > 0 && n <= 1) return clamp(Math.round(n * 255), 0, 255);
    // 念のため、PSD由来で 0〜100% として渡された場合も救済する。
    if (n > 1 && n <= 100) return clamp(Math.round(n * 2.55), 0, 255);
    return clamp(n, 0, 255);
  }

  function supportsPsdImport() {
    return !!(window.agPsd && typeof window.agPsd.readPsd === "function");
  }

  async function canvasToPngBlob(canvas) {
    return await new Promise((resolve, reject) => {
      if (!canvas || typeof canvas.toBlob !== "function") {
        reject(new Error("PNG書き出しに必要なCanvas APIが使えません"));
        return;
      }
      canvas.toBlob(blob => {
        if (blob) resolve(blob);
        else reject(new Error("PNGデータの生成に失敗しました"));
      }, "image/png");
    });
  }

  function loadImageElement(src) {
    return new Promise((resolve, reject) => {
      if (!src) {
        reject(new Error("画像URLが空です"));
        return;
      }
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`画像の読み込みに失敗しました: ${src}`));
      img.src = src;
    });
  }

  function findWindowByItemId(itemId) {
    if (!itemId) return null;
    // 同じパーツIDが別ウィンドウに存在する場合、現在選択中のウィンドウを優先します。
    // 統合画像プリセット管理など、別ウィンドウ側から参照する時に「前回の同名ID」を拾わないための保険です。
    if (selected?.kind === "item" && selected.itemId === itemId) {
      const selectedWin = selectedWindow();
      if (selectedWin && Array.isArray(selectedWin.items) && selectedWin.items.some(item => item.id === itemId)) return selectedWin;
    }
    return (state.windows || []).find(win => Array.isArray(win.items) && win.items.some(item => item.id === itemId)) || null;
  }

  function compositePresetTargetRef(win, item) {
    return `${encodeURIComponent(win?.id || "")}|${encodeURIComponent(item?.id || "")}`;
  }

  function compositePresetTargetFromRef(ref) {
    const value = String(ref || "");
    if (value.includes("|")) {
      const parts = value.split("|");
      const windowId = decodeURIComponent(parts[0] || "");
      const itemId = decodeURIComponent(parts.slice(1).join("|") || "");
      const win = (state.windows || []).find(entry => entry.id === windowId) || null;
      const item = (win?.items || []).find(entry => entry.id === itemId) || null;
      if (win && item && item.type === "compositeImage") return { win, item };
      return null;
    }
    const win = findWindowByItemId(value);
    const item = (win?.items || []).find(entry => entry.id === value) || null;
    if (win && item && item.type === "compositeImage") return { win, item };
    return null;
  }

  function compositeExportAutoBaseName(item, win = null) {
    const layout = sanitizeImportName(state.layoutId || "layout", "layout");
    const windowId = sanitizeImportName((win && win.id) || findWindowByItemId(item?.id)?.id || "window", "window");
    const itemId = sanitizeImportName(item?.id || "composite", "composite");
    return `${layout}_${windowId}_${itemId}`;
  }

  function compositeExportBaseName(item, win = null) {
    const custom = sanitizeImportName(item?.exportBaseName || "", "");
    return custom || compositeExportAutoBaseName(item, win);
  }

  function compositeExportPresetName(item) {
    return sanitizeImportName(item?.exportPresetName || "", "");
  }

  function compositeExportFileName(item, win = null) {
    const base = compositeExportBaseName(item, win);
    const preset = compositeExportPresetName(item);
    return preset ? `${base}_${preset}` : base;
  }

  function compositeImageDrawRect(item) {
    const layers = ensureCompositeImageLayers(item).filter(layer => layer.visible !== false && layer.fileName);
    let minX = 0;
    let minY = 0;
    let maxX = Math.max(1, Number(item.width || 1));
    let maxY = Math.max(1, Number(item.height || 1));
    for (const layer of layers) {
      const x = Number(layer.x || 0);
      const y = Number(layer.y || 0);
      const w = Math.max(1, Number(layer.width || layer.previewNaturalWidth || 96));
      const h = Math.max(1, Number(layer.height || layer.previewNaturalHeight || 64));
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + w);
      maxY = Math.max(maxY, y + h);
    }
    return {
      minX,
      minY,
      width: Math.max(1, Math.ceil(maxX - minX)),
      height: Math.max(1, Math.ceil(maxY - minY))
    };
  }

  function canvasBlendModeForCompositeLayer(mode) {
    switch (String(mode || "normal")) {
      case "add": return "lighter";
      case "multiply": return "multiply";
      case "screen": return "screen";
      default: return "source-over";
    }
  }

  async function renderCompositeImageToCanvas(item) {
    const rect = compositeImageDrawRect(item);
    const canvas = document.createElement("canvas");
    canvas.width = rect.width;
    canvas.height = rect.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2Dコンテキストを作成できませんでした");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const layers = ensureCompositeImageLayers(item)
      .filter(layer => layer.visible !== false && layer.fileName)
      .slice()
      .sort((a, b) => {
        const pa = Number(a.priority || 0);
        const pb = Number(b.priority || 0);
        if (pa !== pb) return pa - pb;
        return 0;
      });
    for (const layer of layers) {
      const asset = findProjectImage(layer);
      const src = layer.previewSrc || asset?.url || "";
      if (!src) continue;
      const img = await loadImageElement(src);
      ctx.save();
      ctx.globalAlpha = clamp(Number(layer.opacity ?? 255) / 255, 0, 1);
      ctx.globalCompositeOperation = canvasBlendModeForCompositeLayer(layer.blendMode);
      ctx.drawImage(
        img,
        Math.round(Number(layer.x || 0) - rect.minX),
        Math.round(Number(layer.y || 0) - rect.minY),
        Math.max(1, Math.round(Number(layer.width || layer.previewNaturalWidth || img.naturalWidth || 96))),
        Math.max(1, Math.round(Number(layer.height || layer.previewNaturalHeight || img.naturalHeight || 64)))
      );
      ctx.restore();
    }
    return { canvas, rect };
  }

  async function exportCompositeImagePng(item) {
    const win = selectedWindow() && selectedItem() === item ? selectedWindow() : findWindowByItemId(item?.id);
    if (!item || item.type !== "compositeImage") {
      showToast("統合画像パーツを選択してください");
      return false;
    }
    if (!projectAssets.loaded || !projectAssets.directoryHandle) {
      showToast("先にツクールプロジェクトを読み込んでください");
      return false;
    }
    const ok = await ensureDirectoryWritePermission(projectAssets.directoryHandle);
    if (!ok) {
      showToast("プロジェクトフォルダへ書き込む権限がありません");
      return false;
    }
    const visibleLayers = ensureCompositeImageLayers(item).filter(layer => layer.visible !== false && layer.fileName);
    if (visibleLayers.length <= 0) {
      showToast("書き出す表示中レイヤーがありません");
      return false;
    }
    const folder = `pictures/${COMPOSITE_EXPORT_ROOT_FOLDER}`;
    const fileName = compositeExportFileName(item, win);
    const targetDir = await getOrCreateNestedDirectoryHandle(projectAssets.directoryHandle, ["img", "pictures", COMPOSITE_EXPORT_ROOT_FOLDER]);
    const { canvas, rect } = await renderCompositeImageToCanvas(item);
    const blob = await canvasToPngBlob(canvas);
    const handle = await targetDir.getFileHandle(`${fileName}.png`, { create: true });
    await writeBlobToFileHandle(handle, blob);
    await refreshProjectAssetsQuietly();
    const ref = findProjectImage({ folder, fileName });
    runStateMutation("統合画像PNG書き出し設定", () => {
      item.bakedImage = {
        folder,
        fileName,
        width: canvas.width,
        height: canvas.height,
        offsetX: rect.minX,
        offsetY: rect.minY,
        exportedAt: new Date().toISOString(),
        layerCount: visibleLayers.length,
        previewSrc: ref?.url || "",
        previewName: `${folder}/${fileName}`,
        exportBaseName: compositeExportBaseName(item, win),
        exportPresetName: compositeExportPresetName(item)
      };
    });
    showToast(`MZ用PNGを書き出しました: img/${folder}/${fileName}.png`);
    debugLog("info", "統合画像をMZ用PNGとして書き出しました。", {
      folder,
      fileName,
      width: canvas.width,
      height: canvas.height,
      offsetX: rect.minX,
      offsetY: rect.minY,
      layerCount: visibleLayers.length
    });
    return true;
  }

  async function exportCompositePresetPng(item, preset) {
    if (!item || item.type !== "compositeImage" || !preset) return null;
    const win = findWindowByItemId(item.id);
    const oldBase = item.exportBaseName;
    const oldPreset = item.exportPresetName;
    const oldLayers = cloneForHistory(item.layers || []);
    const oldWidth = item.width;
    const oldHeight = item.height;
    const oldOpacity = item.opacity;
    const oldScaleXPercent = item.scaleXPercent;
    const oldScaleYPercent = item.scaleYPercent;
    const oldScaleX = item.scaleX;
    const oldScaleY = item.scaleY;
    item.exportBaseName = String(preset.exportBaseName || item.exportBaseName || "");
    item.exportPresetName = String(preset.exportPresetName || preset.id || "");
    item.layers = cloneForHistory(preset.layers || []);
    item.width = Math.max(1, Number(preset.picture?.width || item.width || 96));
    item.height = Math.max(1, Number(preset.picture?.height || item.height || 64));
    item.opacity = clamp(Number(preset.picture?.opacity ?? item.opacity ?? 255), 0, 255);
    item.scaleXPercent = Math.max(1, Number(preset.picture?.scaleXPercent || item.scaleXPercent || 100));
    item.scaleYPercent = Math.max(1, Number(preset.picture?.scaleYPercent || item.scaleYPercent || 100));
    item.scaleX = Math.round((item.scaleXPercent / 100) * 10000) / 10000;
    item.scaleY = Math.round((item.scaleYPercent / 100) * 10000) / 10000;
    try {
      const ok = await exportCompositeImagePng(item);
      if (!ok) return null;
      const baked = cloneForHistory(item.bakedImage || null);
      runStateMutation("統合画像プリセットPNG書き出し", () => {
        const currentItem = (findWindowByItemId(item.id)?.items || []).find(entry => entry.id === item.id) || item;
        const currentPreset = compositePresetById(currentItem, preset.id);
        if (currentPreset && baked) currentPreset.exportedImage = baked;
      });
      return baked;
    } finally {
      item.exportBaseName = oldBase;
      item.exportPresetName = oldPreset;
      item.layers = oldLayers;
      item.width = oldWidth;
      item.height = oldHeight;
      item.opacity = oldOpacity;
      item.scaleXPercent = oldScaleXPercent;
      item.scaleYPercent = oldScaleYPercent;
      item.scaleX = oldScaleX;
      item.scaleY = oldScaleY;
      if (win) {
        const actual = (win.items || []).find(entry => entry.id === item.id);
        if (actual && actual !== item) {
          actual.exportBaseName = oldBase;
          actual.exportPresetName = oldPreset;
          actual.layers = oldLayers;
          actual.width = oldWidth;
          actual.height = oldHeight;
          actual.opacity = oldOpacity;
          actual.scaleXPercent = oldScaleXPercent;
          actual.scaleYPercent = oldScaleYPercent;
          actual.scaleX = oldScaleX;
          actual.scaleY = oldScaleY;
        }
      }
      render();
    }
  }

  function compositePresetMzScript(item, preset) {
    const win = findWindowByItemId(item.id);
    const folder = preset.exportedImage?.folder || `pictures/${COMPOSITE_EXPORT_ROOT_FOLDER}`;
    const fileName = preset.exportedImage?.fileName || compositeExportFileName(Object.assign({}, item, {
      exportBaseName: preset.exportBaseName || item.exportBaseName || "",
      exportPresetName: preset.exportPresetName || preset.id || ""
    }), win);
    const target = `item|${state.layoutId}|${win?.id || ""}|${item.id}`;
    const picture = preset.picture || {};
    const lines = [];
    lines.push(`PluginManager.callCommand(this, "DB_UIComposer_CommandCatalog", "SetTargetImageByName", ${JSON.stringify({ target, folder, imageName: fileName })});`);
    lines.push(`PluginManager.callCommand(this, "DB_UIComposer", "SetItemPosition", ${JSON.stringify({ layoutId: state.layoutId, windowId: win?.id || "", itemId: item.id, x: String(Number(picture.x || 0)), y: String(Number(picture.y || 0)) })});`);
    lines.push(`PluginManager.callCommand(this, "DB_UIComposer", "SetItemScale", ${JSON.stringify({ layoutId: state.layoutId, windowId: win?.id || "", itemId: item.id, scaleXPercent: String(Math.max(1, Number(picture.scaleXPercent || 100))), scaleYPercent: String(Math.max(1, Number(picture.scaleYPercent || 100))) })});`);
    lines.push(`PluginManager.callCommand(this, "DB_UIComposer", "SetItemOpacity", ${JSON.stringify({ layoutId: state.layoutId, windowId: win?.id || "", itemId: item.id, opacity: String(clamp(Number(picture.opacity ?? 255), 0, 255)) })});`);
    lines.push(`PluginManager.callCommand(this, "DB_UIComposer", "SetItemZOrder", ${JSON.stringify({ layoutId: state.layoutId, windowId: win?.id || "", itemId: item.id, zOrder: String(Number(picture.zOrder || 0)) })});`);
    lines.push(`PluginManager.callCommand(this, "DB_UIComposer", "SetItemVisible", ${JSON.stringify({ layoutId: state.layoutId, windowId: win?.id || "", itemId: item.id, visible: String(picture.visible !== false) })});`);
    return lines.join("\n");
  }

  let compositePresetManagerWindow = null;

  function selectedCompositeImageTarget() {
    const win = selectedWindow();
    const item = selectedItem();
    if (!win || !item || item.type !== "compositeImage") return null;
    return { win, item };
  }


  function allCompositeImageTargets() {
    const targets = [];
    for (const win of state.windows || []) {
      for (const item of win.items || []) {
        if (item && item.type === "compositeImage") targets.push({ win, item });
      }
    }
    return targets;
  }

  function activeCompositeImageTargets() {
    return allCompositeImageTargets().filter(target => target?.item?.psdPresetLibraryDisabled !== true);
  }

  function refreshCompositePresetLibrariesForAllItems() {
    for (const target of activeCompositeImageTargets()) ensureCompositeImagePresets(target.item);
    return ensureCompositePresetLibraries();
  }

  function findCompositePresetTargetByLibraryKey(key) {
    refreshCompositePresetLibrariesForAllItems();
    const wanted = String(key || "");
    return activeCompositeImageTargets().find(target => compositePresetLibraryKey(target.item) === wanted) || null;
  }

  function compositePresetLibraryOptions() {
    refreshCompositePresetLibrariesForAllItems();
    const entries = new Map();
    entries.set("", { key: "", value: "", label: "（PSDなし）", presetCount: 0, itemRef: "", windowId: "", itemId: "", sourcePath: "", fromProjectPsdFolder: false, missingSource: false, noPsd: true });
    for (const psd of collectProjectPsdFileEntries()) {
      const key = String(psd.key || "");
      entries.set(key, {
        key,
        value: key,
        label: String(psd.label || psd.sourcePath || key || "PSD"),
        presetCount: 0,
        itemRef: "",
        windowId: "",
        itemId: "",
        sourcePath: psd.sourcePath || "",
        fromProjectPsdFolder: true,
        missingSource: false
      });
    }
    for (const library of ensureCompositePresetLibraries()) {
      const target = findCompositePresetTargetByLibraryKey(library.key);
      const key = String(library.key || "");
      const psdFile = projectPsdFileEntryByKey(key);
      entries.set(key, Object.assign(entries.get(key) || {}, {
        key,
        value: key,
        label: String(library.label || psdFile?.label || library.key || "PSD"),
        presetCount: Array.isArray(library.presets) ? library.presets.length : 0,
        itemRef: target ? compositePresetTargetRef(target.win, target.item) : "",
        windowId: target?.win?.id || "",
        itemId: target?.item?.id || "",
        sourcePath: psdFile?.sourcePath || "",
        fromProjectPsdFolder: !!psdFile,
        missingSource: key.startsWith("psdfile:") && !psdFile
      }));
    }
    return Array.from(entries.values()).sort((a, b) => {
      if (!a.value) return -1;
      if (!b.value) return 1;
      return String(a.label || "").localeCompare(String(b.label || ""));
    });
  }

  function focusCompositePresetManagerWindow() {
    let didFocus = false;
    try {
      if (window.DB_UIComposerElectron?.focusCompositePresetManagerWindow) {
        window.DB_UIComposerElectron.focusCompositePresetManagerWindow();
        didFocus = true;
      }
    } catch (error) {
      console.warn("[DB_UIComposer] native preset manager focus failed", error);
    }
    try {
      if (compositePresetManagerWindow && !compositePresetManagerWindow.closed) {
        compositePresetManagerWindow.focus();
        compositePresetManagerWindow.postMessage({ type: "DB_UIComposer_CompositePresetManagerFocus" }, "*");
        // Electron/Chromium環境では1回のfocusで前面化しないことがあるため、少し遅らせて再度前面化します。
        setTimeout(() => {
          try { compositePresetManagerWindow.focus(); } catch (_) {}
          try { window.DB_UIComposerElectron?.focusCompositePresetManagerWindow?.(); } catch (_) {}
        }, 60);
        didFocus = true;
      }
    } catch (error) {
      console.warn("[DB_UIComposer] preset manager focus failed", error);
    }
    return didFocus;
  }

  function focusCompositePresetInsertWindow() {
    let didFocus = false;
    try {
      if (window.DB_UIComposerElectron?.focusCompositePresetInsertWindow) {
        window.DB_UIComposerElectron.focusCompositePresetInsertWindow();
        didFocus = true;
      }
    } catch (error) {
      console.warn("[DB_UIComposer] native preset insert focus failed", error);
    }
    try {
      if (compositePresetInsertWindow && !compositePresetInsertWindow.closed) {
        compositePresetInsertWindow.focus();
        compositePresetInsertWindow.postMessage({ type: "DB_UIComposer_CompositePresetInsertFocus" }, "*");
        setTimeout(() => {
          try { compositePresetInsertWindow.focus(); } catch (_) {}
          try { window.DB_UIComposerElectron?.focusCompositePresetInsertWindow?.(); } catch (_) {}
        }, 60);
        didFocus = true;
      }
    } catch (error) {
      console.warn("[DB_UIComposer] preset insert focus failed", error);
    }
    return didFocus;
  }

  async function openCompositePresetManager(item = null) {
    // 新仕様: 統合画像プリセット管理はメイン上の統合画像パーツに依存しません。
    // ここでは選択中パーツや既存パーツを推定せず、PSDライブラリ管理画面として開きます。
    if (compositePresetManagerWindow && !compositePresetManagerWindow.closed) {
      focusCompositePresetManagerWindow();
      return;
    }
    const url = "about:blank";
    compositePresetManagerWindow = window.open(url, "DB_UIComposer_CompositePresetManager", "width=1320,height=860,menubar=no,toolbar=no,location=no,status=no");
    if (!compositePresetManagerWindow) {
      alert("別ウィンドウを開けませんでした。ポップアップブロックを確認してください。");
      return;
    }
    compositePresetManagerWindow.document.open();
    compositePresetManagerWindow.document.write(buildCompositePresetManagerHtml(""));
    compositePresetManagerWindow.document.close();
    focusCompositePresetManagerWindow();
  }


  function compositePresetManagerModel(targetRef) {
    const target = compositePresetTargetFromRef(targetRef);
    if (!target || target.item?.psdPresetLibraryDisabled === true) {
      return JSON.parse(JSON.stringify({
        layoutId: state.layoutId,
        windowId: "",
        itemId: "",
        itemRef: "",
        itemName: "",
        psdKey: "",
        psdLabel: "",
        exportAutoBaseName: "",
        selectedPresetId: "",
        presets: [],
        currentLayers: [],
        currentPicture: { x: 0, y: 0, width: 96, height: 64, scaleXPercent: 100, scaleYPercent: 100, opacity: 255, zOrder: 0, visible: true },
        noPsd: true
      }));
    }
    const { win, item } = target;
    ensureCompositeImagePresets(item);
    const library = ensureCompositePresetLibrary(item);
    const selectedPresetId = item.selectedPresetId || item.compositePresets[0]?.id || "";
    return JSON.parse(JSON.stringify({
      layoutId: state.layoutId,
      windowId: win?.id || "",
      itemId: item.id,
      itemRef: compositePresetTargetRef(win, item),
      itemName: itemDisplayName(item) || item.id,
      psdKey: compositePresetLibraryKey(item),
      psdLabel: compositePresetLibraryLabel(item),
      exportAutoBaseName: compositeExportAutoBaseName(item, win),
      selectedPresetId: library?.selectedPresetId || selectedPresetId,
      presets: item.compositePresets,
      currentLayers: compositePresetLayerSnapshot(item),
      currentPicture: compositePresetPictureSnapshot(item),
      noPsd: false
    }));
  }

  function compositePresetManagerMutate(targetRef, label, callback) {
    let result = null;
    runStateMutation(label, () => {
      const target = compositePresetTargetFromRef(targetRef);
      if (!target) return;
      const { win, item } = target;
      ensureCompositeImagePresets(item);
      result = callback(item, win);
      ensureCompositeImagePresets(item);
      syncCompositePresetLibraryFromItem(item);
    });
    return result;
  }

  async function importProjectPsdFileByKey(psdKey) {
    const entry = projectPsdFileEntryByKey(psdKey);
    if (!entry) return { ok: false, message: "PSDフォルダ内のPSDファイルが見つかりません。PSDフォルダ更新、またはPSDファイル再指定を行ってください。" };
    if (!projectAssets.loaded || !projectAssets.directoryHandle) return { ok: false, message: "先にツクールプロジェクトを読み込んでください。" };
    const ok = await ensureDirectoryWritePermission(projectAssets.directoryHandle);
    if (!ok) return { ok: false, message: "プロジェクトフォルダへ書き込む権限がありません。" };
    await importPsdAsComposite(entry.file, { sourcePath: entry.sourcePath });
    const target = findCompositePresetTargetByLibraryKey(psdKey) || selectedCompositeImageTarget();
    return target ? { ok: true, itemRef: compositePresetTargetRef(target.win, target.item), message: `PSDを読み込みました: ${entry.label || entry.sourcePath}` } : { ok: false, message: "PSDを読み込みましたが、統合画像パーツを取得できませんでした。" };
  }

  function compositePresetManagerModelForMissingPsdKey(key) {
    const psdFile = projectPsdFileEntryByKey(key);
    const library = ensureCompositePresetLibraries().find(entry => String(entry.key || "") === String(key || "")) || null;
    const presets = Array.isArray(library?.presets) ? library.presets : [];
    return JSON.parse(JSON.stringify({
      layoutId: state.layoutId,
      windowId: "",
      itemId: "",
      itemRef: "",
      itemName: "",
      psdKey: String(key || ""),
      psdLabel: String(library?.label || psdFile?.label || key || ""),
      exportAutoBaseName: sanitizeImportName((psdFile?.sourcePath || library?.label || key || "psd").replace(/\.psd$/i, ""), "psd"),
      selectedPresetId: String(library?.selectedPresetId || presets[0]?.id || ""),
      presets,
      currentLayers: [],
      currentPicture: { x: 0, y: 0, width: 96, height: 64, scaleXPercent: 100, scaleYPercent: 100, opacity: 255, zOrder: 0, visible: true },
      noPsd: false,
      missingPsdTarget: true
    }));
  }

  function libraryKeyFromProjectPsdEntry(entry) {
    return String(entry?.key || psdFileKeyFromPath(entry?.sourcePath || entry?.path || "") || "");
  }

  function registeredCompositePresetLibraries() {
    return ensureCompositePresetLibraries().filter(lib => String(lib.key || ""));
  }

  function compositePresetLibraryByKey(key) {
    const wanted = String(key || "");
    return registeredCompositePresetLibraries().find(lib => String(lib.key || "") === wanted) || null;
  }

  function compositePresetDefaultPictureFromLayers(layers) {
    const list = Array.isArray(layers) ? layers : [];
    let maxX = 96;
    let maxY = 64;
    for (const layer of list) {
      if (!layer) continue;
      maxX = Math.max(maxX, Number(layer.x || 0) + Math.max(1, Number(layer.width || layer.previewNaturalWidth || 96)));
      maxY = Math.max(maxY, Number(layer.y || 0) + Math.max(1, Number(layer.height || layer.previewNaturalHeight || 64)));
    }
    return { x: 0, y: 0, width: Math.max(1, Math.round(maxX)), height: Math.max(1, Math.round(maxY)), scaleXPercent: 100, scaleYPercent: 100, opacity: 255, zOrder: 0, visible: true };
  }

  function normalizeLibraryLayer(layer, index = 0) {
    const base = createDefaultCompositeImageLayer(index);
    const merged = Object.assign(base, layer || {});
    merged.id = safeId(merged.id || merged.layerId || merged.name || `layer${index + 1}`, `layer${index + 1}`);
    merged.name = String(merged.name || merged.id || `レイヤー${index + 1}`);
    merged.folder = normalizeImageFolder(merged.folder || "pictures") || "pictures";
    merged.fileName = stripImageExtension(merged.fileName || "");
    merged.previewSrc = String(merged.previewSrc || "");
    merged.previewName = String(merged.previewName || (merged.fileName ? `${merged.folder}/${merged.fileName}` : ""));
    if (!merged.previewSrc && merged.fileName) {
      const ref = findProjectImage({ folder: merged.folder, fileName: merged.fileName });
      if (ref?.url) merged.previewSrc = ref.url;
    }
    merged.previewNaturalWidth = Math.max(0, Number(merged.previewNaturalWidth || merged.width || 0));
    merged.previewNaturalHeight = Math.max(0, Number(merged.previewNaturalHeight || merged.height || 0));
    merged.x = Number(merged.x || 0);
    merged.y = Number(merged.y || 0);
    merged.width = Math.max(1, Number(merged.width || merged.previewNaturalWidth || 96));
    merged.height = Math.max(1, Number(merged.height || merged.previewNaturalHeight || 64));
    merged.opacity = clamp(Number(merged.opacity ?? 255), 0, 255);
    merged.priority = Math.max(1, Number(merged.priority || (index + 1)));
    merged.blendMode = ["normal", "add", "multiply", "screen"].includes(String(merged.blendMode || "normal")) ? String(merged.blendMode || "normal") : "normal";
    merged.visible = merged.visible !== false;
    merged.assetKey = String(merged.assetKey || compositeLayerAssetKey(merged));
    return merged;
  }

  function normalizeLibraryPreset(library, preset, index = 0) {
    const id = safeId(sanitizeImportName(preset?.id || `preset_${index + 1}`, `preset_${index + 1}`), `preset_${index + 1}`);
    const baseLayers = Array.isArray(preset?.layers) && preset.layers.length ? preset.layers : (library?.layerAssets || []);
    const layers = baseLayers.map((layer, layerIndex) => normalizeLibraryLayer(layer, layerIndex));
    const basePicture = compositePresetDefaultPictureFromLayers(layers);
    const picture = Object.assign({}, basePicture, preset?.picture || {});
    picture.x = Number(picture.x || 0);
    picture.y = Number(picture.y || 0);
    picture.width = Math.max(1, Number(picture.width || basePicture.width || 96));
    picture.height = Math.max(1, Number(picture.height || basePicture.height || 64));
    picture.scaleXPercent = Math.max(1, Number(picture.scaleXPercent || 100));
    picture.scaleYPercent = Math.max(1, Number(picture.scaleYPercent || 100));
    picture.opacity = clamp(Number(picture.opacity ?? 255), 0, 255);
    picture.zOrder = Number(picture.zOrder || 0);
    picture.visible = picture.visible !== false;
    return {
      id,
      label: String(preset?.label || ""),
      exportBaseName: sanitizeImportName(preset?.exportBaseName || library?.exportAutoBaseName || "", ""),
      exportPresetName: sanitizeImportName(preset?.exportPresetName || id, id),
      presetMode: ["slot", "layer"].includes(String(preset?.presetMode || "")) ? String(preset.presetMode) : "layer",
      slotSelections: preset?.slotSelections && typeof preset.slotSelections === "object" ? cloneForHistory(preset.slotSelections) : {},
      layers,
      picture,
      exportedImage: preset?.exportedImage || null
    };
  }

  function normalizeCompositionOption(option, index = 0) {
    const raw = option && typeof option === "object" ? option : {};
    const fallback = `option_${index + 1}`;
    const id = safeId(sanitizeImportName(raw.id || fallback, fallback), fallback);
    const layers = Array.isArray(raw.layers) ? raw.layers.map(layerId => String(layerId || "").trim()).filter(Boolean) : [];
    return {
      id,
      name: String(raw.name || raw.label || id),
      layers: Array.from(new Set(layers))
    };
  }

  function normalizeCompositionSlot(slot, index = 0) {
    const raw = slot && typeof slot === "object" ? slot : {};
    const fallback = `slot_${index + 1}`;
    const id = safeId(sanitizeImportName(raw.id || fallback, fallback), fallback);
    return {
      id,
      name: String(raw.name || raw.label || id),
      multiSelect: !!raw.multiSelect,
      order: Number.isFinite(Number(raw.order)) ? Number(raw.order) : index,
      gameVariableId: Math.max(0, Number(raw.gameVariableId || raw.variableId || 0)),
      autoVariableSync: !!raw.autoVariableSync,
      options: (Array.isArray(raw.options) ? raw.options : []).map((option, optionIndex) => normalizeCompositionOption(option, optionIndex))
    };
  }

  function normalizeCompositionSlots(slots) {
    return (Array.isArray(slots) ? slots : []).map((slot, index) => normalizeCompositionSlot(slot, index));
  }

  function normalizeCompositePresetLibrary(library) {
    const lib = Object.assign({ key: "", label: "", sourcePath: "", assetFolder: "", folderSegments: [], layerAssets: [], presets: [], selectedPresetId: "", exportAutoBaseName: "", compositionSlots: [] }, library || {});
    lib.key = String(lib.key || "");
    lib.label = String(lib.label || lib.sourcePath || lib.key || "PSD");
    lib.sourcePath = String(lib.sourcePath || "");
    lib.assetFolder = normalizeImageFolder(lib.assetFolder || "pictures") || "pictures";
    lib.folderSegments = Array.isArray(lib.folderSegments) ? lib.folderSegments : [];
    lib.exportAutoBaseName = sanitizeImportName(lib.exportAutoBaseName || lib.label.replace(/\.psd$/i, ""), "psd");
    lib.layerAssets = (Array.isArray(lib.layerAssets) ? lib.layerAssets : []).map((layer, index) => normalizeLibraryLayer(layer, index));
    lib.presets = (Array.isArray(lib.presets) ? lib.presets : []).map((preset, index) => normalizeLibraryPreset(lib, preset, index));
    lib.compositionSlots = normalizeCompositionSlots(lib.compositionSlots);
    if (lib.selectedPresetId && !lib.presets.some(p => p.id === lib.selectedPresetId)) lib.selectedPresetId = lib.presets[0]?.id || "";
    return lib;
  }

  function upsertCompositePresetLibrary(library, overwrite = false) {
    const libs = ensureCompositePresetLibraries();
    const normalized = normalizeCompositePresetLibrary(library);
    const index = libs.findIndex(entry => String(entry.key || "") === normalized.key);
    if (index >= 0) {
      const prev = normalizeCompositePresetLibrary(libs[index]);
      libs[index] = normalizeCompositePresetLibrary(Object.assign({}, prev, normalized, {
        presets: overwrite ? normalized.presets : (prev.presets?.length ? prev.presets : normalized.presets),
        selectedPresetId: overwrite ? normalized.selectedPresetId : (prev.selectedPresetId || normalized.selectedPresetId),
        compositionSlots: overwrite ? normalized.compositionSlots : (normalized.compositionSlots?.length ? normalized.compositionSlots : (prev.compositionSlots || []))
      }));
      return libs[index];
    }
    libs.push(normalized);
    return normalized;
  }

  function compositeManagerAvailablePsdEntries() {
    const registered = new Set(registeredCompositePresetLibraries().map(lib => String(lib.key || "")));
    return collectProjectPsdFileEntries().map(entry => ({
      key: String(entry.key || ""),
      label: String(entry.label || entry.sourcePath || entry.key || "PSD"),
      sourcePath: String(entry.sourcePath || ""),
      registered: registered.has(String(entry.key || "")),
      size: Number(entry.size || 0),
      lastModified: Number(entry.lastModified || 0)
    }));
  }

  function compositeManagerRegisteredPsdEntries() {
    return registeredCompositePresetLibraries().map(lib => {
      const normalized = normalizeCompositePresetLibrary(lib);
      const fileEntry = projectPsdFileEntryByKey(normalized.key);
      return {
        key: normalized.key,
        label: normalized.label,
        sourcePath: normalized.sourcePath,
        presetCount: normalized.presets.length,
        layerCount: normalized.layerAssets.length,
        slotCount: normalized.compositionSlots.length,
        missingSource: normalized.key.startsWith("psdfile:") && !fileEntry,
        fileAvailable: !!fileEntry
      };
    }).sort((a, b) => String(a.label || "").localeCompare(String(b.label || "")));
  }

  function compositeManagerState(selectedKey = "") {
    const key = String(selectedKey || "");
    const registered = compositeManagerRegisteredPsdEntries();
    const activeKey = key && registered.some(entry => entry.key === key) ? key : (registered[0]?.key || "");
    return cloneForHistory({
      layoutId: state.layoutId,
      available: compositeManagerAvailablePsdEntries(),
      registered,
      selectedKey: activeKey,
      projectLoaded: !!projectAssets.loaded,
      projectName: projectAssets.name || ""
    });
  }

  function compositeLibraryModel(key) {
    const lib = compositePresetLibraryByKey(key);
    if (!lib) {
      return cloneForHistory({ key: "", label: "", sourcePath: "", exportAutoBaseName: "", presets: [], selectedPresetId: "", layerAssets: [], currentPicture: compositePresetDefaultPictureFromLayers([]), missing: true });
    }
    const normalized = normalizeCompositePresetLibrary(lib);
    return cloneForHistory(Object.assign({}, normalized, { currentPicture: compositePresetDefaultPictureFromLayers(normalized.layerAssets), missing: false }));
  }

  function fakeCompositeItemFromLibraryPreset(library, preset) {
    const normalizedLibrary = normalizeCompositePresetLibrary(library);
    const normalizedPreset = normalizeLibraryPreset(normalizedLibrary, preset || {}, 0);
    const picture = normalizedPreset.picture || compositePresetDefaultPictureFromLayers(normalizedPreset.layers);
    const item = Object.assign({ type: "compositeImage", id: "libraryPreview", x: 0, y: 0, zOrder: 0, visible: true, allowOutsideWindow: true }, createDefaultCompositeImageItem());
    item.width = Math.max(1, Number(picture.width || 96));
    item.height = Math.max(1, Number(picture.height || 64));
    item.opacity = clamp(Number(picture.opacity ?? 255), 0, 255);
    item.scaleXPercent = Math.max(1, Number(picture.scaleXPercent || 100));
    item.scaleYPercent = Math.max(1, Number(picture.scaleYPercent || 100));
    item.scaleX = Math.round((item.scaleXPercent / 100) * 10000) / 10000;
    item.scaleY = Math.round((item.scaleYPercent / 100) * 10000) / 10000;
    item.layers = cloneForHistory(normalizedPreset.layers || []);
    return item;
  }

  function libraryExportFileName(library, preset) {
    const normalized = normalizeCompositePresetLibrary(library);
    const p = normalizeLibraryPreset(normalized, preset || {}, 0);
    const base = sanitizeImportName(p.exportBaseName || normalized.exportAutoBaseName || normalized.label.replace(/\.psd$/i, ""), "psd");
    const diff = sanitizeImportName(p.exportPresetName || p.id || "preset", "preset");
    return diff ? `${base}_${diff}` : base;
  }

  async function importPsdEntryToLibrary(entry, overwrite = false) {
    if (!entry || !entry.file) throw new Error("PSDファイルが見つかりません。");
    if (!projectAssets.loaded || !projectAssets.directoryHandle) throw new Error("先にツクールプロジェクトを読み込んでください。");
    const ok = await ensureDirectoryWritePermission(projectAssets.directoryHandle);
    if (!ok) throw new Error("プロジェクトフォルダへ書き込む権限がありません。");
    if (!supportsPsdImport()) throw new Error("PSD読込ライブラリの初期化に失敗しました。vendor/ag-psd.bundle.js の配置を確認してください。");

    const file = entry.file;
    const sourcePath = normalizeProjectPsdPath(entry.sourcePath || entry.path || file.webkitRelativePath || file.name || "");
    const folderInfo = psdImportFolderInfo(file.name || "imported.psd", sourcePath);
    const sourceMeta = { sourceFileName: String(file.name || ""), sourceSize: Number(file.size || 0), sourceLastModified: Number(file.lastModified || 0), sourcePath: folderInfo.sourcePath || sourcePath || "" };
    let importedLayers = [];
    const cache = await readPsdImportCache(projectAssets.directoryHandle, folderInfo);
    if (isSamePsdImportSource(cache, file, folderInfo)) {
      importedLayers = cache.layers.map((layer, index) => Object.assign({}, layer, {
        layerId: layer.layerId || safeId(layer.name || `layer${index + 1}`, `layer${index + 1}`),
        name: String(layer.name || `レイヤー${index + 1}`),
        fileName: String(layer.fileName || ""),
        left: Number(layer.left || 0),
        top: Number(layer.top || 0),
        width: Math.max(1, Number(layer.width || 1)),
        height: Math.max(1, Number(layer.height || 1)),
        opacity: normalizePsdOpacity(layer.opacity ?? 255),
        priority: Math.max(1, Number(layer.priority || (index + 1))),
        blendMode: normalizePsdBlendMode(layer.blendMode || "normal"),
        visible: layer.visible !== false
      }));
    } else {
      let psd = null;
      try {
        const buffer = await file.arrayBuffer();
        psd = window.agPsd.readPsd(buffer);
      } catch (e) {
        throw new Error(`PSDの解析に失敗しました: ${e?.message || String(e)}`);
      }
      const sourceLayers = [];
      collectPsdLeafLayers(psd.children || [], sourceLayers);
      if (!sourceLayers.length) throw new Error("書き出し可能な通常画像レイヤーが見つかりませんでした。");
      const targetDir = await getOrCreateNestedDirectoryHandle(projectAssets.directoryHandle, folderInfo.folderSegments);
      const usedNames = new Set();
      for (let index = 0; index < sourceLayers.length; index += 1) {
        const layer = sourceLayers[index];
        const baseName = sanitizeImportName(layer.pathNames.join("_") || layer.name || `layer${index + 1}`, `layer${index + 1}`);
        let fileName = baseName;
        let serial = 1;
        while (usedNames.has(fileName.toLowerCase())) fileName = `${baseName}_${++serial}`;
        usedNames.add(fileName.toLowerCase());
        const fileHandle = await targetDir.getFileHandle(`${fileName}.png`, { create: true });
        const blob = await canvasToPngBlob(layer.canvas);
        await writeBlobToFileHandle(fileHandle, blob);
        importedLayers.push({
          layerId: safeId(layer.name || fileName, `layer${index + 1}`),
          name: layer.pathNames.join(" / ") || layer.name || `レイヤー${index + 1}`,
          fileName,
          left: Number(layer.left || 0),
          top: Number(layer.top || 0),
          width: Math.max(1, Number(layer.width || 1)),
          height: Math.max(1, Number(layer.height || 1)),
          opacity: normalizePsdOpacity(layer.opacity ?? 255),
          priority: index + 1,
          blendMode: normalizePsdBlendMode(layer.blendMode || "normal"),
          visible: layer.visible !== false
        });
      }
      const cacheData = {
        type: "DB_UIComposer_PsdImportCache",
        version: TOOL_VERSION,
        importedAt: new Date().toISOString(),
        assetFolder: folderInfo.assetFolder,
        source: { fileName: String(file.name || ""), size: Number(file.size || 0), lastModified: Number(file.lastModified || 0), sourcePath: folderInfo.sourcePath || sourcePath || "" },
        layers: importedLayers.map(layer => ({ layerId: layer.layerId, name: layer.name, fileName: layer.fileName, left: layer.left, top: layer.top, width: layer.width, height: layer.height, opacity: layer.opacity, priority: layer.priority, blendMode: layer.blendMode, visible: layer.visible !== false }))
      };
      const cacheHandle = await targetDir.getFileHandle(PSD_IMPORT_CACHE_FILE_NAME, { create: true });
      await writeTextToFileHandle(cacheHandle, JSON.stringify(cacheData, null, 2));
    }
    await refreshProjectAssetsQuietly();
    const minLeft = Math.min(...importedLayers.map(layer => Number(layer.left || 0)));
    const minTop = Math.min(...importedLayers.map(layer => Number(layer.top || 0)));
    const layerAssets = importedLayers.map((layer, index) => {
      const ref = findProjectImage({ folder: folderInfo.assetFolder, fileName: layer.fileName });
      return normalizeLibraryLayer({
        id: safeId(layer.layerId || layer.name || `layer${index + 1}`, `layer${index + 1}`),
        name: String(layer.name || layer.layerId || `レイヤー${index + 1}`),
        visible: layer.visible !== false,
        folder: folderInfo.assetFolder,
        fileName: String(layer.fileName || ""),
        previewSrc: ref?.url || "",
        previewName: `${folderInfo.assetFolder}/${layer.fileName}`,
        previewNaturalWidth: Math.max(1, Number(layer.width || 1)),
        previewNaturalHeight: Math.max(1, Number(layer.height || 1)),
        x: Math.round(Number(layer.left || 0) - minLeft),
        y: Math.round(Number(layer.top || 0) - minTop),
        width: Math.max(1, Math.round(Number(layer.width || 1))),
        height: Math.max(1, Math.round(Number(layer.height || 1))),
        opacity: normalizePsdOpacity(layer.opacity ?? 255),
        priority: Math.max(1, Number(layer.priority || (index + 1))),
        blendMode: normalizePsdBlendMode(layer.blendMode || "normal")
      }, index);
    });
    const key = entry.key || psdFileKeyFromPath(folderInfo.sourcePath || sourcePath);
    const label = psdFileLabelFromPath(folderInfo.sourcePath || sourcePath) || file.name || folderInfo.baseName;
    const library = upsertCompositePresetLibrary({
      key,
      label,
      sourcePath: folderInfo.sourcePath || sourcePath,
      sourceFileName: sourceMeta.sourceFileName,
      sourceSize: sourceMeta.sourceSize,
      sourceLastModified: sourceMeta.sourceLastModified,
      assetFolder: folderInfo.assetFolder,
      folderSegments: folderInfo.folderSegments,
      exportAutoBaseName: sanitizeImportName(label.replace(/\.psd$/i, ""), folderInfo.baseName || "psd"),
      importedAt: new Date().toISOString(),
      layerAssets,
      presets: overwrite ? [] : (compositePresetLibraryByKey(key)?.presets || []),
      selectedPresetId: overwrite ? "" : (compositePresetLibraryByKey(key)?.selectedPresetId || "")
    }, overwrite);
    debugLog("info", "PSDをプリセットライブラリへ登録しました。", { key, label, layerCount: layerAssets.length, assetFolder: folderInfo.assetFolder });
    return library;
  }
  function setupCompositePresetBridge() {
    window.DB_UIComposerPresetBridge = {
      getManagerState(selectedKey = "") {
        return compositeManagerState(selectedKey);
      },
      getLibraryModel(psdKey = "") {
        return compositeLibraryModel(psdKey);
      },
      async refreshProjectPsdFolder() {
        if (!projectAssets.loaded || !projectAssets.directoryHandle) {
          return { ok: false, permissionRequired: true, message: "プロジェクトフォルダの再指定が必要です。管理画面の『プロジェクトフォルダ再指定』からツクールのプロジェクトフォルダを選んでください。" };
        }
        const readOk = await ensureDirectoryPermission(projectAssets.directoryHandle);
        if (!readOk) {
          return { ok: false, permissionRequired: true, message: "プロジェクトフォルダの読込権限がありません。『プロジェクトフォルダ再指定』から選び直してください。" };
        }
        await refreshProjectAssetsQuietly();
        return { ok: true, count: projectAssets.psdFiles.size, message: `PSDフォルダを読み込みました（${projectAssets.psdFiles.size}件）` };
      },
      registerProjectPsdFiles(psdKeys = [], overwrite = false) {
        return (async () => {
          if (!projectAssets.loaded || !projectAssets.directoryHandle) {
            return { ok: false, permissionRequired: true, message: "PSD登録にはプロジェクトフォルダの読込・書込権限が必要です。『プロジェクトフォルダ再指定』からツクールのプロジェクトフォルダを選んでください。" };
          }
          const writeOk = await ensureDirectoryWritePermission(projectAssets.directoryHandle);
          if (!writeOk) {
            return { ok: false, permissionRequired: true, message: "プロジェクトフォルダへ書き込む権限がありません。『プロジェクトフォルダ再指定』から選び直してください。" };
          }
          const keys = Array.isArray(psdKeys) ? psdKeys.map(String).filter(Boolean) : [];
          if (!keys.length) return { ok: false, message: "登録するPSDを選択してください。" };
          const conflicts = keys.filter(key => !!compositePresetLibraryByKey(key));
          if (conflicts.length && !overwrite) return { ok: false, conflict: true, conflicts, message: `登録済みPSDと重複しています: ${conflicts.length}件` };
          const registered = [];
          for (const key of keys) {
            const entry = projectPsdFileEntryByKey(key);
            if (!entry) throw new Error(`PSDファイルが見つかりません: ${key}`);
            let lib = null;
            try {
              lib = await importPsdEntryToLibrary(entry, overwrite);
            } catch (e) {
              const message = e?.message || String(e);
              if (message.includes("権限") || message.includes("読み込んで")) return { ok: false, permissionRequired: true, message };
              throw e;
            }
            registered.push({ key: lib.key, label: lib.label, layerCount: lib.layerAssets?.length || 0 });
          }
          return { ok: true, registered, selectedKey: registered[0]?.key || "", message: `PSDを登録しました（${registered.length}件）` };
        })();
      },
      deletePsdLibrary(psdKey) {
        const key = String(psdKey || "");
        let ok = false;
        runStateMutation("PSDプリセット登録削除", () => {
          const libs = ensureCompositePresetLibraries();
          const index = libs.findIndex(lib => String(lib.key || "") === key);
          if (index >= 0) { libs.splice(index, 1); ok = true; }
        });
        return { ok, message: ok ? "PSD登録を削除しました。" : "PSD登録が見つかりませんでした。" };
      },
      saveCompositionSlots(psdKey, slots = []) {
        const key = String(psdKey || "");
        if (!key) return { ok: false, message: "PSDが選択されていません。" };
        const library = compositePresetLibraryByKey(key);
        if (!library) return { ok: false, message: "PSD登録が見つかりません。" };
        let result = null;
        runStateMutation("統合画像スロット設定保存", () => {
          const lib = normalizeCompositePresetLibrary(compositePresetLibraryByKey(key));
          lib.compositionSlots = normalizeCompositionSlots(slots);
          upsertCompositePresetLibrary(lib, true);
          result = { ok: true, slotCount: lib.compositionSlots.length, message: `スロット設定を保存しました（${lib.compositionSlots.length}件）` };
        });
        return result || { ok: false, message: "スロット設定を保存できませんでした。" };
      },
      saveDraft(psdKey, draft, options = {}) {
        const key = String(psdKey || "");
        const library = compositePresetLibraryByKey(key);
        if (!library) return { ok: false, message: "保存先PSDが選択されていません。先にPSDを登録・選択してください。" };
        let result = null;
        runStateMutation("統合画像プリセット保存", () => {
          const lib = normalizeCompositePresetLibrary(compositePresetLibraryByKey(key));
          const sourcePresetId = String(options?.sourcePresetId || "");
          const overwrite = !!options?.overwrite;
          const normalized = normalizeLibraryPreset(lib, draft || {}, lib.presets.length);
          const source = sourcePresetId ? lib.presets.find(p => p.id === sourcePresetId) : null;
          const duplicate = lib.presets.find(p => p.id === normalized.id && p !== source);
          if (duplicate && !overwrite) {
            result = { ok: false, conflict: true, presetId: duplicate.id, message: `名前ID「${normalized.id}」は既に存在します。上書きしますか？` };
            return;
          }
          const target = duplicate && overwrite ? duplicate : source;
          if (target) {
            target.id = normalized.id;
            target.label = normalized.label;
            target.exportBaseName = normalized.exportBaseName;
            target.exportPresetName = normalized.exportPresetName;
            target.presetMode = normalized.presetMode;
            target.slotSelections = normalized.slotSelections || {};
            target.layers = normalized.layers;
            target.picture = normalized.picture;
            target.exportedImage = null;
            lib.selectedPresetId = target.id;
            result = { ok: true, presetId: target.id, overwritten: true };
          } else {
            lib.presets.push(normalized);
            lib.selectedPresetId = normalized.id;
            result = { ok: true, presetId: normalized.id, overwritten: false };
          }
          upsertCompositePresetLibrary(lib, true);
        });
        return result || { ok: false, message: "保存できませんでした。" };
      },
      duplicatePreset(psdKey, presetId) {
        let result = "";
        runStateMutation("統合画像プリセット複製", () => {
          const lib = normalizeCompositePresetLibrary(compositePresetLibraryByKey(psdKey));
          const src = lib.presets.find(p => p.id === presetId);
          if (!src) return;
          const used = new Set(lib.presets.map(p => p.id));
          const base = `${src.id}_copy`;
          let id = base;
          let n = 2;
          while (used.has(id)) id = `${base}_${n++}`;
          const copy = cloneForHistory(src);
          copy.id = id;
          copy.exportPresetName = id;
          copy.exportedImage = null;
          lib.presets.push(copy);
          lib.selectedPresetId = id;
          upsertCompositePresetLibrary(lib, true);
          result = id;
        });
        return result;
      },
      deletePreset(psdKey, presetId) {
        let result = "";
        runStateMutation("統合画像プリセット削除", () => {
          const lib = normalizeCompositePresetLibrary(compositePresetLibraryByKey(psdKey));
          const index = lib.presets.findIndex(p => p.id === presetId);
          if (index >= 0) lib.presets.splice(index, 1);
          lib.selectedPresetId = lib.presets[Math.max(0, index - 1)]?.id || lib.presets[0]?.id || "";
          upsertCompositePresetLibrary(lib, true);
          result = lib.selectedPresetId;
        });
        return result;
      },
      previewLibraryDraftDataUrl(psdKey, draft) {
        return (async () => {
          const lib = compositePresetLibraryByKey(psdKey);
          if (!lib) return "";
          const preset = normalizeLibraryPreset(normalizeCompositePresetLibrary(lib), draft || {}, 0);
          const item = fakeCompositeItemFromLibraryPreset(lib, preset);
          const { canvas } = await renderCompositeImageToCanvas(item);
          return canvas.toDataURL("image/png");
        })();
      },
      expectedLibraryDraftFileName(psdKey, draft) {
        const lib = compositePresetLibraryByKey(psdKey);
        if (!lib) return "";
        return libraryExportFileName(lib, draft || {});
      },
      exportLibraryDraftPng(psdKey, draft) {
        return (async () => {
          const lib = compositePresetLibraryByKey(psdKey);
          if (!lib) return { ok: false, message: "PSD登録が見つかりません。" };
          if (!projectAssets.loaded || !projectAssets.directoryHandle) return { ok: false, permissionRequired: true, message: "PNG書き出しにはプロジェクトフォルダの書込権限が必要です。『プロジェクトフォルダ再指定』からツクールのプロジェクトフォルダを選んでください。" };
          const ok = await ensureDirectoryWritePermission(projectAssets.directoryHandle);
          if (!ok) return { ok: false, permissionRequired: true, message: "プロジェクトフォルダへ書き込む権限がありません。『プロジェクトフォルダ再指定』から選び直してください。" };
          const preset = normalizeLibraryPreset(normalizeCompositePresetLibrary(lib), draft || {}, 0);
          const item = fakeCompositeItemFromLibraryPreset(lib, preset);
          const { canvas, rect } = await renderCompositeImageToCanvas(item);
          const folder = `pictures/${COMPOSITE_EXPORT_ROOT_FOLDER}`;
          const fileName = libraryExportFileName(lib, preset);
          const targetDir = await getOrCreateNestedDirectoryHandle(projectAssets.directoryHandle, ["img", "pictures", COMPOSITE_EXPORT_ROOT_FOLDER]);
          const handle = await targetDir.getFileHandle(`${fileName}.png`, { create: true });
          await writeBlobToFileHandle(handle, await canvasToPngBlob(canvas));
          await refreshProjectAssetsQuietly();
          return { ok: true, folder, fileName, width: canvas.width, height: canvas.height, offsetX: rect.minX, offsetY: rect.minY, message: `PNGを書き出しました: img/${folder}/${fileName}.png` };
        })();
      },
      copyLibraryDraftMz(psdKey, draft) {
        const lib = compositePresetLibraryByKey(psdKey);
        if (!lib) return "";
        const preset = normalizeLibraryPreset(normalizeCompositePresetLibrary(lib), draft || {}, 0);
        const fileName = libraryExportFileName(lib, preset);
        const script = [
          "// DB_UIComposer 統合画像プリセット呼び出し",
          `// PSD: ${lib.key}`,
          `// 名前ID: ${preset.id}`,
          `// PNG: img/pictures/${COMPOSITE_EXPORT_ROOT_FOLDER}/${fileName}.png`,
          `PluginManager.callCommand(this, "DB_UIComposer_CommandCatalog", "SetCompositePresetByNameId", ${JSON.stringify({ layoutId: state.layoutId, psdKey: lib.key, nameId: preset.id, folder: `pictures/${COMPOSITE_EXPORT_ROOT_FOLDER}`, fileName })});`
        ].join("\n");
        copyText(script);
        return script;
      },
      async getProjectWriteStatus() {
        const handle = projectAssets.directoryHandle || null;
        const result = { loaded: !!projectAssets.loaded, hasDirectoryHandle: !!handle, directoryName: handle?.name || projectAssets.name || "", readGranted: false, writeGranted: false, permission: "none", message: "" };
        if (!handle) {
          result.message = "プロジェクトフォルダが未指定です。";
          return result;
        }
        try {
          if (typeof handle.queryPermission === "function") {
            const readStatus = await handle.queryPermission({ mode: "read" });
            const writeStatus = await handle.queryPermission({ mode: "readwrite" });
            result.permission = writeStatus || readStatus || "unknown";
            result.readGranted = readStatus === "granted" || writeStatus === "granted";
            result.writeGranted = writeStatus === "granted";
            result.message = result.writeGranted ? "プロジェクトフォルダの書込権限があります。" : "プロジェクトフォルダの書込権限がありません。";
            return result;
          }
          result.permission = "unsupported";
          result.readGranted = true;
          result.writeGranted = true;
          result.message = "この環境では権限確認APIがないため、許可済みとして扱います。";
          return result;
        } catch (e) {
          result.permission = e?.name || "error";
          result.message = e?.message || String(e);
          return result;
        }
      },
      async setProjectDirectoryHandleFromManager(handle) {
        if (!handle) return { ok: false, message: "プロジェクトフォルダが選択されていません。" };
        try {
          const writeOk = await ensureDirectoryWritePermission(handle);
          if (!writeOk) return { ok: false, permissionRequired: true, message: "プロジェクトフォルダの書込権限を取得できませんでした。" };
          await saveProjectDirectoryHandle(handle);
          await loadProjectDirectoryHandle(handle, { fromUserSelection: true, quiet: true });
          if (!projectAssets.loaded) return { ok: false, message: "プロジェクトフォルダを読み込めませんでした。選択したフォルダがツクールプロジェクト直下か確認してください。" };
          return { ok: true, message: `プロジェクトフォルダ「${handle.name || "Project"}」の読込・書込権限を取得しました。PSD件数: ${projectAssets.psdFiles?.size || 0}` };
        } catch (e) {
          return { ok: false, message: e?.message || String(e) };
        }
      }
    };
  }


  let compositePresetInsertWindow = null;
  let compositePresetInsertTargetItem = null;

  function compositePresetInsertChoices() {
    const choices = [];
    for (const rawLib of registeredCompositePresetLibraries()) {
      const lib = normalizeCompositePresetLibrary(rawLib);
      for (const preset of lib.presets || []) {
        choices.push({
          psdKey: lib.key,
          psdLabel: lib.label,
          sourcePath: lib.sourcePath || "",
          presetId: preset.id,
          presetLabel: preset.label || preset.id,
          fileName: libraryExportFileName(lib, preset),
          layerCount: Array.isArray(preset.layers) ? preset.layers.length : 0
        });
      }
    }
    return choices.sort((a, b) => (`${a.psdLabel}\n${a.presetId}`).localeCompare(`${b.psdLabel}\n${b.presetId}`));
  }

  async function compositePresetChoicePreviewDataUrl(choice) {
    const lib = compositePresetLibraryByKey(choice?.psdKey || "");
    if (!lib) return "";
    const normalized = normalizeCompositePresetLibrary(lib);
    const preset = normalized.presets.find(p => p.id === choice.presetId);
    if (!preset) return "";
    const item = fakeCompositeItemFromLibraryPreset(normalized, preset);
    const { canvas } = await renderCompositeImageToCanvas(item);
    return canvas.toDataURL("image/png");
  }

  function insertCompositePresetChoice(choice, targetItem = null) {
    const lib = compositePresetLibraryByKey(choice?.psdKey || "");
    if (!lib) {
      showToast("PSD登録が見つかりません");
      return false;
    }
    const normalized = normalizeCompositePresetLibrary(lib);
    const preset = normalized.presets.find(p => p.id === choice.presetId);
    if (!preset) {
      showToast("名前IDが見つかりません");
      return false;
    }
    if (targetItem && targetItem.type === "compositeImage") {
      runStateMutation("統合画像プリセット変更", () => {
        applyLibraryPresetToCompositeItem(targetItem, normalized, preset, { keepPlacement: true });
      });
      if (!preset.exportedImage?.fileName && projectAssets.loaded && projectAssets.directoryHandle) {
        void exportCompositePresetPng(targetItem, preset).catch(() => {});
      }
      showToast(`名前ID「${preset.id}」を適用しました`);
      return true;
    }
    if (targetItem && targetItem.type === "button") {
      const stateKey = targetItem.buttonStateEdit || "mouseOff";
      const fileName = libraryExportFileName(normalized, preset);
      runStateMutation("PSDボタン画像変更", () => {
        targetItem.buttonVisualMode = "psd";
        const def = ensureButtonImages(targetItem)[stateKey];
        Object.assign(def, {
          folder: `pictures/${COMPOSITE_EXPORT_ROOT_FOLDER}`,
          fileName,
          psdKey: normalized.key,
          psdLabel: normalized.label,
          presetId: preset.id,
          presetLabel: preset.label || preset.id,
          previewName: `${normalized.label || normalized.key} / ${preset.label || preset.id}`,
          opacity: 255
        });
      });
      compositePresetChoicePreviewDataUrl(choice).then(url => {
        const def = ensureButtonImages(targetItem)[stateKey];
        if (def.psdKey === normalized.key && def.presetId === preset.id) {
          def.previewSrc = url || def.previewSrc || "";
          render();
        }
      }).catch(() => {});
      showToast(`PSDボタンに名前ID「${preset.id}」を適用しました`);
      return true;
    }
    const win = requireWindow();
    const baseId = safeId(`preset_${preset.id}`, "presetImage");
    const item = Object.assign({
      type: "compositeImage",
      id: nextUniqueItemId(win, baseId),
      x: 16,
      y: 16,
      zOrder: 0,
      visible: true,
      allowOutsideWindow: true
    }, createDefaultCompositeImageItem());
    applyLibraryPresetToCompositeItem(item, normalized, preset, { keepPlacement: true });
    runStateMutation("統合画像プリセット挿入", () => {
      win.items = win.items || [];
      win.items.push(item);
      mode = "inside";
      selected = { kind: "item", windowId: win.id, itemId: item.id };
    });
    if (!preset.exportedImage?.fileName && projectAssets.loaded && projectAssets.directoryHandle) {
      void exportCompositePresetPng(item, preset).catch(() => {});
    }
    updateModeButtons();
    showToast(`名前ID「${preset.id}」を挿入しました`);
    return true;
  }

  function openCompositePresetInsertPicker(targetItem = null) {
    const initialChoices = compositePresetInsertChoices();
    if (!initialChoices.length) {
      showToast("登録済みのPSD/名前IDがありません。統合画像プリセット管理を開きます。");
      void openCompositePresetManager(targetItem);
      return;
    }
    if (compositePresetInsertWindow && !compositePresetInsertWindow.closed) {
      if (targetItem === compositePresetInsertTargetItem) {
        focusCompositePresetInsertWindow();
        return;
      }
      try { compositePresetInsertWindow.close(); } catch (_) {}
      compositePresetInsertWindow = null;
    }
    compositePresetInsertTargetItem = targetItem || null;
    const url = "about:blank";
    compositePresetInsertWindow = window.open(url, "DB_UIComposer_CompositePresetInsertPicker", "width=900,height=720,menubar=no,toolbar=no,location=no,status=no");
    if (!compositePresetInsertWindow) {
      alert("別ウィンドウを開けませんでした。ポップアップブロックを確認してください。");
      return;
    }
    const doc = compositePresetInsertWindow.document;
    doc.open();
    doc.write(`<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>統合画像プリセット挿入</title><style>
      :root{color-scheme:dark;}body{margin:0;background:#111722;color:#e8eefb;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:14px;}
      .header{padding:14px 16px;border-bottom:1px solid #354157;background:#0e1420;display:flex;gap:12px;align-items:center;justify-content:space-between;}
      h1{font-size:18px;margin:0}.sub{font-size:12px;color:#9fb0c8;margin-top:4px}.body{display:grid;grid-template-columns:330px 1fr;height:calc(100vh - 74px);} 
      .list{border-right:1px solid #354157;overflow:auto;padding:12px}.preview{display:grid;grid-template-rows:1fr auto;min-width:0;}
      .row{border:1px solid #354157;border-radius:8px;padding:10px;margin-bottom:8px;background:#1b2333;cursor:pointer}.row:hover{border-color:#6384bd}.row.selected{background:#263957;border-color:#74a7ff}.row .name{font-weight:700}.row .meta{font-size:12px;color:#aebbd1;margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .previewBox{margin:12px;border:1px solid #354157;border-radius:10px;background-color:#171d2a;background-image:linear-gradient(45deg,rgba(255,255,255,.04) 25%,transparent 25%),linear-gradient(-45deg,rgba(255,255,255,.04) 25%,transparent 25%),linear-gradient(45deg,transparent 75%,rgba(255,255,255,.04) 75%),linear-gradient(-45deg,transparent 75%,rgba(255,255,255,.04) 75%);background-size:24px 24px;background-position:0 0,0 12px,12px -12px,-12px 0;display:flex;align-items:center;justify-content:center;overflow:auto;min-height:0}.previewBox img{max-width:100%;max-height:100%;object-fit:contain}.empty{color:#9fb0c8;text-align:center;padding:24px}.footer{border-top:1px solid #354157;padding:12px;display:flex;gap:8px;align-items:center}.status{flex:1;color:#b9c9e2;font-size:12px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}button{background:#27334b;color:#f4f7ff;border:1px solid #475776;border-radius:7px;padding:8px 12px;font-weight:700;cursor:pointer}button.primary{background:#2f5ea8;border-color:#4b7ed1}button:disabled{opacity:.45;cursor:not-allowed}
      .header-actions{display:flex;align-items:center;gap:8px}
    </style></head><body><div class="header"><div><h1>統合画像プリセット挿入</h1><div class="sub">登録済みPSDの名前IDを選んで、メインウィンドウへ挿入します。</div></div><div class="header-actions"><button id="refreshBtn">更新</button><button id="insertBtn" class="primary">挿入</button><button id="closeBtn">閉じる</button></div></div><div class="body"><div id="list" class="list"></div><div class="preview"><div id="previewBox" class="previewBox"><div class="empty">名前IDを選択してください</div></div><div class="footer"><div id="status" class="status"></div></div></div></div></body></html>`);
    doc.close();
    const stateLocal = { choices: [], selectedIndex: 0, previewSeq: 0 };
    const listEl = () => doc.getElementById("list");
    const previewEl = () => doc.getElementById("previewBox");
    const statusEl = () => doc.getElementById("status");
    const insertBtn = () => doc.getElementById("insertBtn");
    const setStatus = text => { const el = statusEl(); if (el) el.textContent = String(text || ""); };
    const selectedChoice = () => stateLocal.choices[stateLocal.selectedIndex] || null;
    const loadPreview = async () => {
      const choice = selectedChoice();
      const box = previewEl();
      const btn = insertBtn();
      const seq = ++stateLocal.previewSeq;
      if (btn) btn.disabled = !choice;
      if (!box) return;
      if (!choice) {
        box.innerHTML = "<div class='empty'>登録済みの名前IDがありません。先に統合画像プリセット管理でPSDと名前IDを登録してください。</div>";
        setStatus("");
        return;
      }
      box.innerHTML = "<div class='empty'>プレビュー生成中...</div>";
      setStatus(`${choice.psdLabel} / ${choice.presetId} / img/pictures/${COMPOSITE_EXPORT_ROOT_FOLDER}/${choice.fileName}.png`);
      try {
        const url = await compositePresetChoicePreviewDataUrl(choice);
        if (seq !== stateLocal.previewSeq) return;
        box.innerHTML = url ? `<img src="${url}">` : "<div class='empty'>プレビュー生成不可</div>";
      } catch (e) {
        if (seq === stateLocal.previewSeq) box.innerHTML = `<div class='empty'>${escapeHtml(e?.message || String(e))}</div>`;
      }
    };
    const renderList = () => {
      stateLocal.choices = compositePresetInsertChoices();
      if (stateLocal.selectedIndex >= stateLocal.choices.length) stateLocal.selectedIndex = Math.max(0, stateLocal.choices.length - 1);
      const list = listEl();
      if (!list) return;
      list.innerHTML = "";
      if (!stateLocal.choices.length) {
        const empty = doc.createElement("div");
        empty.className = "empty";
        empty.textContent = "登録済みPSDまたは名前IDがありません。先に統合画像プリセット管理で登録してください。";
        list.appendChild(empty);
        loadPreview();
        return;
      }
      stateLocal.choices.forEach((choice, index) => {
        const row = doc.createElement("div");
        row.className = `row${index === stateLocal.selectedIndex ? " selected" : ""}`;
        const name = doc.createElement("div");
        name.className = "name";
        name.textContent = `${choice.presetId}  /  ${choice.psdLabel}`;
        const meta = doc.createElement("div");
        meta.className = "meta";
        meta.textContent = `${choice.sourcePath || choice.psdKey} / レイヤー ${choice.layerCount}`;
        row.appendChild(name);
        row.appendChild(meta);
        row.addEventListener("click", () => {
          stateLocal.selectedIndex = index;
          renderList();
          void loadPreview();
        });
        list.appendChild(row);
      });
    };
    doc.getElementById("closeBtn")?.addEventListener("click", () => compositePresetInsertWindow?.close());
    doc.getElementById("refreshBtn")?.addEventListener("click", () => { renderList(); void loadPreview(); });
    doc.getElementById("insertBtn")?.addEventListener("click", () => {
      const choice = selectedChoice();
      if (!choice) return;
      const ok = insertCompositePresetChoice(choice, targetItem);
      if (ok) compositePresetInsertWindow?.focus();
    });
    window.addEventListener("message", ev => {
      if (ev?.data?.type === "DB_UIComposer_CompositePresetInsertFocus") {
        try { window.focus(); } catch (e) {}
        renderList();
        void loadPreview();
      }
    });
    renderList();
    void loadPreview();
    focusCompositePresetInsertWindow();
  }


  function buildCompositePresetManagerHtml(itemRef) {
    return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<title>統合画像プリセット管理</title>
<style>
:root{color-scheme:dark;--bg:#171922;--panel:#202433;--panel2:#272c3e;--line:#3b4258;--text:#e8edf8;--muted:#9da8bd;--accent:#78a8ff;--danger:#f06b73;--warn:#ffda83}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font-family:"Yu Gothic UI",Meiryo,sans-serif;font-size:13px}header{display:flex;justify-content:space-between;align-items:center;padding:12px 14px;background:#111520;border-bottom:1px solid var(--line)}h1{font-size:16px;margin:0}.sub{color:var(--muted);font-size:12px}.top{display:flex;gap:8px;align-items:center;padding:10px 14px;background:#171b28;border-bottom:1px solid var(--line)}button{background:#31384e;color:var(--text);border:1px solid #4a536d;border-radius:8px;padding:7px 10px;cursor:pointer}button:hover{border-color:var(--accent)}button.primary{background:#315aa0;border-color:#5e8eea}button.danger{background:#553039;border-color:#8f4b55}.wrap{display:grid;grid-template-columns:250px 270px 230px minmax(360px,1fr) 360px;gap:10px;padding:10px;height:calc(100vh - 102px)}.panel{background:var(--panel);border:1px solid var(--line);border-radius:12px;overflow:hidden;min-height:0;display:flex;flex-direction:column}.panel h2{font-size:13px;margin:0;padding:10px 12px;border-bottom:1px solid var(--line);background:var(--panel2)}.body{padding:10px;overflow:auto;min-height:0}.btns{display:flex;gap:6px;flex-wrap:wrap;padding:10px;border-top:1px solid var(--line);background:rgba(0,0,0,.12)}.row,.psdrow,.preset-row{border:1px solid var(--line);border-radius:9px;padding:7px;margin-bottom:6px;background:rgba(255,255,255,.03)}.psdrow{display:grid;grid-template-columns:24px minmax(0,1fr);gap:6px;align-items:center}.psdrow.registered{border-color:#60759f}.preset-row{cursor:pointer;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px;align-items:center}.preset-row.selected,.row.selected{border-color:var(--accent);background:rgba(120,168,255,.14)}.title{font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.meta{font-size:11px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.warn{color:var(--warn)}.empty{color:var(--muted);text-align:center;padding:24px}.previewBox{height:100%;min-height:320px;display:flex;align-items:center;justify-content:center;background:repeating-conic-gradient(#202433 0 25%,#262b3b 0 50%) 50%/24px 24px;border-radius:10px;overflow:auto}.previewBox img{max-width:100%;max-height:100%}.status{color:var(--muted);font-size:12px;white-space:pre-wrap;padding:0 10px 10px}.draftHead{padding:8px 10px;margin-bottom:8px;border:1px solid #52617f;border-radius:9px;background:#192033;font-size:12px;line-height:1.5}.dirty{color:#ffde87;font-weight:700}.clean{color:#9dd4a8;font-weight:700}label{display:flex;flex-direction:column;gap:4px;margin-bottom:8px;color:var(--muted)}input,select,textarea{width:100%;background:#151927;color:var(--text);border:1px solid #46506a;border-radius:8px;padding:7px 8px}textarea{min-height:52px;resize:vertical}.grid2{display:grid;grid-template-columns:1fr 1fr;gap:8px}.layer-guide{margin:0 0 6px;color:var(--muted);font-size:11px;line-height:1.45}.layer-list{display:flex;flex-direction:column;gap:4px}.layer-row{display:grid;grid-template-columns:22px 28px minmax(0,1fr) 92px;align-items:center;gap:6px;border:1px solid var(--line);border-radius:8px;padding:5px 6px;background:rgba(255,255,255,.03)}.layer-row.off{opacity:.55}.layer-row.dragging{opacity:.38}.layer-row.drop-target{border-color:var(--accent);background:rgba(120,168,255,.16)}.layer-row select{padding:4px 5px;font-size:12px}.drag-handle{display:flex;align-items:center;justify-content:center;height:24px;border:1px solid #46506a;border-radius:6px;background:#151927;color:#aeb9ce;cursor:grab;user-select:none;font-size:15px;line-height:1}.drag-handle:active{cursor:grabbing}.finalFileBox{padding:8px 10px;margin:6px 0 10px;border:1px solid #52617f;border-radius:9px;background:#151927;color:#e8edf8;font-size:12px;line-height:1.5;word-break:break-all}.comboBox{margin:10px 0 12px;border:1px solid #52617f;border-radius:10px;background:#171d2b;overflow:hidden}.comboTitle{padding:8px 10px;background:#20283b;border-bottom:1px solid #52617f;font-weight:700}.comboBody{padding:9px}.comboHelp{font-size:11px;color:var(--muted);line-height:1.5;margin-bottom:8px}.comboMiniBtns{display:flex;gap:5px;flex-wrap:wrap;margin:6px 0}.comboMiniBtns button{padding:5px 7px;font-size:12px}.comboList{display:flex;flex-direction:column;gap:4px;margin:6px 0}.comboRow{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:5px;align-items:center;border:1px solid var(--line);border-radius:8px;padding:5px 6px;background:rgba(255,255,255,.03);cursor:pointer}.comboRow.selected{border-color:var(--accent);background:rgba(120,168,255,.15)}.comboRow .meta{white-space:normal}.comboLayerRow{display:grid;grid-template-columns:22px minmax(0,1fr);gap:6px;align-items:center;border-bottom:1px solid rgba(255,255,255,.06);padding:4px 0}.comboSectionLabel{font-weight:700;margin:8px 0 4px;color:#cfe0ff}.comboBox select,.comboBox input{padding:5px 6px;font-size:12px}.floatingNotice{position:fixed;right:16px;bottom:16px;max-width:360px;padding:12px 14px;border-radius:12px;border:1px solid #5570a8;background:rgba(24,32,52,.96);box-shadow:0 12px 30px rgba(0,0,0,.32);color:#e8edf8;font-size:13px;line-height:1.55;opacity:0;transform:translateY(10px);pointer-events:none;transition:.18s;z-index:20}.floatingNotice.show{opacity:1;transform:translateY(0)}.modeChoice{border:1px solid var(--line);border-radius:10px;padding:10px;margin-bottom:8px;background:rgba(255,255,255,.03)}.modeChoice.selected{border-color:var(--accent);background:rgba(120,168,255,.14)}.modeChoice label{margin:0;display:flex;flex-direction:row;align-items:center;gap:8px;color:var(--text)}.smallDanger{padding:4px 7px;font-size:12px}
</style>
</head>
<body>
<header><div><h1>統合画像プリセット管理</h1><div class="sub" id="targetInfo">PSDライブラリを独立管理します。PSD登録は専用ウィンドウで行います。</div></div><div style="display:flex;gap:8px;align-items:center"><button onclick="window.close()">閉じる</button></div></header>
<div class="top"><button id="psdRegisterWindowBtn" class="primary">PSD登録管理</button><button id="projectWriteBtn">プロジェクトフォルダ再指定</button><button id="standWizardTopBtn" class="primary">立ち絵作成ウィザード</button><span class="sub" id="topStatus"></span></div>
<div class="wrap">
  <section class="panel"><h2>登録済みPSD</h2><div class="body"><div id="registeredList"></div></div></section>
  <section class="panel"><h2>プリセット</h2><div class="body"><div id="presetList"></div></div></section>
  <section class="panel"><h2>プリセット形式</h2><div class="body" id="presetModeColumn"><div class="empty">PSDとプリセットを選択してください。</div></div></section>
  <section class="panel"><h2>選択中プリセットプレビュー</h2><div class="body"><div id="draftHead" class="draftHead"></div><div class="previewBox" id="previewBox"><div class="empty">PSDを登録・選択してください</div></div></div><div class="status" id="status"></div><div class="btns"><button id="saveDraftBtn" class="primary">編集中を保存</button></div></section>
  <section class="panel"><h2>編集中設定</h2><div class="body" id="editor"><div class="empty">PSDを選択してください</div></div></section>
</div>
<div id="floatingNotice" class="floatingNotice"></div>
<script>
(() => {
  let manager = null;
  let selectedPsdKey = "";
  let model = null;
  let selectedPresetId = "";
  let draft = null;
  let draftSourceId = "";
  let draftDirty = false;
  let exportDiffTouched = false;
  let previewTimer = 0;
  let noticeTimer = 0;
  let editorInputFocused = false;
  let previewSeq = 0;
  let comboSlots = [];
  let selectedComboSlotId = "";
  let selectedComboOptionId = "";
  let comboSelections = {};
  let comboDirty = false;
  let comboNameSeed = "";
  function clone(v){ return JSON.parse(JSON.stringify(v)); }
  function esc(s){ return String(s ?? "").replace(/[&<>\"]/g,c=>c==="&"?"&amp;":c==="<"?"&lt;":c===">"?"&gt;":"&quot;"); }
  function bridge(name,...args){ const b=window.opener && window.opener.DB_UIComposerPresetBridge; if(!b) throw new Error("元ツールとの接続が切れました。"); const fn=b[name]; if(typeof fn!=="function") throw new Error("未対応の操作です: "+name); return fn(...args); }
  async function doBridge(label,fn){ try{return await fn();}catch(e){const m=e?.message||String(e); setStatus(label+"に失敗しました: "+m); alert(label+"に失敗しました。\\\n"+m); return null;} }
  function setStatus(s){ const e=document.getElementById("status"); if(e) e.textContent=String(s||""); const t=document.getElementById("topStatus"); if(t && s) t.textContent=String(s||""); }
  function showNotice(s){ const box=document.getElementById("floatingNotice"); if(!box)return; box.textContent=String(s||""); box.classList.add("show"); clearTimeout(noticeTimer); noticeTimer=setTimeout(()=>box.classList.remove("show"),3600); }
  function selectedPreset(){ return (model?.presets||[]).find(p=>p.id===selectedPresetId)||null; }
  function nextDraftNameId(base="preset"){
    const used=new Set((model?.presets||[]).map(p=>String(p.id||"")));
    const clean=safeTextId(base||"preset","preset");
    if(!used.has(clean))return clean;
    let n=2;
    while(used.has(clean+"_"+n))n++;
    return clean+"_"+n;
  }
  function safeTextId(value,fallback){
    const raw=String(value||"").trim().replace(/^.*[\/]/,"");
    const illegal='<>:"/\\|?*';
    let cleaned=Array.from(raw).map(ch=>{
      const code=ch.charCodeAt(0);
      return code<32||illegal.includes(ch)?"_":ch;
    }).join("");
    while(cleaned.startsWith(".")) cleaned=cleaned.slice(1);
    cleaned=cleaned.trim();
    return cleaned||fallback;
  }
  function createDraftFromPreset(p){ const id=String(p?.id||"preset"); return { id, label:String(p?.label||""), exportBaseName:String(p?.exportBaseName||model?.exportAutoBaseName||""), exportPresetName:String(p?.exportPresetName||id), presetMode:["slot","layer"].includes(String(p?.presetMode||""))?String(p.presetMode):"layer", slotSelections:clone(p?.slotSelections||{}), picture:clone(p?.picture||model?.currentPicture||{}), layers:clone(p?.layers||model?.layerAssets||[]), exportedImage:p?.exportedImage||null }; }
  function createDraftFromCurrent(){ const id=nextDraftNameId("preset"); return { id, label:"", exportBaseName:String(model?.exportAutoBaseName||""), exportPresetName:id, presetMode:"layer", slotSelections:{}, picture:clone(model?.currentPicture||{}), layers:clone(model?.layerAssets||[]), exportedImage:null }; }
  function ensureDraft(){ if(!draft) draft=createDraftFromCurrent(); if(!draft.picture) draft.picture={}; if(!Array.isArray(draft.layers)) draft.layers=[]; if(!draft.id) draft.id=nextDraftNameId("preset"); if(!draft.exportPresetName) draft.exportPresetName=draft.id; }
  function setDraftFromPreset(p){ draft=createDraftFromPreset(p); draftSourceId=String(p?.id||""); selectedPresetId=draftSourceId; draftDirty=false; exportDiffTouched=false; }
  function setDraftFromCurrent(){ draft=createDraftFromCurrent(); draftSourceId=""; selectedPresetId=""; draftDirty=true; exportDiffTouched=false; }
  function editorEl(){ return document.getElementById("editor"); }
  function isEditorFieldActive(){ const e=document.activeElement; const box=editorEl(); return !!(e&&box&&box.contains(e)&&e.matches&&e.matches("input,textarea,select")); }
  function updateDraft(patch, previewDelay=null){ ensureDraft(); draft=Object.assign({},draft,patch||{}); draftDirty=true; updateDynamicBits(); const delay=(previewDelay!==null&&previewDelay!==undefined)?previewDelay:(isEditorFieldActive()?600:220); schedulePreview(delay); }
  async function refreshAll(keepDraft=true){ const editorWasEmpty=!editorEl()?.querySelector("input,textarea,select"); manager=await bridge("getManagerState", selectedPsdKey); if(!selectedPsdKey) selectedPsdKey=manager.selectedKey||""; renderAvailable(); renderRegistered(); if(selectedPsdKey){ model=await bridge("getLibraryModel", selectedPsdKey); } else { model=null; } comboSlots=clone(model?.compositionSlots||[]); ensureComboState(); if(!keepDraft){ draft=null; draftSourceId=""; draftDirty=false; exportDiffTouched=false; selectedPresetId=model?.selectedPresetId||model?.presets?.[0]?.id||""; } if(model && !draft){ if(selectedPresetId && model.presets.some(p=>p.id===selectedPresetId)) setDraftFromPreset(selectedPreset()); else setDraftFromCurrent(); } renderPresetList(); renderPresetModeColumn(); if(!keepDraft || editorWasEmpty || !isEditorFieldActive()) renderEditor(); updateDynamicBits(); schedulePreview(isEditorFieldActive()?600:220); }
  function renderAvailable(){ const box=document.getElementById("availableList"); if(!box)return; box.innerHTML=""; const list=manager?.available||[]; if(!list.length){ box.innerHTML="<div class='empty'>PSDフォルダ内にPSDがありません。<br>Project/PSD にPSDを入れてから読み込みしてください。</div>"; return; } list.forEach(p=>{ const row=document.createElement("label"); row.className="psdrow"+(p.registered?" registered":""); row.innerHTML="<input type='checkbox' class='psdCheck' value='"+esc(p.key)+"'><div><div class='title'>"+esc(p.label)+"</div><div class='meta'>"+esc(p.sourcePath||p.key)+(p.registered?" <span class='warn'>登録済み</span>":"")+"</div></div>"; box.appendChild(row); }); }
  function renderRegistered(){ const box=document.getElementById("registeredList"); box.innerHTML=""; const list=manager?.registered||[]; if(!list.length){ box.innerHTML="<div class='empty'>登録済みPSDはありません。</div>"; return; } list.forEach(p=>{ const row=document.createElement("div"); row.className="row"+(p.key===selectedPsdKey?" selected":""); row.innerHTML="<div class='title'>"+esc(p.label)+"</div><div class='meta'>名前ID "+(p.presetCount||0)+" / スロット "+(p.slotCount||0)+" / レイヤー "+(p.layerCount||0)+(p.missingSource?" <span class='warn'>PSDファイル不明</span>":"")+"</div>"; row.onclick=()=>selectPsd(p.key); box.appendChild(row); }); }
  async function selectPsd(key){
    if(key===selectedPsdKey)return;
    syncDraftFromEditorFields(false);
    if(draftDirty && !safeConfirm("編集中の未保存内容を破棄して、別のPSDへ切り替えますか？")){ restoreEditorInteractivity(); return; }
    try{document.activeElement?.blur?.();}catch(e){}
    editorInputFocused=false;
    selectedPsdKey=key;
    draft=null;
    draftSourceId="";
    draftDirty=false;
    exportDiffTouched=false;
    comboDirty=false;
    await refreshAll(false);
  }
  function renderPresetList(){
    const box=document.getElementById("presetList");
    if(!box)return;
    box.innerHTML="";
    if(!model){ box.innerHTML="<div class='empty'>登録済みPSDを選択してください。</div>"; return; }
    const add=document.createElement("button");
    add.type="button";
    add.className="primary";
    add.textContent="＋プリセット";
    add.style.marginBottom="8px";
    add.onclick=async()=>{
      if(draftDirty && !safeConfirm("未保存の編集中内容があります。新規プリセットを作成して切り替えますか？")){ restoreEditorInteractivity(); return; }
      setDraftFromCurrent();
      await doBridge("プリセット追加",async()=>{ await saveDraft(false); });
    };
    box.appendChild(add);
    const presets=model.presets||[];
    if(!presets.length){ const e=document.createElement("div"); e.className="empty"; e.innerHTML="プリセットはまだありません。<br>＋プリセットで追加してください。"; box.appendChild(e); return; }
    presets.forEach(p=>{
      const row=document.createElement("div");
      row.className="preset-row"+((p.id===selectedPresetId&&draftSourceId===p.id)?" selected":"");
      const info=document.createElement("div");
      info.innerHTML="<div class='title'>"+esc(p.id)+"</div><div class='meta'>"+esc((p.exportBaseName||model.exportAutoBaseName||"")+(p.exportPresetName?"_"+p.exportPresetName:"")+".png")+" / "+((p.presetMode||"layer")==="slot"?"スロット式":"レイヤー構成")+"</div>";
      const del=document.createElement("button");
      del.type="button";
      del.className="danger smallDanger";
      del.textContent="削除";
      del.onclick=async ev=>{
        ev.stopPropagation();
        if(!safeConfirm("プリセット『"+(p.id||"")+"』を削除しますか？\\nこの操作は元に戻せません。"))return;
        await doBridge("プリセット削除",async()=>{
          selectedPresetId=await bridge("deletePreset",selectedPsdKey,p.id);
          draft=null;
          draftSourceId="";
          draftDirty=false;
          await refreshAll(false);
        });
      };
      row.onclick=()=>{
        if(draftDirty && !safeConfirm("保存済みプリセット『"+p.id+"』を編集中枠へ読み込みますか？\\n未保存の編集中内容は失われます。")){ restoreEditorInteractivity(); return; }
        setDraftFromPreset(p);
        renderPresetList();
        renderPresetModeColumn();
        renderEditor();
        restoreEditorInteractivity();
        schedulePreview();
      };
      row.appendChild(info);
      row.appendChild(del);
      box.appendChild(row);
    });
  }

  function renderPresetModeColumn(){
    const box=document.getElementById("presetModeColumn");
    if(!box)return;
    box.innerHTML="";
    if(!model||!draft){ box.innerHTML="<div class='empty'>PSDとプリセットを選択してください。</div>"; return; }
    ensureDraft();
    if(!draft.presetMode) draft.presetMode="layer";
    const note=document.createElement("div");
    note.className="meta";
    note.style.whiteSpace="normal";
    note.style.lineHeight="1.55";
    note.style.marginBottom="8px";
    note.textContent="選択中プリセットの作成方式を選びます。選択した方式の編集項目をこの下に表示します。";
    box.appendChild(note);
    const choices=[["layer","レイヤー構成","保存済みのレイヤーON/OFF・前後関係で表示します。"],["slot","スロット式プリセット","体・衣装・表情などのスロット組み合わせで作成します。"]];
    choices.forEach(([value,title,desc])=>{
      const wrap=document.createElement("div");
      wrap.className="modeChoice"+(draft.presetMode===value?" selected":"");
      const label=document.createElement("label");
      const radio=document.createElement("input");
      radio.type="radio"; radio.name="presetMode"; radio.value=value; radio.checked=draft.presetMode===value;
      radio.onchange=()=>{ draft.presetMode=value; draftDirty=true; renderPresetModeColumn(); updateDynamicBits(); schedulePreview(120); };
      const txt=document.createElement("div");
      txt.innerHTML="<div class='title'>"+esc(title)+"</div><div class='meta' style='white-space:normal'>"+esc(desc)+"</div>";
      label.appendChild(radio); label.appendChild(txt); wrap.appendChild(label); box.appendChild(wrap);
    });
    const divider=document.createElement("div");
    divider.className="comboSectionLabel";
    divider.textContent=draft.presetMode==="slot"?"スロット式の作成・編集":"レイヤー構成の作成・編集";
    box.appendChild(divider);
    if(draft.presetMode==="slot") renderComboSection(box);
    else renderLayerSection(box);
  }

  function updateDynamicBits(){ if(!model||!draft){ document.getElementById("draftHead").innerHTML="PSD未選択"; return; } const state=draftDirty?"<span class='dirty'>未保存の変更あり</span>":"<span class='clean'>保存済み内容と同一</span>"; document.getElementById("draftHead").innerHTML="<b>編集中の名前ID:</b> "+esc(draft.id||"(未設定)")+"<br>元: "+(draftSourceId?"保存済み「"+esc(draftSourceId)+"」":"未保存の新規編集中")+"<br>状態: "+state; const f=document.getElementById("finalFileName"); if(f){const base=draft.exportBaseName||model.exportAutoBaseName||""; const diff=draft.exportPresetName||draft.id||""; f.innerHTML="<b>最終出力PNG名</b><br>img/pictures/composite_export/"+esc(base)+(diff?"_"+esc(diff):"")+".png";} }
  function bindEditorField(el){
    el.autocomplete="off";
    el.addEventListener("focus",()=>{editorInputFocused=true;});
    el.addEventListener("blur",()=>{editorInputFocused=false; schedulePreview(260);});
    ["pointerdown","mousedown","click","dblclick"].forEach(type=>el.addEventListener(type,ev=>{
      ev.stopPropagation();
    },true));
    ["keydown","keyup","keypress","beforeinput","input","compositionstart","compositionupdate","compositionend"].forEach(type=>el.addEventListener(type,ev=>ev.stopPropagation(),true));
    return el;
  }
  function restoreEditorInteractivity(){
    editorInputFocused=false;
    updateDynamicBits();
  }
  function safeConfirm(message){
    let ok=true;
    try{ ok=!window.confirm||window.confirm(message); }
    finally{ restoreEditorInteractivity(); }
    return ok;
  }

  let psdRegistrationWindow=null;
  function focusPsdRegistrationWindow(){
    try{ if(psdRegistrationWindow&&!psdRegistrationWindow.closed){ psdRegistrationWindow.focus(); return true; } }catch(e){}
    return false;
  }
  async function openPsdRegistrationWindow(){
    if(focusPsdRegistrationWindow())return;
    psdRegistrationWindow=window.open("about:blank","DB_UIComposer_PsdRegistration","width=980,height=720,menubar=no,toolbar=no,location=no,status=no");
    if(!psdRegistrationWindow){ alert("PSD登録ウィンドウを開けませんでした。"); return; }
    const doc=psdRegistrationWindow.document;
    doc.open();
    doc.write(\`<!doctype html><html lang=\"ja\"><head><meta charset=\"utf-8\"><title>PSD登録管理</title><style>\n      :root{color-scheme:dark;--bg:#171922;--panel:#202433;--line:#3b4258;--text:#e8edf8;--muted:#9da8bd;--accent:#78a8ff;--danger:#f06b73;--warn:#ffda83}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font-family:\"Yu Gothic UI\",Meiryo,sans-serif;font-size:13px}header{display:flex;justify-content:space-between;align-items:center;padding:12px 14px;background:#111520;border-bottom:1px solid var(--line)}h1{font-size:16px;margin:0}.sub{color:var(--muted);font-size:12px}.wrap{display:grid;grid-template-columns:1fr 1fr;gap:10px;height:calc(100vh - 100px);padding:10px}.panel{background:var(--panel);border:1px solid var(--line);border-radius:12px;overflow:hidden;display:flex;flex-direction:column;min-height:0}.panel h2{font-size:13px;margin:0;padding:10px 12px;border-bottom:1px solid var(--line);background:#272c3e}.body{padding:10px;overflow:auto;min-height:0}.footer{padding:10px;border-top:1px solid var(--line);display:flex;gap:8px;flex-wrap:wrap}.row{border:1px solid var(--line);border-radius:9px;padding:8px;margin-bottom:7px;background:rgba(255,255,255,.03)}.psdrow{display:grid;grid-template-columns:24px minmax(0,1fr);gap:6px;align-items:center}.regrow{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px;align-items:center}.title{font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.meta{font-size:11px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.empty{color:var(--muted);text-align:center;padding:24px}.warn{color:var(--warn)}button{background:#31384e;color:var(--text);border:1px solid #4a536d;border-radius:8px;padding:7px 10px;cursor:pointer}button.primary{background:#315aa0;border-color:#5e8eea}button.danger{background:#553039;border-color:#8f4b55}.status{padding:0 14px 10px;color:var(--muted);font-size:12px}\n    </style></head><body><header><div><h1>PSD登録管理</h1><div class=\"sub\">PSDの登録・削除だけを行います。</div></div><button id=\"closeBtn\">閉じる</button></header><div class=\"wrap\"><section class=\"panel\"><h2>PSDフォルダ内PSD</h2><div class=\"body\"><div class=\"meta\" style=\"white-space:normal;margin-bottom:8px\">Project/PSD 以下のPSDを表示します。チェックして登録します。</div><div id=\"availableList\"></div></div><div class=\"footer\"><button id=\"refreshBtn\">PSDフォルダを読み込み</button><button id=\"registerBtn\" class=\"primary\">チェックしたPSDを登録</button></div></section><section class=\"panel\"><h2>登録済みPSD</h2><div class=\"body\"><div id=\"registeredList\"></div></div></section></div><div id=\"regStatus\" class=\"status\"></div></body></html>\`);
    doc.close();
    const setRegStatus=s=>{const el=doc.getElementById("regStatus"); if(el)el.textContent=String(s||"");};
    const render=async()=>{
      const m=await bridge("getManagerState",selectedPsdKey);
      const av=doc.getElementById("availableList");
      const rg=doc.getElementById("registeredList");
      av.innerHTML=""; rg.innerHTML="";
      const available=m?.available||[];
      if(!available.length) av.innerHTML="<div class='empty'>PSDフォルダ内にPSDがありません。</div>";
      available.forEach(p=>{const row=doc.createElement("label"); row.className="row psdrow"; row.innerHTML="<input type='checkbox' class='psdCheck' value='"+esc(p.key)+"'><div><div class='title'>"+esc(p.label)+"</div><div class='meta'>"+esc(p.sourcePath||p.key)+(p.registered?" <span class='warn'>登録済み</span>":"")+"</div></div>"; av.appendChild(row);});
      const registered=m?.registered||[];
      if(!registered.length) rg.innerHTML="<div class='empty'>登録済みPSDはありません。</div>";
      registered.forEach(p=>{const row=doc.createElement("div"); row.className="row regrow"; const info=doc.createElement("div"); info.innerHTML="<div class='title'>"+esc(p.label)+"</div><div class='meta'>名前ID "+(p.presetCount||0)+" / スロット "+(p.slotCount||0)+" / レイヤー "+(p.layerCount||0)+(p.missingSource?" <span class='warn'>PSDファイル不明</span>":"")+"</div>"; const del=doc.createElement("button"); del.className="danger"; del.textContent="削除"; del.onclick=async()=>{ if(!confirm("PSD登録『"+(p.label||p.key)+"』を削除しますか？\\n※メイン上のパーツには触れません。"))return; const r=await bridge("deletePsdLibrary",p.key); if(selectedPsdKey===p.key){selectedPsdKey="";draft=null;draftSourceId="";draftDirty=false;} setRegStatus(r?.message||""); await refreshAll(false); await render(); }; row.append(info,del); rg.appendChild(row);});
    };
    doc.getElementById("closeBtn").onclick=()=>psdRegistrationWindow.close();
    doc.getElementById("refreshBtn").onclick=async()=>{let r=await bridge("refreshProjectPsdFolder"); if(r?.permissionRequired){setRegStatus(r.message||""); if(!await ensureProjectAccessReady())return; r=await bridge("refreshProjectPsdFolder");} setRegStatus(r?.message||""); await refreshAll(true); await render();};
    doc.getElementById("registerBtn").onclick=async()=>{const keys=Array.from(doc.querySelectorAll(".psdCheck:checked")).map(i=>i.value); if(!keys.length){setRegStatus("登録するPSDにチェックを入れてください。");return;} if(!await ensureProjectAccessReady())return; let r=await bridge("registerProjectPsdFiles",keys,false); if(r?.permissionRequired){setRegStatus(r.message||""); if(!await ensureProjectAccessReady())return; r=await bridge("registerProjectPsdFiles",keys,false);} if(r?.conflict){if(!confirm((r.message||"登録済みPSDと重複しています。")+"\\n\\nOK: 上書き登録 / キャンセル: 中止"))return; r=await bridge("registerProjectPsdFiles",keys,true);} if(r?.ok){selectedPsdKey=r.selectedKey||selectedPsdKey; draft=null; draftSourceId=""; draftDirty=false; setRegStatus(r.message||"PSDを登録しました。"); await refreshAll(false); await render();}else setRegStatus(r?.message||"PSD登録に失敗しました。");};
    await render();
    try{psdRegistrationWindow.focus();}catch(e){}
  }
  function syncDraftFromEditorFields(markDirty=true){
    if(!model||!draft)return false;
    const box=editorEl();
    if(!box)return false;
    const byId=id=>box.querySelector("#"+id);
    const oldId=String(draft.id||"");
    let changed=false;
    const set=(key,value)=>{ if(draft[key]!==value){ draft[key]=value; changed=true; } };
    const nameEl=byId("draftNameIdInput");
    const baseEl=byId("draftExportBaseInput");
    const diffEl=byId("draftExportPresetInput");
    const labelEl=byId("draftLabelInput");
    if(nameEl){
      const nextId=String(nameEl.value||"").trim();
      if(nextId) set("id",nextId);
    }
    if(baseEl) set("exportBaseName",String(baseEl.value||""));
    if(diffEl) set("exportPresetName",String(diffEl.value||""));
    if(labelEl) set("label",String(labelEl.value||""));
    const pic=Object.assign({},draft.picture||{});
    const num=(id,def=0)=>{ const el=byId(id); if(!el)return def; const n=Number(el.value); return Number.isFinite(n)?n:def; };
    if(byId("draftPictureXInput")) pic.x=num("draftPictureXInput",Number(pic.x||0));
    if(byId("draftPictureYInput")) pic.y=num("draftPictureYInput",Number(pic.y||0));
    if(byId("draftPictureWidthInput")) pic.width=Math.max(1,num("draftPictureWidthInput",Number(pic.width||96)));
    if(byId("draftPictureHeightInput")) pic.height=Math.max(1,num("draftPictureHeightInput",Number(pic.height||64)));
    if(byId("draftPictureOpacityInput")) pic.opacity=Math.max(0,Math.min(255,num("draftPictureOpacityInput",Number(pic.opacity??255))));
    if(byId("draftPictureZOrderInput")) pic.zOrder=num("draftPictureZOrderInput",Number(pic.zOrder||0));
    if(byId("draftPictureVisibleInput")) pic.visible=!!byId("draftPictureVisibleInput").checked;
    if(JSON.stringify(pic)!==JSON.stringify(draft.picture||{})){ draft.picture=pic; changed=true; }
    if(!String(draft.exportPresetName||"").trim()){
      draft.exportPresetName=String(draft.id||oldId||"preset");
      changed=true;
    }
    if(changed&&markDirty){ draftDirty=true; updateDynamicBits(); }
    return changed;
  }
  function input(label,val,onChange,type="text",attrs=""){ const l=document.createElement("label"); l.textContent=label; const i=bindEditorField(document.createElement("input")); i.type=type; i.value=String(val??""); if(attrs) attrs.trim().split(" ").filter(Boolean).forEach(a=>{const [k,v]=a.split("=");if(k)i.setAttribute(k,v||"");}); i.oninput=()=>onChange(type==="number"?Number(i.value)||0:i.value); l.appendChild(i); return l; }
  function textarea(label,val,onChange){ const l=document.createElement("label"); l.textContent=label; const t=bindEditorField(document.createElement("textarea")); t.value=String(val??""); t.oninput=()=>onChange(t.value); l.appendChild(t); return l; }
  function checkbox(label,val,onChange){ const l=document.createElement("label"); l.style.flexDirection="row"; l.style.alignItems="center"; const i=bindEditorField(document.createElement("input")); i.type="checkbox"; i.checked=!!val; i.onchange=()=>onChange(i.checked); l.appendChild(i); l.append(" "+label); return l; }
  function ensureComboState(){
    if(!Array.isArray(comboSlots)) comboSlots=[];
    if(selectedComboSlotId&&!comboSlots.some(s=>s.id===selectedComboSlotId)) selectedComboSlotId="";
    if(!selectedComboSlotId&&comboSlots.length) selectedComboSlotId=comboSlots[0].id;
    const slot=comboSlots.find(s=>s.id===selectedComboSlotId)||null;
    if(slot){
      if(selectedComboOptionId&&!slot.options.some(o=>o.id===selectedComboOptionId)) selectedComboOptionId="";
      if(!selectedComboOptionId&&slot.options.length) selectedComboOptionId=slot.options[0].id;
    }else selectedComboOptionId="";
    for(const s of comboSlots){
      if(s.multiSelect){ if(!Array.isArray(comboSelections[s.id])) comboSelections[s.id]=[]; }
      else { if(Array.isArray(comboSelections[s.id])) comboSelections[s.id]=comboSelections[s.id][0]||""; if(!comboSelections[s.id]&&s.options[0]) comboSelections[s.id]=s.options[0].id; }
    }
  }
  function nextComboId(prefix,list){ const used=new Set((list||[]).map(v=>String(v.id||""))); let n=1; let id=prefix+n; while(used.has(id)) id=prefix+(++n); return id; }
  function markComboDirty(){ comboDirty=true; }
  async function saveComboSlots(){ if(!selectedPsdKey){showNotice("PSDを選択してください。");return false;} const r=await doBridge("スロット設定保存",async()=>bridge("saveCompositionSlots",selectedPsdKey,clone(comboSlots))); if(r?.ok){comboDirty=false; setStatus(r.message||"スロット設定を保存しました。"); showNotice(r.message||"スロット設定を保存しました。"); model=await bridge("getLibraryModel",selectedPsdKey); comboSlots=clone(model?.compositionSlots||comboSlots); ensureComboState(); renderEditor(); return true;} return false; }
  function selectedComboSlot(){ return comboSlots.find(s=>s.id===selectedComboSlotId)||null; }
  function selectedComboOption(){ const s=selectedComboSlot(); return s?(s.options||[]).find(o=>o.id===selectedComboOptionId)||null:null; }
  function comboNameFromSelections(){ const parts=[]; for(const s of comboSlots){ const sel=comboSelections[s.id]; if(s.multiSelect){ const arr=Array.isArray(sel)?sel:[]; if(arr.length) parts.push(arr.join("_")); } else if(sel) parts.push(String(sel)); } return safeTextId(comboNameSeed||parts.join("_")||"combo_preset","combo_preset"); }
  function buildComboDraft(){
    if(!model) return null;
    const visibleIds=new Set();
    const labelParts=[];
    for(const s of comboSlots){
      const selected=s.multiSelect?(Array.isArray(comboSelections[s.id])?comboSelections[s.id]:[]):[comboSelections[s.id]].filter(Boolean);
      const names=[];
      for(const id of selected){ const opt=(s.options||[]).find(o=>o.id===id); if(!opt) continue; names.push(opt.name||opt.id); (opt.layers||[]).forEach(layerId=>visibleIds.add(String(layerId))); }
      if(names.length) labelParts.push((s.name||s.id)+":"+names.join("+"));
    }
    const id=comboNameFromSelections();
    const layers=(model.layerAssets||[]).filter(layer=>visibleIds.has(String(layer.id||""))).map(layer=>{ const copy=clone(layer); copy.visible=true; return copy; });
    return { id, label:"組み合わせ: "+labelParts.join(" / "), exportBaseName:String(model.exportAutoBaseName||""), exportPresetName:id, presetMode:"slot", slotSelections:clone(comboSelections||{}), picture:clone(model.currentPicture||{}), layers, exportedImage:null };
  }
  let standPictureWizardWindow = null;
  function defaultWizardSlots(){
    return [
      {id:"body",name:"体",multiSelect:false,order:0,gameVariableId:0,autoVariableSync:false,options:[]},
      {id:"costume",name:"衣装",multiSelect:false,order:1,gameVariableId:0,autoVariableSync:false,options:[]},
      {id:"expression",name:"表情",multiSelect:false,order:2,gameVariableId:0,autoVariableSync:false,options:[]}
    ];
  }
  function ensureDefaultWizardSlots(slots){
    const list=Array.isArray(slots)?clone(slots):[];
    defaultWizardSlots().forEach(def=>{if(!list.some(s=>String(s.id||"")===def.id))list.push(clone(def));});
    return list.map((s,i)=>Object.assign({order:i,gameVariableId:0,autoVariableSync:false,options:[]},s,{options:Array.isArray(s.options)?s.options:[]}));
  }
  function wizardSortedSlots(slots){
    return (Array.isArray(slots)?slots:[]).slice().sort((a,b)=>(Number(a.order||0)-Number(b.order||0))||String(a.id||"").localeCompare(String(b.id||"")));
  }
  function openStandPictureWizardWindow(){
    if(standPictureWizardWindow&&!standPictureWizardWindow.closed){try{standPictureWizardWindow.focus();}catch(e){} return;}
    standPictureWizardWindow=window.open("about:blank","DB_UIComposer_StandPictureWizard","width=1180,height=820,menubar=no,toolbar=no,location=no,status=no");
    if(!standPictureWizardWindow){alert("別ウィンドウを開けませんでした。ポップアップブロックを確認してください。");return;}
    const doc=standPictureWizardWindow.document;
    doc.open();
    doc.write('<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>立ち絵作成ウィザード</title><style>'+':root{color-scheme:dark;--bg:#141821;--panel:#202637;--line:#3d465f;--text:#e8edf8;--muted:#a7b2c8;--accent:#78a8ff;--danger:#f06b73;--warn:#ffda83}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font-family:"Yu Gothic UI",Meiryo,sans-serif;font-size:13px}header{display:flex;justify-content:space-between;align-items:center;padding:12px 14px;background:#101520;border-bottom:1px solid var(--line)}h1{font-size:17px;margin:0}.sub{color:var(--muted);font-size:12px;margin-top:3px}.steps{display:flex;gap:6px;padding:10px 14px;border-bottom:1px solid var(--line);background:#171d2a}.step{padding:6px 10px;border:1px solid var(--line);border-radius:999px;color:var(--muted)}.step.active{border-color:var(--accent);color:#fff;background:#263a59}.main{display:grid;grid-template-columns:minmax(420px,1fr) 430px;height:calc(100vh - 105px);gap:10px;padding:10px}.panel{background:var(--panel);border:1px solid var(--line);border-radius:12px;overflow:hidden;min-height:0;display:flex;flex-direction:column}.body{padding:12px;overflow:auto;min-height:0}.footer{padding:10px;border-top:1px solid var(--line);display:flex;gap:8px;justify-content:space-between;align-items:center}.row{border:1px solid var(--line);border-radius:9px;padding:8px;margin-bottom:7px;background:rgba(255,255,255,.03);cursor:pointer}.row.selected{border-color:var(--accent);background:rgba(120,168,255,.15)}.title{font-weight:700}.meta{color:var(--muted);font-size:11px;margin-top:3px}.grid2{display:grid;grid-template-columns:1fr 1fr;gap:8px}label{display:flex;flex-direction:column;gap:4px;margin-bottom:8px;color:var(--muted)}input,select,textarea{width:100%;background:#151927;color:var(--text);border:1px solid #46506a;border-radius:8px;padding:7px 8px}button{background:#30384f;color:var(--text);border:1px solid #4b5570;border-radius:8px;padding:7px 10px;cursor:pointer}button.primary{background:#315aa0;border-color:#5e8eea}button.danger{background:#553039;border-color:#8f4b55}.previewBox{height:100%;min-height:340px;display:flex;align-items:center;justify-content:center;background:repeating-conic-gradient(#202433 0 25%,#262b3b 0 50%) 50%/24px 24px;border-radius:10px;overflow:auto}.previewBox img{max-width:100%;max-height:100%}.empty{color:var(--muted);text-align:center;padding:22px;line-height:1.6}.slotBar{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px}.slotPill{border:1px solid var(--line);border-radius:999px;padding:6px 10px;cursor:pointer}.slotPill.selected{border-color:var(--accent);background:#263a59}.layerRow{display:grid;grid-template-columns:22px minmax(0,1fr);gap:7px;align-items:center;padding:5px 0;border-bottom:1px solid rgba(255,255,255,.06)}.actions{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}.warn{color:var(--warn)}.status{color:var(--muted);font-size:12px;min-height:18px}.candidatePanel{border:1px solid var(--line);border-radius:12px;background:rgba(0,0,0,.13);padding:10px;margin:10px 0}.candidateHeader{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}.candidateTitle{font-weight:700}.candidateListEmpty{color:var(--muted);text-align:center;padding:14px;border:1px dashed var(--line);border-radius:9px;background:rgba(255,255,255,.02)}.note{line-height:1.55;color:var(--muted);font-size:12px;border:1px solid #4d5b78;background:#182033;border-radius:9px;padding:9px;margin:8px 0}</style></head><body><header><div><h1>立ち絵作成ウィザード</h1><div class="sub">PSD → スロット → レイヤー割当 → ゲーム変数連動設定の順で作成します。</div></div><button id="closeBtn">閉じる</button></header><div id="steps" class="steps"></div><div class="main"><section class="panel"><div id="body" class="body"></div><div class="footer"><button id="prevBtn">戻る</button><div><button id="nextBtn" class="primary">次へ</button><button id="applyBtn" class="primary">管理画面へ反映</button></div></div></section><section class="panel"><div class="body"><div id="preview" class="previewBox"><div class="empty">プレビュー</div></div><div id="status" class="status"></div></div></section></div></body></html>');
    doc.close();
    const wz={step:0,psdKey:selectedPsdKey||manager?.selectedKey||"",model:null,slots:[],selectedSlotId:"body",selectedOptionId:"",selections:{},previewSeq:0};
    const labels=["1 PSD選択","2 スロット","3 レイヤー割当","4 変数連動"];
    function q(id){return doc.getElementById(id);} function ehtml(s){return String(s??"").replace(/[&<>\"]/g,c=>c==="&"?"&amp;":c==="<"?"&lt;":c===">"?"&gt;":"&quot;");} function wid(v,f){return safeTextId(v,f||"id");}
    function activeSlot(){return wz.slots.find(s=>s.id===wz.selectedSlotId)||wz.slots[0]||null;} function activeOption(){const s=activeSlot();return s?(s.options||[]).find(o=>o.id===wz.selectedOptionId)||null:null;}
    async function loadWizardModel(){ if(!wz.psdKey)return; wz.model=await bridge("getLibraryModel",wz.psdKey); wz.slots=ensureDefaultWizardSlots(wz.model?.compositionSlots||[]); wz.selectedSlotId=wz.slots[0]?.id||""; wz.selectedOptionId=""; ensureSelections(); }
    function ensureSelections(){ wizardSortedSlots(wz.slots).forEach(s=>{ if(s.multiSelect){ if(!Array.isArray(wz.selections[s.id]))wz.selections[s.id]=[]; }else{ if(!wz.selections[s.id]||!(s.options||[]).some(o=>o.id===wz.selections[s.id]))wz.selections[s.id]=""; } }); }
    function selectedLayerIds(){ const ids=[]; if(wz.step===2){ const o=activeOption(); (o?.layers||[]).forEach(id=>ids.push(String(id))); return Array.from(new Set(ids)); } if(wz.step!==3) return []; wizardSortedSlots(wz.slots).forEach(s=>{ const selected=s.multiSelect?(Array.isArray(wz.selections[s.id])?wz.selections[s.id]:[]):[wz.selections[s.id]]; selected.forEach(oid=>{ const o=(s.options||[]).find(x=>x.id===oid); (o?.layers||[]).forEach(id=>ids.push(String(id))); }); }); return Array.from(new Set(ids)); }
    function buildDraft(){ if(!wz.model)return null; const byId=new Map((wz.model.layerAssets||[]).map(l=>[String(l.id||""),l])); const layers=[]; selectedLayerIds().forEach(id=>{ if(byId.has(id))layers.push(clone(byId.get(id))); }); const count=layers.length; layers.forEach((l,i)=>{l.visible=true;l.priority=count-i;}); const id="wizard_preview"; return {id:id,label:"",exportBaseName:String(wz.model.exportAutoBaseName||""),exportPresetName:id,presetMode:"slot",slotSelections:clone(wz.selections||{}),picture:clone(wz.model.currentPicture||{}),layers:layers,exportedImage:null}; }
    async function updatePreview(){ const box=q("preview"); if(!box)return; const seq=++wz.previewSeq; const ids=selectedLayerIds(); const d=buildDraft(); if(!d){box.innerHTML="<div class='empty'>PSDを選択してください</div>";return;} if(!ids.length){ const msg=wz.step===2?"候補を選択し、表示するレイヤーにチェックを入れてください。":(wz.step===3?"組み合わせで候補を選択してください。":""); box.innerHTML="<div class='empty'>"+ehtml(msg)+"</div>";return;} box.innerHTML="<div class='empty'>生成中...</div>"; try{const url=await bridge("previewLibraryDraftDataUrl",wz.psdKey,d); if(seq!==wz.previewSeq)return; box.innerHTML=url?"<img src='"+url+"'>":"<div class='empty'>プレビュー生成不可</div>";}catch(err){if(seq===wz.previewSeq)box.innerHTML="<div class='empty warn'>"+ehtml(err?.message||err)+"</div>";}}
    function renderSteps(){q("steps").innerHTML=labels.map((l,i)=>"<div class='step "+(i===wz.step?"active":"")+"'>"+ehtml(l)+"</div>").join(""); q("prevBtn").style.visibility=wz.step?"visible":"hidden"; q("nextBtn").style.display=wz.step<3?"inline-block":"none"; q("applyBtn").style.display=wz.step>=1?"inline-block":"none";}
    function render(){ renderSteps(); const b=q("body"); b.innerHTML=""; if(wz.step===0)renderStepPsd(b); else if(wz.step===1)renderStepSlots(b); else if(wz.step===2)renderStepAssign(b); else renderStepVariable(b); updatePreview(); }
    function renderStepPsd(b){ b.innerHTML='<div class="note">登録済みPSDを選択します。次へ進むと、体・衣装・表情スロットが未作成なら自動追加します。</div>'; (manager?.registered||[]).forEach(p=>{const r=doc.createElement("div");r.className="row"+(p.key===wz.psdKey?" selected":"");r.innerHTML="<div class='title'>"+ehtml(p.label)+"</div><div class='meta'>名前ID "+(p.presetCount||0)+" / スロット "+(p.slotCount||0)+" / レイヤー "+(p.layerCount||0)+"</div>";r.onclick=()=>{wz.psdKey=p.key;render();};b.appendChild(r);}); }
    function renderStepSlots(b){ b.innerHTML='<div class="note">スロットは「体」「衣装」「表情」のような差分カテゴリです。ここでは追加・削除・名前変更を行います。</div>'; const actions=doc.createElement("div");actions.className="actions"; const add=doc.createElement("button");add.textContent="＋スロット";add.onclick=()=>{const id=wid("slot_"+(wz.slots.length+1),"slot");wz.slots.push({id:id,name:id,multiSelect:false,order:wz.slots.length,gameVariableId:0,autoVariableSync:false,options:[]});wz.selectedSlotId=id;render();}; const defs=doc.createElement("button");defs.textContent="体・衣装・表情を補完";defs.onclick=()=>{wz.slots=ensureDefaultWizardSlots(wz.slots);render();};actions.append(add,defs);b.appendChild(actions); wizardSortedSlots(wz.slots).forEach((s,idx)=>{const row=doc.createElement("div");row.className="row"+(s.id===wz.selectedSlotId?" selected":"");row.innerHTML="<div class='title'>"+ehtml(s.name||s.id)+"</div><div class='meta'>"+ehtml(s.id)+" / 候補 "+(s.options?.length||0)+" / "+(s.multiSelect?"複数選択":"1つ選択")+"</div>";row.onclick=()=>{wz.selectedSlotId=s.id;wz.selectedOptionId="";render();};b.appendChild(row);}); const s=activeSlot(); if(s){const box=doc.createElement("div");box.className="grid2"; box.innerHTML="<label>スロットID<input id='slotIdInput' value='"+ehtml(s.id)+"'></label><label>表示名<input id='slotNameInput' value='"+ehtml(s.name||s.id)+"'></label>";b.appendChild(box); q("slotIdInput").onchange=ev=>{const old=s.id;const nv=wid(ev.target.value,old);if(!wz.slots.some(x=>x!==s&&x.id===nv)){s.id=nv;wz.selectedSlotId=nv;wz.selections[nv]=wz.selections[old];delete wz.selections[old];render();}}; q("slotNameInput").oninput=ev=>{s.name=ev.target.value;}; const checks=doc.createElement("label");checks.innerHTML="<span>複数候補を同時選択</span>"; const cb=doc.createElement("input");cb.type="checkbox";cb.checked=!!s.multiSelect;cb.onchange=()=>{s.multiSelect=cb.checked;ensureSelections();render();};checks.appendChild(cb);b.appendChild(checks); const del=doc.createElement("button");del.className="danger";del.textContent="このスロットを削除";del.onclick=()=>{if(confirm("スロットを削除しますか？")){wz.slots=wz.slots.filter(x=>x!==s);wz.selectedSlotId=wz.slots[0]?.id||"";render();}};b.appendChild(del);} }
    function renderSlotPills(b){const bar=doc.createElement("div");bar.className="slotBar"; wizardSortedSlots(wz.slots).forEach(s=>{const p=doc.createElement("div");p.className="slotPill"+(s.id===wz.selectedSlotId?" selected":"");p.textContent=s.name||s.id;p.onclick=()=>{wz.selectedSlotId=s.id;wz.selectedOptionId="";render();};bar.appendChild(p);});b.appendChild(bar);}
    function renderStepAssign(b){ b.innerHTML='<div class="note">スロットの並びは「上ほど手前」です。スロットを選び、その中の候補を作ってから、候補ごとに表示レイヤーをチェックします。</div>'; renderSlotPills(b); const s=activeSlot(); if(!s){b.innerHTML+='<div class="empty">先にスロットを作成してください。</div>';return;} const ord=doc.createElement("div");ord.className="actions"; const up=doc.createElement("button");up.textContent="↑ 手前へ";up.onclick=()=>{const sorted=wizardSortedSlots(wz.slots);const i=sorted.indexOf(s);if(i>0){const o=sorted[i-1].order;sorted[i-1].order=s.order;s.order=o;render();}}; const down=doc.createElement("button");down.textContent="↓ 奥へ";down.onclick=()=>{const sorted=wizardSortedSlots(wz.slots);const i=sorted.indexOf(s);if(i>=0&&i<sorted.length-1){const o=sorted[i+1].order;sorted[i+1].order=s.order;s.order=o;render();}};ord.append(up,down);b.appendChild(ord); const panel=doc.createElement("div");panel.className="candidatePanel"; const head=doc.createElement("div");head.className="candidateHeader"; const title=doc.createElement("div");title.className="candidateTitle";title.textContent="候補欄："+(s.name||s.id); const addO=doc.createElement("button");addO.textContent="＋候補";addO.onclick=()=>{const id=wid("part_"+((s.options||[]).length+1),"part");s.options=s.options||[];s.options.push({id:id,name:id,layers:[]});wz.selectedOptionId=id;ensureSelections();render();};head.append(title,addO);panel.appendChild(head); if(!(s.options||[]).length){const emp=doc.createElement("div");emp.className="candidateListEmpty";emp.textContent="候補がまだありません。＋候補で、このスロットに入るパーツ候補を作成してください。";panel.appendChild(emp);} (s.options||[]).forEach(o=>{const r=doc.createElement("div");r.className="row"+(o.id===wz.selectedOptionId?" selected":"");r.innerHTML="<div class='title'>"+ehtml(o.name||o.id)+"</div><div class='meta'>"+ehtml(o.id)+" / レイヤー "+(o.layers?.length||0)+"</div>";r.onclick=()=>{wz.selectedOptionId=o.id;render();};panel.appendChild(r);}); b.appendChild(panel); const o=activeOption(); if(!o){const emp=doc.createElement("div");emp.className="empty";emp.textContent="候補を選択すると、候補ID・候補名・表示レイヤーを編集できます。";b.appendChild(emp);return;} const grid=doc.createElement("div");grid.className="grid2";grid.innerHTML="<label>候補ID<input id='optIdInput' value='"+ehtml(o.id)+"'></label><label>候補名<input id='optNameInput' value='"+ehtml(o.name||o.id)+"'></label>";b.appendChild(grid); q("optIdInput").onchange=ev=>{const old=o.id;const nv=wid(ev.target.value,old);if(!s.options.some(x=>x!==o&&x.id===nv)){o.id=nv;wz.selectedOptionId=nv;if(wz.selections[s.id]===old)wz.selections[s.id]=nv;render();}}; q("optNameInput").oninput=ev=>{o.name=ev.target.value;}; const layerNote=doc.createElement("div");layerNote.className="note";layerNote.textContent="この候補で表示するレイヤーだけにチェックを入れてください。右のプレビューも、この候補のチェック済みレイヤーだけを表示します。";b.appendChild(layerNote); const set=new Set(o.layers||[]); (wz.model?.layerAssets||[]).forEach(layer=>{const l=doc.createElement("label");l.className="layerRow";const cb=doc.createElement("input");cb.type="checkbox";cb.checked=set.has(layer.id);cb.onchange=()=>{const ns=new Set(o.layers||[]);if(cb.checked)ns.add(layer.id);else ns.delete(layer.id);o.layers=Array.from(ns);updatePreview();};const t=doc.createElement("div");t.innerHTML="<div class='title'>"+ehtml(layer.name||layer.id)+"</div><div class='meta'>"+ehtml(layer.fileName||"")+"</div>";l.append(cb,t);b.appendChild(l);}); }
    function renderStepVariable(b){ b.innerHTML='<div class="note">相互干渉ゲーム変数の設定欄です。ここではスロットごとの変数番号を保存します。実ゲーム上の自動同期・変数変更検知は次段階でプラグイン側へ実装します。</div>'; wizardSortedSlots(wz.slots).forEach(s=>{const row=doc.createElement("div");row.className="row";row.innerHTML="<div class='title'>"+ehtml(s.name||s.id)+"</div><div class='meta'>"+ehtml(s.id)+"</div><div class='grid2'><label>相互干渉ゲーム変数ID<input type='number' min='0' value='"+(Number(s.gameVariableId||0))+"' data-role='var'></label><label>自動同期<select data-role='auto'><option value='false'>OFF</option><option value='true'>ON</option></select></label></div>"; const inp=row.querySelector('[data-role=var]');inp.oninput=()=>{s.gameVariableId=Math.max(0,Number(inp.value||0));}; const sel=row.querySelector('[data-role=auto]');sel.value=s.autoVariableSync?"true":"false";sel.onchange=()=>{s.autoVariableSync=sel.value==="true";};b.appendChild(row);}); const c=doc.createElement("div");c.className="note";c.innerHTML="<b>組み合わせプレビュー選択</b><br>ここで選んだ組み合わせを、管理画面の編集中名前IDへ反映できます。";b.appendChild(c); wizardSortedSlots(wz.slots).forEach(s=>{const row=doc.createElement("label");row.textContent=s.name||s.id; if(s.multiSelect){const box=doc.createElement("div"); (s.options||[]).forEach(o=>{const l=doc.createElement("label");l.className="layerRow";const cb=doc.createElement("input");cb.type="checkbox";cb.checked=Array.isArray(wz.selections[s.id])&&wz.selections[s.id].includes(o.id);cb.onchange=()=>{const ns=new Set(Array.isArray(wz.selections[s.id])?wz.selections[s.id]:[]);if(cb.checked)ns.add(o.id);else ns.delete(o.id);wz.selections[s.id]=Array.from(ns);updatePreview();};l.append(cb,doc.createTextNode(o.name||o.id));box.appendChild(l);});row.appendChild(box);}else{const sel=doc.createElement("select");const none=doc.createElement("option");none.value="";none.textContent="（なし）";sel.appendChild(none);(s.options||[]).forEach(o=>{const op=doc.createElement("option");op.value=o.id;op.textContent=o.name||o.id;if(wz.selections[s.id]===o.id)op.selected=true;sel.appendChild(op);});sel.onchange=()=>{wz.selections[s.id]=sel.value;updatePreview();};row.appendChild(sel);} b.appendChild(row);}); }
    async function applyToManager(){ if(!wz.psdKey){alert("PSDを選択してください。");return;} if(wz.psdKey!==selectedPsdKey){await selectPsd(wz.psdKey);} comboSlots=ensureDefaultWizardSlots(wz.slots); comboDirty=true; selectedComboSlotId=comboSlots[0]?.id||""; selectedComboOptionId=comboSlots[0]?.options?.[0]?.id||""; await saveComboSlots(); const d=buildDraft(); if(d){draft=d;draft.id=nextDraftNameId("stand");draft.exportPresetName=draft.id;draft.presetMode="slot";draftSourceId="";selectedPresetId="";draftDirty=true;renderPresetList();renderPresetModeColumn();renderEditor();schedulePreview(120);} showNotice("ウィザード設定を管理画面へ反映しました。必要なら編集中を保存・PNG書き出ししてください。"); }
    q("closeBtn").onclick=()=>standPictureWizardWindow.close(); q("prevBtn").onclick=()=>{if(wz.step>0){wz.step--;render();}}; q("nextBtn").onclick=async()=>{if(wz.step===0){if(!wz.psdKey){alert("PSDを選択してください。");return;} await loadWizardModel();} wz.step=Math.min(3,wz.step+1); render();}; q("applyBtn").onclick=()=>void applyToManager();
    (async()=>{if(wz.psdKey)await loadWizardModel(); render(); try{standPictureWizardWindow.focus();}catch(e){}})();
  }

  function renderLayerSection(box){
    const wrap=document.createElement("div");
    wrap.className="comboBox";
    const title=document.createElement("div");
    title.className="comboTitle";
    title.textContent="レイヤー構成";
    wrap.appendChild(title);
    const body=document.createElement("div");
    body.className="comboBody";
    wrap.appendChild(body);
    const guide=document.createElement("div");
    guide.className="layer-guide";
    guide.textContent="上ほど手前、下ほど奥です。☰をドラッグして前後関係を変更できます。";
    body.appendChild(guide);
    const layers=document.createElement("div");
    layers.className="layer-list";
    let draggingLayerId="";
    const orderedLayers=(draft.layers||[]).slice().sort((a,b)=>{
      const pa=Number(a.priority||0);
      const pb=Number(b.priority||0);
      if(pa!==pb) return pb-pa;
      return String(a.id||"").localeCompare(String(b.id||""));
    });
    const applyLayerVisualOrder=idList=>{
      const current=(draft.layers||[]).map(layer=>clone(layer));
      const byId=new Map(current.map(layer=>[String(layer.id||""),layer]));
      const next=[];
      idList.forEach(id=>{ if(byId.has(id)){ next.push(byId.get(id)); byId.delete(id); } });
      current.forEach(layer=>{ const id=String(layer.id||""); if(byId.has(id)){ next.push(layer); byId.delete(id); } });
      const count=next.length;
      next.forEach((layer,index)=>{ layer.priority=count-index; });
      updateDraft({layers:next,exportedImage:null},160);
      renderPresetModeColumn();
    };
    if(!orderedLayers.length){
      const e=document.createElement("div");
      e.className="empty";
      e.textContent="レイヤーがありません。";
      layers.appendChild(e);
    }
    orderedLayers.forEach(layer=>{
      const row=document.createElement("div");
      row.className="layer-row"+(layer.visible===false?" off":"");
      row.dataset.layerId=String(layer.id||"");
      row.title=(layer.folder||"pictures")+" / "+(layer.fileName||"画像未指定");
      row.addEventListener("dragover",ev=>{ if(!draggingLayerId)return; ev.preventDefault(); ev.dataTransfer.dropEffect="move"; row.classList.add("drop-target"); });
      row.addEventListener("dragenter",()=>{ if(draggingLayerId) row.classList.add("drop-target"); });
      row.addEventListener("dragleave",()=>row.classList.remove("drop-target"));
      row.addEventListener("drop",ev=>{
        ev.preventDefault();
        row.classList.remove("drop-target");
        const fromId=String(draggingLayerId||ev.dataTransfer.getData("text/plain")||"");
        const toId=String(row.dataset.layerId||"");
        if(!fromId||!toId||fromId===toId)return;
        const ids=orderedLayers.map(l=>String(l.id||""));
        const from=ids.indexOf(fromId);
        const to=ids.indexOf(toId);
        if(from<0||to<0)return;
        ids.splice(from,1);
        ids.splice(to,0,fromId);
        applyLayerVisualOrder(ids);
      });
      const cb=bindEditorField(document.createElement("input"));
      cb.type="checkbox";
      cb.checked=layer.visible!==false;
      cb.onchange=()=>{
        const next=clone(draft.layers);
        const t=next.find(x=>x.id===layer.id);
        if(t)t.visible=cb.checked;
        row.classList.toggle("off",!cb.checked);
        updateDraft({layers:next,exportedImage:null},160);
      };
      const handle=document.createElement("div");
      handle.className="drag-handle";
      handle.textContent="☰";
      handle.title="ドラッグで並び替え";
      handle.draggable=true;
      handle.addEventListener("dragstart",ev=>{
        draggingLayerId=String(layer.id||"");
        row.classList.add("dragging");
        ev.dataTransfer.effectAllowed="move";
        ev.dataTransfer.setData("text/plain",draggingLayerId);
      });
      handle.addEventListener("dragend",()=>{
        draggingLayerId="";
        document.querySelectorAll(".layer-row.dragging,.layer-row.drop-target").forEach(el=>el.classList.remove("dragging","drop-target"));
      });
      const layerTitle=document.createElement("div");
      layerTitle.className="title";
      layerTitle.textContent=layer.name||layer.id||"レイヤー";
      const blend=bindEditorField(document.createElement("select"));
      [["normal","通常"],["add","加算"],["multiply","乗算"],["screen","スクリーン"]].forEach(([v,l])=>{
        const o=document.createElement("option");
        o.value=v;
        o.textContent=l;
        if((layer.blendMode||"normal")===v)o.selected=true;
        blend.appendChild(o);
      });
      blend.onchange=()=>{
        const next=clone(draft.layers);
        const t=next.find(x=>x.id===layer.id);
        if(t)t.blendMode=blend.value;
        updateDraft({layers:next,exportedImage:null},160);
      };
      row.appendChild(cb);
      row.appendChild(handle);
      row.appendChild(layerTitle);
      row.appendChild(blend);
      layers.appendChild(row);
    });
    body.appendChild(layers);
    box.appendChild(wrap);
  }

  function renderComboSection(box){
    const wrap=document.createElement("div"); wrap.className="comboBox";
    const title=document.createElement("div"); title.className="comboTitle"; title.textContent="スロット式プリセット"+(comboDirty?" ＊未保存":""); wrap.appendChild(title);
    const body=document.createElement("div"); body.className="comboBody"; wrap.appendChild(body);
    const help=document.createElement("div"); help.className="comboHelp"; help.textContent="衣装・体・表情などをスロット化し、各候補にPSDレイヤーを割り当てます。下の組み合わせ選択から、編集中の名前IDへ反映できます。"; body.appendChild(help);
    const btns=document.createElement("div"); btns.className="comboMiniBtns";
    const addSlot=document.createElement("button"); addSlot.type="button"; addSlot.textContent="＋スロット"; addSlot.onclick=()=>{ const id=nextComboId("slot",comboSlots); comboSlots.push({id,name:id,multiSelect:false,options:[]}); selectedComboSlotId=id; selectedComboOptionId=""; markComboDirty(); renderPresetModeColumn(); };
    const addOpt=document.createElement("button"); addOpt.type="button"; addOpt.textContent="＋候補"; addOpt.onclick=()=>{ const s=selectedComboSlot(); if(!s){showNotice("先にスロットを作成してください。");return;} const id=nextComboId("option",s.options||[]); s.options=s.options||[]; s.options.push({id,name:id,layers:[]}); selectedComboOptionId=id; if(!s.multiSelect&&!comboSelections[s.id]) comboSelections[s.id]=id; markComboDirty(); renderPresetModeColumn(); };
    const save=document.createElement("button"); save.type="button"; save.textContent="スロット設定保存"; save.className="primary"; save.onclick=()=>void saveComboSlots();
    btns.appendChild(addSlot); btns.appendChild(addOpt); btns.appendChild(save); body.appendChild(btns);
    const list=document.createElement("div"); list.className="comboList";
    if(!comboSlots.length){ const e=document.createElement("div"); e.className="empty"; e.textContent="まだスロットがありません。＋スロットから作成してください。"; list.appendChild(e); }
    comboSlots.forEach(s=>{ const row=document.createElement("div"); row.className="comboRow"+(s.id===selectedComboSlotId?" selected":""); const info=document.createElement("div"); info.innerHTML="<div class='title'>"+esc(s.name||s.id)+"</div><div class='meta'>"+esc(s.id)+" / 候補 "+(s.options?.length||0)+(s.multiSelect?" / 複数選択":" / 1つ選択")+"</div>"; const del=document.createElement("button"); del.type="button"; del.textContent="×"; del.className="danger"; del.onclick=ev=>{ev.stopPropagation(); if(!safeConfirm("スロット『"+(s.name||s.id)+"』を削除しますか？"))return; comboSlots=comboSlots.filter(x=>x!==s); delete comboSelections[s.id]; selectedComboSlotId=""; selectedComboOptionId=""; ensureComboState(); markComboDirty(); renderPresetModeColumn();}; row.onclick=()=>{selectedComboSlotId=s.id; selectedComboOptionId=""; ensureComboState(); renderPresetModeColumn();}; row.appendChild(info); row.appendChild(del); list.appendChild(row); });
    body.appendChild(list);
    const slot=selectedComboSlot();
    if(slot){
      const label=document.createElement("div"); label.className="comboSectionLabel"; label.textContent="選択中スロット"; body.appendChild(label);
      const grid=document.createElement("div"); grid.className="grid2";
      const idRow=input("スロットID",slot.id,v=>{ const newId=safeTextId(v,slot.id); if(!newId||comboSlots.some(s=>s!==slot&&s.id===newId)) return; const old=slot.id; slot.id=newId; if(selectedComboSlotId===old) selectedComboSlotId=newId; comboSelections[newId]=comboSelections[old]; delete comboSelections[old]; markComboDirty(); }); grid.appendChild(idRow);
      const nameRow=input("表示名",slot.name||slot.id,v=>{slot.name=String(v||slot.id); markComboDirty();}); grid.appendChild(nameRow);
      body.appendChild(grid);
      body.appendChild(checkbox("このスロットは複数候補を同時選択できる",!!slot.multiSelect,v=>{ slot.multiSelect=!!v; if(v){comboSelections[slot.id]=comboSelections[slot.id]?[comboSelections[slot.id]]:[];}else{comboSelections[slot.id]=Array.isArray(comboSelections[slot.id])?(comboSelections[slot.id][0]||""):(comboSelections[slot.id]||"");} markComboDirty(); renderPresetModeColumn(); }));
      const optList=document.createElement("div"); optList.className="comboList";
      (slot.options||[]).forEach(o=>{ const row=document.createElement("div"); row.className="comboRow"+(o.id===selectedComboOptionId?" selected":""); const info=document.createElement("div"); info.innerHTML="<div class='title'>"+esc(o.name||o.id)+"</div><div class='meta'>"+esc(o.id)+" / レイヤー "+(o.layers?.length||0)+"</div>"; const del=document.createElement("button"); del.type="button"; del.textContent="×"; del.className="danger"; del.onclick=ev=>{ev.stopPropagation(); if(!safeConfirm("候補『"+(o.name||o.id)+"』を削除しますか？"))return; slot.options=slot.options.filter(x=>x!==o); if(Array.isArray(comboSelections[slot.id])) comboSelections[slot.id]=comboSelections[slot.id].filter(id=>id!==o.id); else if(comboSelections[slot.id]===o.id) comboSelections[slot.id]=""; selectedComboOptionId=""; ensureComboState(); markComboDirty(); renderPresetModeColumn();}; row.onclick=()=>{selectedComboOptionId=o.id; renderPresetModeColumn();}; row.appendChild(info); row.appendChild(del); optList.appendChild(row); });
      body.appendChild(optList);
      const opt=selectedComboOption();
      if(opt){
        const ol=document.createElement("div"); ol.className="comboSectionLabel"; ol.textContent="候補編集"; body.appendChild(ol);
        const og=document.createElement("div"); og.className="grid2";
        og.appendChild(input("候補ID",opt.id,v=>{ const newId=safeTextId(v,opt.id); if(!newId||slot.options.some(o=>o!==opt&&o.id===newId)) return; const old=opt.id; opt.id=newId; if(selectedComboOptionId===old) selectedComboOptionId=newId; if(Array.isArray(comboSelections[slot.id])) comboSelections[slot.id]=comboSelections[slot.id].map(id=>id===old?newId:id); else if(comboSelections[slot.id]===old) comboSelections[slot.id]=newId; markComboDirty(); }));
        og.appendChild(input("候補名",opt.name||opt.id,v=>{opt.name=String(v||opt.id); markComboDirty();}));
        body.appendChild(og);
        const layerLabel=document.createElement("div"); layerLabel.className="comboSectionLabel"; layerLabel.textContent="この候補で表示するレイヤー"; body.appendChild(layerLabel);
        const layerBox=document.createElement("div");
        const selectedLayers=new Set(opt.layers||[]);
        (model.layerAssets||[]).forEach(layer=>{ const r=document.createElement("label"); r.className="comboLayerRow"; const cb=bindEditorField(document.createElement("input")); cb.type="checkbox"; cb.checked=selectedLayers.has(layer.id); cb.onchange=()=>{ const set=new Set(opt.layers||[]); if(cb.checked)set.add(layer.id); else set.delete(layer.id); opt.layers=Array.from(set); markComboDirty(); }; const text=document.createElement("div"); text.innerHTML="<div class='title'>"+esc(layer.name||layer.id)+"</div><div class='meta'>"+esc(layer.fileName||"")+"</div>"; r.appendChild(cb); r.appendChild(text); layerBox.appendChild(r); });
        body.appendChild(layerBox);
      }
    }
    const comboLabel=document.createElement("div"); comboLabel.className="comboSectionLabel"; comboLabel.textContent="組み合わせ選択"; body.appendChild(comboLabel);
    comboSlots.forEach(s=>{
      const row=document.createElement("label"); row.textContent=s.name||s.id;
      if(s.multiSelect){
        const box=document.createElement("div"); box.className="comboList";
        (s.options||[]).forEach(o=>{ const l=document.createElement("label"); l.className="comboLayerRow"; const cb=bindEditorField(document.createElement("input")); cb.type="checkbox"; cb.checked=Array.isArray(comboSelections[s.id])&&comboSelections[s.id].includes(o.id); cb.onchange=()=>{ const set=new Set(Array.isArray(comboSelections[s.id])?comboSelections[s.id]:[]); if(cb.checked)set.add(o.id); else set.delete(o.id); comboSelections[s.id]=Array.from(set); }; l.appendChild(cb); l.append(o.name||o.id); box.appendChild(l); });
        row.appendChild(box);
      }else{
        const sel=bindEditorField(document.createElement("select")); const none=document.createElement("option"); none.value=""; none.textContent="（なし）"; sel.appendChild(none); (s.options||[]).forEach(o=>{ const op=document.createElement("option"); op.value=o.id; op.textContent=o.name||o.id; if(comboSelections[s.id]===o.id) op.selected=true; sel.appendChild(op); }); sel.onchange=()=>{comboSelections[s.id]=sel.value;}; row.appendChild(sel);
      }
      body.appendChild(row);
    });
    const nameRow=input("生成する名前ID",comboNameFromSelections(),v=>{comboNameSeed=String(v||"");}); body.appendChild(nameRow);
    const apply=document.createElement("button"); apply.type="button"; apply.className="primary"; apply.textContent="この組み合わせを編集中へ反映"; apply.onclick=()=>{ const next=buildComboDraft(); if(!next){showNotice("組み合わせを作成できません。");return;} if(!next.layers.length&&!safeConfirm("選択レイヤーが0件です。このまま編集中へ反映しますか？"))return; draft=next; draftSourceId=""; selectedPresetId=""; draftDirty=true; exportDiffTouched=false; renderPresetList(); renderPresetModeColumn(); renderEditor(); schedulePreview(120); showNotice("組み合わせを編集中へ反映しました。必要なら『編集中を保存』してください。"); };
    body.appendChild(apply);
    box.appendChild(wrap);
  }
  function renderEditor(){
    const box=document.getElementById("editor");
    box.innerHTML="";
    if(!model){ box.innerHTML="<div class='empty'>登録済みPSDを選択してください。</div>"; return; }
    ensureDraft();
    const nameRow=input("名前ID",draft.id,v=>{
      const oldId=String(draft.id||"");
      const shouldFollow=!exportDiffTouched||!String(draft.exportPresetName||"").trim()||String(draft.exportPresetName||"")===oldId||String(draft.exportPresetName||"")==="preset";
      const patch={id:v,exportedImage:null};
      if(shouldFollow) patch.exportPresetName=v;
      updateDraft(patch);
      const diffEl=document.getElementById("draftExportPresetInput");
      if(shouldFollow&&diffEl) diffEl.value=v;
    });
    nameRow.querySelector("input").id="draftNameIdInput";
    box.appendChild(nameRow);
    const baseRow=input("出力ファイル名：ベース",draft.exportBaseName||"",v=>updateDraft({exportBaseName:v,exportedImage:null}));
    baseRow.querySelector("input").id="draftExportBaseInput";
    box.appendChild(baseRow);
    const diffRow=input("出力ファイル名：差分",draft.exportPresetName||draft.id,v=>{ exportDiffTouched=true; updateDraft({exportPresetName:v,exportedImage:null}); });
    diffRow.querySelector("input").id="draftExportPresetInput";
    box.appendChild(diffRow);
    const final=document.createElement("div");
    final.id="finalFileName";
    final.className="finalFileBox";
    box.appendChild(final);
    const labelRow=textarea("メモ",draft.label||"",v=>updateDraft({label:v}));
    labelRow.querySelector("textarea").id="draftLabelInput";
    box.appendChild(labelRow);
    const pic=draft.picture||{};
    const grid=document.createElement("div");
    grid.className="grid2";
    const picXRow=input("X",pic.x||0,v=>updateDraft({picture:Object.assign({},draft.picture,{x:v}),exportedImage:null}),"number"); picXRow.querySelector("input").id="draftPictureXInput"; grid.appendChild(picXRow);
    const picYRow=input("Y",pic.y||0,v=>updateDraft({picture:Object.assign({},draft.picture,{y:v}),exportedImage:null}),"number"); picYRow.querySelector("input").id="draftPictureYInput"; grid.appendChild(picYRow);
    const picWRow=input("幅",pic.width||96,v=>updateDraft({picture:Object.assign({},draft.picture,{width:Math.max(1,v)}),exportedImage:null}),"number","min=1"); picWRow.querySelector("input").id="draftPictureWidthInput"; grid.appendChild(picWRow);
    const picHRow=input("高さ",pic.height||64,v=>updateDraft({picture:Object.assign({},draft.picture,{height:Math.max(1,v)}),exportedImage:null}),"number","min=1"); picHRow.querySelector("input").id="draftPictureHeightInput"; grid.appendChild(picHRow);
    const picORow=input("不透明度",pic.opacity??255,v=>updateDraft({picture:Object.assign({},draft.picture,{opacity:Math.max(0,Math.min(255,v))}),exportedImage:null}),"number","min=0 max=255"); picORow.querySelector("input").id="draftPictureOpacityInput"; grid.appendChild(picORow);
    const picZRow=input("表示順",pic.zOrder||0,v=>updateDraft({picture:Object.assign({},draft.picture,{zOrder:v}),exportedImage:null}),"number"); picZRow.querySelector("input").id="draftPictureZOrderInput"; grid.appendChild(picZRow);
    box.appendChild(grid);
    const visibleRow=checkbox("表示する",pic.visible!==false,v=>updateDraft({picture:Object.assign({},draft.picture,{visible:v}),exportedImage:null},160)); visibleRow.querySelector("input").id="draftPictureVisibleInput"; box.appendChild(visibleRow);

    // スロット設定とレイヤー構成編集は編集中設定から外しました。
    // スロット式は立ち絵作成ウィザード、プリセット追加/削除はプリセット列で扱います。
    updateDynamicBits();
  }
  function schedulePreview(delay=220){ clearTimeout(previewTimer); previewTimer=setTimeout(loadPreview,delay); }
  async function loadPreview(){ const box=document.getElementById("previewBox"); const seq=++previewSeq; syncDraftFromEditorFields(false); if(!model||!draft){box.innerHTML="<div class='empty'>PSDを選択してください</div>";return;} const snapshot=clone(draft); if(!isEditorFieldActive()) box.innerHTML="<div class='empty'>生成中...</div>"; try{ const url=await bridge("previewLibraryDraftDataUrl",selectedPsdKey,snapshot); if(seq!==previewSeq) return; box.innerHTML=url?"<img src='"+url+"'>":"<div class='empty'>プレビュー生成不可</div>"; const file=await bridge("expectedLibraryDraftFileName",selectedPsdKey,snapshot); if(seq!==previewSeq) return; setStatus("編集中の出力予定: img/pictures/composite_export/"+file+".png"); }catch(e){ if(seq===previewSeq) box.innerHTML="<div class='empty warn'>"+esc(e.message||e)+"</div>"; } }
  async function saveDraft(overwrite=false){ syncDraftFromEditorFields(true); if(!selectedPsdKey||!draft){setStatus("保存先PSDがありません。");return false;} if(!String(draft.id||"").trim()){setStatus("名前IDを入力してください。");showNotice("名前IDを入力してください。");return false;} let r=await bridge("saveDraft",selectedPsdKey,clone(draft),{sourcePresetId:draftSourceId,overwrite}); if(r?.conflict){ if(!safeConfirm((r.message||"名前IDが重複しています。上書きしますか？")+"\\\n\\\nOK: 上書き / キャンセル: 中止")) return false; r=await bridge("saveDraft",selectedPsdKey,draft,{sourcePresetId:draftSourceId,overwrite:true}); } if(!r||r.ok===false){setStatus(r?.message||"保存に失敗しました。");showNotice(r?.message||"保存に失敗しました。");return false;} draftSourceId=r.presetId||draft.id; selectedPresetId=draftSourceId; draft.id=draftSourceId; draftDirty=false; await refreshAll(false); return true; }
  async function acquireProjectWritePermission(){ if(!window.showDirectoryPicker){setStatus("この環境では管理ウィンドウからフォルダ権限を取得できません。メインウィンドウの『ツールプロジェクト読込』から開き直してください。");return false;} try{const handle=await window.showDirectoryPicker({mode:"readwrite"}); const r=await bridge("setProjectDirectoryHandleFromManager",handle); setStatus(r?.message||""); showNotice(r?.message||""); if(r?.ok){ await refreshAll(true); } return !!r?.ok;}catch(e){ if(e&&e.name==="AbortError") return false; setStatus(e?.message||String(e)); return false;} }
  async function ensureProjectAccessReady(){ const st=await bridge("getProjectWriteStatus"); if(st?.writeGranted) return true; const ok=safeConfirm((st?.message||"プロジェクトフォルダの権限がありません。")+"\\n\\nツクールのプロジェクトフォルダを選び直しますか？"); if(!ok) return false; return await acquireProjectWritePermission(); }
  document.getElementById("psdRegisterWindowBtn")?.addEventListener("click",()=>void openPsdRegistrationWindow());
  document.getElementById("standWizardTopBtn")?.addEventListener("click",()=>{
    if(!model){showNotice("先に登録済みPSDを選択してください。"); return;}
    ensureDraft();
    if(draft.presetMode!=="slot"){
      if(!safeConfirm("立ち絵作成ウィザードはスロット式プリセット用です。選択中プリセットをスロット式に変更して開きますか？"))return;
      draft.presetMode="slot";
      draftDirty=true;
      renderPresetModeColumn();
      schedulePreview(120);
    }
    openStandPictureWizardWindow();
  });
  document.getElementById("saveDraftBtn").onclick=async()=>{await doBridge("保存",async()=>{
    if(!selectedPsdKey||!draft){showNotice("保存するプリセットがありません。");return;}
    syncDraftFromEditorFields(true);
    const exists=(model?.presets||[]).some(p=>String(p.id||"")===String(draft.id||""));
    if(!draftSourceId&&!exists){
      if(!safeConfirm("名前ID『"+String(draft.id||"")+"』のプリセットはまだ存在しません。新規追加しますか？"))return;
      await saveDraft(false);
      return;
    }
    await saveDraft(!!draftSourceId);
  });};
  document.getElementById("projectWriteBtn").onclick=async()=>{await acquireProjectWritePermission();};
  document.getElementById("editor").addEventListener("focusin",()=>{editorInputFocused=true;},true);
  document.getElementById("editor").addEventListener("focusout",()=>{setTimeout(()=>{editorInputFocused=isEditorFieldActive();},0);},true);
  window.addEventListener("message",ev=>{if(ev?.data?.type==="DB_UIComposer_CompositePresetManagerFocus"){try{window.focus();}catch(e){} refreshAll(true);}});
  refreshAll(false);
})();
</script>
</body>
</html>`;
  }

  async function getOrCreateNestedDirectoryHandle(baseHandle, segments) {
    let current = baseHandle;
    for (const segment of segments) current = await current.getDirectoryHandle(segment, { create: true });
    return current;
  }

  async function getNestedDirectoryHandle(baseHandle, segments) {
    let current = baseHandle;
    for (const segment of segments) current = await current.getDirectoryHandle(segment, { create: false });
    return current;
  }

  async function writeBlobToFileHandle(handle, blob) {
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
  }

  async function readJsonFileHandle(handle) {
    const file = await handle.getFile();
    return JSON.parse(await file.text());
  }

  function psdImportFolderInfo(fileName, sourcePath = "") {
    const rel = normalizeProjectPsdPath(sourcePath || fileName || "");
    if (rel) {
      const withoutRoot = rel.replace(/^PSD\//i, "").replace(/\.psd$/i, "");
      const segments = withoutRoot.split("/").map((part, index) => sanitizeImportName(part, index === 0 ? "psd_import" : "folder")).filter(Boolean);
      const base = segments[segments.length - 1] || sanitizeImportName(fileName || "psd_import", "psd_import");
      return {
        baseName: base,
        sourcePath: rel,
        assetFolder: `pictures/${PSD_IMPORT_ROOT_FOLDER}/${segments.join("/")}`,
        folderSegments: ["img", "pictures", PSD_IMPORT_ROOT_FOLDER].concat(segments)
      };
    }
    const baseSource = String(fileName || "").replace(/^.*[\/]/, "").replace(/\.[^.]+$/, "");
    const base = sanitizeImportName(baseSource, "psd_import");
    return {
      baseName: base,
      sourcePath: "",
      assetFolder: `pictures/${PSD_IMPORT_ROOT_FOLDER}/${base}`,
      folderSegments: ["img", "pictures", PSD_IMPORT_ROOT_FOLDER, base]
    };
  }

  function collectPsdLeafLayers(children, result, parentNames = [], parentVisible = true) {
    for (const rawLayer of children || []) {
      if (!rawLayer) continue;
      const visible = parentVisible && rawLayer.hidden !== true && rawLayer.visible !== false;
      const layerName = sanitizeImportName(rawLayer.name || rawLayer.id || "layer", "layer");
      if (Array.isArray(rawLayer.children)) {
        collectPsdLeafLayers(rawLayer.children, result, parentNames.concat(layerName), visible);
        continue;
      }
      // 非表示レイヤーもプリセット編集対象として登録します。
      // Photoshop上で非表示の表情差分・口差分なども、管理画面でONにできるようにするためです。
      const canvas = rawLayer.canvas || (window.agPsd?.getLayerCanvas ? window.agPsd.getLayerCanvas(rawLayer) : null);
      const width = Math.max(0, Number(rawLayer.right ?? ((rawLayer.left || 0) + (canvas?.width || 0))) - Number(rawLayer.left || 0));
      const height = Math.max(0, Number(rawLayer.bottom ?? ((rawLayer.top || 0) + (canvas?.height || 0))) - Number(rawLayer.top || 0));
      if (!canvas || width <= 0 || height <= 0) continue;
      result.push({
        name: layerName,
        pathNames: parentNames.concat(layerName),
        left: Number(rawLayer.left || 0),
        top: Number(rawLayer.top || 0),
        width: Math.max(1, canvas.width || width),
        height: Math.max(1, canvas.height || height),
        opacity: normalizePsdOpacity(rawLayer.opacity ?? 1),
        blendMode: normalizePsdBlendMode(rawLayer.blendMode || rawLayer.mode || "normal"),
        visible,
        canvas
      });
    }
  }

  function createImportedCompositeItem(win, sourceBaseName, folder, importedLayers, metadata = {}) {
    const minLeft = Math.min(...importedLayers.map(layer => Number(layer.left || 0)));
    const minTop = Math.min(...importedLayers.map(layer => Number(layer.top || 0)));
    const maxRight = Math.max(...importedLayers.map(layer => Number(layer.left || 0) + Math.max(1, Number(layer.width || 1))));
    const maxBottom = Math.max(...importedLayers.map(layer => Number(layer.top || 0) + Math.max(1, Number(layer.height || 1))));
    // PSD内のleft/topは「PSDキャンバス内の座標」なので、ツール上の親ウィンドウ内座標へそのまま入れると
    // 大きな立ち絵PSDなどで、パーツ自体がウィンドウ外へ飛んでプレビューされない。
    // レイヤー同士の位置関係は layer.x/y に正規化して保持し、統合画像パーツ本体は親ウィンドウの原点へ置く。
    const item = Object.assign({ type: "compositeImage", id: nextUniqueItemId(win, safeId(`psd_${sourceBaseName}`, "psd_import")), x: 0, y: 0, zOrder: 0, visible: true, allowOutsideWindow: true }, createDefaultCompositeImageItem());
    item.width = Math.max(1, Math.round(maxRight - minLeft));
    item.height = Math.max(1, Math.round(maxBottom - minTop));
    item.layers = importedLayers.map((layer, index) => {
      const ref = findProjectImage({ folder, fileName: layer.fileName });
      return Object.assign(createDefaultCompositeImageLayer(index), {
        id: safeId(layer.layerId || layer.name || `layer${index + 1}`, `layer${index + 1}`),
        name: String(layer.name || layer.layerId || `レイヤー${index + 1}`),
        visible: layer.visible !== false,
        folder,
        fileName: String(layer.fileName || ""),
        previewSrc: layer.previewSrc || ref?.url || "",
        previewName: layer.previewName || `${folder}/${layer.fileName}`,
        previewNaturalWidth: Math.max(1, Number(layer.width || 1)),
        previewNaturalHeight: Math.max(1, Number(layer.height || 1)),
        x: Math.round(Number(layer.left || 0) - minLeft),
        y: Math.round(Number(layer.top || 0) - minTop),
        width: Math.max(1, Math.round(Number(layer.width || 1))),
        height: Math.max(1, Math.round(Number(layer.height || 1))),
        opacity: normalizePsdOpacity(layer.opacity ?? 255),
        priority: Math.max(1, Number(layer.priority || (index + 1))),
        blendMode: normalizePsdBlendMode(layer.blendMode || "normal")
      });
    });
    item.selectedLayerIndex = 0;
    item.psdPresetLibraryDisabled = false;
    item.psdImport = {
      sourceFileName: metadata.sourceFileName || "",
      sourcePath: metadata.sourcePath || "",
      sourceBaseName,
      assetFolder: folder,
      importedAt: metadata.importedAt || new Date().toISOString(),
      layerCount: item.layers.length,
      cacheHit: !!metadata.cacheHit,
      sourceSize: Number(metadata.sourceSize || 0),
      sourceLastModified: Number(metadata.sourceLastModified || 0)
    };
    return item;
  }

  function imageBaseWidth(item) {
    return Math.max(1, Number(item.width || item.previewNaturalWidth || 96));
  }

  function imageBaseHeight(item) {
    return Math.max(1, Number(item.height || item.previewNaturalHeight || 64));
  }

  function imageScalePercent(item, axis) {
    const percentKey = axis === "scaleY" ? "scaleYPercent" : "scaleXPercent";
    if (item[percentKey] !== undefined && item[percentKey] !== null && item[percentKey] !== "") {
      return Math.max(1, Number(item[percentKey]) || 100);
    }
    const raw = axis === "scaleY" ? item.scaleY : item.scaleX;
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return 100;
    return n <= 10 ? Math.round(n * 10000) / 100 : n;
  }

  function setImageScalePercent(item, axis, value) {
    const percent = Math.max(1, Number(value) || 100);
    if (axis === "scaleY") {
      item.scaleYPercent = percent;
      item.scaleY = Math.round((percent / 100) * 10000) / 10000;
    } else {
      item.scaleXPercent = percent;
      item.scaleX = Math.round((percent / 100) * 10000) / 10000;
    }
  }

  function imageScaleRate(item, axis) {
    return imageScalePercent(item, axis) / 100;
  }

  function normalizeWindowBackgroundImage(bg) {
    const src = bg && typeof bg === "object" ? bg : createDefaultWindowBackgroundImage();
    return Object.assign(createDefaultWindowBackgroundImage(), src, {
      enabled: src.enabled === true,
      folder: String(src.folder || "pictures"),
      fileName: String(src.fileName || ""),
      opacity: clamp(src.opacity ?? 255, 0, 255),
      mode: ["stretch", "cover", "contain", "tile"].includes(String(src.mode || "stretch")) ? String(src.mode || "stretch") : "stretch",
      zOrder: Number(src.zOrder ?? -100) || 0
    });
  }

  function normalizeWindowDecorationImage(deco) {
    const src = deco && typeof deco === "object" ? deco : createDefaultWindowDecorationImage();
    return Object.assign(createDefaultWindowDecorationImage(), src, {
      enabled: src.enabled === true,
      folder: String(src.folder || "system"),
      fileName: String(src.fileName || ""),
      opacity: clamp(src.opacity ?? 255, 0, 255),
      mode: ["stretch", "cover", "contain", "tile"].includes(String(src.mode || "stretch")) ? String(src.mode || "stretch") : "stretch",
      zOrder: Number(src.zOrder ?? 100) || 0
    });
  }

  function normalizePlacementArea(area) {
    const src = area && typeof area === "object" ? area : createDefaultPlacementArea();
    return {
      extendLeft: Math.max(0, Number(src.extendLeft || 0)),
      extendTop: Math.max(0, Number(src.extendTop || 0)),
      extendRight: Math.max(0, Number(src.extendRight || 0)),
      extendBottom: Math.max(0, Number(src.extendBottom || 0))
    };
  }

  function ensureWindowBackgroundImage(win) {
    if (!win.backgroundImage || typeof win.backgroundImage !== "object") {
      win.backgroundImage = createDefaultWindowBackgroundImage();
    } else {
      win.backgroundImage = normalizeWindowBackgroundImage(win.backgroundImage);
    }
    return win.backgroundImage;
  }

  function ensureWindowDecorationImage(win) {
    if (!win.decorationImage || typeof win.decorationImage !== "object") {
      win.decorationImage = createDefaultWindowDecorationImage();
    } else {
      win.decorationImage = normalizeWindowDecorationImage(win.decorationImage);
    }
    return win.decorationImage;
  }

  function ensurePlacementArea(win) {
    if (!win.placementArea || typeof win.placementArea !== "object") {
      win.placementArea = createDefaultPlacementArea();
    } else {
      win.placementArea = normalizePlacementArea(win.placementArea);
    }
    return win.placementArea;
  }

  function normalizeWindowLogDraft(log) {
    const src = log && typeof log === 'object' ? log : {};
    return Object.assign({
      enabled: false,
      lines: [],
      maxLines: 200,
      scrollY: 0,
      autoScrollBottom: true,
      zOrder: 0,
      fontSize: 0,
      lineHeight: 0,
      paddingX: 0,
      paddingY: 0,
      textColor: '',
      outlineColor: '',
      outlineWidth: 0
    }, src);
  }

  function scrubPreviewImageFields(imageDef) {
    if (!imageDef || typeof imageDef !== "object") return;
    delete imageDef.previewSrc;
    delete imageDef.previewName;
    delete imageDef.previewNaturalWidth;
    delete imageDef.previewNaturalHeight;
  }

  function scrubPreviewOnlyFields(data) {
    if (Array.isArray(data.compositePresetLibraries)) {
      for (const lib of data.compositePresetLibraries) {
        for (const layer of lib.layerAssets || []) scrubPreviewImageFields(layer);
        for (const preset of lib.presets || []) {
          for (const layer of preset.layers || []) scrubPreviewImageFields(layer);
        }
      }
    }
    for (const win of data.windows || []) {
      win.placementArea = normalizePlacementArea(win.placementArea);
      if (win.backgroundImage) {
        win.backgroundImage = normalizeWindowBackgroundImage(win.backgroundImage);
        scrubPreviewImageFields(win.backgroundImage);
      }
      if (win.decorationImage) {
        win.decorationImage = normalizeWindowDecorationImage(win.decorationImage);
        scrubPreviewImageFields(win.decorationImage);
      }
      for (const item of win.items || []) {
        if (item.type === "image") {
          scrubPreviewImageFields(item);
          if (item.scaleXPercent === undefined) item.scaleXPercent = imageScalePercent(item, "scaleX");
          if (item.scaleYPercent === undefined) item.scaleYPercent = imageScalePercent(item, "scaleY");
          item.scaleX = Math.round((Number(item.scaleXPercent || 100) / 100) * 10000) / 10000;
          item.scaleY = Math.round((Number(item.scaleYPercent || 100) / 100) * 10000) / 10000;
        } else if (item.type === "compositeImage") {
          ensureCompositeImageLayers(item);
          for (const layer of item.layers || []) scrubPreviewImageFields(layer);
        }
      }
    }
  }

  function normalizeImportedState(data) {
    if (!Array.isArray(data.groups)) data.groups = [];
    if (!Array.isArray(data.scenes)) data.scenes = [];
    state.groups = data.groups;
    state.scenes = data.scenes;
    state.sceneSampleLinks = (data.sceneSampleLinks && typeof data.sceneSampleLinks === "object") ? cloneForHistory(data.sceneSampleLinks) : {};
    state.compositePresetLibraries = (Array.isArray(data.compositePresetLibraries) ? data.compositePresetLibraries : []).map(lib => normalizeCompositePresetLibrary(lib));
    state.componentTemplates = normalizeComponentTemplates(data.componentTemplates);
    state.activeSceneId = normalizeSceneId(data.activeSceneId || state.activeSceneId || "");
    ensureGroups();
    ensureScenes();
    for (const win of data.windows || []) {
      win.groupId = normalizeGroupId(win.groupId || "");
      if (win.zOrder === undefined) win.zOrder = 0;
      if (win.visible === undefined) win.visible = true;
      win.placementArea = normalizePlacementArea(win.placementArea);
      win.backgroundImage = normalizeWindowBackgroundImage(win.backgroundImage);
      win.decorationImage = normalizeWindowDecorationImage(win.decorationImage);
      win.log = normalizeWindowLogDraft(win.log);
      for (const item of win.items || []) {
        if (item.zOrder === undefined) item.zOrder = 0;
        if (item.visible === undefined) item.visible = true;
        if (item.allowOutsideWindow === undefined) item.allowOutsideWindow = false;
        if (item.type === "image") {
          if (item.scaleXPercent === undefined) item.scaleXPercent = imageScalePercent(item, "scaleX");
          if (item.scaleYPercent === undefined) item.scaleYPercent = imageScalePercent(item, "scaleY");
          item.scaleX = Math.round((Number(item.scaleXPercent || 100) / 100) * 10000) / 10000;
          item.scaleY = Math.round((Number(item.scaleYPercent || 100) / 100) * 10000) / 10000;
        } else if (item.type === "compositeImage") {
          ensureCompositeImageLayers(item);
        }
      }
      normalizeWindowItemIdentity(win);
    }
    normalizeWindowIds();
  }

  function escapeHtml(text) {
    return String(text).replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
  }

  function safeId(value, fallback) {
    const v = String(value || "").trim().replace(/\s+/g, "_");
    return v || fallback;
  }

  function itemDisplayName(item) {
    return String(item?.displayName || item?.name || item?.id || "").trim() || String(item?.id || "");
  }

  function makeUniqueText(base, usedSet, options = {}) {
    const fallback = String(options.fallback || "item");
    const suffixSeparator = String(options.separator || " ");
    const normalizedBase = String(base || "").trim() || fallback;
    if (!usedSet.has(normalizedBase)) return normalizedBase;
    let index = 2;
    let candidate = `${normalizedBase}${suffixSeparator}${index}`;
    while (usedSet.has(candidate)) {
      index += 1;
      candidate = `${normalizedBase}${suffixSeparator}${index}`;
    }
    return candidate;
  }

  function safeItemIdForWindow(win, value, fallback = "item", currentItem = null) {
    const base = safeId(value, safeId(fallback, "item"));
    const used = new Set((win?.items || [])
      .filter(entry => entry && entry !== currentItem)
      .map(entry => String(entry.id || "").trim())
      .filter(Boolean));
    if (!used.has(base)) return base;
    let index = 2;
    let candidate = `${base}_${index}`;
    while (used.has(candidate)) {
      index += 1;
      candidate = `${base}_${index}`;
    }
    return candidate;
  }

  function safeWindowIdInState(value, fallback = "window", currentWindow = null) {
    const base = safeId(value, safeId(fallback, "window"));
    const used = new Set((state.windows || [])
      .filter(entry => entry && entry !== currentWindow)
      .map(entry => String(entry.id || "").trim())
      .filter(Boolean));
    if (!used.has(base)) return base;
    let index = 2;
    let candidate = `${base}_${index}`;
    while (used.has(candidate)) {
      index += 1;
      candidate = `${base}_${index}`;
    }
    return candidate;
  }

  function normalizeWindowIds() {
    const used = new Set();
    for (const win of state.windows || []) {
      if (!win || typeof win !== "object") continue;
      const base = safeId(win.id || "window", "window");
      let candidate = base;
      let index = 2;
      while (used.has(candidate)) {
        candidate = `${base}_${index++}`;
      }
      win.id = candidate;
      used.add(candidate);
    }
  }

  function safeItemDisplayNameForWindow(win, value, fallback = "要素", currentItem = null) {
    const base = String(value || "").trim() || String(fallback || "要素");
    const used = new Set((win?.items || [])
      .filter(entry => entry && entry !== currentItem)
      .map(entry => itemDisplayName(entry))
      .filter(Boolean));
    return makeUniqueText(base, used, { fallback: String(fallback || "要素"), separator: " " });
  }

  function normalizeWindowItemIdentity(win) {
    if (!win || !Array.isArray(win.items)) return;
    const usedIds = new Set();
    const usedNames = new Set();
    for (const item of win.items) {
      if (!item || typeof item !== "object") continue;
      const fallbackId = safeId(item.type || "item", "item");
      const rawId = safeId(item.id || fallbackId, fallbackId);
      let id = rawId;
      let idIndex = 2;
      while (usedIds.has(id)) {
        id = `${rawId}_${idIndex++}`;
      }
      item.id = id;
      usedIds.add(id);

      const rawName = String(item.displayName || item.name || item.id || item.type || "要素").trim() || "要素";
      const uniqueName = makeUniqueText(rawName, usedNames, { fallback: "要素", separator: " " });
      item.displayName = uniqueName;
      usedNames.add(uniqueName);
    }
  }

  function selectWindow(windowId, options = {}) {
    selected = { kind: "window", windowId };
    if (options.revealInList !== false) pendingObjectListReveal = true;
    render();
  }

  function selectItem(windowId, itemId, options = {}) {
    selected = { kind: "item", windowId, itemId };
    if (options.revealInList !== false) pendingObjectListReveal = true;
    render();
  }

  function selectGroup(groupId, options = {}) {
    const id = normalizeGroupId(groupId || "");
    if (!id) return;
    selected = { kind: "group", groupId: id };
    if (options.revealInList !== false) pendingObjectListReveal = true;
    render();
  }

  function deleteWindow(windowId) {
    const win = state.windows.find(w => w.id === windowId);
    if (!win) return;
    runStateMutation("ウィンドウ削除", () => {
      state.windows = state.windows.filter(w => w.id !== windowId);
      if (selected?.windowId === windowId) selected = null;
    });
  }

  function deleteItem(windowId, itemId) {
    const win = state.windows.find(w => w.id === windowId);
    if (!win) return;
    runStateMutation("パーツ削除", () => {
      win.items = (win.items || []).filter(item => item.id !== itemId);
      if (selected?.kind === "item" && selected.windowId === windowId && selected.itemId === itemId) {
        selected = { kind: "window", windowId };
      }
    });
  }

  // 現在フォーカス中のウィンドウまたはパーツを削除します。
  // 削除直後でも Ctrl+Z で復元できるため、キーボード操作時は確認ダイアログを出しません。
  function deleteSelectedObject(options = {}) {
    const silent = options?.silent === true;
    if (!selected) {
      if (!silent) showToast("削除するウィンドウまたはパーツを選択してください");
      return false;
    }
    if (selected.kind === "group") {
      const group = selectedGroup();
      if (!group) {
        if (!silent) showToast("選択中のグループが見つかりません");
        return false;
      }
      deleteGroup(group.id);
      if (!silent) showToast("グループと所属ウィンドウを削除しました（Ctrl+Zで復元）");
      return true;
    }
    if (selected.kind === "window") {
      const win = selectedWindow();
      if (!win) {
        if (!silent) showToast("選択中のウィンドウが見つかりません");
        return false;
      }
      deleteWindow(win.id);
      if (!silent) showToast("ウィンドウを削除しました（Ctrl+Zで復元）");
      return true;
    }
    const win = selectedWindow();
    const item = selectedItem();
    if (!win || !item) {
      if (!silent) showToast("選択中のパーツが見つかりません");
      return false;
    }
    deleteItem(win.id, item.id);
    if (!silent) showToast("パーツを削除しました（Ctrl+Zで復元）");
    return true;
  }

  function addWindow(options = {}) {
    const id = uid("window");
    runStateMutation("ウィンドウ追加", () => {
      const preferredGroupId = normalizeGroupId(options.groupId || "");
      const targetGroupId = resolveGroupForNewWindow(preferredGroupId, { attachPreferred: !!preferredGroupId });
      const win = {
        id,
        groupId: targetGroupId,
        x: 40,
        y: 40,
        width: 280,
        height: 120,
        opacity: 220,
        contentsOpacity: 255,
        layer: "mapUi",
        zOrder: 0,
        visible: true,
        frameVisible: true,
        backgroundType: "normal",
        scrollEnabled: false,
        scrollbarVisible: true,
        scrollY: 0,
        scrollContentHeight: 0,
        scrollbarWidth: 8,
        scrollbarOpacity: 220,
        placementArea: createDefaultPlacementArea(),
        backgroundImage: createDefaultWindowBackgroundImage(),
        decorationImage: createDefaultWindowDecorationImage(),
        items: []
      };
      state.windows.push(win);
      selected = { kind: "window", windowId: id };
    });
  }

  function requireWindow() {
    const win = selectedWindow();
    if (win && windowInActiveScene(win)) return win;

    // グループ選択中にパーツを追加する場合は、そのグループ内を優先します。
    // グループ内にウィンドウが無ければ、新規ウィンドウをそのグループへ作成してから追加します。
    if (selected?.kind === "group") {
      const groupId = normalizeGroupId(selected.groupId || "");
      const group = groupById(groupId);
      if (group && sceneIncludesGroup(activeScene(), groupId)) {
        const groupWin = firstWindowInGroup(groupId);
        if (groupWin) {
          selected = { kind: "window", windowId: groupWin.id };
          pendingObjectListReveal = true;
          return groupWin;
        }
        addWindow({ groupId });
        return selectedWindow() || firstWindowInGroup(groupId) || state.windows[state.windows.length - 1];
      }
    }

    const first = firstWindowInActiveScene();
    if (first) {
      selectWindow(first.id);
      return first;
    }
    addWindow();
    return selectedWindow() || firstWindowInActiveScene() || state.windows[state.windows.length - 1];
  }

  function addItem(type, options = {}) {
    const win = requireWindow();
    const base = { type, id: uid(type), displayName: "", x: 16, y: 16, zOrder: 0, visible: true, allowOutsideWindow: false };
    if (type === "text") Object.assign(base, { text: "テキスト", fontSize: 22, width: 180, color: "", align: "left", databaseBinding: createDefaultDatabaseBinding() });
    if (type === "log") Object.assign(base, createDefaultLogItem());
    if (type === "gauge") Object.assign(base, { width: 220, height: 14, gaugeShape: "horizontal", gaugeDirection: "leftToRight", gaugeStartAngle: 0, valueType: "fixed", value: 50, max: 100, label: "", color1: "#ff6060", color2: "#ffa0a0", gaugeBackImage: createDefaultGaugeImageLayer("back"), gaugeFillImage: createDefaultGaugeImageLayer("fill"), gaugeFrontImage: createDefaultGaugeImageLayer("front"), databaseBinding: createDefaultDatabaseBinding() });
    if (type === "button") Object.assign(base, { width: 120, height: 36, text: options.text ?? "OK", buttonVisualMode: options.buttonVisualMode || "normal", commonEventId: 0, switchId: 0, variableId: 0, variableValue: 0, script: "", buttonStates: { mouseOff: createDefaultButtonState(), mouseOn: createDefaultButtonState(), press: createDefaultButtonState(), release: createDefaultButtonState() }, buttonImages: { mouseOff: createButtonImageDef(), mouseOn: createButtonImageDef(), press: createButtonImageDef(), release: createButtonImageDef() }, buttonStateEdit: "mouseOn" });
    if (type === "choiceList") Object.assign(base, createDefaultChoiceListItem(options.choiceMode || "tool"));
    if (type === "imageChoiceList") Object.assign(base, createDefaultImageChoiceListItem());
    if (type === "image") Object.assign(base, { width: 96, height: 64, folder: "pictures", fileName: "", scaleX: 1, scaleY: 1, scaleXPercent: 100, scaleYPercent: 100, opacity: 255 });
    if (type === "compositeImage") Object.assign(base, createDefaultCompositeImageItem());
    runStateMutation(`${type}追加`, () => {
      win.items = win.items || [];
      base.displayName = safeItemDisplayNameForWindow(win, options.displayName || base.id || type, base.id || type);
      base.id = safeItemIdForWindow(win, base.id, base.id || type);
      win.items.push(base);
      mode = "inside";
      selected = { kind: "item", windowId: win.id, itemId: base.id };
    });
    updateModeButtons();
    return base;
  }

  function nextUniqueWindowId(baseId) {
    const base = safeId(baseId || "window", "window");
    const existing = new Set(state.windows.map(win => win.id));
    let index = 1;
    let candidate = `${base}_copy${index}`;
    while (existing.has(candidate)) candidate = `${base}_copy${++index}`;
    return candidate;
  }

  function nextUniqueItemId(win, baseId) {
    const base = safeId(baseId || "item", "item");
    const existing = new Set((win.items || []).map(item => item.id));
    let index = 1;
    let candidate = `${base}_copy${index}`;
    while (existing.has(candidate)) candidate = `${base}_copy${++index}`;
    return candidate;
  }

  function duplicateSelectedObject() {
    if (!selected) {
      showToast("複製するウィンドウまたはパーツを選択してください");
      return;
    }
    if (selected.kind === "group") {
      const group = selectedGroup();
      if (!group) return;
      duplicateGroup(group.id);
      return;
    }
    if (selected.kind === "window") {
      const source = selectedWindow();
      if (!source) return;
      runStateMutation("ウィンドウ複製", () => {
        const copy = cloneForHistory(source);
        copy.id = nextUniqueWindowId(source.id);
        copy.x = Math.round(Number(source.x || 0) + 16);
        copy.y = Math.round(Number(source.y || 0) + 16);
        const usedIds = new Set();
        copy.items = (copy.items || []).map(item => {
          const itemCopy = cloneForHistory(item);
          const base = safeId(itemCopy.id || itemCopy.type || "item", "item");
          let index = 1;
          let nextId = `${base}_copy${index}`;
          while (usedIds.has(nextId)) nextId = `${base}_copy${++index}`;
          usedIds.add(nextId);
          itemCopy.id = nextId;
          return itemCopy;
        });
        normalizeWindowItemIdentity(copy);
        state.windows.push(copy);
        selected = { kind: "window", windowId: copy.id };
      });
      showToast("ウィンドウを複製しました");
      return;
    }

    const win = selectedWindow();
    const source = selectedItem();
    if (!win || !source) return;
    runStateMutation("パーツ複製", () => {
      const copy = cloneForHistory(source);
      copy.id = nextUniqueItemId(win, source.id);
      copy.displayName = safeItemDisplayNameForWindow(win, `${itemDisplayName(source) || source.id || "要素"} コピー`, source.id || "要素");
      copy.x = Math.round(Number(source.x || 0) + 12);
      copy.y = Math.round(Number(source.y || 0) + 12);
      win.items = win.items || [];
      win.items.push(copy);
      selected = { kind: "item", windowId: win.id, itemId: copy.id };
    });
    showToast("パーツを複製しました");
  }

  function copyGroupToClipboard(groupId, options = {}) {
    const silent = options?.silent === true;
    const group = groupById(groupId || "");
    if (!group) {
      if (!silent) showToast("コピーするグループが見つかりません");
      return false;
    }
    objectClipboard = {
      kind: "group",
      data: {
        group: cloneForHistory(group),
        windows: windowsInGroup(group.id).map(win => cloneForHistory(win))
      }
    };
    syncDetachedObjectListWindow();
    if (!silent) showToast("グループをコピーしました");
    return true;
  }

  function copySelectedObject(options = {}) {
    const silent = options?.silent === true;
    if (!selected) {
      if (!silent) showToast("コピーするウィンドウ、グループ、またはパーツを選択してください");
      return false;
    }
    if (selected.kind === "group") {
      return copyGroupToClipboard(selected.groupId, { silent });
    }
    if (selected.kind === "window") {
      const win = selectedWindow();
      if (!win) return false;
      objectClipboard = { kind: "window", data: cloneForHistory(win) };
      syncDetachedObjectListWindow();
      if (!silent) showToast("ウィンドウをコピーしました");
      return true;
    }
    const win = selectedWindow();
    const item = selectedItem();
    if (!win || !item) return false;
    objectClipboard = { kind: "item", sourceWindowId: win.id, data: cloneForHistory(item) };
    syncDetachedObjectListWindow();
    if (!silent) showToast("パーツをコピーしました");
    return true;
  }

  function cutSelectedObject() {
    if (!selected) {
      showToast("切り取りするウィンドウ、グループ、またはパーツを選択してください");
      return false;
    }
    const copied = copySelectedObject({ silent: true });
    if (!copied) return false;
    const cut = deleteSelectedObject({ silent: true });
    if (!cut) return false;
    showToast("切り取りしました（Ctrl+Vで貼り付け / Ctrl+Zで戻せます）");
    return true;
  }

  function clipboardPasteLabel(target = null) {
    if (!objectClipboard) return "貼り付け";
    if (objectClipboard.kind === "group") {
      if (target?.kind === "scene") return "このシーンへグループを貼り付け";
      return "グループを現在シーンへ貼り付け";
    }
    if (objectClipboard.kind === "window") {
      if (target?.kind === "group") return "このグループへウィンドウを貼り付け";
      if (target?.kind === "scene") return "このシーンへウィンドウを貼り付け";
      return "ウィンドウを貼り付け";
    }
    if (objectClipboard.kind === "item") return "このウィンドウへパーツを貼り付け";
    return "貼り付け";
  }

  function pasteGroupFromClipboard(target = null) {
    const payload = objectClipboard?.data || null;
    const sourceGroup = payload?.group || null;
    if (!sourceGroup) {
      showToast("貼り付けるグループ情報がありません");
      return false;
    }
    // 貼り付け先シーンは「オブジェクト参照」ではなくIDで保持します。
    // グループ追加中に ensureGroups/ensureScenes が正規化で配列を作り直すため、
    // 古い scene オブジェクトを直接 mutate すると、トーストだけ出て実データへ反映されない場合があります。
    const targetSceneId = sceneIdForContextTarget(target);
    let newGroupId = "";
    let attachedSceneName = "";
    let pastedWindowCount = 0;
    runStateMutation("グループ貼り付け", () => {
      const nameBase = `${sourceGroup.name || sourceGroup.id || "グループ"} コピー`;
      newGroupId = nextGroupId(sourceGroup.id || "group");
      const groups = ensureGroups();
      groups.push({
        id: newGroupId,
        name: uniqueDisplayName(nameBase, groups),
        visible: sourceGroup.visible !== false,
        locked: false
      });

      const attachedScene = targetSceneId ? attachGroupIdToSceneId(targetSceneId, newGroupId) : null;
      if (attachedScene) {
        state.activeSceneId = attachedScene.id;
        attachedSceneName = attachedScene.name || attachedScene.id;
      }

      objectListCollapsedGroups.delete(newGroupId);
      const usedWindowIds = new Set((state.windows || []).map(win => win.id));
      for (const sourceWindow of payload.windows || []) {
        state.windows.push(cloneWindowForPaste(sourceWindow, newGroupId, usedWindowIds, 24));
        pastedWindowCount += 1;
      }
      selected = { kind: "group", groupId: newGroupId };
      pendingObjectListReveal = true;
    });
    const detail = pastedWindowCount ? `（${pastedWindowCount}ウィンドウ）` : "";
    showToast(attachedSceneName ? `グループをシーン「${attachedSceneName}」へ貼り付けました${detail}` : `グループを貼り付けました${detail}`);
    return true;
  }

  function pasteObjectFromClipboard(target = null) {
    if (!objectClipboard || !objectClipboard.data) {
      showToast("貼り付けるコピー内容がありません");
      return false;
    }
    if (objectClipboard.kind === "group") {
      return pasteGroupFromClipboard(target);
    }
    if (objectClipboard.kind === "window") {
      const targetSceneId = sceneIdForContextTarget(target);
      let attachedSceneName = "";
      runStateMutation("ウィンドウ貼り付け", () => {
        const groupId = resolveGroupForWindowPasteTarget(target, objectClipboard.data.groupId || "");
        const usedWindowIds = new Set((state.windows || []).map(win => win.id));
        const copy = cloneWindowForPaste(objectClipboard.data, groupId, usedWindowIds, 24);
        const attachedScene = targetSceneId && groupId ? attachGroupIdToSceneId(targetSceneId, groupId) : null;
        if (attachedScene) {
          state.activeSceneId = attachedScene.id;
          attachedSceneName = attachedScene.name || attachedScene.id;
        }
        state.windows.push(copy);
        selected = { kind: "window", windowId: copy.id };
        pendingObjectListReveal = true;
      });
      showToast(attachedSceneName ? `ウィンドウをシーン「${attachedSceneName}」へ貼り付けました` : "ウィンドウを貼り付けました");
      return true;
    }

    let targetWin = null;
    if (target?.kind === "window") targetWin = state.windows.find(win => win.id === target.windowId) || null;
    else if (target?.kind === "item") targetWin = state.windows.find(win => win.id === target.windowId) || null;
    if (!targetWin) targetWin = selectedWindow();
    if (!targetWin) targetWin = state.windows[0] || null;
    if (!targetWin) {
      addWindow();
      targetWin = selectedWindow();
    }
    if (!targetWin) return false;
    runStateMutation("パーツ貼り付け", () => {
      const copy = cloneForHistory(objectClipboard.data);
      copy.id = nextUniqueItemId(targetWin, copy.id || copy.type || "item");
      copy.displayName = safeItemDisplayNameForWindow(targetWin, `${itemDisplayName(copy) || copy.id || "要素"} コピー`, copy.id || "要素");
      copy.x = Math.round(Number(copy.x || 0) + 12);
      copy.y = Math.round(Number(copy.y || 0) + 12);
      targetWin.items = targetWin.items || [];
      targetWin.items.push(copy);
      mode = "inside";
      selected = { kind: "item", windowId: targetWin.id, itemId: copy.id };
    });
    updateModeButtons();
    showToast("パーツを貼り付けました");
    return true;
  }

  function moveWindowToGroup(windowId, groupId) {
    const win = (state.windows || []).find(entry => entry.id === windowId);
    if (!win) return;
    const id = normalizeGroupId(groupId || "");
    if (id && !groupById(id)) return;
    runStateMutation("ドラッグでグループ移動", () => {
      win.groupId = id;
      selected = { kind: "window", windowId: win.id };
      const scene = activeScene();
      if (scene && id) addGroupIdToScene(scene, id);
      if (scene && !id) scene.includeUngrouped = true;
      pendingObjectListReveal = true;
    });
  }

  function assignSelectedWindowToGroup(groupId) {
    const win = selectedWindow();
    if (!win) return;
    moveWindowToGroup(win.id, groupId);
  }

  function createGroupAndAssignSelectedWindow() {
    const win = selectedWindow();
    if (!win) return;
    const name = (window.prompt ? window.prompt("新規グループ名", "新規グループ") : "新規グループ") || "新規グループ";
    let id = "";
    runStateMutation("グループ作成して所属", () => {
      id = createGroupObject(name);
      addGroupIdToActiveScene(id);
      win.groupId = id;
    });
  }

  function toggleSelectedGroupLock() {
    const win = selectedWindow();
    const group = selected?.kind === "group" ? selectedGroup() : (win ? groupById(win.groupId) : null);
    if (!group) return;
    runStateMutation("グループロック切替", () => { group.locked = group.locked !== true; });
  }

  function setMode(nextMode) {
    // v0.3.98: 旧「配置モード」は廃止。内部互換用に値だけ保持します。
    mode = nextMode === "inside" ? "inside" : "screen";
    doubleClickCycle = null;
    lastPreviewPrimaryDown = null;
    updateModeButtons();
    render();
  }

  function updateModeButtons() {
    const windowLock = $("windowPositionLockInput");
    const partLock = $("partPositionLockInput");
    if (windowLock) {
      windowLock.checked = !!globalWindowPositionLocked;
      windowLock.closest("label")?.classList.toggle("mode-active", !!globalWindowPositionLocked);
      windowLock.title = "ON: ウィンドウ本体の移動・リサイズを禁止します。パーツ操作とは独立しています。";
    }
    if (partLock) {
      partLock.checked = !!globalPartPositionLocked;
      partLock.closest("label")?.classList.toggle("mode-active", !!globalPartPositionLocked);
      partLock.title = "ON: パーツの移動・リサイズを禁止します。ウィンドウ操作とは独立しています。";
    }
  }

  function setGlobalWindowPositionLocked(value) {
    globalWindowPositionLocked = !!value;
    updateModeButtons();
    render();
  }

  function setGlobalPartPositionLocked(value) {
    globalPartPositionLocked = !!value;
    updateModeButtons();
    render();
  }

  function onPointerMove(ev) {
    if (!drag) return;
    if (!isDragStarted(ev, drag)) return;
    pendingPreviewClick = null;
    const zoomRate = previewZoomRate();
    const dx = (ev.clientX - drag.startX) / zoomRate;
    const dy = (ev.clientY - drag.startY) / zoomRate;
    if (drag.type === "moveWindow") {
      const win = state.windows.find(w => w.id === drag.windowId);
      if (!win) return;
      win.x = Math.round(drag.baseX + dx);
      win.y = Math.round(drag.baseY + dy);
    } else if (drag.type === "resize") {
      const win = state.windows.find(w => w.id === drag.windowId);
      if (!win) return;
      win.width = Math.max(48, Math.round(drag.startW + dx));
      win.height = Math.max(48, Math.round(drag.startH + dy));
    } else if (drag.type === "resizeItem") {
      const win = state.windows.find(w => w.id === drag.windowId);
      const item = win?.items?.find(i => i.id === drag.itemId);
      if (!item) return;
      const displayW = Math.max(1, Math.round(drag.startW + dx));
      const displayH = Math.max(1, Math.round(drag.startH + dy));
      const itemType = String(drag.itemType || item.type || "");
      const isImageScaleType = drag.scaleResize || itemType === "image" || itemType === "compositeImage";
      const isImageButtonResize = itemType === "button" && String(item.buttonVisualMode || "normal") !== "normal";
      if (isImageScaleType) {
        const startW = Math.max(1, Number(drag.startW || 1));
        const startH = Math.max(1, Number(drag.startH || 1));
        let ratioX = displayW / startW;
        let ratioY = displayH / startH;
        // v0.3.51: 基本操作は等倍スケールにする。
        // Shift押下時だけX/Yを別々に変更できるよう、v0.3.49-50の挙動を反転。
        if (!ev.shiftKey) {
          const uniform = Math.max(ratioX, ratioY, 0.01);
          ratioX = uniform;
          ratioY = uniform;
        }
        const startScaleX = Math.max(1, Number(drag.startScaleXPercent || imageScalePercent(item, "scaleX")) || 100);
        const startScaleY = Math.max(1, Number(drag.startScaleYPercent || imageScalePercent(item, "scaleY")) || 100);
        setImageScalePercent(item, "scaleX", Math.max(1, Math.round(startScaleX * ratioX)));
        setImageScalePercent(item, "scaleY", Math.max(1, Math.round(startScaleY * ratioY)));
      } else if (isImageButtonResize) {
        let nextW = displayW;
        let nextH = displayH;
        if (!ev.shiftKey) {
          const baseAspect = Math.max(0.01, Number(drag.startW || 1) / Math.max(1, Number(drag.startH || 1)));
          if (Math.abs(dx) >= Math.abs(dy)) {
            nextH = Math.max(1, Math.round(nextW / baseAspect));
          } else {
            nextW = Math.max(1, Math.round(nextH * baseAspect));
          }
        }
        item.width = Math.max(1, nextW);
        item.height = Math.max(1, nextH);
      } else {
        item.width = displayW;
        item.height = displayH;
      }
    } else if (drag.type === "moveGroup") {
      const bases = Array.isArray(drag.baseWindows) ? drag.baseWindows : [];
      for (const base of bases) {
        const win = state.windows.find(w => w.id === base.id);
        if (!win) continue;
        win.x = Math.round(Number(base.x || 0) + dx);
        win.y = Math.round(Number(base.y || 0) + dy);
      }
    } else if (drag.type === "moveItem") {
      const win = state.windows.find(w => w.id === drag.windowId);
      const item = win?.items?.find(i => i.id === drag.itemId);
      if (!item) return;
      item.x = Math.round(drag.baseX + dx);
      item.y = Math.round(drag.baseY + dy);
    }
    render();
  }

  function onPointerUp(ev) {
    const wasDragged = !!drag?.started;
    if (drag?.historySnapshot && wasDragged) commitHistorySnapshot(drag.historySnapshot, drag.historyLabel || "ドラッグ編集");
    drag = null;
    if (!wasDragged && pendingPreviewClick) {
      if (pendingPreviewClick.kind === "item") {
        selectItem(pendingPreviewClick.windowId, pendingPreviewClick.itemId);
      } else if (pendingPreviewClick.kind === "window") {
        selectWindow(pendingPreviewClick.windowId);
      }
    }
    pendingPreviewClick = null;
  }

  async function copyText(text) {
    try {
      if (window.DB_UIComposerElectron?.writeText) {
        const ok = await window.DB_UIComposerElectron.writeText(String(text ?? ""));
        if (ok) {
          showToast("コピーしました");
          return;
        }
      }
      await navigator.clipboard.writeText(text);
      showToast("コピーしました");
    } catch (e) {
      showToast("コピーに失敗しました。手動で選択してください");
    }
  }

  async function copyMZScriptWithAutoCompositeExport() {
    const ok = await ensureCompositeRuntimePngExports({ reason: "copyMZScript" });
    if (!ok) {
      showToast("複合画像の自動書き出しに失敗したため、MZスクリプトのコピーを中止しました");
      return;
    }
    await copyText(buildMZScriptText());
  }

  function downloadJson() {
    const blob = new Blob([buildLayoutJsonText()], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${state.layoutId || "layout"}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  /**
   * 貼り付け欄へ JSON 本文だけでなく、ツールが出力した
   * PluginManager.callCommand(...) のMZ実行スクリプトも貼れるようにします。
   * 任意のJavaScriptは実行せず、json: "..." プロパティだけを安全に抽出します。
   */
  function extractJsonFromMZScript(source) {
    const script = String(source || "").trim();
    const commandIndex = script.indexOf("PluginManager.callCommand");
    if (commandIndex < 0) return null;

    // buildMZScriptText() は JSON.stringify(json) を使っているため、ここで拾う値は
    // 必ずJSON文字列リテラル（ダブルクォート）です。
    const jsonProperty = /\bjson\s*:\s*("(?:\\[\s\S]|[^"\\])*")/.exec(script.slice(commandIndex));
    if (!jsonProperty) {
      throw new Error('MZスクリプト内に json: "..." が見つかりません。ツールの「MZスクリプトをコピー」で出力した内容を貼り付けてください。');
    }

    let jsonText;
    try {
      jsonText = JSON.parse(jsonProperty[1]);
    } catch (e) {
      throw new Error(`MZスクリプト内のJSON文字列を復元できませんでした。${e.message}`);
    }
    if (typeof jsonText !== "string") {
      throw new Error("MZスクリプト内の json 値が文字列ではありません。");
    }
    return jsonText;
  }

  function parseLayoutImportText(text) {
    if (typeof text !== "string") return text;
    const source = text.trim();
    if (!source) throw new Error("読み込むJSONまたはMZスクリプトが空です。");

    const extracted = extractJsonFromMZScript(source);
    const jsonText = extracted !== null ? extracted : source;
    try {
      return JSON.parse(jsonText);
    } catch (e) {
      const label = extracted !== null ? "MZスクリプトから復元したJSON" : "JSON";
      throw new Error(`${label}の解析に失敗しました。${e.message}`);
    }
  }

  function importJson(text, options = {}) {
    const data = parseLayoutImportText(text);
    const layout = data && data.type === TOOL_DATA_TYPE && data.layout ? data.layout : data;
    state = {
      layoutId: String(layout.layoutId || "ImportedLayout"),
      screenWidth: Number(layout.screenWidth || 816),
      screenHeight: Number(layout.screenHeight || 624),
      settings: Object.assign(createDefaultSettings(), layout.settings || {}),
      groups: Array.isArray(layout.groups) ? layout.groups : [],
      scenes: Array.isArray(layout.scenes) ? layout.scenes : [],
      activeSceneId: normalizeSceneId(layout.activeSceneId || ""),
      compositePresetLibraries: Array.isArray(layout.compositePresetLibraries) ? layout.compositePresetLibraries : [],
      componentTemplates: Array.isArray(layout.componentTemplates) ? layout.componentTemplates : [],
      windows: Array.isArray(layout.windows) ? layout.windows : []
    };
    normalizeImportedState(state);
    selected = null;
    if (options.clearHistory !== false) clearHistory();
    if (!options.skipRender) render();
  }


  function previewSettings() {
    state.settings = Object.assign(createDefaultSettings(), state.settings || {});
    return state.settings;
  }

  function previewDefaultFontSize() {
    return Math.max(1, Number(previewSettings().defaultFontSize || 26));
  }

  function previewLineHeight() {
    return Math.max(1, Number(previewSettings().lineHeight || 36));
  }

  function previewTextYOffset() {
    return Number(previewSettings().textYOffset || 0);
  }

  function previewDragStartThreshold() {
    return Math.max(0, Number(previewSettings().dragStartThreshold ?? 5));
  }

  function previewZoomRate() {
    const raw = Number(previewSettings().previewZoomPercent ?? 100);
    return Math.max(0.1, (Number.isFinite(raw) ? raw : 100) / 100);
  }

  function dragDistanceFromStart(ev, dragInfo) {
    const dx = ev.clientX - dragInfo.startX;
    const dy = ev.clientY - dragInfo.startY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function isDragStarted(ev, dragInfo) {
    if (!dragInfo) return false;
    if (dragInfo.started) return true;
    if (dragDistanceFromStart(ev, dragInfo) < previewDragStartThreshold()) return false;
    dragInfo.started = true;
    return true;
  }

  function previewPadding(win) {
    const s = previewSettings();
    return Math.max(0, Number(win?.padding ?? s.padding ?? 12));
  }

  function previewFontFamily() {
    return previewSettings().fontFamily || 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  }

  function effectiveFontFamily(win, item) {
    return item?.fontFamily || win?.fontFamily || previewFontFamily();
  }

  function effectiveFontSize(win, item, fallback = 0) {
    const n = Number(item?.fontSize || win?.fontSize || fallback || previewDefaultFontSize());
    return Math.max(1, n || previewDefaultFontSize());
  }

  function effectiveLineHeight(win, item) {
    return Math.max(1, Number(item?.lineHeight || win?.lineHeight || previewLineHeight()));
  }

  function effectiveTextColor(win, item) {
    return item?.color || item?.textColor || win?.textColor || previewSettings().textColor || '';
  }

  function effectiveOutlineColor(win, item) {
    return item?.outlineColor || win?.outlineColor || previewSettings().outlineColor || 'rgba(0,0,0,0.85)';
  }

  function effectiveOutlineWidth(win, item) {
    const n = Number(item?.outlineWidth ?? win?.outlineWidth ?? previewSettings().outlineWidth ?? 0);
    return Math.max(0, n || 0);
  }

  function applyPreviewTextStyle(el, win, item, fallbackSize = 0) {
    const size = effectiveFontSize(win, item, fallbackSize || previewDefaultFontSize());
    el.style.fontSize = `${size}px`;
    el.style.lineHeight = `${effectiveLineHeight(win, item)}px`;
    el.style.fontFamily = effectiveFontFamily(win, item);
    const color = effectiveTextColor(win, item);
    if (color) el.style.color = color;
    const ow = effectiveOutlineWidth(win, item);
    if (ow > 0) {
      const oc = effectiveOutlineColor(win, item);
      el.style.webkitTextStroke = `${ow}px ${oc}`;
      el.style.paintOrder = 'stroke fill';
      el.style.textShadow = `0 0 ${Math.max(1, Math.ceil(ow / 2))}px ${oc}`;
    } else {
      el.style.webkitTextStroke = '';
      el.style.textShadow = '';
    }
    el.style.fontWeight = item?.bold ? '700' : '';
    el.style.fontStyle = item?.italic ? 'italic' : '';
  }

  function previewVariableMap() {
    const map = new Map();
    const text = String(previewSettings().previewVariables || "");
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*(\d+)\s*=\s*(-?\d+(?:\.\d+)?)\s*$/);
      if (m) map.set(Number(m[1]), Number(m[2]));
    }
    return map;
  }


  function previewIconSize() {
    return 32;
  }

  function isDatabaseIconIndexField(fieldPath) {
    const key = String(fieldPath || "").trim();
    return key === "iconIndex" || /(^|\.)iconIndex$/i.test(key);
  }

  function formatDatabaseBindingDisplayText(binding, raw) {
    const emptyText = String(binding?.emptyText || "");
    if (raw === null || raw === undefined || raw === "") return emptyText;
    let text = "";
    if (isDatabaseIconIndexField(binding?.fieldPath)) {
      const iconIndex = Math.max(0, Number(raw) || 0);
      text = `\\I[${iconIndex}]`;
    } else if (typeof raw === "number") {
      const dec = Number(binding?.decimals ?? -1);
      text = dec >= 0 ? raw.toFixed(Math.max(0, dec)) : String(raw);
    } else if (typeof raw === "string") {
      text = raw;
    } else {
      try { text = JSON.stringify(raw); } catch (_) { text = String(raw); }
    }
    return `${String(binding?.textPrefix || "")}${text}${String(binding?.textSuffix || "")}`;
  }

  function previewInlineIconHtml(iconIndex) {
    const index = Math.max(0, Number(iconIndex) || 0);
    const size = previewIconSize();
    const cols = 16;
    const sx = (index % cols) * size;
    const sy = Math.floor(index / cols) * size;
    if (projectAssets.iconSetReady && projectAssets.iconSetUrl) {
      const style = [
        `display:inline-block`,
        `width:${size}px`,
        `height:${size}px`,
        `vertical-align:middle`,
        `background-image:url(${JSON.stringify(projectAssets.iconSetUrl)})`,
        `background-repeat:no-repeat`,
        `background-position:-${sx}px -${sy}px`,
        `image-rendering:pixelated`
      ].join(";");
      return `<span class="preview-inline-icon" style="${style}" title="Icon ${index}"></span>`;
    }
    return `<span class="preview-inline-icon preview-inline-icon-fallback" title="Icon ${index}">[${index}]</span>`;
  }

  function normalizeMZControlPrefix(text) {
    // RPGツクールMZのエディタ上では、制御文字の「\」が環境によって
    // 半角円記号/全角円記号の見た目・入力になることがあります。
    // プレビューでは ¥V[1] / ￥V[1] も \V[1] と同じ制御文字として扱います。
    return String(text || "").replace(/[¥￥]/g, "\\");
  }

  function previewTextColor(index, baseColor = "") {
    const colors = [
      baseColor || "#ffffff", "#20a0d6", "#ff784c", "#66cc40", "#99ccff", "#ccc0ff", "#ffffa0", "#808080",
      "#c0c0c0", "#2080cc", "#ff3810", "#00a010", "#3e9ade", "#a098ff", "#ffcc20", "#000000",
      "#84aaff", "#ffff40", "#ff2020", "#20ff20", "#2020ff", "#ff40ff", "#40ffff", "#ffffff",
      "#808080", "#ff6600", "#ffff00", "#00ff00", "#00ffff", "#0000ff", "#ff00ff", "#ff99cc"
    ];
    const n = Number(index || 0);
    return colors[((n % colors.length) + colors.length) % colors.length] || baseColor || "#ffffff";
  }

  function expandPreviewVariables(text, depth = 0) {
    const vars = previewVariableMap();
    let result = normalizeMZControlPrefix(text);
    result = result.replace(/\\[vV]\[(\d+)\]/g, (_, id) => String(vars.get(Number(id)) ?? 0));
    return depth >= 10 || !/\\[vV]\[\d+\]/i.test(result) ? result : expandPreviewVariables(result, depth + 1);
  }

  function convertPreviewText(text) {
    return expandPreviewVariables(text)
      .replace(/\\[nN]\[(\d+)\]/g, (_, id) => `Actor${id}`)
      .replace(/\\[pP]\[(\d+)\]/g, (_, id) => `Party${id}`)
      .replace(/\\[gG]/g, "G")
      .replace(/\\[iI]\[(\d+)\]/g, "□")
      .replace(/\\[cC]\[(\d+)\]/g, "")
      .replace(/\\[fF][sS]\[(\d+)\]/g, "")
      .replace(/\\[pP][xX]\[-?\d+\]/g, "")
      .replace(/\\[pP][yY]\[-?\d+\]/g, "")
      .replace(/\\[{}]/g, "")
      .replace(/\\[.$|!><^]/g, "")
      .replace(/\\\\/g, "\\");
  }

  function readPreviewBracketNumber(source, index) {
    if (source[index] !== "[") return { value: 0, next: index };
    const end = source.indexOf("]", index + 1);
    if (end < 0) return { value: 0, next: index };
    return { value: Number(source.slice(index + 1, end)) || 0, next: end + 1 };
  }

  function convertPreviewTextHtml(text, win, item, fallbackSize = 0) {
    const baseSize = effectiveFontSize(win, item, fallbackSize || previewDefaultFontSize());
    const baseColor = effectiveTextColor(win, item) || "";
    const source = expandPreviewVariables(text)
      .replace(/\\[nN]\[(\d+)\]/g, (_, id) => `Actor${id}`)
      .replace(/\\[pP]\[(\d+)\]/g, (_, id) => `Party${id}`)
      .replace(/\\[gG]/g, "G");
    let i = 0;
    let buffer = "";
    let html = "";
    let fontSize = baseSize;
    let color = baseColor;

    const flush = () => {
      if (!buffer) return;
      const style = [];
      if (fontSize && fontSize !== baseSize) style.push(`font-size:${fontSize}px`);
      if (color) style.push(`color:${escapeHtml(color)}`);
      html += style.length ? `<span style="${style.join(";")}">${escapeHtml(buffer)}</span>` : escapeHtml(buffer);
      buffer = "";
    };

    while (i < source.length) {
      const ch = source[i];
      if (ch !== "\\") {
        buffer += ch;
        i++;
        continue;
      }

      const next = source[i + 1] || "";
      if (next === "\\") {
        buffer += "\\";
        i += 2;
        continue;
      }

      const single = next;
      if (single === "{") {
        flush();
        fontSize = Math.min(96, fontSize + 12);
        i += 2;
        continue;
      }
      if (single === "}") {
        flush();
        fontSize = Math.max(24, fontSize - 12);
        i += 2;
        continue;
      }
      if (".$|!><^".includes(single)) {
        // ウェイトや入力待ちはツールプレビューでは時間制御しないため無視します。
        flush();
        i += 2;
        continue;
      }

      const rest = source.slice(i + 1);
      const codeMatch = rest.match(/^[A-Za-z]+/);
      if (!codeMatch) {
        buffer += ch;
        i++;
        continue;
      }

      const code = codeMatch[0].toUpperCase();
      let paramIndex = i + 1 + codeMatch[0].length;

      if (code === "C") {
        const param = readPreviewBracketNumber(source, paramIndex);
        flush();
        color = param.value === 0 ? baseColor : previewTextColor(param.value, baseColor);
        i = param.next;
        continue;
      }
      if (code === "I") {
        const param = readPreviewBracketNumber(source, paramIndex);
        flush();
        html += previewInlineIconHtml(param.value);
        i = param.next;
        continue;
      }
      if (code === "FS") {
        const param = readPreviewBracketNumber(source, paramIndex);
        flush();
        fontSize = Math.max(1, param.value || baseSize);
        i = param.next;
        continue;
      }
      if (code === "PX" || code === "PY") {
        const param = readPreviewBracketNumber(source, paramIndex);
        flush();
        // MZでは描画カーソル座標を直接変更します。ツールでは崩れ防止のため表示文字なしとして扱います。
        i = param.next;
        continue;
      }

      // 既にexpand済みのV/N/P/Gなど、表示を伴わない既知コードはここでは無視します。
      if (["V", "N", "P", "G"].includes(code)) {
        const param = readPreviewBracketNumber(source, paramIndex);
        i = param.next > paramIndex ? param.next : paramIndex;
        continue;
      }

      // 未対応の制御文字は、消さずに元の表記を残します。
      buffer += source.slice(i, paramIndex);
      i = paramIndex;
    }
    flush();
    return html;
  }

  function setPreviewRichText(el, text, win, item, fallbackSize = 0) {
    el.innerHTML = convertPreviewTextHtml(text, win, item, fallbackSize);
  }

  function previewDatabaseIdValue(binding, prefix = "") {
    const mode = String(binding?.[databaseBindingPropKey(prefix, "idMode")] || "fixed");
    const vars = previewVariableMap();
    if (mode === "variable") {
      const vid = Number(binding?.[databaseBindingPropKey(prefix, "idVariableId")] || 0);
      return Math.max(0, Number(vars.get(vid) ?? binding?.[databaseBindingPropKey(prefix, "id")] ?? 0));
    }
    return Math.max(0, Number(binding?.[databaseBindingPropKey(prefix, "id")] || 0));
  }

  function previewDbPathValue(base, path) {
    if (base == null) return null;
    const raw = String(path || "").trim();
    if (!raw || raw === "self") return base;
    const tokens = raw.replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean);
    let cur = base;
    for (const token of tokens) {
      if (cur == null) return null;
      cur = cur[token];
    }
    return cur;
  }

  function previewDatabaseObjectProp(row, fieldPath) {
    if (!row || typeof row !== "object") return null;
    const key = String(fieldPath || "name");
    if (!key || key === "self") return row;
    if (Object.prototype.hasOwnProperty.call(row, key)) return row[key];
    return previewDbPathValue(row, key);
  }

  function previewDatabaseRawValue(binding, prefix = "") {
    const sourceType = String(binding?.[databaseBindingPropKey(prefix, "sourceType")] || binding?.sourceType || "actor");
    const objectType = String(binding?.[databaseBindingPropKey(prefix, "objectType")] || binding?.objectType || "item");
    const fieldPath = String(binding?.[databaseBindingPropKey(prefix, "fieldPath")] || binding?.fieldPath || "name");
    const sourceId = previewDatabaseIdValue(binding, prefix);
    const vars = previewVariableMap();
    const s = previewSettings();

    if (sourceType === "variable") {
      const v = Number(vars.get(sourceId) ?? 0);
      if (!fieldPath || fieldPath === "self") return v;
      return previewDbPathValue(v, fieldPath);
    }
    if (sourceType === "gold") return Number(vars.get(999) ?? 12345);

    if (sourceType === "type") {
      const category = String(binding?.[databaseBindingPropKey(prefix, "typeCategory")] || binding?.typeCategory || "weaponTypes");
      const rows = projectSystemNamedList(category);
      return rows[sourceId] ?? "";
    }

    if (sourceType === "term") {
      const category = String(binding?.[databaseBindingPropKey(prefix, "termCategory")] || binding?.termCategory || "messages");
      const termKey = String(binding?.[databaseBindingPropKey(prefix, "termKey")] || binding?.termKey || "");
      const terms = projectAssets.system?.terms || {};
      return resolveDatabaseTermValue(terms, category, termKey, sourceId);
    }

    if (sourceType === "actor") {
      const actorId = Math.max(1, sourceId || 1);
      const actor = projectDatabaseTable("actor")[actorId];
      const classRow = actor ? projectDatabaseTable("class")[Number(actor.classId || 0)] : null;
      const table = {
        name: actor?.name || `アクター${actorId}`,
        nickname: actor?.nickname || "風の旅人",
        profile: actor?.profile || "冒険を夢見る青年。",
        className: classRow?.name || "戦士",
        level: Number(actor?.initialLevel || 1),
        hp: Number(s.previewActorHp || 0),
        mhp: Math.max(1, Number(s.previewActorMhp || 1)),
        mp: Number(s.previewActorMp || 0),
        mmp: Math.max(1, Number(s.previewActorMmp || 1)),
        tp: Number(s.previewActorTp || 0),
        maxTp: 100,
        currentExp: 1520,
        nextRequiredExp: 280
      };
      if (Object.prototype.hasOwnProperty.call(table, fieldPath)) return table[fieldPath];
      if (fieldPath.startsWith("param[")) return 100;
      return actor ? previewDatabaseObjectProp(actor, fieldPath) : "";
    }

    if (sourceType === "enemy") {
      const enemy = projectDatabaseTable("enemy")[sourceId];
      if (enemy) {
        if (fieldPath === "hp" || fieldPath === "mhp") return Number(enemy.params?.[0] ?? 0);
        if (fieldPath === "mp" || fieldPath === "mmp") return Number(enemy.params?.[1] ?? 0);
        if (fieldPath === "tp") return 0;
        const value = previewDatabaseObjectProp(enemy, fieldPath);
        return value == null ? "" : value;
      }
      const table = { name: "スライム", hp: 45, mhp: 45, mp: 12, mmp: 12, tp: 0, exp: 8, gold: 12 };
      return table[fieldPath] ?? (fieldPath.startsWith("param[") ? 10 : "");
    }

    if (sourceType === "state") {
      const state = projectDatabaseTable("state")[sourceId];
      if (state) {
        const value = previewDatabaseObjectProp(state, fieldPath);
        return value == null ? "" : value;
      }
      const table = { name: "毒", description: "毎ターンダメージ", message1: "毒に冒された！", message2: "毒で苦しんでいる" };
      return table[fieldPath] ?? "";
    }

    const dataKind = sourceType === "databaseObject"
      ? objectType
      : (["item", "weapon", "armor", "skill", "class"].includes(sourceType) ? sourceType : "");
    if (dataKind) {
      const row = projectDatabaseTable(dataKind)[sourceId];
      if (!row) return "";
      const value = previewDatabaseObjectProp(row, fieldPath || "name");
      return value == null ? "" : value;
    }

    return "";
  }

  function previewDatabaseTextValue(item) {
    const binding = ensureDatabaseBinding(item);
    if (!binding.enabled) return null;
    const raw = previewDatabaseRawValue(binding, "");
    return formatDatabaseBindingDisplayText(binding, raw);
  }

  function previewDatabaseGaugeValues(item) {
    const binding = ensureDatabaseBinding(item);
    if (!binding.enabled) return null;
    const value = Number(previewDatabaseRawValue(binding, "") || 0);
    const hasMax = String(binding.maxSourceType || "").trim().length > 0;
    const max = hasMax ? Number(previewDatabaseRawValue(binding, "max") || 1) : Math.max(1, Number(binding.maxFallback || 100));
    return { value, max: Math.max(1, max) };
  }

  function previewGaugeValues(item) {
    const dbValues = previewDatabaseGaugeValues(item);
    if (dbValues) return dbValues;
    const type = String(item.valueType || "fixed");
    const vars = previewVariableMap();
    const s = previewSettings();
    if (type === "variable") {
      const v = vars.get(Number(item.valueVariableId || 0));
      const m = vars.get(Number(item.maxVariableId || 0));
      return { value: Number(v ?? item.value ?? 0), max: Math.max(1, Number(m ?? item.max ?? 100)) };
    }
    if (type === "actorHp") return { value: Number(s.previewActorHp || 0), max: Math.max(1, Number(s.previewActorMhp || 1)) };
    if (type === "actorMp") return { value: Number(s.previewActorMp || 0), max: Math.max(1, Number(s.previewActorMmp || 1)) };
    if (type === "actorTp") return { value: Number(s.previewActorTp || 0), max: 100 };
    return { value: Number(item.value || 0), max: Math.max(1, Number(item.max || 100)) };
  }

  function createWindowSkinPreviewCanvas(win) {
    const s = previewSettings();
    if (!s.useWindowSkinPreview) {
      debugOnce("skin.preview.disabled", "warn", "Window.png風プレビューがOFFのため、装飾画像は描画されません。", { windowId: win.id });
      return null;
    }
    if (!projectAssets.loaded) {
      debugOnce("skin.project.notLoaded", "warn", "ツクールプロジェクト未読込のため、Window.png装飾は描画できません。", { windowId: win.id });
      return null;
    }
    if (!projectAssets.windowSkinUrl) {
      debugOnce("skin.windowpng.notFound", "warn", "img/system/Window.png が見つからないため、ウィンドウ装飾を描画できません。", {
        windowId: win.id,
        imageCount: projectAssets.images.size,
        sampleImageKeys: Array.from(projectAssets.images.keys()).slice(0, 20)
      });
      return null;
    }
    if (!projectAssets.windowSkinImage || !projectAssets.windowSkinReady) {
      debugOnce("skin.windowpng.notReady", "warn", "Window.png は見つかりましたが、画像読み込みがまだ完了していません。", {
        windowId: win.id,
        windowSkinUrlExists: !!projectAssets.windowSkinUrl,
        imageExists: !!projectAssets.windowSkinImage,
        ready: !!projectAssets.windowSkinReady
      });
      return null;
    }
    const canvas = document.createElement("canvas");
    const w = Math.max(1, Math.round(Number(win.width || 1)));
    const h = Math.max(1, Math.round(Number(win.height || 1)));
    canvas.className = "ui-window-skin-canvas";
    canvas.width = w;
    canvas.height = h;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext("2d");
    try {
      drawMzWindowSkin(ctx, projectAssets.windowSkinImage, win, w, h);
      if (!canvas.dataset.debugLogged) {
        canvas.dataset.debugLogged = "1";
        debugOnce(`skin.canvas.created.${win.id}`, "info", "Window.png装飾Canvasを作成しました。", {
          windowId: win.id,
          canvasWidth: w,
          canvasHeight: h,
          imageWidth: projectAssets.windowSkinImage.naturalWidth || projectAssets.windowSkinImage.width,
          imageHeight: projectAssets.windowSkinImage.naturalHeight || projectAssets.windowSkinImage.height
        });
      }
    } catch (e) {
      debugLog("error", "Window.png装飾Canvasの描画中にエラーが発生しました。", {
        windowId: win.id,
        message: e.message,
        stack: e.stack
      });
      return null;
    }
    return canvas;
  }

  function drawMzWindowSkin(ctx, img, win, w, h) {
    ctx.save();
    ctx.clearRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = true;
    const iw = img.naturalWidth || img.width || 0;
    const ih = img.naturalHeight || img.height || 0;
    if (iw < 192 || ih < 192) {
      debugOnce("skin.windowpng.small", "warn", "Window.png の画像サイズが想定より小さいため、MZ風の矩形切り出しが失敗する可能性があります。", { imageWidth: iw, imageHeight: ih, expected: "192x192以上" });
    }
    const opacity = clamp(Number(win.opacity ?? 255) / 255, 0, 1);
    const frameVisible = win.frameVisible !== false;
    const bgType = String(win.backgroundType || "normal");
    if (bgType === "dim") {
      drawMzDimBackground(ctx, w, h, opacity);
    } else if (bgType !== "transparent") {
      drawMzWindowBack(ctx, img, w, h, opacity);
    }
    if (frameVisible) drawMzWindowFrame(ctx, img, w, h);
    ctx.restore();
  }

  function drawMzWindowBack(ctx, img, w, h, opacity) {
    // MZ Window.prototype._refreshBack:
    // base: Window.png [0,0,95,95] を margin=4 内側へ拡大
    // pattern: Window.png [0,96,96,96] をその内側へタイル敷き
    const m = 4;
    const bw = Math.max(0, w - m * 2);
    const bh = Math.max(0, h - m * 2);
    if (bw <= 0 || bh <= 0) return;
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.drawImage(img, 0, 0, 95, 95, m, m, bw, bh);
    ctx.beginPath();
    ctx.rect(m, m, bw, bh);
    ctx.clip();
    for (let y = 0; y < bh; y += 96) {
      for (let x = 0; x < bw; x += 96) {
        const dw = Math.min(96, bw - x);
        const dh = Math.min(96, bh - y);
        ctx.drawImage(img, 0, 96, dw, dh, m + x, m + y, dw, dh);
      }
    }
    ctx.restore();
  }

  function drawMzDimBackground(ctx, w, h, opacity) {
    // Window_Base の dim 背景に近い簡易再現。
    const m = 4;
    const x = m;
    const y = m;
    const dw = Math.max(0, w - m * 2);
    const dh = Math.max(0, h - m * 2);
    if (dw <= 0 || dh <= 0) return;
    ctx.save();
    ctx.globalAlpha = opacity;
    const grad = ctx.createLinearGradient(0, y, 0, y + dh);
    grad.addColorStop(0, "rgba(0,0,0,0.35)");
    grad.addColorStop(0.5, "rgba(0,0,0,0.70)");
    grad.addColorStop(1, "rgba(0,0,0,0.35)");
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, dw, dh);
    ctx.restore();
  }

  function drawMzWindowFrame(ctx, img, w, h) {
    // MZ Window.prototype._refreshFrame:
    // Window.png [96,0,96,96] を m=24 の8パーツとして配置。
    const sx = 96;
    const sy = 0;
    const sw = 96;
    const sh = 96;
    const m = 24;
    const smw = sw - m * 2;
    const smh = sh - m * 2;
    const dmw = Math.max(0, w - m * 2);
    const dmh = Math.max(0, h - m * 2);
    if (w <= 0 || h <= 0) return;
    // corners
    drawPart(ctx, img, sx, sy, m, m, 0, 0, m, m);
    drawPart(ctx, img, sx + sw - m, sy, m, m, w - m, 0, m, m);
    drawPart(ctx, img, sx, sy + sh - m, m, m, 0, h - m, m, m);
    drawPart(ctx, img, sx + sw - m, sy + sh - m, m, m, w - m, h - m, m, m);
    // edges
    if (dmw > 0) {
      drawPart(ctx, img, sx + m, sy, smw, m, m, 0, dmw, m);
      drawPart(ctx, img, sx + m, sy + sh - m, smw, m, m, h - m, dmw, m);
    }
    if (dmh > 0) {
      drawPart(ctx, img, sx, sy + m, m, smh, 0, m, m, dmh);
      drawPart(ctx, img, sx + sw - m, sy + m, m, smh, w - m, m, m, dmh);
    }
  }

  function drawPart(ctx, img, sx, sy, sw, sh, dx, dy, dw, dh) {
    if (dw <= 0 || dh <= 0 || sw <= 0 || sh <= 0) return;
    const iw = img.naturalWidth || img.width || 0;
    const ih = img.naturalHeight || img.height || 0;
    if (sx + sw > iw || sy + sh > ih) {
      debugOnce(`skin.source.outside.${sx}.${sy}.${sw}.${sh}`, "warn", "Window.png の切り出し矩形が画像範囲外です。", { sx, sy, sw, sh, imageWidth: iw, imageHeight: ih });
      return;
    }
    ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
  }

  function imageKey(folder, fileName) {
    const f = (normalizeImageFolder(folder) || "pictures").toLowerCase();
    const name = stripImageExtension(fileName).toLowerCase();
    return `${f}/${name}`;
  }

  function findProjectImage(item) {
    const key = imageKey(item.folder || "pictures", item.fileName || "");
    return projectAssets.images.get(key) || null;
  }

  function syncSettingsInputs() {
    const s = previewSettings();
    const set = (id, value) => { const el = $(id); if (el && document.activeElement !== el) el.value = value; };
    const setChecked = (id, value) => { const el = $(id); if (el) el.checked = !!value; };
    set("previewFontSizeInput", s.defaultFontSize);
    set("previewLineHeightInput", s.lineHeight);
    set("previewPaddingInput", s.padding);
    set("previewTextYOffsetInput", s.textYOffset);
    set("previewTextColorInput", s.textColor || '');
    set("previewOutlineColorInput", s.outlineColor || '');
    set("previewOutlineWidthInput", s.outlineWidth ?? 4);
    set("previewVariablesInput", s.previewVariables);
    set("previewActorHpInput", s.previewActorHp);
    set("previewActorMhpInput", s.previewActorMhp);
    set("previewActorMpInput", s.previewActorMp);
    set("previewActorMmpInput", s.previewActorMmp);
    set("previewActorTpInput", s.previewActorTp);
    setChecked("useWindowSkinPreviewInput", s.useWindowSkinPreview);
    setChecked("previewFocusDimInput", s.previewFocusDim);
    set("dragStartThresholdInput", s.dragStartThreshold ?? 5);
    set("previewZoomPercentInput", s.previewZoomPercent ?? 100);
    const status = $("projectStatus");
    if (status) {
      status.textContent = projectAssets.loaded
        ? `読込済み: ${projectAssets.name || "Project"} / 画像${projectAssets.images.size}件${projectAssets.windowSkinUrl ? " / Window.png" : ""}${projectAssets.fontUrl ? " / フォント" : ""}${projectAssets.directoryHandleStored ? " / 自動再読込可" : ""}`
        : "未読込";
      status.title = projectAssets.loaded
        ? `${projectAssets.name || "ツクールプロジェクト"} / 画像 ${projectAssets.images.size}件${projectAssets.windowSkinUrl ? " / Window.pngあり" : ""}${projectAssets.fontUrl ? " / フォントあり" : ""}${projectAssets.directoryHandleStored ? " / データ読込時の自動再読込に対応" : " / 旧読込方式のため自動再読込不可"}`
        : "ツクールプロジェクトフォルダを指定すると、画像・Window.png・フォントをプレビューに反映します。";
    }
  }

  function applyPreviewSettingsFromInputs(reason = "プレビュー補正変更") {
    runStateMutation(reason, () => {
      const s = previewSettings();
      const num = (id, fallback) => Number($(id)?.value || fallback);
      s.defaultFontSize = Math.max(1, num("previewFontSizeInput", s.defaultFontSize));
      s.lineHeight = Math.max(1, num("previewLineHeightInput", s.lineHeight));
      s.padding = Math.max(0, num("previewPaddingInput", s.padding));
      s.textYOffset = num("previewTextYOffsetInput", s.textYOffset);
      s.textColor = String($("previewTextColorInput")?.value ?? s.textColor ?? '');
      s.outlineColor = String($("previewOutlineColorInput")?.value ?? s.outlineColor ?? '');
      s.outlineWidth = Math.max(0, num("previewOutlineWidthInput", s.outlineWidth ?? 4));
      s.previewVariables = String($("previewVariablesInput")?.value ?? s.previewVariables);
      s.previewActorHp = num("previewActorHpInput", s.previewActorHp);
      s.previewActorMhp = Math.max(1, num("previewActorMhpInput", s.previewActorMhp));
      s.previewActorMp = num("previewActorMpInput", s.previewActorMp);
      s.previewActorMmp = Math.max(1, num("previewActorMmpInput", s.previewActorMmp));
      s.previewActorTp = num("previewActorTpInput", s.previewActorTp);
      s.useWindowSkinPreview = !!$("useWindowSkinPreviewInput")?.checked;
      s.previewFocusDim = !!$("previewFocusDimInput")?.checked;
      s.dragStartThreshold = Math.max(0, num("dragStartThresholdInput", s.dragStartThreshold ?? 5));
      s.previewZoomPercent = Math.max(10, num("previewZoomPercentInput", s.previewZoomPercent ?? 100));
    });
  }

  function schedulePreviewSettingsApply(reason = "プレビュー補正変更") {
    if (previewSettingsApplyTimer) clearTimeout(previewSettingsApplyTimer);
    previewSettingsApplyTimer = setTimeout(() => {
      previewSettingsApplyTimer = 0;
      applyPreviewSettingsFromInputs(reason);
    }, 120);
  }

  function objectUrlForFile(file) {
    return URL.createObjectURL(file);
  }

  async function readTextFile(file) {
    return await file.text();
  }

  async function openProjectFolder() {
    if (supportsDirectoryPicker()) {
      try {
        const handle = await window.showDirectoryPicker({ mode: "readwrite" });
        await saveProjectDirectoryHandle(handle);
        await loadProjectDirectoryHandle(handle, { fromUserSelection: true });
        return;
      } catch (e) {
        if (e && e.name === "AbortError") return;
        debugLog("warn", "フォルダピッカーでのプロジェクト読込に失敗したため、旧方式に切り替えます。", { message: e?.message || String(e), name: e?.name || "" });
      }
    }
    $("projectFolderInput").click();
  }

  async function saveProjectDirectoryHandle(handle) {
    if (!handle) return false;
    try {
      await idbSet(PROJECT_HANDLE_KEY, handle);
      projectAssets.directoryHandle = handle;
      projectAssets.directoryHandleStored = true;
      debugLog("info", "ツクールプロジェクトのディレクトリハンドルを保存しました。", { name: handle.name || "" });
      return true;
    } catch (e) {
      debugLog("warn", "プロジェクトディレクトリの保存に失敗しました。ブラウザ仕様または権限の制限です。", { message: e?.message || String(e), name: e?.name || "" });
      return false;
    }
  }

  async function ensureDirectoryPermission(handle) {
    if (!handle) return false;
    const options = { mode: "read" };
    try {
      if (typeof handle.queryPermission === "function") {
        const q = await handle.queryPermission(options);
        if (q === "granted") return true;
      }
      if (typeof handle.requestPermission === "function") {
        const r = await handle.requestPermission(options);
        return r === "granted";
      }
      return true;
    } catch (e) {
      debugLog("warn", "プロジェクトディレクトリの権限確認に失敗しました。", { message: e?.message || String(e), name: e?.name || "" });
      return false;
    }
  }

  async function restoreProjectDirectoryFromSavedHandle() {
    if (!supportsDirectoryPicker()) {
      debugLog("warn", "このブラウザではディレクトリハンドルの復元に対応していません。再度『ツクールプロジェクト読込』を押してください。", {});
      return false;
    }
    let handle = null;
    try {
      handle = await idbGet(PROJECT_HANDLE_KEY);
    } catch (e) {
      debugLog("warn", "保存済みプロジェクトディレクトリ情報を読み込めませんでした。", { message: e?.message || String(e), name: e?.name || "" });
      return false;
    }
    if (!handle) {
      debugLog("warn", "保存済みプロジェクトディレクトリ情報がありません。", {});
      return false;
    }
    const ok = await ensureDirectoryPermission(handle);
    if (!ok) {
      debugLog("warn", "保存済みプロジェクトディレクトリの読込権限がありません。再度『ツクールプロジェクト読込』で指定してください。", { name: handle.name || "" });
      return false;
    }
    await loadProjectDirectoryHandle(handle, { fromRestore: true });
    return true;
  }

  async function loadProjectDirectoryHandle(handle, options = {}) {
    if (!handle) return;
    const ok = await ensureDirectoryPermission(handle);
    if (!ok) {
      showToast("プロジェクトフォルダの読込権限がありません");
      return;
    }
    const entries = [];
    await collectDirectoryEntries(handle, "", entries);
    await loadProjectEntries(entries, handle.name || "selected", {
      directoryHandle: handle,
      directoryHandleStored: true,
      fromRestore: !!options.fromRestore,
      fromUserSelection: !!options.fromUserSelection,
      quiet: !!options.quiet
    });
  }

  async function collectDirectoryEntries(dirHandle, prefix, entries) {
    for await (const [name, handle] of dirHandle.entries()) {
      const path = prefix ? `${prefix}/${name}` : name;
      if (handle.kind === "file") {
        try {
          const file = await handle.getFile();
          entries.push({ file, path });
        } catch (e) {
          debugLog("warn", "ファイルの取得に失敗しました。", { path, message: e?.message || String(e) });
        }
      } else if (handle.kind === "directory") {
        await collectDirectoryEntries(handle, path, entries);
      }
    }
  }

  function normalizeProjectFileEntries(files) {
    return Array.from(files || []).map(file => ({
      file,
      path: String(file.webkitRelativePath || file.name || "").replace(/\\/g, "/")
    }));
  }

  async function loadProjectFolder(files) {
    const entries = normalizeProjectFileEntries(files);
    const projectName = entries[0]?.path?.split("/")[0] || "selected";
    await loadProjectEntries(entries, projectName, { directoryHandleStored: false });
  }

  async function loadProjectEntries(entries, projectName = "selected", options = {}) {
    projectAssets = createProjectAssets();
    const list = Array.from(entries || []).filter(entry => entry && entry.file);
    if (!list.length) return;
    projectAssets.loaded = true;
    projectAssets.name = projectName || "selected";
    projectAssets.directoryHandle = options.directoryHandle || null;
    projectAssets.directoryHandleStored = !!options.directoryHandleStored;
    projectAssets.restoreStatus = options.fromRestore ? "restored" : options.fromUserSelection ? "selected" : "legacy";
    const fileListForFont = [];
    for (const entry of list) {
      const file = entry.file;
      const rawPath = String(entry.path || file.webkitRelativePath || file.name || "").replace(/\\/g, "/");
      const path = rawPath.startsWith(`${projectAssets.name}/`) ? rawPath : `${projectAssets.name}/${rawPath}`;
      const lower = path.toLowerCase();
      projectAssets.files.set(lower, file);
      fileListForFont.push({ file, path });
      const psdRel = normalizeProjectPsdPath(path);
      if (psdRel) {
        const psdKey = psdFileKeyFromPath(psdRel);
        projectAssets.psdFiles.set(psdKey, {
          key: psdKey,
          file,
          path,
          sourcePath: psdRel,
          label: psdFileLabelFromPath(psdRel),
          size: Number(file.size || 0),
          lastModified: Number(file.lastModified || 0)
        });
      }
      // img/pictures/ui/button.png のような入れ子フォルダも対象にする。
      // folder には "pictures/ui" を保持し、MZ側は img/pictures/ui/ から読み込む。
      const imgMatch = path.match(/(?:^|\/)img\/(.+)\/([^/]+)\.(png|jpg|jpeg|webp|gif|bmp)$/i);
      if (imgMatch) {
        const folder = normalizeImageFolder(imgMatch[1]);
        const baseName = imgMatch[2];
        const key = `${folder.toLowerCase()}/${baseName.toLowerCase()}`;
        const url = objectUrlForFile(file);
        projectAssets.images.set(key, { file, url, path, folder, baseName });
        if (folder.toLowerCase() === "system" && baseName.toLowerCase() === "window") {
          projectAssets.windowSkinUrl = url;
          const img = new Image();
          img.onload = () => {
            projectAssets.windowSkinReady = true;
            debugLog("info", "img/system/Window.png の読み込みに成功しました。", {
              path,
              naturalWidth: img.naturalWidth,
              naturalHeight: img.naturalHeight
            });
            render();
          };
          img.onerror = () => {
            projectAssets.windowSkinReady = false;
            debugLog("error", "img/system/Window.png の読み込みに失敗しました。", { path, fileName: file.name, type: file.type, size: file.size });
            render();
          };
          img.src = url;
          projectAssets.windowSkinImage = img;
        }
        if (folder.toLowerCase() === "system" && baseName.toLowerCase() === "iconset") {
          projectAssets.iconSetUrl = url;
          const iconImg = new Image();
          iconImg.onload = () => {
            projectAssets.iconSetReady = true;
            debugLog("info", "img/system/IconSet.png の読み込みに成功しました。", {
              path,
              naturalWidth: iconImg.naturalWidth,
              naturalHeight: iconImg.naturalHeight
            });
            render();
          };
          iconImg.onerror = () => {
            projectAssets.iconSetReady = false;
            debugLog("error", "img/system/IconSet.png の読み込みに失敗しました。", { path, fileName: file.name, type: file.type, size: file.size });
            render();
          };
          iconImg.src = url;
          projectAssets.iconSetImage = iconImg;
        }
      }
    }
    if (!projectAssets.windowSkinUrl) {
      debugLog("warn", "プロジェクト読込後も img/system/Window.png が見つかりませんでした。", {
        selectedRootName: projectAssets.name,
        fileCount: projectAssets.files.size,
        imageCount: projectAssets.images.size,
        sampleImageKeys: Array.from(projectAssets.images.keys()).slice(0, 20)
      });
    }
    const systemEntry = [...projectAssets.files.entries()].find(([p]) => /(?:^|\/)data\/system\.json$/i.test(p));
    if (systemEntry) {
      try {
        const sys = JSON.parse(await readTextFile(systemEntry[1]));
        projectAssets.system = sys;
        applySystemJson(sys);
      } catch (e) {
        debugLog("error", "System.json の読込に失敗しました。", { message: e.message, stack: e.stack });
      }
    }
    await loadProjectDatabaseTables();
    await loadProjectFont(fileListForFont);
    debugLog("info", options.fromRestore ? "保存済みプロジェクトディレクトリから再読込しました。" : "ツクールプロジェクト読込が完了しました。", {
      projectName: projectAssets.name,
      fileCount: projectAssets.files.size,
      imageCount: projectAssets.images.size,
      psdFileCount: projectAssets.psdFiles.size,
      hasWindowPng: !!projectAssets.windowSkinUrl,
      hasSystemJson: !!projectAssets.system,
      hasFont: !!projectAssets.fontUrl,
      handleStored: !!projectAssets.directoryHandleStored
    });
    render();
    if (!options.quiet) showToast(options.fromRestore ? "保存済みプロジェクトを再読込しました" : "ツクールプロジェクトを読み込みました");
  }

  async function readPsdImportCache(projectDirHandle, folderInfo) {
    try {
      const dir = await getNestedDirectoryHandle(projectDirHandle, folderInfo.folderSegments);
      const handle = await dir.getFileHandle(PSD_IMPORT_CACHE_FILE_NAME, { create: false });
      return await readJsonFileHandle(handle);
    } catch (_) {
      return null;
    }
  }

  function isSamePsdImportSource(cache, file, folderInfo) {
    const source = cache?.source || {};
    return !!cache
      && cache.type === "DB_UIComposer_PsdImportCache"
      && String(cache.assetFolder || "") === folderInfo.assetFolder
      && String(source.fileName || "") === String(file.name || "")
      && Number(source.size || 0) === Number(file.size || 0)
      && Number(source.lastModified || 0) === Number(file.lastModified || 0)
      && Array.isArray(cache.layers)
      && cache.layers.length > 0;
  }

  async function refreshProjectAssetsQuietly() {
    if (!projectAssets.directoryHandle) return;
    await loadProjectDirectoryHandle(projectAssets.directoryHandle, { fromRestore: true, quiet: true });
  }

  async function openPsdImportDialog() {
    if (!projectAssets.loaded || !projectAssets.directoryHandle) {
      showToast("先に『ツクールプロジェクト読込』でプロジェクトを開いてください");
      return;
    }
    if (!supportsPsdImport()) {
      alert("PSD読込ライブラリの初期化に失敗しました。vendor/ag-psd.bundle.js の配置を確認してください。");
      return;
    }
    const input = $("psdImportInput");
    if (!input) return;
    input.value = "";
    input.click();
  }

  async function handlePsdImportInput(fileList) {
    const file = fileList && fileList[0];
    if (!file) return;
    try {
      if (!projectAssets.loaded || !projectAssets.directoryHandle) throw new Error("先にツクールプロジェクトを読み込んでください。");
      const ok = await ensureDirectoryWritePermission(projectAssets.directoryHandle);
      if (!ok) throw new Error("プロジェクトフォルダへ書き込む権限がありません。");
      await importPsdAsComposite(file);
    } catch (e) {
      debugLog("error", "PSD取込中に例外が発生しました。", { message: e?.message || String(e), stack: e?.stack || "" });
      alert(`PSD取込に失敗しました。
${e?.message || String(e)}`);
    } finally {
      const input = $("psdImportInput");
      if (input) input.value = "";
    }
  }

  async function importPsdAsComposite(file, options = {}) {
    const sourcePath = normalizeProjectPsdPath(options.sourcePath || "");
    const folderInfo = psdImportFolderInfo(file.name || "imported.psd", sourcePath);
    const cache = await readPsdImportCache(projectAssets.directoryHandle, folderInfo);
    const sourceMeta = {
      sourceFileName: String(file.name || ""),
      sourceSize: Number(file.size || 0),
      sourceLastModified: Number(file.lastModified || 0),
      sourcePath: folderInfo.sourcePath || sourcePath || ""
    };
    if (isSamePsdImportSource(cache, file, folderInfo)) {
      await refreshProjectAssetsQuietly();
      const importedLayers = cache.layers.map((layer, index) => Object.assign({}, layer, {
        layerId: layer.layerId || safeId(layer.name || `layer${index + 1}`, `layer${index + 1}`),
        name: String(layer.name || `レイヤー${index + 1}`),
        fileName: String(layer.fileName || ""),
        left: Number(layer.left || 0),
        top: Number(layer.top || 0),
        width: Math.max(1, Number(layer.width || 1)),
        height: Math.max(1, Number(layer.height || 1)),
        opacity: normalizePsdOpacity(layer.opacity ?? 255),
        priority: Math.max(1, Number(layer.priority || (index + 1))),
        blendMode: normalizePsdBlendMode(layer.blendMode || "normal")
      }));
      const win = requireWindow();
      runStateMutation("PSD統合画像追加", () => {
        win.items = win.items || [];
        const item = createImportedCompositeItem(win, folderInfo.baseName, folderInfo.assetFolder, importedLayers, Object.assign({}, sourceMeta, { cacheHit: true, importedAt: cache.importedAt || new Date().toISOString() }));
        win.items.push(item);
        mode = "inside";
        selected = { kind: "item", windowId: win.id, itemId: item.id };
      });
      updateModeButtons();
      showToast(`PSDキャッシュを再利用しました（${importedLayers.length}レイヤー）`);
      debugLog("info", "PSDキャッシュを再利用して統合画像を作成しました。", { sourceFileName: file.name, assetFolder: folderInfo.assetFolder, layerCount: importedLayers.length });
      return;
    }

    let psd = null;
    try {
      const buffer = await file.arrayBuffer();
      psd = window.agPsd.readPsd(buffer);
    } catch (e) {
      debugLog("error", "PSDの解析に失敗しました。", { fileName: file.name, message: e?.message || String(e) });
      throw new Error(`PSDの解析に失敗しました: ${e?.message || String(e)}`);
    }

    const sourceLayers = [];
    collectPsdLeafLayers(psd.children || [], sourceLayers);
    if (!sourceLayers.length) {
      throw new Error("書き出し可能な通常画像レイヤーが見つかりませんでした。画像レイヤーが非表示のみ、または特殊レイヤーのみの可能性があります。");
    }

    const targetDir = await getOrCreateNestedDirectoryHandle(projectAssets.directoryHandle, folderInfo.folderSegments);
    const usedNames = new Set();
    const importedLayers = [];
    for (let index = 0; index < sourceLayers.length; index += 1) {
      const layer = sourceLayers[index];
      const baseName = sanitizeImportName(layer.pathNames.join("_") || layer.name || `layer${index + 1}`, `layer${index + 1}`);
      let fileName = baseName;
      let serial = 1;
      while (usedNames.has(fileName.toLowerCase())) fileName = `${baseName}_${++serial}`;
      usedNames.add(fileName.toLowerCase());
      const fileHandle = await targetDir.getFileHandle(`${fileName}.png`, { create: true });
      const blob = await canvasToPngBlob(layer.canvas);
      await writeBlobToFileHandle(fileHandle, blob);
      importedLayers.push({
        layerId: safeId(layer.name || fileName, `layer${index + 1}`),
        name: layer.pathNames.join(" / ") || layer.name || `レイヤー${index + 1}`,
        fileName,
        left: Number(layer.left || 0),
        top: Number(layer.top || 0),
        width: Math.max(1, Number(layer.width || 1)),
        height: Math.max(1, Number(layer.height || 1)),
        opacity: normalizePsdOpacity(layer.opacity ?? 255),
        priority: index + 1,
        blendMode: normalizePsdBlendMode(layer.blendMode || "normal")
      });
    }

    const cacheData = {
      type: "DB_UIComposer_PsdImportCache",
      version: TOOL_VERSION,
      importedAt: new Date().toISOString(),
      assetFolder: folderInfo.assetFolder,
      source: {
        fileName: String(file.name || ""),
        size: Number(file.size || 0),
        lastModified: Number(file.lastModified || 0),
        sourcePath: folderInfo.sourcePath || sourcePath || ""
      },
      layers: importedLayers.map(layer => ({
        layerId: layer.layerId,
        name: layer.name,
        fileName: layer.fileName,
        left: layer.left,
        top: layer.top,
        width: layer.width,
        height: layer.height,
        opacity: layer.opacity,
        priority: layer.priority,
        blendMode: layer.blendMode
      }))
    };
    const cacheHandle = await targetDir.getFileHandle(PSD_IMPORT_CACHE_FILE_NAME, { create: true });
    await writeTextToFileHandle(cacheHandle, JSON.stringify(cacheData, null, 2));

    await refreshProjectAssetsQuietly();
    const win = requireWindow();
    runStateMutation("PSD統合画像追加", () => {
      win.items = win.items || [];
      const item = createImportedCompositeItem(win, folderInfo.baseName, folderInfo.assetFolder, importedLayers, Object.assign({}, sourceMeta, { cacheHit: false, importedAt: cacheData.importedAt }));
      win.items.push(item);
      mode = "inside";
      selected = { kind: "item", windowId: win.id, itemId: item.id };
    });
    updateModeButtons();
    showToast(`PSDを取込みました（${importedLayers.length}レイヤー）`);
    debugLog("info", "PSDから統合画像を生成しました。", { sourceFileName: file.name, assetFolder: folderInfo.assetFolder, layerCount: importedLayers.length });
  }

  function createToolDataExport() {
    return {
      type: TOOL_DATA_TYPE,
      version: TOOL_VERSION,
      savedAt: new Date().toISOString(),
      layout: layoutForExport(),
      project: {
        name: projectAssets.name || "",
        hasPersistentDirectoryHandle: !!projectAssets.directoryHandleStored,
        handleKey: PROJECT_HANDLE_KEY,
        note: "ブラウザの仕様上、フルパス文字列は保存されません。対応ブラウザではIndexedDBに保存したディレクトリハンドルから再読込します。"
      },
      catalog: {
        saveMode: catalogSaveMode || "",
        relativePath: catalogSaveMode === CATALOG_SAVE_MODE_PROJECT ? "js/plugins/DB_UIComposer_CommandCatalog.js" : "",
        fileName: currentCatalogPluginFileName || "DB_UIComposer_CommandCatalog.js",
        autoUpdateOnToolSave: catalogSaveRegistered()
      }
    };
  }

  function normalizeToolDataFileName(name) {
    const raw = String(name || state.layoutId || "layout").trim();
    const safe = raw.replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, " ").trim() || "layout";
    return /\.json$/i.test(safe) ? safe : `${safe}_DB_UIComposerToolData.json`;
  }

  function suggestedToolDataFileName() {
    return normalizeToolDataFileName(currentToolDataFileName || `${state.layoutId || "layout"}_DB_UIComposerToolData.json`);
  }

  function updateToolDataSaveUi() {
    const saveButton = $("saveLocalBtn");
    if (!saveButton) return;
    saveButton.textContent = "保存";
    if (currentToolDataFileHandle) {
      saveButton.title = `現在のデータを ${currentToolDataFileName || currentToolDataFileHandle.name || "選択済みファイル"} に上書き保存します（Ctrl+S）。`;
      return;
    }
    if (currentToolDataFileName) {
      saveButton.title = `現在のデータを保存します（Ctrl+S）。このファイルはブラウザから書き込めないため、新規保存ダイアログを開きます。`;
      return;
    }
    saveButton.title = "現在のデータを保存します（Ctrl+S）。保存先が未指定のため、新規保存ダイアログを開きます。";
  }

  function createToolDataBlob() {
    return new Blob([JSON.stringify(createToolDataExport(), null, 2)], { type: "application/json" });
  }

  function downloadToolDataWithName(fileName) {
    const normalizedName = normalizeToolDataFileName(fileName);
    const blob = createToolDataBlob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = normalizedName;
    a.click();
    URL.revokeObjectURL(a.href);
    currentToolDataFileName = normalizedName;
    currentToolDataFileHandle = null;
    updateToolDataSaveUi();
    showToast("ツールデータを保存しました");
    debugLog("info", "ツールデータをダウンロード保存しました。", { fileName: normalizedName, overwrite: false });
    void autoUpdateCatalogAfterToolSave();
  }

  async function ensureToolDataWritePermission(handle) {
    if (!handle) return false;
    const options = { mode: "readwrite" };
    try {
      if (typeof handle.queryPermission === "function") {
        const status = await handle.queryPermission(options);
        if (status === "granted") return true;
      }
      if (typeof handle.requestPermission === "function") {
        const status = await handle.requestPermission(options);
        return status === "granted";
      }
      // 古い実装では permission API が無くても createWritable が使える場合があります。
      return true;
    } catch (e) {
      debugLog("warn", "ツールデータ保存先の書込権限を確認できませんでした。", { message: e?.message || String(e) });
      return false;
    }
  }

  async function writeToolDataToHandle(handle) {
    const writable = await handle.createWritable();
    await writable.write(createToolDataBlob());
    await writable.close();
    currentToolDataFileHandle = handle;
    currentToolDataFileName = handle.name || currentToolDataFileName || suggestedToolDataFileName();
    updateToolDataSaveUi();
    showToast("現在のデータに上書き保存しました");
    debugLog("info", "現在のツールデータへ上書き保存しました。", { fileName: currentToolDataFileName, overwrite: true });
  }

  async function saveToolDataAs() {
    if (supportsToolDataSavePicker()) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: suggestedToolDataFileName(),
          types: [{
            description: "DB_UIComposer ツールデータ",
            accept: { "application/json": [".json"] }
          }]
        });
        await writeToolDataToHandle(handle);
        await autoUpdateCatalogAfterToolSave();
        return true;
      } catch (e) {
        if (e?.name === "AbortError") {
          showToast("保存をキャンセルしました");
          return false;
        }
        debugLog("warn", "ブラウザの保存ダイアログを使えませんでした。代替の保存ダイアログを開きます。", { message: e?.message || String(e), name: e?.name || "" });
      }
    }
    openFallbackSaveDialog();
    return false;
  }

  async function saveCurrentToolData() {
    if (currentToolDataFileHandle) {
      const allowed = await ensureToolDataWritePermission(currentToolDataFileHandle);
      if (allowed) {
        try {
          await writeToolDataToHandle(currentToolDataFileHandle);
          await autoUpdateCatalogAfterToolSave();
          return true;
        } catch (e) {
          debugLog("warn", "現在のツールデータへ上書き保存できませんでした。新規保存へ切り替えます。", {
            message: e?.message || String(e), name: e?.name || "", fileName: currentToolDataFileName
          });
          currentToolDataFileHandle = null;
          updateToolDataSaveUi();
        }
      } else {
        debugLog("warn", "現在のツールデータに書き込む権限がありません。新規保存へ切り替えます。", { fileName: currentToolDataFileName });
        currentToolDataFileHandle = null;
        updateToolDataSaveUi();
      }
    }
    return await saveToolDataAs();
  }

  function openFallbackSaveDialog() {
    const dialog = $("saveToolDataDialog");
    const input = $("saveToolDataNameInput");
    if (!dialog || !input) {
      // dialog非対応環境の最終フォールバックです。
      const entered = window.prompt("保存するファイル名", suggestedToolDataFileName());
      if (entered) downloadToolDataWithName(entered);
      return;
    }
    input.value = suggestedToolDataFileName();
    if (typeof dialog.showModal === "function") {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }
    setTimeout(() => {
      input.focus();
      input.select();
    }, 0);
  }

  function closeFallbackSaveDialog() {
    const dialog = $("saveToolDataDialog");
    if (!dialog) return;
    if (typeof dialog.close === "function" && dialog.open) dialog.close();
    else dialog.removeAttribute("open");
  }

  function confirmFallbackSaveDialog() {
    const input = $("saveToolDataNameInput");
    const fileName = normalizeToolDataFileName(input?.value || suggestedToolDataFileName());
    closeFallbackSaveDialog();
    downloadToolDataWithName(fileName);
  }

  async function openToolDataFile() {
    if (supportsToolDataOpenPicker()) {
      try {
        const [handle] = await window.showOpenFilePicker({
          multiple: false,
          types: [{
            description: "DB_UIComposer ツールデータ",
            accept: { "application/json": [".json"] }
          }]
        });
        const file = await handle.getFile();
        await loadToolDataFile(file, handle);
        return;
      } catch (e) {
        if (e?.name === "AbortError") return;
        debugLog("warn", "ブラウザの読込ダイアログを使えませんでした。通常のファイル選択に切り替えます。", { message: e?.message || String(e), name: e?.name || "" });
      }
    }
    $("toolDataInput")?.click();
  }

  async function loadToolDataFile(file, handle = null) {
    if (!file) return;
    try {
      const text = await file.text();
      await importToolData(text);
      currentToolDataFileHandle = handle || null;
      currentToolDataFileName = file.name || "";
      updateToolDataSaveUi();
      showToast(handle ? "ツールデータを読み込みました。Ctrl+Sで上書き保存できます" : "ツールデータを読み込みました");
      debugLog("info", "ツールデータを読み込みました。", {
        fileName: currentToolDataFileName,
        canOverwrite: !!currentToolDataFileHandle
      });
    } catch (e) {
      alert(`ツールデータの読み込みに失敗しました。\n${e.message}`);
      debugLog("error", "ツールデータの読み込みに失敗しました。", { message: e?.message || String(e), stack: e?.stack || "" });
    } finally {
      const input = $("toolDataInput");
      if (input) input.value = "";
    }
  }

  async function importToolData(text) {
    const data = JSON.parse(text);
    if (data && data.type === TOOL_DATA_TYPE && data.layout) {
      importJson(JSON.stringify(data.layout), { skipRender: true });
      render();
      if (data.catalog?.saveMode) {
        catalogSaveMode = String(data.catalog.saveMode || "");
        if (catalogSaveMode) localStorage.setItem(CATALOG_SAVE_MODE_KEY, catalogSaveMode);
        currentCatalogPluginFileName = data.catalog.fileName || currentCatalogPluginFileName || "DB_UIComposer_CommandCatalog.js";
        updateCatalogSaveUi();
      }
      const shouldRestoreProject = data.project?.hasPersistentDirectoryHandle === true;
      if (shouldRestoreProject) {
        const restored = await restoreProjectDirectoryFromSavedHandle();
        if (!restored && data.project?.name) {
          debugLog("warn", "ツールデータ内にプロジェクト情報はありますが、自動再読込できませんでした。必要なら『ツクールプロジェクト読込』で再指定してください。", data.project);
          showToast("配置は読み込みました。プロジェクトは再指定してください");
        }
      } else {
        // v0.3.92: プロジェクト未読込で保存したツールデータでは、以前IndexedDBに残っている
        // プロジェクトハンドルを勝手に再読込しません。
        debugLog("info", "このツールデータはプロジェクト自動再読込なしとして読み込みました。", data.project || {});
      }
      return;
    }
    importJson(text);
  }

  function applySystemJson(sys) {
    const adv = sys.advanced || {};
    const w = Number(adv.screenWidth || adv.uiAreaWidth || sys.screenWidth || 0);
    const h = Number(adv.screenHeight || adv.uiAreaHeight || sys.screenHeight || 0);
    if (w > 0) state.screenWidth = w;
    if (h > 0) state.screenHeight = h;
    const s = previewSettings();
    const fontFile = adv.gameFontFilename || adv.mainFontFilename || adv.fontFilename || "";
    if (fontFile) s.fontFileName = fontFile;
    if (adv.fontSize) s.defaultFontSize = Number(adv.fontSize);
  }

  async function loadProjectFont(list) {
    const s = previewSettings();
    const preferred = String(s.fontFileName || "").toLowerCase();
    const entries = Array.from(list || []).map(entry => {
      if (entry && entry.file) return entry;
      return { file: entry, path: String(entry?.webkitRelativePath || entry?.name || "").replace(/\\/g, "/") };
    });
    let entry = null;
    if (preferred) {
      entry = entries.find(e => String(e.path || e.file?.name || "").toLowerCase().replace(/\\/g, "/").endsWith(`/fonts/${preferred}`));
    }
    if (!entry) entry = entries.find(e => /(?:^|\/)fonts\/[^/]+\.(woff|woff2|ttf|otf)$/i.test(String(e.path || e.file?.name || "").replace(/\\/g, "/")));
    if (!entry || !entry.file) {
      debugOnce("font.notFound", "warn", "fontsフォルダ内のフォントが見つからなかったため、ブラウザ標準フォントで表示します。", { preferredFont: preferred || "未指定" });
      return;
    }
    const file = entry.file;
    const url = objectUrlForFile(file);
    projectAssets.fontUrl = url;
    if (projectAssets.fontStyleEl) projectAssets.fontStyleEl.remove();
    const style = document.createElement("style");
    style.textContent = `@font-face { font-family: "DB_UIComposer_MZFont"; src: url("${url}"); }`;
    document.head.appendChild(style);
    projectAssets.fontStyleEl = style;
    s.fontFamily = '"DB_UIComposer_MZFont", sans-serif';
    s.fontFileName = file.name;
    debugLog("info", "プレビューフォントを読み込みました。", { fileName: file.name, path: entry.path || file.name });
  }



  function initCollapsibleSections() {
    document.querySelectorAll('.collapsible-section').forEach(section => {
      const key = section.dataset.collapseKey || '';
      const button = section.querySelector('.section-toggle');
      if (!button) return;
      const storageKey = key ? `DB_UIComposer_collapsed_${key}` : '';
      if (storageKey && localStorage.getItem(storageKey) === '1') {
        section.classList.add('collapsed');
        button.setAttribute('aria-expanded', 'false');
      }
      button.addEventListener('click', () => {
        const collapsed = !section.classList.contains('collapsed');
        section.classList.toggle('collapsed', collapsed);
        button.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        if (storageKey) localStorage.setItem(storageKey, collapsed ? '1' : '0');
      });
    });
  }


  function pointerToPreviewPoint(clientX, clientY) {
    const rect = preview.getBoundingClientRect();
    if (!rect.width || !rect.height) return { x: 0, y: 0 };
    return {
      x: (clientX - rect.left) * (Number(state.screenWidth || 1) / rect.width),
      y: (clientY - rect.top) * (Number(state.screenHeight || 1) / rect.height)
    };
  }

  function pointInRect(point, rect) {
    return point.x >= rect.x && point.y >= rect.y
      && point.x <= rect.x + rect.width && point.y <= rect.y + rect.height;
  }

  function intersectRects(a, b) {
    const x = Math.max(a.x, b.x);
    const y = Math.max(a.y, b.y);
    const right = Math.min(a.x + a.width, b.x + b.width);
    const bottom = Math.min(a.y + a.height, b.y + b.height);
    if (right <= x || bottom <= y) return null;
    return { x, y, width: right - x, height: bottom - y };
  }

  function windowHitRect(win) {
    return {
      x: Number(win.x || 0),
      y: Number(win.y || 0),
      width: Math.max(1, Number(win.width || 1)),
      height: Math.max(1, Number(win.height || 1))
    };
  }

  function itemHitRect(win, item) {
    const metrics = windowLayerMetrics(win);
    const bounds = itemPreviewBounds(item);
    let rect = {
      x: Number(win.x || 0) + metrics.contentLeft + bounds.x,
      y: Number(win.y || 0) + metrics.contentTop + bounds.y,
      width: bounds.width,
      height: bounds.height
    };
    // 通常パーツはウィンドウ本体矩形でクリップされるため、見えている範囲だけを当たり判定にします。
    if (item.allowOutsideWindow !== true) rect = intersectRects(rect, windowHitRect(win));
    return rect;
  }

  function compareWindowsFrontToBack(a, b) {
    const az = layerZ(a.layer, a);
    const bz = layerZ(b.layer, b);
    if (az !== bz) return bz - az;
    return state.windows.indexOf(b) - state.windows.indexOf(a);
  }

  function compareItemsFrontToBack(win, a, b) {
    const az = zOrderValue(a);
    const bz = zOrderValue(b);
    if (az !== bz) return bz - az;
    return (win.items || []).indexOf(b) - (win.items || []).indexOf(a);
  }

  function handlePreviewPointerDownCapture(ev) {
    if (ev.button !== 0 || (ev.pointerType && ev.pointerType !== "mouse")) return;
    const now = Date.now();
    const isSecondClick = lastPreviewPrimaryDown
      && lastPreviewPrimaryDown.mode === mode
      && Math.abs(lastPreviewPrimaryDown.x - ev.clientX) <= 8
      && Math.abs(lastPreviewPrimaryDown.y - ev.clientY) <= 8
      && now - lastPreviewPrimaryDown.time <= 550;

    if (!isSecondClick) {
      lastPreviewPrimaryDown = { mode, x: ev.clientX, y: ev.clientY, time: now };
      return;
    }

    // 次の連続ダブルクリックは、新たな二回組として数えます。
    lastPreviewPrimaryDown = null;
    let hits = [];
    if (!globalPartPositionLocked) hits = hitInsideCandidatesAtPoint(ev.clientX, ev.clientY);
    if (!hits.length && !globalWindowPositionLocked) hits = hitWindowsAtPoint(ev.clientX, ev.clientY);
    if (hits.length === 0) return;
    if (tryBeginFocusedInlineEditFromCapture(ev, hits)) return;
    if (hits.length <= 1) return;

    // 子要素側のpointerdownが最前面を選び直してしまわないよう、ここで止めます。
    ev.preventDefault();
    ev.stopImmediatePropagation();
    ev.stopPropagation();
    const next = nextDoubleClickCandidate(hits, ev.clientX, ev.clientY);
    if (!next) return;
    debugLog("info", mode === "screen"
      ? "ダブルクリックで重なったウィンドウの選択を切り替えました。"
      : "ダブルクリックで重なったパーツ/ウィンドウの選択を切り替えました。", {
      selected: candidateKey(next),
      hitOrder: hits.map(candidateKey)
    });
    selectCandidate(next);
  }

  function candidateKey(candidate) {
    if (!candidate) return "";
    if (candidate.kind === "item") return `item:${candidate.windowId}/${candidate.itemId}`;
    return `window:${candidate.windowId}`;
  }

  function selectedCandidateKey() {
    if (!selected) return "";
    if (selected.kind === "item") return `item:${selected.windowId}/${selected.itemId}`;
    if (selected.kind === "window") return `window:${selected.windowId}`;
    return "";
  }

  function selectCandidate(candidate) {
    if (!candidate) return;
    if (candidate.kind === "item") selectItem(candidate.windowId, candidate.itemId);
    else selectWindow(candidate.windowId);
  }

  function nextDoubleClickCandidate(hits, clientX, clientY) {
    const signature = hits.map(candidateKey).join("|");
    const now = Date.now();
    const sameCycle = doubleClickCycle
      && doubleClickCycle.mode === mode
      && doubleClickCycle.signature === signature
      && Math.abs(doubleClickCycle.x - clientX) <= 8
      && Math.abs(doubleClickCycle.y - clientY) <= 8
      && now - doubleClickCycle.time <= 2500;

    let currentIndex = -1;
    if (sameCycle && doubleClickCycle.key) {
      currentIndex = hits.findIndex(hit => candidateKey(hit) === doubleClickCycle.key);
    }
    if (currentIndex < 0) {
      const selectedKey = selectedCandidateKey();
      currentIndex = hits.findIndex(hit => candidateKey(hit) === selectedKey);
    }
    const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % hits.length : 0;
    const next = hits[nextIndex] || hits[0];
    doubleClickCycle = {
      mode,
      signature,
      key: candidateKey(next),
      x: clientX,
      y: clientY,
      time: now
    };
    return next;
  }

  // DOMのelementsFromPointは最前面の兄弟要素しか返さないことがあるため、
  // レイアウト座標を使って重なり候補を必ず列挙します。
  function hitWindowsAtPoint(clientX, clientY) {
    const point = pointerToPreviewPoint(clientX, clientY);
    return state.windows
      .filter(win => win.visible !== false && pointInRect(point, windowHitRect(win)))
      .sort(compareWindowsFrontToBack)
      .map(win => ({ kind: "window", windowId: win.id }));
  }

  function hitInsideCandidatesAtPoint(clientX, clientY) {
    const point = pointerToPreviewPoint(clientX, clientY);
    const windowHits = state.windows
      .filter(win => win.visible !== false && pointInRect(point, windowHitRect(win)))
      .sort(compareWindowsFrontToBack);
    if (windowHits.length === 0) return [];

    const focusedId = focusedInsideWindowId();
    const focusWindow = windowHits.find(win => win.id === focusedId) || windowHits[0];
    const focusItems = (focusWindow.items || [])
      .filter(item => item.visible !== false)
      .filter(item => {
        const rect = itemHitRect(focusWindow, item);
        return rect && pointInRect(point, rect);
      })
      .sort((a, b) => compareItemsFrontToBack(focusWindow, a, b));

    const candidates = [];
    const selectedKey = selectedCandidateKey();
    // 現在選択中のパーツが重なり地点にあれば、必ず巡回の先頭に置きます。
    const currentItem = focusItems.find(item => `item:${focusWindow.id}/${item.id}` === selectedKey);
    if (currentItem) candidates.push({ kind: "item", windowId: focusWindow.id, itemId: currentItem.id });
    for (const item of focusItems) {
      if (currentItem && item.id === currentItem.id) continue;
      candidates.push({ kind: "item", windowId: focusWindow.id, itemId: item.id });
    }

    // フォーカス中ウィンドウのパーツの次に、他ウィンドウ本体を並べます。
    // 他ウィンドウはここで「ウィンドウへフォーカス」として選択されます。
    for (const win of windowHits) {
      if (win.id === focusWindow.id) continue;
      candidates.push({ kind: "window", windowId: win.id });
    }

    // パーツがない場合でも、現在フォーカス中のウィンドウ自体は選択候補として残します。
    if (candidates.length === 0 || !candidates.some(c => c.kind === "window" && c.windowId === focusWindow.id)) {
      if (focusItems.length === 0) candidates.unshift({ kind: "window", windowId: focusWindow.id });
    }
    return candidates;
  }


  // v0.2.92: 左右パネルの幅をドラッグで変更できるようにする。
  function initPanelSplitters() {
    const root = document.documentElement;
    const app = document.querySelector('.app');
    const left = document.querySelector('.left-panel');
    const right = document.querySelector('.right-panel');
    const leftSplitter = $('leftPanelSplitter');
    const rightSplitter = $('rightPanelSplitter');
    if (!app || !left || !right) return;

    const LEFT_KEY = 'DB_UIComposer_leftPanelWidth';
    const RIGHT_KEY = 'DB_UIComposer_rightPanelWidth';
    const DEFAULT_LEFT = 280;
    const DEFAULT_RIGHT = 360;

    function clampPanelWidth(value, min, max) {
      return Math.max(min, Math.min(max, Math.round(Number(value) || 0)));
    }

    function setLeftWidth(value, persist = true) {
      const max = Math.max(220, Math.min(680, window.innerWidth - 560));
      const width = clampPanelWidth(value, 180, max);
      root.style.setProperty('--db-ui-left-panel-width', `${width}px`);
      if (persist) localStorage.setItem(LEFT_KEY, String(width));
    }

    function setRightWidth(value, persist = true) {
      const max = Math.max(240, Math.min(760, window.innerWidth - 560));
      const width = clampPanelWidth(value, 220, max);
      root.style.setProperty('--db-ui-right-panel-width', `${width}px`);
      if (persist) localStorage.setItem(RIGHT_KEY, String(width));
    }

    function loadSavedWidths() {
      const savedLeft = Number(localStorage.getItem(LEFT_KEY) || DEFAULT_LEFT);
      const savedRight = Number(localStorage.getItem(RIGHT_KEY) || DEFAULT_RIGHT);
      setLeftWidth(savedLeft, false);
      setRightWidth(savedRight, false);
    }

    function beginDrag(ev, side) {
      if (ev.button !== 0) return;
      ev.preventDefault();
      const startX = ev.clientX;
      const startLeft = left.getBoundingClientRect().width;
      const startRight = right.getBoundingClientRect().width;
      const splitter = side === 'left' ? leftSplitter : rightSplitter;
      splitter?.classList.add('dragging');
      document.body.classList.add('panel-resizing');

      function onMove(moveEv) {
        const dx = moveEv.clientX - startX;
        if (side === 'left') {
          setLeftWidth(startLeft + dx);
        } else {
          setRightWidth(startRight - dx);
        }
      }

      function onUp() {
        splitter?.classList.remove('dragging');
        document.body.classList.remove('panel-resizing');
        window.removeEventListener('pointermove', onMove, true);
        window.removeEventListener('pointerup', onUp, true);
        render();
      }

      window.addEventListener('pointermove', onMove, true);
      window.addEventListener('pointerup', onUp, true);
    }

    leftSplitter?.addEventListener('pointerdown', ev => beginDrag(ev, 'left'));
    rightSplitter?.addEventListener('pointerdown', ev => beginDrag(ev, 'right'));
    leftSplitter?.addEventListener('dblclick', () => { setLeftWidth(DEFAULT_LEFT); render(); showToast('左メニュー幅を初期化しました'); });
    rightSplitter?.addEventListener('dblclick', () => { setRightWidth(DEFAULT_RIGHT); render(); showToast('右メニュー幅を初期化しました'); });
    window.addEventListener('resize', () => {
      const lw = left.getBoundingClientRect().width || DEFAULT_LEFT;
      const rw = right.getBoundingClientRect().width || DEFAULT_RIGHT;
      setLeftWidth(lw, false);
      setRightWidth(rw, false);
    });

    loadSavedWidths();
  }

  function partVariantGroups() {
    return {
      window: {
        title: "ウィンドウを追加",
        description: "画面上に配置するウィンドウの種類を選びます。",
        variants: [
          {
            id: "standardWindow",
            label: "標準ウィンドウ",
            icon: "▣",
            description: "通常のDB_UIComposerウィンドウを追加します。",
            action: () => addWindow()
          }
        ]
      },
      text: {
        title: "文字パーツを追加",
        description: "文字表示系パーツの種類を選びます。",
        variants: [
          {
            id: "standardText",
            label: "通常テキスト",
            icon: "T",
            description: "\V[n]などの制御文字に対応した文字パーツです。",
            action: () => addItem("text")
          },
          {
            id: "logText",
            label: "ログの挿入",
            icon: "LOG",
            description: "プラグインコマンドで行を追加できるログ表示パーツです。表示時間・フェード・移動時間を設定できます。",
            action: () => addItem("log")
          }
        ]
      },
      gauge: {
        title: "ゲージパーツを追加",
        description: "HP/探索度などのバー表示に使います。",
        variants: [
          {
            id: "horizontalGauge",
            label: "横ゲージ",
            icon: "▰",
            description: "左右方向に伸縮するゲージです。減る方向を指定できます。",
            action: () => { const item = addItem("gauge"); if (item) { item.gaugeShape = "horizontal"; item.gaugeDirection = "leftToRight"; item.width = item.width || 220; item.height = item.height || 14; } }
          },
          {
            id: "verticalGauge",
            label: "縦ゲージ",
            icon: "▌",
            description: "上下方向に伸縮するゲージです。減る方向を指定できます。",
            action: () => { const item = addItem("gauge"); if (item) { item.gaugeShape = "vertical"; item.gaugeDirection = "bottomToTop"; item.width = 24; item.height = 180; } }
          },
          {
            id: "circleGauge",
            label: "円ゲージ",
            icon: "◔",
            description: "円形に進捗を表示するゲージです。時計回り/反時計回りを指定できます。",
            action: () => { const item = addItem("gauge"); if (item) { item.gaugeShape = "circle"; item.gaugeDirection = "clockwise"; item.width = 96; item.height = 96; } }
          }
        ]
      },
      button: {
        title: "ボタンパーツを追加",
        description: "クリック可能なボタンの種類を選びます。",
        variants: [
          {
            id: "standardButton",
            label: "通常ボタン",
            icon: "□",
            description: "マウスON/押下/離すの状態変化に対応したボタンです。",
            action: () => addItem("button")
          },
          {
            id: "imageButton",
            label: "画像ボタン",
            icon: "IMG",
            description: "状態ごとに画像を指定できるボタンです。通常/マウスON/押下/離すで画像を切り替えられます。",
            action: () => {
              const item = addItem("button", { buttonVisualMode: "image", text: "" });
              setTimeout(() => openProjectImagePicker(ensureButtonImages(item).mouseOff, { ownerItem: item, fitOwnerSize: true }), 0);
            }
          },
          {
            id: "psdButton",
            label: "PSDボタン",
            icon: "PSD",
            description: "統合画像プリセット管理の名前IDをボタン画像として使います。状態ごとに名前IDを指定できます。",
            action: () => {
              const item = addItem("button", { buttonVisualMode: "psd", text: "" });
              if (item) item.buttonStateEdit = "mouseOff";
              setTimeout(() => openCompositePresetInsertPicker(item), 0);
            }
          }
        ]
      },
      choice: {
        title: "選択肢パーツを追加",
        description: "用途に合わせて、シンプルな固定選択肢か、プラグインコマンドで内容を変える選択肢を選びます。",
        variants: [
          {
            id: "simpleChoiceList",
            label: "シンプル選択肢",
            icon: "☰",
            description: "選択肢の個数・文字をこのツール側で設定する選択肢を挿入します。プラグインコマンドでは表示/非表示や座標変更のみ指定する、シンプルな選択肢におすすめです。",
            action: () => addItem("choiceList", { choiceMode: "tool" })
          },
          {
            id: "customChoiceList",
            label: "カスタマイズ選択肢",
            icon: "⇄",
            description: "状況によって選択肢の個数や文字、条件による有効化・無効化など詳細が設定できる選択肢です。プラグインコマンドで内容を細かく設定できます。",
            action: () => addItem("choiceList", { choiceMode: "command" })
          }
          ,{
            id: "imageChoiceList",
            label: "画像選択肢",
            icon: "▧",
            description: "各選択肢を画像として自由配置します。有効/無効/マウスON/クリック時の画像や簡易エフェクトを設定できます。",
            action: () => addItem("imageChoiceList")
          }
        ]
      },
      image: {
        title: "画像パーツを追加",
        description: "画像表示系パーツの種類を選びます。",
        variants: [
          {
            id: "standardImage",
            label: "通常画像",
            icon: "🖼",
            description: "プロジェクト内画像を配置する画像パーツです。",
            action: () => {
              const item = addItem("image");
              setTimeout(() => openProjectImagePicker(item), 0);
            }
          },
          {
            id: "compositeImage",
            label: "複合画像",
            icon: "🗂",
            description: "複数画像を1つに合成して扱うパーツです。ゲーム内では一枚絵として表示できます。",
            action: () => {
              openCompositePresetInsertPicker();
            }
          }
        ]
      }
    };
  }

  let activePartVariantCategory = "";
  let activePartVariantButton = null;

  function partVariantPaletteElement() {
    return $("partVariantPalette");
  }

  function closePartVariantPalette() {
    const palette = partVariantPaletteElement();
    if (!palette) return;
    palette.hidden = true;
    palette.innerHTML = "";
    for (const button of document.querySelectorAll(".icon-add-button.palette-open")) button.classList.remove("palette-open");
    activePartVariantCategory = "";
    activePartVariantButton = null;
  }

  function positionPartVariantPalette(anchor) {
    const palette = partVariantPaletteElement();
    if (!palette || !anchor) return;
    const rect = anchor.getBoundingClientRect();
    const width = Math.min(320, Math.max(240, palette.offsetWidth || 260));
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    const top = Math.max(8, Math.min(rect.bottom + 8, window.innerHeight - 80));
    palette.style.left = `${left}px`;
    palette.style.top = `${top}px`;
  }

  function openPartVariantPalette(category, anchor) {
    const palette = partVariantPaletteElement();
    if (!palette) return;
    const groups = partVariantGroups();
    const group = groups[category];
    if (!group) return;
    if (!palette.hidden && activePartVariantCategory === category && activePartVariantButton === anchor) {
      closePartVariantPalette();
      return;
    }
    closePartVariantPalette();
    activePartVariantCategory = category;
    activePartVariantButton = anchor || null;
    if (anchor) anchor.classList.add("palette-open");

    const title = document.createElement("div");
    title.className = "part-variant-title";
    title.textContent = group.title;
    palette.appendChild(title);

    if (group.description) {
      const desc = document.createElement("div");
      desc.className = "part-variant-description";
      desc.textContent = group.description;
      palette.appendChild(desc);
    }

    const list = document.createElement("div");
    list.className = "part-variant-list";
    for (const variant of group.variants || []) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "part-variant-button";
      button.dataset.variantId = variant.id || "";
      button.innerHTML = `<span class="part-variant-icon">${escapeHtml(variant.icon || "＋")}</span><span class="part-variant-body"><strong>${escapeHtml(variant.label || "パーツ")}</strong><small>${escapeHtml(variant.description || "")}</small></span>`;
      button.addEventListener("click", ev => {
        ev.stopPropagation();
        closePartVariantPalette();
        if (typeof variant.action === "function") variant.action();
      });
      list.appendChild(button);
    }
    palette.appendChild(list);
    palette.hidden = false;
    positionPartVariantPalette(anchor);
  }

  function bindPartVariantCategory(buttonId, category) {
    const button = $(buttonId);
    if (!button) return;
    button.addEventListener("click", ev => {
      ev.preventDefault();
      ev.stopPropagation();
      openPartVariantPalette(category, button);
    });
  }

  let browserContextMenuEl = null;

  function contextTargetFromEvent(ev) {
    const itemEl = ev.target?.closest?.(".ui-item");
    if (itemEl?.dataset?.windowId && itemEl?.dataset?.itemId) {
      return { kind: "item", windowId: itemEl.dataset.windowId, itemId: itemEl.dataset.itemId };
    }
    const winEl = ev.target?.closest?.(".ui-window");
    if (winEl?.dataset?.windowId) {
      return { kind: "window", windowId: winEl.dataset.windowId };
    }
    const point = pointerToPreviewPoint(ev.clientX, ev.clientY);
    if (point.x >= 0 && point.y >= 0 && point.x <= state.screenWidth && point.y <= state.screenHeight) {
      const insideHits = hitInsideCandidatesAtPoint(ev.clientX, ev.clientY);
      if (insideHits.length) {
        const selectedKey = selectedCandidateKey();
        const selectedHit = selectedKey ? insideHits.find(candidate => candidateKey(candidate) === selectedKey) : null;
        return selectedHit || insideHits[0];
      }
      const windowHits = hitWindowsAtPoint(ev.clientX, ev.clientY);
      if (windowHits.length) {
        const selectedKey = selectedCandidateKey();
        const selectedHit = selectedKey ? windowHits.find(candidate => candidateKey(candidate) === selectedKey) : null;
        return selectedHit || windowHits[0];
      }
      return { kind: "background" };
    }
    return null;
  }

  function setSelectedFromContextTarget(target) {
    if (!target) return;
    if (target.kind === "window") {
      selected = { kind: "window", windowId: target.windowId };
    } else if (target.kind === "item") {
      selected = { kind: "item", windowId: target.windowId, itemId: target.itemId };
    } else if (target.kind === "group") {
      selected = { kind: "group", groupId: target.groupId };
    } else if (target.kind === "scene") {
      const id = normalizeSceneId(target.sceneId || "");
      if (sceneById(id)) selected = { kind: "scene", sceneId: id };
    } else if (target.kind === "background") {
      selected = null;
    }
  }

  function contextMenuItemsForTarget(target) {
    const hasSelection = !!selected;
    const isItem = selected?.kind === "item";
    const isWindow = selected?.kind === "window";
    const win = selectedWindow();
    const item = selectedItem();
    const visibleTarget = isItem ? item : isWindow ? win : null;
    const visibleText = visibleTarget?.visible === false ? "表示する" : "非表示にする";
    const clipboardKind = objectClipboard?.kind || "";
    const canPaste = !!objectClipboard;
    const canPasteToSceneOrGroup = !!objectClipboard && clipboardKind !== "item";
    const items = [];

    if (target?.kind === "background") {
      items.push({ id: "addWindow", label: "ウィンドウを追加" });
      items.push({ id: "paste", label: clipboardPasteLabel(target), enabled: canPaste });
      items.push({ type: "separator" });
      items.push({ id: "copyMZScript", label: "MZスクリプトをコピー" });
      return items;
    }

    if (target?.kind === "scene") {
      const scene = sceneById(target.sceneId || "");
      const sceneLabel = scene ? (scene.name || scene.id) : "シーン";
      items.push({ id: "select", label: `このシーンを選択：${sceneLabel}`, enabled: !!scene });
      items.push({ id: "scene:activate", label: "このシーンをプレビュー表示", enabled: !!scene });
      items.push({ type: "separator" });
      items.push({ id: "template:save", label: "シーンを部品保存", enabled: !!scene });
      items.push({ id: "template:load", label: "保存済み部品を読み込み", enabled: true });
      items.push({ id: "paste", label: clipboardPasteLabel(target), enabled: canPasteToSceneOrGroup });
      items.push({ type: "separator" });
      items.push({ id: "scene:delete", label: "シーンを削除", enabled: !!scene });
      items.push({ type: "separator" });
      items.push({ id: "copyMZScript", label: "レイアウト全体のMZスクリプトをコピー" });
      return items;
    }

    if (target?.kind === "group") {
      const group = selectedGroup();
      const groupLabel = group ? (group.name || group.id) : (target.groupId || "group");
      const sceneMembershipItems = ensureScenes().map(scene => ({
        id: `group:scene:toggle:${scene.id}`,
        label: `${scene.name || scene.id} に含める`,
        checked: !!group && sceneIncludesGroup(scene, group.id),
        enabled: !!group
      }));
      const sceneMoveItems = ensureScenes().map(scene => ({
        id: `group:scene:only:${scene.id}`,
        label: `${scene.name || scene.id} だけへ移動`,
        enabled: !!group
      }));
      items.push({ id: "select", label: `このグループを選択：${groupLabel}`, enabled: !!group });
      items.push({ type: "separator" });
      items.push({ id: "copy", label: "グループをコピー", enabled: !!group });
      items.push({ id: "template:save", label: "グループを部品保存", enabled: !!group });
      items.push({ id: "template:load", label: "保存済み部品を読み込み", enabled: true });
      items.push({ id: "paste", label: clipboardPasteLabel(target), enabled: canPasteToSceneOrGroup });
      items.push({ id: "duplicate", label: "グループを複製", enabled: !!group });
      items.push({ id: "delete", label: "グループ削除（所属ウィンドウも削除）", enabled: !!group });
      items.push({ id: "group:deleteWindows", label: "グループ内ウィンドウも削除", enabled: !!group });
      items.push({ type: "separator" });
      if (sceneMoveItems.length) items.push({ id: "group:sceneMove", label: "シーンへ移動", enabled: !!group, submenu: sceneMoveItems });
      if (sceneMembershipItems.length) items.push({ id: "group:sceneMembership", label: "シーン所属を切替", enabled: !!group, submenu: sceneMembershipItems });
      items.push({ type: "separator" });
      items.push({ id: "group:toggleVisible", label: group?.visible === false ? "グループを表示する" : "グループを非表示にする", enabled: !!group });
      items.push({ id: "group:toggleLock", label: group?.locked === true ? "グループのロックを解除" : "グループをロック", enabled: !!group });
      items.push({ type: "separator" });
      items.push({ id: "copyMZScript", label: "レイアウト全体のMZスクリプトをコピー" });
      return items;
    }

    items.push({ id: "select", label: isItem ? `このパーツを選択：${selected.itemId}` : isWindow ? `このウィンドウを選択：${selected.windowId}` : "選択", enabled: hasSelection });
    items.push({ type: "separator" });
    items.push({ id: "copy", label: isItem ? "パーツをコピー" : "ウィンドウをコピー", enabled: hasSelection });
    items.push({ id: "template:save", label: isItem ? "パーツを部品保存" : "ウィンドウを部品保存", enabled: hasSelection });
    items.push({ id: "template:load", label: "保存済み部品を読み込み", enabled: true });
    items.push({ id: "paste", label: clipboardPasteLabel(target), enabled: canPaste });
    items.push({ id: "duplicate", label: isItem ? "パーツを複製" : "ウィンドウを複製", enabled: hasSelection });
    items.push({ id: "delete", label: isItem ? "パーツを削除" : "ウィンドウを削除", enabled: hasSelection });
    items.push({ type: "separator" });
    items.push({ id: "toggleVisible", label: visibleText, enabled: !!visibleTarget });
    items.push({ id: "bringFront", label: "最前面へ", enabled: hasSelection });
    items.push({ id: "sendBack", label: "最背面へ", enabled: hasSelection });
    if (isItem) {
      if (item?.type === "compositeImage") {
        items.push({ id: "compositePreset:edit", label: "このPSDの統合画像プリセットを編集", enabled: !!item });
      }
      items.push({ id: "toggleOutside", label: item?.allowOutsideWindow === true ? "ウィンドウ外描画をOFF" : "ウィンドウ外描画をON", enabled: !!item });
    }
    if (isWindow) {
      const group = win?.groupId ? groupById(win.groupId) : null;
      const groupSubmenu = [
        { id: "group:assign:", label: "未グループ", checked: !win?.groupId },
        ...ensureGroups().map(group => ({
          id: `group:assign:${group.id}`,
          label: `${group.name || group.id} (${group.id})`,
          checked: win?.groupId === group.id
        })),
        { type: "separator" },
        { id: "group:new", label: "新規グループを作って所属" }
      ];
      if (group) {
        groupSubmenu.push({ type: "separator" });
        groupSubmenu.push({ id: "group:toggleLock", label: group.locked === true ? "このグループのロックを解除" : "このグループをロック" });
      }
      items.push({ id: "groupMenu", label: "グループ", enabled: true, submenu: groupSubmenu });
    }
    items.push({ type: "separator" });
    items.push({ id: "copyRuntimeCommand", label: "この対象のMZイベントコマンドをコピー", enabled: hasSelection });
    items.push({ id: "copyMZScript", label: "レイアウト全体のMZスクリプトをコピー" });
    return items;
  }

  function peerZOrderObjects() {
    if (!selected) return [];
    if (selected.kind === "window") return state.windows;
    const win = selectedWindow();
    return win ? (win.items || []) : [];
  }

  function selectedZOrderObject() {
    if (!selected) return null;
    return selected.kind === "window" ? selectedWindow() : selectedItem();
  }

  function setSelectedZOrder(front) {
    const obj = selectedZOrderObject();
    if (!obj) return;
    const peers = peerZOrderObjects();
    const values = peers.map(entry => Number(entry.zOrder || 0));
    const next = front ? Math.max(0, ...values) + 1 : Math.min(0, ...values) - 1;
    runStateMutation(front ? "最前面へ" : "最背面へ", () => { obj.zOrder = next; });
  }

  function toggleSelectedVisible() {
    const obj = selectedZOrderObject();
    if (!obj) return;
    runStateMutation("表示切替", () => { obj.visible = obj.visible === false; });
  }

  function toggleSelectedOutsideDraw() {
    const item = selectedItem();
    if (!item) return;
    runStateMutation("ウィンドウ外描画切替", () => { item.allowOutsideWindow = item.allowOutsideWindow !== true; });
  }

  function executeContextMenuCommand(command, target = null) {
    const commandText = String(command || "");
    const contextGroupId = target?.kind === "group" ? normalizeGroupId(target.groupId || "") : selected?.kind === "group" ? normalizeGroupId(selected.groupId || "") : "";
    if (commandText.startsWith("group:scene:toggle:")) {
      toggleGroupSceneMembership(contextGroupId, commandText.slice("group:scene:toggle:".length));
      return;
    }
    if (commandText.startsWith("group:scene:only:")) {
      moveGroupToOnlyScene(contextGroupId, commandText.slice("group:scene:only:".length));
      return;
    }
    if (commandText.startsWith("group:assign:")) {
      assignSelectedWindowToGroup(commandText.slice("group:assign:".length));
      return;
    }
    switch (commandText) {
      case "select":
        render();
        return;
      case "addWindow":
        addWindow();
        return;
      case "copy":
        copySelectedObject();
        return;
      case "cut":
        cutSelectedObject();
        return;
      case "template:save":
        saveObjectTemplate(target || selected);
        return;
      case "template:load":
        loadComponentTemplate(null, target || selected);
        return;
      case "paste":
        pasteObjectFromClipboard(target);
        return;
      case "duplicate":
        duplicateSelectedObject();
        return;
      case "delete":
        confirmDeleteSelectedObject();
        return;
      case "group:new":
        createGroupAndAssignSelectedWindow();
        return;
      case "scene:activate": {
        const scene = target?.kind === "scene" ? sceneById(target.sceneId || "") : selectedScene();
        if (scene) setActiveSceneId(scene.id);
        return;
      }
      case "scene:delete": {
        const scene = target?.kind === "scene" ? sceneById(target.sceneId || "") : selectedScene();
        if (scene) deleteScene(scene.id);
        return;
      }
      case "group:toggleLock":
        toggleSelectedGroupLock();
        return;
      case "group:toggleVisible": {
        const group = selectedGroup();
        if (group) setGroupVisible(group.id, group.visible === false);
        return;
      }
      case "group:deleteWindows": {
        const group = selectedGroup();
        if (group) deleteGroupWindows(group.id);
        return;
      }
      case "toggleVisible":
        toggleSelectedVisible();
        return;
      case "bringFront":
        setSelectedZOrder(true);
        return;
      case "sendBack":
        setSelectedZOrder(false);
        return;
      case "toggleOutside":
        toggleSelectedOutsideDraw();
        return;
      case "compositePreset:edit": {
        const item = selectedItem();
        if (item?.type === "compositeImage") openCompositePresetManager(item);
        else showToast("統合画像パーツを選択してください");
        return;
      }
      case "copyRuntimeCommand": {
        const commandList = buildRuntimeEventCommandList();
        if (commandList.length <= 0) showToast("変更する対象を選択してください");
        else void copyMzEventCommandList(commandList);
        return;
      }
      case "copyMZScript":
        void copyMZScriptWithAutoCompositeExport();
        return;
      default:
        return;
    }
  }

  function closeBrowserContextMenu() {
    if (browserContextMenuEl) {
      browserContextMenuEl.remove();
      browserContextMenuEl = null;
    }
  }

  function showBrowserContextMenu(x, y, items, target = null) {
    closeBrowserContextMenu();
    const menu = document.createElement("div");
    menu.className = "db-context-menu";
    for (const item of items) {
      if (item.type === "separator") {
        const sep = document.createElement("div");
        sep.className = "db-context-menu-separator";
        menu.appendChild(sep);
        continue;
      }
      if (Array.isArray(item.submenu)) {
        const title = document.createElement("div");
        title.className = "db-context-menu-heading";
        title.textContent = item.label || "メニュー";
        menu.appendChild(title);
        for (const sub of item.submenu) {
          if (sub.type === "separator") {
            const sep = document.createElement("div");
            sep.className = "db-context-menu-separator";
            menu.appendChild(sep);
            continue;
          }
          const subButton = document.createElement("button");
          subButton.type = "button";
          subButton.textContent = `${sub.checked ? "✓ " : "　"}${sub.label || sub.id || "menu"}`;
          subButton.disabled = sub.enabled === false;
          subButton.addEventListener("click", ev => {
            ev.preventDefault();
            ev.stopPropagation();
            closeBrowserContextMenu();
            executeContextMenuCommand(sub.id, target);
          });
          menu.appendChild(subButton);
        }
        continue;
      }
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = item.checked ? `✓ ${item.label || item.id || "menu"}` : item.label || item.id || "menu";
      button.disabled = item.enabled === false;
      button.addEventListener("click", ev => {
        ev.preventDefault();
        ev.stopPropagation();
        closeBrowserContextMenu();
        executeContextMenuCommand(item.id, target);
      });
      menu.appendChild(button);
    }
    document.body.appendChild(menu);
    browserContextMenuEl = menu;
    const rect = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(6, Math.min(x, window.innerWidth - rect.width - 6))}px`;
    menu.style.top = `${Math.max(6, Math.min(y, window.innerHeight - rect.height - 6))}px`;
    setTimeout(() => {
      window.addEventListener("pointerdown", closeBrowserContextMenu, { once: true, capture: true });
      window.addEventListener("keydown", ev => { if (ev.key === "Escape") closeBrowserContextMenu(); }, { once: true, capture: true });
    }, 0);
  }

  async function openContextMenuForTarget(ev, target) {
    if (!target) return;
    ev.preventDefault();
    ev.stopPropagation();
    setSelectedFromContextTarget(target);
    render();
    const items = contextMenuItemsForTarget(target);
    if (window.DB_UIComposerElectron?.showContextMenu) {
      try {
        const command = await window.DB_UIComposerElectron.showContextMenu({ items, target, point: { x: ev.clientX, y: ev.clientY } });
        if (command) executeContextMenuCommand(command, target);
        return;
      } catch (error) {
        console.warn("[DB_UIComposer Tool] Electron context menu failed; using browser menu.", error);
      }
    }
    showBrowserContextMenu(ev.clientX, ev.clientY, items, target);
  }

  async function handlePreviewContextMenu(ev) {
    const target = contextTargetFromEvent(ev);
    if (!target) return;
    await openContextMenuForTarget(ev, target);
  }


  function handleNumberInputWheel(ev) {
    if (ev.ctrlKey || ev.metaKey) return;
    const input = ev.target?.closest?.('input[type="number"]');
    if (!input || input.disabled || input.readOnly) return;
    // 数値欄にフォーカスが入っている時だけホイール増減します。
    // 右プロパティをスクロール中に、マウス下の数値が事故変更されるのを防ぎます。
    if (document.activeElement !== input) return;
    ev.preventDefault();

    const rawStep = Number(input.step);
    let step = Number.isFinite(rawStep) && rawStep > 0 ? rawStep : 1;
    if (ev.shiftKey) step *= 10;
    if (ev.altKey) step /= 10;

    const current = Number(input.value || 0);
    const min = input.min === "" ? -Infinity : Number(input.min);
    const max = input.max === "" ? Infinity : Number(input.max);
    const direction = ev.deltaY < 0 ? 1 : -1;
    let next = current + direction * step;
    if (Number.isFinite(min)) next = Math.max(min, next);
    if (Number.isFinite(max)) next = Math.min(max, next);

    const decimals = (() => {
      const text = String(step);
      if (text.includes('e-')) return Number(text.split('e-')[1]) || 0;
      const dot = text.indexOf('.');
      return dot >= 0 ? text.length - dot - 1 : 0;
    })();
    input.value = decimals > 0 ? String(Number(next.toFixed(Math.min(decimals, 8)))) : String(Math.round(next));
    // changeだけ発火する。右プロパティ数値欄は再描画しないため、
    // フォーカスを維持したままホイール連続変更とTab移動ができる。
    // 一部環境ではプレビュー更新後にフォーカスが外れるため、同じ入力欄が残っていれば戻す。
    input.dispatchEvent(new Event('change', { bubbles: true }));
    requestAnimationFrame(() => {
      if (!document.contains(input)) return;
      try {
        input.focus({ preventScroll: true });
        const end = String(input.value || "").length;
        input.setSelectionRange?.(end, end);
      } catch (_) {}
    });
  }

  function bindEvents() {
    initPanelSplitters();
    setupCompositePresetBridge();
    $("loadProjectBtn").addEventListener("click", openProjectFolder);
    $("psdImportBtn")?.addEventListener("click", () => { void openPsdImportDialog(); });
    $("projectFolderInput").addEventListener("change", ev => loadProjectFolder(ev.target.files));
    $("psdImportInput")?.addEventListener("change", ev => { void handlePsdImportInput(ev.target.files); });
    $("toolDataInput")?.addEventListener("change", ev => loadToolDataFile(ev.target.files && ev.target.files[0]));
    $("debugConsoleBtn")?.addEventListener("click", () => toggleDebugConsole());
    $("saveCatalogPluginBtn")?.addEventListener("click", () => { void saveCommandCatalogPlugin(); });
    $("debugCloseBtn")?.addEventListener("click", () => toggleDebugConsole(false));
    $("debugStateBtn")?.addEventListener("click", debugSnapshot);
    $("debugCopyBtn")?.addEventListener("click", copyDebugLog);
    $("debugClearBtn")?.addEventListener("click", () => { debugLogs.length = 0; debugOnceKeys.clear(); renderDebugConsole(); });
    const previewSettingInputIds = [
      "previewFontSizeInput",
      "previewLineHeightInput",
      "previewPaddingInput",
      "previewTextYOffsetInput",
      "previewTextColorInput",
      "previewOutlineColorInput",
      "previewOutlineWidthInput",
      "previewVariablesInput",
      "previewActorHpInput",
      "previewActorMhpInput",
      "previewActorMpInput",
      "previewActorMmpInput",
      "previewActorTpInput",
      "previewZoomPercentInput",
      "dragStartThresholdInput"
    ];
    for (const id of previewSettingInputIds) {
      $(id)?.addEventListener("input", () => schedulePreviewSettingsApply());
      $(id)?.addEventListener("change", () => schedulePreviewSettingsApply());
    }
    $("useWindowSkinPreviewInput")?.addEventListener("change", () => schedulePreviewSettingsApply());
    $("previewFocusDimInput")?.addEventListener("change", () => schedulePreviewSettingsApply("対象外半透明変更"));
    $("applyScreenBtn").addEventListener("click", () => {
      runStateMutation("レイアウト設定変更", () => {
        state.layoutId = safeId($("layoutIdInput").value, state.layoutId);
        state.screenWidth = Math.max(1, Number($("screenWidthInput").value || 816));
        state.screenHeight = Math.max(1, Number($("screenHeightInput").value || 624));
      });
    });
    $("windowPositionLockInput")?.addEventListener("change", ev => setGlobalWindowPositionLocked(ev.target.checked));
    $("partPositionLockInput")?.addEventListener("change", ev => setGlobalPartPositionLocked(ev.target.checked));
    bindPartVariantCategory("addWindowBtn", "window");
    bindPartVariantCategory("addTextBtn", "text");
    bindPartVariantCategory("addGaugeBtn", "gauge");
    bindPartVariantCategory("addButtonBtn", "button");
    bindPartVariantCategory("addChoiceBtn", "choice");
    bindPartVariantCategory("addImageBtn", "image");
    $("undoBtn")?.addEventListener("click", undoLastMutation);
    $("redoBtn")?.addEventListener("click", redoLastMutation);
    $("duplicateBtn")?.addEventListener("click", duplicateSelectedObject);
    $("copyScriptBtn").addEventListener("click", () => { void copyMZScriptWithAutoCompositeExport(); });
    $("openCompositePresetManagerTopBtn")?.addEventListener("click", () => { openCompositePresetManager(); });
    $("copyRuntimeCommandBtn")?.addEventListener("click", () => {
      const commandList = buildRuntimeEventCommandList();
      if (commandList.length <= 0) return showToast("変更する対象を選択してください");
      void copyMzEventCommandList(commandList);
    });
    $("importJsonBtn").addEventListener("click", () => {
      try {
        importJson($("importJsonInput").value);
        showToast("レイアウトを読み込みました");
      } catch (e) {
        alert(`JSON / MZスクリプトの読み込みに失敗しました。\n${e.message}`);
      }
    });
    $("saveLocalBtn").addEventListener("click", () => { void saveCurrentToolData(); });
    $("loadLocalBtn").addEventListener("click", () => { void openToolDataFile(); });
    $("loadSampleBtn")?.addEventListener("click", () => { loadSampleScene(); });
    $("confirmSaveToolDataBtn")?.addEventListener("click", confirmFallbackSaveDialog);
    $("cancelSaveToolDataBtn")?.addEventListener("click", closeFallbackSaveDialog);
    $("saveToolDataDialog")?.addEventListener("cancel", () => {
      // dialog標準のEsc操作でも、明示的に閉じるだけにします。
      closeFallbackSaveDialog();
    });
    $("saveToolDataNameInput")?.addEventListener("keydown", ev => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        confirmFallbackSaveDialog();
      }
    });
    const detachedHeaderBtn = $("openDetachedListHeaderBtn");
    if (detachedHeaderBtn) {
      if (window.DB_UIComposerElectron?.isElectron) {
        detachedHeaderBtn.hidden = false;
        detachedHeaderBtn.addEventListener("click", ev => {
          ev.preventDefault();
          ev.stopPropagation();
          void openDetachedObjectListWindow();
        });
      } else {
        detachedHeaderBtn.hidden = true;
      }
    }
    $("resetBtn").addEventListener("click", () => {
      if (!confirm("現在の配置を初期化します。よろしいですか？")) return;
      runStateMutation("レイアウト初期化", () => {
        state = createDefaultState();
        selected = null;
      });
    });
    document.addEventListener("pointerdown", ev => {
      const palette = partVariantPaletteElement();
      if (!palette || palette.hidden) return;
      if (palette.contains(ev.target)) return;
      if (ev.target.closest?.(".top-add-toolbar .icon-add-button")) return;
      closePartVariantPalette();
    });
    window.addEventListener("resize", () => {
      const palette = partVariantPaletteElement();
      if (activePartVariantButton && palette && !palette.hidden) positionPartVariantPalette(activePartVariantButton);
    });
    window.addEventListener("scroll", () => {
      const palette = partVariantPaletteElement();
      if (activePartVariantButton && palette && !palette.hidden) positionPartVariantPalette(activePartVariantButton);
    }, true);
    preview.addEventListener("contextmenu", handlePreviewContextMenu, true);
    // captureで先に独自ダブルクリックを判定します。
    preview.addEventListener("pointerdown", handlePreviewPointerDownCapture, true);
    preview.addEventListener("pointerdown", () => {
      // ウィンドウ内配置モードでは、空白を単クリックしてもフォーカスを解除しません。
      if (mode !== "screen") return;
      selected = null;
      render();
    });
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("keydown", handleEditorKeyDown);
    document.addEventListener("wheel", handleNumberInputWheel, { passive: false, capture: true });
    const electronApi = window.DB_UIComposerElectron;
    electronApi?.onObjectListCommand?.(command => executeDetachedObjectListCommand(command));
    electronApi?.onObjectListWindowReady?.(() => syncDetachedObjectListWindow());
  }

  function moveSelectedByKeyboard(dx, dy) {
    if (!selected) return false;
    if (selected.kind === "window") {
      const win = state.windows.find(w => w.id === selected.windowId);
      if (!win) return false;
      runStateMutation("キーボード移動", () => {
        win.x = Math.round(Number(win.x || 0) + dx);
        win.y = Math.round(Number(win.y || 0) + dy);
      });
      return true;
    }
    if (selected.kind === "item") {
      const win = state.windows.find(w => w.id === selected.windowId);
      const item = win?.items?.find(i => i.id === selected.itemId);
      if (!item) return false;
      runStateMutation("キーボード移動", () => {
        item.x = Math.round(Number(item.x || 0) + dx);
        item.y = Math.round(Number(item.y || 0) + dy);
      });
      return true;
    }
    return false;
  }

  function handleEditorKeyDown(ev) {
    const key = String(ev.key || "").toLowerCase();
    // Deleteは、入力欄以外で選択中オブジェクトを削除します。
    // Backspaceはブラウザの戻る操作などとの衝突を避けるため対象外です。
    if (key === "delete" && !isTextEditingElement(ev.target)) {
      ev.preventDefault();
      deleteSelectedObject();
      return;
    }

    if (!isTextEditingElement(ev.target) && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
      const step = ev.shiftKey ? 10 : 1;
      const arrowMoves = {
        arrowleft: [-step, 0],
        arrowright: [step, 0],
        arrowup: [0, -step],
        arrowdown: [0, step]
      };
      if (arrowMoves[key]) {
        ev.preventDefault();
        const [dx, dy] = arrowMoves[key];
        moveSelectedByKeyboard(dx, dy);
        return;
      }
    }

    const modifier = ev.ctrlKey || ev.metaKey;
    if (!modifier || ev.altKey) return;
    // Ctrl+S は入力欄にフォーカスがあっても、ブラウザのページ保存を抑止して
    // 現在のツールデータを保存します。
    if (key === "s") {
      ev.preventDefault();
      void saveCurrentToolData();
      return;
    }
    // テキスト入力欄でのCtrl+Zは、ブラウザ標準の文字編集を優先する。
    if (isTextEditingElement(ev.target)) return;
    if (key === "z") {
      ev.preventDefault();
      if (ev.shiftKey) redoLastMutation();
      else undoLastMutation();
      return;
    }
    if (key === "y") {
      ev.preventDefault();
      redoLastMutation();
      return;
    }
    if (key === "c") {
      ev.preventDefault();
      copySelectedObject();
      return;
    }
    if (key === "x") {
      ev.preventDefault();
      cutSelectedObject();
      return;
    }
    if (key === "v") {
      ev.preventDefault();
      pasteObjectFromClipboard();
      return;
    }
    if (key === "d") {
      ev.preventDefault();
      duplicateSelectedObject();
      return;
    }
  }

  initCollapsibleSections();
  bindEvents();
  updateModeButtons();
  updateToolDataSaveUi();
  updateCatalogSaveUi();
  void restoreCatalogFileHandle();
  renderDebugConsole();
  applyStaticHoverHelp();
  render();
})();
