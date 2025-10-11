# WuBook – Personal Error Book

WuBook is a lightweight web application designed to help you capture, review, and learn from your child's mistakes in math, physics, and physical exercises. Add detailed notes, attach photos, and keep everything searchable in one place.

## Features

- 📚 **Structured entries** – Track subject, exercise title, description, reason, corrective notes, tags, and timestamps.
- 🖼️ **Photo attachments** – Add snapshots of worksheets or physical activities.
- 🔍 **Smart suggestions** – Find similar exercises with built-in text similarity (no external services required).
- 🧭 **Powerful filters** – Search by keyword and filter by subject.
- 💾 **File-based storage** – Entries and photos are stored on disk for easy backup.
- 📤 **Import & export** – Backup entries to JSON and import them later.
- ✏️ **Inline editing** – Update notes as your child improves.

## Getting started

1. Download or clone this repository.
2. Install dependencies: `npm install`.
3. Start the server: `npm start` (defaults to <http://localhost:3000>).
4. Open the app in your browser and start logging mistakes.

All data lives in the `data/` directory alongside the app:

- `data/entries.json` – JSON array containing every entry.
- `data/uploads/` – Photo files saved with unique names.

To back up or migrate WuBook, copy the entire `data/` folder. The in-app export button also produces a JSON backup that includes embedded photo data, which can be re-imported later on a fresh installation.

## Tips

- Use descriptive tags such as `fractions`, `careless`, or `timing` to make filters more powerful.
- Export regularly so you can share the archive or keep a cloud backup.
- The similarity finder works best when the description, reason, and notes contain meaningful context.

## Tech stack

This project uses a lightweight Node.js server (Express + Multer) to accept uploads and persist data, while the interface remains a modern vanilla HTML, CSS, and JavaScript application.
