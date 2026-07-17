const { app, BrowserWindow, Menu, ipcMain, clipboard, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

process.on('uncaughtException', error => {
  console.error('[DB_UIComposer Electron] uncaughtException:', error);
});

process.on('unhandledRejection', error => {
  console.error('[DB_UIComposer Electron] unhandledRejection:', error);
});

let mainWindow = null;
let objectListWindow = null;
let lastObjectListState = null;

function updateObjectListFloating() {
  if (!objectListWindow || objectListWindow.isDestroyed()) return;
  const focused = BrowserWindow.getFocusedWindow();
  const active = !!focused && (focused === mainWindow || focused === objectListWindow);
  try {
    objectListWindow.setAlwaysOnTop(active, 'floating');
  } catch (_) {
    objectListWindow.setAlwaysOnTop(active);
  }
}

function createObjectListWindow(ownerWindow) {
  if (objectListWindow && !objectListWindow.isDestroyed()) {
    objectListWindow.show();
    objectListWindow.focus();
    updateObjectListFloating();
    return objectListWindow;
  }

  objectListWindow = new BrowserWindow({
    width: 520,
    height: 720,
    minWidth: 360,
    minHeight: 420,
    title: 'DB_UIComposer 一覧',
    backgroundColor: '#11141a',
    parent: ownerWindow || mainWindow || undefined,
    resizable: true,
    minimizable: true,
    maximizable: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'electron-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  objectListWindow.setMenuBarVisibility(false);
  objectListWindow.loadFile(path.join(__dirname, 'object-list-window.html'));

  objectListWindow.once('ready-to-show', () => {
    if (!objectListWindow || objectListWindow.isDestroyed()) return;
    objectListWindow.show();
    updateObjectListFloating();
  });

  objectListWindow.webContents.on('did-finish-load', () => {
    if (lastObjectListState) {
      objectListWindow.webContents.send('db-ui:object-list-state', lastObjectListState);
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('db-ui:object-list-window-ready');
    }
  });

  objectListWindow.on('focus', updateObjectListFloating);
  objectListWindow.on('blur', () => setTimeout(updateObjectListFloating, 80));
  objectListWindow.on('closed', () => {
    objectListWindow = null;
  });

  return objectListWindow;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: '#11141a',
    webPreferences: {
      preload: path.join(__dirname, 'electron-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow = win;
  win.loadFile(path.join(__dirname, 'index.html'));

  win.on('focus', updateObjectListFloating);
  win.on('blur', () => setTimeout(updateObjectListFloating, 80));
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
    if (objectListWindow && !objectListWindow.isDestroyed()) objectListWindow.close();
  });

  if (process.argv.includes('--debug')) {
    win.webContents.openDevTools({ mode: 'detach' });
  }

  const appMenu = Menu.buildFromTemplate([
    {
      label: 'ファイル',
      submenu: [
        { label: '終了', role: 'quit' }
      ]
    },
    {
      label: '編集',
      submenu: [
        { label: '元に戻す', accelerator: 'CmdOrCtrl+Z', role: 'undo' },
        { label: 'やり直し', accelerator: 'CmdOrCtrl+Shift+Z', role: 'redo' },
        { type: 'separator' },
        { label: '切り取り', accelerator: 'CmdOrCtrl+X', role: 'cut' },
        { label: 'コピー', accelerator: 'CmdOrCtrl+C', role: 'copy' },
        { label: '貼り付け', accelerator: 'CmdOrCtrl+V', role: 'paste' },
        { label: 'すべて選択', accelerator: 'CmdOrCtrl+A', role: 'selectAll' }
      ]
    },
    {
      label: '表示',
      submenu: [
        { label: '再読み込み', accelerator: 'CmdOrCtrl+R', role: 'reload' },
        { label: '開発者ツール', accelerator: 'F12', role: 'toggleDevTools' },
        { type: 'separator' },
        { label: '拡大', role: 'zoomIn' },
        { label: '縮小', role: 'zoomOut' },
        { label: '実際のサイズ', role: 'resetZoom' }
      ]
    }
  ]);
  Menu.setApplicationMenu(appMenu);
}

app.whenReady().then(() => {
  createWindow();
  app.on('browser-window-focus', updateObjectListFloating);
  app.on('browser-window-blur', () => setTimeout(updateObjectListFloating, 80));
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});


function componentTemplateFilters(kind) {
  const normalized = String(kind || '');
  const one = (name, ext) => [{ name, extensions: [ext] }, { name: 'JSON', extensions: ['json'] }];
  switch (normalized) {
    case 'scene': return one('DB_UIComposer Scene (*.scene)', 'scene');
    case 'group': return one('DB_UIComposer Group (*.group)', 'group');
    case 'window': return one('DB_UIComposer Window (*.window)', 'window');
    case 'item': return one('DB_UIComposer Parts (*.parts)', 'parts');
    default:
      return [{ name: 'DB_UIComposer Components', extensions: ['scene', 'group', 'groop', 'window', 'parts', 'json'] }];
  }
}

ipcMain.handle('db-ui:component-template-save-file', async (event, args = {}) => {
  const owner = BrowserWindow.fromWebContents(event.sender) || mainWindow || undefined;
  const kind = String(args.kind || '');
  const defaultFileName = String(args.defaultFileName || 'component.json');
  const payload = String(args.payload || '{}');
  const result = await dialog.showSaveDialog(owner, {
    title: 'DB_UIComposer 部品を保存',
    defaultPath: defaultFileName,
    filters: componentTemplateFilters(kind)
  });
  if (result.canceled || !result.filePath) return { ok: false, canceled: true };
  try {
    await fs.promises.writeFile(result.filePath, payload, 'utf8');
    return { ok: true, filePath: result.filePath };
  } catch (error) {
    console.error('[DB_UIComposer Electron] component template save failed:', error);
    return { ok: false, message: error && error.message ? error.message : String(error) };
  }
});

ipcMain.handle('db-ui:component-template-open-file', async (event, args = {}) => {
  const owner = BrowserWindow.fromWebContents(event.sender) || mainWindow || undefined;
  const kind = String(args.kind || '');
  const result = await dialog.showOpenDialog(owner, {
    title: 'DB_UIComposer 部品を読み込み',
    properties: ['openFile'],
    filters: componentTemplateFilters(kind)
  });
  if (result.canceled || !result.filePaths || !result.filePaths[0]) return { ok: false, canceled: true };
  try {
    const text = await fs.promises.readFile(result.filePaths[0], 'utf8');
    return { ok: true, filePath: result.filePaths[0], text };
  } catch (error) {
    console.error('[DB_UIComposer Electron] component template open failed:', error);
    return { ok: false, message: error && error.message ? error.message : String(error) };
  }
});

ipcMain.handle('db-ui:clipboard-write', (_event, text) => {
  clipboard.writeText(String(text ?? ''));
  return true;
});

ipcMain.handle('db-ui:clipboard-write-mz-event-command', (_event, commandList) => {
  const list = Array.isArray(commandList) ? commandList : [];
  const json = JSON.stringify(list);
  const buffer = Buffer.from(json, 'utf8');

  // RPG Maker MZ's event editor paste target checks this native clipboard format.
  // Plain text JSON alone is not recognized as an event command by the editor.
  clipboard.writeText(JSON.stringify(list, null, 2));
  clipboard.writeBuffer('application/rpgmz-EventCommand', buffer);
  return { ok: true, formats: clipboard.availableFormats() };
});

ipcMain.handle('db-ui:object-list-open', event => {
  const owner = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  if (owner && owner !== objectListWindow) mainWindow = owner;
  createObjectListWindow(owner);
  return true;
});

ipcMain.on('db-ui:object-list-state', (_event, payload = {}) => {
  lastObjectListState = payload || {};
  if (objectListWindow && !objectListWindow.isDestroyed()) {
    objectListWindow.webContents.send('db-ui:object-list-state', lastObjectListState);
  }
});

ipcMain.on('db-ui:object-list-command', (event, command = {}) => {
  const senderWindow = BrowserWindow.fromWebContents(event.sender);
  // v0.2.98: 一覧ウィンドウ側の追加ボタンが環境によって無反応になるケースを避けるため、
  // 送信元判定を厳しすぎない形にして、メインウィンドウへ確実に中継します。
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (senderWindow === mainWindow) return;
  mainWindow.webContents.send('db-ui:object-list-command', command || {});
});


ipcMain.handle('db-ui:composite-preset-manager-focus', () => {
  const target = BrowserWindow.getAllWindows().find(win => {
    if (!win || win.isDestroyed()) return false;
    const title = String(win.getTitle() || '');
    return title.includes('統合画像プリセット管理');
  });
  if (!target) return false;
  try {
    if (target.isMinimized()) target.restore();
    target.show();
    if (typeof target.moveTop === 'function') target.moveTop();
    target.focus();
  } catch (error) {
    console.error('[DB_UIComposer Electron] composite preset manager focus failed:', error);
  }
  return true;
});

ipcMain.handle('db-ui:composite-preset-insert-focus', () => {
  const target = BrowserWindow.getAllWindows().find(win => {
    if (!win || win.isDestroyed()) return false;
    const title = String(win.getTitle() || '');
    return title.includes('統合画像プリセット挿入');
  });
  if (!target) return false;
  try {
    if (target.isMinimized()) target.restore();
    target.show();
    if (typeof target.moveTop === 'function') target.moveTop();
    target.focus();
  } catch (error) {
    console.error('[DB_UIComposer Electron] composite preset insert focus failed:', error);
  }
  return true;
});

ipcMain.handle('db-ui:context-menu', (event, payload = {}) => {
  const items = Array.isArray(payload.items) ? payload.items : [];
  return new Promise(resolve => {
    let resolved = false;
    const toTemplate = list => list.map(item => {
      if (item && item.type === 'separator') return { type: 'separator' };
      const submenu = Array.isArray(item?.submenu) ? toTemplate(item.submenu) : undefined;
      const entry = {
        label: String(item?.label || item?.id || 'menu'),
        enabled: item?.enabled !== false,
        type: item?.checked !== undefined && !submenu ? 'checkbox' : 'normal'
      };
      if (submenu) {
        entry.submenu = submenu;
      } else {
        entry.checked = !!item?.checked;
        entry.click = () => {
          resolved = true;
          resolve(String(item?.id || ''));
        };
      }
      return entry;
    });
    const menu = Menu.buildFromTemplate(toTemplate(items));
    const win = BrowserWindow.fromWebContents(event.sender);
    menu.popup({
      window: win || undefined,
      callback: () => {
        if (!resolved) resolve('');
      }
    });
  });
});
