const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('DB_UIComposerElectron', {
  isElectron: true,
  showContextMenu(payload) {
    return ipcRenderer.invoke('db-ui:context-menu', payload || {});
  },
  writeText(text) {
    return ipcRenderer.invoke('db-ui:clipboard-write', String(text ?? ''));
  },
  writeMzEventCommands(commandList) {
    return ipcRenderer.invoke('db-ui:clipboard-write-mz-event-command', Array.isArray(commandList) ? commandList : []);
  },
  saveComponentTemplateFile(args) {
    return ipcRenderer.invoke('db-ui:component-template-save-file', args || {});
  },
  openComponentTemplateFile(args) {
    return ipcRenderer.invoke('db-ui:component-template-open-file', args || {});
  },
  openObjectListWindow() {
    return ipcRenderer.invoke('db-ui:object-list-open');
  },
  focusCompositePresetManagerWindow() {
    return ipcRenderer.invoke('db-ui:composite-preset-manager-focus');
  },
  focusCompositePresetInsertWindow() {
    return ipcRenderer.invoke('db-ui:composite-preset-insert-focus');
  },
  sendObjectListState(payload) {
    ipcRenderer.send('db-ui:object-list-state', payload || {});
  },
  sendObjectListCommand(command) {
    ipcRenderer.send('db-ui:object-list-command', command || {});
  },
  onObjectListCommand(callback) {
    if (typeof callback !== 'function') return;
    ipcRenderer.on('db-ui:object-list-command', (_event, command) => callback(command || {}));
  },
  onObjectListState(callback) {
    if (typeof callback !== 'function') return;
    ipcRenderer.on('db-ui:object-list-state', (_event, payload) => callback(payload || {}));
  },
  onObjectListWindowReady(callback) {
    if (typeof callback !== 'function') return;
    ipcRenderer.on('db-ui:object-list-window-ready', () => callback());
  }
});
