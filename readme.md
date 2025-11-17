# Wu(悟)Book – Personal Error Book

Wu(悟)Book is a lightweight web application designed to help you capture, review, and learn from your child's mistakes in math, physics, and physical exercises. Add detailed notes, attach photos, and keep everything searchable in one place.

## Features

- 📚 **Structured entries** – Track subject, exercise title, description, reason, corrective notes, tags, and timestamps.
- 🖼️ **Photo attachments** – Add snapshots of worksheets or physical activities, with an automatic print-friendly copy sized to 80% of A4 width.
- 🧮 **公式识别** – Upload a formula photo and let Qwen convert it into LaTeX/MathML that can be copied into Word or screenshot for sharing.
- 🔍 **Smart suggestions** – Find similar exercises with built-in text similarity (no external services required).
- 🧭 **Powerful filters** – Search by keyword and filter by subject.
- 💾 **File-based storage** – Entries and photos are stored on disk for easy backup.
- 📤 **Import & export** – Backup entries to JSON and import them later.
- ✏️ **Inline editing** – Update notes as your child improves.

## Getting started

### Prerequisites

- [Node.js](https://nodejs.org/) 18 or newer (the `npm` CLI ships with Node).
- macOS, Windows, or Linux with permission to write to the repository folder (the app saves data to disk).
- No extra native dependencies are required. The OCR feature relies on the Qwen multimodal API—set the `DASHSCOPE_API_KEY` environment variable to enable cloud recognition without installing additional libraries.

### Run the app locally

1. Download or clone this repository.
2. From the project root, install dependencies:

   ```bash
   npm install
   ```

   If you previously cloned the project and encounter an error mentioning `tesseract.js@^5.1.3`, pull the latest changes and rerun `npm install`. The dependency is no longer required because OCR now delegates to Qwen.

3. Start the Express server (this serves `index.html` and exposes the API the form submits to):

   ```bash
   npm start
   ```

   You should see `Wu(悟)Book server running on http://localhost:3000` in the terminal. Leave this process running while you use the app.

4. In your browser, visit <http://localhost:3000>. **Opening `index.html` directly from the file system bypasses the API and will make the “Save Entry” button appear to do nothing.**

5. When you are done, return to the terminal and press `Ctrl+C` to stop the server.

All data lives in the `data/` directory alongside the app:

- `data/entries.json` – JSON array containing every entry. The file is created on demand and ignored by Git so local practice data never collides with upstream updates. A fresh clone includes `data/entries.sample.json` if you want an example structure.
- `data/uploads/` – Photo files saved with unique names plus matching `-a4` print-sized copies.
- `data/activity.log` – One JSON object per line describing each create, update, import, and clear action (also ignored by Git).

A small demo entry is available in `data/entries.sample.json` so you can immediately see how a saved mistake looks in the interface. Feel free to delete or replace it using the app once you're ready to start fresh.

To back up or migrate Wu(悟)Book, copy the entire `data/` folder. The in-app export button also produces a JSON backup that includes embedded photo data, which can be re-imported later on a fresh installation.

## Troubleshooting "Save Entry"

If the "Save Entry" button appears to do nothing, work through the [triage playbook](docs/triage.md). It walks through verifying that the Express server is running, checking the browser network request, and confirming that `data/activity.log` and `data/entries.json` are being written to disk.

## Tips

- Use descriptive tags such as `fractions`, `careless`, or `timing` to make filters more powerful.
- Export regularly so you can share the archive or keep a cloud backup.
- The similarity finder works best when the description, reason, and notes contain meaningful context.

## Tech stack

This project uses a lightweight Node.js server (Express + Multer) to accept uploads and persist data, while the interface remains a modern vanilla HTML, CSS, and JavaScript application.
