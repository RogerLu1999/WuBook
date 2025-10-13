const state = {
    entries: [],
    filters: {
        search: '',
        type: '',
        subject: '',
        semester: '',
        source: '',
        errorReason: '',
        dateStart: '',
        dateEnd: ''
    },
    logs: [],
    selectedIds: new Set()
};

const collator = new Intl.Collator('zh-Hans-CN', { numeric: true, sensitivity: 'base' });

const entryForm = document.getElementById('entry-form');
const importInput = document.getElementById('import-input');
const exportBtn = document.getElementById('export-btn');
const exportPaperBtn = document.getElementById('export-paper-btn');
const clearBtn = document.getElementById('clear-btn');
const entriesContainer = document.getElementById('entries');
const entriesTable = document.getElementById('entries-table');
const entriesTableBody = entriesTable?.querySelector('tbody') || null;
const statsEl = document.getElementById('stats');
const searchInput = document.getElementById('search');
const typeFilter = document.getElementById('type-filter');
const subjectFilter = document.getElementById('subject-filter');
const semesterFilter = document.getElementById('semester-filter');
const sourceFilter = document.getElementById('source-filter');
const errorReasonFilter = document.getElementById('error-reason-filter');
const dateStartInput = document.getElementById('date-start');
const dateEndInput = document.getElementById('date-end');
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
const entryPanel = document.getElementById('entry-panel');
const logPanel = document.getElementById('log-panel');
const openEntryPanelLink = document.getElementById('open-entry-panel');
const closeEntryPanelLink = document.getElementById('close-entry-panel');
const openLogPanelLink = document.getElementById('open-log-panel');
const closeLogPanelLink = document.getElementById('close-log-panel');
const mathShortcutLink = document.getElementById('math-shortcut');

let exportInProgress = null;

let logStatusTimeout;
let logLoading = false;

setCreatedAtDefaultValue();
hideEntryPanel({ scroll: false });
hideLogPanel({ scroll: false });

init();

entryForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(entryForm);

    const subject = (formData.get('subject') || '').toString().trim();
    const semester = (formData.get('semester') || '').toString().trim();
    const questionText = (formData.get('questionText') || '').toString().trim();
    const answerText = (formData.get('answerText') || '').toString().trim();
    const remark = (formData.get('remark') || '').toString().trim();
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

    formData.set('subject', subject);
    formData.set('semester', semester);
    formData.set('questionText', questionText);
    formData.set('answerText', answerText);
    formData.set('remark', remark);

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
        hideEntryPanel();
        document.getElementById('entries-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        loadActivityLog();
    } catch (error) {
        console.error(error);
        alert('Unable to save entry. Please try again.');
        loadActivityLog();
    }
});

searchInput?.addEventListener('input', (event) => {
    state.filters.search = event.target.value.toLowerCase();
    applyFilters();
});

typeFilter?.addEventListener('change', (event) => {
    state.filters.type = event.target.value;
    applyFilters();
});

subjectFilter?.addEventListener('change', (event) => {
    state.filters.subject = event.target.value;
    applyFilters();
});

semesterFilter?.addEventListener('change', (event) => {
    state.filters.semester = event.target.value;
    applyFilters();
});

sourceFilter?.addEventListener('change', (event) => {
    state.filters.source = event.target.value;
    applyFilters();
});

errorReasonFilter?.addEventListener('change', (event) => {
    state.filters.errorReason = event.target.value;
    applyFilters();
});

dateStartInput?.addEventListener('change', (event) => {
    state.filters.dateStart = event.target.value;
    applyFilters();
});

dateEndInput?.addEventListener('change', (event) => {
    state.filters.dateEnd = event.target.value;
    applyFilters();
});

mathShortcutLink?.addEventListener('click', (event) => {
    event.preventDefault();
    if (subjectFilter) {
        subjectFilter.value = '数学';
    }
    state.filters.subject = '数学';
    applyFilters();
});

openEntryPanelLink?.addEventListener('click', (event) => {
    event.preventDefault();
    showEntryPanel();
});

closeEntryPanelLink?.addEventListener('click', (event) => {
    event.preventDefault();
    hideEntryPanel();
});

openLogPanelLink?.addEventListener('click', (event) => {
    event.preventDefault();
    showLogPanel();
});

closeLogPanelLink?.addEventListener('click', (event) => {
    event.preventDefault();
    hideLogPanel();
});

exportBtn.addEventListener('click', async () => {
    await exportSelection({
        type: 'word',
        endpoint: '/api/entries/export',
        fallbackName: `wubook-selection-${new Date().toISOString().split('T')[0]}.docx`,
        errorMessage: 'Failed to export entries.'
    });
});

exportPaperBtn?.addEventListener('click', async () => {
    await exportSelection({
        type: 'paper',
        endpoint: '/api/entries/export-paper',
        fallbackName: `wubook-paper-${new Date().toISOString().split('T')[0]}.docx`,
        errorMessage: 'Failed to export paper.'
    });
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
        alert('Failed to import entries. Please ensure the file is a Wu(悟)Book export.');
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

    const action = button.dataset.action;
    if (!action) return;

    if (action === 'toggle-details') {
        const summaryRow = button.closest('.entry-row');
        if (!summaryRow) return;
        toggleEntryDetails(summaryRow.dataset.id, button);
        return;
    }

    const host = button.closest('[data-id]');
    const id = host?.dataset.id;
    if (!id) return;

    const entry = state.entries.find((item) => item.id === id);
    if (!entry) return;

    switch (action) {
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
            showSimilarEntries(entry);
            break;
    }
});

entriesContainer.addEventListener('change', (event) => {
    const checkbox = event.target.closest('.entry-select-input');
    if (!checkbox) return;

    const summaryRow = checkbox.closest('.entry-row');
    const id = summaryRow?.dataset.id;
    if (!id) return;

    if (checkbox.checked) {
        state.selectedIds.add(id);
    } else {
        state.selectedIds.delete(id);
    }

    summaryRow?.classList.toggle('entry-row--selected', checkbox.checked);
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
        subject: document.getElementById('edit-subject').value.trim(),
        semester: document.getElementById('edit-semester').value.trim(),
        questionType: document.getElementById('edit-question-type').value.trim(),
        createdAt: document.getElementById('edit-created-at').value,
        errorReason: document.getElementById('edit-error-reason').value.trim(),
        questionText: document.getElementById('edit-question-text').value.trim(),
        answerText: document.getElementById('edit-answer-text').value.trim(),
        remark: document.getElementById('edit-remark').value.trim()
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
    populateFilterOptions();
    const filtered = renderEntries();
    renderStats();
    renderActivityLog();
    updateSelectionUI(filtered);
}

function applyFilters() {
    const filtered = renderEntries();
    updateSelectionUI(filtered);
}

function renderEntries() {
    if (!entriesTableBody) {
        return [];
    }

    entriesTableBody.innerHTML = '';
    const entries = filteredEntries();

    if (!entries.length) {
        const emptyRow = document.createElement('tr');
        emptyRow.className = 'entries-empty-row';
        const emptyCell = document.createElement('td');
        emptyCell.colSpan = 9;
        emptyCell.textContent = '暂无记录，请先添加错题。';
        emptyRow.append(emptyCell);
        entriesTableBody.append(emptyRow);
        return entries;
    }

    const fragment = document.createDocumentFragment();

    for (const entry of entries) {
        const rowFragment = entryTemplate.content.cloneNode(true);
        const summaryRow = rowFragment.querySelector('.entry-row');
        const detailRow = rowFragment.querySelector('.entry-detail-row');
        if (!summaryRow || !detailRow) {
            continue;
        }

        summaryRow.dataset.id = entry.id;
        detailRow.dataset.id = entry.id;

        const isSelected = state.selectedIds.has(entry.id);
        summaryRow.classList.toggle('entry-row--selected', isSelected);

        const selectInput = summaryRow.querySelector('.entry-select-input');
        if (selectInput) {
            selectInput.checked = isSelected;
        }

        const summaryTextEl = summaryRow.querySelector('.entry-summary-text');
        const summaryImageEl = summaryRow.querySelector('.entry-summary-image');
        const summaryImage = summaryImageEl?.querySelector('img');
        const normalizedQuestion = (entry.questionText || '').replace(/\s+/g, ' ').trim();

        if (normalizedQuestion) {
            if (summaryTextEl) {
                summaryTextEl.textContent = truncateText(normalizedQuestion, 60);
                summaryTextEl.hidden = false;
            }
            if (summaryImageEl) {
                summaryImageEl.hidden = true;
            }
            if (summaryImage) {
                summaryImage.src = '';
            }
        } else if (entry.questionImageSrc) {
            if (summaryTextEl) {
                summaryTextEl.textContent = '';
                summaryTextEl.hidden = true;
            }
            if (summaryImageEl && summaryImage) {
                summaryImage.src = entry.questionImageSrc;
                summaryImageEl.hidden = false;
            }
        } else if (summaryTextEl) {
            const fallbackText = entry.summary || '';
            summaryTextEl.textContent = fallbackText ? truncateText(fallbackText, 60) : '—';
            summaryTextEl.hidden = false;
            if (summaryImageEl) {
                summaryImageEl.hidden = true;
            }
            if (summaryImage) {
                summaryImage.src = '';
            }
        }

        const subjectCell = summaryRow.querySelector('.entry-cell--subject');
        if (subjectCell) {
            if (entry.subject) {
                subjectCell.textContent = entry.subject;
                subjectCell.title = entry.subject;
            } else {
                subjectCell.textContent = '—';
                subjectCell.removeAttribute('title');
            }
        }

        const typeCell = summaryRow.querySelector('.entry-cell--type');
        if (typeCell) {
            const typeParts = [entry.semester, entry.questionType].filter(Boolean).join(' · ');
            if (typeParts) {
                typeCell.textContent = typeParts;
                typeCell.title = typeParts;
            } else {
                typeCell.textContent = '—';
                typeCell.removeAttribute('title');
            }
        }

        const reasonCell = summaryRow.querySelector('.entry-cell--reason');
        if (reasonCell) {
            if (entry.errorReason) {
                reasonCell.textContent = truncateText(entry.errorReason, 20);
                reasonCell.title = entry.errorReason;
            } else {
                reasonCell.textContent = '—';
                reasonCell.removeAttribute('title');
            }
        }

        const sourceCell = summaryRow.querySelector('.entry-cell--source');
        if (sourceCell) {
            if (entry.source) {
                sourceCell.textContent = entry.source;
                sourceCell.title = entry.source;
            } else {
                sourceCell.textContent = '—';
                sourceCell.removeAttribute('title');
            }
        }

        const remarkCell = summaryRow.querySelector('.entry-cell--remark');
        if (remarkCell) {
            if (entry.remark) {
                remarkCell.textContent = truncateText(entry.remark, 20);
                remarkCell.title = entry.remark;
            } else {
                remarkCell.textContent = '—';
                remarkCell.removeAttribute('title');
            }
        }

        const updatedCell = summaryRow.querySelector('.entry-cell--updated');
        if (updatedCell) {
            if (entry.updatedAt) {
                updatedCell.textContent = formatRelativeTime(entry.updatedAt);
                updatedCell.title = new Date(entry.updatedAt).toLocaleString();
            } else {
                updatedCell.textContent = '—';
                updatedCell.removeAttribute('title');
            }
        }

        const toggleButton = summaryRow.querySelector('[data-action="toggle-details"]');
        if (toggleButton) {
            toggleButton.setAttribute('aria-expanded', detailRow.hidden ? 'false' : 'true');
        }

        const codeEl = detailRow.querySelector('.entry-detail__code');
        if (codeEl) {
            if (entry.questionCode) {
                codeEl.textContent = entry.questionCode;
                codeEl.hidden = false;
                codeEl.dataset.label = '编号';
            } else {
                codeEl.textContent = '';
                codeEl.hidden = true;
                delete codeEl.dataset.label;
            }
        }

        const createdEl = detailRow.querySelector('.entry-detail__created');
        if (createdEl) {
            createdEl.dataset.label = '创建';
            createdEl.textContent = entry.createdAt
                ? new Date(entry.createdAt).toLocaleString()
                : '—';
        }

        const updatedDetailEl = detailRow.querySelector('.entry-detail__updated');
        if (updatedDetailEl) {
            updatedDetailEl.dataset.label = '最近更新';
            updatedDetailEl.textContent = entry.updatedAt
                ? new Date(entry.updatedAt).toLocaleString()
                : '—';
        }

        const subjectDetailEl = detailRow.querySelector('.entry-detail__subject');
        if (subjectDetailEl) {
            subjectDetailEl.dataset.label = '学科';
            if (entry.subject) {
                subjectDetailEl.textContent = entry.subject;
            } else {
                subjectDetailEl.textContent = '—';
            }
        }

        const typeDetailEl = detailRow.querySelector('.entry-detail__type');
        if (typeDetailEl) {
            typeDetailEl.dataset.label = '题型';
            const typeParts = [entry.semester, entry.questionType].filter(Boolean).join(' · ');
            typeDetailEl.textContent = typeParts || '—';
        }

        const sourceDetailEl = detailRow.querySelector('.entry-detail__source');
        if (sourceDetailEl) {
            sourceDetailEl.dataset.label = '来源';
            sourceDetailEl.textContent = entry.source || '—';
        }

        const questionSection = detailRow.querySelector('.entry-section--question');
        const questionTextEl = detailRow.querySelector('.entry-question-text');
        const questionFigure = detailRow.querySelector('.entry-question-image');
        const answerSection = detailRow.querySelector('.entry-section--answer');
        const answerTextEl = detailRow.querySelector('.entry-answer-text');
        const answerFigure = detailRow.querySelector('.entry-answer-image');
        const errorReasonEl = detailRow.querySelector('.entry-error-reason');
        const remarkEl = detailRow.querySelector('.entry-remark');
        const similarSection = detailRow.querySelector('.entry-similar');
        const similarList = similarSection?.querySelector('ul');

        const hasQuestionText = Boolean(entry.questionText);
        if (questionTextEl) {
            questionTextEl.textContent = entry.questionText || '';
            questionTextEl.hidden = !hasQuestionText;
        }
        if (questionFigure) {
            questionFigure.innerHTML = '';
        }
        const hasQuestionImage = Boolean(entry.questionImageSrc);
        if (hasQuestionImage && questionFigure) {
            appendImageLink(
                questionFigure,
                entry.questionImageOriginalSrc || entry.questionImageSrc,
                '查看题目图片'
            );
            questionFigure.hidden = false;
        } else if (questionFigure) {
            questionFigure.hidden = true;
        }
        if (questionSection) {
            questionSection.hidden = !hasQuestionText && !hasQuestionImage;
        }

        const hasAnswerText = Boolean(entry.answerText);
        if (answerTextEl) {
            answerTextEl.textContent = entry.answerText || '';
            answerTextEl.hidden = !hasAnswerText;
        }
        if (answerFigure) {
            answerFigure.innerHTML = '';
        }
        const hasAnswerImage = Boolean(entry.answerImageSrc);
        if (hasAnswerImage && answerFigure) {
            appendImageLink(
                answerFigure,
                entry.answerImageOriginalSrc || entry.answerImageSrc,
                '查看答案图片'
            );
            answerFigure.hidden = false;
        } else if (answerFigure) {
            answerFigure.hidden = true;
        }
        if (answerSection) {
            answerSection.hidden = !hasAnswerText && !hasAnswerImage;
        }

        if (errorReasonEl) {
            if (entry.errorReason) {
                errorReasonEl.textContent = `错误原因：${entry.errorReason}`;
                errorReasonEl.hidden = false;
            } else {
                errorReasonEl.textContent = '';
                errorReasonEl.hidden = true;
            }
        }

        if (remarkEl) {
            if (entry.remark) {
                remarkEl.textContent = `备注：${entry.remark}`;
                remarkEl.hidden = false;
            } else {
                remarkEl.textContent = '';
                remarkEl.hidden = true;
            }
        }

        if (similarSection && similarList) {
            similarList.innerHTML = '';
            similarSection.hidden = true;
        }

        fragment.append(rowFragment);
    }

    entriesTableBody.append(fragment);

    return entries;
}

function getEntryRows(id) {
    if (!id || !entriesContainer) {
        return { summaryRow: null, detailRow: null };
    }
    const selectorId =
        typeof CSS !== 'undefined' && CSS.escape
            ? CSS.escape(id)
            : id.replace(/\\/g, '\\\\').replace(/"/g, '\"');
    return {
        summaryRow: entriesContainer.querySelector(`.entry-row[data-id="${selectorId}"]`),
        detailRow: entriesContainer.querySelector(`.entry-detail-row[data-id="${selectorId}"]`)
    };
}

function ensureEntryDetailsVisible(id) {
    const { summaryRow, detailRow } = getEntryRows(id);
    if (!detailRow) return null;
    if (detailRow.hidden) {
        detailRow.hidden = false;
        summaryRow?.querySelector('[data-action="toggle-details"]')?.setAttribute('aria-expanded', 'true');
    }
    return detailRow;
}

function toggleEntryDetails(id, triggerButton) {
    const { summaryRow, detailRow } = getEntryRows(id);
    if (!detailRow) return;
    const willShow = detailRow.hidden;
    detailRow.hidden = !willShow;
    const button = triggerButton || summaryRow?.querySelector('[data-action="toggle-details"]');
    if (button) {
        button.setAttribute('aria-expanded', willShow ? 'true' : 'false');
    }
    if (willShow) {
        detailRow.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

function appendImageLink(container, src, label) {
    const link = document.createElement('a');
    link.href = src;
    link.target = '_blank';
    link.rel = 'noopener';
    link.className = 'entry-image-link';
    link.textContent = label || '查看图片';
    container.append(link);
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
    const subjects = new Set(state.entries.map((entry) => entry.subject).filter(Boolean));
    const semesters = new Set(state.entries.map((entry) => entry.semester).filter(Boolean));
    const sources = new Set(state.entries.map((entry) => entry.source).filter(Boolean));

    if (!total) {
        statsEl.textContent = '暂无记录。';
        return;
    }

    statsEl.innerHTML = `
        <span>${total} 条记录</span>
        <span>${subjects.size} 个学科</span>
        <span>${types.size} 种题目类型</span>
        <span>${semesters.size} 个学期</span>
        <span>${sources.size} 个来源</span>
    `;
}

function populateFilterOptions() {
    populateSelect(typeFilter, state.entries.map((entry) => entry.questionType), 'type');
    const subjects = state.entries.map((entry) => entry.subject);
    subjects.push('数学');
    populateSelect(subjectFilter, subjects, 'subject');
    populateSelect(semesterFilter, state.entries.map((entry) => entry.semester), 'semester');
    populateSelect(sourceFilter, state.entries.map((entry) => entry.source), 'source');
    populateSelect(errorReasonFilter, state.entries.map((entry) => entry.errorReason), 'errorReason');
}

function populateSelect(selectElement, values, filterKey) {
    if (!selectElement) return;

    const currentValue = selectElement.value;
    const desiredValue = filterKey ? state.filters[filterKey] : currentValue;
    const normalizedValues = values
        .map((value) => (value ?? '').toString().trim())
        .filter(Boolean);
    const uniqueValues = Array.from(new Set(normalizedValues)).sort((a, b) => collator.compare(a, b));

    selectElement.innerHTML = '<option value="">全部</option>';
    for (const value of uniqueValues) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value;
        selectElement.append(option);
    }

    const activeValue = desiredValue && uniqueValues.includes(desiredValue) ? desiredValue : null;

    if (activeValue) {
        selectElement.value = activeValue;
        if (filterKey) {
            state.filters[filterKey] = activeValue;
        }
    } else {
        selectElement.value = '';
        if (filterKey) {
            state.filters[filterKey] = '';
        }
    }
}

function filteredEntries() {
    const {
        search,
        type,
        subject,
        semester,
        source,
        errorReason,
        dateStart,
        dateEnd
    } = state.filters;

    const startDate = dateStart ? new Date(dateStart) : null;
    const endDate = dateEnd ? new Date(dateEnd) : null;
    if (endDate) {
        endDate.setDate(endDate.getDate() + 1);
    }

    return state.entries
        .filter((entry) => {
            if (type && entry.questionType !== type) return false;
            if (subject && entry.subject !== subject) return false;
            if (semester && entry.semester !== semester) return false;
            if (source && entry.source !== source) return false;
            if (errorReason && entry.errorReason !== errorReason) return false;

            if (startDate || endDate) {
                const createdAt = entry.createdAt ? new Date(entry.createdAt) : null;
                if (startDate && (!createdAt || createdAt < startDate)) return false;
                if (endDate && (!createdAt || createdAt >= endDate)) return false;
            }

            if (!search) return true;

            const haystack = [
                entry.subject,
                entry.questionType,
                entry.semester,
                entry.source,
                entry.questionCode,
                entry.questionText,
                entry.answerText,
                entry.errorReason,
                entry.summary,
                entry.remark
            ]
                .join(' ')
                .toLowerCase();
            return haystack.includes(search);
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
    if (!entriesTableBody) return;
    const rows = entriesTableBody.querySelectorAll('.entry-row');
    for (const row of rows) {
        const id = row.dataset.id;
        const isSelected = state.selectedIds.has(id);
        row.classList.toggle('entry-row--selected', isSelected);
        const checkbox = row.querySelector('.entry-select-input');
        if (checkbox) {
            checkbox.checked = isSelected;
        }
    }
}

async function exportSelection(options) {
    const { type, endpoint, fallbackName, errorMessage } = options;
    if (!state.selectedIds.size || exportInProgress) {
        if (!state.selectedIds.size && !exportInProgress) {
            alert('Select at least one entry to export.');
        }
        return;
    }

    exportInProgress = type;
    updateSelectionUI();

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ ids: Array.from(state.selectedIds) })
        });

        if (!response.ok) {
            let message = errorMessage;
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
        const filename =
            parseFilenameFromContentDisposition(response.headers.get('content-disposition')) || fallbackName;
        link.href = url;
        link.download = filename;
        document.body.append(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    } catch (error) {
        console.error(error);
        alert(error.message || errorMessage);
    } finally {
        exportInProgress = null;
        updateSelectionUI();
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
        exportBtn.disabled = !totalSelected || Boolean(exportInProgress);
        exportBtn.textContent = exportInProgress === 'word' ? '导出中…' : '导出选中（Word）';
    }

    if (exportPaperBtn) {
        exportPaperBtn.disabled = !totalSelected || Boolean(exportInProgress);
        exportPaperBtn.textContent = exportInProgress === 'paper' ? '导出中…' : '导出试卷';
    }

    if (clearSelectionBtn) {
        clearSelectionBtn.disabled = !totalSelected || Boolean(exportInProgress);
    }

    if (selectFilteredBtn) {
        const hasFiltered = filteredEntriesList.length > 0;
        const allFilteredSelected = hasFiltered && filteredEntriesList.every((entry) => state.selectedIds.has(entry.id));
        selectFilteredBtn.disabled =
            !hasFiltered || allFilteredSelected || Boolean(exportInProgress);
    }
}

function showEntryPanel() {
    if (!entryPanel) return;
    if (!entryPanel.hidden) return;
    entryPanel.hidden = false;
    openEntryPanelLink?.setAttribute('aria-expanded', 'true');
    setCreatedAtDefaultValue();
    entryPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    document.getElementById('source')?.focus();
}

function hideEntryPanel(options = {}) {
    if (!entryPanel) return;
    openEntryPanelLink?.setAttribute('aria-expanded', 'false');
    if (entryPanel.hidden) return;
    entryPanel.hidden = true;
    if (options.scroll !== false) {
        document.getElementById('entries-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

function showLogPanel() {
    if (!logPanel) return;
    if (!logPanel.hidden) return;
    logPanel.hidden = false;
    openLogPanelLink?.setAttribute('aria-expanded', 'true');
    logPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    loadActivityLog({ userRequested: true });
}

function hideLogPanel(options = {}) {
    if (!logPanel) return;
    openLogPanelLink?.setAttribute('aria-expanded', 'false');
    if (logPanel.hidden) return;
    logPanel.hidden = true;
    if (options.scroll !== false) {
        document.getElementById('entries-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
    document.getElementById('edit-subject').value = entry.subject || '';
    document.getElementById('edit-semester').value = entry.semester || '';
    document.getElementById('edit-question-type').value = entry.questionType || '';
    document.getElementById('edit-created-at').value = toDateInputValue(entry.createdAt);
    document.getElementById('edit-error-reason').value = entry.errorReason || '';
    document.getElementById('edit-question-text').value = entry.questionText || '';
    document.getElementById('edit-answer-text').value = entry.answerText || '';
    document.getElementById('edit-remark').value = entry.remark || '';

    editDialog.showModal();
}

function showSimilarEntries(entry) {
    const detailRow = ensureEntryDetailsVisible(entry.id);
    if (!detailRow) return;

    const listContainer = detailRow.querySelector('.entry-similar');
    const list = listContainer?.querySelector('ul');
    if (!listContainer || !list) return;

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
        entry.subject,
        entry.semester,
        entry.questionType,
        entry.source,
        entry.questionText,
        entry.answerText,
        entry.errorReason,
        entry.summary,
        entry.remark
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
        'export-entries': 'Entries exported',
        'export-paper': 'Paper exported'
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
        case 'export-paper':
            if (typeof details.count === 'number') {
                return `已准备 ${details.count} 条记录用于试卷导出。`;
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
    if (details.questionCode) {
        parts.push(`编号：${details.questionCode}`);
    }
    if (details.subject) {
        parts.push(`学科：${details.subject}`);
    }
    if (details.semester) {
        parts.push(`学期：${details.semester}`);
    }
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
    const questionText = raw.questionText || raw.description || raw.title || '';
    const summary = typeof raw.summary === 'string' ? raw.summary.trim() : '';
    const remark = typeof raw.remark === 'string' ? raw.remark.trim() : '';
    return {
        id: raw.id,
        questionCode: raw.questionCode || '',
        source: raw.source || '',
        subject: raw.subject || '',
        semester: raw.semester || '',
        questionType: raw.questionType || raw.subject || '',
        questionText,
        answerText: raw.answerText || raw.comments || '',
        errorReason: raw.errorReason || raw.reason || '',
        summary: summary || computeQuestionSummary(questionText, Boolean(questionPreview)),
        remark,
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

function computeQuestionSummary(text, hasImage) {
    const normalized = (text || '').replace(/\s+/g, ' ').trim();
    if (normalized) {
        const chars = Array.from(normalized);
        const limit = 20;
        const truncated = chars.slice(0, limit).join('');
        return chars.length > limit ? `${truncated}…` : truncated;
    }
    if (hasImage) {
        return '题目图片（无文字）';
    }
    return '';
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
