const express = require('express');
const path = require('path');
const fsp = require('fs/promises');
const multer = require('multer');
const sharp = require('sharp');
const { randomUUID } = require('crypto');
const https = require('https');
const dns = require('dns');

if (typeof dns.setDefaultResultOrder === 'function') {
    try {
        dns.setDefaultResultOrder('ipv4first');
    } catch (error) {
        console.warn('Failed to set DNS default result order', error);
    }
}
const { Document, Packer, Paragraph, TextRun, HeadingLevel, ImageRun } = require('docx');

const app = express();
const PORT = process.env.PORT || 3000;

const ROOT_DIR = __dirname;
const DATA_DIR = path.join(ROOT_DIR, 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const ENTRIES_FILE = path.join(DATA_DIR, 'entries.json');
const LOG_FILE = path.join(DATA_DIR, 'activity.log');
const PHOTO_CHECK_DIR = path.join(DATA_DIR, 'photo-check');
const PHOTO_CHECK_RECORDS_DIR = path.join(PHOTO_CHECK_DIR, 'records');
const PHOTO_CHECK_HISTORY_FILE = path.join(PHOTO_CHECK_DIR, 'history.json');
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
const MIN_IMAGE_SCALE = 0.3;
const MAX_IMAGE_SCALE = 1.2;
const DEFAULT_IMAGE_SCALE = 1;
const PAPER_IMAGE_BASE_WIDTH = 520;
const PHOTO_CHECK_CROP_PADDING = 16;
const SUPERSCRIPT_MAP = new Map([
    ['0', '⁰'],
    ['1', '¹'],
    ['2', '²'],
    ['3', '³'],
    ['4', '⁴'],
    ['5', '⁵'],
    ['6', '⁶'],
    ['7', '⁷'],
    ['8', '⁸'],
    ['9', '⁹'],
    ['+', '⁺'],
    ['-', '⁻'],
    ['=', '⁼'],
    ['(', '⁽'],
    [')', '⁾'],
    ['x', 'ˣ'],
    ['y', 'ʸ'],
    ['n', 'ⁿ']
]);
const SUBSCRIPT_MAP = new Map([
    ['0', '₀'],
    ['1', '₁'],
    ['2', '₂'],
    ['3', '₃'],
    ['4', '₄'],
    ['5', '₅'],
    ['6', '₆'],
    ['7', '₇'],
    ['8', '₈'],
    ['9', '₉'],
    ['+', '₊'],
    ['-', '₋'],
    ['=', '₌'],
    ['(', '₍'],
    [')', '₎'],
    ['x', 'ₓ'],
    ['y', 'ᵧ'],
    ['n', 'ₙ']
]);

const LATEX_SYMBOL_MAP = new Map([
    ['\\times', '×'],
    ['\\div', '÷'],
    ['\\cdot', '·'],
    ['\\pm', '±'],
    ['\\pi', 'π'],
    ['\\triangle', '△'],
    ['\\perp', '⊥'],
    ['\\angle', '∠'],
    ['\\parallel', '∥'],
    ['\\sim', '∼'],
    ['\\approx', '≈'],
    ['\\neq', '≠'],
    ['\\geq', '≥'],
    ['\\leq', '≤'],
    ['\\cdots', '⋯'],
    ['\\ldots', '…'],
    ['\\infty', '∞'],
    ['\\alpha', 'α'],
    ['\\beta', 'β'],
    ['\\gamma', 'γ'],
    ['\\delta', 'δ'],
    ['\\theta', 'θ'],
    ['\\lambda', 'λ'],
    ['\\mu', 'μ'],
    ['\\rho', 'ρ'],
    ['\\sigma', 'σ'],
    ['\\phi', 'φ'],
    ['\\omega', 'ω']
]);

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

function decodeUploadFilename(name) {
    if (typeof name !== 'string' || name.length === 0) {
        return '';
    }

    try {
        const buffer = Buffer.from(name, 'latin1');
        const decoded = buffer.toString('utf8');
        const reencoded = Buffer.from(decoded, 'utf8').toString('latin1');
        return reencoded === name ? decoded : name;
    } catch (error) {
        return name;
    }
}

function getUploadedFileName(file) {
    if (!file || typeof file.originalname !== 'string') {
        return '';
    }
    return decodeUploadFilename(file.originalname).trim();
}

const preferIPv4Lookup =
    typeof dns.lookup === 'function'
        ? (hostname, options, callback) => {
              if (typeof options === 'function') {
                  callback = options;
                  options = {};
              } else if (typeof options === 'number') {
                  options = { family: options };
              } else if (!options) {
                  options = {};
              }

              if (!hostname) {
                  const error = Object.assign(new Error('Invalid hostname for IPv4 lookup'), {
                      code: 'EINVAL'
                  });
                  process.nextTick(() => callback(error));
                  return;
              }

              dns.lookup(
                  hostname,
                  {
                      ...options,
                      family: 4,
                      all: options.all === true,
                      verbatim: options.verbatim === true
                  },
                  callback
              );
          }
        : undefined;

async function verifyExternalConnections() {
    const checks = [];

    if (process.env.MOONSHOT_API_KEY) {
        checks.push(
            verifyKimiConnectivity()
                .then(() => {
                    console.log('Kimi connectivity check succeeded.');
                })
                .catch((error) => {
                    console.warn('Kimi connectivity check failed', error);
                })
        );
    } else {
        console.warn('Skipping Kimi connectivity check because MOONSHOT_API_KEY is not configured.');
    }

    if (process.env.OPENAI_API_KEY) {
        checks.push(
            verifyOpenAIConnectivity()
                .then(() => {
                    console.log('OpenAI connectivity check succeeded.');
                })
                .catch((error) => {
                    console.warn('OpenAI connectivity check failed', error);
                })
        );
    } else {
        console.warn('Skipping OpenAI connectivity check because OPENAI_API_KEY is not configured.');
    }

    if (checks.length === 0) {
        return;
    }

    await Promise.allSettled(checks);
}

async function verifyOpenAIConnectivity() {
    const baseUrl = String(process.env.OPENAI_API_BASE || 'https://api.openai.com/v1').replace(/\/$/, '');
    const endpointUrl = new URL('models', `${baseUrl}/`);
    const hostname = endpointUrl.hostname;
    const headers = {};

    if (typeof process.env.OPENAI_API_KEY === 'string') {
        headers.Authorization = `Bearer ${process.env.OPENAI_API_KEY}`;
    }

    if (dns.promises?.lookup) {
        const lookupResult = await dns.promises.lookup(hostname, { family: 4 }).catch((error) => {
            throw Object.assign(new Error(`无法解析 OpenAI API 域名 ${hostname}：${error.message}`), {
                cause: error
            });
        });

        if (!lookupResult || !lookupResult.address) {
            throw new Error(`OpenAI API 域名 ${hostname} 未返回有效的 IPv4 地址。`);
        }
    }

    await new Promise((resolve, reject) => {
        const request = https.request(
            {
                protocol: endpointUrl.protocol,
                hostname,
                port: endpointUrl.port || 443,
                method: 'HEAD',
                path: `${endpointUrl.pathname}${endpointUrl.search}`,
                timeout: Number(process.env.OPENAI_TIMEOUT_MS) || 9000,
                lookup: preferIPv4Lookup,
                headers
            },
            (response) => {
                response.resume();
                response.once('end', resolve);
                response.once('close', resolve);
                response.once('error', reject);
            }
        );

        request.on('timeout', () => {
            request.destroy(
                Object.assign(new Error('OpenAI API 连通性检查超时。'), {
                    code: 'ETIMEDOUT'
                })
            );
        });

        request.on('error', reject);
        request.end();
    });
}

async function verifyKimiConnectivity() {
    const endpointUrl = new URL('https://api.moonshot.cn/v1/chat/completions');
    const hostname = endpointUrl.hostname;

    if (dns.promises?.lookup) {
        const lookupResult = await dns.promises.lookup(hostname, { family: 4 }).catch((error) => {
            throw Object.assign(new Error(`无法解析 Kimi API 域名 ${hostname}：${error.message}`), {
                cause: error
            });
        });

        if (!lookupResult || !lookupResult.address) {
            throw new Error(`Kimi API 域名 ${hostname} 未返回有效的 IPv4 地址。`);
        }
    }

    await new Promise((resolve, reject) => {
        const request = https.request(
            {
                protocol: endpointUrl.protocol,
                hostname,
                port: endpointUrl.port || 443,
                method: 'HEAD',
                path: '/',
                timeout: Number(process.env.MOONSHOT_TIMEOUT_MS) || 5000,
                lookup: preferIPv4Lookup
            },
            (response) => {
                response.resume();
                response.once('end', resolve);
                response.once('close', resolve);
                response.once('error', reject);
            }
        );

        request.on('timeout', () => {
            request.destroy(
                Object.assign(new Error('Kimi API 连通性检查超时。'), {
                    code: 'ETIMEDOUT'
                })
            );
        });

        request.on('error', reject);
        request.end();
    });
}

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
        const originalName = getUploadedFileName(file);
        const ext = path.extname(originalName || file?.originalname || '');
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
const photoCheckUpload = ocrUpload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'images', maxCount: 10 }
]);

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

app.post('/api/formula-recognition', ocrUpload.single('image'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: '缺少需要识别的图片文件。' });
    }

    try {
        const processedImage = await preprocessOcrImage(req.file.buffer);
        const result = await recognizeFormulaWithQwen(processedImage);

        await logAction('formula-recognition', 'success', {
            provider: 'qwen',
            latexLength: result.latex?.length || 0,
            mathml: Boolean(result.mathml)
        });

        res.json(result);
    } catch (error) {
        console.error('Formula recognition failed', error);
        await logAction('formula-recognition', 'error', { message: error.message });
        res.status(500).json({ error: error.message || '无法完成试卷识别。' });
    }
});

app.post('/api/photo-check', photoCheckUpload, async (req, res) => {
    const files = [];

    if (req.files && typeof req.files === 'object') {
        const { images, image } = req.files;
        if (Array.isArray(images)) {
            files.push(...images);
        }
        if (Array.isArray(image)) {
            files.push(...image);
        }
    }

    if (req.file && !files.includes(req.file)) {
        files.push(req.file);
    }

    if (files.length === 0) {
        return res.status(400).json({ error: '缺少需要分析的照片。' });
    }

    try {
        const results = [];
        const overall = { total: 0, correct: 0, incorrect: 0, unknown: 0 };

        for (let index = 0; index < files.length; index += 1) {
            const file = files[index];

            try {
                const preparedImage = await preparePhotoCheckImage(file.buffer);
                const photoInfo = await savePhotoCheckOriginalImage(preparedImage);

                const visionAnalysis = await analyzePhotoWithQwen(preparedImage);
                const visionAttempt = {
                    ...normalizePhotoCheckAnalysis(visionAnalysis),
                    provider: 'qwen'
                };

                await attachPhotoCheckProblemImages([visionAttempt], {
                    buffer: preparedImage,
                    metadata: photoInfo?.metadata || null,
                    baseName: photoInfo?.baseName || null
                });

                const baseProblems = clonePhotoCheckProblems(visionAttempt.problems);
                const reviewAttempts = await reviewPhotoCheckProblemsWithMultipleModels(baseProblems);
                const attempts = [visionAttempt, ...reviewAttempts].filter(Boolean);
                const primaryAttempt = reviewAttempts[0] || visionAttempt || createEmptyPhotoCheckAttempt();
                const summary = normalizePhotoCheckAttemptSummary(primaryAttempt.summary);
                const primaryProblems = clonePhotoCheckProblems(primaryAttempt.problems);

                const originalName = getUploadedFileName(file);

                await logAction('photo-check', 'success', {
                    provider: 'qwen+kimi+openai',
                    total: summary.total,
                    correct: summary.correct,
                    incorrect: summary.incorrect,
                    unknown: summary.unknown,
                    index: index + 1,
                    name: originalName || null
                });

                overall.total += summary.total;
                overall.correct += summary.correct;
                overall.incorrect += summary.incorrect;
                overall.unknown += summary.unknown;

                const previewMetadata = photoInfo?.metadata || {};

                results.push({
                    index: index + 1,
                    name: originalName || null,
                    summary,
                    problems: primaryProblems,
                    image: {
                        url: photoInfo?.url || null,
                        width: previewMetadata.width || null,
                        height: previewMetadata.height || null
                    },
                    attempts: attempts.map((attempt, attemptIndex) => ({
                        attempt:
                            Number.isFinite(Number(attempt?.index)) && Number(attempt.index) > 0
                                ? Number(attempt.index)
                                : attemptIndex + 1,
                        summary: attempt.summary,
                        problems: attempt.problems,
                        provider: attempt.provider || null,
                        label: attempt.label || null
                    }))
                });
            } catch (error) {
                const errorMessage = error?.message || '无法完成拍照检查。';
                const originalName = getUploadedFileName(file);
                const displayName = originalName || `第 ${index + 1} 张照片`;
                throw Object.assign(new Error(`${displayName}：${errorMessage}`), {
                    cause: error,
                    batchIndex: index + 1,
                    batchName: originalName || null
                });
            }
        }

        const flattenedProblems = results.flatMap((item) => (Array.isArray(item.problems) ? item.problems : []));

        const payload = {
            totalImages: results.length,
            overall,
            results,
            problems: flattenedProblems
        };

        const record = await savePhotoCheckRecord(payload);

        await logAction('photo-check-record', 'success', {
            id: record.id,
            createdAt: record.createdAt,
            totalImages: payload.totalImages,
            problems: Array.isArray(payload.problems) ? payload.problems.length : 0
        });

        res.json({
            ...payload,
            recordId: record.id,
            createdAt: record.createdAt
        });
    } catch (error) {
        console.error(error);
        await logAction('photo-check', 'error', {
            message: error.message,
            index: error.batchIndex || null,
            name: error.batchName || null
        });
        res.status(500).json({ error: error.message || '无法完成拍照检查。', index: error.batchIndex || null });
    }
});

app.get('/api/photo-check/history', async (req, res) => {
    try {
        const history = await readPhotoCheckHistoryList();
        await logAction('photo-check-history', 'success', { total: history.length });
        res.json(history);
    } catch (error) {
        console.error('Failed to read photo check history', error);
        await logAction('photo-check-history', 'error', { message: error.message });
        res.status(500).json({ error: '无法读取拍照检查历史记录。' });
    }
});

app.patch('/api/photo-check/history/:id', async (req, res) => {
    const rawId = typeof req.params.id === 'string' ? req.params.id.trim() : '';
    if (!rawId) {
        return res.status(400).json({ error: '缺少记录编号。' });
    }

    if (!/^[a-zA-Z0-9-]+$/.test(rawId)) {
        return res.status(400).json({ error: '记录编号格式不正确。' });
    }

    const aliasInput = typeof req.body?.alias === 'string' ? req.body.alias : '';
    const alias = normalizeHistoryAlias(aliasInput);
    const storedAlias = alias || null;

    try {
        const history = await readPhotoCheckHistoryList();
        const index = history.findIndex((item) => item && item.id === rawId);
        if (index === -1) {
            await logAction('photo-check-history-alias', 'error', { id: rawId, code: 'ENOENT' });
            return res.status(404).json({ error: '未找到对应的拍照检查记录。' });
        }

        const existingAlias = normalizeHistoryAlias(history[index]?.alias ?? '');
        if ((existingAlias || null) === storedAlias) {
            await logAction('photo-check-history-alias', 'success', {
                id: rawId,
                alias: storedAlias,
                unchanged: true
            });
            return res.json(history[index]);
        }

        history[index] = { ...history[index], alias: storedAlias };
        await writePhotoCheckHistoryList(history);

        try {
            await updatePhotoCheckRecordAlias(rawId, alias);
        } catch (error) {
            if (error.code !== 'ENOENT') {
                throw error;
            }
        }

        await logAction('photo-check-history-alias', 'success', { id: rawId, alias: storedAlias });
        res.json(history[index]);
    } catch (error) {
        console.error('Failed to update photo check history alias', error);
        await logAction('photo-check-history-alias', 'error', { id: rawId, message: error.message });
        res.status(500).json({ error: '无法更新拍照检查别名。' });
    }
});

app.delete('/api/photo-check/history/:id', async (req, res) => {
    const rawId = typeof req.params.id === 'string' ? req.params.id.trim() : '';
    if (!rawId) {
        return res.status(400).json({ error: '缺少记录编号。' });
    }

    if (!/^[a-zA-Z0-9-]+$/.test(rawId)) {
        return res.status(400).json({ error: '记录编号格式不正确。' });
    }

    try {
        const history = await readPhotoCheckHistoryList();
        const index = history.findIndex((item) => item && item.id === rawId);
        if (index === -1) {
            await logAction('photo-check-history-delete', 'error', { id: rawId, code: 'ENOENT' });
            return res.status(404).json({ error: '未找到对应的拍照检查记录。' });
        }

        history.splice(index, 1);
        await writePhotoCheckHistoryList(history);

        const filePath = path.join(PHOTO_CHECK_RECORDS_DIR, `${rawId}.json`);
        try {
            await fsp.unlink(filePath);
        } catch (error) {
            if (error.code !== 'ENOENT') {
                throw error;
            }
        }

        await logAction('photo-check-history-delete', 'success', { id: rawId });
        res.json({ success: true });
    } catch (error) {
        console.error('Failed to delete photo check history record', error);
        await logAction('photo-check-history-delete', 'error', { id: rawId, message: error.message });
        res.status(500).json({ error: '无法删除拍照检查记录。' });
    }
});

app.get('/api/photo-check/records/:id', async (req, res) => {
    const rawId = typeof req.params.id === 'string' ? req.params.id.trim() : '';
    if (!rawId) {
        return res.status(400).json({ error: '缺少记录编号。' });
    }

    if (!/^[a-zA-Z0-9-]+$/.test(rawId)) {
        return res.status(400).json({ error: '记录编号格式不正确。' });
    }

    const filePath = path.join(PHOTO_CHECK_RECORDS_DIR, `${rawId}.json`);

    try {
        await ensureDirectories();
        const raw = await fsp.readFile(filePath, 'utf8');
        let record = {};
        if (raw.trim()) {
            record = JSON.parse(raw);
        }

        await logAction('photo-check-record-read', 'success', { id: rawId });
        res.json(record);
    } catch (error) {
        if (error.code === 'ENOENT') {
            await logAction('photo-check-record-read', 'error', { id: rawId, code: 'ENOENT' });
            return res.status(404).json({ error: '未找到对应的拍照检查记录。' });
        }

        console.error('Failed to read photo check record', error);
        await logAction('photo-check-record-read', 'error', { id: rawId, message: error.message });
        if (error.name === 'SyntaxError') {
            return res.status(500).json({ error: '拍照检查记录文件已损坏，无法读取。' });
        }
        res.status(500).json({ error: '无法读取拍照检查记录。' });
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

async function recognizeFormulaWithQwen(buffer) {
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

    const systemPrompt =
        '你是一位擅长解析整张试卷的数学 OCR 专家，需要把整套题目转换成可复制的电子排版。任何时候都请返回 JSON。';
    const userPrompt = `请识别整张试卷中的所有题目（包括编号、文字与公式），并输出 JSON：
{
  "latex": "可直接用于 LaTeX/Word 的公式字符串",
  "mathml": "可选的 MathML 表达式",
  "plainText": "便于理解或复制的线性表达"
}
如果试卷里有多道题目，请保持原有题号顺序，用 \\n 分隔不同题目，保留分数、根号、上下标等结构，勿添加额外说明。`;

    const payload = {
        model,
        input: {
            messages: [
                {
                    role: 'system',
                    content: [{ text: systemPrompt }]
                },
                {
                    role: 'user',
                    content: [
                        { image: `data:image/png;base64,${base64Image}` },
                        { text: userPrompt }
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

    const parsed = parseFormulaRecognitionJson(text);
    if (!parsed) {
        throw new Error('Qwen 返回结果格式不正确。');
    }

    const normalized = normalizeFormulaRecognitionResult(parsed);
    if (!normalized.latex && !normalized.mathml && !normalized.plainText) {
        throw new Error('Qwen 未能识别出可用的题目信息。');
    }

    return normalized;
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

function parseFormulaRecognitionJson(text) {
    if (!text) return null;
    const cleaned = text
        .replace(/```(?:json|latex|math)?/gi, '```')
        .replace(/```/g, '')
        .trim();

    if (!cleaned) {
        return null;
    }

    try {
        return JSON.parse(cleaned);
    } catch (error) {
        // fall through
    }

    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
        const candidate = cleaned.slice(start, end + 1);
        try {
            return JSON.parse(candidate);
        } catch (error) {
            // continue
        }
    }

    return { latex: cleaned };
}

function normalizeFormulaRecognitionResult(raw) {
    if (!raw) {
        return { latex: '', mathml: '', plainText: '' };
    }

    if (typeof raw === 'string') {
        const text = sanitizeFormulaRecognitionText(raw);
        return { latex: text, mathml: '', plainText: text };
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

    const latex = latexCandidates.map(sanitizeFormulaRecognitionText).find(Boolean) || '';
    const mathml = mathmlCandidates.map(sanitizeFormulaRecognitionText).find(Boolean) || '';
    const plainText = plainCandidates.map(sanitizeFormulaRecognitionText).find(Boolean) || '';

    return { latex, mathml, plainText };
}

function sanitizeFormulaRecognitionText(value) {
    if (value == null) {
        return '';
    }
    return String(value)
        .replace(/```(?:json|latex|math)?/gi, '')
        .replace(/```/g, '')
        .replace(/^[^\S\r\n]+/gm, '')
        .trim();
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

async function preparePhotoCheckImage(buffer) {
    return sharp(buffer, { failOnError: false }).rotate().toFormat('png').toBuffer();
}

async function savePhotoCheckOriginalImage(buffer) {
    if (!buffer) {
        return {
            url: null,
            path: null,
            filename: null,
            baseName: null,
            metadata: {}
        };
    }

    const metadata = await sharp(buffer, { failOnError: false })
        .metadata()
        .catch(() => ({}));

    const filename = `photo-check-${Date.now()}-${randomUUID()}.png`;
    const filePath = path.join(UPLOADS_DIR, filename);

    await ensureDirectories();
    await fsp.writeFile(filePath, buffer);

    return {
        url: `/uploads/${filename}`,
        path: filePath,
        filename,
        baseName: path.parse(filename).name,
        metadata: metadata || {}
    };
}

async function attachPhotoCheckProblemImages(attempts, options = {}) {
    if (!Array.isArray(attempts) || attempts.length === 0) {
        return;
    }

    const metadata = options?.metadata || {};
    const imageWidth = Number(metadata.width);
    const imageHeight = Number(metadata.height);
    if (!Number.isFinite(imageWidth) || !Number.isFinite(imageHeight)) {
        return;
    }

    const baseName = options?.baseName || `photo-check-${Date.now()}`;
    const buffer = options?.buffer || null;

    for (let attemptIndex = 0; attemptIndex < attempts.length; attemptIndex += 1) {
        const attempt = attempts[attemptIndex];
        if (!attempt || !Array.isArray(attempt.problems) || attempt.problems.length === 0) {
            continue;
        }

        for (let problemIndex = 0; problemIndex < attempt.problems.length; problemIndex += 1) {
            const problem = attempt.problems[problemIndex];
            if (!problem || !problem.boundingBox) {
                continue;
            }

            const region = convertBoundingBoxToRegion(problem.boundingBox, metadata, PHOTO_CHECK_CROP_PADDING);
            if (!region) {
                continue;
            }

            const safeProblemIndex = Number.isFinite(problem.index)
                ? Math.max(1, Math.floor(problem.index))
                : problemIndex + 1;
            const filename = `${baseName}-a${attemptIndex + 1}-q${String(safeProblemIndex).padStart(2, '0')}.png`;

            try {
                const crop = await createPhotoCheckProblemCrop(buffer, region, filename);
                if (!crop) {
                    continue;
                }

                const existingImage = typeof problem.image === 'object' && problem.image ? problem.image : {};
                const boundingBoxInfo = existingImage.boundingBox || {
                    left: problem.boundingBox.left,
                    top: problem.boundingBox.top,
                    width: problem.boundingBox.width,
                    height: problem.boundingBox.height,
                    unit: problem.boundingBox.unit,
                    confidence: problem.boundingBox.confidence ?? null
                };

                problem.image = {
                    ...existingImage,
                    url: crop.url,
                    width: crop.width,
                    height: crop.height,
                    attempt: existingImage.attempt ?? attemptIndex + 1,
                    index: existingImage.index ?? safeProblemIndex,
                    boundingBox: boundingBoxInfo,
                    source: existingImage.source || 'crop'
                };
            } catch (error) {
                console.warn('Failed to generate photo check crop', error);
            }
        }
    }
}

function convertBoundingBoxToRegion(boundingBox, metadata, padding = 0) {
    if (!boundingBox || !metadata) {
        return null;
    }

    const imageWidth = Number(metadata.width);
    const imageHeight = Number(metadata.height);
    if (!Number.isFinite(imageWidth) || !Number.isFinite(imageHeight)) {
        return null;
    }

    const unit = typeof boundingBox.unit === 'string' ? boundingBox.unit.toLowerCase() : 'ratio';
    const leftValue = toFiniteNumber(boundingBox.left ?? boundingBox.x);
    const topValue = toFiniteNumber(boundingBox.top ?? boundingBox.y);
    const widthValue = toFiniteNumber(boundingBox.width);
    const heightValue = toFiniteNumber(boundingBox.height);

    if (![leftValue, topValue, widthValue, heightValue].every((value) => Number.isFinite(value))) {
        return null;
    }

    let left = leftValue;
    let top = topValue;
    let width = widthValue;
    let height = heightValue;

    if (unit === 'pixel') {
        left = Math.max(0, left);
        top = Math.max(0, top);
    } else {
        left = clamp(left, 0, 1) * imageWidth;
        top = clamp(top, 0, 1) * imageHeight;
        width = clamp(width, 0, 1) * imageWidth;
        height = clamp(height, 0, 1) * imageHeight;
    }

    if (width <= 1 || height <= 1) {
        return null;
    }

    let right = left + width;
    let bottom = top + height;

    if (padding > 0) {
        left -= padding;
        top -= padding;
        right += padding;
        bottom += padding;
    }

    left = Math.max(0, Math.floor(left));
    top = Math.max(0, Math.floor(top));
    right = Math.min(imageWidth, Math.ceil(right));
    bottom = Math.min(imageHeight, Math.ceil(bottom));

    const finalWidth = Math.max(1, right - left);
    const finalHeight = Math.max(1, bottom - top);

    if (finalWidth <= 1 || finalHeight <= 1) {
        return null;
    }

    return {
        left,
        top,
        width: finalWidth,
        height: finalHeight
    };
}

async function createPhotoCheckProblemCrop(buffer, region, filename) {
    if (!buffer || !region || !filename) {
        return null;
    }

    const cropBuffer = await sharp(buffer, { failOnError: false })
        .extract({
            left: region.left,
            top: region.top,
            width: region.width,
            height: region.height
        })
        .toFormat('png')
        .toBuffer();

    await ensureDirectories();
    const filePath = path.join(UPLOADS_DIR, filename);
    await fsp.writeFile(filePath, cropBuffer);

    return {
        url: `/uploads/${filename}`,
        path: filePath,
        width: region.width,
        height: region.height
    };
}

async function analyzePhotoWithQwen(buffer) {
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

    const systemPrompt =
        '你是一位严谨的中学老师，需要根据上传的题目照片整理错题检查报告。请始终输出结构化 JSON。';
    const userPrompt = `请完成以下任务：
1. 仔细观察图片，将其中的每一道题目拆分为独立的小题；识别题干（印刷体）和学生的手写答案。
2. 为每道题目写出清晰的题干文本，并转写学生的答案。如果缺失，请写出你能识别的部分。
3. 根据题干独立求解或推导标准答案，填入“model_answer”。
4. 对比学生答案与参考答案，判断正误：正确写 true，错误写 false，如无法判断写 null，并在分析里说明原因。
5. 为每道题目撰写一句简洁分析，指出核对结果或解题要点。
6. 为每道题目标注在原图中的位置，在“bounding_box”字段中给出相对坐标，格式如下：
   "bounding_box": { "x": 0.12, "y": 0.34, "width": 0.28, "height": 0.18 }
   其中 x、y、width、height 均为 0~1 之间的小数，分别表示左上角相对宽度、相对高度，以及宽度和高度所占的比例。

请仅返回 JSON，结构如下：
{
  "problems": [
    {
      "question": "题干文字",
      "student_answer": "学生手写答案文字",
      "model_answer": "你的参考答案",
      "is_correct": true/false/null,
      "analysis": "核对说明或解析",
      "bounding_box": { "x": 相对宽度, "y": 相对高度, "width": 相对宽度, "height": 相对高度 }
    }
  ],
  "summary": {
    "total": 题目总数,
    "correct": 正确数量,
    "incorrect": 错误数量,
    "unknown": 无法判断数量
  }
}`;

    const payload = {
        model,
        input: {
            messages: [
                {
                    role: 'system',
                    content: [{ text: systemPrompt }]
                },
                {
                    role: 'user',
                    content: [
                        { image: `data:image/png;base64,${base64Image}` },
                        { text: userPrompt }
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
        throw new Error('Qwen 未返回检查结果。');
    }

    const parsed = parsePhotoCheckJson(text);
    if (!parsed) {
        throw new Error('Qwen 返回结果格式不正确。');
    }

    return parsed;
}

async function reviewPhotoCheckProblemsWithMultipleModels(problems) {
    if (!Array.isArray(problems) || problems.length === 0) {
        return [];
    }

    const attempts = [];

    try {
        const attempt = await reviewPhotoCheckProblemsWithQwen(clonePhotoCheckProblems(problems));
        if (attempt) {
            attempts.push({ ...attempt, provider: attempt.provider || 'qwen' });
        }
    } catch (error) {
        console.warn('Failed to review problems with Qwen', error);
    }

    try {
        const attempt = await reviewPhotoCheckProblemsWithKimi(clonePhotoCheckProblems(problems));
        if (attempt) {
            attempts.push({ ...attempt, provider: attempt.provider || 'kimi' });
        }
    } catch (error) {
        console.warn('Failed to review problems with Kimi', error);
    }

    try {
        const attempt = await reviewPhotoCheckProblemsWithOpenAI(clonePhotoCheckProblems(problems));
        if (attempt) {
            attempts.push({ ...attempt, provider: attempt.provider || 'openai' });
        }
    } catch (error) {
        console.warn('Failed to review problems with OpenAI', error);
    }

    return attempts;
}

async function reviewPhotoCheckProblemsWithQwen(problems) {
    if (!Array.isArray(problems) || problems.length === 0) {
        return createEmptyPhotoCheckAttempt('qwen');
    }

    const apiKey = process.env.DASHSCOPE_API_KEY;
    if (!apiKey) {
        throw new Error('缺少 Qwen API Key 配置。');
    }

    if (typeof fetch !== 'function') {
        throw new Error('当前运行环境不支持向 Qwen 发起请求。');
    }

    const endpoint = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation';
    const model = process.env.QWEN_QA_MODEL || 'qwen-max';

    const systemPrompt =
        '你是一位严谨的中学老师。根据提供的题目文本和学生答案，判断正误并输出结构化 JSON。';
    const userPrompt = buildPhotoCheckTextReviewPrompt(problems);

    const payload = {
        model,
        input: {
            messages: [
                {
                    role: 'system',
                    content: [{ text: systemPrompt }]
                },
                {
                    role: 'user',
                    content: [{ text: userPrompt }]
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
        throw new Error('Qwen 未返回检查结果。');
    }

    const parsed = parsePhotoCheckJson(text);
    if (!parsed) {
        throw new Error('Qwen 返回结果格式不正确。');
    }

    return mergePhotoCheckTextReview(parsed, problems);
}

async function reviewPhotoCheckProblemsWithKimi(problems) {
    if (!Array.isArray(problems) || problems.length === 0) {
        return createEmptyPhotoCheckAttempt('kimi');
    }

    const apiKey = process.env.MOONSHOT_API_KEY;
    if (!apiKey) {
        throw new Error('缺少 Kimi API Key 配置。');
    }

    const endpoint = 'https://api.moonshot.cn/v1/chat/completions';
    const model = 'kimi-k2-turbo-preview';

    const systemPrompt =
        '你是一位严谨的中学老师。根据提供的题目文本和学生答案，判断正误并输出结构化 JSON。';
    const userPrompt = buildPhotoCheckTextReviewPrompt(problems);

    const payload = {
        model,
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ],
        temperature: 0
    };

    const timeoutMs = Number(process.env.MOONSHOT_TIMEOUT_MS) || 20000;

    let requestResult;
    try {
        requestResult = await postJsonWithHttps(endpoint, payload, {
            headers: {
                Authorization: `Bearer ${apiKey}`
            },
            timeoutMs,
            preferIPv4: true
        });
    } catch (error) {
        if (error?.code === 'ETIMEDOUT') {
            throw new Error('连接 Kimi API 超时，请稍后重试。');
        }

        if (error?.code === 'ENOTFOUND' || error?.code === 'EAI_AGAIN') {
            throw new Error('无法解析 Kimi API 域名，请检查网络连接。');
        }

        if (error?.code === 'ECONNRESET' || error?.code === 'ECONNREFUSED') {
            throw new Error('无法连接到 Kimi API，请稍后重试。');
        }

        throw error;
    }

    if (!requestResult.ok) {
        const message =
            requestResult.body?.error?.message ||
            requestResult.body?.message ||
            `Kimi API 请求失败（${requestResult.status}）`;
        throw new Error(message);
    }

    const text = extractTextFromKimiResponse(requestResult.body);
    if (!text) {
        throw new Error('Kimi 未返回检查结果。');
    }

    const parsed = parsePhotoCheckJson(text);
    if (!parsed) {
        throw new Error('Kimi 返回结果格式不正确。');
    }

    return mergePhotoCheckTextReview(parsed, problems);
}

async function reviewPhotoCheckProblemsWithOpenAI(problems) {
    if (!Array.isArray(problems) || problems.length === 0) {
        return createEmptyPhotoCheckAttempt('openai');
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        throw new Error('缺少 OpenAI API Key 配置。');
    }

    const baseUrl = String(process.env.OPENAI_API_BASE || 'https://api.openai.com/v1').replace(/\/$/, '');
    const endpoint = `${baseUrl}/chat/completions`;
    const model = process.env.OPENAI_QA_MODEL || 'gpt-5-mini';
    const timeoutMs = toFiniteNumber(process.env.OPENAI_TIMEOUT_MS) || 36000;

    console.info('Preparing OpenAI text review request', {
        endpoint,
        model,
        timeoutMs,
        problemCount: problems.length
    });

    const systemPrompt =
        '你是一位严谨的中学老师。根据提供的题目文本和学生答案，判断正误并输出结构化 JSON。';
    const userPrompt = buildPhotoCheckTextReviewPrompt(problems);

    const payload = {
        model,
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ],
        // gpt-5-mini does not allow overriding the default temperature, so omit when zero.
        ...(process.env.OPENAI_TEMPERATURE && Number(process.env.OPENAI_TEMPERATURE) !== 0
            ? { temperature: Number(process.env.OPENAI_TEMPERATURE) }
            : {})
    };

    let requestResult;
    try {
        requestResult = await postJsonWithHttps(endpoint, payload, {
            headers: {
                Authorization: `Bearer ${apiKey}`
            },
            timeoutMs,
            preferIPv4: true,
            debugLabel: 'openai:chat-completions'
        });
    } catch (error) {
        console.warn('OpenAI request failed before receiving a response', {
            endpoint,
            model,
            timeoutMs,
            code: error?.code,
            message: error?.message
        });

        if (error?.code === 'ETIMEDOUT') {
            throw new Error('连接 OpenAI API 超时，请稍后重试。');
        }

        if (error?.code === 'ENOTFOUND' || error?.code === 'EAI_AGAIN') {
            throw new Error('无法解析 OpenAI API 域名，请检查网络连接。');
        }

        if (error?.code === 'ECONNRESET' || error?.code === 'ECONNREFUSED') {
            throw new Error('无法连接到 OpenAI API，请稍后重试。');
        }

        throw error;
    }

    if (!requestResult.ok) {
        const message =
            requestResult.body?.error?.message ||
            requestResult.body?.message ||
            `OpenAI API 请求失败（${requestResult.status}）`;
        throw new Error(message);
    }

    console.info('OpenAI request succeeded', {
        status: requestResult.status,
        endpoint,
        model,
        durationMs: requestResult?.headers?.['x-response-time'] || undefined
    });

    const text = extractTextFromOpenAIResponse(requestResult.body);
    if (!text) {
        throw new Error('OpenAI 未返回检查结果。');
    }

    const parsed = parsePhotoCheckJson(text);
    if (!parsed) {
        throw new Error('OpenAI 返回结果格式不正确。');
    }

    return mergePhotoCheckTextReview(parsed, problems);
}

async function postJsonWithHttps(url, payload, options = {}) {
    const { headers = {}, timeoutMs = 20000, preferIPv4 = false, debugLabel = 'https:post' } = options;
    const body = payload === undefined ? '' : JSON.stringify(payload);
    const requestId = randomUUID();
    const startedAt = Date.now();
    const bodyLength = Buffer.byteLength(body);
    const endpoint = new URL(url);

    const requestOptions = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': bodyLength,
            ...headers
        }
    };

    if (preferIPv4 && typeof preferIPv4Lookup === 'function') {
        requestOptions.lookup = preferIPv4Lookup;
    }

    console.info(`[${debugLabel}] (${requestId}) Sending POST request`, {
        host: endpoint.host,
        path: endpoint.pathname,
        timeoutMs,
        preferIPv4,
        bodyBytes: bodyLength
    });

    return new Promise((resolve, reject) => {
        const req = https.request(url, requestOptions, (res) => {
            let raw = '';
            res.setEncoding('utf8');

            res.on('data', (chunk) => {
                raw += chunk;
            });

            res.on('end', () => {
                const durationMs = Date.now() - startedAt;
                const parsed = safeJsonParse(raw);
                console.info(`[${debugLabel}] (${requestId}) Received response`, {
                    status: res.statusCode,
                    durationMs,
                    contentLength: raw.length,
                    host: endpoint.host,
                    path: endpoint.pathname
                });

                resolve({
                    ok: res.statusCode >= 200 && res.statusCode < 300,
                    status: res.statusCode,
                    headers: res.headers,
                    body: parsed,
                    rawBody: raw
                });
            });

            res.on('error', (error) => {
                const durationMs = Date.now() - startedAt;
                console.warn(`[${debugLabel}] (${requestId}) Response stream error`, {
                    message: error?.message,
                    code: error?.code,
                    durationMs,
                    host: endpoint.host,
                    path: endpoint.pathname
                });
                reject(error);
            });
        });

        req.on('error', (error) => {
            const durationMs = Date.now() - startedAt;
            if (error && error.code === 'ETIMEDOUT') {
                error.message = `请求 ${url} 超时（>${timeoutMs}ms）`;
            }

            console.warn(`[${debugLabel}] (${requestId}) Request error`, {
                message: error?.message,
                code: error?.code,
                durationMs,
                host: endpoint.host,
                path: endpoint.pathname
            });

            reject(error);
        });

        if (timeoutMs > 0) {
            req.setTimeout(timeoutMs, () => {
                const durationMs = Date.now() - startedAt;
                console.warn(`[${debugLabel}] (${requestId}) Request timed out`, {
                    timeoutMs,
                    durationMs,
                    host: endpoint.host,
                    path: endpoint.pathname
                });
                req.destroy(
                    Object.assign(new Error(`请求 ${url} 超时（>${timeoutMs}ms）`), { code: 'ETIMEDOUT' })
                );
            });
        }

        req.end(body);
    });
}

function safeJsonParse(text) {
    if (!text) {
        return {};
    }

    try {
        return JSON.parse(text);
    } catch (error) {
        console.warn('Failed to parse JSON response', text);
        return {};
    }
}

function extractTextFromKimiResponse(result) {
    if (!result) return '';

    const choices = Array.isArray(result.choices) ? result.choices : [];
    for (const choice of choices) {
        const message = choice?.message;
        if (typeof message?.content === 'string') {
            return message.content.trim();
        }

        if (Array.isArray(message?.content)) {
            const parts = message.content
                .map((part) => (typeof part === 'string' ? part : part?.text || ''))
                .filter(Boolean)
                .join('');
            if (parts) {
                return parts.trim();
            }
        }
    }

    if (typeof result?.data === 'string') {
        return result.data.trim();
    }

    return '';
}

function extractTextFromOpenAIResponse(result) {
    if (!result) return '';

    const choices = Array.isArray(result.choices) ? result.choices : [];
    for (const choice of choices) {
        const message = choice?.message;
        if (typeof message?.content === 'string' && message.content.trim()) {
            return message.content.trim();
        }

        if (Array.isArray(message?.content)) {
            const parts = message.content
                .map((part) => (typeof part === 'string' ? part : part?.text || ''))
                .filter(Boolean)
                .join('');
            if (parts) {
                return parts.trim();
            }
        }
    }

    return '';
}

function buildPhotoCheckTextReviewPrompt(problems) {
    const input = {
        problems: problems.map((problem) => ({
            index: Number(problem.index) || 0,
            question: sanitizePhotoCheckText(problem.question),
            student_answer: sanitizePhotoCheckText(problem.studentAnswer),
            previous_model_answer: sanitizePhotoCheckText(problem.solvedAnswer),
            previous_analysis: sanitizePhotoCheckText(problem.analysis)
        }))
    };

    return [
        '请根据以下 OCR 识别得到的题目文本和学生手写答案，逐题核对作答是否正确。',
        '要求：',
        '1. 按照题目给出的 index 顺序返回结果，不要增删题目。',
        '2. 每题需给出 model_answer（你的标准答案）和简洁的 analysis（核对说明或解题要点）。',
        '3. 对学生答案的判断写在 is_correct 字段：正确为 true，错误为 false，无法判断为 null。',
        '4. 仅返回 JSON，格式如下：',
        '{',
        '  "problems": [',
        '    { "index": 1, "model_answer": "", "analysis": "", "is_correct": true/false/null }',
        '  ],',
        '  "summary": { "total": 题目数, "correct": 正确数, "incorrect": 错误数, "unknown": 未知数 }',
        '}',
        '以下是题目信息：',
        JSON.stringify(input, null, 2)
    ].join('\n');
}

function mergePhotoCheckTextReview(raw, baseProblems) {
    const normalized = normalizePhotoCheckAnalysis(raw);
    const overrides = new Map();

    normalized.problems.forEach((problem) => {
        if (problem && Number.isFinite(Number(problem.index))) {
            overrides.set(Number(problem.index), problem);
        }
    });

    const mergedProblems = Array.isArray(baseProblems)
        ? baseProblems.map((base) => {
              const override = overrides.get(base.index) || null;
              const cloned = clonePhotoCheckProblem(base);
              if (!override) {
                  return cloned;
              }

              if (override.solvedAnswer) {
                  cloned.solvedAnswer = override.solvedAnswer;
              }
              if (override.analysis) {
                  cloned.analysis = override.analysis;
              }
              if (override.isCorrect != null) {
                  cloned.isCorrect = override.isCorrect;
              }

              return cloned;
          })
        : [];

    const summaryInput = raw?.summary || {};
    let total = toFiniteNumber(summaryInput.total);
    let correct = toFiniteNumber(summaryInput.correct);
    let incorrect = toFiniteNumber(summaryInput.incorrect);
    let unknown = toFiniteNumber(summaryInput.unknown);

    if (!Number.isFinite(total)) {
        total = mergedProblems.length;
    }

    if (!Number.isFinite(correct)) {
        correct = mergedProblems.filter((problem) => problem.isCorrect === true).length;
    }

    if (!Number.isFinite(incorrect)) {
        incorrect = mergedProblems.filter((problem) => problem.isCorrect === false).length;
    }

    if (!Number.isFinite(unknown)) {
        unknown = Math.max(0, total - correct - incorrect);
    }

    total = Math.max(total, mergedProblems.length);

    return {
        problems: mergedProblems,
        summary: {
            total,
            correct,
            incorrect,
            unknown
        }
    };
}

function normalizePhotoCheckAttemptSummary(summary) {
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

function clonePhotoCheckProblems(problems) {
    if (!Array.isArray(problems)) {
        return [];
    }

    return problems
        .map((problem) => clonePhotoCheckProblem(problem))
        .filter((problem) => problem != null);
}

function clonePhotoCheckProblem(problem) {
    if (!problem || typeof problem !== 'object') {
        return null;
    }

    const boundingBox = problem.boundingBox ? { ...problem.boundingBox } : null;
    const image = problem.image
        ? {
              ...problem.image,
              boundingBox: problem.image.boundingBox ? { ...problem.image.boundingBox } : null
          }
        : null;

    let isCorrect = null;
    if (problem.isCorrect === true) {
        isCorrect = true;
    } else if (problem.isCorrect === false) {
        isCorrect = false;
    }

    return {
        index: problem.index,
        question: sanitizePhotoCheckText(problem.question),
        studentAnswer: sanitizePhotoCheckText(problem.studentAnswer),
        solvedAnswer: sanitizePhotoCheckText(problem.solvedAnswer),
        analysis: sanitizePhotoCheckText(problem.analysis),
        isCorrect,
        boundingBox,
        image
    };
}

function parsePhotoCheckJson(text) {
    if (!text) return null;
    const cleaned = text
        .replace(/```json/gi, '```')
        .replace(/```/g, '')
        .trim();

    try {
        return JSON.parse(cleaned);
    } catch (error) {
        // fall through
    }

    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) {
        return null;
    }

    const candidate = cleaned.slice(start, end + 1);
    try {
        return JSON.parse(candidate);
    } catch (error) {
        return null;
    }
}

function normalizePhotoCheckAnalysis(raw) {
    const problemsInput = Array.isArray(raw?.problems)
        ? raw.problems
        : Array.isArray(raw?.items)
        ? raw.items
        : [];

    const normalizedProblems = problemsInput
        .map((item, index) => normalizePhotoCheckProblem(item, index))
        .filter(Boolean);

    const summary = raw?.summary || {};
    const inferredTotal = normalizedProblems.length;
    const summaryTotalValue = Number(summary.total);
    const summaryCorrectValue = Number(summary.correct);
    const summaryIncorrectValue = Number(summary.incorrect);
    const summaryUnknownValue = Number(summary.unknown);
    const summaryTotal = Number.isFinite(summaryTotalValue) ? summaryTotalValue : inferredTotal;
    const total = Math.max(summaryTotal, inferredTotal);
    const summaryCorrect = Number.isFinite(summaryCorrectValue) ? summaryCorrectValue : null;
    const summaryIncorrect = Number.isFinite(summaryIncorrectValue) ? summaryIncorrectValue : null;
    const summaryUnknown = Number.isFinite(summaryUnknownValue) ? summaryUnknownValue : null;

    const correct =
        summaryCorrect != null
            ? summaryCorrect
            : normalizedProblems.filter((problem) => problem.isCorrect === true).length;
    const incorrect =
        summaryIncorrect != null
            ? summaryIncorrect
            : normalizedProblems.filter((problem) => problem.isCorrect === false).length;
    const unknown =
        summaryUnknown != null
            ? summaryUnknown
            : Math.max(0, total - correct - incorrect);

    return {
        problems: normalizedProblems,
        summary: {
            total,
            correct,
            incorrect,
            unknown
        }
    };
}

function createEmptyPhotoCheckAttempt(provider) {
    return {
        provider: provider || null,
        problems: [],
        summary: {
            total: 0,
            correct: 0,
            incorrect: 0,
            unknown: 0
        }
    };
}

function normalizePhotoCheckProblem(problem, index) {
    if (!problem || typeof problem !== 'object') {
        return null;
    }

    const question = sanitizePhotoCheckText(problem.question ?? problem.question_text ?? problem.prompt);
    const studentAnswer = sanitizePhotoCheckText(
        problem.student_answer ??
            problem.studentAnswer ??
            problem.student_response ??
            problem.studentResponse
    );
    const modelAnswer = sanitizePhotoCheckText(
        problem.model_answer ??
            problem.modelAnswer ??
            problem.solution ??
            problem.referenceAnswer ??
            problem.answer
    );
    const analysis = sanitizePhotoCheckText(
        problem.analysis ?? problem.feedback ?? problem.reason ?? problem.explanation ?? problem.notes
    );
    const isCorrect = parsePhotoCheckBoolean(
        problem.is_correct ?? problem.isCorrect ?? problem.correct ?? problem.verdict ?? problem.check
    );
    const boundingBox = normalizePhotoCheckBoundingBox(
        problem.bounding_box ??
            problem.boundingBox ??
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

    if (!question && !studentAnswer && !modelAnswer && !analysis && !image) {
        return null;
    }

    return {
        index: index + 1,
        question,
        studentAnswer,
        solvedAnswer: modelAnswer,
        analysis,
        isCorrect,
        boundingBox,
        image
    };
}

function sanitizePhotoCheckText(value) {
    if (value == null) {
        return '';
    }
    const text = Array.isArray(value) ? value.join('\n') : String(value);
    return text
        .replace(/\r\n/g, '\n')
        .replace(/[\u3000\u00A0]/g, ' ')
        .replace(/\s+$/gm, '')
        .trim();
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

    const input = coerceBoundingBoxInput(raw);
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
        left = clamp(left, 0, 1);
        top = clamp(top, 0, 1);
        width = clamp(width, 0, 1);
        height = clamp(height, 0, 1);
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
    const confidence = confidenceValue != null ? clamp(confidenceValue, 0, 1) : null;

    return {
        left,
        top,
        width,
        height,
        unit,
        confidence
    };
}

function coerceBoundingBoxInput(raw) {
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
                return coerceBoundingBoxInput(parsed);
            }
        }
        const parts = trimmed.split(/[,\s]+/).filter(Boolean);
        if (parts.length >= 4) {
            const numbers = parts.slice(0, 4).map(toFiniteNumber);
            if (numbers.every((value) => Number.isFinite(value))) {
                return coerceBoundingBoxInput(numbers);
            }
        }
        return null;
    }

    if (typeof raw === 'object') {
        return raw;
    }

    return null;
}

function safeJsonParse(value) {
    try {
        return JSON.parse(value);
    } catch (error) {
        return null;
    }
}

function toFiniteNumber(value) {
    if (value == null || value === '') {
        return null;
    }
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function parsePhotoCheckBoolean(value) {
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
        if (['正确', '对', '对的', '是', 'yes', 'true', '回答正确', '无误', 'right', 'correct'].includes(normalized)) {
            return true;
        }
        if (['错误', '错', '错的', '否', 'no', 'false', '需要复查', '不对', 'wrong', 'incorrect'].includes(normalized)) {
            return false;
        }
    }
    return null;
}

app.put(
    '/api/entries/:id',
    upload.fields([
        { name: 'questionImage', maxCount: 1 },
        { name: 'answerImage', maxCount: 1 }
    ]),
    async (req, res) => {
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

            const existingEntry = entries[index];
            const questionFile = Array.isArray(req.files?.questionImage) ? req.files.questionImage[0] : null;
            const answerFile = Array.isArray(req.files?.answerImage) ? req.files.answerImage[0] : null;

            const updatedEntry = {
                ...existingEntry,
                source: (req.body.source || '').trim(),
                subject: (req.body.subject || '').trim(),
                semester: (req.body.semester || '').trim(),
                questionType: (req.body.questionType || '').trim(),
                questionText: (req.body.questionText || '').trim(),
                answerText: (req.body.answerText || '').trim(),
                errorReason: (req.body.errorReason || '').trim(),
                remark: (req.body.remark || '').trim(),
                createdAt: normalizeDateInput(req.body.createdAt, existingEntry.createdAt),
                updatedAt: new Date().toISOString()
            };

            if (questionFile) {
                const filePath = questionFile.path || path.join(UPLOADS_DIR, questionFile.filename);
                const photoInfo = await finalizePhotoStorage(filePath, questionFile.filename);
                await removeMedia(existingEntry.questionImageUrl, existingEntry.questionImageResizedUrl);
                updatedEntry.questionImageUrl = photoInfo.photoUrl;
                updatedEntry.questionImageResizedUrl = photoInfo.photoResizedUrl;
                const questionScale = parseScale(photoInfo.photoScale);
                if (questionScale !== null) {
                    updatedEntry.questionImageScale = questionScale;
                }
            }

            if (answerFile) {
                const filePath = answerFile.path || path.join(UPLOADS_DIR, answerFile.filename);
                const photoInfo = await finalizePhotoStorage(filePath, answerFile.filename);
                await removeMedia(existingEntry.answerImageUrl, existingEntry.answerImageResizedUrl);
                updatedEntry.answerImageUrl = photoInfo.photoUrl;
                updatedEntry.answerImageResizedUrl = photoInfo.photoResizedUrl;
                const answerScale = parseScale(photoInfo.photoScale);
                if (answerScale !== null) {
                    updatedEntry.answerImageScale = answerScale;
                }
            }

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
    }
);

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

        const mode = req.body?.mode === 'question-only' ? 'question-only' : 'detailed';
        const { buffer: docBuffer, updatedEntryIds } = await createPaperExport(selectedEntries, { mode });
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
    await verifyExternalConnections();
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
        questionText: sanitizeRichText(body.questionText || ''),
        answerText: sanitizeRichText(body.answerText || ''),
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

    if (!hasRichTextContent(entry.questionText) && !hasQuestionImageInput) {
        throw new Error('题目内容需要文字或图片。');
    }

    if (!hasRichTextContent(entry.answerText) && !hasAnswerImageInput) {
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
    await fsp.mkdir(PHOTO_CHECK_DIR, { recursive: true });
    await fsp.mkdir(PHOTO_CHECK_RECORDS_DIR, { recursive: true });
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

async function savePhotoCheckRecord(result) {
    if (!result || typeof result !== 'object') {
        throw new Error('无法保存拍照检查记录：结果为空。');
    }

    await ensureDirectories();

    const id = `pc-${Date.now()}-${randomUUID()}`;
    const createdAt = new Date().toISOString();

    const alias = normalizeHistoryAlias(result.alias ?? '');

    const record = {
        id,
        createdAt,
        totalImages: Number(result.totalImages) || 0,
        overall: result.overall || { total: 0, correct: 0, incorrect: 0, unknown: 0 },
        alias: alias || null,
        results: Array.isArray(result.results) ? result.results : [],
        problems: Array.isArray(result.problems) ? result.problems : []
    };

    const filePath = path.join(PHOTO_CHECK_RECORDS_DIR, `${id}.json`);
    await fsp.writeFile(filePath, JSON.stringify(record, null, 2), 'utf8');

    await updatePhotoCheckHistory(record);

    return record;
}

async function readPhotoCheckHistoryList() {
    await ensureDirectories();

    try {
        const raw = await fsp.readFile(PHOTO_CHECK_HISTORY_FILE, 'utf8');
        if (!raw.trim()) {
            return [];
        }

        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        if (error.code === 'ENOENT') {
            return [];
        }
        throw error;
    }
}

async function writePhotoCheckHistoryList(history) {
    await ensureDirectories();
    await fsp.writeFile(PHOTO_CHECK_HISTORY_FILE, JSON.stringify(history, null, 2), 'utf8');
}

function normalizeHistoryAlias(value) {
    if (typeof value !== 'string') {
        return '';
    }

    const normalized = value.replace(/\s+/g, ' ').trim();
    if (!normalized) {
        return '';
    }

    return normalized.slice(0, 100);
}

async function updatePhotoCheckRecordAlias(id, alias) {
    const filePath = path.join(PHOTO_CHECK_RECORDS_DIR, `${id}.json`);
    const raw = await fsp.readFile(filePath, 'utf8');
    const record = raw.trim() ? JSON.parse(raw) : {};
    const normalized = normalizeHistoryAlias(alias ?? '');
    record.alias = normalized || null;
    await fsp.writeFile(filePath, JSON.stringify(record, null, 2), 'utf8');
}

async function updatePhotoCheckHistory(record) {
    const alias = normalizeHistoryAlias(record.alias ?? '');
    const metadata = {
        id: record.id,
        createdAt: record.createdAt,
        totalImages: record.totalImages,
        problems: Array.isArray(record.problems) ? record.problems.length : 0,
        overall: record.overall || { total: 0, correct: 0, incorrect: 0, unknown: 0 },
        alias: alias || null
    };

    const history = await readPhotoCheckHistoryList();
    history.unshift(metadata);

    if (history.length > 200) {
        history = history.slice(0, 200);
    }

    await writePhotoCheckHistoryList(history);
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
    const text = richTextToPlainText(typeof questionText === 'string' ? questionText : '');
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

        const hasQuestionText = hasRichTextContent(entry.questionText);
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

async function createPaperExport(entries, options = {}) {
    if (!Array.isArray(entries) || !entries.length) {
        throw new Error('No entries to export');
    }

    const mode = options.mode === 'question-only' ? 'question-only' : 'detailed';
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

        if (mode !== 'question-only') {
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
        }

        const hasQuestionText = hasRichTextContent(entry.questionText);
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
        const normalizedScale =
            scaleOption === null ? 1 : Math.min(Math.max(scaleOption, MIN_IMAGE_SCALE), 1);

        const { data, info } = await sharp(filePath, { failOnError: false })
            .rotate()
            .toBuffer({ resolveWithObject: true });
        let { width, height } = info;
        if (width && height) {
            let targetWidth = width * normalizedScale;
            let targetHeight = height * normalizedScale;
            const maxWidth = baseMaxWidth;
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

function replaceWithScript(text, pattern, map) {
    return text.replace(pattern, (match, grouped, simple) => {
        const content = (grouped || simple || '').trim();
        if (!content) return '';
        let transformed = '';
        for (const char of content) {
            transformed += map.get(char) || char;
        }
        return transformed;
    });
}

function replaceLatexSymbols(text) {
    return text.replace(/\\([a-zA-Z]+|.)/g, (match, name) => {
        const command = `\\${name}`;
        const replacement = LATEX_SYMBOL_MAP.get(command);
        return replacement || match;
    });
}

function normalizeMathText(text) {
    if (!text) return '';
    let normalized = text;
    normalized = normalized.replace(/\$\$?|\\\(|\\\)|\\\[|\\\]/g, '');
    normalized = normalized.replace(/\\frac\s*\{([^}]*)\}\s*\{([^}]*)\}/g, '($1)/($2)');
    normalized = normalized.replace(/\\sqrt\s*\{([^}]*)\}/g, '√($1)');
    normalized = normalized.replace(/\\cdot/g, '·');
    normalized = replaceLatexSymbols(normalized);
    normalized = replaceWithScript(normalized, /\^\{([^}]+)\}|\^(\S)/g, SUPERSCRIPT_MAP);
    normalized = replaceWithScript(normalized, /_\{([^}]+)\}|_(\S)/g, SUBSCRIPT_MAP);
    normalized = normalized.replace(/\s+/g, ' ').trim();
    return normalized;
}

function richTextToDocxText(html) {
    const plain = richTextToPlainText(html);
    if (!plain) return '';
    return normalizeMathText(plain);
}

function createLabeledParagraph(label, text, options = {}) {
    const { skipWhenEmpty = false, fallback = '（未填写）' } = options;
    const value = richTextToDocxText(text);
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
    const value = richTextToDocxText(text);
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

function sanitizeRichText(value) {
    if (!value) return '';
    let cleaned = String(value);
    cleaned = cleaned.replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '');
    cleaned = cleaned.replace(/on\w+\s*=\s*"[^"]*"/gi, '');
    cleaned = cleaned.replace(/on\w+\s*=\s*'[^']*'/gi, '');
    cleaned = cleaned.replace(/on\w+\s*=\s*[^\s>]+/gi, '');
    cleaned = cleaned.replace(/<\s*\/??\s*([a-z0-9-]+)([^>]*)>/gi, (match, tag) => {
        const normalizedTag = tag.toLowerCase();
        if (!ALLOWED_RICH_TEXT_TAGS.has(normalizedTag)) {
            return '';
        }
        const isClosing = /^<\s*\//.test(match);
        return isClosing ? `</${normalizedTag}>` : `<${normalizedTag}>`;
    });
    return cleaned.trim();
}

function richTextToPlainText(html) {
    if (!html) return '';
    const safe = sanitizeRichText(html);
    const replaced = safe
        .replace(/<\s*br\s*\/?\s*>/gi, '\n')
        .replace(/<\/(p|div)>/gi, '\n')
        .replace(/<\s*li\s*>/gi, '\n• ')
        .replace(/<\/(ul|ol)>/gi, '\n');
    return replaced.replace(/<[^>]+>/g, '').replace(/\n{2,}/g, '\n').trim();
}

function hasRichTextContent(html) {
    return richTextToPlainText(html).trim().length > 0;
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

