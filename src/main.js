import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import './styles.css';

const editor = document.getElementById('editor');
const lineNumbers = document.getElementById('line-numbers');
const btnNew = document.getElementById('btn-new');
const btnOpen = document.getElementById('btn-open');
const btnSave = document.getElementById('btn-save');
const btnSaveAs = document.getElementById('btn-save-as');
const btnTop = document.getElementById('btn-top');
const topLabel = document.getElementById('top-label');
const iconMoon = document.getElementById('icon-moon');
const iconSun = document.getElementById('icon-sun');
const themeLabel = document.getElementById('theme-label');
const btnRecent = document.getElementById('btn-recent');
const recentMenu = document.getElementById('recent-menu');
const cursorPos = document.getElementById('cursor-pos');
const lineCount = document.getElementById('line-count');
const charCount = document.getElementById('char-count');
const encLabel = document.getElementById('enc-label');
const overlay = document.getElementById('modal-overlay');
const findbar = document.getElementById('findbar');
const findInput = document.getElementById('find-input');
const replaceInput = document.getElementById('replace-input');
const findStatus = document.getElementById('find-status');
const btnFind = document.getElementById('btn-find');
const btnTheme = document.getElementById('btn-theme');
const btnFontDec = document.getElementById('btn-font-dec');
const btnFontInc = document.getElementById('btn-font-inc');

let currentFilePath = null;
let currentEncoding = 'UTF-8';
let dirty = false;
let closeResolver = null;
let autosaveTimer = null;

// ---- 行列统计 ----
function updateStatus() {
  const text = editor.value;
  const pos = editor.selectionStart;
  const before = text.slice(0, pos);
  const line = before.split('\n').length;
  const lastNewline = before.lastIndexOf('\n');
  const col = pos - lastNewline;
  const totalLines = text.split('\n').length;
  const chars = text.replace(/\r?\n/g, '').length;
  cursorPos.textContent = `第 ${line} 行，第 ${col} 列`;
  lineCount.textContent = `共 ${totalLines} 行`;
  charCount.textContent = `${chars} 字`;
}

// ---- 行号侧栏 ----
function updateLineNumbers() {
  const total = editor.value.split('\n').length;
  const parts = [];
  for (let i = 1; i <= total; i++) parts.push(i);
  lineNumbers.textContent = parts.join('\n');
}
function syncScroll() {
  lineNumbers.scrollTop = editor.scrollTop;
}

// ---- 标题 / 编码 ----
function getBaseName(p) {
  return p.split(/[\\/]/).pop();
}
function updateTitle() {
  const name = currentFilePath ? getBaseName(currentFilePath) : '未命名';
  const star = dirty ? ' *' : '';
  document.title = name + star + ' - 记事本';
}
function updateEnc() {
  encLabel.textContent = currentEncoding;
}

// ---- 自动保存 ----
function scheduleAutosave() {
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    invoke('autosave', { content: editor.value }).catch(() => {});
  }, 1000);
}

// ---- 最近文件 ----
async function refreshRecent() {
  const list = await invoke('get_recent').catch(() => []);
  recentMenu.innerHTML = '';
  if (!list || list.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'recent-empty';
    empty.textContent = '（无记录）';
    recentMenu.appendChild(empty);
  } else {
    for (const p of list) {
      const item = document.createElement('div');
      item.className = 'recent-item';
      item.title = p;
      item.textContent = getBaseName(p);
      item.addEventListener('click', async () => {
        recentMenu.classList.add('hidden');
        const data = await invoke('open_path', { path: p }).catch(() => null);
        if (data) await applyFileData(data);
      });
      recentMenu.appendChild(item);
    }
  }
}
function toggleRecent() {
  const hidden = recentMenu.classList.toggle('hidden');
  if (!hidden) refreshRecent();
  return !hidden;
}

// ---- 文件操作 ----
async function applyFileData(data) {
  currentFilePath = data.path;
  currentEncoding = data.encoding;
  editor.value = data.content;
  dirty = false;
  updateTitle();
  updateStatus();
  updateLineNumbers();
  updateEnc();
  syncScroll();
  invoke('clear_autosave').catch(() => {});
  invoke('add_recent', { path: data.path }).catch(() => {});
  refreshRecent();
  editor.focus();
}

async function openFile() {
  const data = await invoke('open_file').catch(() => null);
  if (data) await applyFileData(data);
}

async function doSave(as) {
  const result = await invoke('save_file', {
    content: editor.value,
    path: as ? null : currentFilePath,
    encoding: currentEncoding
  }).catch(() => null);
  if (result) {
    currentFilePath = result.path;
    currentEncoding = result.encoding;
    dirty = false;
    updateTitle();
    updateEnc();
    invoke('clear_autosave').catch(() => {});
    invoke('add_recent', { path: result.path }).catch(() => {});
    refreshRecent();
    return true;
  }
  return false;
}

// ---- 置顶 ----
function applyTopState(on) {
  btnTop.classList.toggle('active', on);
  topLabel.textContent = on ? '已置顶' : '置顶';
}

// ---- 关闭确认 ----
function showCloseDialog() {
  return new Promise((resolve) => {
    closeResolver = resolve;
    overlay.classList.remove('hidden');
  });
}
async function handleCloseRequest() {
  if (!dirty) {
    await invoke('hide_window');
    return;
  }
  const choice = await showCloseDialog();
  if (choice === 'save') {
    const ok = await doSave(false);
    if (ok) await invoke('hide_window');
  } else if (choice === 'discard') {
    await invoke('hide_window');
  }
  // cancel: 不动作
}

// ---- 查找 / 替换 ----
function toggleFindbar() {
  findbar.classList.toggle('hidden');
  if (!findbar.classList.contains('hidden')) findInput.focus();
}
function doFind(dir) {
  const q = findInput.value;
  if (!q) return;
  const text = editor.value;
  let idx;
  if (dir > 0) {
    idx = text.indexOf(q, editor.selectionEnd);
    if (idx === -1) idx = text.indexOf(q);
  } else {
    idx = text.lastIndexOf(q, Math.max(0, editor.selectionStart - 1));
    if (idx === -1) idx = text.lastIndexOf(q);
  }
  if (idx === -1) {
    findStatus.textContent = '无匹配';
    return;
  }
  editor.setSelectionRange(idx, idx + q.length);
  editor.focus();
  findStatus.textContent = '';
  updateStatus();
}
function doReplace() {
  const q = findInput.value;
  if (!q) return;
  const sel = editor.value.slice(editor.selectionStart, editor.selectionEnd);
  if (sel === q) {
    editor.setRangeText(replaceInput.value, editor.selectionStart, editor.selectionEnd, 'select');
    editor.dispatchEvent(new Event('input'));
    findStatus.textContent = '';
  } else {
    doFind(1);
  }
}
function doReplaceAll() {
  const q = findInput.value;
  if (!q) return;
  const count = editor.value.split(q).length - 1;
  editor.value = editor.value.split(q).join(replaceInput.value);
  editor.dispatchEvent(new Event('input'));
  findStatus.textContent = `已替换 ${count} 处`;
}

// ---- 主题 / 字体 ----
function applyTheme(dark) {
  if (dark) document.body.setAttribute('data-theme', 'dark');
  else document.body.removeAttribute('data-theme');
  themeLabel.textContent = dark ? '浅色' : '深色';
  iconMoon.classList.toggle('hidden', dark);
  iconSun.classList.toggle('hidden', !dark);
}
function applyFontSize(px) {
  editor.style.fontSize = px + 'px';
  lineNumbers.style.fontSize = px + 'px';
}
function changeFontSize(delta) {
  const cur = parseInt(editor.style.fontSize, 10) || 15;
  const next = Math.min(32, Math.max(12, cur + delta));
  applyFontSize(next);
  localStorage.setItem('fontSize', String(next));
}

// ---- 事件绑定 ----
editor.addEventListener('input', () => {
  if (!dirty) {
    dirty = true;
    updateTitle();
  }
  updateStatus();
  updateLineNumbers();
  scheduleAutosave();
});
editor.addEventListener('scroll', syncScroll);
editor.addEventListener('keyup', updateStatus);
editor.addEventListener('click', updateStatus);
document.addEventListener('selectionchange', updateStatus);
editor.addEventListener('keydown', (e) => {
  if (e.key === 'Tab') {
    e.preventDefault();
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    editor.value = editor.value.slice(0, start) + '\t' + editor.value.slice(end);
    editor.selectionStart = editor.selectionEnd = start + 1;
    editor.dispatchEvent(new Event('input'));
  }
});

btnNew.addEventListener('click', () => {
  currentFilePath = null;
  currentEncoding = 'UTF-8';
  editor.value = '';
  dirty = false;
  updateTitle();
  updateStatus();
  updateLineNumbers();
  updateEnc();
  invoke('clear_autosave').catch(() => {});
  editor.focus();
});
btnOpen.addEventListener('click', openFile);
btnSave.addEventListener('click', () => doSave(false));
btnSaveAs.addEventListener('click', () => doSave(true));
btnTop.addEventListener('click', async () => {
  const on = await invoke('toggle_always_on_top');
  applyTopState(on);
});
btnRecent.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleRecent();
});
document.addEventListener('click', () => recentMenu.classList.add('hidden'));

btnFind.addEventListener('click', toggleFindbar);
document.getElementById('btn-find-close').addEventListener('click', toggleFindbar);
document.getElementById('btn-find-next').addEventListener('click', () => doFind(1));
document.getElementById('btn-find-prev').addEventListener('click', () => doFind(-1));
document.getElementById('btn-replace').addEventListener('click', doReplace);
document.getElementById('btn-replace-all').addEventListener('click', doReplaceAll);
findInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    doFind(e.shiftKey ? -1 : 1);
  }
  if (e.key === 'Escape') toggleFindbar();
});

btnTheme.addEventListener('click', () => {
  const dark = document.body.getAttribute('data-theme') !== 'dark';
  applyTheme(dark);
  localStorage.setItem('theme', dark ? 'dark' : 'light');
});
btnFontDec.addEventListener('click', () => changeFontSize(-2));
btnFontInc.addEventListener('click', () => changeFontSize(2));

document.getElementById('modal-save').addEventListener('click', () => {
  overlay.classList.add('hidden');
  if (closeResolver) closeResolver('save');
});
document.getElementById('modal-discard').addEventListener('click', () => {
  overlay.classList.add('hidden');
  if (closeResolver) closeResolver('discard');
});
document.getElementById('modal-cancel').addEventListener('click', () => {
  overlay.classList.add('hidden');
  if (closeResolver) closeResolver('cancel');
});

document.addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey;
  if (!mod) return;
  const key = e.key.toLowerCase();
  if (key === 's' && e.shiftKey) {
    e.preventDefault();
    doSave(true);
  } else if (key === 's') {
    e.preventDefault();
    doSave(false);
  } else if (key === 'o') {
    e.preventDefault();
    openFile();
  } else if (key === 'n') {
    e.preventDefault();
    btnNew.click();
  } else if (key === 't') {
    e.preventDefault();
    btnTop.click();
  } else if (key === 'f') {
    e.preventDefault();
    toggleFindbar();
  } else if (key === '=' || key === '+') {
    e.preventDefault();
    changeFontSize(2);
  } else if (key === '-') {
    e.preventDefault();
    changeFontSize(-2);
  }
});

// ---- Tauri 事件 ----
listen('close-requested', handleCloseRequest);
listen('file-dropped', (event) => {
  applyFileData(event.payload);
});

// ---- 初始化 ----
updateStatus();
updateLineNumbers();
updateTitle();
updateEnc();
refreshRecent();
invoke('get_always_on_top').then(applyTopState);

const savedTheme = localStorage.getItem('theme');
applyTheme(savedTheme === 'dark');
const savedFont = parseInt(localStorage.getItem('fontSize'), 10);
if (savedFont >= 12 && savedFont <= 32) applyFontSize(savedFont);

// 会话恢复：仅当编辑器为空时恢复上次自动保存的内容
invoke('load_autosave').then((content) => {
  if (content && editor.value === '') {
    editor.value = content;
    dirty = true;
    updateTitle();
    updateStatus();
    updateLineNumbers();
  }
});
