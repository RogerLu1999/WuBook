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
const MIN_OCR_WIDTH = 1200;
const TARGET_FONT_POINT_SIZE = 12;
const DOCX_FONT_SIZE = TARGET_FONT_POINT_SIZE * 2;
const PAPER_META_FONT_POINT_SIZE = 8;
const PAPER_META_FONT_SIZE = PAPER_META_FONT_POINT_SIZE * 2;
const SCREEN_DPI = 96;
const TARGET_TEXT_HEIGHT_PX = Math.round((TARGET_FONT_POINT_SIZE / 72) * SCREEN_DPI);
const MIN_IMAGE_SCALE = 0.5;
const MAX_IMAGE_SCALE = 2;
const DEFAULT_IMAGE_SCALE = 1;
const PAPER_IMAGE_BASE_WIDTH = 600;

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
const ocrUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024
    }
});

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
        { name: 'answerImage', maxCount: 1 },
        { name: 'originalImage', maxCount: 1 }
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
                answerImage: Boolean(entry.answerImageUrl),
                originalImage: Boolean(entry.originalImageUrl)
            });
            res.status(201).json(entry);
        } catch (error) {
            console.error(error);
            await logAction('create-entry', 'error', { message: error.message });
            res.status(500).json({ error: 'Failed to save entry' });
        }
    }
);

app.post('/api/ocr', ocrUpload.single('image'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: '缺少需要识别的图片文件。' });
    }

    try {
        const processedImage = await preprocessOcrImage(req.file.buffer);
        const text = await recognizeTextWithQwen(processedImage);
        const cleanedText = cleanRecognizedText(text);

        await logAction('ocr-extract', 'success', {
            size: req.file.size,
            textLength: cleanedText.length,
            provider: 'qwen'
        });

        res.json({ text: cleanedText });
    } catch (error) {
        console.error(error);
        await logAction('ocr-extract', 'error', { message: error.message });
        res.status(500).json({ error: error.message || 'Failed to recognize text' });
    }
});

async function recognizeTextWithQwen(buffer) {
    const apiKey = process.env.DASHSCOPE_API_KEY;
    if (!apiKey) {
        throw new Error('缺少 Qwen API Key 配置。');
    }

    if (typeof fetch !== 'function') {
        throw new Error('当前运行环境不支持向 Qwen 发起请求。');
    }

    const endpoint = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';
    const model = process.env.QWEN_VL_MODEL || 'qwen-vl-max';
    const base64Image = buffer.toString('base64');

    const payload = {
        model,
        input: {
            messages: [
                {
                    role: 'user',
                    content: [
                        {
                            image: `data:image/png;base64,${base64Image}`
                        },
                        {
                            text: '请直接返回图片中识别到的文字，不要添加任何其他说明或格式。'
                        }
                    ]
                }
            ]
        },
        parameters: {
            result_format: 'text'
        }
    };

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify(payload)
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
        const message = result?.message || `Qwen API 请求失败（${response.status}）`;
        throw new Error(message);
    }

    if (result?.code && Number(result.code) !== 200) {
        const message = result?.message || 'Qwen API 返回错误。';
        throw new Error(message);
    }

    const text = extractTextFromQwenResponse(result);
    if (!text) {
        throw new Error('Qwen 未返回识别结果。');
    }

    return text;
}

function extractTextFromQwenResponse(result) {
    if (!result) return '';

    const output = result.output || {};

    if (typeof output.text === 'string') {
        return output.text.trim();
    }

    if (Array.isArray(output.choices)) {
        for (const choice of output.choices) {
            const message = choice?.message;
            if (!message) continue;
            const content = message.content || [];
            const parts = Array.isArray(content) ? content : [];
            const textParts = parts.map(extractTextFromQwenContentPart).filter(Boolean);
            if (textParts.length > 0) {
                return textParts.join('').trim();
            }

            if (typeof message?.content === 'string') {
                return message.content.trim();
            }

            const fallbackText = extractTextFromQwenContentPart(message.content);
            if (fallbackText) {
                return fallbackText.trim();
            }
        }
    }

    if (typeof output?.message === 'string') {
        return output.message.trim();
    }

    return '';
}

function extractTextFromQwenContentPart(part) {
    if (!part) return '';

    if (typeof part === 'string') {
        return part;
    }

    if (Array.isArray(part)) {
        return part.map(extractTextFromQwenContentPart).filter(Boolean).join('');
    }

    if (typeof part !== 'object') {
        return '';
    }

    if (typeof part.text === 'string') {
        return part.text;
    }

    if (Array.isArray(part.text)) {
        const nested = part.text.map(extractTextFromQwenContentPart).filter(Boolean).join('');
        if (nested) {
            return nested;
        }
    }

    if (part.text && typeof part.text === 'object') {
        const nested = extractTextFromQwenContentPart(part.text);
        if (nested) {
            return nested;
        }
    }

    if (typeof part.content === 'string') {
        return part.content;
    }

    if (Array.isArray(part.content)) {
        const nested = part.content.map(extractTextFromQwenContentPart).filter(Boolean).join('');
        if (nested) {
            return nested;
        }
    }

    if (part.content && typeof part.content === 'object') {
        const nested = extractTextFromQwenContentPart(part.content);
        if (nested) {
            return nested;
        }
    }

    if (typeof part.value === 'string') {
        return part.value;
    }

    if (part.value && typeof part.value === 'object') {
        const nested = extractTextFromQwenContentPart(part.value);
        if (nested) {
            return nested;
        }
    }

    const hasTextLikeKey = ['text', 'content', 'value'].some((key) => key in part);
    if (!hasTextLikeKey) {
        return '';
    }

    const nested = Object.entries(part)
        .filter(([key]) => ['text', 'content', 'value'].includes(key))
        .map(([, value]) => extractTextFromQwenContentPart(value))
        .filter(Boolean)
        .join('');

    return nested;
}

async function preprocessOcrImage(buffer) {
    const image = sharp(buffer, { failOnError: false }).rotate();
    const metadata = await image.metadata();
    if (metadata.width && metadata.width < MIN_OCR_WIDTH) {
        image.resize({ width: MIN_OCR_WIDTH });
    }
    return image.grayscale().normalize().sharpen().toFormat('png').toBuffer();
}

function cleanRecognizedText(text) {
    if (!text) return '';
    const normalized = text
        .replace(/\r\n/g, '\n')
        .replace(/[\u3000\u00A0]/g, ' ')
        .replace(/\s+([,.;:!?，。；：！？、])/g, '$1')
        .replace(/([（［｛【<])\s+/g, '$1')
        .replace(/\s+([）］｝】>])/g, '$1');

    const lines = normalized.split('\n').map((line) =>
        line
            .replace(/[ \t]{2,}/g, ' ')
            .replace(/([\u4e00-\u9fff])\s+(?=[\u4e00-\u9fff])/g, '$1')
            .trimEnd()
    );

    return lines.join('\n').trim();
}

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

app.patch('/api/entries/:id/question-image-scale', async (req, res) => {
    try {
        const percentValue =
            req.body?.zoomPercent ??
            req.body?.zoom ??
            req.body?.percent ??
            req.body?.value ??
            req.body?.questionImageScale ??
            null;
        const numericPercent =
            typeof percentValue === 'number' ? percentValue : Number.parseFloat(percentValue);

        if (!Number.isFinite(numericPercent)) {
            return res.status(400).json({ error: 'Invalid zoom factor' });
        }

        const entries = await readEntries();
        const index = entries.findIndex((entry) => entry.id === req.params.id);
        if (index === -1) {
            await logAction('update-question-image-scale', 'error', {
                id: req.params.id,
                message: 'Entry not found'
            });
            return res.status(404).json({ error: 'Entry not found' });
        }

        const scale = clamp(numericPercent / 100, MIN_IMAGE_SCALE, MAX_IMAGE_SCALE);
        entries[index].questionImageScale = scale;
        entries[index].updatedAt = new Date().toISOString();

        await writeEntries(entries);
        await logAction('update-question-image-scale', 'success', {
            id: entries[index].id,
            questionCode: entries[index].questionCode,
            scale,
            zoomPercent: Math.round(scale * 100)
        });

        res.json(entries[index]);
    } catch (error) {
        console.error(error);
        await logAction('update-question-image-scale', 'error', { message: error.message });
        res.status(500).json({ error: 'Failed to update zoom factor' });
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
            removed.answerImageResizedUrl,
            removed.originalImageUrl,
            removed.originalImageResizedUrl
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
                entry.answerImageResizedUrl,
                entry.originalImageUrl,
                entry.originalImageResizedUrl
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

        const { buffer: docBuffer, updatedEntryIds } = await createPaperExport(selectedEntries);
        const filename = `wubook-paper-${new Date().toISOString().split('T')[0]}.docx`;

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        if (Array.isArray(updatedEntryIds) && updatedEntryIds.length) {
            await writeEntries(entries);
        }
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
    const originalFile = Array.isArray(files.originalImage) ? files.originalImage[0] : null;

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
        originalImageUrl: null,
        originalImageResizedUrl: null,
        questionImageScale: parseScale(body.questionImageScale),
        answerImageScale: parseScale(body.answerImageScale),
        originalImageScale: parseScale(body.originalImageScale),
        createdAt: normalizeDateInput(body.createdAt, now),
        updatedAt: now
    };

    if (!entry.questionText && !hasQuestionImageInput) {
        throw new Error('题目内容需要文字或图片。');
    }

    if (!entry.answerText && !hasAnswerImageInput) {
        throw new Error('答案内容需要文字或图片。');
    }

    if (originalFile) {
        const filePath = originalFile.path || path.join(UPLOADS_DIR, originalFile.filename);
        const photoInfo = await finalizePhotoStorage(filePath, originalFile.filename);
        entry.originalImageUrl = photoInfo.photoUrl;
        entry.originalImageResizedUrl = photoInfo.photoResizedUrl;
        const originalScale = parseScale(photoInfo.photoScale);
        if (originalScale !== null) {
            entry.originalImageScale = originalScale;
        }
    }

    if (questionFile) {
        const filePath = questionFile.path || path.join(UPLOADS_DIR, questionFile.filename);
        const photoInfo = await finalizePhotoStorage(filePath, questionFile.filename);
        entry.questionImageUrl = photoInfo.photoUrl;
        entry.questionImageResizedUrl = photoInfo.photoResizedUrl;
        const questionScale = parseScale(photoInfo.photoScale);
        if (questionScale !== null) {
            entry.questionImageScale = questionScale;
        }
    }

    if (answerFile) {
        const filePath = answerFile.path || path.join(UPLOADS_DIR, answerFile.filename);
        const photoInfo = await finalizePhotoStorage(filePath, answerFile.filename);
        entry.answerImageUrl = photoInfo.photoUrl;
        entry.answerImageResizedUrl = photoInfo.photoResizedUrl;
        const answerScale = parseScale(photoInfo.photoScale);
        if (answerScale !== null) {
            entry.answerImageScale = answerScale;
        }
    }

    entry.questionImageUrl = entry.questionImageUrl || (typeof body.questionImageUrl === 'string' ? body.questionImageUrl : null);
    entry.questionImageResizedUrl =
        entry.questionImageResizedUrl || (typeof body.questionImageResizedUrl === 'string' ? body.questionImageResizedUrl : null);
    entry.answerImageUrl = entry.answerImageUrl || (typeof body.answerImageUrl === 'string' ? body.answerImageUrl : null);
    entry.answerImageResizedUrl =
        entry.answerImageResizedUrl || (typeof body.answerImageResizedUrl === 'string' ? body.answerImageResizedUrl : null);
    entry.originalImageUrl = entry.originalImageUrl || (typeof body.originalImageUrl === 'string' ? body.originalImageUrl : null);
    entry.originalImageResizedUrl =
        entry.originalImageResizedUrl ||
        (typeof body.originalImageResizedUrl === 'string' ? body.originalImageResizedUrl : null);

    entry.questionImageScale = clamp(
        entry.questionImageScale === null ? DEFAULT_IMAGE_SCALE : entry.questionImageScale,
        MIN_IMAGE_SCALE,
        MAX_IMAGE_SCALE
    );

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
        const scale = parseScale(info.photoScale);
        if (scale !== null) {
            entry.questionImageScale = scale;
        }
    } else if (raw.questionImage && !entry.questionImageUrl) {
        const info = await saveDataUrl(raw.questionImage, `${entry.id}-question`);
        entry.questionImageUrl = info.photoUrl;
        entry.questionImageResizedUrl = info.photoResizedUrl;
        const scale = parseScale(info.photoScale);
        if (scale !== null) {
            entry.questionImageScale = scale;
        }
    } else if (raw.questionImageUrl) {
        entry.questionImageUrl = raw.questionImageUrl;
        if (raw.questionImageResizedUrl) {
            entry.questionImageResizedUrl = raw.questionImageResizedUrl;
            if (entry.questionImageScale === null) {
                const scale = parseScale(raw.questionImageScale);
                if (scale !== null) {
                    entry.questionImageScale = scale;
                }
            }
        } else if (raw.questionImageUrl.startsWith('/uploads/')) {
            const relative = raw.questionImageUrl.slice(1);
            const sourcePath = path.join(ROOT_DIR, relative);
            try {
                const resized = await generateResizedVariant(sourcePath);
                entry.questionImageResizedUrl = resized.url;
                if (entry.questionImageScale === null) {
                    const scale = parseScale(resized.fontScale);
                    if (scale !== null) {
                        entry.questionImageScale = scale;
                    }
                }
            } catch (error) {
                console.warn('Unable to regenerate resized question image during import', error);
            }
        }
    }

    if (raw.answerImageDataUrl && !entry.answerImageUrl) {
        const info = await saveDataUrl(raw.answerImageDataUrl, `${entry.id}-answer`);
        entry.answerImageUrl = info.photoUrl;
        entry.answerImageResizedUrl = info.photoResizedUrl;
        const scale = parseScale(info.photoScale);
        if (scale !== null) {
            entry.answerImageScale = scale;
        }
    } else if (raw.answerImage && !entry.answerImageUrl) {
        const info = await saveDataUrl(raw.answerImage, `${entry.id}-answer`);
        entry.answerImageUrl = info.photoUrl;
        entry.answerImageResizedUrl = info.photoResizedUrl;
        const scale = parseScale(info.photoScale);
        if (scale !== null) {
            entry.answerImageScale = scale;
        }
    } else if (raw.answerImageUrl) {
        entry.answerImageUrl = raw.answerImageUrl;
        if (raw.answerImageResizedUrl) {
            entry.answerImageResizedUrl = raw.answerImageResizedUrl;
            if (entry.answerImageScale === null) {
                const scale = parseScale(raw.answerImageScale);
                if (scale !== null) {
                    entry.answerImageScale = scale;
                }
            }
        } else if (raw.answerImageUrl.startsWith('/uploads/')) {
            const relative = raw.answerImageUrl.slice(1);
            const sourcePath = path.join(ROOT_DIR, relative);
            try {
                const resized = await generateResizedVariant(sourcePath);
                entry.answerImageResizedUrl = resized.url;
                if (entry.answerImageScale === null) {
                    const scale = parseScale(resized.fontScale);
                    if (scale !== null) {
                        entry.answerImageScale = scale;
                    }
                }
            } catch (error) {
                console.warn('Unable to regenerate resized answer image during import', error);
            }
        }
    }

    if (raw.originalImageDataUrl && !entry.originalImageUrl) {
        const info = await saveDataUrl(raw.originalImageDataUrl, `${entry.id}-original`);
        entry.originalImageUrl = info.photoUrl;
        entry.originalImageResizedUrl = info.photoResizedUrl;
        const scale = parseScale(info.photoScale);
        if (scale !== null) {
            entry.originalImageScale = scale;
        }
    } else if (raw.originalImage && !entry.originalImageUrl) {
        const info = await saveDataUrl(raw.originalImage, `${entry.id}-original`);
        entry.originalImageUrl = info.photoUrl;
        entry.originalImageResizedUrl = info.photoResizedUrl;
        const scale = parseScale(info.photoScale);
        if (scale !== null) {
            entry.originalImageScale = scale;
        }
    } else if (raw.originalImageUrl) {
        entry.originalImageUrl = raw.originalImageUrl;
        if (raw.originalImageResizedUrl) {
            entry.originalImageResizedUrl = raw.originalImageResizedUrl;
            if (entry.originalImageScale === null) {
                const scale = parseScale(raw.originalImageScale);
                if (scale !== null) {
                    entry.originalImageScale = scale;
                }
            }
        } else if (raw.originalImageUrl.startsWith('/uploads/')) {
            const relative = raw.originalImageUrl.slice(1);
            const sourcePath = path.join(ROOT_DIR, relative);
            try {
                const resized = await generateResizedVariant(sourcePath);
                entry.originalImageResizedUrl = resized.url;
                if (entry.originalImageScale === null) {
                    const scale = parseScale(resized.fontScale);
                    if (scale !== null) {
                        entry.originalImageScale = scale;
                    }
                }
            } catch (error) {
                console.warn('Unable to regenerate resized original image during import', error);
            }
        }
    }

    entry.questionImageScale = clamp(
        entry.questionImageScale === null ? DEFAULT_IMAGE_SCALE : entry.questionImageScale,
        MIN_IMAGE_SCALE,
        MAX_IMAGE_SCALE
    );

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
        if (ensureQuestionImageScales(parsed)) {
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
        return { photoUrl: null, photoResizedUrl: null, photoScale: null };
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
    const resized = await generateResizedVariant(filePath);
    let photoScale = null;
    if (resized && typeof resized.fontScale === 'number') {
        photoScale = resized.fontScale;
    } else {
        const analysis = await analyzeImageFontScale(filePath);
        if (analysis && typeof analysis.scale === 'number') {
            photoScale = analysis.scale;
        }
    }

    return {
        photoUrl,
        photoResizedUrl: resized ? resized.url : null,
        photoScale
    };
}

async function generateResizedVariant(filePath) {
    try {
        const { dir, name, ext } = path.parse(filePath);
        const resizedName = `${name}-a4${ext}`;
        const resizedPath = path.join(dir, resizedName);

        const metadata = await sharp(filePath, { failOnError: false }).metadata();
        if (!metadata.width || metadata.width <= TARGET_PRINT_WIDTH_PX) {
            await fsp.copyFile(filePath, resizedPath);
        } else {
            await sharp(filePath, { failOnError: false })
                .resize({
                    width: TARGET_PRINT_WIDTH_PX,
                    fit: 'inside',
                    withoutEnlargement: true
                })
                .withMetadata()
                .toFile(resizedPath);
        }

        const analysis = await analyzeImageFontScale(resizedPath);
        return {
            url: `/uploads/${resizedName}`,
            path: resizedPath,
            fontScale: analysis && typeof analysis.scale === 'number' ? analysis.scale : null
        };
    } catch (error) {
        console.warn('Failed to create resized variant', error);
        return { url: null, path: null, fontScale: null };
    }
}

async function analyzeImageFontScale(filePath) {
    try {
        const analyzer = sharp(filePath, { failOnError: false }).rotate();
        const metadata = await analyzer.metadata();
        const { data, info } = await analyzer
            .clone()
            .greyscale()
            .normalize()
            .threshold(180)
            .raw()
            .toBuffer({ resolveWithObject: true });

        const { width, height } = info;
        if (!width || !height || !data) {
            return {
                scale: 1,
                measuredHeight: null,
                targetHeight: TARGET_TEXT_HEIGHT_PX,
                density: metadata?.density || null,
                analyzedAt: new Date().toISOString(),
                confidence: 0
            };
        }

        const activeThreshold = 0.12;
        const minRunLength = 3;
        const rowFractions = new Array(height);

        for (let y = 0; y < height; y += 1) {
            let darkPixels = 0;
            const offset = y * width;
            for (let x = 0; x < width; x += 1) {
                if (data[offset + x] < 128) {
                    darkPixels += 1;
                }
            }
            rowFractions[y] = darkPixels / width;
        }

        const runLengths = [];
        let currentRun = 0;
        for (let y = 0; y < height; y += 1) {
            if (rowFractions[y] >= activeThreshold) {
                currentRun += 1;
            } else if (currentRun > 0) {
                runLengths.push(currentRun);
                currentRun = 0;
            }
        }
        if (currentRun > 0) {
            runLengths.push(currentRun);
        }

        const filtered = runLengths.filter((length) => length >= minRunLength);
        if (!filtered.length) {
            return {
                scale: 1,
                measuredHeight: null,
                targetHeight: TARGET_TEXT_HEIGHT_PX,
                density: metadata?.density || null,
                analyzedAt: new Date().toISOString(),
                confidence: 0
            };
        }

        const measuredHeight = median(filtered);
        if (!measuredHeight || measuredHeight <= 0) {
            return {
                scale: 1,
                measuredHeight: null,
                targetHeight: TARGET_TEXT_HEIGHT_PX,
                density: metadata?.density || null,
                analyzedAt: new Date().toISOString(),
                confidence: 0
            };
        }

        const rawScale = TARGET_TEXT_HEIGHT_PX / measuredHeight;
        const scale = clamp(rawScale, MIN_IMAGE_SCALE, MAX_IMAGE_SCALE);

        const confidence = filtered.length / runLengths.length || 1;

        return {
            scale,
            measuredHeight,
            targetHeight: TARGET_TEXT_HEIGHT_PX,
            density: metadata?.density || null,
            analyzedAt: new Date().toISOString(),
            confidence
        };
    } catch (error) {
        console.warn('Unable to analyze font scale', filePath, error);
        return null;
    }
}

async function ensureImageScale(entry, kind) {
    const scaleKey = `${kind}ImageScale`;
    if (typeof entry[scaleKey] === 'number' && entry[scaleKey] > 0) {
        return { scale: entry[scaleKey], updated: false };
    }

    const resizedKey = `${kind}ImageResizedUrl`;
    const originalKey = `${kind}ImageUrl`;
    const url = entry[resizedKey] || entry[originalKey];
    if (!url) {
        return { scale: null, updated: false };
    }

    const filePath = await resolveUploadPath(url);
    if (!filePath) {
        return { scale: null, updated: false };
    }

    const analysis = await analyzeImageFontScale(filePath);
    const computedScale = analysis && typeof analysis.scale === 'number' ? analysis.scale : 1;
    entry[scaleKey] = clamp(computedScale, MIN_IMAGE_SCALE, MAX_IMAGE_SCALE);
    entry.updatedAt = new Date().toISOString();
    return { scale: entry[scaleKey], updated: true };
}

function median(values) {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
        return (sorted[middle - 1] + sorted[middle]) / 2;
    }
    return sorted[middle];
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function parseScale(value) {
    if (value === null || value === undefined) {
        return null;
    }
    const numeric = typeof value === 'number' ? value : Number.parseFloat(value);
    if (!Number.isFinite(numeric) || numeric <= 0) {
        return null;
    }
    return clamp(numeric, MIN_IMAGE_SCALE, MAX_IMAGE_SCALE);
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

function ensureQuestionImageScales(entries) {
    let updated = false;
    for (const entry of Array.isArray(entries) ? entries : []) {
        if (!entry || typeof entry !== 'object') {
            continue;
        }
        const current = Number.isFinite(entry.questionImageScale) ? entry.questionImageScale : null;
        const clamped = clamp(
            current === null ? DEFAULT_IMAGE_SCALE : current,
            MIN_IMAGE_SCALE,
            MAX_IMAGE_SCALE
        );
        if (entry.questionImageScale !== clamped) {
            entry.questionImageScale = clamped;
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
    const updatedEntryIds = new Set();

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
                children: [new TextRun({ text: metaText, italics: true, size: PAPER_META_FONT_SIZE })],
                spacing: { after: 200 }
            })
        );

        const hasQuestionText = Boolean(entry.questionText && entry.questionText.trim());
        if (hasQuestionText) {
            const questionParagraph = createPlainParagraph(entry.questionText, {
                skipWhenEmpty: false,
                fallback: '（未提供）',
                fontSize: DOCX_FONT_SIZE,
                paragraphSpacing: { after: 200 }
            });
            if (questionParagraph) {
                children.push(questionParagraph);
            }
        } else {
            const questionImageUrl = entry.questionImageResizedUrl || entry.questionImageUrl;
            let ensureResult = { scale: parseScale(entry.questionImageScale), updated: false };
            if (ensureResult.scale === null && questionImageUrl) {
                ensureResult = await ensureImageScale(entry, 'question');
            }

            let imageScale = parseScale(ensureResult.scale);
            if (imageScale === null) {
                imageScale = 1;
            } else {
                const previousScale = entry.questionImageScale;
                entry.questionImageScale = imageScale;
                if (previousScale !== imageScale && entry.id) {
                    entry.updatedAt = new Date().toISOString();
                    updatedEntryIds.add(entry.id);
                }
            }

            if (ensureResult.updated && entry.id) {
                updatedEntryIds.add(entry.id);
            }

            const questionImage = await loadImageForDoc(doc, questionImageUrl, {
                scale: imageScale,
                baseMaxWidth: PAPER_IMAGE_BASE_WIDTH
            });

            if (questionImage) {
                children.push(
                    new Paragraph({
                        children: [questionImage],
                        spacing: { after: 200 }
                    })
                );
            } else {
                const fallbackParagraph = createPlainParagraph('', {
                    skipWhenEmpty: false,
                    fallback: '（未提供）',
                    fontSize: DOCX_FONT_SIZE,
                    paragraphSpacing: { after: 200 }
                });
                if (fallbackParagraph) {
                    children.push(fallbackParagraph);
                }
            }
        }
    }

    doc.addSection({ children });

    const buffer = await Packer.toBuffer(doc);
    return { buffer, updatedEntryIds: Array.from(updatedEntryIds) };
}

async function loadImageForDoc(doc, url, options = {}) {
    if (!url) return null;
    const filePath = await resolveUploadPath(url);
    if (!filePath) return null;

    try {
        const baseMaxWidth = options.baseMaxWidth || 600;
        const scaleOption = parseScale(options.scale);
        const effectiveScale = scaleOption === null ? 1 : scaleOption;

        const { data, info } = await sharp(filePath, { failOnError: false })
            .rotate()
            .toBuffer({ resolveWithObject: true });
        let { width, height } = info;
        if (width && height) {
            let targetWidth = width * effectiveScale;
            let targetHeight = height * effectiveScale;
            const maxWidth = baseMaxWidth * Math.max(1, effectiveScale);
            if (targetWidth > maxWidth) {
                const adjust = maxWidth / targetWidth;
                targetWidth *= adjust;
                targetHeight *= adjust;
            }

            width = Math.max(1, Math.round(targetWidth));
            height = Math.max(1, Math.round(targetHeight));
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
    const {
        skipWhenEmpty = false,
        fallback = '（未填写）',
        fontSize = null,
        font = null,
        paragraphSpacing = null
    } = options;
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
        const runOptions = { text: line };
        if (fontSize) {
            runOptions.size = fontSize;
        }
        if (font) {
            runOptions.font = font;
        }
        runs.push(new TextRun(runOptions));
    });

    const paragraphOptions = { children: runs };
    if (paragraphSpacing) {
        paragraphOptions.spacing = paragraphSpacing;
    }

    return new Paragraph(paragraphOptions);
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

