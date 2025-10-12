const state = {
    entries: [],
    filters: {
        search: '',
        type: ''
    },
    logs: [],
    selectedIds: new Set()
};

const entryForm = document.getElementById('entry-form');
const importInput = document.getElementById('import-input');
const exportBtn = document.getElementById('export-btn');
const clearBtn = document.getElementById('clear-btn');
const entriesContainer = document.getElementById('entries');
const statsEl = document.getElementById('stats');
const searchInput = document.getElementById('search');
const typeFilter = document.getElementById('type-filter');
const createdAtInput = document.getElementById('created-at');
const entryTemplate = document.getElementById('entry-template');
const editDialog = document.getElementById('edit-dialog');
const editForm = document.getElementById('edit-form');
const confirmClearDialog = document.getElementById('confirm-clear');
const logList = document.getElementById('activity-log');
const refreshLogBtn = document.getElementById('refresh-log-btn');
const logStatusEl = document.getElementById('log-status');
const selectFilteredBtn = document.getElementById('select-filtered-btn');
const clearSelectionBtn = document.getElementById('clear-selection-btn');
const selectionStatusEl = document.getElementById('selection-status');

let exportInProgress = false;

let logStatusTimeout;
let logLoading = false;

setCreatedAtDefaultValue();

init();

entryForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(entryForm);

    const questionText = (formData.get('questionText') || '').toString().trim();
    const answerText = (formData.get('answerText') || '').toString().trim();
    const questionImage = formData.get('questionImage');
    const answerImage = formData.get('answerImage');
    const hasQuestionImage = questionImage && questionImage.size > 0;
    const hasAnswerImage = answerImage && answerImage.size > 0;

    if (!questionText && !hasQuestionImage) {
        alert('请填写题目文字或上传题目图片。');
        return;
    }

    if (!answerText && !hasAnswerImage) {
        alert('请填写答案文字或上传答案图片。');
        return;
    }

    formData.set('questionText', questionText);
    formData.set('answerText', answerText);

    if (!formData.get('createdAt')) {
        formData.set('createdAt', todayDateValue());
    }

    try {
        const response = await fetch('/api/entries', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error('Failed to save entry');
        }

        const entry = await response.json();
        state.entries.unshift(normalizeEntry(entry));
        entryForm.reset();
        setCreatedAtDefaultValue();
        render();
        loadActivityLog();
    } catch (error) {
        console.error(error);
        alert('Unable to save entry. Please try again.');
        loadActivityLog();
    }
});

searchInput.addEventListener('input', (event) => {
    state.filters.search = event.target.value.toLowerCase();
    const filtered = renderEntries();
    updateSelectionUI(filtered);
});

typeFilter.addEventListener('change', (event) => {
    state.filters.type = event.target.value;
    const filtered = renderEntries();
    updateSelectionUI(filtered);
});

exportBtn.addEventListener('click', async () => {
    if (!state.selectedIds.size || exportInProgress) {
        if (!state.selectedIds.size && !exportInProgress) {
            alert('Select at least one entry to export.');
        }
        return;
    }

    exportInProgress = true;
    updateSelectionUI();

    try {
        const response = await fetch('/api/entries/export', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ ids: Array.from(state.selectedIds) })
        });

        if (!response.ok) {
            let message = 'Failed to export entries.';
            const contentType = response.headers.get('content-type') || '';
            try {
                if (contentType.includes('application/json')) {
                    const data = await response.json();
                    if (data?.error) message = data.error;
                } else {
                    const text = await response.text();
                    if (text) message = text;
                }
            } catch (error) {
                console.error('Failed to read export error response', error);
            }
            throw new Error(message);
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const filename = parseFilenameFromContentDisposition(response.headers.get('content-disposition'))
            || `wubook-selection-${new Date().toISOString().split('T')[0]}.pdf`;
        link.href = url;
        link.download = filename;
        document.body.append(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    } catch (error) {
        console.error(error);
        alert(error.message || 'Failed to export entries.');
    } finally {
        exportInProgress = false;
        updateSelectionUI();
    }
});

importInput.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
        const text = await file.text();
        const imported = JSON.parse(text);
        if (!Array.isArray(imported)) throw new Error('Invalid format');
        const response = await fetch('/api/entries/import', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(imported)
        });

        if (!response.ok) throw new Error('Import failed');

        const { added, entries } = await response.json();
        state.entries = entries.map(normalizeEntry);
        render();
        alert(`Imported ${added} new entries.`);
        loadActivityLog();
    } catch (error) {
        console.error(error);
        alert('Failed to import entries. Please ensure the file is a WuBook export.');
        loadActivityLog();
    } finally {
        importInput.value = '';
    }
});

clearBtn.addEventListener('click', () => {
    confirmClearDialog.showModal();
});

confirmClearDialog.addEventListener('close', () => {
    if (confirmClearDialog.returnValue === 'confirm') {
        fetch('/api/entries', { method: 'DELETE' })
            .then((response) => {
                if (!response.ok) throw new Error('Failed to clear entries');
                state.entries = [];
                render();
                loadActivityLog();
            })
            .catch((error) => {
                console.error(error);
                alert('Unable to clear entries.');
                loadActivityLog();
            });
    }
});

entriesContainer.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;

    const card = button.closest('.entry-card');
    const entry = state.entries.find((item) => item.id === card.dataset.id);
    if (!entry) return;

    switch (button.dataset.action) {
        case 'delete':
            if (confirm('Delete this entry?')) {
                fetch(`/api/entries/${entry.id}`, { method: 'DELETE' })
                    .then((response) => {
                        if (!response.ok) throw new Error('Failed to delete');
                        state.entries = state.entries.filter((item) => item.id !== entry.id);
                        render();
                        loadActivityLog();
                    })
                    .catch((error) => {
                        console.error(error);
                        alert('Unable to delete entry.');
                        loadActivityLog();
                    });
            }
            break;
        case 'edit':
            openEditDialog(entry);
            break;
        case 'similar':
            showSimilarEntries(card, entry);
            break;
    }
});

entriesContainer.addEventListener('change', (event) => {
    const checkbox = event.target.closest('.entry-select-input');
    if (!checkbox) return;

    const card = checkbox.closest('.entry-card');
    const id = card?.dataset.id;
    if (!id) return;

    if (checkbox.checked) {
        state.selectedIds.add(id);
    } else {
        state.selectedIds.delete(id);
    }

    card?.classList.toggle('entry-card--selected', checkbox.checked);
    updateSelectionUI();
});

selectFilteredBtn?.addEventListener('click', () => {
    const filtered = filteredEntries();
    if (!filtered.length) return;

    for (const entry of filtered) {
        state.selectedIds.add(entry.id);
    }

    syncSelectionToDom();
    updateSelectionUI(filtered);
});

clearSelectionBtn?.addEventListener('click', () => {
    if (!state.selectedIds.size) return;
    state.selectedIds.clear();
    syncSelectionToDom();
    updateSelectionUI();
});

editForm.addEventListener('close', () => {
    // This event doesn't fire on dialog forms in all browsers. Handled by dialog close.
});

editDialog.addEventListener('close', () => {
    if (editDialog.returnValue !== 'confirm') return;

    const id = document.getElementById('edit-id').value;
    const entry = state.entries.find((item) => item.id === id);
    if (!entry) return;

    const payload = {
        source: document.getElementById('edit-source').value.trim(),
        questionType: document.getElementById('edit-question-type').value.trim(),
        createdAt: document.getElementById('edit-created-at').value,
        errorReason: document.getElementById('edit-error-reason').value.trim(),
        questionText: document.getElementById('edit-question-text').value.trim(),
        answerText: document.getElementById('edit-answer-text').value.trim()
    };

    if (!payload.createdAt) {
        payload.createdAt = entry.createdAt;
    }

    if (!payload.questionText && !entry.questionImageUrl) {
        alert('题目需要文字或图片内容。');
        return;
    }

    if (!payload.answerText && !entry.answerImageUrl) {
        alert('答案需要文字或图片内容。');
        return;
    }

    fetch(`/api/entries/${id}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    })
        .then((response) => {
            if (!response.ok) throw new Error('Failed to update');
            return response.json();
        })
        .then((updated) => {
            const index = state.entries.findIndex((item) => item.id === updated.id);
            if (index !== -1) {
                state.entries[index] = normalizeEntry(updated);
                render();
                loadActivityLog();
            }
        })
        .catch((error) => {
            console.error(error);
            alert('Unable to update entry.');
            loadActivityLog();
        });
});

refreshLogBtn?.addEventListener('click', () => {
    loadActivityLog({ userRequested: true });
});

function render() {
    pruneSelection();
    populateTypeFilter();
    const filtered = renderEntries();
    renderStats();
    renderActivityLog();
    updateSelectionUI(filtered);
}

function renderEntries() {
    entriesContainer.innerHTML = '';
    const fragment = document.createDocumentFragment();
    const entries = filteredEntries();

    for (const entry of entries) {
        const card = entryTemplate.content.firstElementChild.cloneNode(true);
        card.dataset.id = entry.id;
        const isSelected = state.selectedIds.has(entry.id);
        card.classList.toggle('entry-card--selected', isSelected);
        card.querySelector('.entry-title').textContent = entry.questionType || '未分类题目';
        const metaParts = [];
        if (entry.source) {
            metaParts.push(`来源：${entry.source}`);
        }
        if (entry.createdAt) {
            metaParts.push(`创建：${formatDateDisplay(entry.createdAt)}`);
        }
        metaParts.push(`更新：${formatRelativeTime(entry.updatedAt)}`);
        card.querySelector('.entry-meta').textContent = metaParts.join(' • ');

        const questionSection = card.querySelector('.entry-section--question');
        const questionTextEl = card.querySelector('.entry-question-text');
        const questionFigure = card.querySelector('.entry-question-image');
        const answerSection = card.querySelector('.entry-section--answer');
        const answerTextEl = card.querySelector('.entry-answer-text');
        const answerFigure = card.querySelector('.entry-answer-image');
        const errorReasonEl = card.querySelector('.entry-error-reason');

        const hasQuestionText = Boolean(entry.questionText);
        questionTextEl.textContent = entry.questionText || '';
        questionTextEl.hidden = !hasQuestionText;
        questionFigure.innerHTML = '';
        questionFigure.hidden = !entry.questionImageSrc;
        if (entry.questionImageSrc) {
            appendImage(questionFigure, entry.questionImageSrc, `题目图片 - ${entry.questionType || entry.source || entry.id}`);
        }
        questionSection.hidden = !hasQuestionText && !entry.questionImageSrc;

        const hasAnswerText = Boolean(entry.answerText);
        answerTextEl.textContent = entry.answerText || '';
        answerTextEl.hidden = !hasAnswerText;
        answerFigure.innerHTML = '';
        answerFigure.hidden = !entry.answerImageSrc;
        if (entry.answerImageSrc) {
            appendImage(answerFigure, entry.answerImageSrc, `答案图片 - ${entry.questionType || entry.source || entry.id}`);
        }
        answerSection.hidden = !hasAnswerText && !entry.answerImageSrc;

        if (entry.errorReason) {
            errorReasonEl.textContent = `错误原因：${entry.errorReason}`;
            errorReasonEl.hidden = false;
        } else {
            errorReasonEl.textContent = '';
            errorReasonEl.hidden = true;
        }

        const selectInput = card.querySelector('.entry-select-input');
        if (selectInput) {
            selectInput.checked = isSelected;
        }

        card.querySelector('.entry-timestamp').textContent = `创建时间：${new Date(entry.createdAt).toLocaleString()}`;

        fragment.append(card);
    }

    if (!fragment.childNodes.length) {
        entriesContainer.innerHTML = '<p class="empty">No entries yet. Add your first mistake above!</p>';
    } else {
        entriesContainer.append(fragment);
    }

    return entries;
}

function appendImage(container, src, alt) {
    const img = document.createElement('img');
    img.src = src;
    img.alt = alt || '图片';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.addEventListener('error', () => {
        container.innerHTML = '<p class="photo-error">图片无法加载，可能未正确上传。</p>';
        container.hidden = false;
    }, { once: true });
    container.append(img);
}

function truncateText(text, limit) {
    if (!text) return '';
    if (text.length <= limit) return text;
    return `${text.slice(0, limit)}…`;
}

function renderActivityLog() {
    if (!logList) return;

    logList.innerHTML = '';

    if (!state.logs.length) {
        logList.innerHTML = '<li class="empty">No activity recorded yet.</li>';
        return;
    }

    const fragment = document.createDocumentFragment();

    for (const log of state.logs) {
        const item = document.createElement('li');
        item.className = 'log-entry';

        const header = document.createElement('div');
        header.className = 'log-entry__header';

        const action = document.createElement('span');
        action.className = 'log-entry__action';

        const badge = document.createElement('span');
        badge.className = `log-entry__badge${log.status === 'error' ? ' log-entry__badge--error' : ''}`;
        badge.textContent = log.status;
        action.append(badge);

        const description = document.createElement('span');
        description.textContent = formatLogSummary(log);
        action.append(description);

        const timestamp = document.createElement('span');
        timestamp.className = 'log-entry__time';
        const absolute = new Date(log.timestamp).toLocaleString();
        timestamp.textContent = `${absolute} • ${formatRelativeTime(log.timestamp)}`;

        header.append(action, timestamp);
        item.append(header);

        const detailText = formatLogDetails(log);
        if (detailText) {
            const details = document.createElement('p');
            details.className = 'log-entry__details';
            details.textContent = detailText;
            item.append(details);
        }

        fragment.append(item);
    }

    logList.append(fragment);
}

function renderStats() {
    const total = state.entries.length;
    const types = new Set(state.entries.map((entry) => entry.questionType).filter(Boolean));
    const sources = new Set(state.entries.map((entry) => entry.source).filter(Boolean));

    if (!total) {
        statsEl.textContent = '暂无记录。';
        return;
    }

    statsEl.innerHTML = `
        <span>${total} 条记录</span>
        <span>${types.size} 种题目类型</span>
        <span>${sources.size} 个来源</span>
    `;
}

function populateTypeFilter() {
    const current = typeFilter.value;
    typeFilter.innerHTML = '<option value="">全部</option>';
    const types = Array.from(new Set(state.entries.map((entry) => entry.questionType))).filter(Boolean).sort();
    for (const type of types) {
        const option = document.createElement('option');
        option.value = type;
        option.textContent = type;
        if (type === current) option.selected = true;
        typeFilter.append(option);
    }
}

function filteredEntries() {
    return state.entries
        .filter((entry) => {
            if (state.filters.type && entry.questionType !== state.filters.type) return false;
            if (!state.filters.search) return true;
            const haystack = [
                entry.questionType,
                entry.source,
                entry.questionText,
                entry.answerText,
                entry.errorReason
            ]
                .join(' ')
                .toLowerCase();
            return haystack.includes(state.filters.search);
        })
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

function pruneSelection() {
    if (!state.selectedIds.size) return;
    const validIds = new Set(state.entries.map((entry) => entry.id));
    for (const id of Array.from(state.selectedIds)) {
        if (!validIds.has(id)) {
            state.selectedIds.delete(id);
        }
    }
}

function syncSelectionToDom() {
    const cards = entriesContainer.querySelectorAll('.entry-card');
    for (const card of cards) {
        const id = card.dataset.id;
        const isSelected = state.selectedIds.has(id);
        card.classList.toggle('entry-card--selected', isSelected);
        const checkbox = card.querySelector('.entry-select-input');
        if (checkbox) {
            checkbox.checked = isSelected;
        }
    }
}

function updateSelectionUI(filtered = null) {
    const filteredEntriesList = Array.isArray(filtered) ? filtered : filteredEntries();
    const totalSelected = state.selectedIds.size;
    const visibleSelected = filteredEntriesList.filter((entry) => state.selectedIds.has(entry.id)).length;

    if (selectionStatusEl) {
        let message = 'No entries selected.';
        if (totalSelected > 0) {
            const suffix = totalSelected === 1 ? 'entry selected' : 'entries selected';
            if (visibleSelected && visibleSelected !== totalSelected) {
                message = `${totalSelected} ${suffix} (${visibleSelected} in view).`;
            } else if (visibleSelected === totalSelected) {
                message = `${totalSelected} ${suffix} in view.`;
            } else {
                message = `${totalSelected} ${suffix}.`;
            }
            selectionStatusEl.classList.add('selection-status--active');
        } else {
            selectionStatusEl.classList.remove('selection-status--active');
        }
        selectionStatusEl.textContent = message;
    }

    if (exportBtn) {
        exportBtn.disabled = !totalSelected || exportInProgress;
        exportBtn.textContent = exportInProgress ? '导出中…' : '导出选中（Word）';
    }

    if (clearSelectionBtn) {
        clearSelectionBtn.disabled = !totalSelected || exportInProgress;
    }

    if (selectFilteredBtn) {
        const hasFiltered = filteredEntriesList.length > 0;
        const allFilteredSelected = hasFiltered && filteredEntriesList.every((entry) => state.selectedIds.has(entry.id));
        selectFilteredBtn.disabled = !hasFiltered || allFilteredSelected || exportInProgress;
    }
}

function parseFilenameFromContentDisposition(header) {
    if (!header) return null;

    const filenameStar = /filename\*=UTF-8''([^;]+)/i.exec(header);
    if (filenameStar) {
        try {
            return decodeURIComponent(filenameStar[1].replace(/"/g, ''));
        } catch (error) {
            console.warn('Unable to decode export filename', error);
            return filenameStar[1];
        }
    }

    const match = /filename="?([^";]+)"?/i.exec(header);
    return match ? match[1] : null;
}

function openEditDialog(entry) {
    document.getElementById('edit-id').value = entry.id;
    document.getElementById('edit-source').value = entry.source || '';
    document.getElementById('edit-question-type').value = entry.questionType || '';
    document.getElementById('edit-created-at').value = toDateInputValue(entry.createdAt);
    document.getElementById('edit-error-reason').value = entry.errorReason || '';
    document.getElementById('edit-question-text').value = entry.questionText || '';
    document.getElementById('edit-answer-text').value = entry.answerText || '';

    editDialog.showModal();
}

function showSimilarEntries(card, entry) {
    const listContainer = card.querySelector('.entry-similar');
    const list = listContainer.querySelector('ul');
    list.innerHTML = '';

    const scores = state.entries
        .filter((item) => item.id !== entry.id)
        .map((item) => ({
            item,
            score: cosineSimilarity(embedding(entry), embedding(item))
        }))
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);

    if (!scores.length) {
        list.innerHTML = '<li>暂无相似题目。</li>';
    } else {
        for (const { item, score } of scores) {
            const li = document.createElement('li');
            const preview = item.questionText ? truncateText(item.questionText, 30) : '无文字题干';
            li.textContent = `${preview}（${item.questionType || '未分类'}） – 相似度 ${(score * 100).toFixed(0)}%`;
            list.append(li);
        }
    }

    listContainer.hidden = false;
}

function embedding(entry) {
    const text = [
        entry.questionType,
        entry.source,
        entry.questionText,
        entry.answerText,
        entry.errorReason
    ]
        .join(' ')
        .toLowerCase();
    const tokens = text.match(/\b[\w']+\b/g) || [];
    const vector = new Map();
    for (const token of tokens) {
        vector.set(token, (vector.get(token) || 0) + 1);
    }
    return vector;
}

function cosineSimilarity(vecA, vecB) {
    let dot = 0;
    for (const [token, weight] of vecA.entries()) {
        if (vecB.has(token)) {
            dot += weight * vecB.get(token);
        }
    }

    const magnitude = (vec) => Math.sqrt(Array.from(vec.values()).reduce((sum, value) => sum + value * value, 0));
    const magA = magnitude(vecA);
    const magB = magnitude(vecB);
    if (magA === 0 || magB === 0) return 0;
    return dot / (magA * magB);
}

function todayDateValue() {
    return new Date().toISOString().split('T')[0];
}

function setCreatedAtDefaultValue() {
    if (!createdAtInput) return;
    createdAtInput.value = todayDateValue();
}

function formatDateDisplay(iso) {
    if (!iso) return '';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    return date.toISOString().split('T')[0];
}

function toDateInputValue(iso) {
    if (!iso) return '';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    return date.toISOString().split('T')[0];
}

function formatRelativeTime(iso) {
    const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
    const date = new Date(iso);
    const diff = date - new Date();
    const seconds = Math.round(diff / 1000);

    const divisions = [
        { amount: 60, name: 'seconds' },
        { amount: 60, name: 'minutes' },
        { amount: 24, name: 'hours' },
        { amount: 7, name: 'days' },
        { amount: 4.34524, name: 'weeks' },
        { amount: 12, name: 'months' },
        { amount: Number.POSITIVE_INFINITY, name: 'years' }
    ];

    let duration = seconds;
    let unit = 'seconds';

    for (const division of divisions) {
        if (Math.abs(duration) < division.amount) {
            unit = division.name;
            break;
        }
        duration /= division.amount;
    }

    duration = Math.round(duration);
    return formatter.format(duration, unit);
}

async function loadActivityLog(options = {}) {
    if (!logList || logLoading) return;

    const { userRequested = false } = options;
    logLoading = true;
    refreshLogBtn?.setAttribute('disabled', 'true');
    setLogStatus(userRequested ? 'Refreshing…' : 'Updating…');

    try {
        const response = await fetch('/api/logs?limit=50');
        if (!response.ok) throw new Error('Failed to fetch activity log');
        const logs = await response.json();
        state.logs = Array.isArray(logs) ? logs : [];
        renderActivityLog();
        setLogStatus(`Updated ${new Date().toLocaleTimeString()}`);
    } catch (error) {
        console.error(error);
        setLogStatus('Unable to load activity log');
    } finally {
        logLoading = false;
        refreshLogBtn?.removeAttribute('disabled');
    }
}

function setLogStatus(message) {
    if (!logStatusEl) return;
    logStatusEl.textContent = message;
    if (logStatusTimeout) {
        clearTimeout(logStatusTimeout);
    }
    if (message && !/Unable to load/.test(message)) {
        logStatusTimeout = setTimeout(() => {
            logStatusEl.textContent = '';
        }, 4000);
    }
}

function formatLogSummary(log) {
    const labels = {
        'create-entry': 'Entry saved',
        'update-entry': 'Entry updated',
        'delete-entry': 'Entry removed',
        'clear-entries': 'All entries cleared',
        'import-entries': 'Entries imported',
        'list-entries': 'Entries viewed',
        'export-entries': 'Entries exported'
    };

    return labels[log.action] || log.action.replace(/-/g, ' ');
}

function formatLogDetails(log) {
    const details = log.details || {};

    if (log.status === 'error' && details.message) {
        return details.message;
    }

    switch (log.action) {
        case 'create-entry':
            return formatEntryLine(details, { includeMedia: true });
        case 'update-entry':
            return formatEntryLine(details);
        case 'delete-entry':
            return formatEntryLine(details);
        case 'clear-entries':
            if (typeof details.removed === 'number') {
                return `已删除 ${details.removed} 条记录。`;
            }
            return '';
        case 'import-entries': {
            const parts = [];
            if (typeof details.added === 'number') {
                parts.push(`新增 ${details.added} 条记录`);
            }
            if (typeof details.total === 'number') {
                parts.push(`累计 ${details.total} 条记录`);
            }
            return parts.join('，');
        }
        case 'list-entries':
            if (typeof details.total === 'number') {
                return `当前共有 ${details.total} 条记录。`;
            }
            return '';
        case 'export-entries':
            if (typeof details.count === 'number') {
                return `已准备 ${details.count} 条记录用于导出。`;
            }
            return '';
        default:
            if (!Object.keys(details).length) return '';
            return Object.entries(details)
                .map(([key, value]) => `${key}: ${value}`)
                .join(', ');
    }
}

function formatEntryLine(details, options = {}) {
    if (!details) return '';
    const parts = [];
    if (details.questionType) {
        parts.push(`题目类型：${details.questionType}`);
    }
    if (details.source) {
        parts.push(`来源：${details.source}`);
    }
    if (!parts.length && details.id) {
        parts.push(`ID: ${details.id}`);
    }
    if (options.includeMedia) {
        if (typeof details.questionImage === 'boolean') {
            parts.push(details.questionImage ? '题目图片已上传' : '无题目图片');
        }
        if (typeof details.answerImage === 'boolean') {
            parts.push(details.answerImage ? '答案图片已上传' : '无答案图片');
        }
    }
    return parts.join(' • ');
}
async function init() {
    try {
        const response = await fetch('/api/entries');
        if (!response.ok) throw new Error('Failed to load entries');
        const entries = await response.json();
        state.entries = entries.map(normalizeEntry);
        render();
    } catch (error) {
        console.error(error);
        alert('Unable to load saved entries.');
    } finally {
        await loadActivityLog();
    }
}

function normalizeEntry(raw) {
    const questionImageUrl = raw.questionImageUrl || raw.photoUrl || null;
    const questionImageResizedUrl = raw.questionImageResizedUrl || raw.photoResizedUrl || null;
    const questionPreview = questionImageResizedUrl || questionImageUrl;
    const answerImageUrl = raw.answerImageUrl || null;
    const answerImageResizedUrl = raw.answerImageResizedUrl || null;
    const answerPreview = answerImageResizedUrl || answerImageUrl;
    return {
        id: raw.id,
        source: raw.source || '',
        questionType: raw.questionType || raw.subject || '',
        questionText: raw.questionText || raw.description || raw.title || '',
        answerText: raw.answerText || raw.comments || '',
        errorReason: raw.errorReason || raw.reason || '',
        questionImageUrl,
        questionImageResizedUrl,
        questionImageSrc: resolveMediaUrl(questionPreview),
        questionImageOriginalSrc: resolveMediaUrl(questionImageUrl),
        questionImageResizedSrc: resolveMediaUrl(questionImageResizedUrl),
        answerImageUrl,
        answerImageResizedUrl,
        answerImageSrc: resolveMediaUrl(answerPreview),
        answerImageOriginalSrc: resolveMediaUrl(answerImageUrl),
        answerImageResizedSrc: resolveMediaUrl(answerImageResizedUrl),
        createdAt: raw.createdAt,
        updatedAt: raw.updatedAt
    };
}

function resolveMediaUrl(url) {
    if (!url) {
        return null;
    }

    try {
        return new URL(url, window.location.origin).href;
    } catch (error) {
        console.warn('Unable to resolve photo URL', url, error);
        return null;
    }
}
