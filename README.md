# Daily Companion

A single glass-style desktop widget for macOS: today's mood (Memoji), a note for the day, start- and end-of-day reflections with a calendar of past entries, today's priorities, the Body & Mind hour, and a countdown to 31 Dec.

## What's inside

| Path | What it is |
| --- | --- |
| `app/web/` | The widget's UI (HTML, CSS, JS) and the Memoji images |
| `app/Sources/main.swift` | The Mac app: borderless blurred panel on the desktop, menu bar icon, local storage, reminders |
| `app/Info.plist` | App bundle settings |
| `app/build.sh` | Builds the app with Apple's Command Line Tools (no Xcode needed) |

## Build and run

```bash
app/build.sh --install
```

This builds `Daily Companion.app`, copies it to `~/Applications` and opens it. Use the ✨ menu bar icon to show the widget, open a reflection, keep it on top or quit.

## Data

Everything stays on this Mac in `~/Library/Application Support/DailyCompanion/`:

- `data.json`: moods, tasks, reflections and settings (a backup copy is kept as `data.backup.json`)
- `claude-priorities.json`: today's priorities from Google Calendar and Notion, written each morning by a scheduled Claude task
- `Memoji/<mood>.png` (optional): your own Memoji, which replace the bundled ones

To check what the widget draws, create an empty `snapshot.request` file in that folder and reopen the widget; it saves `snapshot.png`.
