import Papa from 'papaparse';

// --- CONFIG ---
const API_BASE = '/api/assets';

// --- SVGs for Theme ---
const SVGS = {
    light: `<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor"><path d="M480-360q50 0 85-35t35-85q0-50-35-85t-85-35q-50 0-85 35t-35 85q0 50 35 85t85 35Zm0 80q-83 0-141.5-58.5T280-480q0-83 58.5-141.5T480-680q83 0 141.5 58.5T680-480q0 83-58.5 141.5T480-280ZM200-440H40v-80h160v80Zm720 0H760v-80h160v80ZM440-760v-160h80v160h-80Zm0 720v-160h80v160h-80ZM256-650l-101-97 57-59 96 100-52 56Zm492 496-97-101 53-55 101 97-57 59Zm-98-550 97-101 59 57-100 96-56-52ZM154-212l101-97 55 53-97 101-59-57Zm326-268Z"/></svg>`,
    dark: `<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor"><path d="M480-120q-150 0-255-105T120-480q0-150 105-255t255-105q14 0 27.5 1t26.5 3q-41 29-65.5 75.5T444-660q0 90 63 153t153 63q55 0 101-24.5t75-65.5q2 13 3 26.5t1 27.5q0 150-105 255T480-120Zm0-80q88 0 158-48.5T740-375q-20 5-40 8t-40 3q-123 0-209.5-86.5T364-660q0-20 3-40t8-40q-78 32-126.5 102T200-480q0 116 82 198t198 82Zm-10-270Z"/></svg>`
};

// --- STATE ---
const appDiv = document.getElementById('app');
let currentHeaders = [];

// --- INIT ---
async function init() {
    try {
        const res = await fetch('/api/features');
        if (res.ok) {
            const features = await res.json();
            if (!features.includes('admin_assets')) {
                appDiv.innerHTML = `
                    <div class="empty-state">
                        <svg xmlns="http://www.w3.org/2000/svg" height="48px" viewBox="0 -960 960 960" width="48px" fill="currentColor" opacity="0.5"><path d="M240-80q-33 0-56.5-23.5T160-160v-640q0-33 23.5-56.5T240-880h320l240 240v480q0 33-23.5 56.5T760-80H240Zm280-520v-200H240v640h480v-440H520ZM240-800v200-200 640-640Z"/></svg>
                        <h2>Enterprise Feature Required</h2>
                        <p>This application requires the <strong>admin_assets</strong> enterprise feature.</p>
                    </div>
                `;
                return;
            }
        }
    } catch (e) {
        console.error('Failed to fetch features:', e);
    }
    setupThemeToggle();
    window.addEventListener('hashchange', handleRoute);
    handleRoute();
}

function setupThemeToggle() {
    const html = document.documentElement;
    const themeBtn = document.getElementById('theme-btn');
    const themeIcon = document.getElementById('theme-icon');
    
    const savedTheme = localStorage.getItem('theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    html.setAttribute('data-theme', savedTheme);
    themeIcon.innerHTML = savedTheme === 'dark' ? SVGS.light : SVGS.dark;

    themeBtn.addEventListener('click', () => {
        const isDark = html.getAttribute('data-theme') === 'dark';
        const next = isDark ? 'light' : 'dark';
        html.setAttribute('data-theme', next);
        themeIcon.innerHTML = next === 'dark' ? SVGS.light : SVGS.dark;
        localStorage.setItem('theme', next);
    });
}

// --- ROUTING ---
async function handleRoute() {
    const hash = window.location.hash.slice(1) || '/';
    if (hash.startsWith('/edit/')) {
        const filename = decodeURIComponent(hash.replace('/edit/', ''));
        await renderEditor(filename);
    } else {
        await renderList();
    }
}

// --- NOTIFICATIONS ---
function showNotification(message, type = 'is-info') {
    let container = document.querySelector('.notification-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'notification-container';
        document.body.appendChild(container);
    }
    const notif = document.createElement('div');
    notif.className = `notification ${type}`;
    notif.innerHTML = `<span>${message}</span> <button class="button is-small" style="padding: 0 5px; border:none; background:transparent;">&times;</button>`;
    
    container.appendChild(notif);
    notif.querySelector('button').onclick = () => notif.remove();
    setTimeout(() => notif.remove(), 4000);
}

// --- BUILD PROGRESS ---
let buildEventSource = null;

function showBuildProgress() {
    let modal = document.getElementById('buildProgressModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'buildProgressModal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <h3>Building Graph...</h3>
                <div id="buildLogs" class="build-logs"></div>
                <div class="btn-group">
                    <button type="button" class="button is-primary" id="buildCloseBtn" disabled>Building...</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        document.getElementById('buildCloseBtn').onclick = () => modal.classList.remove('active');
    }
    
    const logsEl = document.getElementById('buildLogs');
    logsEl.innerHTML = '';
    const closeBtn = document.getElementById('buildCloseBtn');
    closeBtn.disabled = true;
    closeBtn.textContent = 'Building...';
    modal.classList.add('active');

    if (buildEventSource) buildEventSource.close();
    buildEventSource = new EventSource('/api/build/stream');
    buildEventSource.onmessage = function(event) {
        const msg = event.data;
        if (msg === 'BUILD_COMPLETE') {
            buildEventSource.close();
            closeBtn.disabled = false;
            closeBtn.textContent = 'Close';
            showNotification('New graph is available!', 'is-success');
        } else {
            logsEl.appendChild(document.createTextNode(msg + '\n'));
            logsEl.scrollTop = logsEl.scrollHeight;
        }
    };
    buildEventSource.onerror = function() {
        buildEventSource.close();
        closeBtn.disabled = false;
        closeBtn.textContent = 'Close (Error)';
    };
}

// --- VIEWS ---
async function renderList() {
    appDiv.innerHTML = `
        <div class="overview-header">
            <div class="overview-title">
                <h2>Asset Files</h2>
                <p>Loading assets...</p>
            </div>
        </div>
    `;
    let files = [];
    
    try {
        const res = await fetch(`${API_BASE}/`);
        if (res.ok) {
            const data = await res.json();
            // Fallback parsing if the API returns an object or an array
            files = Array.isArray(data) ? data : (data.assets || Object.keys(data) || []);
        } else {
            throw new Error(res.statusText);
        }
    } catch (e) {
        showNotification(`Failed to load assets: ${e.message}`, 'is-danger');
        showBuildProgress();
        console.warn('Fallback to empty / dummy list');
        files = [];
    }

    appDiv.innerHTML = `
        <div class="overview-header">
            <div class="overview-title">
                <h2>Asset Files</h2>
                <p>Manage and edit your asset CSV files</p>
            </div>
            <button class="button is-primary" onclick="window.location.hash='#/edit/new_asset.csv'">
                <svg xmlns="http://www.w3.org/2000/svg" height="18px" viewBox="0 -960 960 960" width="18px" fill="currentColor"><path d="M440-440H200v-80h240v-240h80v240h240v80H520v240h-80v-240Z"/></svg>
                New Asset
            </button>
        </div>
        ${files.length === 0 ? `
            <div class="empty-state">
                <svg xmlns="http://www.w3.org/2000/svg" height="48px" viewBox="0 -960 960 960" width="48px" fill="currentColor" opacity="0.5"><path d="M260-160q-42 0-71-29t-29-71v-440q0-42 29-71t71-29h280l240 240v300q0 42-29 71t-71 29H260Zm240-360v-200H260v440h520v-240H500ZM260-720v200-200 440-440Z"/></svg>
                <p>No assets found.</p>
                <button class="button" onclick="window.location.hash='#/edit/new_asset.csv'">Create your first asset</button>
            </div>
        ` : `
            <div class="listing">
                ${files.map(f => `
                    <a href="#/edit/${encodeURIComponent(f)}" class="card">
                        <div class="card-icon">
                            <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor"><path d="M280-280h400v-80H280v80Zm0-160h400v-80H280v80Zm0-160h400v-80H280v80Zm-80 480q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm0-80h560v-560H200v560Zm0-560v560-560Z"/></svg>
                        </div>
                        <div class="card-content">
                            <div class="card-title">${f}</div>
                            <div class="card-desc">CSV Document</div>
                        </div>
                        <div class="card-arrow">
                            <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor"><path d="M504-480 320-664l56-56 240 240-240 240-56-56 184-184Z"/></svg>
                        </div>
                    </a>
                `).join('')}
            </div>
        `}
    `;
}

async function renderEditor(filename) {
    appDiv.innerHTML = `<p>Loading ${filename}...</p>`;
    let csvText = '';
    let isNewFile = true;

    try {
        const res = await fetch(`${API_BASE}/${encodeURIComponent(filename)}`);
        if (res.ok) {
            csvText = await res.text();
            isNewFile = false;
        } else if (res.status !== 404) {
            throw new Error(res.statusText);
        }
    } catch (e) {
        showNotification(`API Error: ${e.message}`, 'is-danger');
    }

    if (isNewFile && !csvText) csvText = 'name\n'; // Default new file state

    appDiv.innerHTML = `
        <div class="editor-toolbar">
            <div class="editor-toolbar-group">
                <a href="#/" class="button" title="Back to Inventory">
                    <svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 -960 960 960" width="20px" fill="currentColor"><path d="M400-80 0-480l400-400 71 71-329 329 329 329-71 71Z"/></svg>
                </a>
                <h2 style="margin: 0; border: none; font-size: 1.1rem; padding-bottom: 0; padding-left: 0.5rem;">${filename}</h2>
            </div>
            <div class="editor-toolbar-group">
                <button id="add-col-btn" class="button">
                    <svg xmlns="http://www.w3.org/2000/svg" height="18px" viewBox="0 -960 960 960" width="18px" fill="currentColor"><path d="M440-440H200v-80h240v-240h80v240h240v80H520v240h-80v-240Z"/></svg>
                    Column
                </button>
                <button id="add-row-btn" class="button">
                    <svg xmlns="http://www.w3.org/2000/svg" height="18px" viewBox="0 -960 960 960" width="18px" fill="currentColor"><path d="M440-440H200v-80h240v-240h80v240h240v80H520v240h-80v-240Z"/></svg>
                    Row
                </button>
                <div class="toolbar-divider"></div>
                <input type="file" id="file-upload" accept=".csv" style="display:none;" />
                <button id="upload-btn" class="button" title="Upload & Replace CSV">
                    <svg xmlns="http://www.w3.org/2000/svg" height="18px" viewBox="0 -960 960 960" width="18px" fill="currentColor"><path d="M440-320v-326L336-542l-56-58 200-200 200 200-56 58-104-104v326h-80ZM240-160q-33 0-56.5-23.5T160-240v-120h80v120h480v-120h80v120q0 33-23.5 56.5T720-160H240Z"/></svg>
                </button>
                <button id="download-btn" class="button" title="Download CSV">
                    <svg xmlns="http://www.w3.org/2000/svg" height="18px" viewBox="0 -960 960 960" width="18px" fill="currentColor"><path d="M480-320 280-520l56-58 104 104v-326h80v326l104-104 56 58-200 200ZM240-160q-33 0-56.5-23.5T160-240v-120h80v120h480v-120h80v120q0 33-23.5 56.5T720-160H240Z"/></svg>
                </button>
                <button id="save-btn" class="button is-primary">
                    <svg xmlns="http://www.w3.org/2000/svg" height="18px" viewBox="0 -960 960 960" width="18px" fill="currentColor"><path d="M840-680v480q0 33-23.5 56.5T760-120H200q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h480l160 160Zm-80 34L646-760H200v560h560v-446ZM480-240q50 0 85-35t35-85q0-50-35-85t-85-35q-50 0-85 35t-35 85q0 50 35 85t85 35ZM240-560h360v-160H240v160Zm-40-86v446-560 114Z"/></svg>
                    Save
                </button>
            </div>
        </div>
        <div class="table-container" id="table-wrapper">
            <div id="drop-zone" class="drop-zone-overlay is-hidden">Drop CSV Here to Replace</div>
            <table class="table" id="csv-table">
                <thead id="csv-head"></thead>
                <tbody id="csv-body"></tbody>
            </table>
        </div>
    `;

    // Parse and build table
    const parsed = Papa.parse(csvText, { skipEmptyLines: 'greedy', header: false });
    buildTable(parsed.data);

    // Bind specific events
    document.getElementById('add-col-btn').onclick = addColumn;
    document.getElementById('add-row-btn').onclick = addRow;
    document.getElementById('save-btn').onclick = () => saveFile(filename);
    document.getElementById('download-btn').onclick = () => downloadCSV(filename);
    
    const fileUpload = document.getElementById('file-upload');
    document.getElementById('upload-btn').onclick = () => fileUpload.click();
    fileUpload.onchange = (e) => handleFileUpload(e.target.files[0]);

    setupDragAndDrop();
}

// --- CSV TABLE LOGIC ---
function buildTable(data) {
    const thead = document.getElementById('csv-head');
    const tbody = document.getElementById('csv-body');
    thead.innerHTML = '';
    tbody.innerHTML = '';

    if (!data || data.length === 0) data = [['name']];
    
    currentHeaders = (data[0] || []).map(h => h?.trim() || '');
    const rows = data.slice(1);

    // Header row
    const trHead = document.createElement('tr');
    currentHeaders.forEach((h, i) => trHead.appendChild(createHeaderCell(h, i)));
    const actionTh = document.createElement('th'); // For row delete buttons
    actionTh.className = 'action-cell';
    trHead.appendChild(actionTh);
    thead.appendChild(trHead);

    // Data rows
    rows.forEach(r => appendRow(r));
}

function createHeaderCell(value, colIndex) {
    const th = document.createElement('th');
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'input';
    input.value = value;
    
    const rmBtn = document.createElement('button');
    rmBtn.className = 'remove-col-btn';
    rmBtn.title = 'Remove Column';
    rmBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" height="16px" viewBox="0 -960 960 960" width="16px" fill="currentColor"><path d="M280-120q-33 0-56.5-23.5T200-200v-520h-40v-80h200v-40h240v40h200v80h-40v520q0 33-23.5 56.5T680-120H280Zm400-600H280v520h400v-520ZM360-280h80v-360h-80v360Zm160 0h80v-360h-80v360ZM280-720v520-520Z"/></svg>';
    rmBtn.onclick = () => removeColumn(colIndex);

    th.appendChild(input);
    th.appendChild(rmBtn);
    return th;
}

function appendRow(rowData = []) {
    const tbody = document.getElementById('csv-body');
    const tr = document.createElement('tr');

    currentHeaders.forEach((_, i) => {
        const td = document.createElement('td');
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'input';
        input.value = rowData[i] || '';
        td.appendChild(input);
        tr.appendChild(td);
    });

    const tdAction = document.createElement('td');
    tdAction.className = 'action-cell';
    const rmBtn = document.createElement('button');
    rmBtn.className = 'remove-row-btn';
    rmBtn.title = 'Remove Row';
    rmBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" height="16px" viewBox="0 -960 960 960" width="16px" fill="currentColor"><path d="M280-120q-33 0-56.5-23.5T200-200v-520h-40v-80h200v-40h240v40h200v80h-40v520q0 33-23.5 56.5T680-120H280Zm400-600H280v520h400v-520ZM360-280h80v-360h-80v360Zm160 0h80v-360h-80v360ZM280-720v520-520Z"/></svg>';
    rmBtn.onclick = () => tr.remove();
    
    tdAction.appendChild(rmBtn);
    tr.appendChild(tdAction);
    tbody.appendChild(tr);
}

function addColumn() {
    const colName = `new_column_${currentHeaders.length + 1}`;
    currentHeaders.push(colName);
    
    const trHead = document.querySelector('#csv-head tr');
    trHead.insertBefore(createHeaderCell(colName, currentHeaders.length - 1), trHead.lastElementChild);

    document.querySelectorAll('#csv-body tr').forEach(tr => {
        const td = document.createElement('td');
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'input';
        td.appendChild(input);
        tr.insertBefore(td, tr.lastElementChild);
    });
}

function removeColumn(colIndex) {
    const data = getTableData();
    const newData = data.map(row => { row.splice(colIndex, 1); return row; });
    buildTable(newData);
}

function addRow() {
    if (currentHeaders.length === 0) return showNotification('Add a column first', 'is-danger');
    appendRow(Array(currentHeaders.length).fill(''));
}

function getTableData() {
    const data = [];
    const hInputs = document.querySelectorAll('#csv-head th input');
    const headers = Array.from(hInputs).map(inp => inputVal(inp));
    if (headers.length === 0) return [];
    data.push(headers);

    document.querySelectorAll('#csv-body tr').forEach(tr => {
        const rowData = [];
        const tInputs = tr.querySelectorAll('td input');
        headers.forEach((_, i) => rowData.push(inputVal(tInputs[i])));
        data.push(rowData);
    });
    return data;
}

function inputVal(inp) { return inp ? inp.value : ''; }

async function saveFile(filename) {
    const data = getTableData();
    if (!data || data.length === 0) return showNotification('No data to save', 'is-danger');
    
    const csvString = Papa.unparse(data);
    const saveBtn = document.getElementById('save-btn');
    const originalHtml = saveBtn.innerHTML;
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" height="18px" viewBox="0 -960 960 960" width="18px" fill="currentColor"><path d="M480-80q-82 0-155-31.5t-127.5-86Q143-252 111.5-325T80-480q0-83 31.5-155.5t86-127Q252-817 325-848.5T480-880q17 0 28.5 11.5T520-840q0 17-11.5 28.5T480-800q-133 0-226.5 93.5T160-480q0 133 93.5 226.5T480-160q133 0 226.5-93.5T800-480q0-17 11.5-28.5T840-520q17 0 28.5 11.5T880-480q0 82-31.5 155t-86 127.5q-54.5 54.5-127 86T480-80Z"/></svg> Saving...';

    try {
        const formData = new FormData();
        formData.append('data', csvString);

        const res = await fetch(`${API_BASE}/${encodeURIComponent(filename)}`, {
            method: 'POST',
            body: formData
        });
        
        if (!res.ok) throw new Error(res.statusText);
        showNotification('File saved successfully', 'is-success');
        showBuildProgress();
    } catch (e) {
        showNotification(`Save failed: ${e.message}`, 'is-danger');
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = originalHtml;
    }
}

function downloadCSV(filename) {
    const data = getTableData();
    if (!data || data.length === 0) return;
    const csvString = Papa.unparse(data);
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename || 'download.csv';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function handleFileUpload(file) {
    if (!file) return;
    Papa.parse(file, {
        skipEmptyLines: 'greedy',
        complete: (results) => {
            if (results.errors.length) return showNotification(`Parse Error: ${results.errors[0].message}`, 'is-danger');
            buildTable(results.data);
            showNotification('File loaded. Click Save to persist.', 'is-success');
        }
    });
}

function setupDragAndDrop() {
    const wrapper = document.getElementById('table-wrapper');
    const overlay = document.getElementById('drop-zone');

    wrapper.ondragover = wrapper.ondragenter = (e) => {
        e.preventDefault();
        overlay.classList.remove('is-hidden');
    };
    wrapper.ondragleave = (e) => {
        e.preventDefault();
        if (!wrapper.contains(e.relatedTarget)) overlay.classList.add('is-hidden');
    };
    wrapper.ondrop = (e) => {
        e.preventDefault();
        overlay.classList.add('is-hidden');
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleFileUpload(e.dataTransfer.files[0]);
        }
    };
}

// Start application
init();
