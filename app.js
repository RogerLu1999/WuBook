const state = {
    entries: [],
    filters: {
        search: '',
        subject: ''
    },
    logs: []
};

const entryForm = document.getElementById('entry-form');
const importInput = document.getElementById('import-input');
const exportBtn = document.getElementById('export-btn');
const clearBtn = document.getElementById('clear-btn');
const entriesContainer = document.getElementById('entries');
const statsEl = document.getElementById('stats');
const searchInput = document.getElementById('search');
const subjectFilter = document.getElementById('subject-filter');
const entryTemplate = document.getElementById('entry-template');
const editDialog = document.getElementById('edit-dialog');
const editForm = document.getElementById('edit-form');
const confirmClearDialog = document.getElementById('confirm-clear');
const logList = document.getElementById('activity-log');
const refreshLogBtn = document.getElementById('refresh-log-btn');
const logStatusEl = document.getElementById('log-status');

let logStatusTimeout;
let logLoading = false;

init();

entryForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(entryForm);

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
    renderEntries();
});

subjectFilter.addEventListener('change', (event) => {
    state.filters.subject = event.target.value;
    renderEntries();
});

exportBtn.addEventListener('click', async () => {
    try {
        const exportEntries = await Promise.all(state.entries.map(prepareEntryForExport));
        const blob = new Blob([JSON.stringify(exportEntries, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `wubook-entries-${new Date().toISOString().split('T')[0]}.json`;
        link.click();
        URL.revokeObjectURL(url);
    } catch (error) {
        console.error(error);
        alert('Failed to export entries.');
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

editForm.addEventListener('close', () => {
    // This event doesn't fire on dialog forms in all browsers. Handled by dialog close.
});

editDialog.addEventListener('close', () => {
    if (editDialog.returnValue !== 'confirm') return;

    const id = document.getElementById('edit-id').value;
    const entry = state.entries.find((item) => item.id === id);
    if (!entry) return;

    const payload = {
        subject: document.getElementById('edit-subject').value.trim(),
        title: document.getElementById('edit-title').value.trim(),
        description: document.getElementById('edit-description').value.trim(),
        reason: document.getElementById('edit-reason').value.trim(),
        comments: document.getElementById('edit-comments').value.trim(),
        tags: parseTags(document.getElementById('edit-tags').value)
    };

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
    populateSubjectFilter();
    renderEntries();
    renderStats();
    renderActivityLog();
}

function renderEntries() {
    entriesContainer.innerHTML = '';
    const fragment = document.createDocumentFragment();

    for (const entry of filteredEntries()) {
        const card = entryTemplate.content.firstElementChild.cloneNode(true);
        card.dataset.id = entry.id;
        card.querySelector('.entry-title').textContent = entry.title;
        card.querySelector('.entry-meta').textContent = `${entry.subject} • Last updated ${formatRelativeTime(entry.updatedAt)}`;
        card.querySelector('.entry-description').textContent = entry.description;
        card.querySelector('.entry-reason').textContent = `Reason: ${entry.reason}`;
        card.querySelector('.entry-comments').textContent = entry.comments ? `Notes: ${entry.comments}` : '';

        const tagsEl = card.querySelector('.entry-tags');
        tagsEl.innerHTML = '';
        if (entry.tags.length) {
            for (const tag of entry.tags) {
                const li = document.createElement('li');
                li.textContent = tag;
                tagsEl.append(li);
            }
        }

        const photoEl = card.querySelector('.entry-photo');
        const photoSource = entry.photoSrc || entry.photoUrl;
        photoEl.innerHTML = '';
        photoEl.hidden = !photoSource;
        if (photoSource) {
            const img = document.createElement('img');
            img.src = photoSource;
            img.alt = `Photo for ${entry.title}`;
            img.loading = 'lazy';
            img.decoding = 'async';
            img.addEventListener('error', () => {
                photoEl.innerHTML = '<p class="photo-error">Photo unavailable. It may not have uploaded correctly.</p>';
                photoEl.hidden = false;
            }, { once: true });
            photoEl.append(img);

            const links = [];
            if (entry.photoResizedSrc) {
                const resizedLink = document.createElement('a');
                resizedLink.href = entry.photoResizedSrc;
                resizedLink.target = '_blank';
                resizedLink.rel = 'noopener';
                resizedLink.download = '';
                resizedLink.textContent = 'Print-sized copy';
                links.push(resizedLink);
            }
            if (entry.photoOriginalSrc && entry.photoOriginalSrc !== entry.photoResizedSrc) {
                const originalLink = document.createElement('a');
                originalLink.href = entry.photoOriginalSrc;
                originalLink.target = '_blank';
                originalLink.rel = 'noopener';
                originalLink.download = '';
                originalLink.textContent = 'Original photo';
                links.push(originalLink);
            }

            if (links.length) {
                const caption = document.createElement('figcaption');
                caption.className = 'entry-photo__links';
                caption.append(...links.reduce((acc, link, index) => {
                    if (index > 0) {
                        acc.push(document.createTextNode(' · '));
                    }
                    acc.push(link);
                    return acc;
                }, []));
                photoEl.append(caption);
            }
        }

        card.querySelector('.entry-timestamp').textContent = `Added ${new Date(entry.createdAt).toLocaleString()}`;

        fragment.append(card);
    }

    if (!fragment.childNodes.length) {
        entriesContainer.innerHTML = '<p class="empty">No entries yet. Add your first mistake above!</p>';
    } else {
        entriesContainer.append(fragment);
    }
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
    const subjects = new Set(state.entries.map((entry) => entry.subject));
    const tagCount = new Set(state.entries.flatMap((entry) => entry.tags));

    if (!total) {
        statsEl.textContent = 'Nothing recorded yet.';
        return;
    }

    statsEl.innerHTML = `
        <span>${total} entr${total === 1 ? 'y' : 'ies'}</span>
        <span>${subjects.size} subject${subjects.size === 1 ? '' : 's'}</span>
        <span>${tagCount.size} unique tag${tagCount.size === 1 ? '' : 's'}</span>
    `;
}

function populateSubjectFilter() {
    const current = subjectFilter.value;
    subjectFilter.innerHTML = '<option value="">All</option>';
    const subjects = Array.from(new Set(state.entries.map((entry) => entry.subject))).sort();
    for (const subject of subjects) {
        const option = document.createElement('option');
        option.value = subject;
        option.textContent = subject;
        if (subject === current) option.selected = true;
        subjectFilter.append(option);
    }
}

function filteredEntries() {
    return state.entries
        .filter((entry) => {
            if (state.filters.subject && entry.subject !== state.filters.subject) return false;
            if (!state.filters.search) return true;
            const haystack = [entry.title, entry.description, entry.reason, entry.comments, entry.tags.join(' ')].join(' ').toLowerCase();
            return haystack.includes(state.filters.search);
        })
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

function openEditDialog(entry) {
    document.getElementById('edit-id').value = entry.id;
    document.getElementById('edit-subject').value = entry.subject;
    document.getElementById('edit-title').value = entry.title;
    document.getElementById('edit-description').value = entry.description;
    document.getElementById('edit-reason').value = entry.reason;
    document.getElementById('edit-comments').value = entry.comments;
    document.getElementById('edit-tags').value = entry.tags.join(', ');

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
        list.innerHTML = '<li>No similar exercises found yet.</li>';
    } else {
        for (const { item, score } of scores) {
            const li = document.createElement('li');
            li.innerHTML = `<strong>${item.title}</strong> (${item.subject}) – similarity ${(score * 100).toFixed(0)}%`;
            list.append(li);
        }
    }

    listContainer.hidden = false;
}

function embedding(entry) {
    const text = [entry.title, entry.description, entry.reason, entry.comments, entry.tags.join(' ')].join(' ').toLowerCase();
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

function parseTags(input) {
    return (input || '')
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean)
        .map((tag) => tag.toLowerCase());
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
        'list-entries': 'Entries viewed'
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
            return formatSubjectLine(details, { includePhoto: true });
        case 'update-entry':
            return formatSubjectLine(details);
        case 'delete-entry':
            return formatSubjectLine(details);
        case 'clear-entries':
            if (typeof details.removed === 'number') {
                return `Removed ${details.removed} entr${details.removed === 1 ? 'y' : 'ies'}.`;
            }
            return '';
        case 'import-entries': {
            const parts = [];
            if (typeof details.added === 'number') {
                parts.push(`Added ${details.added} new entr${details.added === 1 ? 'y' : 'ies'}`);
            }
            if (typeof details.total === 'number') {
                parts.push(`Now tracking ${details.total} total entr${details.total === 1 ? 'y' : 'ies'}`);
            }
            return parts.join('. ');
        }
        case 'list-entries':
            if (typeof details.total === 'number') {
                return `Total entries available: ${details.total}.`;
            }
            return '';
        default:
            if (!Object.keys(details).length) return '';
            return Object.entries(details)
                .map(([key, value]) => `${key}: ${value}`)
                .join(', ');
    }
}

function formatSubjectLine(details, options = {}) {
    if (!details) return '';
    const subject = details.subject ? `Subject: ${details.subject}` : null;
    const id = details.id ? `ID: ${details.id}` : null;
    const parts = [subject || id];
    if (options.includePhoto && typeof details.photo === 'boolean') {
        parts.push(details.photo ? 'Photo uploaded' : 'No photo');
    }
    return parts.filter(Boolean).join(' • ');
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
    const photoUrl = raw.photoUrl || null;
    const photoResizedUrl = raw.photoResizedUrl || null;
    const previewUrl = photoResizedUrl || photoUrl;
    return {
        id: raw.id,
        subject: raw.subject,
        title: raw.title,
        description: raw.description,
        reason: raw.reason,
        comments: raw.comments,
        tags: Array.isArray(raw.tags) ? raw.tags : [],
        photoUrl,
        photoResizedUrl,
        photoSrc: resolvePhotoUrl(previewUrl),
        photoOriginalSrc: resolvePhotoUrl(photoUrl),
        photoResizedSrc: resolvePhotoUrl(photoResizedUrl),
        createdAt: raw.createdAt,
        updatedAt: raw.updatedAt
    };
}

async function prepareEntryForExport(entry) {
    const normalized = normalizeEntry(entry);
    const { photoSrc, photoOriginalSrc, photoResizedSrc, ...exportEntry } = normalized;
    const result = { ...exportEntry };

    if (!exportEntry.photoUrl) {
        return result;
    }

    if (exportEntry.photoUrl) {
        try {
            const originalResponse = await fetch(photoOriginalSrc || photoSrc || exportEntry.photoUrl);
            if (!originalResponse.ok) throw new Error('Failed to fetch photo');
            const originalBlob = await originalResponse.blob();
            result.photoDataUrl = await readBlobAsDataUrl(originalBlob);
        } catch (error) {
            console.error('Failed to include photo in export', error);
        }
    }

    if (exportEntry.photoResizedUrl) {
        try {
            const resizedResponse = await fetch(photoResizedSrc || photoSrc || exportEntry.photoResizedUrl);
            if (!resizedResponse.ok) throw new Error('Failed to fetch resized photo');
            const resizedBlob = await resizedResponse.blob();
            result.photoResizedDataUrl = await readBlobAsDataUrl(resizedBlob);
        } catch (error) {
            console.error('Failed to include resized photo in export', error);
        }
    }

    return result;
}

function readBlobAsDataUrl(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = (error) => reject(error);
        reader.readAsDataURL(blob);
    });
}

function resolvePhotoUrl(url) {
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
