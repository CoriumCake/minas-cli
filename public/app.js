const state = {
    token: localStorage.getItem('minas_token'),
    deviceId: localStorage.getItem('minas_device_id'),
    currentPath: '/',
    isConfigured: false,
    needsPassword: true,
    selectedFiles: new Set(),

    // View & Sort State
    viewMode: localStorage.getItem('minas_view_mode') || 'list',
    showThumbnails: localStorage.getItem('minas_show_thumbs') === 'true',
    sortBy: localStorage.getItem('minas_sort_by') || 'name',
    sortOrder: localStorage.getItem('minas_sort_order') || 'asc',
    files: [] // Cache for sorting
};

// Ensure Device Identity
if (!state.deviceId) {
    state.deviceId = 'device-' + Math.random().toString(36).substring(2, 12);
    localStorage.setItem('minas_device_id', state.deviceId);
}

// Global API Helper
async function api(url, options = {}) {
    const headers = {
        'Authorization': state.token ? `Bearer ${state.token}` : '',
        'X-Device-Id': state.deviceId,
        ...(options.headers || {})
    };

    if (options.body && !(options.body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(options.body);
    }

    const res = await fetch(url, { ...options, headers });

    if (res.status === 401) {
        logout();
        throw new Error('Unauthorized');
    }

    if (res.status === 403) {
        const data = await res.json();
        showToast(data.error || 'Access Denied');
        if (data.error === 'Device is banned') logout();
        throw new Error('Forbidden');
    }

    return res;
}

// Elements
const authContainer = document.getElementById('auth-container');
const dashboardContainer = document.getElementById('dashboard-container');
const authForm = document.getElementById('auth-form');
const authTitle = document.getElementById('auth-title');
const authSubtitle = document.getElementById('auth-subtitle');
const authError = document.getElementById('auth-error');

// Panels
const navFiles = document.getElementById('nav-files');
const panelFiles = document.getElementById('panel-files');

// Lists
const fileList = document.getElementById('file-list');
const emptyState = document.getElementById('empty-state');
const breadcrumb = document.getElementById('breadcrumb');

// Actions
const uploadBtn = document.getElementById('upload-btn');
const fileInput = document.getElementById('file-input');
const uploadFolderBtn = document.getElementById('upload-folder-btn');
const folderInput = document.getElementById('folder-input');
const newFolderBtn = document.getElementById('new-folder-btn');
const logoutBtn = document.getElementById('logout-btn');
const toast = document.getElementById('toast');

// Settings & Storage
const storagePercentage = document.getElementById('storage-percentage');
const storageProgress = document.getElementById('storage-progress');
const storageUsed = document.getElementById('storage-used');
const storageTotal = document.getElementById('storage-total');

// Batch & Lightbox
const selectAllCheckbox = document.getElementById('select-all-checkbox');
const batchActions = document.getElementById('batch-actions');
const batchDownloadBtn = document.getElementById('batch-download-btn');
const batchDeleteBtn = document.getElementById('batch-delete-btn');
const lightbox = document.getElementById('media-lightbox');
const lightboxClose = document.getElementById('lightbox-close');
const lightboxMediaContainer = document.getElementById('lightbox-media-container');
const lightboxTitle = document.getElementById('lightbox-title');

// View Controls
const viewModeSelect = document.getElementById('view-mode-select');
const sortSelect = document.getElementById('sort-select');
const thumbToggle = document.getElementById('thumb-toggle');
const tableView = document.getElementById('table-view');
const fileContainer = document.getElementById('file-container');
const gridView = document.getElementById('grid-view');

// Upload Progress Elements
const uploadProgressContainer = document.getElementById('upload-progress-container');
const uploadStatus = document.getElementById('upload-status');
const uploadCount = document.getElementById('upload-count');
const uploadProgressBar = document.getElementById('upload-progress-bar');

// Initialize
async function init() {
    try {
        const res = await fetch('/api/auth/status');
        const data = await res.json();

        state.isConfigured = data.isConfigured;
        state.needsPassword = data.needsPassword;

        if (state.needsPassword) {
            showSetup();
        } else if (!state.token) {
            showLogin();
        } else {
            showDashboard();
        }

        // Sync UI with state
        viewModeSelect.value = state.viewMode;
        sortSelect.value = state.sortBy;
        if (state.showThumbnails) thumbToggle.classList.add('active');
        updateSortHeaders();

    } catch (err) {
        showToast('Error connecting to server');
    }
}

// Views
function showSetup() {
    authContainer.classList.remove('hidden');
    dashboardContainer.classList.add('hidden');
    authTitle.textContent = 'Hardware Lock';
    authSubtitle.textContent = 'Setup required. Please configure master password in your terminal.';
    document.getElementById('password').disabled = true;
    document.getElementById('auth-submit').disabled = true;
    document.getElementById('password').placeholder = 'Setup via Terminal...';
}

function showLogin() {
    authContainer.classList.remove('hidden');
    dashboardContainer.classList.add('hidden');
    authTitle.textContent = 'NAS Vault';
    authSubtitle.textContent = 'Protected by premium encryption.';
    document.getElementById('password').focus();
}

function showDashboard() {
    authContainer.classList.add('hidden');
    dashboardContainer.classList.remove('hidden');
    loadFiles();
    loadStorageStats();
}

function logout() {
    localStorage.removeItem('minas_token');
    state.token = null;
    showLogin();
}

// Navigation
navFiles.onclick = () => {
    loadFiles();
};

function switchPanel(panel) {
    // Simplified to only files panel
    navFiles.classList.add('active');
    panelFiles.classList.remove('hidden');
}



// Files Logic
async function loadFiles() {
    try {
        const res = await api(`/api/fs/list?path=${encodeURIComponent(state.currentPath)}`);
        state.files = await res.json();
        sortFiles();
        renderFiles();
        renderBreadcrumbs();
    } catch (err) { }
}

function sortFiles() {
    state.files.sort((a, b) => {
        // Folders always first
        if (a.type === 'folder' && b.type !== 'folder') return -1;
        if (a.type !== 'folder' && b.type === 'folder') return 1;

        let valA = a[state.sortBy];
        let valB = b[state.sortBy];

        if (state.sortBy === 'name') {
            valA = valA.toLowerCase();
            valB = valB.toLowerCase();
        }

        if (state.sortOrder === 'asc') {
            return valA > valB ? 1 : -1;
        } else {
            return valA < valB ? 1 : -1;
        }
    });
}

function updateSortHeaders() {
    document.querySelectorAll('.sortable').forEach(th => {
        th.classList.remove('asc', 'desc');
        const icon = th.querySelector('.sort-icon');
        icon.className = 'ph ph-caret-up-down sort-icon';

        if (th.dataset.sort === state.sortBy) {
            th.classList.add(state.sortOrder);
            icon.className = `ph ph-caret-${state.sortOrder === 'asc' ? 'up' : 'down'}-fill sort-icon`;
        }
    });
}

function renderFiles() {
    fileList.innerHTML = '';
    gridView.innerHTML = '';
    state.selectedFiles.clear();
    updateBatchActions();
    selectAllCheckbox.checked = false;

    if (state.files.length === 0) {
        emptyState.classList.remove('hidden');
        tableView.classList.add('hidden');
        gridView.classList.add('hidden');
        return;
    }

    emptyState.classList.add('hidden');

    if (state.viewMode === 'grid') {
        tableView.classList.add('hidden');
        gridView.classList.remove('hidden');
        fileContainer.classList.remove('list-view');
        fileContainer.classList.add('grid-view');
    } else {
        tableView.classList.remove('hidden');
        gridView.classList.add('hidden');
        fileContainer.classList.add('list-view');
        fileContainer.classList.remove('grid-view');
    }

    state.files.forEach(file => {
        const isMedia = file.name.match(/\.(jpg|jpeg|png|webp|mp4|webm|gif|heic|heif)$/i);
        const isImage = file.name.match(/\.(jpg|jpeg|png|webp|gif|heic|heif)$/i);
        const thumbUrl = `/api/fs/preview?path=${encodeURIComponent(state.currentPath.endsWith('/') ? state.currentPath + file.name : `${state.currentPath}/${file.name}`)}&token=${state.token}&X-Device-Id=${state.deviceId}`;

        if (state.viewMode === 'list') {
            const tr = document.createElement('tr');
            tr.className = 'file-row';

            let iconClass = file.type === 'folder' ? 'ph-folder-fill' : 'ph-file-text';
            if (isMedia) iconClass = 'ph-file-video';
            if (isImage) iconClass = 'ph-file-image';

            tr.innerHTML = `
                <td><input type="checkbox" class="file-checkbox" data-name="${file.name}"></td>
                <td>
                    <div class="file-name">
                        ${state.showThumbnails && isImage ? `<img src="${thumbUrl}" style="width:32px; height:32px; object-fit:cover; border-radius:4px;">` : `<i class="ph ${iconClass}"></i>`}
                        <span>${file.name}</span>
                    </div>
                </td>
                <td class="hide-mobile">${file.type === 'folder' ? '--' : formatSize(file.size)}</td>
                <td class="hide-mobile">${new Date(file.mtime).toLocaleString()}</td>
                <td>
                    <div class="row-actions">
                        ${file.type !== 'folder' ? `<button class="action-btn" onclick="downloadFile('${file.name}')" title="Download"><i class="ph ph-download-simple"></i></button>` : ''}
                        <button class="action-btn" onclick="deleteItem('${file.name}')" title="Delete"><i class="ph ph-trash"></i></button>
                    </div>
                </td>
            `;

            tr.onclick = (e) => {
                if (e.target.tagName.toLowerCase() === 'input' || e.target.closest('button')) return;
                handleItemClick(file, isMedia);
            };

            const cb = tr.querySelector('.file-checkbox');
            cb.onchange = (e) => {
                e.stopPropagation();
                if (cb.checked) {
                    state.selectedFiles.add(file.name);
                    tr.classList.add('selected');
                } else {
                    state.selectedFiles.delete(file.name);
                    tr.classList.remove('selected');
                }
                updateBatchActions();
            };

            fileList.appendChild(tr);
        } else {
            // Grid Item
            const item = document.createElement('div');
            item.className = 'grid-item';

            let iconClass = file.type === 'folder' ? 'ph-folder-fill' : 'ph-file-text';
            if (isMedia) iconClass = 'ph-file-video';

            const showThumb = state.showThumbnails && isImage;

            item.innerHTML = `
                <input type="checkbox" class="item-checkbox" data-name="${file.name}">
                <div class="item-content">
                    ${showThumb ? `<img src="${thumbUrl}" class="item-thumb">` : `<i class="ph ${iconClass} item-icon"></i>`}
                    <div class="item-name" title="${file.name}">${file.name}</div>
                    <div class="item-meta">${file.type === 'folder' ? 'Folder' : formatSize(file.size)}</div>
                </div>
                <div class="item-actions">
                     <button class="action-btn" onclick="deleteItem('${file.name}')" title="Delete"><i class="ph ph-trash"></i></button>
                </div>
            `;

            item.onclick = (e) => {
                if (e.target.tagName.toLowerCase() === 'input' || e.target.closest('button')) return;
                handleItemClick(file, isMedia);
            };

            const cb = item.querySelector('.item-checkbox');
            cb.onchange = (e) => {
                if (cb.checked) {
                    state.selectedFiles.add(file.name);
                    item.classList.add('selected');
                } else {
                    state.selectedFiles.delete(file.name);
                    item.classList.remove('selected');
                }
                updateBatchActions();
            };

            gridView.appendChild(item);
        }
    });
}

function handleItemClick(file, isMedia) {
    if (file.type === 'folder') {
        state.currentPath = state.currentPath.endsWith('/')
            ? state.currentPath + file.name
            : `${state.currentPath}/${file.name}`;
        loadFiles();
    } else if (isMedia) {
        previewMedia(file.name);
    }
}

// Control Event Listeners
viewModeSelect.onchange = () => {
    state.viewMode = viewModeSelect.value;
    localStorage.setItem('minas_view_mode', state.viewMode);
    renderFiles();
};

sortSelect.onchange = () => {
    state.sortBy = sortSelect.value;
    localStorage.setItem('minas_sort_by', state.sortBy);
    sortFiles();
    updateSortHeaders();
    renderFiles();
};

thumbToggle.onclick = () => {
    state.showThumbnails = !state.showThumbnails;
    localStorage.setItem('minas_show_thumbs', state.showThumbnails);
    thumbToggle.classList.toggle('active', state.showThumbnails);
    renderFiles();
};

document.querySelectorAll('.sortable').forEach(header => {
    header.onclick = () => {
        const sortKey = header.dataset.sort;
        if (state.sortBy === sortKey) {
            state.sortOrder = state.sortOrder === 'asc' ? 'desc' : 'asc';
        } else {
            state.sortBy = sortKey;
            state.sortOrder = 'asc';
            sortSelect.value = sortKey;
        }
        localStorage.setItem('minas_sort_by', state.sortBy);
        localStorage.setItem('minas_sort_order', state.sortOrder);
        sortFiles();
        updateSortHeaders();
        renderFiles();
    };
});

// Auth Actions
authForm.onsubmit = async (e) => {
    e.preventDefault();
    const password = document.getElementById('password').value;

    try {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                password,
                deviceId: state.deviceId
            })
        });

        const data = await res.json();
        if (data.success) {
            state.token = data.token;
            localStorage.setItem('minas_token', data.token);
            showDashboard();
        } else {
            authError.textContent = data.error || 'Authentication failed';
        }
    } catch (err) {
        authError.textContent = 'Server error';
    }
};

logoutBtn.onclick = logout;

// Remaining Logic (Storage, Folders, Uploads...)
async function loadStorageStats() {
    try {
        const res = await api('/api/fs/stats');
        const data = await res.json();
        if (data.total > 0) {
            const usedGB = (data.used / (1024 * 1024 * 1024)).toFixed(1);
            const totalGB = (data.total / (1024 * 1024 * 1024)).toFixed(1);
            const percentage = Math.round((data.used / data.total) * 100);
            storageUsed.textContent = `${usedGB} GB`;
            storageTotal.textContent = `${totalGB} GB`;
            storagePercentage.textContent = `${percentage}%`;
            storageProgress.style.width = `${percentage}%`;
        }
    } catch (err) { }
}



// Utilities & File Ops
function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    toast.classList.remove('hidden');
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.classList.add('hidden'), 300);
    }, 3000);
}

window.downloadFile = (name) => {
    const path = state.currentPath.endsWith('/') ? state.currentPath + name : `${state.currentPath}/${name}`;
    window.open(`/api/fs/download?path=${encodeURIComponent(path)}&token=${state.token}&X-Device-Id=${state.deviceId}`);
};

window.deleteItem = async (name) => {
    const confirmed = await showModal('Delete Item', `Are you sure you want to delete "${name}"?`);
    if (!confirmed) return;

    // Optimistic Update
    state.files = state.files.filter(f => f.name !== name);
    renderFiles();

    const path = state.currentPath.endsWith('/') ? state.currentPath + name : `${state.currentPath}/${name}`;
    try {
        const res = await api(`/api/fs/item?path=${encodeURIComponent(path)}`, { method: 'DELETE' });
        if (res.ok) {
            showToast('Deleted');
            loadStorageStats();
        } else {
            loadFiles(); // Revert on failure
        }
    } catch (err) {
        loadFiles(); // Revert on error
    }
};

newFolderBtn.onclick = async () => {
    const name = await showModal('New Folder', 'Enter a name for the new folder:', true);
    if (!name) return;

    // Optimistic Update
    const newFolder = {
        name: name,
        type: 'folder',
        size: 0,
        lastModified: new Date().toISOString(),
        isPlaceholder: true // Mark as placeholder
    };
    state.files.push(newFolder);
    sortFiles(); // Re-sort to place it correctly
    renderFiles();

    try {
        const res = await api('/api/fs/folder', {
            method: 'POST',
            body: { path: state.currentPath, folderName: name }
        });
        if (res.ok) {
            showToast('Created');
            loadFiles();
        } else {
            loadFiles(); // Revert
        }
    } catch (err) {
        loadFiles(); // Revert
    }
};

batchDeleteBtn.onclick = async () => {
    const count = state.selectedFiles.size;
    if (count === 0) return;

    const confirmed = await showModal('Delete Items', `Are you sure you want to delete ${count} selected items?`);
    if (!confirmed) return;

    const selectedNames = new Set(state.selectedFiles);
    const paths = Array.from(selectedNames).map(name => {
        return state.currentPath.endsWith('/') ? state.currentPath + name : `${state.currentPath}/${name}`;
    });

    // Optimistic Update
    state.files = state.files.filter(f => !selectedNames.has(f.name));
    state.selectedFiles.clear();
    renderFiles();

    showToast(`Deleting ${count} items...`);
    try {
        const res = await api('/api/fs/batch-delete', {
            method: 'POST',
            body: { paths }
        });
        if (res.ok) {
            showToast('Batch Deleted');
            loadStorageStats();
        } else {
            loadFiles(); // Revert
        }
    } catch (err) {
        loadFiles(); // Revert
    }
};

batchDownloadBtn.onclick = () => {
    state.selectedFiles.forEach(name => {
        const path = state.currentPath.endsWith('/') ? state.currentPath + name : `${state.currentPath}/${name}`;
        // Set a small timeout between downloads to prevent browser blocking
        setTimeout(() => downloadFile(name), 100);
    });
};

uploadBtn.onclick = () => fileInput.click();
fileInput.onchange = () => {
    if (fileInput.files.length === 0) return;
    performUpload(fileInput.files);
    fileInput.value = '';
};

uploadFolderBtn.onclick = () => folderInput.click();
folderInput.onchange = () => {
    if (folderInput.files.length === 0) return;
    performUpload(folderInput.files);
    folderInput.value = '';
};

let uploadQueue = [];
let uploadState = {
    total: 0,
    completed: 0,
    failed: 0,
    isUploading: false
};

// Protect against accidental refresh
window.addEventListener('beforeunload', (e) => {
    if (uploadQueue.length > 0 || uploadState.isUploading) {
        e.preventDefault();
        e.returnValue = 'Uploads are still in progress. Are you sure you want to leave?';
    }
});

function performUpload(files) {
    // Add files to queue
    const newFiles = Array.from(files);
    uploadQueue.push(...newFiles);
    uploadState.total += newFiles.length;

    uploadProgressContainer.classList.remove('hidden');
    updateUploadProgressUI();

    if (!uploadState.isUploading) {
        processUploadQueue();
    }
}

async function processUploadQueue() {
    uploadState.isUploading = true;
    const maxConcurrent = 3; // Upload up to 3 files at once

    while (uploadQueue.length > 0) {
        // Take a batch of files
        const batch = uploadQueue.splice(0, maxConcurrent);

        // Upload the batch concurrently
        await Promise.all(batch.map(file => uploadSingleFile(file)));
        updateUploadProgressUI();
    }

    uploadState.isUploading = false;
    uploadStatus.textContent = uploadState.failed > 0
        ? `Finished w/ ${uploadState.failed} errors`
        : 'All uploads complete!';

    setTimeout(() => {
        if (!uploadState.isUploading) {
            uploadProgressContainer.classList.add('hidden');
            uploadState.total = 0;
            uploadState.completed = 0;
            uploadState.failed = 0;
        }
    }, 4000);

    loadFiles();
    loadStorageStats();
}

function updateUploadProgressUI() {
    uploadStatus.textContent = 'Uploading...';
    uploadCount.textContent = `${uploadState.completed}/${uploadState.total}`;
    const percent = Math.round((uploadState.completed / uploadState.total) * 100);
    uploadProgressBar.style.width = percent + '%';
}

function uploadSingleFile(file) {
    return new Promise((resolve) => {
        const formData = new FormData();
        formData.append('files', file);
        // Handle folder structure from webkitRelativePath if available
        let destPath = state.currentPath;
        if (file.webkitRelativePath) {
            const folderStructure = file.webkitRelativePath.substring(0, file.webkitRelativePath.lastIndexOf('/'));
            if (folderStructure) {
                destPath = destPath.endsWith('/') ? destPath + folderStructure : `${destPath}/${folderStructure}`;
            }
        }

        const xhr = new XMLHttpRequest();
        const url = `/api/fs/upload?path=${encodeURIComponent(destPath)}`;

        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                uploadState.completed++;
            } else {
                uploadState.failed++;
                showToast(`Failed: ${file.name}`);
            }
            resolve();
        };

        xhr.onerror = () => {
            uploadState.failed++;
            showToast(`Error: ${file.name}`);
            resolve();
        };

        xhr.open('POST', url);
        xhr.setRequestHeader('Authorization', `Bearer ${state.token}`);
        xhr.setRequestHeader('X-Device-Id', state.deviceId);
        xhr.send(formData);
    });
}

function previewMedia(name) {
    const path = state.currentPath.endsWith('/') ? state.currentPath + name : `${state.currentPath}/${name}`;
    const url = `/api/fs/preview?path=${encodeURIComponent(path)}&token=${state.token}&X-Device-Id=${state.deviceId}`;
    lightboxTitle.textContent = name;
    lightboxMediaContainer.innerHTML = name.match(/\.(mp4|webm)$/i) ? `<video src="${url}" controls autoplay></video>` : `<img src="${url}" alt="${name}">`;
    lightbox.showModal();
}

lightboxClose.onclick = () => { lightbox.close(); lightboxMediaContainer.innerHTML = ''; };

function updateBatchActions() {
    state.selectedFiles.size > 0 ? batchActions.classList.remove('hidden') : batchActions.classList.add('hidden');
}

selectAllCheckbox.onchange = (e) => {
    const isChecked = e.target.checked;
    document.querySelectorAll('.file-checkbox, .item-checkbox').forEach(cb => {
        cb.checked = isChecked;
        cb.dispatchEvent(new Event('change'));
    });
};

function renderBreadcrumbs() {
    breadcrumb.innerHTML = '';
    const parts = state.currentPath.split('/').filter(p => p);
    const rootItem = document.createElement('span');
    rootItem.className = 'breadcrumb-item';
    rootItem.textContent = 'Home';
    rootItem.onclick = () => { state.currentPath = '/'; loadFiles(); };
    breadcrumb.appendChild(rootItem);
    let currentBuildPath = '';
    parts.forEach(part => {
        const sep = document.createElement('span');
        sep.className = 'breadcrumb-separator';
        sep.textContent = '/';
        breadcrumb.appendChild(sep);
        currentBuildPath += `/${part}`;
        const item = document.createElement('span');
        item.className = 'breadcrumb-item';
        item.textContent = part;
        const p = currentBuildPath;
        item.onclick = () => { state.currentPath = p; loadFiles(); };
        breadcrumb.appendChild(item);
    });
}

function showModal(title, message, isPrompt = false) {
    const modal = document.getElementById('action-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalMessage = document.getElementById('modal-message');
    const modalInput = document.getElementById('modal-input');
    const modalInputContainer = document.getElementById('modal-input-container');
    const confirmBtn = document.getElementById('modal-confirm');
    const cancelBtn = document.getElementById('modal-cancel');

    modalTitle.textContent = title;
    modalMessage.textContent = message;
    modalInput.value = '';

    if (isPrompt) {
        modalInputContainer.classList.remove('hidden');
        setTimeout(() => modalInput.focus(), 100);
    } else {
        modalInputContainer.classList.add('hidden');
    }

    modal.showModal();

    return new Promise((resolve) => {
        const handleConfirm = () => {
            modal.close();
            cleanup();
            resolve(isPrompt ? modalInput.value : true);
        };
        const handleCancel = () => {
            modal.close();
            cleanup();
            resolve(isPrompt ? null : false);
        };
        const cleanup = () => {
            confirmBtn.removeEventListener('click', handleConfirm);
            cancelBtn.removeEventListener('click', handleCancel);
            modal.removeEventListener('cancel', handleCancel);
        };

        confirmBtn.addEventListener('click', handleConfirm);
        cancelBtn.addEventListener('click', handleCancel);
        modal.addEventListener('cancel', handleCancel); // When ESC is pressed
    });
}

init();
