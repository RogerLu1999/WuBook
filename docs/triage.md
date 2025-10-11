# WuBook triage playbook

Use this checklist when "Save Entry" appears to do nothing or when the activity log file is missing.

## 1. Confirm the server is running

The front-end submits entries to the Express API defined in `server.js`. Launch the server from the project root with:

```bash
npm install
npm start
```

You should see `WuBook server running on http://localhost:3000` in the terminal. Keep this process running and, in your browser, visit <http://localhost:3000> (not `file:///.../index.html`). If the server is not running the browser will block the submission and `app.js` will show an alert after logging a network error to the console.

## 2. Watch the browser network request

Open Developer Tools → Network, submit the form, and look for a `POST /api/entries` request. A successful request returns HTTP 201 and JSON that looks like:

```json
{
  "id": "...",
  "subject": "Math",
  "title": "Algebra worksheet",
  "createdAt": "2025-10-11T12:08:24.049Z",
  "updatedAt": "2025-10-11T12:08:24.049Z"
}
```

If the status is `(failed)` or 500, open the **Console** tab for the corresponding error message. The front-end will also raise an alert when the request fails.

## 3. Tail the server log

While testing, keep an eye on the terminal where `npm start` is running. Every route in `server.js` logs errors to `stderr`, and network failures will be visible here.

For deeper debugging you can start the server in one terminal and, in a second terminal, run:

```bash
tail -f data/activity.log
```

The log file is created on the first action that calls `logAction`—for example a successful entry creation, update, delete, import, or an error response. Each line is a JSON document with the timestamp, action, status, and metadata.

## 4. Validate the data directory

Entries and logs are saved inside the repo’s `data/` folder:

- `data/entries.json` stores the array of entries that populate the UI.
- `data/activity.log` is appended to by the `logAction` helper.
- `data/uploads/` contains uploaded photos.

If `data/activity.log` is missing after you save an entry, verify that the process has write permissions to the repository folder. You can also run a manual test with `curl`:

```bash
curl -X POST http://localhost:3000/api/entries \
  -F 'subject=Math' \
  -F 'title=Worksheet' \
  -F 'description=desc' \
  -F 'reason=reason' \
  -F 'comments=notes' \
  -F 'tags=tag1, tag2'
```

A successful response creates or updates both `data/entries.json` and `data/activity.log`.

## 5. Common culprits

- Opening `index.html` directly from the filesystem instead of going through `http://localhost:3000`.
- Required form fields left empty—native validation prevents submission.
- Antivirus or OS sandboxing preventing Node.js from writing to `data/`.

Following the steps above will usually pinpoint the failing component.
