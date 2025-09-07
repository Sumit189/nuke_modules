const appHeader = document.getElementById('appHeader');
const cardHead = document.getElementById('cardHead');
const tbody = document.getElementById('tbody');
const pickRootBtn = document.getElementById('pickRoot');
const scanBtn = document.getElementById('scanBtn');
const scanLabel = document.getElementById('scanLabel');
const scanSpin = document.getElementById('scanSpin');
const deleteBtn = document.getElementById('deleteBtn');
const prepPnpmBtn = document.getElementById('prepPnpmBtn');
const selectAll = document.getElementById('selectAll');
const summary = document.getElementById('summary');
const selectionHint = document.getElementById('selectionHint');
const toasts = document.getElementById('toasts');
const topLoader = document.getElementById('topLoader');
const searchInput = document.getElementById('searchInput');
const cmdk = document.getElementById('cmdk');
const cmdkBtn = document.getElementById('cmdkBtn');
const cmdkInput = document.getElementById('cmdkInput');
const cmdkList = document.getElementById('cmdkList');

let rootHandle = null;
let items = [];
let scanning = false;
let query = '';

function measureHeader() {
  const h = appHeader.getBoundingClientRect().height + 16; // include top gap
  document.documentElement.style.setProperty('--header-h', h + 'px');
  const ch = cardHead.getBoundingClientRect().height;
  document.documentElement.style.setProperty('--card-head-h', ch + 'px');
}
window.addEventListener('load', measureHeader);
window.addEventListener('resize', measureHeader);

function showToast(msg, type = 'info') {
  const el = document.createElement('div'); el.className = `toast ${type}`; el.textContent = msg; toasts.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateY(6px)'; }, 2200);
  setTimeout(() => { el.remove(); }, 2600);
}

function prettyBytes(bytes) { const units = ['B','KB','MB','GB','TB']; let i = 0; let n = bytes; while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; } return `${n.toFixed(n >= 10 || i === 0 ? 0 : 1)} ${units[i]}`; }

async function estimateDirSize(handle) { let total = 0; const stack = [handle]; while (stack.length) { const h = stack.pop(); for await (const entry of h.values()) { if (entry.kind === 'file') { try { const f = await entry.getFile(); total += f.size; } catch {} } else if (entry.kind === 'directory') { stack.push(entry); } } } return total; }

async function* walk(handle, pathParts = []) {
  const skipDeepDirs = new Set(['.git', '.hg', '.cache', '.next', '.turbo', 'dist', 'build', 'out', 'coverage', 'target']);
  for await (const entry of handle.values()) {
    const currentParts = pathParts.concat([entry.name]);
    if (entry.kind === 'directory') {
      // Always yield node_modules but do not descend into it here
      if (entry.name === 'node_modules') {
        yield { pathParts: currentParts, handle: entry, isDir: true };
        continue;
      }
      // Skip descending into common heavy directories
      if (skipDeepDirs.has(entry.name)) {
        continue;
      }
      yield { pathParts: currentParts, handle: entry, isDir: true };
      yield* walk(entry, currentParts);
    } else {
      yield { pathParts: currentParts, handle: entry, isDir: false };
    }
  }
}

function partsToPath(parts) { return '/' + parts.join('/'); }

async function scanForNodeModules() {
  if (!rootHandle) return [];
  const seen = new Set();
  const candidates = [];
  for await (const node of walk(rootHandle)) {
    if (node.isDir && node.pathParts[node.pathParts.length - 1] === 'node_modules') {
      const projectParts = node.pathParts.slice(0, -1);
      const projectKey = partsToPath(projectParts);
      if (projectKey.includes('/node_modules/')) continue;
      if (seen.has(projectKey)) continue; seen.add(projectKey);
      candidates.push({ projectPath: projectKey, nodeModulesPath: partsToPath(node.pathParts), handle: node.handle });
    }
  }
  const results = [];
  let index = 0;
  const concurrency = Math.min(6, candidates.length || 1);
  async function worker() {
    while (index < candidates.length) {
      const i = index++; const c = candidates[i];
      const size = await estimateDirSize(c.handle);
      if (size > 0) {
        results.push({ projectPath: c.projectPath, nodeModulesPath: c.nodeModulesPath, handle: c.handle, sizeBytes: size, sizePretty: prettyBytes(size), selected: false });
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results.sort((a, b) => b.sizeBytes - a.sizeBytes);
}

function getVisibleItems() { if (!query) return items.map((x, i) => ({ ...x, index: i })); const q = query.toLowerCase(); return items.map((x, i) => ({ ...x, index: i })).filter(x => x.projectPath.toLowerCase().includes(q) || x.nodeModulesPath.toLowerCase().includes(q)); }

function updateSelectionHint() { const count = items.filter(x => x.selected).length; selectionHint.textContent = count ? `${count} selected` : ''; }

function renderSkeletonRows(n = 10) { tbody.innerHTML = ''; for (let i = 0; i < n; i++) { const tr = document.createElement('tr'); tr.className = 'skeleton-row'; tr.innerHTML = `
      <td></td>
      <td>
        <div class="skeleton" style="width: 46%; margin-bottom:6px"></div>
        <div class="skeleton" style="width: 70%;"></div>
      </td>
      <td>
        <div class="skeleton" style="width: 60%; margin-bottom:6px"></div>
        <div class="skeleton" style="width: 84%;"></div>
      </td>
      <td>
        <div class="skeleton" style="width: 36%; margin-left:auto"></div>
      </td>
    `; tbody.appendChild(tr); } }

function render() {
  tbody.innerHTML = '';
  let totalBytes = 0;
  const visible = getVisibleItems();
  if (visible.length === 0 && !scanning) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 4;
    td.className = 'empty-cell';
    td.innerHTML = `
      <div class="empty">
        <div class="icon">🔍</div>
        <div class="title">No results</div>
        <div class="sub">Click Scan to find node_modules in the selected root.</div>
      </div>
    `;
    tr.appendChild(td);
    tbody.appendChild(tr);
  } else {
    for (const it of visible) {
      totalBytes += it.sizeBytes || 0;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><input type="checkbox" data-idx="${it.index}" ${items[it.index].selected ? 'checked' : ''}></td>
        <td><code>${it.projectPath}</code></td>
        <td><code>${it.nodeModulesPath}</code></td>
        <td><span class="size-badge">${it.sizePretty}</span></td>
      `;
      tbody.appendChild(tr);
    }
  }
  const anySelected = items.some(x => x.selected);
  deleteBtn.disabled = !anySelected;
  prepPnpmBtn.disabled = !anySelected;
  updateSelectionHint();
  const suffix = query ? ` • filtered` : '';
  summary.textContent = visible.length ? `${visible.length} results • ${prettyBytes(totalBytes)}${suffix}` : 'Ready';
}

tbody.addEventListener('change', (e) => { const t = e.target; if (t && t.matches('input[type=checkbox][data-idx]')) { const i = Number(t.getAttribute('data-idx')); items[i].selected = t.checked; render(); } });

selectAll.addEventListener('change', () => { const v = selectAll.checked; items.forEach(it => it.selected = v); render(); });

function startTopLoader() { topLoader.style.transform = 'scaleX(.2)'; setTimeout(() => { topLoader.style.transform = 'scaleX(.6)'; }, 200); }
function endTopLoader() { topLoader.style.transform = 'scaleX(1)'; setTimeout(() => { topLoader.style.transform = 'scaleX(0)'; }, 350); }

function setScanLoading(isLoading) {
  if (isLoading) {
    scanning = true;
    scanBtn.classList.add('loading');
    scanBtn.setAttribute('aria-busy', 'true');
    scanSpin.style.display = 'inline-block';
    scanLabel.textContent = 'Scanning…';
  } else {
    scanning = false;
    scanBtn.classList.remove('loading');
    scanBtn.setAttribute('aria-busy', 'false');
    scanSpin.style.display = 'none';
    scanLabel.textContent = 'Scan';
  }
}

pickRootBtn.addEventListener('click', async () => { try { rootHandle = await window.showDirectoryPicker({ mode: 'readwrite' }); summary.textContent = 'Root selected'; showToast('Root folder selected', 'success'); measureHeader(); } catch (e) { if (e?.name !== 'AbortError') showToast('Folder selection failed', 'error'); } });

searchInput.addEventListener('input', () => { query = searchInput.value.trim(); render(); });

scanBtn.addEventListener('click', async () => {
  if (!rootHandle) { showToast('Please pick a root folder first', 'error'); pickRootBtn.focus(); return; }
  if (scanning) return;
  setScanLoading(true);
  deleteBtn.disabled = true; prepPnpmBtn.disabled = true; selectAll.checked = false;
  renderSkeletonRows(10); summary.textContent = 'Scanning…'; startTopLoader();
  try { items = await scanForNodeModules(); render(); showToast('Scan complete', 'success'); }
  catch (e) { showToast('Scan failed', 'error'); }
  finally { setScanLoading(false); endTopLoader(); }
});

deleteBtn.addEventListener('click', async () => {
  const targets = items.filter(x => x.selected);
  if (!targets.length) return;
  if (!confirm(`Delete ${targets.length} node_modules folders and package-lock.json?`)) return;
  deleteBtn.disabled = true;
  try {
    const failed = [];
    for (const t of targets) {
      const ok = await deleteNodeModulesByProjectPath(t.projectPath);
      if (!ok) failed.push(t.projectPath);
    }
    items = items.filter(x => !x.selected);
    render();
    if (failed.length) showToast(`Some deletions failed (${failed.length}). Check permissions.`, 'error');
    else showToast('Deleted node_modules and package-lock.json', 'success');
  } catch (e) { showToast('Delete failed', 'error'); }
  finally { deleteBtn.disabled = false; }
});

async function getProjectDirHandleByPathLike(pathStr) { const rel = pathStr.replace(/^\//, ''); const parts = rel.split('/').filter(Boolean); let dir = rootHandle; for (const part of parts) { dir = await dir.getDirectoryHandle(part, { create: false }); } return dir; }
async function readJsonFile(fileHandle) { const file = await fileHandle.getFile(); const text = await file.text(); try { return JSON.parse(text); } catch { return null; } }
async function writeTextFile(dirHandle, name, text) { const fh = await dirHandle.getFileHandle(name, { create: true }); const w = await fh.createWritable(); await w.write(text); await w.close(); }

// Deletion helpers
async function removeDirContents(dirHandle) {
  // Snapshot entries to avoid iterator invalidation while deleting
  let attempts = 0;
  while (attempts < 3) {
    const entries = [];
    for await (const entry of dirHandle.values()) entries.push(entry);
    if (entries.length === 0) return;
    for (const entry of entries) {
      if (entry.kind === 'directory') {
        try { await dirHandle.removeEntry(entry.name, { recursive: true }); continue; } catch {}
        try { const sub = await dirHandle.getDirectoryHandle(entry.name); await removeDirContents(sub); } catch {}
        try { await dirHandle.removeEntry(entry.name); } catch {}
      } else {
        try { await dirHandle.removeEntry(entry.name); } catch {}
      }
    }
    attempts++;
  }
}
async function deleteNodeModulesByProjectPath(projectPath) {
  try {
    const projectDir = await getProjectDirHandleByPathLike(projectPath);
    // Attempt recursive removal first
    try { await projectDir.removeEntry('node_modules', { recursive: true }); }
    catch {
      // Fallback: deep-clean contents then remove directory
      try {
        const nm = await projectDir.getDirectoryHandle('node_modules', { create: false });
        await removeDirContents(nm);
        try { await projectDir.removeEntry('node_modules'); } catch {}
        // Final retry with recursive in case of late writers/hidden dirs
        try { await projectDir.removeEntry('node_modules', { recursive: true }); } catch {}
      } catch {}
    }
    try { await projectDir.removeEntry('package-lock.json'); } catch {}
    return true;
  } catch (e) {
    return false;
  }
}

prepPnpmBtn.addEventListener('click', async () => {
  const targets = items.filter(x => x.selected);
  if (!targets.length) return;
  prepPnpmBtn.disabled = true;
  try {
    for (const t of targets) {
      const projectDir = await getProjectDirHandleByPathLike(t.projectPath);
      try { await projectDir.removeEntry('package-lock.json'); } catch {}
      try { await writeTextFile(projectDir, '.npmrc', 'shamefully-hoist=false\n'); } catch {}
      try { const pkgHandle = await projectDir.getFileHandle('package.json'); const pkg = await readJsonFile(pkgHandle); if (pkg) { const desired = pkg.packageManager?.startsWith('pnpm@') ? pkg.packageManager : 'pnpm@9'; if (pkg.packageManager !== desired) { pkg.packageManager = desired; await writeTextFile(projectDir, 'package.json', JSON.stringify(pkg, null, 2) + '\n'); } } } catch {}
    }
    showToast('Projects prepared for pnpm. Run pnpm import/install.', 'success');
  } catch (e) { showToast('Prepare failed', 'error'); }
  finally { prepPnpmBtn.disabled = false; }
});

function openCmdk() { cmdk.classList.add('open'); cmdkInput.value = ''; renderCmdk(''); setTimeout(() => cmdkInput.focus(), 0); }
function closeCmdk() { cmdk.classList.remove('open'); }
cmdkBtn.addEventListener('click', openCmdk);
cmdk.addEventListener('click', (e) => { if (e.target === cmdk) closeCmdk(); });

const commands = [
  { id: 'pick', label: 'Pick root folder', run: () => pickRootBtn.click() },
  { id: 'scan', label: 'Scan for node_modules', run: () => scanBtn.click() },
  { id: 'delete', label: 'Delete selected node_modules + package-lock.json', run: () => deleteBtn.click() },
  { id: 'prep', label: 'Prepare selected projects for pnpm', run: () => prepPnpmBtn.click() },
  { id: 'focus-search', label: 'Focus search', run: () => { searchInput.focus(); } },
];

function renderCmdk(q) { cmdkList.innerHTML = ''; const ql = q.trim().toLowerCase(); const list = !ql ? commands : commands.filter(c => c.label.toLowerCase().includes(ql)); list.forEach((c, i) => { const el = document.createElement('div'); el.className = 'cmdk-item'; el.tabIndex = 0; el.textContent = c.label; el.dataset.index = String(i); el.addEventListener('click', () => { c.run(); closeCmdk(); }); el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { c.run(); closeCmdk(); } }); cmdkList.appendChild(el); }); }
cmdkInput.addEventListener('input', () => renderCmdk(cmdkInput.value));

document.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openCmdk(); return; } if (e.key === '/' && document.activeElement !== searchInput && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') { e.preventDefault(); searchInput.focus(); return; } if (e.key === 'Escape' && cmdk.classList.contains('open')) { closeCmdk(); return; } });



// PWA service worker registration
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
