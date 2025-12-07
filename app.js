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
    },
    photoCheck: {
        batches: [],
        problems: new Map(),
        selection: new Set(),
        recordId: null,
        createdAt: null,
        previewIndex: 0,
        previewCollapsed: true,
        isSaving: false,
        history: {
            items: [],
            isLoading: false,
            error: '',
            lastLoadedAt: null,
            selectedId: null,
            loadingRecordId: null,
            mutatingId: null,
            message: '',
            messageVariant: ''
        }
    },
    paperRepo: {
        items: [],
        isLoading: false,
        error: '',
        uploadStatus: '',
        lastLoadedAt: null,
        filters: {
            subject: '',
            semester: ''
        }
    },
    formulaRecognition: {
        result: {
            latex: '',
            mathml: '',
            plainText: ''
        },
        isProcessing: false
    }
};

const MIN_IMAGE_ZOOM = 30;
const MAX_IMAGE_ZOOM = 120;
const DEFAULT_IMAGE_ZOOM = 100;
const ALLOWED_RICH_TEXT_TAGS = new Set([
    'b',
    'strong',
    'i',
    'em',
    'u',
    'sup',
    'sub',
    'ul',
    'ol',
    'li',
    'p',
    'div',
    'br',
    'span',
    'code'
]);

const RICH_TEXT_FORMULA_DELIMITERS = [
    { left: '$$', right: '$$', display: true },
    { left: '$', right: '$', display: false },
    { left: '\\(', right: '\\)', display: false },
    { left: '\\[', right: '\\]', display: true }
];

const richTextEditors = new Map();

const collator = new Intl.Collator('zh-Hans-CN', { numeric: true, sensitivity: 'base' });
const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
});

const entryForm = document.getElementById('entry-form');
const importInput = document.getElementById('import-input');
const exportBtn = document.getElementById('export-btn');
const exportPaperBtn = document.getElementById('export-paper-btn');
const paperModeToggle = document.getElementById('paper-mode-questions-only');
const clearBtn = document.getElementById('clear-btn');
const entriesContainer = document.getElementById('entries');
const entriesTable = document.getElementById('entries-table');
const entriesTableBody = entriesTable?.querySelector('tbody') || null;
const entriesListPanel = document.getElementById('entries-panel');
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
const sourceInput = document.getElementById('source');
const subjectInput = document.getElementById('subject');
const semesterSelect = document.getElementById('semester');
const entryTemplate = document.getElementById('entry-template');
const editDialog = document.getElementById('edit-dialog');
const editForm = document.getElementById('edit-form');
const editQuestionImageInput = document.getElementById('edit-question-image');
const editAnswerImageInput = document.getElementById('edit-answer-image');
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
const photoCheckPreviewList = document.getElementById('photo-check-preview-list');
const photoCheckPreviewCaption = document.getElementById('photo-check-preview-caption');
const photoCheckImagePreview = document.getElementById('photo-check-image-preview');
const photoCheckPreviewToggle = document.getElementById('photo-check-preview-toggle');
const photoCheckProgress = document.getElementById('photo-check-progress');
const photoCheckProgressLabel = document.getElementById('photo-check-progress-label');
const photoCheckActions = document.getElementById('photo-check-actions');
const photoCheckSelectionStatus = document.getElementById('photo-check-selection-status');
const photoCheckHistoryList = document.getElementById('photo-check-history-list');
const photoCheckHistoryStatus = document.getElementById('photo-check-history-status');
const photoCheckHistoryRefreshBtn = document.getElementById('photo-check-history-refresh');
const photoCheckSaveBtn = document.getElementById('photo-check-save-btn');
const photoCheckSaveDialog = document.getElementById('photo-check-save-dialog');
const photoCheckSaveForm = document.getElementById('photo-check-save-form');
const photoCheckSaveList = document.getElementById('photo-check-save-list');
const photoCheckSaveStatus = document.getElementById('photo-check-save-status');
const photoCheckSaveCancel = document.getElementById('photo-check-save-cancel');
const photoCheckSaveConfirm = document.getElementById('photo-check-save-confirm');
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
const subjectOptionsList = document.getElementById('subject-options');
const questionTypeHistoryList = document.getElementById('question-type-history');
const formulaPanel = document.getElementById('formula-panel');
const openFormulaPanelLink = document.getElementById('open-formula-panel');
const closeFormulaPanelLink = document.getElementById('close-formula-panel');
const formulaForm = document.getElementById('formula-form');
const formulaImageInput = document.getElementById('formula-image');
const formulaSubmitButton = document.getElementById('formula-submit');
const formulaStatusEl = document.getElementById('formula-status');
const formulaResultSection = document.getElementById('formula-result');
const formulaRender = document.getElementById('formula-render');
const formulaLatexOutput = document.getElementById('formula-result-latex');
const formulaMathmlOutput = document.getElementById('formula-result-mathml');
const formulaPlainOutput = document.getElementById('formula-result-plain');
const formulaCopyLatexBtn = document.getElementById('formula-copy-latex');
const formulaCopyMathmlBtn = document.getElementById('formula-copy-mathml');
const formulaSubmitButtonDefaultLabel = formulaSubmitButton ? formulaSubmitButton.textContent.trim() : '';
const paperRepoPanel = document.getElementById('paper-repo-panel');
const openPaperRepoPanelLink = document.getElementById('open-paper-repo-panel');
const closePaperRepoPanelLink = document.getElementById('close-paper-repo-panel');
const paperRepoForm = document.getElementById('paper-repo-form');
const paperRepoTitleInput = document.getElementById('paper-repo-title-input');
const paperRepoSubjectInput = document.getElementById('paper-repo-subject');
const paperRepoSemesterSelect = document.getElementById('paper-repo-semester');
const paperRepoImagesInput = document.getElementById('paper-repo-images');
const paperRepoStatus = document.getElementById('paper-repo-status');
const paperRepoListStatus = document.getElementById('paper-repo-list-status');
const paperRepoList = document.getElementById('paper-repo-list');
const paperRepoRefreshButton = document.getElementById('paper-repo-refresh');
const paperRepoSubjectFilter = document.getElementById('paper-repo-subject-filter');
const paperRepoSemesterFilter = document.getElementById('paper-repo-semester-filter');

function sanitizeRichTextHtml(value) {
    if (!value) return '';
    const template = document.createElement('template');
    template.innerHTML = value;

    const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_ELEMENT, null);
    const toRemove = [];

    while (walker.nextNode()) {
        const node = walker.currentNode;
        if (!node || node.nodeType !== Node.ELEMENT_NODE) continue;
        const tag = node.tagName?.toLowerCase();
        if (!ALLOWED_RICH_TEXT_TAGS.has(tag)) {
            toRemove.push(node);
        } else {
            const attributes = Array.from(node.attributes || []);
            for (const attr of attributes) {
                node.removeAttribute(attr.name);
            }
        }
    }

    toRemove.forEach((node) => {
        if (node.parentNode) {
            while (node.firstChild) {
                node.parentNode.insertBefore(node.firstChild, node);
            }
            node.parentNode.removeChild(node);
        }
    });

    return template.innerHTML.trim();
}

function richTextToPlainText(html) {
    if (!html) return '';
    const normalized = sanitizeRichTextHtml(html);
    const replaced = normalized
        .replace(/<\s*br\s*\/?\s*>/gi, '\n')
        .replace(/<\/(p|div)>/gi, '\n')
        .replace(/<\s*li\s*>/gi, '\n• ')
        .replace(/<\/(ul|ol)>/gi, '\n');
    const temp = document.createElement('template');
    temp.innerHTML = replaced;
    return temp.content.textContent || '';
}

function isRichTextEmpty(html) {
    const text = richTextToPlainText(html).trim();
    return text.length === 0;
}

function renderMathInContainer(container) {
    if (!container || container.isContentEditable || typeof window.renderMathInElement !== 'function') return;
    try {
        window.renderMathInElement(container, {
            delimiters: RICH_TEXT_FORMULA_DELIMITERS,
            throwOnError: false
        });
    } catch (error) {
        console.warn('Failed to render math', error);
    }
}

function renderRichTextContent(element, html) {
    if (!element) return;
    const safe = sanitizeRichTextHtml(html);
    element.innerHTML = safe;
    renderMathInContainer(element);
}

function syncRichTextInput(editor, input) {
    if (!editor || !input) return;
    const safe = sanitizeRichTextHtml(editor.innerHTML);
    input.value = safe;
    renderMathInContainer(editor);
}

function setRichTextValue(inputId, value) {
    const editorEntry = richTextEditors.get(inputId);
    if (!editorEntry) return;
    const safe = sanitizeRichTextHtml(value);
    editorEntry.editor.innerHTML = safe;
    editorEntry.input.value = safe;
    renderMathInContainer(editorEntry.editor);
}

function getRichTextValue(inputId) {
    const editorEntry = richTextEditors.get(inputId);
    if (!editorEntry) return '';
    const value = editorEntry.input.value || editorEntry.editor.innerHTML;
    return sanitizeRichTextHtml(value);
}

function focusRichTextEditor(inputId) {
    const editorEntry = richTextEditors.get(inputId);
    if (!editorEntry) return;
    editorEntry.editor.focus();
}

function syncAllRichTextInputs() {
    richTextEditors.forEach(({ editor, input }) => {
        syncRichTextInput(editor, input);
    });
}

function initRichTextEditors() {
    const wrappers = document.querySelectorAll('[data-rich-text]');
    wrappers.forEach((wrapper) => {
        const editor = wrapper.querySelector('.rich-text__editor');
        const inputId = editor?.dataset?.input;
        const input = inputId ? document.getElementById(inputId) : null;
        if (!editor || !input || richTextEditors.has(inputId)) return;
        const toolbar = wrapper.querySelector('.rich-text__toolbar');

        const handleCommand = (command) => {
            if (!command) return;
            if (command === 'insertFormula') {
                const formula = prompt('输入 LaTeX 公式内容，不包含美元符号：', 'x^2+y^2');
                if (formula !== null) {
                    document.execCommand('insertText', false, `$${formula}$`);
                }
            } else {
                document.execCommand(command, false, null);
            }
            syncRichTextInput(editor, input);
            editor.focus();
        };

        toolbar?.addEventListener('click', (event) => {
            const button = event.target.closest('button[data-command]');
            if (!button) return;
            event.preventDefault();
            handleCommand(button.dataset.command);
        });

        editor.addEventListener('input', () => syncRichTextInput(editor, input));
        editor.addEventListener('blur', () => syncRichTextInput(editor, input));
        editor.addEventListener('paste', (event) => {
            event.preventDefault();
            const text = (event.clipboardData || window.clipboardData).getData('text');
            document.execCommand('insertText', false, text);
        });

        const initialValue = sanitizeRichTextHtml(input.value || '');
        editor.innerHTML = initialValue;
        input.value = initialValue;
        richTextEditors.set(inputId, { editor, input });
    });
}

const STORAGE_KEYS = {
    lastSubject: 'wubook:lastSubject',
    lastSource: 'wubook:lastSource',
    sourceHistory: 'wubook:sourceHistory',
    subjectHistory: 'wubook:subjectHistory',
    questionTypeHistory: 'wubook:questionTypeHistory',
    paperExportMode: 'wubook:paperExportMode'
};

const SUBJECT_BASE_OPTIONS = ['数学', '英语', '语文', '物理', '化学', '生物', '历史', '地理', '政治', '科学'];
const QUESTION_TYPE_BASE_OPTIONS = ['选择题', '填空题', '解答题', '应用题', '判断题', '证明题', '作图题'];

const LOCAL_STORAGE_AVAILABLE = (() => {
    try {
        return typeof window !== 'undefined' && 'localStorage' in window && window.localStorage !== null;
    } catch (error) {
        return false;
    }
})();

const PAPER_EXPORT_MODES = {
    DETAILED: 'detailed',
    QUESTION_ONLY: 'question-only'
};

let paperExportMode = getSavedPaperExportMode();
syncPaperExportModeToggle();

paperModeToggle?.addEventListener('change', () => {
    const mode = paperModeToggle.checked ? PAPER_EXPORT_MODES.QUESTION_ONLY : PAPER_EXPORT_MODES.DETAILED;
    setPaperExportMode(mode);
});

let exportInProgress = null;

let logStatusTimeout;
let logLoading = false;

let wizardOriginalFile = null;
let wizardOriginalPreviewUrl = '';
let wizardRecognizedText = '';

setCreatedAtDefaultValue();
setDefaultSubjectAndSemester();
updateEntryFormSuggestions();
initRichTextEditors();
hideEntryPanel({ scroll: false });
hideWizardPanel({ scroll: false });
hidePhotoCheckPanel({ scroll: false });
hidePaperRepoPanel({ scroll: false });
hideLogPanel({ scroll: false });

init();

entryForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    syncAllRichTextInputs();
    const saved = await submitEntry(new FormData(entryForm));
    if (!saved) return;
    entryForm.reset();
    setCreatedAtDefaultValue();
    setDefaultSubjectAndSemester();
    setRichTextValue('question-text', '');
    setRichTextValue('answer-text', '');
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

openPaperRepoPanelLink?.addEventListener('click', (event) => {
    event.preventDefault();
    showPaperRepoPanel();
});

closePaperRepoPanelLink?.addEventListener('click', (event) => {
    event.preventDefault();
    hidePaperRepoPanel();
});

openFormulaPanelLink?.addEventListener('click', (event) => {
    event.preventDefault();
    showFormulaPanel();
});

closeFormulaPanelLink?.addEventListener('click', (event) => {
    event.preventDefault();
    hideFormulaPanel();
});

formulaImageInput?.addEventListener('change', () => {
    if (state.formulaRecognition.isProcessing) {
        return;
    }
    setFormulaStatus('');
});

formulaForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const file = formulaImageInput?.files?.[0] || null;
    if (!file) {
        setFormulaStatus('请先选择需要识别的图片。', 'error');
        formulaImageInput?.focus();
        return;
    }

    const formData = new FormData();
    formData.append('image', file);

    setFormulaProcessingState(true);
    setFormulaStatus('正在上传图片并调用 AI 识别试卷…');
    resetFormulaResult();

    try {
        const response = await fetch('/api/formula-recognition', {
            method: 'POST',
            body: formData
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(payload?.error || '无法完成试卷识别。');
        }

        const normalized = normalizeFormulaResult(payload);
        if (!normalized.latex && !normalized.mathml && !normalized.plainText) {
            throw new Error('未能在试卷中找到可用的题目信息。');
        }

        renderFormulaResult(normalized);
        formulaForm.reset();
        setFormulaStatus('识别完成，可截图或复制下方文本。', 'success');
    } catch (error) {
        console.error(error);
        resetFormulaResult();
        setFormulaStatus(error?.message || '无法完成试卷识别。', 'error');
    } finally {
        setFormulaProcessingState(false);
    }
});

formulaCopyLatexBtn?.addEventListener('click', () => {
    const text = formulaLatexOutput?.value || '';
    copyFormulaTextToClipboard(text, 'LaTeX');
});

formulaCopyMathmlBtn?.addEventListener('click', () => {
    const text = formulaMathmlOutput?.value || '';
    copyFormulaTextToClipboard(text, 'MathML');
});

paperRepoImagesInput?.addEventListener('change', () => {
    setPaperRepoStatus('');
});

paperRepoTitleInput?.addEventListener('input', () => {
    setPaperRepoStatus('');
});

paperRepoSubjectInput?.addEventListener('input', () => {
    setPaperRepoStatus('');
});

paperRepoSemesterSelect?.addEventListener('change', () => {
    setPaperRepoStatus('');
});

paperRepoForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    await submitPaperRepoForm();
});

paperRepoRefreshButton?.addEventListener('click', async (event) => {
    event.preventDefault();
    await loadPaperRepo({ force: true });
});

paperRepoSubjectFilter?.addEventListener('change', (event) => {
    state.paperRepo.filters.subject = event.target.value;
    renderPaperRepoList();
});

paperRepoSemesterFilter?.addEventListener('change', (event) => {
    state.paperRepo.filters.semester = event.target.value;
    renderPaperRepoList();
});

photoCheckImageInput?.addEventListener('change', () => {
    if (!photoCheckSubmitButton?.disabled) {
        hidePhotoCheckProgress();
    }
    setPhotoCheckStatus('');
});

photoCheckForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const files = Array.from(photoCheckImageInput?.files || []).filter(Boolean);
    if (files.length === 0) {
        setPhotoCheckStatus('请先选择需要检查的照片。', 'error');
        return;
    }

    const formData = new FormData();
    files.forEach((file) => {
        formData.append('images', file);
    });

    const totalPhotos = files.length;
    const progressMessage =
        totalPhotos > 1 ? `正在上传 ${totalPhotos} 张照片并调用 AI 检查…` : '正在上传照片并调用 AI 检查…';

    setPhotoCheckButtonState(true);
    resetPhotoCheckResults();
    setPhotoCheckStatus('');
    showPhotoCheckProgress(progressMessage);

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

        updatePhotoCheckProgress('检查完成，正在整理结果…');
        renderPhotoCheckResults(data);
        const problemCount = resolvePhotoCheckProblemCount(data);
        const hasProblems = problemCount > 0;
        hidePhotoCheckProgress();
        setPhotoCheckStatus(
            hasProblems ? '检查完成，以下为识别结果。' : '检查完成，但未能识别出具体题目。',
            hasProblems ? 'success' : undefined
        );
    } catch (error) {
        console.error('Photo check failed', error);
        resetPhotoCheckResults();
        hidePhotoCheckProgress();
        setPhotoCheckStatus(error?.message || '无法完成检查，请稍后重试。', 'error');
    } finally {
        hidePhotoCheckProgress();
        setPhotoCheckButtonState(false);
    }
});

photoCheckReport?.addEventListener('change', (event) => {
    const checkbox = event.target.closest('.photo-check-problem__select-input');
    if (!checkbox) return;

    const key = checkbox.dataset.selectionKey;
    if (!key) {
        checkbox.checked = false;
        return;
    }

    if (checkbox.checked) {
        state.photoCheck.selection.add(key);
    } else {
        state.photoCheck.selection.delete(key);
    }

    const item = checkbox.closest('.photo-check-report__item');
    if (item) {
        item.classList.toggle('is-selected', checkbox.checked);
    }

    updatePhotoCheckSelectionUI();
});

photoCheckSaveBtn?.addEventListener('click', (event) => {
    event.preventDefault();
    openPhotoCheckSaveDialog();
});

photoCheckSaveCancel?.addEventListener('click', (event) => {
    event.preventDefault();
    photoCheckSaveDialog?.close('cancel');
});

photoCheckSaveDialog?.addEventListener('close', () => {
    setPhotoCheckSaveStatus('');
});

photoCheckSaveForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    await saveSelectedPhotoCheckProblems();
});

photoCheckHistoryRefreshBtn?.addEventListener('click', async (event) => {
    event.preventDefault();
    await loadPhotoCheckHistory({ force: true });
});

photoCheckHistoryList?.addEventListener('click', async (event) => {
    const actionButton = event.target.closest('.photo-check-history__action-btn');
    if (actionButton) {
        const id = actionButton.dataset.photoCheckHistoryId;
        const action = actionButton.dataset.photoCheckHistoryAction;
        if (!id || !action) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        if (action === 'alias') {
            await promptPhotoCheckHistoryAlias(id);
        } else if (action === 'delete') {
            await deletePhotoCheckHistoryItem(id);
        }
        return;
    }

    const button = event.target.closest('.photo-check-history__entry');
    if (!button) {
        return;
    }

    const id = button.dataset.photoCheckHistoryId;
    if (!id) {
        return;
    }

    event.preventDefault();
    await loadPhotoCheckHistoryRecord(id);
});

photoCheckPreviewList?.addEventListener('click', (event) => {
    const option = event.target.closest('.photo-check-preview__option');
    if (!option) {
        return;
    }

    const index = Number(option.dataset.previewIndex);
    if (!Number.isFinite(index)) {
        return;
    }

    state.photoCheck.previewIndex = index;
    updatePhotoCheckPreview();
});

photoCheckPreviewToggle?.addEventListener('click', (event) => {
    event.preventDefault();
    if (!photoCheckPreview || photoCheckPreview.hidden) {
        return;
    }
    setPhotoCheckPreviewCollapsed(!state.photoCheck.previewCollapsed);
});

photoCheckReport?.addEventListener('click', (event) => {
    const toggleButton = event.target.closest('.photo-check-report__group-toggle');
    if (!toggleButton) {
        return;
    }

    const group = toggleButton.closest('.photo-check-report__group');
    if (!group) {
        return;
    }

    event.preventDefault();
    const isCollapsed = group.classList.toggle('is-collapsed');
    updatePhotoCheckGroupToggleButton(toggleButton, isCollapsed);
});

renderPhotoCheckHistory();

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
    syncAllRichTextInputs();
    const formData = new FormData(wizardForm);
    formData.set('originalImage', wizardOriginalFile);
    const saved = await submitEntry(formData);
    if (!saved) return;
    setDefaultSubjectAndSemester();
    setCreatedAtDefaultValue();
    setRichTextValue('wizard-question-text', '');
    setRichTextValue('wizard-answer-text', '');
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
    const questionText = sanitizeRichTextHtml(formData.get('questionText'));
    const answerText = sanitizeRichTextHtml(formData.get('answerText'));
    const remark = normalize(formData.get('remark'));
    const errorReason = normalize(formData.get('errorReason'));
    const questionImage = formData.get('questionImage');
    const answerImage = formData.get('answerImage');
    const originalImage = formData.get('originalImage');

    const hasQuestionImage = questionImage instanceof File && questionImage.size > 0;
    const hasAnswerImage = answerImage instanceof File && answerImage.size > 0;
    const hasOriginalImage = originalImage instanceof File && originalImage.size > 0;

    if (isRichTextEmpty(questionText) && !hasQuestionImage) {
        alert('请填写题目文字或上传题目图片。');
        return null;
    }

    if (isRichTextEmpty(answerText) && !hasAnswerImage) {
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
        rememberLastSource(source);
        rememberHistoryValue(STORAGE_KEYS.sourceHistory, source);
        rememberHistoryValue(STORAGE_KEYS.subjectHistory, subject);
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
        errorMessage: 'Failed to export paper.',
        payload: () => ({ mode: paperExportMode })
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

editDialog.addEventListener('close', async () => {
    if (editDialog.returnValue !== 'confirm') return;

    const id = document.getElementById('edit-id').value;
    const entry = state.entries.find((item) => item.id === id);
    if (!entry) return;

    const source = document.getElementById('edit-source').value.trim();
    const subject = document.getElementById('edit-subject').value.trim();
    const semester = document.getElementById('edit-semester').value.trim();
    const questionType = document.getElementById('edit-question-type').value.trim();
    const createdAt = document.getElementById('edit-created-at').value || entry.createdAt;
    const errorReason = document.getElementById('edit-error-reason').value.trim();
    syncAllRichTextInputs();
    const questionText = getRichTextValue('edit-question-text');
    const answerText = getRichTextValue('edit-answer-text');
    const remark = document.getElementById('edit-remark').value.trim();
    const questionImageFile = editQuestionImageInput?.files?.[0] || null;
    const answerImageFile = editAnswerImageInput?.files?.[0] || null;

    if (!questionText && !questionImageFile && !entry.questionImageUrl) {
        alert('题目需要文字或图片内容。');
        return;
    }

    if (!answerText && !answerImageFile && !entry.answerImageUrl) {
        alert('答案需要文字或图片内容。');
        return;
    }

    const formData = new FormData();
    formData.set('source', source);
    formData.set('subject', subject);
    formData.set('semester', semester);
    formData.set('questionType', questionType);
    formData.set('createdAt', createdAt);
    formData.set('errorReason', errorReason);
    formData.set('questionText', questionText);
    formData.set('answerText', answerText);
    formData.set('remark', remark);

    if (questionImageFile) {
        formData.set('questionImage', questionImageFile);
    }

    if (answerImageFile) {
        formData.set('answerImage', answerImageFile);
    }

    try {
        const response = await fetch(`/api/entries/${id}`, {
            method: 'PUT',
            body: formData
        });

        if (!response.ok) throw new Error('Failed to update');

        const updated = await response.json();
        const index = state.entries.findIndex((item) => item.id === updated.id);
        if (index !== -1) {
            state.entries[index] = normalizeEntry(updated);
            render();
            loadActivityLog();
        }
    } catch (error) {
        console.error(error);
        alert('Unable to update entry.');
        loadActivityLog();
    }
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
        const normalizedQuestion = richTextToPlainText(entry.questionText || '').replace(/\s+/g, ' ').trim();

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

        const hasQuestionText = !isRichTextEmpty(entry.questionText);
        if (questionTextEl) {
            renderRichTextContent(questionTextEl, entry.questionText || '');
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

        const hasAnswerText = !isRichTextEmpty(entry.answerText);
        if (answerTextEl) {
            renderRichTextContent(answerTextEl, entry.answerText || '');
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
        renderMathInContainer(detailRow);
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
    const questionTypes = state.entries.map((entry) => entry.questionType);
    questionTypes.push(...QUESTION_TYPE_BASE_OPTIONS);
    populateSelect(typeFilter, questionTypes, 'type');
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
        getHistoryValues(STORAGE_KEYS.sourceHistory, state.entries.map((entry) => entry.source)).filter(
            (value) => !value.includes('$')
        )
    );
    updateDatalistOptions(subjectOptionsList, getSubjectSuggestionValues());
    updateDatalistOptions(questionTypeHistoryList, getQuestionTypeSuggestionValues());
}

function getSubjectSuggestionValues() {
    const subjectsFromEntries = state.entries.map((entry) => entry.subject);
    const history = getHistoryValues(STORAGE_KEYS.subjectHistory, subjectsFromEntries);
    return [...SUBJECT_BASE_OPTIONS, ...history];
}

function getQuestionTypeSuggestionValues() {
    const typesFromEntries = state.entries.map((entry) => entry.questionType);
    const history = getHistoryValues(STORAGE_KEYS.questionTypeHistory, typesFromEntries);
    return [...QUESTION_TYPE_BASE_OPTIONS, ...history];
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

function rememberLastSource(source) {
    const normalized = (source ?? '').toString().trim();
    if (!normalized || !LOCAL_STORAGE_AVAILABLE) return;
    try {
        window.localStorage.setItem(STORAGE_KEYS.lastSource, normalized);
    } catch (error) {
        console.warn('Unable to persist last source selection.', error);
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

function getLastSource() {
    if (!LOCAL_STORAGE_AVAILABLE) {
        return '';
    }
    try {
        return (window.localStorage.getItem(STORAGE_KEYS.lastSource) || '').toString().trim();
    } catch (error) {
        console.warn('Unable to read last source selection.', error);
        return '';
    }
}

function setPaperExportMode(mode) {
    const normalized = Object.values(PAPER_EXPORT_MODES).includes(mode) ? mode : PAPER_EXPORT_MODES.DETAILED;
    paperExportMode = normalized;
    syncPaperExportModeToggle();

    if (!LOCAL_STORAGE_AVAILABLE) {
        return;
    }

    try {
        window.localStorage.setItem(STORAGE_KEYS.paperExportMode, normalized);
    } catch (error) {
        console.warn('Unable to persist paper export mode.', error);
    }
}

function getSavedPaperExportMode() {
    if (!LOCAL_STORAGE_AVAILABLE) {
        return PAPER_EXPORT_MODES.DETAILED;
    }

    try {
        const stored = (window.localStorage.getItem(STORAGE_KEYS.paperExportMode) || '').toString().trim();
        if (Object.values(PAPER_EXPORT_MODES).includes(stored)) {
            return stored;
        }
    } catch (error) {
        console.warn('Unable to read paper export mode.', error);
    }

    return PAPER_EXPORT_MODES.DETAILED;
}

function syncPaperExportModeToggle() {
    if (!paperModeToggle) {
        return;
    }
    paperModeToggle.checked = paperExportMode === PAPER_EXPORT_MODES.QUESTION_ONLY;
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
                richTextToPlainText(entry.questionText),
                richTextToPlainText(entry.answerText),
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

function normalizeExportPayload(payload) {
    if (!payload) {
        return {};
    }

    try {
        const result = typeof payload === 'function' ? payload() : payload;
        if (result && typeof result === 'object' && !Array.isArray(result)) {
            return result;
        }
    } catch (error) {
        console.warn('Failed to build export payload.', error);
    }

    return {};
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
    const { type, endpoint, fallbackName, errorMessage, payload } = options;
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
            body: JSON.stringify({
                ids: Array.from(state.selectedIds),
                ...normalizeExportPayload(payload)
            })
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

function hideEntriesListPanel() {
    if (!entriesListPanel || entriesListPanel.hidden) {
        return;
    }
    entriesListPanel.hidden = true;
}

function showEntriesListPanel() {
    if (!entriesListPanel || !entriesListPanel.hidden) {
        return;
    }
    entriesListPanel.hidden = false;
}

function restoreEntriesListPanelVisibility() {
    if (!entriesListPanel) {
        return;
    }
    const hasActiveSecondaryPanel = [
        entryPanel,
        wizardPanel,
        photoCheckPanel,
        formulaPanel,
        logPanel,
        paperRepoPanel
    ].some((panel) => panel && !panel.hidden);
    if (!hasActiveSecondaryPanel) {
        showEntriesListPanel();
    }
}

function showPhotoCheckPanel() {
    if (!photoCheckPanel) return;
    hideEntriesListPanel();
    hideEntryPanel({ scroll: false, restoreEntries: false });
    hideWizardPanel({ scroll: false, reset: false, restoreEntries: false });
    hideFormulaPanel({ scroll: false, reset: false, restoreEntries: false });
    hidePaperRepoPanel({ scroll: false, restoreEntries: false });
    hideLogPanel({ scroll: false, restoreEntries: false });
    const wasHidden = Boolean(photoCheckPanel.hidden);
    if (wasHidden) {
        photoCheckPanel.hidden = false;
        loadPhotoCheckHistory({ lazy: true });
    }
    openPhotoCheckPanelLink?.setAttribute('aria-expanded', 'true');
    photoCheckPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (wasHidden) {
        photoCheckImageInput?.focus();
    }
}

function hidePhotoCheckPanel(options = {}) {
    if (!photoCheckPanel) return;
    const { scroll = true, reset = true, restoreEntries = true } = options;
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
    if (restoreEntries) {
        restoreEntriesListPanelVisibility();
    }
}

function showPaperRepoPanel() {
    if (!paperRepoPanel) return;
    hideEntriesListPanel();
    hideEntryPanel({ scroll: false, restoreEntries: false });
    hideWizardPanel({ scroll: false, reset: false, restoreEntries: false });
    hidePhotoCheckPanel({ scroll: false, reset: false, restoreEntries: false });
    hideFormulaPanel({ scroll: false, reset: false, restoreEntries: false });
    hideLogPanel({ scroll: false, restoreEntries: false });
    const wasHidden = Boolean(paperRepoPanel.hidden);
    if (wasHidden) {
        paperRepoPanel.hidden = false;
        loadPaperRepo({ lazy: true });
    }
    openPaperRepoPanelLink?.setAttribute('aria-expanded', 'true');
    paperRepoPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (wasHidden) {
        paperRepoTitleInput?.focus();
    }
}

function hidePaperRepoPanel(options = {}) {
    if (!paperRepoPanel) return;
    const { scroll = true, restoreEntries = true } = options;
    openPaperRepoPanelLink?.setAttribute('aria-expanded', 'false');
    if (paperRepoPanel.hidden) {
        if (restoreEntries) {
            restoreEntriesListPanelVisibility();
        }
        return;
    }
    paperRepoPanel.hidden = true;
    if (scroll !== false) {
        document.getElementById('entries-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    if (restoreEntries) {
        restoreEntriesListPanelVisibility();
    }
}

function showFormulaPanel() {
    if (!formulaPanel) return;
    hideEntriesListPanel();
    hideEntryPanel({ scroll: false, restoreEntries: false });
    hideWizardPanel({ scroll: false, reset: false, restoreEntries: false });
    hidePhotoCheckPanel({ scroll: false, reset: false, restoreEntries: false });
    hidePaperRepoPanel({ scroll: false, restoreEntries: false });
    hideLogPanel({ scroll: false, restoreEntries: false });
    const wasHidden = Boolean(formulaPanel.hidden);
    if (wasHidden) {
        formulaPanel.hidden = false;
    }
    openFormulaPanelLink?.setAttribute('aria-expanded', 'true');
    formulaPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (wasHidden) {
        formulaImageInput?.focus();
    }
}

function hideFormulaPanel(options = {}) {
    if (!formulaPanel) return;
    const { scroll = true, reset = true, restoreEntries = true } = options;
    openFormulaPanelLink?.setAttribute('aria-expanded', 'false');
    if (!formulaPanel.hidden) {
        formulaPanel.hidden = true;
    }
    if (reset) {
        resetFormulaRecognition();
    }
    if (scroll !== false) {
        document.getElementById('entries-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    if (restoreEntries) {
        restoreEntriesListPanelVisibility();
    }
}

function scrollPhotoCheckResultsIntoView() {
    if (!photoCheckResultsSection || photoCheckResultsSection.hidden) {
        return;
    }

    photoCheckResultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function resetPhotoCheckPanel() {
    photoCheckForm?.reset();
    resetPhotoCheckResults();
    setPhotoCheckStatus('');
    hidePhotoCheckProgress();
    setPhotoCheckButtonState(false);
}

function resetFormulaRecognition() {
    formulaForm?.reset();
    resetFormulaResult();
    setFormulaStatus('');
    setFormulaProcessingState(false);
}

function resetFormulaResult() {
    state.formulaRecognition.result = {
        latex: '',
        mathml: '',
        plainText: ''
    };
    if (formulaResultSection) {
        formulaResultSection.hidden = true;
    }
    if (formulaRender) {
        formulaRender.innerHTML = '';
    }
    if (formulaLatexOutput) {
        formulaLatexOutput.value = '';
    }
    if (formulaMathmlOutput) {
        formulaMathmlOutput.value = '';
    }
    if (formulaPlainOutput) {
        formulaPlainOutput.value = '';
    }
}

function setFormulaStatus(message, variant) {
    if (!formulaStatusEl) return;
    formulaStatusEl.textContent = message || '';
    formulaStatusEl.classList.remove('is-error', 'is-success');
    if (!variant) {
        return;
    }
    if (variant === 'error') {
        formulaStatusEl.classList.add('is-error');
    } else if (variant === 'success') {
        formulaStatusEl.classList.add('is-success');
    }
}

function setFormulaProcessingState(isProcessing) {
    state.formulaRecognition.isProcessing = Boolean(isProcessing);
    if (!formulaSubmitButton) return;
    formulaSubmitButton.disabled = Boolean(isProcessing);
    if (isProcessing) {
        formulaSubmitButton.textContent = '识别中…';
    } else {
        formulaSubmitButton.textContent = formulaSubmitButtonDefaultLabel || '识别试卷';
    }
}

function normalizeFormulaResult(raw) {
    if (!raw) {
        return {
            latex: '',
            mathml: '',
            plainText: ''
        };
    }

    if (typeof raw === 'string') {
        const text = sanitizeFormulaText(raw);
        return {
            latex: text,
            mathml: '',
            plainText: text
        };
    }

    const latexCandidates = [
        raw.latex,
        raw.latex_code,
        raw.tex,
        raw.LaTeX,
        raw.formula,
        raw.formulaLatex,
        raw.expression,
        raw.text
    ];
    const mathmlCandidates = [raw.mathml, raw.mathML, raw.math_ml];
    const plainCandidates = [raw.plainText, raw.plain_text, raw.linear, raw.description, raw.readable, raw.caption];

    const latex = latexCandidates.map(sanitizeFormulaText).find(Boolean) || '';
    const mathml = mathmlCandidates.map(sanitizeFormulaText).find(Boolean) || '';
    const plainText = plainCandidates.map(sanitizeFormulaText).find(Boolean) || '';

    return { latex, mathml, plainText };
}

function sanitizeFormulaText(value) {
    if (value == null) {
        return '';
    }
    const cleaned = String(value)
        .replace(/```(?:json|latex|math)?/gi, '')
        .replace(/```/g, '')
        .replace(/^[^\S\r\n]+/gm, '')
        .trim();

    return mergeQuestionNumbersWithContent(cleaned);
}

function mergeQuestionNumbersWithContent(text) {
    if (!text) return '';

    const lines = String(text).split(/\r?\n/);
    const merged = [];

    for (let index = 0; index < lines.length; index += 1) {
        const current = lines[index];
        const next = lines[index + 1];

        if (isQuestionNumberLine(current) && next && next.trim()) {
            merged.push(`${current.trim()} ${next.trimStart()}`);
            index += 1;
        } else {
            merged.push(current);
        }
    }

    return merged.join('\n');
}

function isQuestionNumberLine(line) {
    return /^\s*[（(]?(?:第\s*)?\d+[.)．、）]?\s*$/.test(line || '');
}

function renderFormulaResult(result) {
    state.formulaRecognition.result = { ...result };
    if (formulaResultSection) {
        formulaResultSection.hidden = false;
    }
    if (formulaLatexOutput) {
        formulaLatexOutput.value = result.latex || '';
    }
    if (formulaMathmlOutput) {
        formulaMathmlOutput.value = result.mathml || '';
    }
    if (formulaPlainOutput) {
        formulaPlainOutput.value = result.plainText || '';
    }
    renderFormulaPreview(result);
}

function renderFormulaPreview(result) {
    if (!formulaRender) return;
    formulaRender.innerHTML = '';

    const latex = result.latex || '';
    const mathml = result.mathml || '';
    const plainText = result.plainText || '';

    if (latex && window.katex && typeof window.katex.render === 'function') {
        try {
            window.katex.render(latex, formulaRender, {
                throwOnError: false,
                displayMode: true
            });
            return;
        } catch (error) {
            console.warn('KaTeX render failed', error);
        }
    }

    if (mathml) {
        const template = document.createElement('template');
        template.innerHTML = mathml;
        const mathElement = template.content.querySelector('math');
        if (mathElement) {
            formulaRender.appendChild(mathElement.cloneNode(true));
            return;
        }
    }

    const fallbackText = latex || plainText;
    const pre = document.createElement('pre');
    pre.textContent = fallbackText || '暂无可预览的内容。';
    formulaRender.appendChild(pre);
}

async function copyFormulaTextToClipboard(text, label) {
    if (!text) {
        setFormulaStatus(`暂无可复制的 ${label} 内容。`, 'error');
        return;
    }

    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
        } else {
            legacyCopyText(text);
        }
        setFormulaStatus(`${label} 已复制到剪贴板。`, 'success');
    } catch (error) {
        console.warn('Failed to copy formula text', error);
        setFormulaStatus(`无法复制 ${label}，请手动选中后复制。`, 'error');
    }
}

function legacyCopyText(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', 'true');
    textarea.style.position = 'fixed';
    textarea.style.top = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    try {
        document.execCommand('copy');
    } catch (error) {
        console.warn('execCommand copy failed', error);
    } finally {
        document.body.removeChild(textarea);
    }
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

function setPhotoCheckButtonState(isProcessing) {
    if (!photoCheckSubmitButton) {
        return;
    }
    photoCheckSubmitButton.disabled = Boolean(isProcessing);
    photoCheckSubmitButton.classList.toggle('is-busy', Boolean(isProcessing));
}

function showPhotoCheckProgress(message) {
    if (!photoCheckProgress) {
        return;
    }
    updatePhotoCheckProgress(message);
    photoCheckProgress.classList.add('is-active');
    photoCheckProgress.hidden = false;
}

function updatePhotoCheckProgress(message) {
    if (photoCheckProgressLabel) {
        photoCheckProgressLabel.textContent = message || '';
    }
}

function hidePhotoCheckProgress() {
    if (!photoCheckProgress) {
        return;
    }
    photoCheckProgress.classList.remove('is-active');
    photoCheckProgress.hidden = true;
    updatePhotoCheckProgress('');
}

function renderPhotoCheckResults(result) {
    if (!photoCheckResultsSection || !photoCheckSummary || !photoCheckReport) {
        return;
    }

    const batches = normalizePhotoCheckBatchResults(result);
    const overall = aggregatePhotoCheckBatchSummary(batches);
    const summaryText = buildPhotoCheckBatchSummaryText(batches, overall);

    state.photoCheck.batches = batches;
    state.photoCheck.problems = buildPhotoCheckSelectionMap(batches);
    state.photoCheck.selection.clear();
    state.photoCheck.recordId = typeof result?.recordId === 'string' ? result.recordId : null;
    state.photoCheck.createdAt = typeof result?.createdAt === 'string' ? result.createdAt : null;
    state.photoCheck.previewIndex = 0;
    state.photoCheck.previewCollapsed = true;
    state.photoCheck.isSaving = false;

    updatePhotoCheckPreview();

    photoCheckReport.innerHTML = '';

    if (batches.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'photo-check-report__attempt-empty';
        empty.textContent = '未能识别出具体题目。';
        photoCheckReport.appendChild(empty);
    } else {
        batches.forEach((batch) => {
            photoCheckReport.appendChild(createPhotoCheckReportGroup(batch));
        });
    }

    photoCheckSummary.textContent = summaryText;
    photoCheckResultsSection.hidden = false;

    const historyMetadata = buildPhotoCheckHistoryMetadata(result, batches, overall);
    if (historyMetadata) {
        const normalizedHistory = upsertPhotoCheckHistoryItem(historyMetadata);
        state.photoCheck.history.selectedId = normalizedHistory?.id || historyMetadata.id;
    } else if (state.photoCheck.recordId) {
        state.photoCheck.history.selectedId = state.photoCheck.recordId;
    }

    renderPhotoCheckHistory();
    syncPhotoCheckSelectionToDom();
    updatePhotoCheckSelectionUI();
}

function buildPhotoCheckSelectionKey(batchIndex, problemIndex) {
    const batchValue = toFiniteNumber(batchIndex);
    const problemValue = toFiniteNumber(problemIndex);

    if (!Number.isFinite(batchValue) || batchValue <= 0 || !Number.isFinite(problemValue) || problemValue <= 0) {
        return '';
    }

    const normalizedBatch = Math.max(1, Math.floor(batchValue));
    const normalizedProblem = Math.max(1, Math.floor(problemValue));
    return `${normalizedBatch}:${normalizedProblem}`;
}

function buildPhotoCheckSelectionMap(batches) {
    const map = new Map();
    const list = Array.isArray(batches) ? batches : [];

    list.forEach((batch) => {
        const batchIndex = toFiniteNumber(batch?.index) || 0;
        const { rows, attemptOrder, attemptMetadata } = buildPhotoCheckProblemRows(batch?.attempts || []);

        rows.forEach((row) => {
            const key = buildPhotoCheckSelectionKey(batchIndex || row.index, row.index);
            if (!key) {
                return;
            }

            const attempts = Array.from(row.attempts.entries()).map(([attemptIndex, problem]) => {
                const metadata = attemptMetadata instanceof Map ? attemptMetadata.get(attemptIndex) : null;
                return {
                    attemptIndex,
                    provider: metadata?.provider || null,
                    label: metadata?.label || null,
                    problem
                };
            });

            map.set(key, {
                key,
                batchIndex: batchIndex || row.index,
                batchName: typeof batch?.name === 'string' ? batch.name : '',
                problemIndex: row.index,
                attempts,
                attemptOrder: Array.isArray(attemptOrder) ? [...attemptOrder] : [],
                image: findPhotoCheckProblemImage(row, attemptOrder),
                boundingBox: row.boundingBox || null
            });
        });
    });

    return map;
}

function syncPhotoCheckSelectionToDom() {
    if (!photoCheckReport) {
        return;
    }

    const checkboxes = photoCheckReport.querySelectorAll('.photo-check-problem__select-input');
    checkboxes.forEach((checkbox) => {
        const key = checkbox.dataset.selectionKey;
        const checked = key ? state.photoCheck.selection.has(key) : false;
        checkbox.checked = checked;
        const item = checkbox.closest('.photo-check-report__item');
        if (item) {
            item.classList.toggle('is-selected', checked);
        }
    });
}

function updatePhotoCheckSelectionUI() {
    const hasResults = Array.isArray(state.photoCheck.batches) && state.photoCheck.batches.length > 0;

    if (photoCheckActions) {
        photoCheckActions.hidden = !hasResults;
    }

    const selectedCount = state.photoCheck.selection.size;

    if (photoCheckSelectionStatus) {
        let statusText;
        if (!hasResults) {
            statusText = '尚未进行拍照检查。';
        } else if (selectedCount > 0) {
            statusText = `已选择 ${selectedCount} 道题。`;
        } else {
            statusText = '尚未选择题目。';
        }

        if (state.photoCheck.recordId) {
            statusText += ` 记录编号：${state.photoCheck.recordId}`;
        }

        photoCheckSelectionStatus.textContent = statusText;
    }

    if (photoCheckSaveBtn) {
        photoCheckSaveBtn.disabled = !hasResults || selectedCount === 0 || state.photoCheck.isSaving;
        photoCheckSaveBtn.classList.toggle('is-busy', state.photoCheck.isSaving);
    }

    if (photoCheckSaveConfirm) {
        photoCheckSaveConfirm.disabled = state.photoCheck.isSaving || selectedCount === 0;
    }
}

function renderPhotoCheckHistory() {
    if (!photoCheckHistoryList || !photoCheckHistoryStatus) {
        return;
    }

    const historyState = state.photoCheck.history || {};
    const items = Array.isArray(historyState.items) ? historyState.items : [];

    photoCheckHistoryStatus.textContent = '';
    photoCheckHistoryStatus.classList.remove('is-error', 'is-success');

    if (photoCheckHistoryRefreshBtn) {
        photoCheckHistoryRefreshBtn.disabled = Boolean(historyState.isLoading);
        photoCheckHistoryRefreshBtn.classList.toggle('is-busy', Boolean(historyState.isLoading));
    }

    if (historyState.isLoading) {
        photoCheckHistoryStatus.textContent = '正在加载历史记录…';
    } else if (historyState.error) {
        photoCheckHistoryStatus.textContent = historyState.error;
        photoCheckHistoryStatus.classList.add('is-error');
    } else if (historyState.message) {
        photoCheckHistoryStatus.textContent = historyState.message;
        if (historyState.messageVariant === 'error') {
            photoCheckHistoryStatus.classList.add('is-error');
        } else if (historyState.messageVariant === 'success') {
            photoCheckHistoryStatus.classList.add('is-success');
        }
    } else if (items.length > 0) {
        photoCheckHistoryStatus.textContent = '点击记录可重新查看当时的检查结果。';
    } else if (historyState.lastLoadedAt) {
        photoCheckHistoryStatus.textContent = '暂无拍照检查记录。';
    } else {
        photoCheckHistoryStatus.textContent = '尚未加载历史记录。';
    }

    photoCheckHistoryList.innerHTML = '';

    if (!items.length) {
        return;
    }

    items.forEach((item) => {
        const li = document.createElement('li');
        li.className = 'photo-check-history__item';

        const container = document.createElement('div');
        container.className = 'photo-check-history__entry-container';
        li.appendChild(container);

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'photo-check-history__entry';
        button.dataset.photoCheckHistoryId = item.id;

        const aliasText = typeof item.alias === 'string' && item.alias.trim() ? item.alias.trim() : '';
        const tooltipTime = formatDateTimeWithMinutes(item.createdAt);
        const tooltipParts = [];

        if (aliasText) {
            tooltipParts.push(`别名：${aliasText}`);
        }
        if (tooltipTime) {
            tooltipParts.push(`拍照检查时间：${tooltipTime}`);
        } else {
            tooltipParts.push(`拍照检查记录 ${item.id}`);
        }

        button.title = tooltipParts.join('\n');

        if (historyState.selectedId && historyState.selectedId === item.id) {
            button.classList.add('is-active');
        }

        if (
            (historyState.loadingRecordId && historyState.loadingRecordId === item.id) ||
            (historyState.mutatingId && historyState.mutatingId === item.id)
        ) {
            button.disabled = true;
        }

        const title = document.createElement('span');
        title.className = 'photo-check-history__entry-title';

        const fullTitleText = formatPhotoCheckHistoryTitle(item);
        const timestampText = item.createdAt ? fullTitleText : '';
        if (aliasText) {
            const aliasEl = document.createElement('span');
            aliasEl.className = 'photo-check-history__alias';
            aliasEl.textContent = aliasText;
            title.appendChild(aliasEl);

            if (timestampText) {
                const timeEl = document.createElement('span');
                timeEl.className = 'photo-check-history__timestamp';
                timeEl.textContent = timestampText;
                title.appendChild(timeEl);
            }
        } else {
            title.textContent = fullTitleText;
        }
        button.appendChild(title);

        const meta = document.createElement('div');
        meta.className = 'photo-check-history__entry-meta';

        const badges = computePhotoCheckHistoryBadges(item);
        badges.forEach((text) => {
            const badge = document.createElement('span');
            badge.className = 'photo-check-history__badge';
            badge.textContent = text;
            meta.appendChild(badge);
        });

        if (historyState.loadingRecordId && historyState.loadingRecordId === item.id) {
            const loadingBadge = document.createElement('span');
            loadingBadge.className = 'photo-check-history__badge';
            loadingBadge.textContent = '加载中…';
            meta.appendChild(loadingBadge);
        }

        if (historyState.mutatingId && historyState.mutatingId === item.id) {
            const mutatingBadge = document.createElement('span');
            mutatingBadge.className = 'photo-check-history__badge';
            mutatingBadge.textContent = '处理中…';
            meta.appendChild(mutatingBadge);
        }

        if (meta.childElementCount > 0) {
            button.appendChild(meta);
        }

        const extra = document.createElement('span');
        extra.className = 'photo-check-history__extra';
        const extraParts = [`记录编号：${item.id}`];
        if (aliasText) {
            extraParts.push(`别名：${aliasText}`);
        }
        extra.textContent = extraParts.join(' · ');
        button.appendChild(extra);

        container.appendChild(button);

        const actions = document.createElement('div');
        actions.className = 'photo-check-history__actions';

        const aliasButton = document.createElement('button');
        aliasButton.type = 'button';
        aliasButton.className = 'btn btn-secondary btn-compact photo-check-history__action-btn';
        aliasButton.dataset.photoCheckHistoryId = item.id;
        aliasButton.dataset.photoCheckHistoryAction = 'alias';
        aliasButton.textContent = aliasText ? '修改别名' : '添加别名';
        aliasButton.title = aliasText ? '修改该记录的别名' : '为该记录添加别名';
        if (historyState.isLoading) {
            aliasButton.disabled = true;
        }
        if (historyState.mutatingId && historyState.mutatingId === item.id) {
            aliasButton.disabled = true;
            aliasButton.classList.add('is-busy');
        }
        actions.appendChild(aliasButton);

        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.className = 'btn btn-danger btn-compact photo-check-history__action-btn';
        deleteButton.dataset.photoCheckHistoryId = item.id;
        deleteButton.dataset.photoCheckHistoryAction = 'delete';
        deleteButton.textContent = '删除';
        deleteButton.title = '删除该历史记录';
        if (historyState.isLoading) {
            deleteButton.disabled = true;
        }
        if (historyState.mutatingId && historyState.mutatingId === item.id) {
            deleteButton.disabled = true;
            deleteButton.classList.add('is-busy');
        }
        actions.appendChild(deleteButton);

        container.appendChild(actions);
        photoCheckHistoryList.appendChild(li);
    });
}

async function loadPhotoCheckHistory(options = {}) {
    const historyState = state.photoCheck.history;
    if (!historyState) {
        return;
    }

    const { force = false, lazy = false } = options;

    if (historyState.isLoading) {
        return;
    }

    if (!force && lazy && historyState.items.length > 0 && !historyState.error) {
        return;
    }

    historyState.isLoading = true;
    historyState.error = '';
    historyState.message = '';
    historyState.messageVariant = '';
    renderPhotoCheckHistory();

    try {
        const response = await fetch('/api/photo-check/history', { cache: 'no-store' });
        const payload = await response.json().catch(() => []);

        if (!response.ok) {
            const message = payload?.error || '无法加载拍照检查历史记录。';
            throw new Error(message);
        }

        const items = Array.isArray(payload)
            ? payload.map(normalizePhotoCheckHistoryItem).filter(Boolean)
            : [];

        historyState.items = items;
        historyState.lastLoadedAt = Date.now();
        historyState.error = '';
        if (force) {
            historyState.message = items.length > 0 ? '历史记录已更新。' : '暂无拍照检查记录。';
            historyState.messageVariant = items.length > 0 ? 'success' : '';
        }

        if (historyState.selectedId) {
            const exists = items.some((item) => item.id === historyState.selectedId);
            if (!exists) {
                historyState.selectedId = null;
            }
        }
    } catch (error) {
        console.error('Failed to load photo check history', error);
        historyState.error = error?.message || '无法加载拍照检查历史记录。';
    } finally {
        historyState.isLoading = false;
        renderPhotoCheckHistory();
    }
}

async function loadPhotoCheckHistoryRecord(id) {
    const normalizedId = typeof id === 'string' ? id.trim() : '';
    if (!normalizedId) {
        return;
    }

    const historyState = state.photoCheck.history;
    if (!historyState || historyState.loadingRecordId === normalizedId) {
        return;
    }

    historyState.loadingRecordId = normalizedId;
    historyState.message = '';
    historyState.messageVariant = '';
    renderPhotoCheckHistory();
    setPhotoCheckStatus('正在加载拍照检查记录…');

    try {
        const response = await fetch(`/api/photo-check/records/${encodeURIComponent(normalizedId)}`, {
            cache: 'no-store'
        });
        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
            const message = payload?.error || '无法读取拍照检查记录。';
            throw new Error(message);
        }

        const record = payload && typeof payload === 'object' ? payload : {};
        const recordPayload = {
            ...record,
            recordId:
                typeof record.recordId === 'string' && record.recordId.trim()
                    ? record.recordId.trim()
                    : normalizedId,
            createdAt: typeof record.createdAt === 'string' ? record.createdAt : record.timestamp || null
        };

        renderPhotoCheckResults(recordPayload);
        scrollPhotoCheckResultsIntoView();
        setPhotoCheckStatus('已加载历史记录。', 'success');
        historyState.selectedId = normalizedId;
    } catch (error) {
        console.error('Failed to load photo check record', error);
        setPhotoCheckStatus(error?.message || '无法读取拍照检查记录。', 'error');
    } finally {
        historyState.loadingRecordId = null;
        renderPhotoCheckHistory();
    }
}

async function promptPhotoCheckHistoryAlias(id) {
    const normalizedId = typeof id === 'string' ? id.trim() : '';
    if (!normalizedId) {
        return;
    }

    const historyState = state.photoCheck.history;
    if (!historyState || historyState.mutatingId) {
        // Another mutation is in progress; defer until it completes.
        return;
    }

    const currentItem = historyState.items.find((item) => item.id === normalizedId);
    const currentAliasRaw = typeof currentItem?.alias === 'string' ? currentItem.alias : '';
    const currentAlias = currentAliasRaw.replace(/\s+/g, ' ').trim();

    const input = window.prompt('请输入该历史记录的别名（留空可清除）：', currentAliasRaw);
    if (input === null) {
        return;
    }

    let alias = input.replace(/\s+/g, ' ').trim();
    if (alias.length > 100) {
        alias = alias.slice(0, 100);
        alert('别名已截断为 100 个字符。');
    }

    if (alias === currentAlias) {
        return;
    }

    await savePhotoCheckHistoryAlias(normalizedId, alias);
}

async function savePhotoCheckHistoryAlias(id, alias) {
    const normalizedId = typeof id === 'string' ? id.trim() : '';
    if (!normalizedId) {
        return;
    }

    const historyState = state.photoCheck.history;
    if (!historyState || historyState.mutatingId) {
        return;
    }

    historyState.mutatingId = normalizedId;
    historyState.message = '';
    historyState.messageVariant = '';
    renderPhotoCheckHistory();

    try {
        const response = await fetch(`/api/photo-check/history/${encodeURIComponent(normalizedId)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ alias })
        });
        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
            const message = payload?.error || '无法更新拍照检查别名。';
            throw new Error(message);
        }

        upsertPhotoCheckHistoryItem(payload);
        const aliasMessage = alias ? '别名已更新。' : '别名已清除。';
        historyState.message = aliasMessage;
        historyState.messageVariant = 'success';
    } catch (error) {
        console.error('Failed to update photo check history alias', error);
        historyState.message = error?.message || '无法更新拍照检查别名。';
        historyState.messageVariant = 'error';
    } finally {
        historyState.mutatingId = null;
        renderPhotoCheckHistory();
    }
}

async function deletePhotoCheckHistoryItem(id) {
    const normalizedId = typeof id === 'string' ? id.trim() : '';
    if (!normalizedId) {
        return;
    }

    const historyState = state.photoCheck.history;
    if (!historyState || historyState.mutatingId) {
        return;
    }

    const confirmed = window.confirm('确定要删除该拍照检查记录吗？此操作无法撤销。');
    if (!confirmed) {
        return;
    }

    historyState.mutatingId = normalizedId;
    historyState.message = '';
    historyState.messageVariant = '';
    renderPhotoCheckHistory();

    try {
        const response = await fetch(`/api/photo-check/history/${encodeURIComponent(normalizedId)}`, {
            method: 'DELETE'
        });
        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
            const message = payload?.error || '无法删除拍照检查记录。';
            throw new Error(message);
        }

        historyState.items = historyState.items.filter((item) => item.id !== normalizedId);

        if (historyState.selectedId === normalizedId) {
            historyState.selectedId = null;
        }

        if (state.photoCheck.recordId === normalizedId) {
            resetPhotoCheckResults();
        }

        historyState.message = '历史记录已删除。';
        historyState.messageVariant = 'success';
    } catch (error) {
        console.error('Failed to delete photo check history record', error);
        historyState.message = error?.message || '无法删除拍照检查记录。';
        historyState.messageVariant = 'error';
    } finally {
        historyState.mutatingId = null;
        renderPhotoCheckHistory();
    }
}

function buildPhotoCheckHistoryMetadata(result, batches, overall) {
    if (!result) {
        return null;
    }

    const candidates = [result.recordId, result.id];
    let id = '';
    for (const candidate of candidates) {
        if (typeof candidate === 'string' && candidate.trim()) {
            id = candidate.trim();
            break;
        }
    }

    if (!id) {
        return null;
    }

    const summary = normalizePhotoCheckSummary(result.overall || overall || {});

    let totalImages = toFiniteNumber(result.totalImages);
    if (!Number.isFinite(totalImages) && Array.isArray(result.results)) {
        totalImages = result.results.length;
    }
    if (!Number.isFinite(totalImages) && Array.isArray(batches)) {
        totalImages = batches.length;
    }
    totalImages = Number.isFinite(totalImages) ? Math.max(0, Math.round(totalImages)) : 0;

    let problems = 0;
    if (Array.isArray(result.problems)) {
        problems = result.problems.length;
    } else {
        const numericProblems = toFiniteNumber(result.problems);
        problems = Number.isFinite(numericProblems) ? Math.max(0, Math.round(numericProblems)) : summary.total;
    }

    const createdAt = typeof result.createdAt === 'string' ? result.createdAt : null;
    let alias = '';
    if (typeof result.alias === 'string') {
        alias = result.alias.replace(/\s+/g, ' ').trim().slice(0, 100);
    }

    return {
        id,
        alias,
        createdAt,
        totalImages,
        problems,
        overall: summary
    };
}

function normalizePhotoCheckHistoryItem(raw) {
    if (!raw || typeof raw !== 'object') {
        return null;
    }

    const candidates = [raw.id, raw.recordId];
    let id = '';
    for (const candidate of candidates) {
        if (typeof candidate === 'string' && candidate.trim()) {
            id = candidate.trim();
            break;
        }
    }

    if (!id) {
        return null;
    }

    const summary = normalizePhotoCheckSummary(raw.overall || {});

    let totalImages = toFiniteNumber(raw.totalImages);
    totalImages = Number.isFinite(totalImages) ? Math.max(0, Math.round(totalImages)) : 0;

    let problems = 0;
    if (Array.isArray(raw.problems)) {
        problems = raw.problems.length;
    } else {
        const numericProblems = toFiniteNumber(raw.problems);
        problems = Number.isFinite(numericProblems) ? Math.max(0, Math.round(numericProblems)) : summary.total;
    }

    let alias = '';
    if (typeof raw.alias === 'string') {
        alias = raw.alias.replace(/\s+/g, ' ').trim().slice(0, 100);
    }

    return {
        id,
        alias,
        createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : null,
        totalImages,
        problems,
        overall: summary
    };
}

function upsertPhotoCheckHistoryItem(raw) {
    const historyState = state.photoCheck.history;
    if (!historyState) {
        return null;
    }

    const normalized = normalizePhotoCheckHistoryItem(raw);
    if (!normalized) {
        return null;
    }

    const items = Array.isArray(historyState.items) ? [...historyState.items] : [];
    const existingIndex = items.findIndex((item) => item.id === normalized.id);

    if (existingIndex >= 0) {
        items[existingIndex] = { ...items[existingIndex], ...normalized };
    } else {
        items.unshift(normalized);
    }

    items.sort((a, b) => {
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bTime - aTime;
    });

    const seen = new Set();
    const unique = [];
    items.forEach((item) => {
        if (seen.has(item.id)) {
            return;
        }
        seen.add(item.id);
        unique.push(item);
    });

    historyState.items = unique;
    historyState.message = '';
    historyState.messageVariant = '';

    return normalized;
}

function computePhotoCheckHistoryBadges(item) {
    const badges = [];
    if (!item) {
        return badges;
    }

    const images = toFiniteNumber(item.totalImages);
    if (Number.isFinite(images) && images > 0) {
        badges.push(`照片 ${Math.max(1, Math.round(images))} 张`);
    }

    const summary = normalizePhotoCheckSummary(item.overall || {});
    if (summary.total > 0) {
        badges.push(`识别 ${summary.total} 题`);
    }
    if (summary.incorrect > 0) {
        badges.push(`需复查 ${summary.incorrect} 题`);
    }
    if (summary.unknown > 0) {
        badges.push(`待确认 ${summary.unknown} 题`);
    }

    return badges;
}

function formatPhotoCheckHistoryTitle(item) {
    if (!item) {
        return '';
    }

    const dateText = formatDateTimeWithMinutes(item.createdAt);
    const relative = formatRelativeTimeSafe(item.createdAt);

    if (dateText && relative) {
        return `${dateText} · ${relative}`;
    }
    if (dateText) {
        return dateText;
    }
    return `记录 ${item.id}`;
}

function formatDateTimeWithMinutes(iso) {
    if (!iso) {
        return '';
    }
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
        return '';
    }
    return dateTimeFormatter.format(date);
}

function formatRelativeTimeSafe(iso) {
    if (!iso) {
        return '';
    }
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
        return '';
    }
    return formatRelativeTime(date.toISOString());
}

function openPhotoCheckSaveDialog() {
    if (!photoCheckSaveDialog) {
        return;
    }

    if (state.photoCheck.selection.size === 0) {
        setPhotoCheckStatus('请先在检查报告中选择需要保存的题目。', 'error');
        return;
    }

    populatePhotoCheckSaveDialog();
    setPhotoCheckSaveStatus('');
    photoCheckSaveDialog.showModal();
}

function populatePhotoCheckSaveDialog() {
    if (!photoCheckSaveList) {
        return;
    }

    photoCheckSaveList.innerHTML = '';

    const selectedItems = Array.from(state.photoCheck.selection)
        .map((key) => state.photoCheck.problems.get(key))
        .filter(Boolean)
        .sort((a, b) => {
            if (a.batchIndex === b.batchIndex) {
                return a.problemIndex - b.problemIndex;
            }
            return a.batchIndex - b.batchIndex;
        });

    if (selectedItems.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'photo-check-save-item__summary';
        empty.textContent = '请在检查报告中先选择需要保存的题目。';
        photoCheckSaveList.appendChild(empty);
        if (photoCheckSaveConfirm) {
            photoCheckSaveConfirm.disabled = true;
        }
        return;
    }

    selectedItems.forEach((item) => {
        const draft = buildPhotoCheckEntryDraft(item);
        photoCheckSaveList.appendChild(createPhotoCheckSaveItem(item, draft));
    });

    if (photoCheckSaveConfirm) {
        photoCheckSaveConfirm.disabled = false;
    }
}

function createPhotoCheckSaveItem(item, draft) {
    const fieldset = document.createElement('fieldset');
    fieldset.className = 'photo-check-save-item';
    fieldset.dataset.problemKey = item.key;
    fieldset.dataset.batchIndex = String(Math.max(1, Math.floor(toFiniteNumber(item.batchIndex) || 1)));
    fieldset.dataset.problemIndex = String(Math.max(1, Math.floor(toFiniteNumber(item.problemIndex) || 1)));

    const legend = document.createElement('legend');
    const batchLabel = Number.isFinite(Number(item.batchIndex))
        ? `第 ${Math.max(1, Math.floor(item.batchIndex))} 张照片`
        : '检查结果';
    legend.textContent = `第 ${Math.max(1, Math.floor(toFiniteNumber(item.problemIndex) || 1))} 题 · ${batchLabel}`;
    fieldset.appendChild(legend);

    const summary = document.createElement('p');
    summary.className = 'photo-check-save-item__summary';
    const verdictText = resolvePhotoCheckVerdictText(item);
    const sourceLabel = item.batchName ? `来源：${item.batchName}` : batchLabel;
    summary.textContent = `${verdictText} · ${sourceLabel}`;

    if (draft.imageUrl) {
        summary.appendChild(document.createTextNode(' '));
        const previewLink = document.createElement('a');
        previewLink.href = draft.imageUrl;
        previewLink.target = '_blank';
        previewLink.rel = 'noopener';
        previewLink.textContent = '查看截图';
        summary.appendChild(previewLink);
    }

    fieldset.appendChild(summary);

    const hiddenImageInput = document.createElement('input');
    hiddenImageInput.type = 'hidden';
    hiddenImageInput.dataset.field = 'imageUrl';
    hiddenImageInput.value = draft.imageUrl || '';
    fieldset.appendChild(hiddenImageInput);

    const grid = document.createElement('div');
    grid.className = 'photo-check-save-item__grid';
    fieldset.appendChild(grid);

    const createField = (labelText, element, options = {}) => {
        const wrapper = document.createElement('label');
        wrapper.className = 'field';
        if (options.span === 2) {
            wrapper.classList.add('field--span-2');
        }
        const span = document.createElement('span');
        span.textContent = labelText;
        wrapper.appendChild(span);
        wrapper.appendChild(element);
        return wrapper;
    };

    const sourceInput = document.createElement('input');
    sourceInput.type = 'text';
    sourceInput.dataset.field = 'source';
    sourceInput.setAttribute('list', 'source-history');
    sourceInput.value = draft.source || '';
    grid.appendChild(createField('来源', sourceInput));

    const subjectInputElement = document.createElement('input');
    subjectInputElement.type = 'text';
    subjectInputElement.dataset.field = 'subject';
    subjectInputElement.setAttribute('list', 'subject-options');
    subjectInputElement.value = draft.subject || '';
    grid.appendChild(createField('学科', subjectInputElement));

    const semesterInput = document.createElement('select');
    semesterInput.dataset.field = 'semester';
    if (semesterSelect) {
        Array.from(semesterSelect.options).forEach((option) => {
            semesterInput.appendChild(option.cloneNode(true));
        });
    } else {
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = '请选择';
        semesterInput.appendChild(placeholder);
        ['八上', '八下', '九上', '九下'].forEach((value) => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = value;
            semesterInput.appendChild(option);
        });
    }
    semesterInput.value = draft.semester || '';
    grid.appendChild(createField('学期', semesterInput));

    const questionTypeInput = document.createElement('input');
    questionTypeInput.type = 'text';
    questionTypeInput.dataset.field = 'questionType';
    questionTypeInput.setAttribute('list', 'question-type-history');
    questionTypeInput.value = draft.questionType || '';
    grid.appendChild(createField('题目类型', questionTypeInput));

    const errorReasonInput = document.createElement('textarea');
    errorReasonInput.rows = 2;
    errorReasonInput.dataset.field = 'errorReason';
    errorReasonInput.value = draft.errorReason || '';
    grid.appendChild(createField('错误原因', errorReasonInput, { span: 2 }));

    const questionTextInput = document.createElement('textarea');
    questionTextInput.rows = 3;
    questionTextInput.dataset.field = 'questionText';
    questionTextInput.value = draft.questionText || '';
    grid.appendChild(createField('题目内容（文字）', questionTextInput, { span: 2 }));

    const answerTextInput = document.createElement('textarea');
    answerTextInput.rows = 3;
    answerTextInput.dataset.field = 'answerText';
    answerTextInput.value = draft.answerText || '';
    grid.appendChild(createField('答案（文字）', answerTextInput, { span: 2 }));

    const remarkInput = document.createElement('textarea');
    remarkInput.rows = 3;
    remarkInput.dataset.field = 'remark';
    remarkInput.value = draft.remark || '';
    grid.appendChild(createField('备注', remarkInput, { span: 2 }));

    return fieldset;
}

function resolvePhotoCheckVerdictText(item) {
    const attempts = Array.isArray(item?.attempts) ? item.attempts : [];
    let hasUnknown = false;
    let hasCorrect = false;

    for (const attempt of attempts) {
        const verdict = attempt?.problem?.isCorrect;
        if (verdict === false) {
            return 'AI 判定：需要复查';
        }
        if (verdict === true) {
            hasCorrect = true;
        }
        if (verdict == null) {
            hasUnknown = true;
        }
    }

    if (hasCorrect) {
        return 'AI 判定：回答正确';
    }

    if (hasUnknown) {
        return 'AI 判定：结果不确定';
    }

    return 'AI 判定：未识别';
}

function buildPhotoCheckEntryDraft(item) {
    const attempts = Array.isArray(item?.attempts) ? item.attempts.slice() : [];
    attempts.sort((a, b) => (a?.attemptIndex || 0) - (b?.attemptIndex || 0));

    const reviewProblems = attempts
        .filter((attempt) => attempt && attempt.attemptIndex !== 1 && attempt.problem)
        .map((attempt) => attempt.problem);
    const primaryProblems = attempts.filter((attempt) => attempt?.problem).map((attempt) => attempt.problem);
    const combinedProblems = [...reviewProblems, ...primaryProblems];

    const pickFirstText = (values) => {
        for (const value of values) {
            const text = cleanPhotoCheckText(value);
            if (text) {
                return text;
            }
        }
        return '';
    };

    const questionText = pickFirstText(combinedProblems.map((problem) => problem?.question));
    const answerText =
        pickFirstText(reviewProblems.map((problem) => problem?.solvedAnswer)) ||
        pickFirstText(primaryProblems.map((problem) => problem?.solvedAnswer)) ||
        '待补充';
    const studentAnswer = pickFirstText(primaryProblems.map((problem) => problem?.studentAnswer));
    const analysis =
        pickFirstText(reviewProblems.map((problem) => problem?.analysis)) ||
        pickFirstText(primaryProblems.map((problem) => problem?.analysis));

    let verdict = null;
    for (const problem of combinedProblems) {
        if (!problem) continue;
        if (problem.isCorrect === false) {
            verdict = false;
            break;
        }
        if (problem.isCorrect === true && verdict !== false) {
            verdict = true;
        }
    }

    if (verdict === null && combinedProblems.some((problem) => problem && problem.isCorrect == null)) {
        verdict = null;
    }

    const remarkParts = [];
    if (studentAnswer) {
        remarkParts.push(`学生作答：${studentAnswer}`);
    }
    if (analysis) {
        remarkParts.push(`AI 解析：${analysis}`);
    }
    if (state.photoCheck.recordId) {
        remarkParts.push(`来自拍照检查记录 ${state.photoCheck.recordId}`);
    }

    let errorReason = '';
    if (verdict === false) {
        errorReason = 'AI判定为错误';
    } else if (verdict == null) {
        errorReason = 'AI判定待确认';
    }

    return {
        source: item?.batchName ? item.batchName : '拍照检查',
        subject: getDefaultSubjectValue(),
        semester: getDefaultSemesterValue(),
        questionType: '',
        questionText: questionText || '',
        answerText: answerText || '待补充',
        errorReason,
        remark: remarkParts.filter(Boolean).join('\n\n'),
        imageUrl: item?.image?.url || ''
    };
}

function collectPhotoCheckSelectionsFromForm() {
    if (!photoCheckSaveList) {
        return [];
    }

    const items = [];
    const fieldsets = photoCheckSaveList.querySelectorAll('.photo-check-save-item');

    fieldsets.forEach((fieldset) => {
        const key = fieldset.dataset.problemKey;
        if (!key) {
            return;
        }

        const data = state.photoCheck.problems.get(key);
        if (!data) {
            return;
        }

        const readFieldValue = (name) => {
            const element = fieldset.querySelector(`[data-field="${name}"]`);
            if (!element) {
                return '';
            }
            if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
                return element.value.trim();
            }
            return '';
        };

        items.push({
            key,
            item: data,
            fields: {
                source: readFieldValue('source'),
                subject: readFieldValue('subject'),
                semester: readFieldValue('semester'),
                questionType: readFieldValue('questionType'),
                questionText: readFieldValue('questionText'),
                answerText: readFieldValue('answerText'),
                errorReason: readFieldValue('errorReason'),
                remark: readFieldValue('remark'),
                imageUrl: readFieldValue('imageUrl')
            }
        });
    });

    return items;
}

function setPhotoCheckSaveStatus(message, variant) {
    if (!photoCheckSaveStatus) {
        return;
    }

    photoCheckSaveStatus.textContent = message || '';
    photoCheckSaveStatus.classList.remove('is-error', 'is-success');

    if (!message) {
        return;
    }

    if (variant === 'error') {
        photoCheckSaveStatus.classList.add('is-error');
    } else if (variant === 'success') {
        photoCheckSaveStatus.classList.add('is-success');
    }
}

async function fetchPhotoCheckImageBlob(url, options = {}) {
    if (!url) {
        return null;
    }

    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`下载题目截图失败（${response.status}）`);
        }

        const blob = await response.blob();
        const extension = resolvePhotoCheckImageExtension(blob, url);
        const baseName = slugifyForFileName(options.baseName || 'photo-check');
        const name = `${baseName}.${extension}`;
        return { blob, name };
    } catch (error) {
        console.warn('Failed to download photo check image', error);
        return null;
    }
}

function resolvePhotoCheckImageExtension(blob, url) {
    const type = blob?.type || '';
    if (type.includes('png')) return 'png';
    if (type.includes('jpeg')) return 'jpg';
    if (type.includes('jpg')) return 'jpg';
    if (type.includes('webp')) return 'webp';
    if (type.includes('gif')) return 'gif';

    const match = /\.([a-zA-Z0-9]+)(?:\?|#|$)/.exec(url || '');
    if (match) {
        const ext = match[1].toLowerCase();
        if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) {
            return ext === 'jpeg' ? 'jpg' : ext;
        }
    }

    return 'png';
}

function slugifyForFileName(value, fallback = 'photo-check') {
    if (value == null) {
        return fallback;
    }

    const slug = value
        .toString()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

    return slug || fallback;
}

async function saveSelectedPhotoCheckProblems() {
    if (state.photoCheck.isSaving) {
        return;
    }

    const selections = collectPhotoCheckSelectionsFromForm();
    if (selections.length === 0) {
        setPhotoCheckSaveStatus('请先选择需要保存的题目。', 'error');
        return;
    }

    state.photoCheck.isSaving = true;
    updatePhotoCheckSelectionUI();
    setPhotoCheckSaveStatus('正在保存选中的错题…');

    let savedCount = 0;

    try {
        for (const selection of selections) {
            const { item, fields } = selection;

            const formData = new FormData();
            const source = fields.source || item.batchName || '拍照检查';
            const subject = fields.subject || getDefaultSubjectValue();
            const semester = fields.semester || getDefaultSemesterValue();
            const questionType = fields.questionType || '';
            const questionText = fields.questionText || '';
            const answerText = fields.answerText || '待补充';
            const errorReason = fields.errorReason || '';
            const remark = fields.remark || '';
            const createdAt = resolvePhotoCheckCreatedAtDate();

            formData.set('source', source);
            formData.set('subject', subject);
            formData.set('semester', semester);
            formData.set('questionType', questionType);
            formData.set('questionText', questionText);
            formData.set('answerText', answerText);
            formData.set('errorReason', errorReason);
            formData.set('remark', remark);
            formData.set('createdAt', createdAt);

            let hasQuestionImage = false;

            if (fields.imageUrl) {
                const baseName = `photo-check-b${Math.max(1, Math.floor(toFiniteNumber(item.batchIndex) || 1))}-q${Math.max(
                    1,
                    Math.floor(toFiniteNumber(item.problemIndex) || 1)
                )}`;
                const imageBlob = await fetchPhotoCheckImageBlob(fields.imageUrl, { baseName });
                if (imageBlob) {
                    formData.append('questionImage', imageBlob.blob, imageBlob.name);
                    hasQuestionImage = true;
                }
            }

            if (!hasQuestionImage && !questionText) {
                throw new Error(`第 ${item.problemIndex} 题缺少题目内容，请补充题干或保持截图有效。`);
            }

            const saved = await submitEntry(formData);
            if (!saved) {
                throw new Error(`保存第 ${item.problemIndex} 题失败，请检查填写内容。`);
            }

            savedCount += 1;
        }

        setPhotoCheckSaveStatus(`成功保存 ${savedCount} 道题。`, 'success');
        photoCheckSaveDialog?.close('success');
        state.photoCheck.selection.clear();
        syncPhotoCheckSelectionToDom();
        updatePhotoCheckSelectionUI();
        setPhotoCheckStatus(`已保存 ${savedCount} 道题到错题本。`, 'success');
    } catch (error) {
        console.error('Failed to save selected photo check problems', error);
        setPhotoCheckSaveStatus(error?.message || '保存错题时出现问题，请稍后重试。', 'error');
        return;
    } finally {
        state.photoCheck.isSaving = false;
        updatePhotoCheckSelectionUI();
    }
}

function resolvePhotoCheckCreatedAtDate() {
    if (state.photoCheck.createdAt) {
        const value = toDateInputValue(state.photoCheck.createdAt);
        if (value) {
            return value;
        }
    }
    return todayDateValue();
}

function normalizePhotoCheckBatchResults(result) {
    if (!result) {
        return [];
    }

    if (Array.isArray(result.results) && result.results.length > 0) {
        return result.results
            .map((item, index) => {
                const attempts = normalizePhotoCheckResultAttempts(item);
                const summary = normalizePhotoCheckSummary(item?.summary);
                const name = typeof item?.name === 'string' ? item.name.trim() : '';
                const resolvedIndex = resolvePhotoCheckBatchIndex(item, index);
                return {
                    index: resolvedIndex,
                    order: index,
                    name,
                    attempts,
                    summary,
                    image: normalizePhotoCheckBatchImage(item?.image || null)
                };
            })
            .sort((a, b) => {
                if (a.index === b.index) {
                    return a.order - b.order;
                }
                return a.index - b.index;
            });
    }

    const attempts = normalizePhotoCheckResultAttempts(result);

    return [
        {
            index: 1,
            order: 0,
            name: '',
            attempts,
            summary: normalizePhotoCheckSummary(result?.summary),
            image: normalizePhotoCheckBatchImage(result?.image || null)
        }
    ];
}

function normalizePhotoCheckBatchImage(image) {
    if (!image || typeof image !== 'object') {
        return null;
    }

    const url = typeof image.url === 'string' ? image.url : null;
    const width = toFiniteNumber(image.width);
    const height = toFiniteNumber(image.height);

    if (!url && !Number.isFinite(width) && !Number.isFinite(height)) {
        return null;
    }

    return {
        url,
        width: Number.isFinite(width) ? width : null,
        height: Number.isFinite(height) ? height : null
    };
}

function normalizePhotoCheckSummary(summary) {
    const toSafeCount = (value) => {
        const number = Number(value);
        if (!Number.isFinite(number)) {
            return 0;
        }
        return Math.max(0, Math.round(number));
    };

    let total = toSafeCount(summary?.total);
    let correct = toSafeCount(summary?.correct);
    let incorrect = toSafeCount(summary?.incorrect);
    let unknown = toSafeCount(summary?.unknown);

    const providedUnknown = summary?.unknown;

    total = Math.max(total, correct + incorrect + unknown);

    const remaining = Math.max(0, total - correct - incorrect);

    if (providedUnknown == null) {
        unknown = remaining;
    } else {
        unknown = Math.min(unknown, remaining);
    }

    return {
        total,
        correct,
        incorrect,
        unknown
    };
}

function resolvePhotoCheckBatchIndex(item, fallbackIndex) {
    const candidates = [item?.index, item?.order, item?.sequence, item?.position];
    for (let idx = 0; idx < candidates.length; idx += 1) {
        const value = toFiniteNumber(candidates[idx]);
        if (Number.isFinite(value) && value > 0) {
            return Math.max(1, Math.floor(value));
        }
    }
    return fallbackIndex + 1;
}

function aggregatePhotoCheckBatchSummary(batches) {
    return batches.reduce(
        (accumulator, batch) => {
            const summary = batch?.summary || { total: 0, correct: 0, incorrect: 0, unknown: 0 };
            accumulator.total += Number(summary.total) || 0;
            accumulator.correct += Number(summary.correct) || 0;
            accumulator.incorrect += Number(summary.incorrect) || 0;
            accumulator.unknown += Number(summary.unknown) || 0;
            return accumulator;
        },
        { total: 0, correct: 0, incorrect: 0, unknown: 0 }
    );
}

function buildPhotoCheckBatchSummaryText(batches, overall) {
    const totalPhotos = Array.isArray(batches) ? batches.length : 0;

    if (totalPhotos === 0) {
        return '未能从照片中识别出题目。本次检查通常会调用 3 次 AI（qwen 识别题目、qwen 复核答案、kimi 复核答案）。';
    }

    const parts = [`本次共检查 ${totalPhotos} 张照片`];

    const normalizedOverall = normalizePhotoCheckSummary(overall || {});
    const { total, correct, incorrect, unknown } = normalizedOverall;

    if (total > 0) {
        parts.push(`识别到 ${total} 道题`);
        parts.push(`${correct} 题判断正确`);
        if (incorrect > 0) {
            parts.push(`${incorrect} 题需要复查`);
        }
        if (unknown > 0) {
            parts.push(`${unknown} 题待人工确认`);
        }
    } else {
        parts.push('未能识别出具体题目');
    }

    parts.push('以下结果按上传顺序展示');

    return `${parts.join('，')}。`;
}

function createPhotoCheckReportGroup(batch) {
    const group = document.createElement('article');
    group.className = 'photo-check-report__group';

    const header = document.createElement('header');
    header.className = 'photo-check-report__group-header';

    const headerRow = document.createElement('div');
    headerRow.className = 'photo-check-report__group-header-row';

    const title = document.createElement('h4');
    title.className = 'photo-check-report__group-title';
    const name = batch?.name ? `（${batch.name}）` : '';
    title.textContent = `第 ${batch.index} 张照片${name}`;
    headerRow.appendChild(title);

    const toggleButton = document.createElement('button');
    toggleButton.type = 'button';
    toggleButton.className = 'btn btn-secondary btn-compact photo-check-report__group-toggle';
    toggleButton.dataset.groupLabel = title.textContent || '检查报告';
    updatePhotoCheckGroupToggleButton(toggleButton, false);
    headerRow.appendChild(toggleButton);

    header.appendChild(headerRow);

    const summary = document.createElement('p');
    summary.className = 'photo-check-report__group-summary';
    summary.textContent = buildPhotoCheckOverallSummary(batch?.attempts || []);

    group.appendChild(header);

    const content = document.createElement('div');
    content.className = 'photo-check-report__group-content';
    content.appendChild(summary);

    const { rows, attemptOrder, attemptMetadata } = buildPhotoCheckProblemRows(batch?.attempts || []);

    if (rows.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'photo-check-report__attempt-empty';
        empty.textContent = '未能识别出具体题目。';
        content.appendChild(empty);
        group.appendChild(content);
        return group;
    }

    rows.forEach((row) => {
        content.appendChild(createPhotoCheckProblemRow(batch, row, attemptOrder, attemptMetadata));
    });

    group.appendChild(content);

    return group;
}

function updatePhotoCheckGroupToggleButton(button, collapsed) {
    if (!button) {
        return;
    }

    const label = button.dataset.groupLabel || '检查报告';
    const action = collapsed ? '展开' : '折叠';
    button.textContent = collapsed ? '展开检查报告' : '折叠检查报告';
    button.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    button.setAttribute('aria-label', `${action}${label}`);
}

function resolvePhotoCheckProblemCount(result) {
    if (!result) {
        return 0;
    }

    if (Array.isArray(result.results)) {
        return result.results.reduce((total, item) => {
            const problems = Array.isArray(item?.problems) ? item.problems.length : 0;
            return total + problems;
        }, 0);
    }

    if (Array.isArray(result.problems)) {
        return result.problems.length;
    }

    return 0;
}

function buildPhotoCheckProblemRows(attempts) {
    const attemptList = Array.isArray(attempts) ? attempts : [];
    const attemptOrder = buildPhotoCheckAttemptOrder(attemptList);
    const attemptLookup = new Map();
    const attemptMetadata = new Map();

    attemptList.forEach((attempt) => {
        const indexValue = toFiniteNumber(attempt?.index);
        if (!Number.isFinite(indexValue)) {
            return;
        }
        const normalizedIndex = Math.max(1, Math.floor(indexValue));
        if (!attemptLookup.has(normalizedIndex)) {
            attemptLookup.set(normalizedIndex, attempt);
        }
        if (!attemptMetadata.has(normalizedIndex)) {
            const provider = normalizePhotoCheckProviderName(attempt?.provider);
            const label = typeof attempt?.label === 'string' ? attempt.label.trim() : null;
            attemptMetadata.set(normalizedIndex, {
                provider,
                label: label || null
            });
        }
    });

    const rowsMap = new Map();

    attemptOrder.forEach((attemptIndex) => {
        const attempt = attemptLookup.get(attemptIndex) || null;
        const problems = Array.isArray(attempt?.problems) ? attempt.problems : [];

        problems.forEach((problem, problemIndex) => {
            if (!problem) {
                return;
            }

            const fallbackIndex = problemIndex + 1;
            const resolvedIndex = resolvePhotoCheckProblemIndex(problem, fallbackIndex);
            const key = String(resolvedIndex);

            let row = rowsMap.get(key);
            if (!row) {
                row = {
                    index: resolvedIndex,
                    order: rowsMap.size,
                    attempts: new Map(),
                    boundingBox: problem.boundingBox || problem.image?.boundingBox || null
                };
                rowsMap.set(key, row);
            }

            if (!row.boundingBox && (problem.image?.boundingBox || problem.boundingBox)) {
                row.boundingBox = problem.image?.boundingBox || problem.boundingBox;
            }

            row.attempts.set(attemptIndex, problem);
        });
    });

    const rows = Array.from(rowsMap.values()).sort((a, b) => {
        if (a.index === b.index) {
            return a.order - b.order;
        }
        return a.index - b.index;
    });

    return { rows, attemptOrder, attemptMetadata };
}

function buildPhotoCheckAttemptOrder(attempts) {
    if (!Array.isArray(attempts) || attempts.length === 0) {
        return [];
    }

    const order = [];

    attempts.forEach((attempt, index) => {
        const value = toFiniteNumber(attempt?.index);
        const normalized = Number.isFinite(value) && value > 0 ? Math.floor(value) : index + 1;
        if (!order.includes(normalized)) {
            order.push(normalized);
        }
    });

    return order;
}

function resolvePhotoCheckProblemIndex(problem, fallbackIndex) {
    const fromProblem = toFiniteNumber(problem?.index);
    if (Number.isFinite(fromProblem) && fromProblem > 0) {
        return Math.floor(fromProblem);
    }

    const fromImage = toFiniteNumber(problem?.image?.index);
    if (Number.isFinite(fromImage) && fromImage > 0) {
        return Math.floor(fromImage);
    }

    return Math.max(1, Math.floor(fallbackIndex || 1));
}

function createPhotoCheckProblemRow(batch, row, attemptOrder, attemptMetadata) {
    const item = document.createElement('article');
    item.className = 'photo-check-report__item photo-check-report__item--grid';
    item.dataset.problemIndex = String(row.index);

    const batchIndex = toFiniteNumber(batch?.index) || row.index;
    item.dataset.batchIndex = String(Math.max(1, Math.floor(batchIndex)));

    if (typeof batch?.name === 'string' && batch.name.trim()) {
        item.dataset.batchName = batch.name.trim();
    }

    if (row.boundingBox) {
        try {
            item.dataset.boundingBox = JSON.stringify(row.boundingBox);
        } catch (error) {
            // ignore serialization issues
        }
    }

    const selectionKey = buildPhotoCheckSelectionKey(batchIndex, row.index);
    if (selectionKey) {
        item.dataset.selectionKey = selectionKey;
    }

    const header = document.createElement('div');
    header.className = 'photo-check-problem__header';
    item.appendChild(header);

    const title = document.createElement('h3');
    title.className = 'photo-check-problem__title';
    title.textContent = `第 ${row.index} 题`;
    header.appendChild(title);

    const selectLabel = document.createElement('label');
    selectLabel.className = 'photo-check-problem__select';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'photo-check-problem__select-input';
    checkbox.setAttribute('aria-label', `选择第 ${row.index} 题保存到错题本`);
    if (selectionKey) {
        checkbox.dataset.selectionKey = selectionKey;
        checkbox.checked = state.photoCheck.selection.has(selectionKey);
    }
    selectLabel.appendChild(checkbox);

    const selectText = document.createElement('span');
    selectText.textContent = '加入错题本';
    selectLabel.appendChild(selectText);

    header.appendChild(selectLabel);

    if (checkbox.checked) {
        item.classList.add('is-selected');
    }

    const normalizedOrder = Array.isArray(attemptOrder) ? attemptOrder : [];

    const grid = document.createElement('div');
    grid.className = 'photo-check-problem__grid';
    item.appendChild(grid);

    grid.appendChild(createPhotoCheckImageColumn(row, normalizedOrder, attemptMetadata));

    const providers = [
        { key: 'qwen', heading: 'Qwen 结果', preferLatest: true },
        { key: 'kimi', heading: 'Kimi 结果' },
        { key: 'openai', heading: 'OpenAI 结果' }
    ];

    providers.forEach((provider) => {
        const attemptIndex = findPhotoCheckAttemptIndexByProvider(
            provider.key,
            attemptMetadata,
            normalizedOrder,
            {
                preferLatest: provider.preferLatest
            }
        );

        grid.appendChild(
            createPhotoCheckAttemptColumn(
                attemptIndex != null ? row.attempts.get(attemptIndex) || null : null,
                attemptIndex,
                attemptMetadata,
                {
                    heading: provider.heading,
                    provider: provider.key
                }
            )
        );
    });

    return item;
}

function findPhotoCheckAttemptIndexByProvider(provider, attemptMetadata, attemptOrder, options = {}) {
    const normalizedProvider = normalizePhotoCheckProviderName(provider);
    if (!normalizedProvider) {
        return null;
    }

    const normalizedOrder = Array.isArray(attemptOrder) ? attemptOrder.slice() : [];
    const searchOrder = options.preferLatest ? normalizedOrder.slice().reverse() : normalizedOrder;

    for (const attemptIndex of searchOrder) {
        const metadata = attemptMetadata instanceof Map ? attemptMetadata.get(attemptIndex) : null;
        const metadataProvider = normalizePhotoCheckProviderName(metadata?.provider);
        if (metadataProvider === normalizedProvider) {
            return attemptIndex;
        }
    }

    return null;
}

function createPhotoCheckImageColumn(row, attemptOrder, attemptMetadata) {
    const column = document.createElement('div');
    column.className = 'photo-check-problem__column photo-check-problem__column--image';
    column.dataset.role = 'image';

    const heading = document.createElement('h4');
    heading.className = 'photo-check-report__attempt-title';
    const imageSource = findPhotoCheckProblemImage(row, attemptOrder);
    const labelIndex = imageSource?.attemptIndex ?? (Array.isArray(attemptOrder) ? attemptOrder[0] : null);
    heading.textContent = `原题图片${buildPhotoCheckAttemptLabel(labelIndex, attemptMetadata)}`;
    column.appendChild(heading);

    if (imageSource) {
        const figure = document.createElement('figure');
        figure.className = 'photo-check-problem__image';

        const img = document.createElement('img');
        img.src = imageSource.url;
        img.alt = `第 ${row.index} 题截图`;
        figure.appendChild(img);

        if (imageSource.caption) {
            const figcaption = document.createElement('figcaption');
            figcaption.textContent = imageSource.caption;
            figure.appendChild(figcaption);
        }

        column.appendChild(figure);
    } else {
        const empty = document.createElement('p');
        empty.className = 'photo-check-report__attempt-empty';
        empty.textContent = '未能生成该题目的截图。';
        column.appendChild(empty);
    }

    return column;
}

function findPhotoCheckProblemImage(row, attemptOrder) {
    if (!row || !row.attempts) {
        return null;
    }

    const primaryAttempt = row.attempts.get(1) || null;
    const primaryImage = primaryAttempt?.image || null;

    if (primaryImage && typeof primaryImage.url === 'string' && primaryImage.url.trim()) {
        return {
            url: primaryImage.url,
            caption: primaryImage.source === 'crop' ? '自动截取的小题区域' : null,
            attemptIndex: 1
        };
    }

    const normalizedOrder = Array.isArray(attemptOrder) ? attemptOrder : [];

    for (let index = 0; index < normalizedOrder.length; index += 1) {
        const attemptIndex = normalizedOrder[index];
        const attempt = row.attempts.get(attemptIndex);
        const image = attempt?.image;
        if (image && typeof image.url === 'string' && image.url.trim()) {
            return {
                url: image.url,
                caption: image.source === 'crop' ? '自动截取的小题区域' : null,
                attemptIndex
            };
        }
    }

    return null;
}

function createPhotoCheckAttemptColumn(problem, attemptIndex, attemptMetadata, options = {}) {
    const column = document.createElement('div');
    column.className = 'photo-check-problem__column photo-check-problem__column--attempt';
    if (attemptIndex != null) {
        column.dataset.attempt = String(attemptIndex);
    }
    if (typeof options.provider === 'string' && options.provider.trim()) {
        column.dataset.provider = options.provider.trim();
    }

    const heading = document.createElement('h4');
    heading.className = 'photo-check-report__attempt-title';
    const customHeading = typeof options.heading === 'string' && options.heading.trim() ? options.heading.trim() : null;
    const position = Number(options.position);
    if (customHeading) {
        heading.textContent = `${customHeading}${buildPhotoCheckAttemptLabel(attemptIndex, attemptMetadata)}`;
    } else if (position === 1) {
        if (Number.isFinite(Number(attemptIndex)) && attemptIndex > 0) {
            heading.textContent = `第一次解题${buildPhotoCheckAttemptLabel(attemptIndex, attemptMetadata)}`;
        } else {
            heading.textContent = '第一次解题';
        }
    } else if (position === 2) {
        if (Number.isFinite(Number(attemptIndex)) && attemptIndex > 0) {
            heading.textContent = `第二次解题${buildPhotoCheckAttemptLabel(attemptIndex, attemptMetadata)}`;
        } else {
            heading.textContent = '第二次解题';
        }
    } else if (Number.isFinite(Number(attemptIndex)) && attemptIndex > 0) {
        heading.textContent = `解题结果${buildPhotoCheckAttemptLabel(attemptIndex, attemptMetadata)}`;
    } else {
        heading.textContent = '解题结果';
    }
    column.appendChild(heading);

    if (!problem) {
        const empty = document.createElement('p');
        empty.className = 'photo-check-report__attempt-empty';
        empty.textContent = '本次调用没有返回该题目的结果。';
        column.appendChild(empty);
        return column;
    }

    if (problem.isCorrect === true) {
        column.classList.add('is-correct');
    } else if (problem.isCorrect === false) {
        column.classList.add('is-incorrect');
    }

    const status = document.createElement('p');
    status.className = 'photo-check-report__attempt-status';

    if (problem.isCorrect === true) {
        status.classList.add('is-correct');
    } else if (problem.isCorrect === false) {
        status.classList.add('is-incorrect');
    } else {
        status.classList.add('is-unknown');
    }

    status.textContent = buildPhotoCheckAttemptStatus(problem);
    column.appendChild(status);

    appendPhotoCheckSection(column, '题目', problem.question);
    appendPhotoCheckSection(column, '手写答案', problem.studentAnswer);
    appendPhotoCheckSection(column, '参考解答', problem.solvedAnswer);
    appendPhotoCheckSection(column, '分析', problem.analysis);

    return column;
}

function buildPhotoCheckAttemptStatus(problem) {
    if (!problem) {
        return '未能识别出题目';
    }

    if (problem.isCorrect === true) {
        return '回答正确';
    }

    if (problem.isCorrect === false) {
        return '需要复查';
    }

    return '结果不确定';
}

function updatePhotoCheckPreview() {
    if (!photoCheckPreview || !photoCheckImagePreview || !photoCheckPreviewList) {
        return;
    }

    const previewItems = buildPhotoCheckPreviewItems(state.photoCheck.batches);

    if (previewItems.length === 0) {
        photoCheckImagePreview.removeAttribute('src');
        photoCheckImagePreview.alt = '';
        if (photoCheckPreviewCaption) {
            photoCheckPreviewCaption.textContent = '';
        }
        photoCheckPreviewList.innerHTML = '';
        photoCheckPreview.hidden = true;
        applyPhotoCheckPreviewCollapseState();
        return;
    }

    let previewIndex = Number(state.photoCheck.previewIndex);
    if (!Number.isFinite(previewIndex) || previewIndex < 0 || previewIndex >= previewItems.length) {
        previewIndex = 0;
        state.photoCheck.previewIndex = 0;
    }

    const selected = previewItems[previewIndex];

    photoCheckPreviewList.innerHTML = '';
    previewItems.forEach((item, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn btn-secondary btn-compact photo-check-preview__option';
        if (index === previewIndex) {
            button.classList.add('is-active');
        }
        button.dataset.previewIndex = String(index);
        button.textContent = item.label;
        photoCheckPreviewList.appendChild(button);
    });

    photoCheckImagePreview.src = selected.url;
    photoCheckImagePreview.alt = selected.label;

    if (photoCheckPreviewCaption) {
        const sizeText = selected.sizeText ? `（${selected.sizeText}）` : '';
        photoCheckPreviewCaption.textContent = `${selected.label}${sizeText}`;
    }

    photoCheckPreview.hidden = false;
    applyPhotoCheckPreviewCollapseState();
}

function setPhotoCheckPreviewCollapsed(collapsed) {
    state.photoCheck.previewCollapsed = Boolean(collapsed);
    applyPhotoCheckPreviewCollapseState();
}

function applyPhotoCheckPreviewCollapseState() {
    if (!photoCheckPreview) {
        return;
    }

    const hasPreviewContent = !photoCheckPreview.hidden;
    const shouldCollapse = hasPreviewContent ? Boolean(state.photoCheck.previewCollapsed) : true;

    if (hasPreviewContent) {
        photoCheckPreview.classList.toggle('is-collapsed', shouldCollapse);
    } else {
        photoCheckPreview.classList.remove('is-collapsed');
    }

    if (photoCheckPreviewToggle) {
        const expanded = hasPreviewContent && !shouldCollapse;
        photoCheckPreviewToggle.disabled = !hasPreviewContent;
        photoCheckPreviewToggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        photoCheckPreviewToggle.textContent = expanded ? '折叠原始照片' : '展开原始照片';
    }
}

function buildPhotoCheckPreviewItems(batches) {
    if (!Array.isArray(batches) || batches.length === 0) {
        return [];
    }

    const items = [];
    batches.forEach((batch, index) => {
        const image = batch?.image;
        if (!image || typeof image.url !== 'string' || !image.url.trim()) {
            return;
        }

        const labelParts = [];
        const displayIndex = Number.isFinite(Number(batch?.index)) ? Number(batch.index) : index + 1;
        labelParts.push(`第 ${displayIndex} 张照片`);
        if (typeof batch?.name === 'string' && batch.name.trim()) {
            labelParts.push(batch.name.trim());
        }

        let sizeText = '';
        const width = toFiniteNumber(image.width);
        const height = toFiniteNumber(image.height);
        if (Number.isFinite(width) && Number.isFinite(height)) {
            sizeText = `${width} × ${height}`;
        }

        items.push({
            url: image.url,
            label: labelParts.join(' - '),
            sizeText
        });
    });

    return items;
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
    const provider = normalizePhotoCheckProviderName(
        attempt.provider ?? attempt.model ?? attempt.source ?? attempt.engine ?? attempt.name
    );
    const label = typeof attempt.label === 'string' ? attempt.label.trim() : null;

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
        provider,
        label: label || null,
        summary: {
            total,
            correct,
            incorrect,
            unknown
        },
        problems: normalizedProblems
    };
}

function normalizePhotoCheckProviderName(provider) {
    if (provider == null) {
        return null;
    }
    const text = String(provider).trim();
    if (!text) {
        return null;
    }
    return text.toLowerCase();
}

function buildPhotoCheckAttemptLabel(attemptIndex, attemptMetadata) {
    const numericIndex = Number(attemptIndex);
    if (!Number.isFinite(numericIndex) || numericIndex <= 0) {
        return '';
    }

    const normalizedIndex = Math.max(1, Math.floor(numericIndex));
    const metadata = attemptMetadata instanceof Map ? attemptMetadata.get(normalizedIndex) : null;
    const provider = metadata?.provider;
    const label = metadata?.label;

    if (provider) {
        return `（${provider}）`;
    }

    if (label) {
        return `（${label}）`;
    }

    return `（第 ${normalizedIndex} 次调用）`;
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
            const label = getPhotoCheckAttemptPrefix(attempt);
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
            return `${getPhotoCheckAttemptPrefix(attempt)}：${parts.join('，')}`;
        }
        return parts.join('，');
    }

    if (withPrefix) {
        return `${getPhotoCheckAttemptPrefix(attempt)}未能识别出题目`;
    }
    return '未能识别出题目';
}

function buildPhotoCheckOverallSummary(attempts) {
    if (!Array.isArray(attempts) || attempts.length === 0) {
        return '未能从照片中识别出题目。本次检查通常会调用 3 次 AI（qwen 识别题目、qwen 复核答案、kimi 复核答案）。';
    }

    const includePrefix = attempts.length > 1;
    const parts = attempts
        .map((attempt) => formatPhotoCheckAttemptSummary(attempt, { withPrefix: includePrefix }))
        .filter((text) => Boolean(text && text.trim()));

    if (parts.length === 0) {
        return '未能从照片中识别出题目。本次检查通常会调用 3 次 AI（qwen 识别题目、qwen 复核答案、kimi 复核答案）。';
    }

    const workflowSummary = buildPhotoCheckWorkflowSummary(attempts);
    return `${parts.join('；')}。${workflowSummary}`;
}

function getPhotoCheckAttemptPrefix(attempt) {
    if (!attempt) {
        return '本次调用';
    }

    if (typeof attempt.provider === 'string' && attempt.provider.trim()) {
        return attempt.provider.trim();
    }

    if (typeof attempt.label === 'string' && attempt.label.trim()) {
        return attempt.label.trim();
    }

    if (Number.isFinite(Number(attempt.index)) && Number(attempt.index) > 0) {
        return `第 ${Number(attempt.index)} 次调用`;
    }

    return '本次调用';
}

function buildPhotoCheckWorkflowSummary(attempts) {
    const attemptList = Array.isArray(attempts) ? attempts : [];
    if (attemptList.length === 0) {
        return '本次检查未能完成 AI 调用。';
    }

    const providerLabels = attemptList.map((attempt, index) => {
        if (typeof attempt.provider === 'string' && attempt.provider.trim()) {
            return attempt.provider.trim();
        }
        if (typeof attempt.label === 'string' && attempt.label.trim()) {
            return attempt.label.trim();
        }
        if (Number.isFinite(Number(attempt.index)) && Number(attempt.index) > 0) {
            return `第 ${Number(attempt.index)} 次调用`;
        }
        return `第 ${index + 1} 次调用`;
    });

    return `本次检查共调用 ${attemptList.length} 次 AI：${providerLabels.join('、')}。`;
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
        if (photoCheckPreviewCaption) {
            photoCheckPreviewCaption.textContent = '';
        }
        if (photoCheckPreviewList) {
            photoCheckPreviewList.innerHTML = '';
        }
        photoCheckPreview.hidden = true;
    }
    state.photoCheck.previewCollapsed = true;
    applyPhotoCheckPreviewCollapseState();
    if (photoCheckResultsSection) {
        photoCheckResultsSection.hidden = true;
    }
    state.photoCheck.batches = [];
    state.photoCheck.problems = new Map();
    state.photoCheck.selection.clear();
    state.photoCheck.recordId = null;
    state.photoCheck.createdAt = null;
    state.photoCheck.previewIndex = 0;
    state.photoCheck.isSaving = false;
    state.photoCheck.history.selectedId = null;
    renderPhotoCheckHistory();
    updatePhotoCheckSelectionUI();
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
    hideEntriesListPanel();
    hideWizardPanel({ scroll: false, reset: false, restoreEntries: false });
    hidePhotoCheckPanel({ scroll: false, reset: false, restoreEntries: false });
    hideFormulaPanel({ scroll: false, reset: false, restoreEntries: false });
    hidePaperRepoPanel({ scroll: false, restoreEntries: false });
    hideLogPanel({ scroll: false, restoreEntries: false });
    const wasHidden = Boolean(entryPanel.hidden);
    if (wasHidden) {
        entryPanel.hidden = false;
        setDefaultSubjectAndSemester();
        setCreatedAtDefaultValue();
    }
    openEntryPanelLink?.setAttribute('aria-expanded', 'true');
    entryPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (wasHidden) {
        document.getElementById('source')?.focus();
    }
}

function hideEntryPanel(options = {}) {
    if (!entryPanel) return;
    const { scroll = true, restoreEntries = true } = options;
    openEntryPanelLink?.setAttribute('aria-expanded', 'false');
    if (entryPanel.hidden) {
        if (restoreEntries) {
            restoreEntriesListPanelVisibility();
        }
        return;
    }
    entryPanel.hidden = true;
    if (scroll !== false) {
        document.getElementById('entries-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    if (restoreEntries) {
        restoreEntriesListPanelVisibility();
    }
}

function showWizardPanel() {
    if (!wizardPanel) return;
    hideEntriesListPanel();
    hideEntryPanel({ scroll: false, restoreEntries: false });
    hidePhotoCheckPanel({ scroll: false, reset: false, restoreEntries: false });
    hideFormulaPanel({ scroll: false, reset: false, restoreEntries: false });
    hidePaperRepoPanel({ scroll: false, restoreEntries: false });
    hideLogPanel({ scroll: false, restoreEntries: false });
    const wasHidden = Boolean(wizardPanel.hidden);
    if (wasHidden) {
        resetWizard();
        wizardPanel.hidden = false;
    }
    openWizardPanelLink?.setAttribute('aria-expanded', 'true');
    wizardPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (wasHidden) {
        wizardOriginalInput?.focus();
    }
}

function hideWizardPanel(options = {}) {
    if (!wizardPanel) return;
    const { scroll = true, reset = true, restoreEntries = true } = options;
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
    if (restoreEntries) {
        restoreEntriesListPanelVisibility();
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
    if (focusQuestion) {
        focusRichTextEditor('wizard-question-text');
    }
}

function resetWizard() {
    if (wizardUploadForm) {
        wizardUploadForm.reset();
    }
    if (wizardForm) {
        wizardForm.reset();
    }
    setRichTextValue('wizard-question-text', '');
    setRichTextValue('wizard-answer-text', '');
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
    if (!wizardRecognizedText) return;
    const currentValue = getRichTextValue('wizard-question-text');
    if (!replaceExisting && !isRichTextEmpty(currentValue)) return;
    setRichTextValue('wizard-question-text', wizardRecognizedText);
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
    hideEntriesListPanel();
    hideEntryPanel({ scroll: false, restoreEntries: false });
    hideWizardPanel({ scroll: false, reset: false, restoreEntries: false });
    hidePhotoCheckPanel({ scroll: false, reset: false, restoreEntries: false });
    hideFormulaPanel({ scroll: false, reset: false, restoreEntries: false });
    hidePaperRepoPanel({ scroll: false, restoreEntries: false });
    logPanel.hidden = false;
    openLogPanelLink?.setAttribute('aria-expanded', 'true');
    logPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    loadActivityLog({ userRequested: true });
}

function hideLogPanel(options = {}) {
    if (!logPanel) return;
    const { scroll = true, restoreEntries = true } = options;
    openLogPanelLink?.setAttribute('aria-expanded', 'false');
    if (logPanel.hidden) {
        if (restoreEntries) {
            restoreEntriesListPanelVisibility();
        }
        return;
    }
    logPanel.hidden = true;
    if (scroll !== false) {
        document.getElementById('entries-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    if (restoreEntries) {
        restoreEntriesListPanelVisibility();
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
    setRichTextValue('edit-question-text', entry.questionText || '');
    setRichTextValue('edit-answer-text', entry.answerText || '');
    document.getElementById('edit-remark').value = entry.remark || '';
    if (editQuestionImageInput) {
        editQuestionImageInput.value = '';
    }
    if (editAnswerImageInput) {
        editAnswerImageInput.value = '';
    }

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
    const defaultSource = getLastSource();
    if (sourceInput && !sourceInput.value && defaultSource) {
        sourceInput.value = defaultSource;
    }
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

function getDefaultSubjectValue() {
    const direct = (subjectInput?.value || '').toString().trim();
    if (direct) {
        return direct;
    }

    const wizardValue = (wizardSubjectInput?.value || '').toString().trim();
    if (wizardValue) {
        return wizardValue;
    }

    return getLastSubject() || '数学';
}

function getDefaultSemesterValue() {
    const direct = (semesterSelect?.value || '').toString().trim();
    if (direct) {
        return direct;
    }

    const wizardValue = (wizardSemesterSelect?.value || '').toString().trim();
    if (wizardValue) {
        return wizardValue;
    }

    return '八上';
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

function setPaperRepoStatus(message, variant) {
    if (!paperRepoStatus) return;
    state.paperRepo.uploadStatus = message || '';
    paperRepoStatus.textContent = state.paperRepo.uploadStatus;
    paperRepoStatus.classList.remove('is-error', 'is-success');
    if (variant === 'error') {
        paperRepoStatus.classList.add('is-error');
    } else if (variant === 'success') {
        paperRepoStatus.classList.add('is-success');
    }
}

function setPaperRepoListStatus(message, variant) {
    if (!paperRepoListStatus) return;
    paperRepoListStatus.textContent = message || '';
    paperRepoListStatus.classList.remove('is-error', 'is-success');
    if (variant === 'error') {
        paperRepoListStatus.classList.add('is-error');
    } else if (variant === 'success') {
        paperRepoListStatus.classList.add('is-success');
    }
}

function normalizePaperImage(raw) {
    if (!raw || typeof raw !== 'object') {
        return null;
    }

    const url = typeof raw.url === 'string' ? raw.url : null;
    const resizedUrl = typeof raw.resizedUrl === 'string' ? raw.resizedUrl : null;
    const src = resolveMediaUrl(resizedUrl || url);

    if (!src) {
        return null;
    }

    return {
        id: raw.id || '',
        originalName:
            typeof raw.originalName === 'string' && raw.originalName.trim()
                ? raw.originalName.trim()
                : '未命名图片',
        url,
        resizedUrl,
        src,
        createdAt: raw.createdAt || ''
    };
}

function normalizePaperRecord(raw) {
    if (!raw || typeof raw !== 'object') {
        return null;
    }

    const images = Array.isArray(raw.images) ? raw.images.map(normalizePaperImage).filter(Boolean) : [];
    const subject = typeof raw.subject === 'string' ? raw.subject.trim() : '';
    const semester = typeof raw.semester === 'string' ? raw.semester.trim() : '';

    return {
        id: raw.id || '',
        title: typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : '未命名试卷',
        createdAt: raw.createdAt || '',
        subject,
        semester,
        images
    };
}

function getFilteredPaperRepoItems() {
    const { items, filters } = state.paperRepo;
    const normalizedSubject = (filters.subject || '').toString().trim().toLowerCase();
    const normalizedSemester = (filters.semester || '').toString().trim().toLowerCase();

    return items.filter((paper) => {
        const matchesSubject =
            !normalizedSubject || (paper.subject || '').toString().trim().toLowerCase() === normalizedSubject;
        const matchesSemester =
            !normalizedSemester || (paper.semester || '').toString().trim().toLowerCase() === normalizedSemester;
        return matchesSubject && matchesSemester;
    });
}

function populatePaperRepoFilterOptions(items) {
    if (!paperRepoSubjectFilter || !paperRepoSemesterFilter) return;

    const subjects = new Set();
    const semesters = new Set();

    items.forEach((item) => {
        if (item.subject) {
            subjects.add(item.subject);
        }
        if (item.semester) {
            semesters.add(item.semester);
        }
    });

    paperRepoSubjectFilter.innerHTML = '<option value="">全部</option>';
    Array.from(subjects)
        .sort((a, b) => collator.compare(a, b))
        .forEach((subject) => {
            const option = document.createElement('option');
            option.value = subject;
            option.textContent = subject;
            paperRepoSubjectFilter.append(option);
        });

    paperRepoSemesterFilter.innerHTML = '<option value="">全部</option>';
    Array.from(semesters)
        .sort((a, b) => collator.compare(a, b))
        .forEach((semester) => {
            const option = document.createElement('option');
            option.value = semester;
            option.textContent = semester;
            paperRepoSemesterFilter.append(option);
        });

    if (state.paperRepo.filters.subject && !subjects.has(state.paperRepo.filters.subject)) {
        state.paperRepo.filters.subject = '';
    }

    if (state.paperRepo.filters.semester && !semesters.has(state.paperRepo.filters.semester)) {
        state.paperRepo.filters.semester = '';
    }

    if (state.paperRepo.filters.subject && subjects.has(state.paperRepo.filters.subject)) {
        paperRepoSubjectFilter.value = state.paperRepo.filters.subject;
    }

    if (state.paperRepo.filters.semester && semesters.has(state.paperRepo.filters.semester)) {
        paperRepoSemesterFilter.value = state.paperRepo.filters.semester;
    }
}

function renderPaperRepoList() {
    if (!paperRepoList) return;

    paperRepoList.innerHTML = '';

    const { items, isLoading, error, filters } = state.paperRepo;

    populatePaperRepoFilterOptions(items);
    const filteredItems = getFilteredPaperRepoItems();

    if (isLoading) {
        setPaperRepoListStatus('正在加载试卷列表…');
        return;
    }

    if (error) {
        setPaperRepoListStatus(error, 'error');
        return;
    }

    if (!items.length) {
        setPaperRepoListStatus('还没有保存的试卷，先上传几张吧。');
        return;
    }

    if (!filteredItems.length) {
        const hasFilter = Boolean((filters?.subject || '').trim() || (filters?.semester || '').trim());
        setPaperRepoListStatus(hasFilter ? '没有符合当前筛选条件的试卷。' : '还没有保存的试卷，先上传几张吧。');
        return;
    }

    setPaperRepoListStatus('');

    const fragment = document.createDocumentFragment();
    filteredItems.forEach((paper, index) => {
        const card = buildPaperCard(paper, index === 0);
        fragment.appendChild(card);
    });

    paperRepoList.appendChild(fragment);
}

function buildPaperCard(paper, defaultOpen = false) {
    const details = document.createElement('details');
    details.className = 'paper-card';
    details.open = defaultOpen;

    const summary = document.createElement('summary');
    summary.className = 'paper-card__summary';

    const title = document.createElement('h4');
    title.className = 'paper-card__title';
    title.textContent = paper.title;
    summary.appendChild(title);

    const meta = document.createElement('p');
    meta.className = 'paper-card__meta';
    const count = document.createElement('span');
    count.textContent = `${paper.images.length} 张图片`;
    meta.appendChild(count);

    if (paper.subject) {
        const subject = document.createElement('span');
        subject.className = 'paper-card__tag';
        subject.textContent = paper.subject;
        subject.title = '学科';
        meta.appendChild(subject);
    }

    if (paper.semester) {
        const semester = document.createElement('span');
        semester.className = 'paper-card__tag';
        semester.textContent = paper.semester;
        semester.title = '学期';
        meta.appendChild(semester);
    }

    const created = formatDateTimeWithMinutes(paper.createdAt);
    if (created) {
        const date = document.createElement('span');
        date.textContent = created;
        meta.appendChild(date);
    }

    summary.appendChild(meta);
    details.appendChild(summary);

    const imagesContainer = document.createElement('div');
    imagesContainer.className = 'paper-card__images';

    if (!paper.images.length) {
        const empty = document.createElement('p');
        empty.className = 'paper-repo__list-status';
        empty.textContent = '暂无图片可展示。';
        details.appendChild(empty);
    } else {
        paper.images.forEach((image) => {
            const figure = document.createElement('figure');
            figure.className = 'paper-card__figure';

            const img = document.createElement('img');
            img.src = image.src;
            img.alt = image.originalName;
            img.loading = 'lazy';
            img.decoding = 'async';
            figure.appendChild(img);

            const caption = document.createElement('figcaption');
            caption.className = 'paper-card__caption';
            caption.textContent = image.originalName;
            figure.appendChild(caption);

            imagesContainer.appendChild(figure);
        });

        details.appendChild(imagesContainer);
    }

    return details;
}

async function loadPaperRepo(options = {}) {
    if (!paperRepoPanel) {
        return;
    }

    const { force = false, lazy = false } = options;

    if (state.paperRepo.isLoading) {
        return;
    }

    if (!force && lazy && state.paperRepo.lastLoadedAt) {
        renderPaperRepoList();
        return;
    }

    state.paperRepo.isLoading = true;
    state.paperRepo.error = '';
    setPaperRepoListStatus('正在加载试卷列表…');

    try {
        const response = await fetch('/api/papers', { cache: 'no-store' });
        const payload = await response.json().catch(() => []);
        if (!response.ok) {
            throw new Error(payload?.error || '无法读取试卷列表。');
        }

        const papers = Array.isArray(payload)
            ? payload.map(normalizePaperRecord).filter(Boolean)
            : [];
        state.paperRepo.items = papers;
        state.paperRepo.lastLoadedAt = Date.now();
        renderPaperRepoList();
    } catch (error) {
        console.error(error);
        state.paperRepo.error = error?.message || '无法加载试卷仓库。';
        setPaperRepoListStatus(state.paperRepo.error, 'error');
    } finally {
        state.paperRepo.isLoading = false;
    }
}

async function submitPaperRepoForm() {
    if (!paperRepoForm) return;

    const title = (paperRepoTitleInput?.value || '').toString().trim();
    const subject = (paperRepoSubjectInput?.value || '').toString().trim();
    const semester = (paperRepoSemesterSelect?.value || '').toString().trim();
    const files = Array.from(paperRepoImagesInput?.files || []).filter((file) => file && file.size > 0);

    if (!title) {
        setPaperRepoStatus('请填写试卷名称，例如“2025 年期中数学”。', 'error');
        paperRepoTitleInput?.focus();
        return;
    }

    if (!files.length) {
        setPaperRepoStatus('请至少选择一张试卷照片。', 'error');
        paperRepoImagesInput?.focus();
        return;
    }

    const submitButton = paperRepoForm.querySelector('button[type="submit"]');
    if (submitButton) {
        submitButton.disabled = true;
    }

    setPaperRepoStatus('正在上传并保存试卷…');

    const formData = new FormData();
    formData.append('title', title);
    formData.append('subject', subject);
    formData.append('semester', semester);
    files.forEach((file) => {
        formData.append('images', file);
    });

    try {
        const response = await fetch('/api/papers', {
            method: 'POST',
            body: formData
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(payload?.error || '无法保存试卷。');
        }

        const saved = normalizePaperRecord(payload);
        if (saved) {
            state.paperRepo.items = [saved, ...state.paperRepo.items];
            state.paperRepo.lastLoadedAt = Date.now();
            renderPaperRepoList();
        }

        paperRepoForm.reset();
        setPaperRepoStatus('已保存到试卷仓库。', 'success');
    } catch (error) {
        console.error(error);
        setPaperRepoStatus(error?.message || '无法保存试卷。', 'error');
    } finally {
        if (submitButton) {
            submitButton.disabled = false;
        }
    }
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
        await loadPaperRepo({ lazy: true });
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
    const questionText = sanitizeRichTextHtml(raw.questionText || raw.description || raw.title || '');
    const summary = typeof raw.summary === 'string' ? raw.summary.trim() : '';
    const remark = typeof raw.remark === 'string' ? raw.remark.trim() : '';
    return {
        id: raw.id,
        questionCode: raw.questionCode || '',
        source: raw.source || '',
        subject: raw.subject || '',
        semester: raw.semester || '',
        questionType: raw.questionType || raw.type || '',
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
    const normalized = richTextToPlainText(text || '').replace(/\s+/g, ' ').trim();
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
