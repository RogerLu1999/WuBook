const state = {
    entries: [],
    filters: {
        search: '',
        type: '',
        subject: '',
        semester: '八上',
        source: '',
        errorReason: '',
        dateStart: '',
        dateEnd: ''
    },
    logs: [],
    selectedIds: new Set(),
    pagination: {
        page: 1,
        pageSize: 10
    }
};

const MIN_IMAGE_ZOOM = 30;
const MAX_IMAGE_ZOOM = 120;
const DEFAULT_IMAGE_ZOOM = 100;

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
const subjectInput = document.getElementById('subject');
const semesterSelect = document.getElementById('semester');
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
const paginationContainer = document.getElementById('pagination');
const paginationInfo = document.getElementById('pagination-info');
const pageSizeSelect = document.getElementById('page-size');
const paginationPrevBtn = document.getElementById('pagination-prev');
const paginationNextBtn = document.getElementById('pagination-next');
const entryPanel = document.getElementById('entry-panel');
const logPanel = document.getElementById('log-panel');
const openEntryPanelLink = document.getElementById('open-entry-panel');
const closeEntryPanelLink = document.getElementById('close-entry-panel');
const photoCheckPanel = document.getElementById('photo-check-panel');
const openPhotoCheckPanelLink = document.getElementById('open-photo-check-panel');
const closePhotoCheckPanelLink = document.getElementById('close-photo-check-panel');
const photoCheckForm = document.getElementById('photo-check-form');
const photoCheckImageInput = document.getElementById('photo-check-image');
const photoCheckSubmitButton = document.getElementById('photo-check-submit');
const photoCheckStatus = document.getElementById('photo-check-status');
const photoCheckResultsSection = document.getElementById('photo-check-results');
const photoCheckSummary = document.getElementById('photo-check-summary');
const photoCheckReport = document.getElementById('photo-check-report');
const photoCheckPreview = document.getElementById('photo-check-preview');
const photoCheckImagePreview = document.getElementById('photo-check-image-preview');
const wizardPanel = document.getElementById('wizard-panel');
const openWizardPanelLink = document.getElementById('open-wizard-panel');
const closeWizardPanelLink = document.getElementById('close-wizard-panel');
const wizardUploadForm = document.getElementById('wizard-upload-form');
const wizardForm = document.getElementById('wizard-form');
const wizardOriginalInput = document.getElementById('wizard-original-image');
const wizardPreview = document.getElementById('wizard-preview');
const wizardPreviewImage = document.getElementById('wizard-preview-image');
const wizardStepUpload = document.getElementById('wizard-step-upload');
const wizardStepDetails = document.getElementById('wizard-step-details');
const wizardBackButton = document.getElementById('wizard-back');
const wizardCancelButton = document.getElementById('wizard-cancel');
const wizardCreatedAtInput = document.getElementById('wizard-created-at');
const wizardSubjectInput = document.getElementById('wizard-subject');
const wizardSemesterSelect = document.getElementById('wizard-semester');
const wizardQuestionTextInput = document.getElementById('wizard-question-text');
const wizardOcrButton = document.getElementById('wizard-ocr-button');
const wizardOcrStatus = document.getElementById('wizard-ocr-status');
const wizardOcrButtonDefaultLabel = wizardOcrButton ? wizardOcrButton.textContent.trim() : '';
const openLogPanelLink = document.getElementById('open-log-panel');
const closeLogPanelLink = document.getElementById('close-log-panel');
const mathShortcutLink = document.getElementById('math-shortcut');
const sourceHistoryList = document.getElementById('source-history');
const questionTypeHistoryList = document.getElementById('question-type-history');

const STORAGE_KEYS = {
    lastSubject: 'wubook:lastSubject',
    sourceHistory: 'wubook:sourceHistory',
    questionTypeHistory: 'wubook:questionTypeHistory'
};

const LOCAL_STORAGE_AVAILABLE = (() => {
    try {
        return typeof window !== 'undefined' && 'localStorage' in window && window.localStorage !== null;
    } catch (error) {
        return false;
    }
})();

let exportInProgress = null;

let logStatusTimeout;
let logLoading = false;

let wizardOriginalFile = null;
let wizardOriginalPreviewUrl = '';
let wizardRecognizedText = '';

setCreatedAtDefaultValue();
setDefaultSubjectAndSemester();
updateEntryFormSuggestions();
hideEntryPanel({ scroll: false });
hideWizardPanel({ scroll: false });
hidePhotoCheckPanel({ scroll: false });
hideLogPanel({ scroll: false });

init();

entryForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const saved = await submitEntry(new FormData(entryForm));
    if (!saved) return;
    entryForm.reset();
    setCreatedAtDefaultValue();
    setDefaultSubjectAndSemester();
    hideEntryPanel();
    document.getElementById('entries-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

openPhotoCheckPanelLink?.addEventListener('click', (event) => {
    event.preventDefault();
    showPhotoCheckPanel();
});

closePhotoCheckPanelLink?.addEventListener('click', (event) => {
    event.preventDefault();
    hidePhotoCheckPanel();
});

photoCheckImageInput?.addEventListener('change', () => {
    setPhotoCheckStatus('');
});

photoCheckForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!photoCheckImageInput || !photoCheckImageInput.files || photoCheckImageInput.files.length === 0) {
        setPhotoCheckStatus('请先选择需要检查的照片。', 'error');
        return;
    }

    const file = photoCheckImageInput.files[0];
    const formData = new FormData();
    formData.append('image', file);

    if (photoCheckSubmitButton) {
        photoCheckSubmitButton.disabled = true;
    }

    resetPhotoCheckResults();
    setPhotoCheckStatus('正在分析照片，请稍候…');

    try {
        const response = await fetch('/api/photo-check', {
            method: 'POST',
            body: formData
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            const message = data?.error || '无法完成检查，请稍后重试。';
            throw new Error(message);
        }

        renderPhotoCheckResults(data);
        const hasProblems = Array.isArray(data?.problems) && data.problems.length > 0;
        setPhotoCheckStatus(hasProblems ? '检查完成，以下为识别结果。' : '检查完成，但未能识别出具体题目。', hasProblems ? 'success' : undefined);
    } catch (error) {
        console.error('Photo check failed', error);
        resetPhotoCheckResults();
        setPhotoCheckStatus(error?.message || '无法完成检查，请稍后重试。', 'error');
    } finally {
        if (photoCheckSubmitButton) {
            photoCheckSubmitButton.disabled = false;
        }
    }
});

openWizardPanelLink?.addEventListener('click', (event) => {
    event.preventDefault();
    showWizardPanel();
});

closeWizardPanelLink?.addEventListener('click', (event) => {
    event.preventDefault();
    hideWizardPanel();
});

wizardCancelButton?.addEventListener('click', (event) => {
    event.preventDefault();
    hideWizardPanel();
});

wizardBackButton?.addEventListener('click', (event) => {
    event.preventDefault();
    showWizardStep('upload');
    wizardOriginalInput?.focus();
});

wizardOriginalInput?.addEventListener('change', () => {
    wizardRecognizedText = '';
    setWizardOcrStatus('');
    setWizardOcrButtonState(false);
});

wizardOcrButton?.addEventListener('click', async (event) => {
    event.preventDefault();
    await extractWizardQuestionText();
});

wizardUploadForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    const file = wizardOriginalInput?.files?.[0] || null;
    if (!file) {
        alert('请选择需要上传的原始图片。');
        return;
    }
    prepareWizardDetailsStepFromFile(file, { focusQuestion: true });
});

wizardForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!wizardOriginalFile) {
        alert('请先上传原始图片。');
        showWizardStep('upload');
        wizardOriginalInput?.focus();
        return;
    }
    const formData = new FormData(wizardForm);
    formData.set('originalImage', wizardOriginalFile);
    const saved = await submitEntry(formData);
    if (!saved) return;
    setDefaultSubjectAndSemester();
    setCreatedAtDefaultValue();
    hideWizardPanel();
    document.getElementById('entries-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

openLogPanelLink?.addEventListener('click', (event) => {
    event.preventDefault();
    showLogPanel();
});

async function submitEntry(formData) {
    if (!(formData instanceof FormData)) {
        return null;
    }

    const normalize = (value) => (value ?? '').toString().trim();

    const source = normalize(formData.get('source'));
    const subject = normalize(formData.get('subject'));
    const semester = normalize(formData.get('semester'));
    const questionType = normalize(formData.get('questionType'));
    const questionText = normalize(formData.get('questionText'));
    const answerText = normalize(formData.get('answerText'));
    const remark = normalize(formData.get('remark'));
    const errorReason = normalize(formData.get('errorReason'));
    const questionImage = formData.get('questionImage');
    const answerImage = formData.get('answerImage');
    const originalImage = formData.get('originalImage');

    const hasQuestionImage = questionImage instanceof File && questionImage.size > 0;
    const hasAnswerImage = answerImage instanceof File && answerImage.size > 0;
    const hasOriginalImage = originalImage instanceof File && originalImage.size > 0;

    if (!questionText && !hasQuestionImage) {
        alert('请填写题目文字或上传题目图片。');
        return null;
    }

    if (!answerText && !hasAnswerImage) {
        alert('请填写答案文字或上传答案图片。');
        return null;
    }

    formData.set('source', source);
    formData.set('subject', subject);
    formData.set('semester', semester);
    formData.set('questionType', questionType);
    formData.set('questionText', questionText);
    formData.set('answerText', answerText);
    formData.set('remark', remark);
    formData.set('errorReason', errorReason);

    if (!hasOriginalImage) {
        formData.delete('originalImage');
    }

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
        rememberLastSubject(subject);
        rememberHistoryValue(STORAGE_KEYS.sourceHistory, source);
        rememberHistoryValue(STORAGE_KEYS.questionTypeHistory, questionType);
        state.entries.unshift(normalizeEntry(entry));
        render();
        return entry;
    } catch (error) {
        console.error(error);
        alert('Unable to save entry. Please try again.');
        return null;
    } finally {
        await loadActivityLog();
    }
}

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
    }
});

entriesContainer.addEventListener('input', (event) => {
    const slider = event.target.closest('.entry-image-zoom__input');
    if (!slider) return;

    const percent = normalizeZoomPercent(slider.value);
    slider.value = String(percent);

    const control = slider.closest('.entry-image-zoom');
    const valueEl = control?.querySelector('.entry-image-zoom__value');
    if (valueEl) {
        valueEl.textContent = `${percent}%`;
    }

    const detailRow = slider.closest('.entry-detail-row');
    const figure = detailRow?.querySelector('.entry-question-image');
    if (figure) {
        figure.style.setProperty('--image-zoom', percent);
    }
});

entriesContainer.addEventListener('change', (event) => {
    const slider = event.target.closest('.entry-image-zoom__input');
    if (slider) {
        const id = slider.dataset.entryId;
        if (id) {
            updateQuestionImageZoom(id, normalizeZoomPercent(slider.value), slider);
        }
        return;
    }

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

pageSizeSelect?.addEventListener('change', (event) => {
    const value = Number(event.target.value);
    if (!Number.isFinite(value) || value <= 0) {
        return;
    }

    state.pagination.pageSize = value;
    state.pagination.page = 1;
    const filtered = renderEntries();
    updateSelectionUI(filtered);
});

paginationPrevBtn?.addEventListener('click', () => {
    if (state.pagination.page <= 1) {
        return;
    }

    state.pagination.page -= 1;
    const filtered = renderEntries();
    updateSelectionUI(filtered);
});

paginationNextBtn?.addEventListener('click', () => {
    const entries = filteredEntries();
    const pageSize = Math.max(1, state.pagination.pageSize || 1);
    const totalPages = Math.max(1, Math.ceil(entries.length / pageSize));
    if (state.pagination.page >= totalPages) {
        return;
    }

    state.pagination.page += 1;
    const filtered = renderEntries();
    updateSelectionUI(filtered);
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
    updateEntryFormSuggestions();
    renderActivityLog();
    updateSelectionUI(filtered);
}

function applyFilters() {
    state.pagination.page = 1;
    const filtered = renderEntries();
    updateSelectionUI(filtered);
}

function renderEntries() {
    if (!entriesTableBody) {
        return [];
    }

    entriesTableBody.innerHTML = '';
    const entries = filteredEntries();
    let pageSize = Math.max(1, Number(state.pagination.pageSize) || 1);
    if (state.pagination.pageSize !== pageSize) {
        state.pagination.pageSize = pageSize;
    }

    const totalEntries = entries.length;
    const totalPages = totalEntries ? Math.ceil(totalEntries / pageSize) : 1;
    const safePage = Math.min(Math.max(1, Number(state.pagination.page) || 1), totalPages);
    if (state.pagination.page !== safePage) {
        state.pagination.page = safePage;
    }
    const startIndex = totalEntries ? (state.pagination.page - 1) * pageSize : 0;
    const visibleEntries = totalEntries
        ? entries.slice(startIndex, Math.min(startIndex + pageSize, totalEntries))
        : [];

    updatePaginationUI({
        totalEntries,
        totalPages,
        page: state.pagination.page,
        pageSize,
        visibleCount: visibleEntries.length,
        startIndex
    });

    if (!visibleEntries.length) {
        const emptyRow = document.createElement('tr');
        emptyRow.className = 'entries-empty-row';
        const emptyCell = document.createElement('td');
        emptyCell.colSpan = 10;
        emptyCell.textContent = '暂无记录，请先添加错题。';
        emptyRow.append(emptyCell);
        entriesTableBody.append(emptyRow);
        return entries;
    }

    const fragment = document.createDocumentFragment();

    for (const entry of visibleEntries) {
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

        const codeCell = summaryRow.querySelector('.entry-cell--code');
        if (codeCell) {
            if (entry.questionCode) {
                codeCell.textContent = entry.questionCode;
                codeCell.title = entry.questionCode;
            } else {
                codeCell.textContent = '—';
                codeCell.removeAttribute('title');
            }
        }

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
        const questionZoomControl = detailRow.querySelector('.entry-image-zoom--question');
        const questionZoomInput = questionZoomControl?.querySelector('.entry-image-zoom__input');
        const questionZoomValue = questionZoomControl?.querySelector('.entry-image-zoom__value');
        const questionZoomPercent = scaleToZoomPercent(entry.questionImageScale);
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
            questionFigure.style.setProperty('--image-zoom', questionZoomPercent);
        }
        const hasQuestionImage = Boolean(entry.questionImageSrc);
        if (hasQuestionImage && questionFigure) {
            appendImageLink(
                questionFigure,
                entry.questionImageOriginalSrc || entry.questionImageSrc,
                '查看题目图片'
            );
            questionFigure.hidden = false;
            if (questionZoomControl) {
                questionZoomControl.hidden = false;
            }
        } else {
            if (questionFigure) {
                questionFigure.hidden = true;
            }
            if (questionZoomControl) {
                questionZoomControl.hidden = true;
            }
        }
        if (questionZoomInput) {
            questionZoomInput.value = String(questionZoomPercent);
            questionZoomInput.dataset.entryId = entry.id;
        }
        if (questionZoomValue) {
            questionZoomValue.textContent = `${questionZoomPercent}%`;
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

        const originalSection = detailRow.querySelector('.entry-section--original');
        const originalFigure = detailRow.querySelector('.entry-original-image');
        const hasOriginalImage = Boolean(entry.originalImageSrc);
        if (originalFigure) {
            originalFigure.innerHTML = '';
        }
        if (originalSection) {
            if (hasOriginalImage && originalFigure) {
                appendImageLink(
                    originalFigure,
                    entry.originalImageOriginalSrc || entry.originalImageSrc,
                    '查看原始图片'
                );
                originalSection.hidden = false;
            } else {
                originalSection.hidden = true;
            }
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
        const targetRow = summaryRow || detailRow;
        targetRow?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

async function updateQuestionImageZoom(id, zoomPercent, slider) {
    const entryIndex = state.entries.findIndex((item) => item.id === id);
    if (entryIndex === -1) {
        return;
    }

    const previousScale = state.entries[entryIndex].questionImageScale;
    const previousPercent = scaleToZoomPercent(previousScale);
    const targetPercent = normalizeZoomPercent(zoomPercent);
    const targetScale = zoomPercentToScale(targetPercent);

    if (slider) {
        slider.disabled = true;
        slider.setAttribute('aria-busy', 'true');
    }

    try {
        const response = await fetch(`/api/entries/${encodeURIComponent(id)}/question-image-scale`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ zoomPercent: targetPercent })
        });
        if (!response.ok) {
            throw new Error('Failed to update zoom factor');
        }
        const payload = await response.json();
        const normalized = normalizeEntry(payload);
        state.entries[entryIndex] = { ...state.entries[entryIndex], ...normalized };
        let appliedScale = state.entries[entryIndex].questionImageScale;
        if (!Number.isFinite(appliedScale)) {
            appliedScale = targetScale;
        }
        state.entries[entryIndex].questionImageScale = appliedScale;
        const appliedPercent = scaleToZoomPercent(appliedScale);
        updateQuestionImageZoomUI(id, appliedPercent);
        refreshEntryUpdatedAt(state.entries[entryIndex]);
    } catch (error) {
        console.error(error);
        alert('无法保存图片缩放设置。');
        state.entries[entryIndex].questionImageScale = previousScale;
        updateQuestionImageZoomUI(id, previousPercent);
    } finally {
        if (slider) {
            slider.disabled = false;
            slider.removeAttribute('aria-busy');
        }
    }
}

function updateQuestionImageZoomUI(id, percent) {
    const { detailRow } = getEntryRows(id);
    if (!detailRow) {
        return;
    }
    const slider = detailRow.querySelector('.entry-image-zoom__input');
    if (slider) {
        slider.value = String(percent);
    }
    const valueEl = detailRow.querySelector('.entry-image-zoom__value');
    if (valueEl) {
        valueEl.textContent = `${percent}%`;
    }
    const figure = detailRow.querySelector('.entry-question-image');
    if (figure) {
        figure.style.setProperty('--image-zoom', percent);
    }
}

function refreshEntryUpdatedAt(entry) {
    if (!entry || !entry.id) {
        return;
    }
    const { summaryRow, detailRow } = getEntryRows(entry.id);
    const updatedCell = summaryRow?.querySelector('.entry-cell--updated');
    if (updatedCell) {
        if (entry.updatedAt) {
            updatedCell.textContent = formatRelativeTime(entry.updatedAt);
            updatedCell.title = new Date(entry.updatedAt).toLocaleString();
        } else {
            updatedCell.textContent = '—';
            updatedCell.removeAttribute('title');
        }
    }

    const updatedDetailEl = detailRow?.querySelector('.entry-detail__updated');
    if (updatedDetailEl) {
        updatedDetailEl.dataset.label = '最近更新';
        updatedDetailEl.textContent = entry.updatedAt
            ? new Date(entry.updatedAt).toLocaleString()
            : '—';
    }
}

function appendImageLink(container, src, label) {
    if (!container) return;
    const image = document.createElement('img');
    image.src = src;
    image.alt = label || '';
    image.loading = 'lazy';
    image.decoding = 'async';
    image.className = 'entry-detail__image';
    image.addEventListener('click', () => {
        window.open(src, '_blank', 'noopener');
    });
    container.append(image);
}

function truncateText(text, limit) {
    if (!text) return '';
    if (text.length <= limit) return text;
    return `${text.slice(0, limit)}…`;
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function normalizeZoomPercent(value) {
    const numeric = typeof value === 'number' ? value : Number.parseFloat(value);
    if (!Number.isFinite(numeric)) {
        return DEFAULT_IMAGE_ZOOM;
    }
    return clamp(Math.round(numeric), MIN_IMAGE_ZOOM, MAX_IMAGE_ZOOM);
}

function scaleToZoomPercent(scale) {
    if (!Number.isFinite(scale)) {
        return DEFAULT_IMAGE_ZOOM;
    }
    return normalizeZoomPercent(scale * 100);
}

function zoomPercentToScale(percent) {
    return normalizeZoomPercent(percent) / 100;
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
    const semesters = state.entries.map((entry) => entry.semester);
    semesters.push('八上');
    populateSelect(semesterFilter, semesters, 'semester');
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

function updateEntryFormSuggestions() {
    updateDatalistOptions(
        sourceHistoryList,
        getHistoryValues(STORAGE_KEYS.sourceHistory, state.entries.map((entry) => entry.source))
    );
    updateDatalistOptions(
        questionTypeHistoryList,
        getHistoryValues(STORAGE_KEYS.questionTypeHistory, state.entries.map((entry) => entry.questionType))
    );
}

function updateDatalistOptions(datalist, values) {
    if (!datalist) return;

    const seen = new Set();
    const uniqueValues = [];
    for (const value of values) {
        const normalized = (value ?? '').toString().trim();
        if (!normalized || seen.has(normalized)) {
            continue;
        }
        seen.add(normalized);
        uniqueValues.push(normalized);
    }

    datalist.innerHTML = '';
    for (const value of uniqueValues) {
        const option = document.createElement('option');
        option.value = value;
        datalist.append(option);
    }
}

function getHistoryValues(storageKey, entryValues = []) {
    const stored = readStoredArray(storageKey);
    const combined = [...stored];
    const seen = new Set(stored);
    for (const value of entryValues) {
        const normalized = (value ?? '').toString().trim();
        if (!normalized || seen.has(normalized)) {
            continue;
        }
        seen.add(normalized);
        combined.push(normalized);
    }
    return combined;
}

function rememberLastSubject(subject) {
    const normalized = (subject ?? '').toString().trim();
    if (!normalized || !LOCAL_STORAGE_AVAILABLE) return;
    try {
        window.localStorage.setItem(STORAGE_KEYS.lastSubject, normalized);
    } catch (error) {
        console.warn('Unable to persist last subject selection.', error);
    }
}

function getLastSubject() {
    if (!LOCAL_STORAGE_AVAILABLE) {
        return '';
    }
    try {
        return (window.localStorage.getItem(STORAGE_KEYS.lastSubject) || '').toString().trim();
    } catch (error) {
        console.warn('Unable to read last subject selection.', error);
        return '';
    }
}

function rememberHistoryValue(storageKey, value) {
    const normalized = (value ?? '').toString().trim();
    if (!normalized || !LOCAL_STORAGE_AVAILABLE) {
        return;
    }

    const existing = readStoredArray(storageKey).filter((item) => item !== normalized);
    existing.unshift(normalized);
    writeStoredArray(storageKey, existing.slice(0, 20));
}

function readStoredArray(storageKey) {
    if (!LOCAL_STORAGE_AVAILABLE) {
        return [];
    }
    try {
        const raw = window.localStorage.getItem(storageKey);
        if (!raw) {
            return [];
        }
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
            return [];
        }
        return parsed
            .map((value) => (value ?? '').toString().trim())
            .filter((value) => Boolean(value));
    } catch (error) {
        console.warn('Unable to read stored suggestions.', error);
        return [];
    }
}

function writeStoredArray(storageKey, values) {
    if (!LOCAL_STORAGE_AVAILABLE) {
        return;
    }
    try {
        window.localStorage.setItem(storageKey, JSON.stringify(values));
    } catch (error) {
        console.warn('Unable to persist stored suggestions.', error);
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
            alert('请先选择题目后再导出。');
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
        let message = '尚未选择题目。';
        if (totalSelected > 0) {
            const parts = [`已选择 ${totalSelected} 道题目`];
            if (visibleSelected && visibleSelected !== totalSelected) {
                parts.push(`当前页显示 ${visibleSelected} 道`);
            } else if (visibleSelected === totalSelected) {
                parts.push('当前页全部可见');
            }
            message = `${parts.join('，')}。`;
            selectionStatusEl.classList.add('selection-status--active');
        } else {
            selectionStatusEl.classList.remove('selection-status--active');
        }
        selectionStatusEl.textContent = message;
    }

    if (exportBtn) {
        exportBtn.disabled = !totalSelected || Boolean(exportInProgress);
        exportBtn.textContent = exportInProgress === 'word' ? '导出中…' : '导出所有信息';
    }

    if (exportPaperBtn) {
        exportPaperBtn.disabled = !totalSelected || Boolean(exportInProgress);
        exportPaperBtn.textContent = exportInProgress === 'paper' ? '生成中…' : '生成试卷';
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

function updatePaginationUI({ totalEntries, totalPages, page, pageSize, visibleCount, startIndex }) {
    if (!paginationContainer) {
        return;
    }

    if (!totalEntries) {
        paginationContainer.hidden = true;
        if (paginationInfo) {
            paginationInfo.textContent = '';
        }
        if (pageSizeSelect) {
            pageSizeSelect.value = String(pageSize);
        }
        paginationPrevBtn?.setAttribute('disabled', 'true');
        paginationNextBtn?.setAttribute('disabled', 'true');
        return;
    }

    paginationContainer.hidden = false;

    if (pageSizeSelect) {
        pageSizeSelect.value = String(pageSize);
    }

    if (paginationInfo) {
        const startDisplay = startIndex + 1;
        const endDisplay = startIndex + (visibleCount || 0);
        const infoText = visibleCount
            ? `第 ${page}/${totalPages} 页，显示第 ${startDisplay}-${endDisplay} 条，共 ${totalEntries} 条`
            : `第 ${page}/${totalPages} 页，共 ${totalEntries} 条`;
        paginationInfo.textContent = infoText;
    }

    if (paginationPrevBtn) {
        paginationPrevBtn.disabled = page <= 1;
    }

    if (paginationNextBtn) {
        paginationNextBtn.disabled = page >= totalPages;
    }
}

function showPhotoCheckPanel() {
    if (!photoCheckPanel) return;
    hideEntryPanel({ scroll: false });
    hideWizardPanel({ scroll: false, reset: false });
    hideLogPanel({ scroll: false });
    if (!photoCheckPanel.hidden) return;
    photoCheckPanel.hidden = false;
    openPhotoCheckPanelLink?.setAttribute('aria-expanded', 'true');
    photoCheckPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    photoCheckImageInput?.focus();
}

function hidePhotoCheckPanel(options = {}) {
    if (!photoCheckPanel) return;
    const { scroll = true, reset = true } = options;
    openPhotoCheckPanelLink?.setAttribute('aria-expanded', 'false');
    if (!photoCheckPanel.hidden) {
        photoCheckPanel.hidden = true;
    }
    if (reset) {
        resetPhotoCheckPanel();
    }
    if (scroll !== false) {
        document.getElementById('entries-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

function resetPhotoCheckPanel() {
    photoCheckForm?.reset();
    resetPhotoCheckResults();
    setPhotoCheckStatus('');
}

function setPhotoCheckStatus(message, variant) {
    if (!photoCheckStatus) return;
    photoCheckStatus.textContent = message || '';
    photoCheckStatus.classList.remove('is-error', 'is-success');
    if (!variant) {
        return;
    }
    if (variant === 'error') {
        photoCheckStatus.classList.add('is-error');
    } else if (variant === 'success') {
        photoCheckStatus.classList.add('is-success');
    }
}

function renderPhotoCheckResults(result) {
    if (!photoCheckResultsSection || !photoCheckSummary || !photoCheckReport) {
        return;
    }

    const attempts = normalizePhotoCheckResultAttempts(result);
    const summaryText = buildPhotoCheckOverallSummary(attempts);

    updatePhotoCheckPreview(result);

    photoCheckReport.innerHTML = '';

    attempts.forEach((attempt) => {
        const attemptItem = document.createElement('article');
        attemptItem.className = 'photo-check-report__attempt';
        attemptItem.dataset.attempt = String(attempt.index);

        const heading = document.createElement('h3');
        heading.className = 'photo-check-report__attempt-heading';
        heading.textContent = `第 ${attempt.index} 次 Qwen 调用结果`;
        attemptItem.appendChild(heading);

        const attemptSummary = document.createElement('p');
        attemptSummary.className = 'photo-check-report__attempt-summary';
        attemptSummary.textContent = formatPhotoCheckAttemptSummary(attempt, { withPrefix: false });
        attemptItem.appendChild(attemptSummary);

        if (attempt.problems.length > 0) {
            const problemsList = document.createElement('ol');
            problemsList.className = 'photo-check-report__attempt-list';
            attempt.problems.forEach((problem) => {
                problemsList.appendChild(createPhotoCheckProblemItem(problem));
            });
            attemptItem.appendChild(problemsList);
        } else {
            const empty = document.createElement('p');
            empty.className = 'photo-check-report__attempt-empty';
            empty.textContent = '未能识别出具体题目。';
            attemptItem.appendChild(empty);
        }

        photoCheckReport.appendChild(attemptItem);
    });

    photoCheckSummary.textContent = summaryText;
    photoCheckResultsSection.hidden = false;
}

function updatePhotoCheckPreview(result) {
    if (!photoCheckPreview || !photoCheckImagePreview) {
        return;
    }

    const previewUrl = extractPhotoCheckPreviewUrl(result);

    if (previewUrl) {
        photoCheckImagePreview.src = previewUrl;
        photoCheckImagePreview.alt = '上传照片预览';
        photoCheckPreview.hidden = false;
    } else {
        photoCheckImagePreview.removeAttribute('src');
        photoCheckImagePreview.alt = '';
        photoCheckPreview.hidden = true;
    }
}

function extractPhotoCheckPreviewUrl(result) {
    if (!result || !result.image) {
        return '';
    }

    if (typeof result.image === 'string') {
        return result.image.trim();
    }

    if (typeof result.image.url === 'string' && result.image.url.trim()) {
        return result.image.url.trim();
    }

    if (typeof result.image.dataUrl === 'string' && result.image.dataUrl.trim()) {
        return result.image.dataUrl.trim();
    }

    return '';
}

function normalizePhotoCheckResultAttempts(result) {
    if (!result) {
        return [];
    }

    if (Array.isArray(result.attempts) && result.attempts.length > 0) {
        return result.attempts.map((attempt, index) => normalizePhotoCheckAttempt(attempt, index)).filter(Boolean);
    }

    const fallbackAttempt = normalizePhotoCheckAttempt(
        {
            attempt: 1,
            summary: result.summary,
            problems: result.problems
        },
        0
    );

    return fallbackAttempt ? [fallbackAttempt] : [];
}

function normalizePhotoCheckAttempt(attempt, index) {
    if (!attempt) {
        return null;
    }

    const attemptIndexValue = Number(attempt.attempt ?? attempt.index);
    const attemptIndex = Number.isFinite(attemptIndexValue) && attemptIndexValue > 0 ? attemptIndexValue : index + 1;

    const problemsInput = Array.isArray(attempt.problems) ? attempt.problems : [];
    const normalizedProblems = problemsInput
        .map((problem, problemIndex) => normalizePhotoCheckProblem(problem, problemIndex))
        .filter(Boolean);

    const summaryInput = attempt.summary || {};
    const fallbackTotal = normalizedProblems.length;
    const fallbackCorrect = normalizedProblems.filter((item) => item.isCorrect === true).length;
    const fallbackIncorrect = normalizedProblems.filter((item) => item.isCorrect === false).length;

    let total = normalizePhotoCheckCount(summaryInput.total);
    let correct = normalizePhotoCheckCount(summaryInput.correct);
    let incorrect = normalizePhotoCheckCount(summaryInput.incorrect);
    let unknown = normalizePhotoCheckCount(summaryInput.unknown);

    if (total == null) {
        total = fallbackTotal;
    }
    if (correct == null) {
        correct = fallbackCorrect;
    }
    if (incorrect == null) {
        incorrect = fallbackIncorrect;
    }
    if (unknown == null) {
        unknown = Math.max(0, total - correct - incorrect);
    }

    if (total < normalizedProblems.length) {
        total = normalizedProblems.length;
        if (summaryInput.unknown == null) {
            unknown = Math.max(0, total - correct - incorrect);
        }
    }

    total = Math.max(0, total);
    correct = Math.max(0, correct);
    incorrect = Math.max(0, incorrect);
    unknown = Math.max(0, unknown);

    return {
        index: attemptIndex,
        summary: {
            total,
            correct,
            incorrect,
            unknown
        },
        problems: normalizedProblems
    };
}

function normalizePhotoCheckCount(value) {
    if (value == null) {
        return null;
    }
    const number = Number(value);
    if (!Number.isFinite(number)) {
        return null;
    }
    return Math.max(0, Math.round(number));
}

function formatPhotoCheckAttemptSummary(attempt, { withPrefix = false } = {}) {
    if (!attempt || !attempt.summary) {
        if (withPrefix) {
            const label = Number.isFinite(Number(attempt?.index)) ? `第 ${attempt.index} 次调用` : '本次调用';
            return `${label}未能识别出题目`;
        }
        return '未能识别出题目';
    }

    const { summary } = attempt;
    const parts = [];

    if (summary.total > 0) {
        parts.push(`共 ${summary.total} 题`);
        parts.push(`${summary.correct} 题正确`);
        parts.push(`${summary.incorrect} 题需要复查`);
        if (summary.unknown > 0) {
            parts.push(`${summary.unknown} 题待人工确认`);
        }

        if (withPrefix) {
            return `第 ${attempt.index} 次调用：${parts.join('，')}`;
        }
        return parts.join('，');
    }

    if (withPrefix) {
        return `第 ${attempt.index} 次调用未能识别出题目`;
    }
    return '未能识别出题目';
}

function buildPhotoCheckOverallSummary(attempts) {
    if (!Array.isArray(attempts) || attempts.length === 0) {
        return '未能从照片中识别出题目。';
    }

    const includePrefix = attempts.length > 1;
    const parts = attempts
        .map((attempt) => formatPhotoCheckAttemptSummary(attempt, { withPrefix: includePrefix }))
        .filter((text) => Boolean(text && text.trim()));

    if (parts.length === 0) {
        return '未能从照片中识别出题目。';
    }

    return `${parts.join('；')}。`;
}

function createPhotoCheckProblemItem(problem) {
    const item = document.createElement('li');
    item.classList.add('photo-check-report__item');

    if (problem.isCorrect === true) {
        item.classList.add('is-correct');
    } else if (problem.isCorrect === false) {
        item.classList.add('is-incorrect');
    }

    const heading = document.createElement('h4');
    heading.className = 'photo-check-report__heading';
    let statusLabel = '结果不确定';
    if (problem.isCorrect === true) {
        statusLabel = '回答正确';
    } else if (problem.isCorrect === false) {
        statusLabel = '需要复查';
    }
    heading.textContent = `第 ${problem.index} 题：${statusLabel}`;
    item.appendChild(heading);

    if (problem.boundingBox) {
        try {
            item.dataset.boundingBox = JSON.stringify(problem.boundingBox);
        } catch (error) {
            // ignore serialization issues
        }
    }

    const figure = createPhotoCheckProblemFigure(problem);
    if (figure) {
        item.appendChild(figure);
    }

    appendPhotoCheckSection(item, '题目', problem.question);
    appendPhotoCheckSection(item, '手写答案', problem.studentAnswer);
    appendPhotoCheckSection(item, '参考解答', problem.solvedAnswer);
    appendPhotoCheckSection(item, '分析', problem.analysis);

    return item;
}

function appendPhotoCheckSection(container, label, value) {
    const text = cleanPhotoCheckText(value);
    if (!text) return;
    const section = document.createElement('p');
    section.className = 'photo-check-report__section';
    const strong = document.createElement('strong');
    strong.textContent = label;
    section.appendChild(strong);
    const parts = text.split('\n');
    parts.forEach((part, index) => {
        if (index > 0) {
            section.appendChild(document.createElement('br'));
        }
        section.appendChild(document.createTextNode(part));
    });
    container.appendChild(section);
}

function createPhotoCheckProblemFigure(problem) {
    if (!problem || !problem.image) {
        return null;
    }

    const url = typeof problem.image.url === 'string' ? problem.image.url.trim() : '';
    if (!url) {
        return null;
    }

    const figure = document.createElement('figure');
    figure.className = 'photo-check-report__figure';

    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    figure.appendChild(link);

    const img = document.createElement('img');
    img.src = url;
    img.alt = `第 ${problem.index} 题原图`;
    img.loading = 'lazy';
    link.appendChild(img);

    const captionText = buildPhotoCheckProblemFigureCaption(problem);
    if (captionText) {
        const caption = document.createElement('figcaption');
        caption.textContent = captionText;
        figure.appendChild(caption);
    }

    return figure;
}

function buildPhotoCheckProblemFigureCaption(problem) {
    if (!problem || !problem.image) {
        return '';
    }

    const parts = ['题目原图'];
    const width = Number(problem.image.width);
    const height = Number(problem.image.height);
    if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
        parts.push(`${Math.round(width)}×${Math.round(height)}`);
    }

    if (problem.image.source === 'crop') {
        parts.push('AI 裁剪');
    }

    return parts.filter(Boolean).join(' · ');
}

function resetPhotoCheckResults() {
    if (photoCheckReport) {
        photoCheckReport.innerHTML = '';
    }
    if (photoCheckSummary) {
        photoCheckSummary.textContent = '';
    }
    if (photoCheckPreview && photoCheckImagePreview) {
        photoCheckImagePreview.removeAttribute('src');
        photoCheckImagePreview.alt = '';
        photoCheckPreview.hidden = true;
    }
    if (photoCheckResultsSection) {
        photoCheckResultsSection.hidden = true;
    }
}

function normalizePhotoCheckProblem(problem, index) {
    if (!problem) {
        return null;
    }

    const question = cleanPhotoCheckText(problem.question ?? problem.questionText ?? problem.prompt);
    const studentAnswer = cleanPhotoCheckText(
        problem.studentAnswer ?? problem.student_answer ?? problem.studentResponse ?? problem.student_response
    );
    const solvedAnswer = cleanPhotoCheckText(
        problem.solvedAnswer ??
            problem.model_answer ??
            problem.referenceAnswer ??
            problem.solution ??
            problem.answer
    );
    const analysis = cleanPhotoCheckText(
        problem.analysis ?? problem.feedback ?? problem.reason ?? problem.explanation ?? problem.notes
    );
    const parsedCorrect = parsePhotoCheckCorrectValue(
        problem.isCorrect ?? problem.is_correct ?? problem.correct ?? problem.verdict ?? problem.check
    );
    const boundingBox = normalizePhotoCheckBoundingBox(
        problem.boundingBox ??
            problem.bounding_box ??
            problem.bbox ??
            problem.region ??
            problem.rect ??
            problem.crop ??
            null
    );
    const image = normalizePhotoCheckProblemImage(
        problem.image ?? problem.preview ?? problem.segment ?? problem.cropImage ?? null,
        boundingBox
    );

    if (!question && !studentAnswer && !solvedAnswer && !analysis && !image) {
        return null;
    }

    return {
        index: index + 1,
        question,
        studentAnswer,
        solvedAnswer,
        analysis,
        isCorrect: parsedCorrect,
        boundingBox,
        image
    };
}

function normalizePhotoCheckProblemImage(raw, fallbackBoundingBox) {
    if (!raw) {
        return null;
    }

    if (typeof raw === 'string') {
        const url = raw.trim();
        if (!url) {
            return null;
        }
        return {
            url,
            width: null,
            height: null,
            boundingBox: fallbackBoundingBox || null,
            source: null
        };
    }

    if (typeof raw !== 'object') {
        return null;
    }

    const urlValue =
        typeof raw.url === 'string'
            ? raw.url
            : typeof raw.dataUrl === 'string'
            ? raw.dataUrl
            : typeof raw.href === 'string'
            ? raw.href
            : '';
    const url = urlValue.trim();
    if (!url) {
        return null;
    }

    const widthValue = toFiniteNumber(raw.width);
    const heightValue = toFiniteNumber(raw.height);

    const boundingBox =
        normalizePhotoCheckBoundingBox(
            raw.boundingBox ?? raw.bounding_box ?? raw.bbox ?? raw.region ?? raw.rect ?? fallbackBoundingBox
        ) || fallbackBoundingBox || null;

    const image = {
        url,
        width: Number.isFinite(widthValue) && widthValue > 0 ? Math.round(widthValue) : null,
        height: Number.isFinite(heightValue) && heightValue > 0 ? Math.round(heightValue) : null,
        boundingBox,
        source: typeof raw.source === 'string' ? raw.source : null
    };

    const attemptValue = toFiniteNumber(raw.attempt ?? raw.attemptIndex);
    if (Number.isFinite(attemptValue) && attemptValue > 0) {
        image.attempt = Math.floor(attemptValue);
    }

    const indexValue = toFiniteNumber(raw.index ?? raw.problem ?? raw.problemIndex);
    if (Number.isFinite(indexValue) && indexValue > 0) {
        image.index = Math.floor(indexValue);
    }

    return image;
}

function normalizePhotoCheckBoundingBox(raw) {
    if (!raw) {
        return null;
    }

    const input = coercePhotoCheckBoundingBoxInput(raw);
    if (!input || typeof input !== 'object') {
        return null;
    }

    const leftValue = toFiniteNumber(
        input.left ?? input.x ?? input.x1 ?? input.minX ?? input.startX ?? (Array.isArray(input) ? input[0] : null)
    );
    const topValue = toFiniteNumber(
        input.top ?? input.y ?? input.y1 ?? input.minY ?? input.startY ?? (Array.isArray(input) ? input[1] : null)
    );
    let widthValue = toFiniteNumber(input.width ?? input.w ?? input.spanX ?? (Array.isArray(input) ? input[2] : null));
    let heightValue = toFiniteNumber(input.height ?? input.h ?? input.spanY ?? (Array.isArray(input) ? input[3] : null));
    const rightValue = toFiniteNumber(input.right ?? input.x2 ?? input.maxX ?? input.endX);
    const bottomValue = toFiniteNumber(input.bottom ?? input.y2 ?? input.maxY ?? input.endY);

    let left = leftValue;
    let top = topValue;
    let width = widthValue;
    let height = heightValue;

    if ((width == null || width <= 0) && rightValue != null && left != null) {
        width = rightValue - left;
    }
    if ((height == null || height <= 0) && bottomValue != null && top != null) {
        height = bottomValue - top;
    }
    if (left == null && rightValue != null && width != null) {
        left = rightValue - width;
    }
    if (top == null && bottomValue != null && height != null) {
        top = bottomValue - height;
    }

    if (!Number.isFinite(left) || !Number.isFinite(top) || !Number.isFinite(width) || !Number.isFinite(height)) {
        return null;
    }

    if (width <= 0 || height <= 0) {
        return null;
    }

    let unit = typeof input.unit === 'string' ? input.unit.toLowerCase() : null;
    if (unit !== 'pixel' && unit !== 'ratio') {
        unit = null;
    }

    const values = [left, top, width, height];
    const allWithinUnitInterval = values.every((value) => value >= 0 && value <= 1);
    const anyAboveOne = values.some((value) => value > 1);

    if (!unit) {
        unit = !anyAboveOne && allWithinUnitInterval ? 'ratio' : 'pixel';
    }

    if (unit === 'ratio') {
        left = clampValue(left, 0, 1);
        top = clampValue(top, 0, 1);
        width = clampValue(width, 0, 1);
        height = clampValue(height, 0, 1);
        if (left + width > 1) {
            width = Math.max(0, 1 - left);
        }
        if (top + height > 1) {
            height = Math.max(0, 1 - top);
        }
        if (width <= 0 || height <= 0) {
            return null;
        }
    } else {
        left = Math.max(0, left);
        top = Math.max(0, top);
        width = Math.max(1, width);
        height = Math.max(1, height);
    }

    const confidenceValue = toFiniteNumber(input.confidence ?? input.score ?? input.probability);
    const confidence = confidenceValue != null ? clampValue(confidenceValue, 0, 1) : null;

    return {
        left,
        top,
        width,
        height,
        unit,
        confidence
    };
}

function coercePhotoCheckBoundingBoxInput(raw) {
    if (!raw) {
        return null;
    }

    if (Array.isArray(raw)) {
        if (raw.length < 4) {
            return null;
        }
        const [a, b, c, d] = raw;
        const numbers = [a, b, c, d].map(toFiniteNumber);
        if (numbers.some((value) => !Number.isFinite(value))) {
            return null;
        }
        const [left, top, third, fourth] = numbers;
        const treatAsRightBottom = third > 1 || fourth > 1;
        if (treatAsRightBottom) {
            return { left, top, right: third, bottom: fourth };
        }
        return { left, top, width: third, height: fourth };
    }

    if (typeof raw === 'string') {
        const trimmed = raw.trim();
        if (!trimmed) {
            return null;
        }
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
            const parsed = safeJsonParse(trimmed);
            if (parsed != null) {
                return coercePhotoCheckBoundingBoxInput(parsed);
            }
        }
        const parts = trimmed.split(/[,\s]+/).filter(Boolean);
        if (parts.length >= 4) {
            const numbers = parts.slice(0, 4).map(toFiniteNumber);
            if (numbers.every((value) => Number.isFinite(value))) {
                return coercePhotoCheckBoundingBoxInput(numbers);
            }
        }
        return null;
    }

    if (typeof raw === 'object') {
        return raw;
    }

    return null;
}

function clampValue(value, min, max) {
    if (!Number.isFinite(value)) {
        return min;
    }
    return Math.min(max, Math.max(min, value));
}

function toFiniteNumber(value) {
    if (value == null || value === '') {
        return null;
    }
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function safeJsonParse(value) {
    try {
        return JSON.parse(value);
    } catch (error) {
        return null;
    }
}

function cleanPhotoCheckText(value) {
    if (value == null) {
        return '';
    }
    const text = Array.isArray(value) ? value.join('\n') : String(value);
    return text.replace(/\r\n/g, '\n').trim();
}

function parsePhotoCheckCorrectValue(value) {
    if (typeof value === 'boolean') {
        return value;
    }
    if (typeof value === 'number') {
        if (value === 1) return true;
        if (value === 0) return false;
    }
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (!normalized) {
            return null;
        }
        if (['正确', '对', '是', 'yes', 'true', '回答正确', '无误', 'right', 'correct'].includes(normalized)) {
            return true;
        }
        if (['错误', '错', '否', 'no', 'false', '需要复查', '不对', 'wrong', 'incorrect'].includes(normalized)) {
            return false;
        }
    }
    return null;
}

function showEntryPanel() {
    if (!entryPanel) return;
    hideWizardPanel({ scroll: false, reset: false });
    hidePhotoCheckPanel({ scroll: false, reset: false });
    if (!entryPanel.hidden) return;
    entryPanel.hidden = false;
    openEntryPanelLink?.setAttribute('aria-expanded', 'true');
    setDefaultSubjectAndSemester();
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

function showWizardPanel() {
    if (!wizardPanel) return;
    hideEntryPanel({ scroll: false });
    hidePhotoCheckPanel({ scroll: false, reset: false });
    if (!wizardPanel.hidden) return;
    resetWizard();
    wizardPanel.hidden = false;
    openWizardPanelLink?.setAttribute('aria-expanded', 'true');
    wizardPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    wizardOriginalInput?.focus();
}

function hideWizardPanel(options = {}) {
    if (!wizardPanel) return;
    const { scroll = true, reset = true } = options;
    openWizardPanelLink?.setAttribute('aria-expanded', 'false');
    if (!wizardPanel.hidden) {
        wizardPanel.hidden = true;
    }
    if (reset) {
        resetWizard();
    }
    if (scroll !== false) {
        document.getElementById('entries-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

function showWizardStep(step) {
    const isUpload = step !== 'details';
    if (wizardStepUpload) {
        wizardStepUpload.hidden = !isUpload;
    }
    if (wizardStepDetails) {
        wizardStepDetails.hidden = isUpload;
    }
    if (!isUpload) {
        applyWizardRecognizedText({ replaceExisting: false });
    }
}

function prepareWizardDetailsStepFromFile(file, { focusQuestion = false } = {}) {
    if (!file) return;
    const fileChanged = file !== wizardOriginalFile;
    wizardOriginalFile = file;
    if (fileChanged) {
        if (wizardOriginalPreviewUrl) {
            URL.revokeObjectURL(wizardOriginalPreviewUrl);
        }
        wizardOriginalPreviewUrl = URL.createObjectURL(file);
    }
    if (wizardPreviewImage && wizardOriginalPreviewUrl) {
        wizardPreviewImage.src = wizardOriginalPreviewUrl;
    }
    if (wizardPreview) {
        wizardPreview.hidden = !wizardOriginalPreviewUrl;
    }
    applyWizardDefaults();
    showWizardStep('details');
    if (focusQuestion && wizardQuestionTextInput) {
        wizardQuestionTextInput.focus();
    }
}

function resetWizard() {
    if (wizardUploadForm) {
        wizardUploadForm.reset();
    }
    if (wizardForm) {
        wizardForm.reset();
    }
    wizardOriginalFile = null;
    if (wizardOriginalPreviewUrl) {
        URL.revokeObjectURL(wizardOriginalPreviewUrl);
        wizardOriginalPreviewUrl = '';
    }
    if (wizardPreviewImage) {
        wizardPreviewImage.src = '';
    }
    if (wizardPreview) {
        wizardPreview.hidden = true;
    }
    wizardRecognizedText = '';
    setWizardOcrStatus('');
    setWizardOcrButtonState(false);
    showWizardStep('upload');
    applyWizardDefaults();
}

function applyWizardDefaults() {
    const defaultSubject = getLastSubject() || '数学';
    if (wizardSubjectInput && !wizardSubjectInput.value) {
        wizardSubjectInput.value = defaultSubject;
    }
    if (wizardSemesterSelect && !wizardSemesterSelect.value) {
        wizardSemesterSelect.value = '八上';
    }
    if (wizardCreatedAtInput && !wizardCreatedAtInput.value) {
        wizardCreatedAtInput.value = todayDateValue();
    }
}

async function extractWizardQuestionText() {
    const file = wizardOriginalInput?.files?.[0] || wizardOriginalFile;
    if (!file) {
        alert('请先选择需要识别的原始图片。');
        wizardOriginalInput?.focus();
        return;
    }

    if (typeof window.fetch !== 'function') {
        alert('当前浏览器不支持识别操作。');
        return;
    }

    try {
        setWizardOcrButtonState(true, '识别中…');
        setWizardOcrStatus('正在识别文字，请稍候…');

        const formData = new FormData();
        formData.append('image', file);
        const response = await fetch('/api/ocr', {
            method: 'POST',
            body: formData
        });

        const contentType = response.headers.get('content-type') || '';
        const isJson = contentType.includes('application/json');
        const payload = isJson ? await response.json() : {};

        if (!response.ok) {
            const message = (payload && payload.error) || '识别失败，请稍后再试。';
            throw new Error(message);
        }

        const text = cleanOcrText(payload && payload.text ? payload.text : '');
        wizardRecognizedText = text;
        applyWizardRecognizedText({ replaceExisting: false });

        if (file) {
            const shouldFocusQuestion = wizardStepDetails?.hidden !== false || !wizardQuestionTextInput?.value;
            prepareWizardDetailsStepFromFile(file, { focusQuestion: shouldFocusQuestion });
        }

        if (text) {
            setWizardOcrStatus('识别成功，已填入题目内容并自动进入下一步。', { type: 'success' });
        } else {
            setWizardOcrStatus('未识别出文字，请尝试更清晰的图片。', { type: 'error' });
        }
    } catch (error) {
        console.error(error);
        const message = (error && error.message) || '识别失败，请稍后再试。';
        setWizardOcrStatus(message, { type: 'error' });
    } finally {
        setWizardOcrButtonState(false);
    }
}

function setWizardOcrStatus(message, options = {}) {
    if (!wizardOcrStatus) return;
    wizardOcrStatus.textContent = message || '';
    wizardOcrStatus.classList.remove('is-error', 'is-success');
    if (options.type === 'error') {
        wizardOcrStatus.classList.add('is-error');
    } else if (options.type === 'success') {
        wizardOcrStatus.classList.add('is-success');
    }
}

function setWizardOcrButtonState(loading, label) {
    if (!wizardOcrButton) return;
    const isLoading = Boolean(loading);
    wizardOcrButton.disabled = isLoading;
    if (isLoading) {
        wizardOcrButton.textContent = label || '识别中…';
    } else {
        wizardOcrButton.textContent = wizardOcrButtonDefaultLabel || '使用 AI 识别文字';
    }
}

function applyWizardRecognizedText({ replaceExisting = false } = {}) {
    if (!wizardQuestionTextInput) return;
    if (!wizardRecognizedText) return;
    if (!replaceExisting && wizardQuestionTextInput.value) return;
    wizardQuestionTextInput.value = wizardRecognizedText;
}

function cleanOcrText(text) {
    if (!text) return '';
    const normalized = String(text)
        .replace(/\r\n/g, '\n')
        .replace(/[\u3000\u00A0]/g, ' ')
        .replace(/\s+([,.;:!?，。；：！？、])/g, '$1')
        .replace(/([（［｛【<])\s+/g, '$1')
        .replace(/\s+([）］｝】>])/g, '$1');

    const lines = normalized.split('\n').map((line) =>
        line
            .replace(/[ \t]{2,}/g, ' ')
            .replace(/([\u4e00-\u9fff])\s+(?=[\u4e00-\u9fff])/g, '$1')
            .trim()
    );

    return lines.join('\n').trim();
}

function showLogPanel() {
    if (!logPanel) return;
    if (!logPanel.hidden) return;
    hidePhotoCheckPanel({ scroll: false, reset: false });
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
    const defaultValue = todayDateValue();
    if (createdAtInput && !createdAtInput.value) {
        createdAtInput.value = defaultValue;
    }
    if (wizardCreatedAtInput && !wizardCreatedAtInput.value) {
        wizardCreatedAtInput.value = defaultValue;
    }
}

function setDefaultSubjectAndSemester() {
    const defaultSubject = getLastSubject() || '数学';
    if (subjectInput && !subjectInput.value) {
        subjectInput.value = defaultSubject;
    }
    if (wizardSubjectInput && !wizardSubjectInput.value) {
        wizardSubjectInput.value = defaultSubject;
    }
    if (semesterSelect && !semesterSelect.value) {
        semesterSelect.value = '八上';
    }
    if (wizardSemesterSelect && !wizardSemesterSelect.value) {
        wizardSemesterSelect.value = '八上';
    }
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
        if (typeof details.originalImage === 'boolean') {
            parts.push(details.originalImage ? '原始图片已上传' : '无原始图片');
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
    const originalImageUrl = raw.originalImageUrl || null;
    const originalImageResizedUrl = raw.originalImageResizedUrl || null;
    const originalPreview = originalImageResizedUrl || originalImageUrl;
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
        questionImageScale: zoomPercentToScale(scaleToZoomPercent(raw.questionImageScale)),
        answerImageUrl,
        answerImageResizedUrl,
        answerImageSrc: resolveMediaUrl(answerPreview),
        answerImageOriginalSrc: resolveMediaUrl(answerImageUrl),
        answerImageResizedSrc: resolveMediaUrl(answerImageResizedUrl),
        answerImageScale: Number.isFinite(raw.answerImageScale) ? raw.answerImageScale : null,
        originalImageUrl,
        originalImageResizedUrl,
        originalImageSrc: resolveMediaUrl(originalPreview),
        originalImageOriginalSrc: resolveMediaUrl(originalImageUrl),
        originalImageResizedSrc: resolveMediaUrl(originalImageResizedUrl),
        originalImageScale: Number.isFinite(raw.originalImageScale) ? raw.originalImageScale : null,
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
