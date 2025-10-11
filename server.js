const express = require('express');
const path = require('path');
const fsp = require('fs/promises');
const multer = require('multer');
const sharp = require('sharp');
const { randomUUID } = require('crypto');

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
const PDF_PAGE_WIDTH = 595.28;
const PDF_PAGE_HEIGHT = 841.89;
const PDF_MARGIN = 36;

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

app.post('/api/entries', upload.single('photo'), async (req, res) => {
    try {
        const entry = await buildEntry(req.body, req.file);
        const entries = await readEntries();
        entries.unshift(entry);
        await writeEntries(entries);
        await logAction('create-entry', 'success', {
            id: entry.id,
            subject: entry.subject,
            photo: Boolean(entry.photoUrl)
        });
        res.status(201).json(entry);
    } catch (error) {
        console.error(error);
        await logAction('create-entry', 'error', { message: error.message });
        res.status(500).json({ error: 'Failed to save entry' });
    }
});

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

        entries[index] = {
            ...entries[index],
            subject: (req.body.subject || '').trim(),
            title: (req.body.title || '').trim(),
            description: (req.body.description || '').trim(),
            reason: (req.body.reason || '').trim(),
            comments: (req.body.comments || '').trim(),
            tags: parseTags(req.body.tags),
            updatedAt: new Date().toISOString()
        };

        await writeEntries(entries);
        await logAction('update-entry', 'success', {
            id: entries[index].id,
            subject: entries[index].subject
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
        await removePhoto(removed.photoUrl, removed.photoResizedUrl);
        await writeEntries(entries);
        await logAction('delete-entry', 'success', {
            id: removed.id,
            subject: removed.subject
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
            await removePhoto(entry.photoUrl, entry.photoResizedUrl);
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
            if (!raw || !raw.title || !raw.subject) continue;
            const entry = await buildEntryFromImport(raw);
            if (existingIds.has(entry.id)) continue;
            existing.push(entry);
            existingIds.add(entry.id);
            added += 1;
        }

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

        const printablePages = await buildPrintablePages(selectedEntries);
        if (!printablePages.length) {
            await logAction('export-entries', 'error', { message: 'No printable photos', requested: selectedEntries.length });
            return res.status(400).json({ error: 'None of the selected entries have printable photos.' });
        }

        const pdfBuffer = await createPdfFromImages(printablePages);
        const filename = `wubook-selection-${new Date().toISOString().split('T')[0]}.pdf`;

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        await logAction('export-entries', 'success', { count: printablePages.length });
        res.send(pdfBuffer);
    } catch (error) {
        console.error(error);
        await logAction('export-entries', 'error', { message: error.message });
        res.status(500).json({ error: 'Failed to generate PDF export.' });
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
    console.log(`WuBook server running on http://localhost:${PORT}`);
});

async function buildEntry(body, file) {
    const now = new Date().toISOString();
    const entry = {
        id: body.id && typeof body.id === 'string' ? body.id : randomUUID(),
        subject: (body.subject || '').trim(),
        title: (body.title || '').trim(),
        description: (body.description || '').trim(),
        reason: (body.reason || '').trim(),
        comments: (body.comments || '').trim(),
        tags: parseTags(body.tags),
        photoUrl: null,
        photoResizedUrl: null,
        createdAt: body.createdAt || now,
        updatedAt: now
    };
    if (file) {
        const filePath = file.path || path.join(UPLOADS_DIR, file.filename);
        const photoInfo = await finalizePhotoStorage(filePath, file.filename);
        entry.photoUrl = photoInfo.photoUrl;
        entry.photoResizedUrl = photoInfo.photoResizedUrl;
    }

    return entry;
}

async function buildEntryFromImport(raw) {
    const entry = await buildEntry(raw, null);
    entry.id = raw.id || entry.id;
    entry.createdAt = raw.createdAt || entry.createdAt;
    entry.updatedAt = raw.updatedAt || entry.updatedAt;

    if (raw.photoDataUrl && !entry.photoUrl) {
        const photoInfo = await saveDataUrl(raw.photoDataUrl, entry.id);
        entry.photoUrl = photoInfo.photoUrl;
        entry.photoResizedUrl = photoInfo.photoResizedUrl;
    } else if (raw.photo && !entry.photoUrl) {
        const photoInfo = await saveDataUrl(raw.photo, entry.id);
        entry.photoUrl = photoInfo.photoUrl;
        entry.photoResizedUrl = photoInfo.photoResizedUrl;
    } else if (raw.photoUrl) {
        entry.photoUrl = raw.photoUrl;
        if (raw.photoResizedUrl) {
            entry.photoResizedUrl = raw.photoResizedUrl;
        } else if (raw.photoUrl.startsWith('/uploads/')) {
            const relative = raw.photoUrl.slice(1);
            const sourcePath = path.join(ROOT_DIR, relative);
            try {
                const resized = await generateResizedVariant(sourcePath);
                entry.photoResizedUrl = resized;
            } catch (error) {
                console.warn('Unable to regenerate resized photo during import', error);
            }
        }
    }

    return entry;
}

function parseTags(raw) {
    if (Array.isArray(raw)) {
        return raw.map((tag) => String(tag).trim().toLowerCase()).filter(Boolean);
    }

    return String(raw || '')
        .split(',')
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean);
}

async function readEntries() {
    try {
        await ensureDirectories();
        const data = await fsp.readFile(ENTRIES_FILE, 'utf8');
        const parsed = JSON.parse(data);
        if (!Array.isArray(parsed)) return [];
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

async function removePhoto(photoUrl, photoResizedUrl) {
    const targets = [photoUrl, photoResizedUrl].filter(Boolean);
    for (const target of targets) {
        const relative = target.startsWith('/') ? target.slice(1) : target;
        const filePath = path.join(ROOT_DIR, relative);
        try {
            await fsp.unlink(filePath);
        } catch (error) {
            if (error.code !== 'ENOENT') {
                console.warn('Failed to remove photo', error);
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

async function buildPrintablePages(entries) {
    const pages = [];

    for (const entry of entries) {
        const imagePath = await resolvePrintableImage(entry);
        if (!imagePath) continue;

        try {
            const { data, info } = await sharp(imagePath)
                .rotate()
                .flatten({ background: '#ffffff' })
                .jpeg({ quality: 95 })
                .toBuffer({ resolveWithObject: true });

            if (!info.width || !info.height) {
                continue;
            }

            pages.push({
                entry,
                image: data,
                width: info.width,
                height: info.height
            });
        } catch (error) {
            console.warn('Failed to prepare image for PDF export', imagePath, error);
        }
    }

    return pages;
}

async function resolvePrintableImage(entry) {
    const candidates = [entry.photoResizedUrl, entry.photoUrl];

    for (const candidate of candidates) {
        const resolved = await resolveUploadPath(candidate);
        if (resolved) {
            return resolved;
        }
    }

    return null;
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

async function createPdfFromImages(pages) {
    if (!Array.isArray(pages) || !pages.length) {
        throw new Error('No pages provided for PDF generation');
    }

    const header = Buffer.from('%PDF-1.4\n%âãÏÓ\n');
    const objects = [];
    let nextObjectId = 1;

    const appendObject = (buffer) => {
        objects.push(buffer);
    };

    const createDictionaryObject = (entries) => {
        const id = nextObjectId++;
        const parts = Object.entries(entries)
            .filter(([, value]) => value !== undefined && value !== null)
            .map(([key, value]) => `/${key} ${value}`)
            .join(' ');
        const dict = parts.length ? `<< ${parts} >>\n` : '<< >>\n';
        appendObject(Buffer.from(`${id} 0 obj\n${dict}endobj\n`));
        return id;
    };

    const createStreamObject = (entries, streamBuffer) => {
        const id = nextObjectId++;
        const parts = Object.entries(entries)
            .filter(([, value]) => value !== undefined && value !== null)
            .map(([key, value]) => `/${key} ${value}`)
            .join(' ');
        const dict = parts.length
            ? `<< ${parts} /Length ${streamBuffer.length} >>\n`
            : `<< /Length ${streamBuffer.length} >>\n`;
        appendObject(
            Buffer.concat([
                Buffer.from(`${id} 0 obj\n${dict}stream\n`),
                streamBuffer,
                Buffer.from('\nendstream\nendobj\n')
            ])
        );
        return id;
    };

    const pageObjectIds = [];
    const expectedPagesObjectId = pages.length * 3 + 1;

    const availableWidth = PDF_PAGE_WIDTH - PDF_MARGIN * 2;
    const availableHeight = PDF_PAGE_HEIGHT - PDF_MARGIN * 2;

    pages.forEach((page, index) => {
        if (!page.width || !page.height) {
            return;
        }

        const imageObjectId = createStreamObject(
            {
                Type: '/XObject',
                Subtype: '/Image',
                Width: Math.max(1, Math.round(page.width)),
                Height: Math.max(1, Math.round(page.height)),
                ColorSpace: '/DeviceRGB',
                BitsPerComponent: 8,
                Filter: '/DCTDecode'
            },
            page.image
        );

        const scale = Math.min(availableWidth / page.width, availableHeight / page.height);
        const renderWidth = page.width * scale;
        const renderHeight = page.height * scale;
        const offsetX = PDF_MARGIN + (availableWidth - renderWidth) / 2;
        const offsetY = PDF_MARGIN + (availableHeight - renderHeight) / 2;

        const contentCommands = [
            'q',
            `${renderWidth.toFixed(2)} 0 0 ${renderHeight.toFixed(2)} ${offsetX.toFixed(2)} ${offsetY.toFixed(2)} cm`,
            `/Im${index} Do`,
            'Q',
            ''
        ].join('\n');

        const contentObjectId = createStreamObject({}, Buffer.from(contentCommands));
        const resources = `<< /ProcSet [/PDF /ImageC] /XObject << /Im${index} ${imageObjectId} 0 R >> >>`;

        const pageObjectId = createDictionaryObject({
            Type: '/Page',
            Parent: `${expectedPagesObjectId} 0 R`,
            MediaBox: `[0 0 ${PDF_PAGE_WIDTH.toFixed(2)} ${PDF_PAGE_HEIGHT.toFixed(2)}]`,
            Resources: resources,
            Contents: `${contentObjectId} 0 R`
        });

        pageObjectIds.push(pageObjectId);
    });

    if (!pageObjectIds.length) {
        throw new Error('No valid images available for PDF export');
    }

    const kids = pageObjectIds.map((id) => `${id} 0 R`).join(' ');
    const pagesObjectId = createDictionaryObject({
        Type: '/Pages',
        Count: pageObjectIds.length,
        Kids: `[${kids}]`
    });

    if (pagesObjectId !== expectedPagesObjectId) {
        throw new Error('PDF object alignment mismatch');
    }

    const catalogObjectId = createDictionaryObject({
        Type: '/Catalog',
        Pages: `${pagesObjectId} 0 R`
    });

    const buffers = [header];
    const offsets = [0];
    let offset = header.length;

    objects.forEach((buffer) => {
        offsets.push(offset);
        buffers.push(buffer);
        offset += buffer.length;
    });

    const xrefOffset = offset;
    const xrefLines = ['xref', `0 ${objects.length + 1}`, '0000000000 65535 f '];
    for (let index = 1; index <= objects.length; index += 1) {
        xrefLines.push(`${offsets[index].toString().padStart(10, '0')} 00000 n `);
    }
    xrefLines.push('');
    buffers.push(Buffer.from(xrefLines.join('\n')));

    const trailer = Buffer.from(
        `trailer\n<< /Size ${objects.length + 1} /Root ${catalogObjectId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
    );
    buffers.push(trailer);

    return Buffer.concat(buffers);
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

