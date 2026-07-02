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
let currentFilename = '';
let enginePollingInterval = null;

async function checkPublishingState() {
    try {
        const res = await fetch('/api/engine-info');
        if (res.ok) {
            const data = await res.json();
            const banner = document.getElementById('publishingBanner');
            const wasPublishing = sessionStorage.getItem('app_is_publishing') === 'true';

            if (data.is_publishing) {
                if (banner) banner.classList.remove('is-hidden');
                sessionStorage.setItem('app_is_publishing', 'true');
            } else {
                if (banner) banner.classList.add('is-hidden');
                sessionStorage.setItem('app_is_publishing', 'false');
                if (wasPublishing) {
                    showNotification('Enterprise graph successfully updated', 'is-success');
                    await handleRoute();
                }
            }
        }
    } catch (e) {
        console.warn('Failed to check publishing state', e);
    }
}

// --- INIT ---
async function init() {
    if (!enginePollingInterval) {
        enginePollingInterval = setInterval(checkPublishingState, 5000);
        checkPublishingState();
    }
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
    buildEventSource.onmessage = async function(event) {
        const msg = event.data;
        if (msg === 'BUILD_COMPLETE') {
            buildEventSource.close();
            closeBtn.disabled = false;
            closeBtn.textContent = 'Close';
            showNotification('Changes saved locally. Build complete.', 'is-success');
            await checkPublishingState();
            await handleRoute();
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

// --- Overview State ---
let overviewSearchTerm = '';
let overviewSortDir = 'asc';
let overviewViewMode = localStorage.getItem('overviewViewMode') || 'list';
let overviewFiles = [];
let overviewRowCounts = {};

// --- NAV RENDERING ---
function renderNavOverview() {
    const container = document.getElementById('nav-controls');
    if (!container) return;
    container.innerHTML = `
        <div class="nav-info">
            <h2>Asset Files</h2>
            <span class="nav-subtitle">${overviewFiles.length} file${overviewFiles.length !== 1 ? 's' : ''}</span>
        </div>
        <div class="nav-actions">
            <div class="search-wrap">
                <span class="search-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" height="14px" viewBox="0 -960 960 960" width="14px" fill="currentColor"><path d="M796-126 532-390q-30 24-69 37t-83 13q-109 0-184.5-75.5T120-600q0-109 75.5-184.5T380-860q109 0 184.5 75.5T640-600q0 44-13 83t-37 69l264 264-58 58ZM380-400q83 0 141.5-58.5T580-600q0-83-58.5-141.5T380-800q-83 0-141.5 58.5T180-600q0 83 58.5 141.5T380-400Z"/></svg>
                </span>
                <input type="text" class="search-input" id="searchInput" placeholder="Filter..." value="${overviewSearchTerm}" spellcheck="false">
            </div>
            <button class="button is-ghost${overviewViewMode === 'list' ? ' is-active' : ''}" id="viewToggleBtn" title="Toggle list/grid view">
                <svg xmlns="http://www.w3.org/2000/svg" height="16px" viewBox="0 -960 960 960" width="16px" fill="currentColor"><path d="M80-200v-160h160v160H80Zm0-200v-160h160v160H80Zm0-200v-160h160v160H80Zm200 400v-160h600v160H280Zm0-200v-160h600v160H280Zm0-200v-160h600v160H280Z"/></svg>
                ${overviewViewMode === 'list' ? 'Grid' : 'List'}
            </button>
            <button class="button is-ghost" id="sortBtn" title="Toggle sort order">
                <svg xmlns="http://www.w3.org/2000/svg" height="16px" viewBox="0 -960 960 960" width="16px" fill="currentColor"><path d="M400-240v-80h160v80H400Zm0-200v-80h320v80H400Zm0-200v-80h480v80H400ZM240-160 80-320l56-56 64 62v-486h80v486l64-62 56 56-160 160Z"/></svg>
                <span id="sortLabel">${overviewSortDir === 'asc' ? 'A-Z' : 'Z-A'}</span>
            </button>
            <button class="button is-ghost" id="refreshBtn" title="Refresh list">
                <svg xmlns="http://www.w3.org/2000/svg" height="16px" viewBox="0 -960 960 960" width="16px" fill="currentColor"><path d="M480-160q-134 0-227-93t-93-227q0-134 93-227t227-93q69 0 132 28.5T720-690v-110h80v280H520v-80h168q-32-56-87.5-88T480-720q-100 0-170 70t-70 170q0 100 70 170t170 70q77 0 139-43.5T691-340h83q-33 117-129 188.5T480-160Z"/></svg>
            </button>
            <button class="button is-primary" onclick="window.location.hash='#/edit/new_asset.csv'">
                <svg xmlns="http://www.w3.org/2000/svg" height="16px" viewBox="0 -960 960 960" width="16px" fill="currentColor"><path d="M440-440H200v-80h240v-240h80v240h240v80H520v240h-80v-240Z"/></svg>
                New
            </button>
        </div>
    `;
}

function renderNavEditor(filename) {
    const container = document.getElementById('nav-controls');
    if (!container) return;
    container.innerHTML = `
        <div class="nav-info">
            <a href="#/" class="button" title="Back to Inventory">
                <svg xmlns="http://www.w3.org/2000/svg" height="18px" viewBox="0 -960 960 960" width="18px" fill="currentColor"><path d="M400-80 0-480l400-400 71 71-329 329 329 329-71 71Z"/></svg>
            </a>
            <h2 title="${filename}">${filename}</h2>
            <span class="cell-ref" id="cellRef"></span>
        </div>
        <div class="nav-actions">
            <button id="add-col-btn" class="button" title="Add Column">
                <svg xmlns="http://www.w3.org/2000/svg" height="16px" viewBox="0 -960 960 960" width="16px" fill="currentColor"><path d="M440-440H200v-80h240v-240h80v240h240v80H520v240h-80v-240Z"/></svg>
                Column
            </button>
            <button id="add-row-btn" class="button" title="Add Row">
                <svg xmlns="http://www.w3.org/2000/svg" height="16px" viewBox="0 -960 960 960" width="16px" fill="currentColor"><path d="M440-440H200v-80h240v-240h80v240h240v80H520v240h-80v-240Z"/></svg>
                Row
            </button>
            <div class="toolbar-divider"></div>
            <input type="file" id="file-upload" accept=".csv" style="display:none;" />
            <button id="upload-btn" class="button" title="Upload & Replace CSV">
                <svg xmlns="http://www.w3.org/2000/svg" height="16px" viewBox="0 -960 960 960" width="16px" fill="currentColor"><path d="M440-320v-326L336-542l-56-58 200-200 200 200-56 58-104-104v326h-80ZM240-160q-33 0-56.5-23.5T160-240v-120h80v120h480v-120h80v120q0 33-23.5 56.5T720-160H240Z"/></svg>
            </button>
            <button id="download-btn" class="button" title="Download CSV">
                <svg xmlns="http://www.w3.org/2000/svg" height="16px" viewBox="0 -960 960 960" width="16px" fill="currentColor"><path d="M480-320 280-520l56-58 104 104v-326h80v326l104-104 56 58-200 200ZM240-160q-33 0-56.5-23.5T160-240v-120h80v120h480v-120h80v120q0 33-23.5 56.5T720-160H240Z"/></svg>
            </button>
            <button id="save-btn" class="button is-primary">
                <svg xmlns="http://www.w3.org/2000/svg" height="16px" viewBox="0 -960 960 960" width="16px" fill="currentColor"><path d="M840-680v480q0 33-23.5 56.5T760-120H200q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h480l160 160Zm-80 34L646-760H200v560h560v-446ZM480-240q50 0 85-35t35-85q0-50-35-85t-85-35q-50 0-85 35t-35 85q0 50 35 85t85 35ZM240-560h360v-160H240v160Zm-40-86v446-560 114Z"/></svg>
                Save
            </button>
        </div>
    `;
}

// --- VIEWS ---
async function renderList() {
    appDiv.innerHTML = `
        <div class="listing" id="listingGrid">
            ${Array(6).fill(`
                <div class="card is-skeleton">
                    <div class="card-icon skeleton-pulse"></div>
                    <div class="card-content">
                        <div class="skeleton-pulse" style="height:16px;width:65%;margin-bottom:8px"></div>
                        <div class="skeleton-pulse" style="height:12px;width:40%"></div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;

    overviewFiles = [];
    try {
        const res = await fetch(`${API_BASE}/`);
        if (res.ok) {
            const data = await res.json();
            overviewFiles = Array.isArray(data) ? data : (data.assets || Object.keys(data) || []);
        } else {
            throw new Error(res.statusText);
        }
    } catch (e) {
        showNotification(`Failed to load assets: ${e.message}`, 'is-danger');
        showBuildProgress();
        overviewFiles = [];
    }

    renderNavOverview();

    const listHtml = overviewViewMode === 'list'
        ? '<div class="list-view" id="overviewList"></div>'
        : '<div class="listing" id="listingGrid"></div>';

    appDiv.innerHTML = overviewFiles.length === 0 ? (
        '<div class="empty-state">' +
            '<svg xmlns="http://www.w3.org/2000/svg" height="56px" viewBox="0 -960 960 960" width="56px" fill="currentColor" opacity="0.35"><path d="M260-160q-42 0-71-29t-29-71v-440q0-42 29-71t71-29h280l240 240v300q0 42-29 71t-71 29H260Zm280-520v-120H260v440h520v-320H540ZM260-800v120-120 440-440Z"/></svg>' +
            '<h3 style="margin:0;border:none;padding:0;font-size:1.3rem">No Asset Files Yet</h3>' +
            '<p>Create your first CSV asset file to get started.</p>' +
            '<button class="button is-primary" onclick="window.location.hash=\'#/edit/new_asset.csv\'">' +
                '<svg xmlns="http://www.w3.org/2000/svg" height="18px" viewBox="0 -960 960 960" width="18px" fill="currentColor"><path d="M440-440H200v-80h240v-240h80v240h240v80H520v240h-80v-240Z"/></svg>' +
                ' Create New Asset' +
            '</button>' +
        '</div>'
    ) : (
        '<div id="assetList">' + listHtml + '</div>'
    );

    if (overviewFiles.length > 0) {
        renderOverviewItems();
        document.getElementById('searchInput').addEventListener('input', (e) => {
            overviewSearchTerm = e.target.value;
            renderOverviewItems();
        });
        document.getElementById('sortBtn').addEventListener('click', () => {
            overviewSortDir = overviewSortDir === 'asc' ? 'desc' : 'asc';
            renderOverviewItems();
        });
        document.getElementById('refreshBtn').addEventListener('click', async () => {
            document.getElementById('refreshBtn').innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" height="18px" viewBox="0 -960 960 960" width="18px" fill="currentColor" style="animation:spin 1s linear infinite"><path d="M480-160q-134 0-227-93t-93-227q0-134 93-227t227-93q69 0 132 28.5T720-690v-110h80v280H520v-80h168q-32-56-87.5-88T480-720q-100 0-170 70t-70 170q0 100 70 170t170 70q77 0 139-43.5T691-340h83q-33 117-129 188.5T480-160Z"/></svg>
            `;
            await renderList();
        });
        document.getElementById('viewToggleBtn').addEventListener('click', () => {
            overviewViewMode = overviewViewMode === 'grid' ? 'list' : 'grid';
            localStorage.setItem('overviewViewMode', overviewViewMode);
            renderOverviewItems();
        });
        fetchAllRowCounts();
    }
}

function renderOverviewItems() {
    const term = overviewSearchTerm.toLowerCase();
    const sorted = [...overviewFiles]
        .filter(f => f.toLowerCase().includes(term))
        .sort((a, b) => {
            const cmp = a.localeCompare(b);
            return overviewSortDir === 'asc' ? cmp : -cmp;
        });

    const sortLabel = document.getElementById('sortLabel');
    if (sortLabel) sortLabel.textContent = overviewSortDir === 'asc' ? 'A-Z' : 'Z-A';

    const assetList = document.getElementById('assetList');
    if (!assetList) return;

    if (sorted.length === 0) {
        assetList.innerHTML = `
            <div class="no-results">
                <svg xmlns="http://www.w3.org/2000/svg" height="32px" viewBox="0 -960 960 960" width="32px" fill="currentColor" opacity="0.4"><path d="M796-126 532-390q-30 24-69 37t-83 13q-109 0-184.5-75.5T120-600q0-109 75.5-184.5T380-860q109 0 184.5 75.5T640-600q0 44-13 83t-37 69l264 264-58 58ZM380-400q83 0 141.5-58.5T580-600q0-83-58.5-141.5T380-800q-83 0-141.5 58.5T180-600q0 83 58.5 141.5T380-400Z"/></svg>
                <p>No assets matching "<strong>${overviewSearchTerm}</strong>"</p>
            </div>
        `;
        return;
    }

    const viewToggle = document.getElementById('viewToggleBtn');
    if (viewToggle) {
        const isList = overviewViewMode === 'list';
        viewToggle.classList.toggle('is-active', isList);
        viewToggle.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" height="16px" viewBox="0 -960 960 960" width="16px" fill="currentColor"><path d="M80-200v-160h160v160H80Zm0-200v-160h160v160H80Zm0-200v-160h160v160H80Zm200 400v-160h600v160H280Zm0-200v-160h600v160H280Zm0-200v-160h600v160H280Z"/></svg>
            ${isList ? 'Grid' : 'List'}
        `;
    }

    if (overviewViewMode === 'list') {
        renderListView(sorted);
    } else {
        renderGridCards(sorted);
    }
}

function renderGridCards(sorted) {
    const assetList = document.getElementById('assetList');
    if (!assetList) return;

    const grid = document.createElement('div');
    grid.className = 'listing';
    grid.id = 'listingGrid';

    grid.innerHTML = sorted.map(f => {
        const cached = overviewRowCounts[f] || '';
        return `
        <a href="#/edit/${encodeURIComponent(f)}" class="card">
            <div class="card-icon">
                <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor"><path d="M280-280h400v-80H280v80Zm0-160h400v-80H280v80Zm0-160h400v-80H280v80Zm-80 480q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm0-80h560v-560H200v560Zm0-560v560-560Z"/></svg>
            </div>
            <div class="card-content">
                <div class="card-title" title="${f}">${f}</div>
                <div class="card-desc">
                    CSV Document
                    <span class="card-badge" data-file="${f}">${cached}</span>
                </div>
            </div>
            <div class="card-actions-overlay">
                <span class="card-dl-btn" data-file="${f}" title="Download ${f}">
                    <svg xmlns="http://www.w3.org/2000/svg" height="16px" viewBox="0 -960 960 960" width="16px" fill="currentColor"><path d="M480-320 280-520l56-58 104 104v-326h80v326l104-104 56 58-200 200ZM240-160q-33 0-56.5-23.5T160-240v-120h80v120h480v-120h80v120q0 33-23.5 56.5T720-160H240Z"/></svg>
                </span>
            </div>
            <div class="card-arrow">
                <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor"><path d="M504-480 320-664l56-56 240 240-240 240-56-56 184-184Z"/></svg>
            </div>
        </a>`;
    }).join('');

    assetList.innerHTML = '';
    assetList.appendChild(grid);

    grid.querySelectorAll('.card-dl-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            downloadFileFromList(btn.dataset.file);
        });
    });
}

function renderListView(sorted) {
    const assetList = document.getElementById('assetList');
    if (!assetList) return;

    const list = document.createElement('div');
    list.className = 'list-view';
    list.id = 'overviewList';

    list.innerHTML = `
        <div class="list-header">
            <span class="list-cell list-cell-name">Name</span>
            <span class="list-cell list-cell-type">Type</span>
            <span class="list-cell list-cell-rows">Rows</span>
            <span class="list-cell list-cell-actions">Actions</span>
        </div>
        ${sorted.map(f => {
            const cached = overviewRowCounts[f] || '';
            return `
            <div class="list-row">
                <span class="list-cell list-cell-name">
                    <svg class="list-file-icon" xmlns="http://www.w3.org/2000/svg" height="18px" viewBox="0 -960 960 960" width="18px" fill="currentColor"><path d="M280-280h400v-80H280v80Zm0-160h400v-80H280v80Zm0-160h400v-80H280v80Zm-80 480q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm0-80h560v-560H200v560Z"/></svg>
                    <a href="#/edit/${encodeURIComponent(f)}" class="list-name-link" title="${f}">${f}</a>
                </span>
                <span class="list-cell list-cell-type">
                    <span class="type-tag">CSV</span>
                </span>
                <span class="list-cell list-cell-rows">
                    <span class="row-count" data-file="${f}">${cached}</span>
                </span>
                <span class="list-cell list-cell-actions">
                    <a href="#/edit/${encodeURIComponent(f)}" class="button is-ghost" title="Edit ${f}">
                        <svg xmlns="http://www.w3.org/2000/svg" height="16px" viewBox="0 -960 960 960" width="16px" fill="currentColor"><path d="M200-200h57l391-391-57-57-391 391v57Zm-80 80v-170l528-527q12-11 26.5-17t30.5-6q16 0 31 6t26 18l55 56q12 11 17.5 26t5.5 30q0 16-5.5 30.5T817-647L290-120H120Zm640-584-56-56 56 56Zm-141 85-28-29 57 57-29-28Z"/></svg>
                        Edit
                    </a>
                    <button class="button is-ghost list-dl-btn" data-file="${f}" title="Download ${f}">
                        <svg xmlns="http://www.w3.org/2000/svg" height="16px" viewBox="0 -960 960 960" width="16px" fill="currentColor"><path d="M480-320 280-520l56-58 104 104v-326h80v326l104-104 56 58-200 200ZM240-160q-33 0-56.5-23.5T160-240v-120h80v120h480v-120h80v120q0 33-23.5 56.5T720-160H240Z"/></svg>
                    </button>
                </span>
            </div>`;
        }).join('')}
    `;

    assetList.innerHTML = '';
    assetList.appendChild(list);

    list.querySelectorAll('.list-dl-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            downloadFileFromList(btn.dataset.file);
        });
    });
}

async function fetchAllRowCounts() {
    const batchSize = 5;
    for (let start = 0; start < overviewFiles.length; start += batchSize) {
        const batch = overviewFiles.slice(start, start + batchSize);
        await Promise.all(batch.map(async (f) => {
            try {
                const res = await fetch(`${API_BASE}/${encodeURIComponent(f)}`);
                if (!res.ok) return;
                const text = await res.text();
                const lines = text.trim().split('\n');
                const rows = Math.max(0, lines.length - 1);
                const label = `${rows} row${rows !== 1 ? 's' : ''}`;
                overviewRowCounts[f] = label;
                document.querySelectorAll(`[data-file="${f}"]`).forEach(el => {
                    el.textContent = label;
                });
            } catch (e) {
                // silently skip
            }
        }));
    }
}

function truncateFilename(name, maxLen = 40) {
    if (name.length <= maxLen) return name;
    const ext = name.lastIndexOf('.');
    const extStr = ext > 0 ? name.slice(ext) : '';
    const base = ext > 0 ? name.slice(0, ext) : name;
    const keepLen = maxLen - extStr.length - 3;
    if (keepLen < 1) return name.slice(0, maxLen - 3) + '...';
    return base.slice(0, keepLen) + '...' + extStr;
}

async function downloadFileFromList(filename) {
    try {
        const res = await fetch(`${API_BASE}/${encodeURIComponent(filename)}`);
        if (!res.ok) throw new Error(res.statusText);
        const text = await res.text();
        const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
    } catch (e) {
        showNotification(`Download failed: ${e.message}`, 'is-danger');
    }
}

function colLabel(index) {
    let label = '';
    let i = index;
    while (i >= 0) {
        label = String.fromCharCode(65 + (i % 26)) + label;
        i = Math.floor(i / 26) - 1;
    }
    return label;
}

async function renderEditor(filename) {
    currentFilename = filename;
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

    if (isNewFile && !csvText) csvText = 'name\n';

    renderNavEditor(filename);

    appDiv.innerHTML = `
        <div class="table-container" id="table-wrapper">
            <div id="drop-zone" class="drop-zone-overlay is-hidden">Drop CSV Here to Replace</div>
            <table class="table" id="csv-table">
                <thead id="csv-head"></thead>
                <tbody id="csv-body"></tbody>
            </table>
        </div>
    `;

    const parsed = Papa.parse(csvText, { skipEmptyLines: 'greedy', header: false });
    buildTable(parsed.data);

    document.getElementById('add-col-btn').onclick = addColumn;
    document.getElementById('add-row-btn').onclick = addRow;
    document.getElementById('save-btn').onclick = () => saveFile(filename);
    document.getElementById('download-btn').onclick = () => downloadCSV(filename);

    const fileUpload = document.getElementById('file-upload');
    document.getElementById('upload-btn').onclick = () => fileUpload.click();
    fileUpload.onchange = (e) => handleFileUpload(e.target.files[0]);

    setupDragAndDrop();
    setupSpreadsheetKeyboardNav();
}

// --- SPREADSHEET KEYBOARD NAVIGATION ---
function setupSpreadsheetKeyboardNav() {
    const table = document.getElementById('csv-table');
    if (!table) return;

    table.addEventListener('focusin', updateCellRef);

    table.addEventListener('keydown', (e) => {
        const active = document.activeElement;
        if (!active || active.tagName !== 'INPUT' || !active.closest('#csv-body')) return;

        const pos = getCellPosition(active);
        if (!pos) return;

        const numCols = currentHeaders.length;
        const rows = document.querySelectorAll('#csv-body tr');
        const numRows = rows.length;

        let handled = true;

        switch (e.key) {
            case 'ArrowRight':
                e.preventDefault();
                focusCell(pos.row, Math.min(pos.col + 1, numCols - 1));
                break;
            case 'ArrowLeft':
                e.preventDefault();
                focusCell(pos.row, Math.max(pos.col - 1, 0));
                break;
            case 'ArrowDown':
                e.preventDefault();
                focusCell(Math.min(pos.row + 1, numRows - 1), pos.col);
                break;
            case 'ArrowUp':
                e.preventDefault();
                focusCell(Math.max(pos.row - 1, 0), pos.col);
                break;
            case 'Tab':
                e.preventDefault();
                if (e.shiftKey) {
                    if (pos.col > 0) {
                        focusCell(pos.row, pos.col - 1);
                    } else if (pos.row > 0) {
                        focusCell(pos.row - 1, numCols - 1);
                    }
                } else {
                    if (pos.col < numCols - 1) {
                        focusCell(pos.row, pos.col + 1);
                    } else if (pos.row < numRows - 1) {
                        focusCell(pos.row + 1, 0);
                    }
                }
                break;
            case 'Enter':
                e.preventDefault();
                if (e.shiftKey) {
                    focusCell(Math.max(pos.row - 1, 0), pos.col);
                } else {
                    focusCell(Math.min(pos.row + 1, numRows - 1), pos.col);
                }
                break;
            case 'Home':
                e.preventDefault();
                focusCell(pos.row, 0);
                break;
            case 'End':
                e.preventDefault();
                focusCell(pos.row, numCols - 1);
                break;
            default:
                handled = false;
        }

        if (handled) updateCellRef();
    });

    table.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
            const active = document.activeElement;
            if (active && active.tagName === 'INPUT' && active.closest('#csv-body, #csv-head')) {
                e.preventDefault();
                navigator.clipboard.writeText(active.value).catch(() => {});
            }
        }
    });
}

function getCellPosition(input) {
    const td = input.closest('td');
    if (!td) return null;
    const tr = td.closest('tr');
    if (!tr) return null;
    const tbody = tr.closest('#csv-body');
    if (!tbody) return null;

    const cells = Array.from(tr.querySelectorAll('td'));
    const tdIndex = cells.indexOf(td);
    if (tdIndex < 0) return null;

    const row = Array.from(tbody.querySelectorAll('tr')).indexOf(tr);
    const col = tdIndex - 1;

    if (col < 0 || col >= currentHeaders.length) return null;
    return { row, col };
}

function focusCell(row, col) {
    const rows = document.querySelectorAll('#csv-body tr');
    if (row < 0 || row >= rows.length) return;
    const tds = rows[row].querySelectorAll('td');
    const td = tds[col + 1];
    if (!td) return;
    const input = td.querySelector('input');
    if (input) {
        input.focus();
        input.select();
    }
}

function updateCellRef() {
    const el = document.getElementById('cellRef');
    if (!el) return;
    const active = document.activeElement;
    if (!active || active.tagName !== 'INPUT' || !active.closest('#csv-table')) {
        el.textContent = '';
        return;
    }
    const pos = getCellPosition(active);
    if (!pos) {
        el.textContent = '';
        return;
    }
    const letter = colLabel(pos.col);
    el.textContent = `${letter}${pos.row + 1}`;
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
    const rowNumTh = document.createElement('th');
    rowNumTh.className = 'row-num';
    rowNumTh.textContent = '#';
    trHead.appendChild(rowNumTh);

    currentHeaders.forEach((h, i) => trHead.appendChild(createHeaderCell(h, i)));
    const actionTh = document.createElement('th');
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

    const letter = document.createElement('span');
    letter.className = 'col-letter';
    letter.textContent = colLabel(colIndex);

    const rmBtn = document.createElement('button');
    rmBtn.className = 'remove-col-btn';
    rmBtn.title = 'Remove Column';
    rmBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" height="16px" viewBox="0 -960 960 960" width="16px" fill="currentColor"><path d="M280-120q-33 0-56.5-23.5T200-200v-520h-40v-80h200v-40h240v40h200v80h-40v520q0 33-23.5 56.5T680-120H280Zm400-600H280v520h400v-520ZM360-280h80v-360h-80v360Zm160 0h80v-360h-80v360ZM280-720v520-520Z"/></svg>';
    rmBtn.onclick = () => removeColumn(colIndex);

    th.appendChild(input);
    th.appendChild(letter);
    th.appendChild(rmBtn);
    return th;
}

function appendRow(rowData = []) {
    const tbody = document.getElementById('csv-body');
    const tr = document.createElement('tr');

    const rowNumTd = document.createElement('td');
    rowNumTd.className = 'row-num';
    rowNumTd.textContent = tbody.children.length + 1;
    tr.appendChild(rowNumTd);

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
    tdAction.style.whiteSpace = 'nowrap';

    const rmBtn = document.createElement('button');
    rmBtn.className = 'remove-row-btn';
    rmBtn.title = 'Remove Row';
    rmBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" height="16px" viewBox="0 -960 960 960" width="16px" fill="currentColor"><path d="M280-120q-33 0-56.5-23.5T200-200v-520h-40v-80h200v-40h240v40h200v80h-40v520q0 33-23.5 56.5T680-120H280Zm400-600H280v520h400v-520ZM360-280h80v-360h-80v360Zm160 0h80v-360h-80v360ZM280-720v520-520Z"/></svg>';
    rmBtn.onclick = async () => {
        tr.remove();
        renumberRows();
        updateCellRef();
    };

    tdAction.appendChild(rmBtn);
    tr.appendChild(tdAction);
    tbody.appendChild(tr);
}

function renumberRows() {
    const tbody = document.getElementById('csv-body');
    if (!tbody) return;
    tbody.querySelectorAll('tr').forEach((tr, i) => {
        const rowNumCell = tr.querySelector('.row-num');
        if (rowNumCell) rowNumCell.textContent = i + 1;
    });
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
