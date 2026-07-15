(() => {
  'use strict';

  const api = window.DB_UIComposerElectron;
  const root = document.getElementById('listRoot');
  const sceneSelect = document.getElementById('sceneSelect');
  const statusText = document.getElementById('statusText');
  let snapshot = null;
  const collapsedGroups = new Set();
  const collapsedWindows = new Set();
  const UNGROUPED = '__ungrouped__';
  let revealSelectedAfterRender = false;
  let objectListClickCycle = null;
  let detachedDragPayload = null;

  function send(command) {
    if (!api || typeof api.sendObjectListCommand !== 'function') {
      console.warn('[DB_UIComposer List] メイン画面へコマンド送信できません。', command);
      return;
    }
    api.sendObjectListCommand(command || {});
  }

  function askObjectName(message, fallback) {
    try {
      if (typeof window.prompt === 'function') {
        const value = window.prompt(message, fallback);
        if (value === null) return null;
        return String(value || fallback).trim() || fallback;
      }
    } catch (error) {
      console.warn('[DB_UIComposer List] 名前入力ダイアログを表示できないため既定名で作成します。', error);
    }
    return fallback;
  }

  function esc(text) {
    return String(text ?? '');
  }

  function stopControlEvent(ev) {
    ev.preventDefault();
    ev.stopPropagation();
  }

  function isTextEditingElement(target) {
    const element = target?.nodeType === 1 ? target : target?.parentElement;
    if (!element) return false;
    if (element.closest?.('input,textarea,select,[contenteditable="true"]')) return true;
    const tag = String(element.tagName || '').toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select';
  }

  function isControlTarget(target) {
    return !!target?.closest?.('button,input,select,textarea,.row-control-strip,.actions,.mini-button,.icon-button');
  }

  function consumeObjectListDoubleClick(ev, key) {
    if (!ev || !key || isControlTarget(ev.target)) {
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

  function dragPayloadText(payload) {
    if (!payload || typeof payload !== 'object') return '';
    if (payload.kind === 'window') return `window:${payload.windowId || ''}`;
    if (payload.kind === 'item') return `item:${payload.windowId || ''}/${payload.itemId || ''}`;
    if (payload.kind === 'group') return `group:${payload.groupId || ''}`;
    return '';
  }

  function parseDraggedPayload(ev) {
    const jsonText = ev?.dataTransfer?.getData('application/x-db-uicomposer-object') || '';
    if (jsonText) {
      try {
        const payload = JSON.parse(jsonText);
        if (payload && typeof payload === 'object' && payload.kind) return payload;
      } catch (_) {
        // ignore parse failure and fallback to text/plain
      }
    }
    const raw = ev?.dataTransfer?.getData('text/plain') || '';
    if (raw.startsWith('window:')) return { kind: 'window', windowId: raw.slice('window:'.length) };
    if (raw.startsWith('group:')) return { kind: 'group', groupId: raw.slice('group:'.length) };
    if (raw.startsWith('item:')) {
      const body = raw.slice('item:'.length);
      const slashIndex = body.indexOf('/');
      if (slashIndex < 0) return null;
      return { kind: 'item', windowId: body.slice(0, slashIndex), itemId: body.slice(slashIndex + 1) };
    }
    return detachedDragPayload && typeof detachedDragPayload === 'object'
      ? Object.assign({}, detachedDragPayload)
      : null;
  }

  function autoScrollDetachedListWhileDragging(clientY) {
    if (!detachedDragPayload) return;
    const rect = root.getBoundingClientRect();
    const edge = 44;
    const maxStep = 28;
    if (clientY < rect.top + edge) {
      const ratio = Math.max(0, (rect.top + edge - clientY) / edge);
      root.scrollTop -= Math.ceil(maxStep * ratio);
    } else if (clientY > rect.bottom - edge) {
      const ratio = Math.max(0, (clientY - (rect.bottom - edge)) / edge);
      root.scrollTop += Math.ceil(maxStep * ratio);
    }
  }

  function protectControl(el) {
    if (!el) return el;
    ['pointerdown', 'mousedown', 'mouseup', 'dblclick', 'contextmenu', 'dragstart'].forEach(type => {
      el.addEventListener(type, stopControlEvent);
    });
    return el;
  }

  function setVisibilityIcon(button, visible) {
    if (!button) return;
    button.classList.add('visibility-icon-button');
    button.innerHTML = '';
    const img = document.createElement('img');
    img.src = visible ? 'assets/ake.png' : 'assets/toji.png';
    img.alt = visible ? '表示' : '非表示';
    img.draggable = false;
    button.appendChild(img);
    protectControl(button);
  }

  function lockButton(locked, title, command) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'lock-button';
    btn.textContent = locked ? '🔒' : '🔓';
    btn.title = title || (locked ? '位置ロック解除' : '位置ロック');
    protectControl(btn);
    btn.addEventListener('click', ev => {
      stopControlEvent(ev);
      send(command);
    });
    return btn;
  }

  function selectedKey() {
    const s = snapshot?.selected;
    if (!s) return '';
    if (s.kind === 'scene') return `scene:${s.sceneId}`;
    if (s.kind === 'group') return `group:${s.groupId}`;
    if (s.kind === 'window') return `window:${s.windowId}`;
    if (s.kind === 'item') return `item:${s.windowId}/${s.itemId}`;
    return '';
  }

  function typeBadge(kind, text) {
    const badge = document.createElement('span');
    const normalizedKind = String(kind || '').toLowerCase();
    badge.className = `type-badge type-${normalizedKind}`.trim();
    badge.textContent = String(text || kind || '').trim() || 'OBJ';
    return badge;
  }

  function expandContainersForSelection() {
    const s = snapshot?.selected;
    if (!s) return;
    if (s.kind === 'group') {
      if (s.groupId) collapsedGroups.delete(s.groupId);
      return;
    }
    if (s.kind !== 'window' && s.kind !== 'item') return;
    const win = (snapshot?.windows || []).find(entry => entry.id === s.windowId);
    if (!win) return;
    collapsedGroups.delete(win.groupId || UNGROUPED);
    if (s.kind === 'item') collapsedWindows.delete(win.id);
  }

  function revealSelectedRow(key) {
    if (!key) return;
    requestAnimationFrame(() => {
      const target = Array.from(root.querySelectorAll('.object-row')).find(element => element.dataset.key === key);
      if (!target) return;
      const rootRect = root.getBoundingClientRect();
      const rowRect = target.getBoundingClientRect();
      const desiredTop = root.scrollTop + (rowRect.top - rootRect.top) - (rootRect.height - rowRect.height) / 2;
      const maxTop = Math.max(0, root.scrollHeight - root.clientHeight);
      const top = Math.max(0, Math.min(maxTop, desiredTop));
      if (typeof root.scrollTo === 'function') root.scrollTo({ top, behavior: 'smooth' });
      else root.scrollTop = top;
      target.classList.add('auto-revealed');
      window.setTimeout(() => target.classList.remove('auto-revealed'), 750);
    });
  }

  function activeScene() {
    const id = snapshot?.activeSceneId || '';
    return (snapshot?.scenes || []).find(scene => scene.id === id) || null;
  }

  function sceneIncludesGroup(scene, groupId) {
    if (!scene || !groupId) return false;
    return Array.isArray(scene.groupIds) && scene.groupIds.includes(groupId);
  }

  function row(kind, key, iconText, mainText, metaText, noteText, badgeKind = '', badgeText = '') {
    const el = document.createElement('div');
    el.className = `object-row ${kind || ''}`.trim();
    el.dataset.key = key || '';
    if (selectedKey() === key) el.classList.add('active');

    const controls = document.createElement('div');
    controls.className = 'row-control-strip';
    protectControl(controls);
    const icon = document.createElement('button');
    icon.type = 'button';
    icon.className = 'icon-button';
    icon.textContent = iconText || '○';
    protectControl(icon);
    controls.appendChild(icon);
    el.appendChild(controls);

    const label = document.createElement('div');
    label.className = 'label no-toggle';
    if (badgeKind || badgeText) label.appendChild(typeBadge(badgeKind || badgeText, badgeText || badgeKind));
    const main = document.createElement('span');
    main.className = 'main-label';
    main.textContent = mainText || '';
    label.appendChild(main);
    if (metaText) {
      const meta = document.createElement('small');
      meta.className = 'meta';
      meta.textContent = metaText;
      label.appendChild(meta);
    }
    if (noteText) {
      const note = document.createElement('small');
      note.className = 'note';
      note.textContent = noteText;
      label.appendChild(note);
    }
    el.appendChild(label);

    const actions = document.createElement('div');
    actions.className = 'actions';
    el.appendChild(actions);
    return { el, controls, icon, label, actions };
  }


  function makeNameEditable(parts, getValue, buildCommand) {
    const main = parts?.label?.querySelector?.('.main-label');
    if (!main || typeof buildCommand !== 'function') return parts;
    main.classList.add('name-editable');
    main.title = [main.title || '', 'ダブルクリックで名前編集'].filter(Boolean).join(' / ');
    const startEdit = ev => {
      if (ev) {
        ev.preventDefault();
        ev.stopPropagation();
      }
      if (main.querySelector('input')) return;
      const displayText = main.textContent;
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'rename-input';
      input.value = String(typeof getValue === 'function' ? getValue() : displayText || '');
      main.textContent = '';
      main.appendChild(input);
      ['click', 'dblclick', 'pointerdown', 'mousedown', 'mouseup', 'contextmenu', 'dragstart'].forEach(type => input.addEventListener(type, e => e.stopPropagation()));
      let done = false;
      const finish = commit => {
        if (done) return;
        done = true;
        const value = String(input.value || '').trim();
        if (commit && value) send(buildCommand(value));
        else main.textContent = displayText;
      };
      input.addEventListener('keydown', e => {
        e.stopPropagation();
        if (e.key === 'Enter') {
          e.preventDefault();
          finish(true);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          finish(false);
        }
      });
      input.addEventListener('blur', () => finish(true));
      setTimeout(() => {
        input.focus();
        input.select();
      }, 0);
    };
    parts.label._dbStartRename = startEdit;
    main.addEventListener('dblclick', startEdit);
    parts.label?.addEventListener?.('dblclick', ev => {
      const target = ev.target;
      if (target?.closest?.('button,input,select,textarea,.row-control-strip,.actions')) return;
      startEdit(ev);
    });
    return parts;
  }

  function groupLabelRow(key, iconText, mainText, metaText, noteText, collapsed, onToggle) {
    const parts = row('group-row', key, iconText, mainText, '', noteText, 'group', 'GROUP');
    parts.label.className = 'label';
    parts.label.innerHTML = '';
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'collapse-button';
    toggle.textContent = collapsed ? '▸' : '▾';
    toggle.title = collapsed ? '展開' : '折りたたみ';
    toggle.addEventListener('click', ev => {
      ev.preventDefault();
      ev.stopPropagation();
      onToggle?.();
    });
    parts.label.appendChild(toggle);
    parts.label.appendChild(typeBadge('group', 'GROUP'));
    const main = document.createElement('span');
    main.className = 'main-label';
    main.textContent = mainText || '';
    parts.label.appendChild(main);
    if (metaText) {
      const meta = document.createElement('small');
      meta.className = 'meta';
      meta.textContent = metaText;
      parts.label.appendChild(meta);
    }
    if (noteText) {
      const note = document.createElement('small');
      note.className = 'note';
      note.textContent = noteText;
      parts.label.appendChild(note);
    }
    return parts;
  }


  function windowLabelRow(key, iconText, mainText, metaText, noteText, collapsed, onToggle) {
    const parts = row('window-row', key, iconText, mainText, '', noteText, 'window', 'WINDOW');
    parts.label.className = 'label window-label';
    parts.label.innerHTML = '';
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'collapse-button window-collapse-button';
    toggle.textContent = collapsed ? '▸' : '▾';
    toggle.title = collapsed ? 'パーツ一覧を展開' : 'パーツ一覧を折りたたみ';
    toggle.addEventListener('click', ev => {
      ev.preventDefault();
      ev.stopPropagation();
      onToggle?.();
    });
    parts.label.appendChild(toggle);
    parts.label.appendChild(typeBadge('window', 'WINDOW'));
    const main = document.createElement('span');
    main.className = 'main-label';
    main.textContent = mainText || '';
    parts.label.appendChild(main);
    if (metaText) {
      const meta = document.createElement('small');
      meta.className = 'meta';
      meta.textContent = metaText;
      parts.label.appendChild(meta);
    }
    if (noteText) {
      const note = document.createElement('small');
      note.className = 'note';
      note.textContent = noteText;
      parts.label.appendChild(note);
    }
    return parts;
  }

  function miniButton(text, title, command) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mini-button';
    btn.textContent = text;
    btn.title = title || text;
    btn.addEventListener('click', ev => {
      ev.preventDefault();
      ev.stopPropagation();
      send(command);
    });
    return btn;
  }

  function pasteLabelForTarget(target) {
    const kind = snapshot?.clipboardKind || '';
    if (kind === 'group') return target?.kind === 'scene' ? 'このシーンへグループを貼り付け' : 'グループを現在シーンへ貼り付け';
    if (kind === 'window') {
      if (target?.kind === 'group') return 'このグループへウィンドウを貼り付け';
      if (target?.kind === 'scene') return 'このシーンへウィンドウを貼り付け';
      return 'ウィンドウを貼り付け';
    }
    if (kind === 'item') return 'このウィンドウへパーツを貼り付け';
    return '貼り付け';
  }

  function contextMenuItemsForTarget(target) {
    const clipboardKind = snapshot?.clipboardKind || '';
    const canPaste = !!clipboardKind;
    const canPasteSceneOrGroup = !!clipboardKind && clipboardKind !== 'item';
    const items = [];
    if (target?.kind === 'scene') {
      const scene = (snapshot?.scenes || []).find(entry => entry.id === target.sceneId);
      items.push({ id: 'select', label: `このシーンを選択：${scene?.name || target.sceneId}`, enabled: !!scene });
      items.push({ id: 'scene:activate', label: 'このシーンをプレビュー表示', enabled: !!scene });
      items.push({ type: 'separator' });
      items.push({ id: 'paste', label: pasteLabelForTarget(target), enabled: canPasteSceneOrGroup });
      items.push({ type: 'separator' });
      items.push({ id: 'scene:delete', label: 'シーンを削除', enabled: !!scene });
      return items;
    }
    if (target?.kind === 'group') {
      const group = (snapshot?.groups || []).find(entry => entry.id === target.groupId);
      const scenes = snapshot?.scenes || [];
      const sceneMoveItems = scenes.map(scene => ({
        id: `group:scene:only:${scene.id}`,
        label: `${scene.name || scene.id} だけへ移動`,
        enabled: !!group
      }));
      const sceneMembershipItems = scenes.map(scene => ({
        id: `group:scene:toggle:${scene.id}`,
        label: `${scene.name || scene.id} に含める`,
        checked: !!group && sceneIncludesGroup(scene, group.id),
        enabled: !!group
      }));
      items.push({ id: 'select', label: `このグループを選択：${group?.name || target.groupId}`, enabled: !!group });
      items.push({ type: 'separator' });
      items.push({ id: 'copy', label: 'グループをコピー', enabled: !!group });
      items.push({ id: 'paste', label: pasteLabelForTarget(target), enabled: canPasteSceneOrGroup });
      items.push({ id: 'duplicate', label: 'グループを複製', enabled: !!group });
      items.push({ id: 'delete', label: 'グループ削除（所属ウィンドウも削除）', enabled: !!group });
      if (sceneMoveItems.length || sceneMembershipItems.length) items.push({ type: 'separator' });
      if (sceneMoveItems.length) items.push({ id: 'group:sceneMove', label: 'シーンへ移動', enabled: !!group, submenu: sceneMoveItems });
      if (sceneMembershipItems.length) items.push({ id: 'group:sceneMembership', label: 'シーン所属を切替', enabled: !!group, submenu: sceneMembershipItems });
      return items;
    }
    if (target?.kind === 'window') {
      const win = (snapshot?.windows || []).find(entry => entry.id === target.windowId);
      items.push({ id: 'select', label: `このウィンドウを選択：${target.windowId}`, enabled: !!win });
      items.push({ type: 'separator' });
      items.push({ id: 'copy', label: 'ウィンドウをコピー', enabled: !!win });
      items.push({ id: 'paste', label: pasteLabelForTarget(target), enabled: canPaste });
      items.push({ id: 'duplicate', label: 'ウィンドウを複製', enabled: !!win });
      items.push({ id: 'delete', label: 'ウィンドウを削除', enabled: !!win });
      return items;
    }
    if (target?.kind === 'item') {
      items.push({ id: 'select', label: `このパーツを選択：${target.itemId}`, enabled: true });
      items.push({ type: 'separator' });
      items.push({ id: 'copy', label: 'パーツをコピー', enabled: true });
      items.push({ id: 'paste', label: pasteLabelForTarget(target), enabled: canPaste });
      items.push({ id: 'duplicate', label: 'パーツを複製', enabled: true });
      items.push({ id: 'delete', label: 'パーツを削除', enabled: true });
      return items;
    }
    return items;
  }

  async function openContextMenu(ev, target) {
    if (!target) return;
    ev.preventDefault();
    ev.stopPropagation();
    const items = contextMenuItemsForTarget(target);
    if (!items.length) return;
    let command = '';
    try {
      if (api && typeof api.showContextMenu === 'function') {
        command = await api.showContextMenu({ items, target, point: { x: ev.clientX, y: ev.clientY } });
      }
    } catch (error) {
      console.warn('[DB_UIComposer List] コンテキストメニューを表示できませんでした。', error);
    }
    if (command) send({ type: 'contextMenuCommand', command, target });
  }

  function bindContextMenu(el, target) {
    el.addEventListener('contextmenu', ev => openContextMenu(ev, target), true);
  }

  function deleteButton(title, command) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'delete-button';
    btn.textContent = '×';
    btn.title = title || '削除';
    btn.addEventListener('click', ev => {
      ev.preventDefault();
      ev.stopPropagation();
      send(command);
    });
    return btn;
  }


  function iconFileButton(kind, title, command) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `mini-button icon-file-button ${kind}-button`;
    btn.title = title || (kind === 'load' ? '読み込み' : '保存');
    const img = document.createElement('img');
    img.src = kind === 'load' ? 'assets/yomikomi.png' : 'assets/hozon.png';
    img.alt = kind === 'load' ? '読込' : '保存';
    btn.appendChild(img);
    protectControl(btn);
    btn.addEventListener('click', ev => {
      stopControlEvent(ev);
      send(command);
    });
    return btn;
  }

  function saveButton(title, command) {
    return iconFileButton('save', title || '部品として保存', command);
  }

  function loadButton(title, command) {
    return iconFileButton('load', title || '部品を読み込み', command);
  }

  function sectionTitle(text) {
    const div = document.createElement('div');
    div.className = 'section-title';
    div.textContent = text;
    root.appendChild(div);
  }

  function makeWindowDrag(el, win) {
    el.draggable = true;
    el.title = 'ドラッグして別グループへ移動できます';
    el.addEventListener('dragstart', ev => {
      ev.stopPropagation();
      setDetachedSelectionDuringDrag({ kind: 'window', windowId: win.id }, el);
      const payload = { kind: 'window', windowId: win.id };
      detachedDragPayload = payload;
      ev.dataTransfer.effectAllowed = 'move';
      ev.dataTransfer.setData('application/x-db-uicomposer-object', JSON.stringify(payload));
      ev.dataTransfer.setData('text/plain', dragPayloadText(payload));
      el.classList.add('dragging');
    });
    el.addEventListener('dragend', () => {
      el.classList.remove('dragging');
      detachedDragPayload = null;
    });
  }

  function makeItemDrag(el, win, item) {
    el.draggable = true;
    el.title = 'ドラッグして別ウィンドウへ移動できます';
    el.addEventListener('dragstart', ev => {
      ev.stopPropagation();
      setDetachedSelectionDuringDrag({ kind: 'item', windowId: win.id, itemId: item.id }, el);
      const payload = { kind: 'item', windowId: win.id, itemId: item.id };
      detachedDragPayload = payload;
      ev.dataTransfer.effectAllowed = 'move';
      ev.dataTransfer.setData('application/x-db-uicomposer-object', JSON.stringify(payload));
      ev.dataTransfer.setData('text/plain', dragPayloadText(payload));
      el.classList.add('dragging');
    });
    el.addEventListener('dragend', () => {
      el.classList.remove('dragging');
      detachedDragPayload = null;
    });
  }

  function makeGroupDrag(el, group) {
    el.draggable = true;
    el.title = 'ドラッグしてグループ順を変更できます';
    el.addEventListener('dragstart', ev => {
      ev.stopPropagation();
      setDetachedSelectionDuringDrag({ kind: 'group', groupId: group.id }, el);
      const payload = { kind: 'group', groupId: group.id };
      detachedDragPayload = payload;
      ev.dataTransfer.effectAllowed = 'move';
      ev.dataTransfer.setData('application/x-db-uicomposer-object', JSON.stringify(payload));
      ev.dataTransfer.setData('text/plain', dragPayloadText(payload));
      el.classList.add('dragging');
    });
    el.addEventListener('dragend', () => {
      el.classList.remove('dragging');
      detachedDragPayload = null;
    });
  }

  function clearDropMarks() {
    root.querySelectorAll('.drag-over,.drop-before,.drop-after,.drop-into').forEach(el => {
      el.classList.remove('drag-over', 'drop-before', 'drop-after', 'drop-into');
      delete el.dataset.dropHint;
    });
  }

  function setDetachedSelectionDuringDrag(nextSelection, row) {
    if (!nextSelection || typeof nextSelection !== 'object') return;
    if (!snapshot || typeof snapshot !== 'object') snapshot = {};
    snapshot.selected = nextSelection;
    root.querySelectorAll('.object-row.active').forEach(el => el.classList.remove('active'));
    if (row?.classList?.contains('object-row')) row.classList.add('active');
  }

  function bindRowDrop(el, target) {
    const targetGroupId = () => {
      if (target.kind === 'group') return String(target.groupId || '');
      if (target.kind === 'window' || target.kind === 'item') {
        const win = (snapshot?.windows || []).find(entry => entry.id === target.windowId);
        return String(win?.groupId || '');
      }
      return '';
    };

    const isAllowed = payload => {
      if (!payload || !target) return false;
      const tg = targetGroupId();
      if (payload.kind === 'group' && target.kind === 'group') return payload.groupId !== target.groupId;
      if (payload.kind === 'group' && (target.kind === 'window' || target.kind === 'item')) return !!tg && payload.groupId !== tg;
      if (payload.kind === 'window' && (target.kind === 'group' || target.kind === 'window')) return true;
      if (payload.kind === 'window' && target.kind === 'item') return payload.windowId !== target.windowId;
      if (payload.kind === 'item' && (target.kind === 'window' || target.kind === 'item')) return true;
      return false;
    };

    const placement = (ev, payload) => {
      const rect = el.getBoundingClientRect();
      const edgeBand = Math.max(6, Math.min(12, Math.floor(rect.height * 0.24)));
      const nearTop = ev.clientY <= rect.top + edgeBand;
      const nearBottom = ev.clientY >= rect.bottom - edgeBand;
      const edgeOnly = (target.kind === 'group' && payload.kind === 'window')
        || (target.kind === 'window' && payload.kind === 'item')
        || (target.kind === 'item' && (payload.kind === 'window' || payload.kind === 'group'))
        || (target.kind === 'window' && payload.kind === 'group');
      if (edgeOnly) {
        if (nearTop) return 'before';
        if (nearBottom) return 'after';
        return '';
      }
      return ev.clientY > rect.top + rect.height / 2 ? 'after' : 'before';
    };

    el.addEventListener('dragover', ev => {
      const payload = parseDraggedPayload(ev);
      if (!isAllowed(payload)) return;
      const pos = placement(ev, payload);
      if (!pos) return;
      ev.preventDefault();
      autoScrollDetachedListWhileDragging(ev.clientY);
      ev.dataTransfer.dropEffect = 'move';
      clearDropMarks();
      el.classList.add('drag-over', pos === 'after' ? 'drop-after' : 'drop-before');
    });
    el.addEventListener('dragleave', ev => {
      if (!el.contains(ev.relatedTarget)) clearDropMarks();
    });
    el.addEventListener('drop', ev => {
      const payload = parseDraggedPayload(ev);
      if (!isAllowed(payload)) return;
      const pos = placement(ev, payload);
      if (!pos) return;
      ev.preventDefault();
      clearDropMarks();
      if (payload.kind === 'group') {
        const tg = targetGroupId();
        if (!tg) return;
        send({ type: 'reorderGroupByList', groupId: String(payload.groupId || ''), targetGroupId: target.kind === 'group' ? String(target.groupId || '') : tg, position: pos });
        return;
      }
      if (payload.kind === 'window') {
        const tg = target.kind === 'group' ? String(target.groupId || '') : targetGroupId();
        const tw = (target.kind === 'window' || target.kind === 'item') ? String(target.windowId || '') : '';
        send({ type: 'moveWindowToGroupAt', windowId: String(payload.windowId || ''), groupId: tg, targetWindowId: tw, position: pos });
        return;
      }
      if (payload.kind === 'item') {
        send({
          type: 'moveItemToWindow',
          sourceWindowId: String(payload.windowId || ''),
          itemId: String(payload.itemId || ''),
          targetWindowId: String(target.windowId || ''),
          targetItemId: target.kind === 'item' ? String(target.itemId || '') : '',
          position: pos
        });
      }
    });
  }

  function renderSceneSelect() {
    sceneSelect.innerHTML = '';
    for (const scene of snapshot?.scenes || []) {
      const option = document.createElement('option');
      option.value = scene.id;
      option.textContent = `${scene.name || scene.id} (${scene.id})`;
      sceneSelect.appendChild(option);
    }
    sceneSelect.value = snapshot?.activeSceneId || '';
  }

  function renderScenes() {
    const scenes = snapshot?.scenes || [];
    if (!scenes.length) return;
    sectionTitle('シーン');
    for (const scene of scenes) {
      const active = (snapshot.activeSceneId || '') === scene.id;
      const parts = row('scene-row', `scene:${scene.id}`, active ? '●' : '○', `${scene.name || scene.id}`, `${scene.id} / ${(scene.groupIds || []).length}グループ`, active ? 'プレビュー中' : '', 'scene', 'SCENE');
      makeNameEditable(parts, () => scene.name || scene.id, value => ({ type: 'renameScene', sceneId: scene.id, name: value }));
      if (active) parts.el.classList.add('preview-active');
      parts.icon.title = 'このシーンをプレビュー表示';
      parts.icon.addEventListener('click', ev => {
        stopControlEvent(ev);
        send({ type: 'activateScene', sceneId: scene.id });
      });
      parts.actions.appendChild(saveButton('このシーンをファイル保存', { type: 'saveSceneTemplate', sceneId: scene.id }));
      parts.actions.appendChild(loadButton('シーンファイルを読み込み', { type: 'loadSceneTemplate', sceneId: scene.id }));
      parts.actions.appendChild(deleteButton('このシーンを削除', { type: 'deleteScene', sceneId: scene.id }));
      parts.el.addEventListener('click', ev => {
        const rowKey = `scene:${scene.id}`;
        if (consumeObjectListDoubleClick(ev, rowKey)) {
          if (parts.label && typeof parts.label._dbStartRename === 'function') {
            parts.label._dbStartRename(ev);
            return;
          }
          send({ type: 'activateScene', sceneId: scene.id });
          return;
        }
        send({ type: 'selectScene', sceneId: scene.id });
      });
      bindContextMenu(parts.el, { kind: 'scene', sceneId: scene.id });
      root.appendChild(parts.el);
    }
  }

  function renderWindowRows(windows, indent, scene) {
    for (const win of windows) {
      const groupHidden = win.groupId && !(snapshot.groups || []).find(g => g.id === win.groupId)?.visible;
      const sceneHidden = !sceneIncludesGroup(scene, win.groupId || '');
      const note = [win.visible ? '' : '非表示', win.locked ? '位置ロック' : '', groupHidden ? 'グループ非表示' : '', sceneHidden ? 'シーン外' : ''].filter(Boolean).join(' / ');
      const collapsed = collapsedWindows.has(win.id);
      const meta = [win.groupId || '', `${(win.items || []).length}パーツ`].filter(Boolean).join(' / ');
      const parts = windowLabelRow(`window:${win.id}`, win.visible ? '◎' : '○', `▣ ${win.id || '(idなし)'}`, meta, note, collapsed, () => {
        if (collapsedWindows.has(win.id)) collapsedWindows.delete(win.id);
        else collapsedWindows.add(win.id);
        render();
      });
      makeNameEditable(parts, () => win.id || '', value => ({ type: 'renameWindow', windowId: win.id, name: value }));
      if (indent) parts.el.classList.add('group-child-row');
      if (sceneHidden) parts.el.classList.add('scene-hidden');
      setVisibilityIcon(parts.icon, win.visible);
      parts.icon.title = win.visible ? 'このウィンドウを非表示' : 'このウィンドウを表示';
      parts.icon.addEventListener('click', ev => {
        stopControlEvent(ev);
        send({ type: 'toggleWindowVisible', windowId: win.id });
      });
      parts.controls.appendChild(lockButton(win.locked, win.locked ? 'このウィンドウの位置ロックを解除' : 'このウィンドウの位置をロック', { type: 'toggleWindowLock', windowId: win.id }));
      parts.actions.appendChild(saveButton('このウィンドウをファイル保存', { type: 'saveWindowTemplate', windowId: win.id }));
      parts.actions.appendChild(loadButton('このウィンドウへパーツファイルを読み込み', { type: 'loadItemTemplate', windowId: win.id }));
      parts.actions.appendChild(deleteButton('このウィンドウを削除', { type: 'deleteWindow', windowId: win.id }));
      makeWindowDrag(parts.el, win);
      bindRowDrop(parts.el, { kind: 'window', windowId: win.id });
      parts.el.addEventListener('click', ev => {
        const rowKey = `window:${win.id}`;
        if (consumeObjectListDoubleClick(ev, rowKey)) {
          const label = ev.target?.closest?.('.label');
          if (label && typeof label._dbStartRename === 'function') {
            label._dbStartRename(ev);
            return;
          }
        }
        send({ type: 'selectWindow', windowId: win.id });
      });
      bindContextMenu(parts.el, { kind: 'window', windowId: win.id });
      root.appendChild(parts.el);

      if (collapsed) continue;

      for (const item of win.items || []) {
        const itemParts = row('item-row part-row', `item:${win.id}/${item.id}`, item.visible ? '◎' : '○', `${item.displayName || item.id || '(名称なし)'}`, `${item.id || '(idなし)'} / ${item.type || 'item'}`, [item.visible ? '' : '非表示', item.locked ? '位置ロック' : ''].filter(Boolean).join(' / '), 'part', 'PART');
        makeNameEditable(itemParts, () => item.displayName || item.id || '', value => ({ type: 'renameItemDisplayName', windowId: win.id, itemId: item.id, name: value }));
        if (sceneHidden) itemParts.el.classList.add('scene-hidden');
        setVisibilityIcon(itemParts.icon, item.visible);
        itemParts.icon.title = item.visible ? 'このパーツを非表示' : 'このパーツを表示';
        itemParts.icon.addEventListener('click', ev => {
          stopControlEvent(ev);
          send({ type: 'toggleItemVisible', windowId: win.id, itemId: item.id });
        });
        itemParts.controls.appendChild(lockButton(item.locked, item.locked ? 'このパーツの位置ロックを解除' : 'このパーツの位置をロック', { type: 'toggleItemLock', windowId: win.id, itemId: item.id }));
        itemParts.actions.appendChild(saveButton('このパーツをファイル保存', { type: 'saveItemTemplate', windowId: win.id, itemId: item.id }));
        makeItemDrag(itemParts.el, win, item);
        bindRowDrop(itemParts.el, { kind: 'item', windowId: win.id, itemId: item.id });
        itemParts.el.addEventListener('click', ev => {
          const rowKey = `item:${win.id}/${item.id}`;
          if (consumeObjectListDoubleClick(ev, rowKey)) {
            const label = ev.target?.closest?.('.label');
            if (label && typeof label._dbStartRename === 'function') {
              label._dbStartRename(ev);
              return;
            }
          }
          send({ type: 'selectItem', windowId: win.id, itemId: item.id });
        });
        bindContextMenu(itemParts.el, { kind: 'item', windowId: win.id, itemId: item.id });
        root.appendChild(itemParts.el);
      }
    }
  }

  function renderGroups() {
    const allGroups = snapshot?.groups || [];
    const windows = snapshot?.windows || [];
    const scene = activeScene();
    const groups = scene ? allGroups.filter(group => sceneIncludesGroup(scene, group.id)) : allGroups;
    sectionTitle(`グループ / ${(scene && (scene.name || scene.id)) || 'シーン未選択'}`);
    for (const group of groups) {
      const collapsed = collapsedGroups.has(group.id);
      const groupWindows = windows.filter(win => win.groupId === group.id);
      const inScene = sceneIncludesGroup(scene, group.id);
      const meta = [group.id, `${groupWindows.length}件`, group.visible ? '' : '非表示', group.locked ? '位置ロック' : '', inScene ? '' : 'シーン外'].filter(Boolean).join(' / ');
      const parts = groupLabelRow(`group:${group.id}`, group.visible ? '◎' : '○', group.name || group.id, meta, '', collapsed, () => {
        if (collapsedGroups.has(group.id)) collapsedGroups.delete(group.id);
        else collapsedGroups.add(group.id);
        render();
      });
      makeNameEditable(parts, () => group.name || group.id, value => ({ type: 'renameGroup', groupId: group.id, name: value }));
      if (!inScene) parts.el.classList.add('scene-hidden');
      setVisibilityIcon(parts.icon, group.visible);
      parts.icon.title = group.visible ? 'このグループを非表示' : 'このグループを表示';
      parts.icon.addEventListener('click', ev => {
        stopControlEvent(ev);
        send({ type: 'toggleGroupVisible', groupId: group.id });
      });
      // v0.3.88: グループ所属はシーン固定のため、一覧上のS切替は廃止。
      parts.controls.appendChild(lockButton(group.locked, group.locked ? 'このグループの位置ロックを解除' : 'このグループの位置をロック', { type: 'toggleGroupLock', groupId: group.id }));
      parts.actions.appendChild(miniButton('複製', 'このグループを複製', { type: 'duplicateGroup', groupId: group.id }));
      parts.actions.appendChild(saveButton('このグループをファイル保存', { type: 'saveGroupTemplate', groupId: group.id }));
      parts.actions.appendChild(loadButton('このグループへウィンドウファイルを読み込み', { type: 'loadWindowTemplate', groupId: group.id }));
      parts.actions.appendChild(deleteButton('このグループを削除（所属ウィンドウも削除）', { type: 'deleteGroup', groupId: group.id }));
      makeGroupDrag(parts.el, group);
      bindRowDrop(parts.el, { kind: 'group', groupId: group.id });
      parts.el.addEventListener('click', ev => {
        const rowKey = `group:${group.id}`;
        if (consumeObjectListDoubleClick(ev, rowKey)) {
          const label = ev.target?.closest?.('.label');
          if (label && typeof label._dbStartRename === 'function') {
            label._dbStartRename(ev);
            return;
          }
          if (collapsedGroups.has(group.id)) collapsedGroups.delete(group.id);
          else collapsedGroups.add(group.id);
          render();
          return;
        }
        send({ type: 'selectGroup', groupId: group.id });
      });
      bindContextMenu(parts.el, { kind: 'group', groupId: group.id });
      root.appendChild(parts.el);
      if (!collapsed) renderWindowRows(groupWindows, true, scene);
    }

    // v0.3.88: 未グループ行は廃止。
  }

  function render() {
    if (!snapshot) {
      root.innerHTML = '<div class="empty">メイン画面からの同期待ちです。</div>';
      return;
    }
    const keyToReveal = revealSelectedAfterRender ? selectedKey() : '';
    if (keyToReveal) expandContainersForSelection();
    statusText.textContent = `${snapshot.layoutId || 'layout'} / v${snapshot.version || ''}`;
    renderSceneSelect();
    root.innerHTML = '';
    // シーンは上部のセレクトボックスだけで管理するため、
    // 一覧本体にはシーン行を表示しません。
    renderGroups();
    if (keyToReveal) revealSelectedRow(keyToReveal);
    revealSelectedAfterRender = false;
  }

  function selectedTargetForShortcut() {
    const s = snapshot?.selected;
    if (!s || typeof s !== 'object') return null;
    if (s.kind === 'scene') return { kind: 'scene', sceneId: s.sceneId || '' };
    if (s.kind === 'group') return { kind: 'group', groupId: s.groupId || '' };
    if (s.kind === 'window') return { kind: 'window', windowId: s.windowId || '' };
    if (s.kind === 'item') return { kind: 'item', windowId: s.windowId || '', itemId: s.itemId || '' };
    return null;
  }

  function handleShortcutKeydown(ev) {
    const key = String(ev.key || '').toLowerCase();
    const modifier = ev.ctrlKey || ev.metaKey;
    if (!modifier || ev.altKey) return;
    if (isTextEditingElement(ev.target)) return;
    if (key !== 'c' && key !== 'x' && key !== 'v') return;
    ev.preventDefault();
    const command = key === 'c' ? 'copy' : key === 'x' ? 'cut' : 'paste';
    send({ type: 'contextMenuCommand', command, target: selectedTargetForShortcut() });
  }

  sceneSelect.addEventListener('change', () => send({ type: 'activateScene', sceneId: sceneSelect.value || '', selectScene: true }));
  document.getElementById('addSceneBtn').addEventListener('click', ev => {
    ev.preventDefault();
    ev.stopPropagation();
    send({ type: 'createScene' });
  });
  document.getElementById('addGroupBtn').addEventListener('click', ev => {
    ev.preventDefault();
    ev.stopPropagation();
    send({ type: 'createGroup' });
  });
  document.getElementById('saveSceneBtn')?.addEventListener('click', ev => {
    ev.preventDefault();
    ev.stopPropagation();
    const selectedSceneId = snapshot?.selected?.kind === 'scene' ? snapshot.selected.sceneId : (snapshot?.activeSceneId || '');
    send({ type: 'saveSceneTemplate', sceneId: selectedSceneId });
  });
  document.getElementById('loadSceneBtn')?.addEventListener('click', ev => {
    ev.preventDefault();
    ev.stopPropagation();
    send({ type: 'loadSceneTemplate' });
  });
  document.getElementById('loadGroupBtn')?.addEventListener('click', ev => {
    ev.preventDefault();
    ev.stopPropagation();
    send({ type: 'loadGroupTemplate', sceneId: snapshot?.activeSceneId || '' });
  });

  root.addEventListener('dragover', ev => {
    if (!detachedDragPayload) return;
    ev.preventDefault();
    autoScrollDetachedListWhileDragging(ev.clientY);
    if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move';
  });

  root.addEventListener('wheel', ev => {
    if (!detachedDragPayload) return;
    ev.preventDefault();
    root.scrollTop += ev.deltaY;
  }, { passive: false });

  window.addEventListener('keydown', handleShortcutKeydown, true);

  api?.onObjectListState?.(payload => {
    const oldKey = selectedKey();
    snapshot = payload || null;
    const newKey = selectedKey();
    revealSelectedAfterRender = !!newKey && newKey !== oldKey;
    render();
  });

  render();
})();
