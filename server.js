const express = require('express');
const path = require('path');
const fsp = require('fs/promises');
const multer = require('multer');
const sharp = require('sharp');
const { randomUUID } = require('crypto');
const { Document, Packer, Paragraph, TextRun, HeadingLevel, ImageRun } = require('docx');

const app = express();
const PORT = process.env.PORT || 3000;

const ROOT_DIR = __dirname;
const DATA_DIR = path.join(ROOT_DIR, 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const ENTRIES_FILE = path.join(DATA_DIR, 'entries.json');
const LOG_FILE = path.join(DATA_DIR, 'activity.log');

const MM_PER_INCH = 25.4;
const A4_WIDTH_MM = 210;
const PRINT_DPI = 300;
const TARGET_PRINT_WIDTH_PX = Math.round((A4_WIDTH_MM / MM_PER_INCH) * PRINT_DPI * 0.8);

const SUBJECT_PREFIX_MAP = new Map([
    ['数学', 'M'],
    ['英语', 'E'],
    ['语文', 'C'],
    ['物理', 'P'],
    ['化学', 'H'],
    ['生物', 'B'],
    ['历史', 'L'],
    ['地理', 'G'],
    ['政治', 'Z'],
    ['科学', 'S'],
    ['数学(M)', 'M'],
    ['数学（M）', 'M'],
    ['数学-竞赛', 'M'],
    ['English', 'E'],
    ['Math', 'M'],
    ['Chinese', 'C'],
    ['Physics', 'P'],
    ['Chemistry', 'H'],
    ['Biology', 'B'],
    ['History', 'L'],
    ['Geography', 'G'],
    ['Politics', 'Z'],
    ['Science', 'S']
]);

const uploadStorage = multer.diskStorage({
    destination: async (req, file, cb) => {
        try {
            await ensureDirectories();
            cb(null, UPLOADS_DIR);
        } catch (error) {
            cb(error);
        }
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `${Date.now()}-${randomUUID()}${ext}`);
    }
});

const upload = multer({ storage: uploadStorage });

app.use(express.json({ limit: '10mb' }));
app.use('/data', (req, res) => res.sendStatus(404));
app.use('/uploads', express.static(UPLOADS_DIR));
app.use(express.static(ROOT_DIR));

app.get('/api/entries', async (req, res) => {
    try {
        const entries = await readEntries();
        await logAction('list-entries', 'success', { total: entries.length });
        res.json(entries);
    } catch (error) {
        console.error(error);
        await logAction('list-entries', 'error', { message: error.message });
        res.status(500).json({ error: 'Failed to read entries' });
    }
});

app.post(
    '/api/entries',
    upload.fields([
        { name: 'questionImage', maxCount: 1 },
        { name: 'answerImage', maxCount: 1 }
    ]),
    async (req, res) => {
        try {
            const entries = await readEntries();
            const entry = await buildEntry(req.body, req.files);
            assignQuestionCode(entry, entries);
            entries.unshift(entry);
            await writeEntries(entries);
            await logAction('create-entry', 'success', {
                id: entry.id,
                questionCode: entry.questionCode,
                subject: entry.subject,
                semester: entry.semester,
                questionType: entry.questionType,
                source: entry.source,
                questionImage: Boolean(entry.questionImageUrl),
                answerImage: Boolean(entry.answerImageUrl)
            });
            res.status(201).json(entry);
        } catch (error) {
            console.error(error);
            await logAction('create-entry', 'error', { message: error.message });
            res.status(500).json({ error: 'Failed to save entry' });
        }
    }
);

app.put('/api/entries/:id', async (req, res) => {
    try {
        const entries = await readEntries();
        const index = entries.findIndex((entry) => entry.id === req.params.id);
        if (index === -1) {
            await logAction('update-entry', 'error', {
                id: req.params.id,
                message: 'Entry not found'
            });
            return res.status(404).json({ error: 'Entry not found' });
        }

        const updatedEntry = {
            ...entries[index],
            source: (req.body.source || '').trim(),
            subject: (req.body.subject || '').trim(),
            semester: (req.body.semester || '').trim(),
            questionType: (req.body.questionType || '').trim(),
            questionText: (req.body.questionText || '').trim(),
            answerText: (req.body.answerText || '').trim(),
            errorReason: (req.body.errorReason || '').trim(),
            remark: (req.body.remark || '').trim(),
            createdAt: normalizeDateInput(req.body.createdAt, entries[index].createdAt),
            updatedAt: new Date().toISOString()
        };

        validateEntryContent(updatedEntry);
        updatedEntry.summary = generateQuestionSummary(
            updatedEntry.questionText,
            Boolean(updatedEntry.questionImageUrl || updatedEntry.questionImageResizedUrl)
        );

        assignQuestionCode(updatedEntry, entries.filter((_, itemIndex) => itemIndex !== index));

        entries[index] = updatedEntry;

        await writeEntries(entries);
        await logAction('update-entry', 'success', {
            id: entries[index].id,
            questionCode: entries[index].questionCode,
            subject: entries[index].subject,
            semester: entries[index].semester,
            questionType: entries[index].questionType,
            source: entries[index].source
        });
        res.json(entries[index]);
    } catch (error) {
        console.error(error);
        await logAction('update-entry', 'error', { message: error.message });
        res.status(500).json({ error: 'Failed to update entry' });
    }
});

app.delete('/api/entries/:id', async (req, res) => {
    try {
        const entries = await readEntries();
        const index = entries.findIndex((entry) => entry.id === req.params.id);
        if (index === -1) {
            await logAction('delete-entry', 'error', {
                id: req.params.id,
                message: 'Entry not found'
            });
            return res.status(404).json({ error: 'Entry not found' });
        }

        const [removed] = entries.splice(index, 1);
        await removeMedia(
            removed.questionImageUrl,
            removed.questionImageResizedUrl,
            removed.answerImageUrl,
            removed.answerImageResizedUrl
        );
        await writeEntries(entries);
        await logAction('delete-entry', 'success', {
            id: removed.id,
            questionCode: removed.questionCode,
            subject: removed.subject,
            semester: removed.semester,
            questionType: removed.questionType,
            source: removed.source
        });
        res.status(204).end();
    } catch (error) {
        console.error(error);
        await logAction('delete-entry', 'error', { message: error.message });
        res.status(500).json({ error: 'Failed to delete entry' });
    }
});

app.delete('/api/entries', async (req, res) => {
    try {
        const entries = await readEntries();
        for (const entry of entries) {
            await removeMedia(
                entry.questionImageUrl,
                entry.questionImageResizedUrl,
                entry.answerImageUrl,
                entry.answerImageResizedUrl
            );
        }
        await writeEntries([]);
        await logAction('clear-entries', 'success', { removed: entries.length });
        res.status(204).end();
    } catch (error) {
        console.error(error);
        await logAction('clear-entries', 'error', { message: error.message });
        res.status(500).json({ error: 'Failed to clear entries' });
    }
});

app.post('/api/entries/import', async (req, res) => {
    try {
        if (!Array.isArray(req.body)) {
            await logAction('import-entries', 'error', { message: 'Invalid payload' });
            return res.status(400).json({ error: 'Invalid payload' });
        }

        const existing = await readEntries();
        const existingIds = new Set(existing.map((entry) => entry.id));
        let added = 0;

        for (const raw of req.body) {
            const hasQuestionContent = Boolean(
                raw?.questionText || raw?.questionImageUrl || raw?.questionImageDataUrl || raw?.questionImage
            );
            const hasAnswerContent = Boolean(
                raw?.answerText || raw?.answerImageUrl || raw?.answerImageDataUrl || raw?.answerImage
            );
            if (!raw || !hasQuestionContent || !hasAnswerContent) continue;
            const entry = await buildEntryFromImport(raw);
            if (existingIds.has(entry.id)) continue;
            assignQuestionCode(entry, existing);
            existing.push(entry);
            existingIds.add(entry.id);
            added += 1;
        }

        ensureQuestionCodes(existing);
        await writeEntries(existing);
        await logAction('import-entries', 'success', { added, total: existing.length });
        res.json({ added, entries: existing });
    } catch (error) {
        console.error(error);
        await logAction('import-entries', 'error', { message: error.message });
        res.status(500).json({ error: 'Failed to import entries' });
    }
});

app.post('/api/entries/export', async (req, res) => {
    try {
        const ids = Array.isArray(req.body?.ids) ? req.body.ids : null;
        if (!ids || !ids.length) {
            await logAction('export-entries', 'error', { message: 'No selection provided' });
            return res.status(400).json({ error: 'Select at least one entry to export.' });
        }

        const entries = await readEntries();
        const entryMap = new Map(entries.map((entry) => [entry.id, entry]));
        const seen = new Set();
        const selectedEntries = [];

        for (const rawId of ids) {
            if (typeof rawId !== 'string') continue;
            if (seen.has(rawId)) continue;
            seen.add(rawId);
            const entry = entryMap.get(rawId);
            if (entry) {
                selectedEntries.push(entry);
            }
        }

        if (!selectedEntries.length) {
            await logAction('export-entries', 'error', { message: 'Entries not found', requested: ids.length });
            return res.status(404).json({ error: 'Selected entries were not found.' });
        }

        const docBuffer = await createWordExport(selectedEntries);
        const filename = `wubook-selection-${new Date().toISOString().split('T')[0]}.docx`;

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        await logAction('export-entries', 'success', { count: selectedEntries.length });
        res.send(docBuffer);
    } catch (error) {
        console.error(error);
        await logAction('export-entries', 'error', { message: error.message });
        res.status(500).json({ error: 'Failed to generate Word export.' });
    }
});

app.post('/api/entries/export-paper', async (req, res) => {
    try {
        const ids = Array.isArray(req.body?.ids) ? req.body.ids : null;
        if (!ids || !ids.length) {
            await logAction('export-paper', 'error', { message: 'No selection provided' });
            return res.status(400).json({ error: 'Select at least one entry to export.' });
        }

        const entries = await readEntries();
        const entryMap = new Map(entries.map((entry) => [entry.id, entry]));
        const seen = new Set();
        const selectedEntries = [];

        for (const rawId of ids) {
            if (typeof rawId !== 'string') continue;
            if (seen.has(rawId)) continue;
            seen.add(rawId);
            const entry = entryMap.get(rawId);
            if (entry) {
                selectedEntries.push(entry);
            }
        }

        if (!selectedEntries.length) {
            await logAction('export-paper', 'error', { message: 'Entries not found', requested: ids.length });
            return res.status(404).json({ error: 'Selected entries were not found.' });
        }

        const docBuffer = await createPaperExport(selectedEntries);
        const filename = `wubook-paper-${new Date().toISOString().split('T')[0]}.docx`;

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        await logAction('export-paper', 'success', { count: selectedEntries.length });
        res.send(docBuffer);
    } catch (error) {
        console.error(error);
        await logAction('export-paper', 'error', { message: error.message });
        res.status(500).json({ error: 'Failed to generate paper export.' });
    }
});

app.get('/api/logs', async (req, res) => {
    try {
        const limit = Number.parseInt(req.query.limit, 10) || 50;
        const logs = await readLogs(limit);
        res.json(logs);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to read activity log' });
    }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(ROOT_DIR, 'index.html'));
});

app.listen(PORT, async () => {
    await ensureDirectories();
    console.log(`Wu(悟)Book server running on http://localhost:${PORT}`);
});

async function buildEntry(body, files = {}, options = {}) {
    const { skipValidation = false } = options;
    const now = new Date().toISOString();
    const questionFile = Array.isArray(files.questionImage) ? files.questionImage[0] : null;
    const answerFile = Array.isArray(files.answerImage) ? files.answerImage[0] : null;

    const hasQuestionImageInput = Boolean(
        questionFile || body.questionImageDataUrl || body.questionImage || body.questionImageUrl
    );
    const hasAnswerImageInput = Boolean(
        answerFile || body.answerImageDataUrl || body.answerImage || body.answerImageUrl
    );

    const entry = {
        id: body.id && typeof body.id === 'string' ? body.id : randomUUID(),
        questionCode: typeof body.questionCode === 'string' ? body.questionCode.trim().toUpperCase() : '',
        source: (body.source || '').trim(),
        subject: (body.subject || '').trim(),
        semester: (body.semester || '').trim(),
        questionType: (body.questionType || '').trim(),
        questionText: (body.questionText || '').trim(),
        answerText: (body.answerText || '').trim(),
        errorReason: (body.errorReason || '').trim(),
        remark: (body.remark || '').trim(),
        summary: typeof body.summary === 'string' ? body.summary.trim() : '',
        questionImageUrl: null,
        questionImageResizedUrl: null,
        answerImageUrl: null,
        answerImageResizedUrl: null,
        createdAt: normalizeDateInput(body.createdAt, now),
        updatedAt: now
    };

    if (!entry.questionText && !hasQuestionImageInput) {
        throw new Error('题目内容需要文字或图片。');
    }

    if (!entry.answerText && !hasAnswerImageInput) {
        throw new Error('答案内容需要文字或图片。');
    }

    if (questionFile) {
        const filePath = questionFile.path || path.join(UPLOADS_DIR, questionFile.filename);
        const photoInfo = await finalizePhotoStorage(filePath, questionFile.filename);
        entry.questionImageUrl = photoInfo.photoUrl;
        entry.questionImageResizedUrl = photoInfo.photoResizedUrl;
    }

    if (answerFile) {
        const filePath = answerFile.path || path.join(UPLOADS_DIR, answerFile.filename);
        const photoInfo = await finalizePhotoStorage(filePath, answerFile.filename);
        entry.answerImageUrl = photoInfo.photoUrl;
        entry.answerImageResizedUrl = photoInfo.photoResizedUrl;
    }

    entry.questionImageUrl = entry.questionImageUrl || (typeof body.questionImageUrl === 'string' ? body.questionImageUrl : null);
    entry.questionImageResizedUrl =
        entry.questionImageResizedUrl || (typeof body.questionImageResizedUrl === 'string' ? body.questionImageResizedUrl : null);
    entry.answerImageUrl = entry.answerImageUrl || (typeof body.answerImageUrl === 'string' ? body.answerImageUrl : null);
    entry.answerImageResizedUrl =
        entry.answerImageResizedUrl || (typeof body.answerImageResizedUrl === 'string' ? body.answerImageResizedUrl : null);

    entry.summary = entry.summary ||
        generateQuestionSummary(entry.questionText, Boolean(entry.questionImageUrl || entry.questionImageResizedUrl));

    if (!skipValidation) {
        validateEntryContent(entry);
    }

    return entry;
}

async function buildEntryFromImport(raw) {
    const entry = await buildEntry(raw, {}, { skipValidation: true });
    entry.id = raw.id || entry.id;
    entry.createdAt = normalizeDateInput(raw.createdAt, entry.createdAt);
    entry.updatedAt = raw.updatedAt || entry.updatedAt;

    if (raw.questionImageDataUrl && !entry.questionImageUrl) {
        const info = await saveDataUrl(raw.questionImageDataUrl, `${entry.id}-question`);
        entry.questionImageUrl = info.photoUrl;
        entry.questionImageResizedUrl = info.photoResizedUrl;
    } else if (raw.questionImage && !entry.questionImageUrl) {
        const info = await saveDataUrl(raw.questionImage, `${entry.id}-question`);
        entry.questionImageUrl = info.photoUrl;
        entry.questionImageResizedUrl = info.photoResizedUrl;
    } else if (raw.questionImageUrl) {
        entry.questionImageUrl = raw.questionImageUrl;
        if (raw.questionImageResizedUrl) {
            entry.questionImageResizedUrl = raw.questionImageResizedUrl;
        } else if (raw.questionImageUrl.startsWith('/uploads/')) {
            const relative = raw.questionImageUrl.slice(1);
            const sourcePath = path.join(ROOT_DIR, relative);
            try {
                const resized = await generateResizedVariant(sourcePath);
                entry.questionImageResizedUrl = resized;
            } catch (error) {
                console.warn('Unable to regenerate resized question image during import', error);
            }
        }
    }

    if (raw.answerImageDataUrl && !entry.answerImageUrl) {
        const info = await saveDataUrl(raw.answerImageDataUrl, `${entry.id}-answer`);
        entry.answerImageUrl = info.photoUrl;
        entry.answerImageResizedUrl = info.photoResizedUrl;
    } else if (raw.answerImage && !entry.answerImageUrl) {
        const info = await saveDataUrl(raw.answerImage, `${entry.id}-answer`);
        entry.answerImageUrl = info.photoUrl;
        entry.answerImageResizedUrl = info.photoResizedUrl;
    } else if (raw.answerImageUrl) {
        entry.answerImageUrl = raw.answerImageUrl;
        if (raw.answerImageResizedUrl) {
            entry.answerImageResizedUrl = raw.answerImageResizedUrl;
        } else if (raw.answerImageUrl.startsWith('/uploads/')) {
            const relative = raw.answerImageUrl.slice(1);
            const sourcePath = path.join(ROOT_DIR, relative);
            try {
                const resized = await generateResizedVariant(sourcePath);
                entry.answerImageResizedUrl = resized;
            } catch (error) {
                console.warn('Unable to regenerate resized answer image during import', error);
            }
        }
    }

    entry.summary = entry.summary ||
        generateQuestionSummary(entry.questionText, Boolean(entry.questionImageUrl || entry.questionImageResizedUrl));

    validateEntryContent(entry);

    return entry;
}

async function readEntries() {
    try {
        await ensureDirectories();
        const data = await fsp.readFile(ENTRIES_FILE, 'utf8');
        const parsed = JSON.parse(data);
        if (!Array.isArray(parsed)) return [];
        let needsWrite = false;
        if (ensureQuestionCodes(parsed)) {
            needsWrite = true;
        }
        if (ensureEntryMetadata(parsed)) {
            needsWrite = true;
        }
        if (needsWrite) {
            await writeEntries(parsed);
        }
        return parsed;
    } catch (error) {
        if (error.code === 'ENOENT') {
            return [];
        }
        throw error;
    }
}

async function writeEntries(entries) {
    await ensureDirectories();
    await fsp.writeFile(ENTRIES_FILE, JSON.stringify(entries, null, 2), 'utf8');
}

async function ensureDirectories() {
    await fsp.mkdir(DATA_DIR, { recursive: true });
    await fsp.mkdir(UPLOADS_DIR, { recursive: true });
}

async function removeMedia(...urls) {
    const targets = urls.flat().filter(Boolean);
    const uniqueTargets = Array.from(new Set(targets));
    for (const target of uniqueTargets) {
        const relative = target.startsWith('/') ? target.slice(1) : target;
        const filePath = path.join(ROOT_DIR, relative);
        try {
            await fsp.unlink(filePath);
        } catch (error) {
            if (error.code !== 'ENOENT') {
                console.warn('Failed to remove media', error);
            }
        }
    }
}

async function saveDataUrl(dataUrl, id) {
    const matches = /^data:(.+);base64,(.+)$/.exec(dataUrl);
    if (!matches) {
        return { photoUrl: null, photoResizedUrl: null };
    }

    const mime = matches[1];
    const buffer = Buffer.from(matches[2], 'base64');
    const extension = getExtensionFromMime(mime);
    const filename = `${id}-${Date.now()}${extension}`;
    const filePath = path.join(UPLOADS_DIR, filename);
    await ensureDirectories();
    await fsp.writeFile(filePath, buffer);
    return finalizePhotoStorage(filePath, filename);
}

async function finalizePhotoStorage(filePath, filename) {
    const photoUrl = `/uploads/${filename}`;
    const photoResizedUrl = await generateResizedVariant(filePath);
    return {
        photoUrl,
        photoResizedUrl
    };
}

async function generateResizedVariant(filePath) {
    try {
        const { dir, name, ext } = path.parse(filePath);
        const resizedName = `${name}-a4${ext}`;
        const resizedPath = path.join(dir, resizedName);

        const image = sharp(filePath);
        const metadata = await image.metadata();
        if (!metadata.width || metadata.width <= TARGET_PRINT_WIDTH_PX) {
            await fsp.copyFile(filePath, resizedPath);
        } else {
            await sharp(filePath)
                .resize({
                    width: TARGET_PRINT_WIDTH_PX,
                    fit: 'inside',
                    withoutEnlargement: true
                })
                .withMetadata()
                .toFile(resizedPath);
        }

        return `/uploads/${resizedName}`;
    } catch (error) {
        console.warn('Failed to create resized variant', error);
        return null;
    }
}

function normalizeDateInput(value, fallbackIso) {
    if (!value) {
        return fallbackIso || new Date().toISOString();
    }

    const candidate = typeof value === 'string' ? value : String(value);
    const date = new Date(candidate);
    if (Number.isNaN(date.getTime())) {
        return fallbackIso || new Date().toISOString();
    }
    return date.toISOString();
}

function validateEntryContent(entry) {
    const hasQuestionContent = Boolean(entry.questionText || entry.questionImageUrl);
    const hasAnswerContent = Boolean(entry.answerText || entry.answerImageUrl);

    if (!hasQuestionContent) {
        throw new Error('题目内容需要文字或图片。');
    }

    if (!hasAnswerContent) {
        throw new Error('答案内容需要文字或图片。');
    }
}

function generateQuestionSummary(questionText, hasImage) {
    const text = typeof questionText === 'string' ? questionText : '';
    const normalized = text.replace(/\s+/g, ' ').trim();
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

function ensureEntryMetadata(entries) {
    let updated = false;
    for (const entry of entries) {
        if (typeof entry.remark !== 'string') {
            entry.remark = entry.remark ? String(entry.remark).trim() : '';
            updated = true;
        }
        const hasImage = Boolean(entry.questionImageUrl || entry.questionImageResizedUrl);
        const summary = generateQuestionSummary(entry.questionText, hasImage);
        if (entry.summary !== summary) {
            entry.summary = summary;
            updated = true;
        }
    }
    return updated;
}

async function resolveUploadPath(url) {
    if (!url || typeof url !== 'string' || !url.startsWith('/uploads/')) {
        return null;
    }

    const relative = url.slice('/uploads/'.length);
    const candidate = path.normalize(path.join(UPLOADS_DIR, relative));
    if (!candidate.startsWith(UPLOADS_DIR)) {
        return null;
    }

    try {
        await fsp.access(candidate);
        return candidate;
    } catch (error) {
        if (error.code !== 'ENOENT') {
            console.warn('Unable to access upload', candidate, error);
        }
        return null;
    }
}
async function createWordExport(entries) {
    if (!Array.isArray(entries) || !entries.length) {
        throw new Error('No entries to export');
    }

    const doc = new Document({ sections: [] });
    const children = [];

    for (const [index, entry] of entries.entries()) {
        children.push(
            new Paragraph({
                text: `条目 ${index + 1}`,
                heading: HeadingLevel.HEADING_1,
                pageBreakBefore: index > 0
            })
        );

        const metaParts = [];
        if (entry.questionCode) metaParts.push(`编号：${entry.questionCode}`);
        if (entry.subject) metaParts.push(`学科：${entry.subject}`);
        if (entry.questionType) metaParts.push(`题目类型：${entry.questionType}`);
        if (entry.semester) metaParts.push(`学期：${entry.semester}`);
        if (entry.source) metaParts.push(`来源：${entry.source}`);
        metaParts.push(`创建日期：${formatDateOnly(entry.createdAt)}`);
        children.push(new Paragraph(`【${metaParts.join(' | ')}】`));

        const hasQuestionText = Boolean(entry.questionText && entry.questionText.trim());
        if (hasQuestionText) {
            const questionTextParagraph = createLabeledParagraph('题目内容（文字）：', entry.questionText);
            if (questionTextParagraph) {
                children.push(questionTextParagraph);
            }
        } else {
            const questionImage = await loadImageForDoc(doc, entry.questionImageResizedUrl || entry.questionImageUrl);
            if (questionImage) {
                children.push(new Paragraph({ children: [new TextRun({ text: '题目图片：', bold: true })] }));
                children.push(new Paragraph({ children: [questionImage] }));
            }
        }

        const answerTextParagraph = createLabeledParagraph('答案（文字）：', entry.answerText);
        if (answerTextParagraph) {
            children.push(answerTextParagraph);
        }

        const answerImage = await loadImageForDoc(doc, entry.answerImageResizedUrl || entry.answerImageUrl);
        if (answerImage) {
            children.push(new Paragraph({ children: [new TextRun({ text: '答案图片：', bold: true })] }));
            children.push(new Paragraph({ children: [answerImage] }));
        }

        const reasonParagraph = createLabeledParagraph('错误原因：', entry.errorReason, { skipWhenEmpty: false });
        if (reasonParagraph) {
            children.push(reasonParagraph);
        }

        const remarkParagraph = createLabeledParagraph('备注：', entry.remark, { skipWhenEmpty: true });
        if (remarkParagraph) {
            children.push(remarkParagraph);
        }

        children.push(new Paragraph({ text: '' }));
    }

    doc.addSection({ children });

    return Packer.toBuffer(doc);
}

async function createPaperExport(entries) {
    if (!Array.isArray(entries) || !entries.length) {
        throw new Error('No entries to export');
    }

    const doc = new Document({ sections: [] });
    const children = [];

    for (const [index, entry] of entries.entries()) {
        if (index > 0) {
            children.push(
                new Paragraph({
                    text: '',
                    spacing: { before: 200, after: 200 }
                })
            );
        }

        const metaParts = [];
        if (entry.questionCode) metaParts.push(`编号：${entry.questionCode}`);
        if (entry.subject) metaParts.push(entry.subject);
        if (entry.semester) metaParts.push(entry.semester);
        if (entry.questionType) metaParts.push(entry.questionType);
        if (entry.source) metaParts.push(`来源：${entry.source}`);
        metaParts.push(`日期：${formatDateOnly(entry.createdAt)}`);
        const metaText = `【${metaParts.join(' / ')}】`;
        children.push(
            new Paragraph({
                children: [new TextRun({ text: metaText, italics: true, size: 18 })],
                spacing: { after: 200 }
            })
        );

        const hasQuestionText = Boolean(entry.questionText && entry.questionText.trim());
        if (hasQuestionText) {
            const questionParagraph = createPlainParagraph(entry.questionText, { skipWhenEmpty: false, fallback: '（未提供）' });
            if (questionParagraph) {
                children.push(questionParagraph);
            }
        } else {
            const questionImage = await loadImageForDoc(doc, entry.questionImageResizedUrl || entry.questionImageUrl);
            if (questionImage) {
                children.push(new Paragraph({ children: [questionImage] }));
            } else {
                const fallbackParagraph = createPlainParagraph('', { skipWhenEmpty: false, fallback: '（未提供）' });
                if (fallbackParagraph) {
                    children.push(fallbackParagraph);
                }
            }
        }
    }

    doc.addSection({ children });

    return Packer.toBuffer(doc);
}

async function loadImageForDoc(doc, url) {
    if (!url) return null;
    const filePath = await resolveUploadPath(url);
    if (!filePath) return null;

    try {
        const { data, info } = await sharp(filePath).rotate().toBuffer({ resolveWithObject: true });
        let { width, height } = info;
        if (width && height) {
            const maxWidth = 600;
            if (width > maxWidth) {
                const scale = maxWidth / width;
                width = Math.round(width * scale);
                height = Math.round(height * scale);
            }
        }

        if (width && height) {
            return new ImageRun({ data, transformation: { width, height } });
        }
        return new ImageRun({ data });
    } catch (error) {
        console.warn('Unable to load image for Word export', url, error);
        return null;
    }
}

function createLabeledParagraph(label, text, options = {}) {
    const { skipWhenEmpty = false, fallback = '（未填写）' } = options;
    const value = typeof text === 'string' ? text.trim() : '';
    if (!value && skipWhenEmpty) {
        return null;
    }

    const display = value || fallback;
    const lines = String(display).split(/\r?\n/);
    const runs = [new TextRun({ text: label, bold: true })];

    lines.forEach((line, index) => {
        if (index === 0) {
            runs.push(new TextRun({ text: line }));
        } else {
            runs.push(new TextRun({ break: 1 }));
            runs.push(new TextRun({ text: line }));
        }
    });

    return new Paragraph({ children: runs });
}

function createPlainParagraph(text, options = {}) {
    const { skipWhenEmpty = false, fallback = '（未填写）' } = options;
    const value = typeof text === 'string' ? text.trim() : '';
    if (!value && skipWhenEmpty) {
        return null;
    }

    const display = value || fallback;
    const lines = String(display).split(/\r?\n/);
    const runs = [];

    lines.forEach((line, index) => {
        if (index > 0) {
            runs.push(new TextRun({ break: 1 }));
        }
        runs.push(new TextRun({ text: line }));
    });

    return new Paragraph({ children: runs });
}

function formatDateOnly(value) {
    if (!value) return '（未填写）';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return '（未填写）';
    }
    return date.toISOString().split('T')[0];
}

function getSubjectPrefix(subject) {
    if (!subject) return 'X';
    const trimmed = subject.trim();
    if (!trimmed) return 'X';
    const mapped = SUBJECT_PREFIX_MAP.get(trimmed);
    if (mapped) return mapped;
    const asciiMatch = trimmed.match(/[A-Za-z]/);
    if (asciiMatch) {
        return asciiMatch[0].toUpperCase();
    }
    return 'X';
}

function parseQuestionCode(code) {
    if (!code || typeof code !== 'string') return null;
    const trimmed = code.trim().toUpperCase();
    const match = /^([A-Z]+)(\d{8})(\d{3,})$/.exec(trimmed);
    if (!match) return null;
    const sequence = Number.parseInt(match[3], 10);
    if (Number.isNaN(sequence)) return null;
    return {
        prefix: match[1],
        datePart: match[2],
        sequence,
        code: `${match[1]}${match[2]}${String(sequence).padStart(3, '0')}`
    };
}

function formatDateForCode(value) {
    const formatted = formatDateOnly(value);
    if (!formatted || formatted === '（未填写）') {
        return new Date().toISOString().split('T')[0].replace(/-/g, '');
    }
    return formatted.replace(/-/g, '');
}

function getNextSequence(entries, prefix, datePart) {
    let max = 0;
    for (const entry of Array.isArray(entries) ? entries : []) {
        if (!entry || typeof entry !== 'object') continue;
        const parsed = parseQuestionCode(entry.questionCode);
        if (parsed && parsed.prefix === prefix && parsed.datePart === datePart) {
            if (parsed.sequence > max) {
                max = parsed.sequence;
            }
        }
    }
    return max + 1;
}

function assignQuestionCode(entry, entries = []) {
    if (!entry || typeof entry !== 'object') return null;

    const prefix = getSubjectPrefix(entry.subject || '');
    const datePart = formatDateForCode(entry.createdAt);
    const existing = parseQuestionCode(entry.questionCode);
    const normalizedEntries = Array.isArray(entries) ? entries : [];

    if (existing && existing.prefix === prefix && existing.datePart === datePart) {
        const conflict = normalizedEntries.some(
            (item) => item && item.id !== entry.id && item.questionCode === existing.code
        );
        if (!conflict) {
            entry.questionCode = existing.code;
            return entry.questionCode;
        }
    }

    const nextSequence = getNextSequence(normalizedEntries, prefix, datePart);
    const code = `${prefix}${datePart}${String(nextSequence).padStart(3, '0')}`;
    entry.questionCode = code;
    return code;
}

function ensureQuestionCodes(entries) {
    if (!Array.isArray(entries) || !entries.length) {
        return false;
    }

    let changed = false;
    const indexed = entries.map((entry, index) => ({ entry, index }));
    indexed.sort((a, b) => {
        const aTime = new Date(a.entry?.createdAt || 0).getTime();
        const bTime = new Date(b.entry?.createdAt || 0).getTime();
        if (Number.isNaN(aTime) && Number.isNaN(bTime)) return a.index - b.index;
        if (Number.isNaN(aTime)) return 1;
        if (Number.isNaN(bTime)) return -1;
        if (aTime === bTime) return a.index - b.index;
        return aTime - bTime;
    });

    for (const { entry, index } of indexed) {
        if (!entry || typeof entry !== 'object') continue;
        const previous = entry.questionCode;
        const others = entries.filter((_, idx) => idx !== index);
        assignQuestionCode(entry, others);
        if (entry.questionCode !== previous) {
            changed = true;
        }
    }

    return changed;
}

function getExtensionFromMime(mime) {
    switch (mime) {
        case 'image/jpeg':
            return '.jpg';
        case 'image/png':
            return '.png';
        case 'image/gif':
            return '.gif';
        case 'image/webp':
            return '.webp';
        default:
            return '';
    }
}

async function logAction(action, status, details = {}) {
    try {
        await ensureDirectories();
        const entry = {
            timestamp: new Date().toISOString(),
            action,
            status,
            details
        };
        await fsp.appendFile(LOG_FILE, `${JSON.stringify(entry)}\n`);
    } catch (error) {
        console.warn('Failed to write activity log', error);
    }
}

async function readLogs(limit) {
    try {
        const data = await fsp.readFile(LOG_FILE, 'utf8');
        const lines = data
            .split('\n')
            .filter(Boolean)
            .map((line) => {
                try {
                    return JSON.parse(line);
                } catch (error) {
                    return null;
                }
            })
            .filter(Boolean)
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        return lines.slice(0, limit);
    } catch (error) {
        if (error.code === 'ENOENT') {
            return [];
        }
        throw error;
    }
}

