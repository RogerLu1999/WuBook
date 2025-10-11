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

