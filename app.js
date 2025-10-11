const STORAGE_KEY = 'wubook-entries-v1';

const state = {
    entries: loadEntries(),
    filters: {
        search: '',
        subject: ''
    }
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

render();

entryForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(entryForm);

    const entry = {
        id: crypto.randomUUID(),
        subject: formData.get('subject').trim(),
        title: formData.get('title').trim(),
        description: formData.get('description').trim(),
        reason: formData.get('reason').trim(),
        comments: formData.get('comments').trim(),
        tags: parseTags(formData.get('tags')),
        photo: await readFileAsDataUrl(formData.get('photo')),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    state.entries.unshift(entry);
    persist();
    entryForm.reset();
    render();
});

searchInput.addEventListener('input', (event) => {
    state.filters.search = event.target.value.toLowerCase();
    renderEntries();
});

subjectFilter.addEventListener('change', (event) => {
    state.filters.subject = event.target.value;
    renderEntries();
});

exportBtn.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(state.entries, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `wubook-entries-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
});

importInput.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
        const text = await file.text();
        const imported = JSON.parse(text);
        if (!Array.isArray(imported)) throw new Error('Invalid format');

        const existingIds = new Set(state.entries.map((entry) => entry.id));
        let addedCount = 0;

        for (const raw of imported) {
            if (!raw.title || !raw.subject) continue;

            const entry = normalizeEntry(raw);
            if (!existingIds.has(entry.id)) {
                state.entries.push(entry);
                existingIds.add(entry.id);
                addedCount += 1;
            }
        }

        persist();
        render();
        alert(`Imported ${addedCount} new entries.`);
    } catch (error) {
        console.error(error);
        alert('Failed to import entries. Please ensure the file is a WuBook export.');
    } finally {
        importInput.value = '';
    }
});

clearBtn.addEventListener('click', () => {
    confirmClearDialog.showModal();
});

confirmClearDialog.addEventListener('close', () => {
    if (confirmClearDialog.returnValue === 'confirm') {
        state.entries = [];
        persist();
        render();
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
                state.entries = state.entries.filter((item) => item.id !== entry.id);
                persist();
                render();
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

    entry.subject = document.getElementById('edit-subject').value.trim();
    entry.title = document.getElementById('edit-title').value.trim();
    entry.description = document.getElementById('edit-description').value.trim();
    entry.reason = document.getElementById('edit-reason').value.trim();
    entry.comments = document.getElementById('edit-comments').value.trim();
    entry.tags = parseTags(document.getElementById('edit-tags').value);
    entry.updatedAt = new Date().toISOString();

    persist();
    render();
});

function render() {
    populateSubjectFilter();
    renderEntries();
    renderStats();
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
        photoEl.innerHTML = '';
        if (entry.photo) {
            const img = document.createElement('img');
            img.src = entry.photo;
            img.alt = `Photo for ${entry.title}`;
            photoEl.append(img);
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

async function readFileAsDataUrl(file) {
    if (!(file instanceof File)) return null;
    if (!file.size) return null;

    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = (error) => reject(error);
        reader.readAsDataURL(file);
    });
}

function loadEntries() {
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        if (!data) return [];
        const parsed = JSON.parse(data);
        if (!Array.isArray(parsed)) return [];
        return parsed.map(normalizeEntry);
    } catch (error) {
        console.error('Failed to parse stored entries', error);
        return [];
    }
}

function normalizeEntry(raw) {
    return {
        id: raw.id || crypto.randomUUID(),
        subject: (raw.subject || '').trim(),
        title: (raw.title || '').trim(),
        description: (raw.description || '').trim(),
        reason: (raw.reason || '').trim(),
        comments: (raw.comments || '').trim(),
        tags: Array.isArray(raw.tags) ? raw.tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean) : parseTags(raw.tags || ''),
        photo: raw.photo || null,
        createdAt: raw.createdAt || new Date().toISOString(),
        updatedAt: raw.updatedAt || raw.createdAt || new Date().toISOString()
    };
}

function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.entries));
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

window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY) {
        state.entries = loadEntries();
        render();
    }
});
