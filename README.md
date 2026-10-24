# Notes to Action

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/Asmitkumar0123/notes-to-action)
[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template?template=https://github.com/Asmitkumar0123/notes-to-action)

A personal productivity web application that transforms unstructured notes and brain-dumps into prioritized actions, realistic daily schedules, and replayable execution traces — powered by an embedded local database (PGlite) that requires zero setup.

---

## Features

- **Brain-Dump to Execution**: Paste unorganized thoughts, scattered bullets, or paragraphs; the engine extracts clear, categorized tasks.
- **Embedded Local Database**: Built-in persistent storage using [PGlite](https://pglite.dev/) (in-process PostgreSQL compiled to WebAssembly) + Drizzle ORM. Works completely offline without needing PostgreSQL or Docker.
- **Modern Glassmorphic UI**: High-end interface featuring dark and light modes, ambient animated glow, and crisp typography (Plus Jakarta Sans, Fraunces).
- **Multi-View Dashboard**:
  - **Plan & Schedule**: Prioritized checklist with durations, priority pills, and suggested hourly timeline.
  - **Priority Matrix (Kanban)**: High, Medium, and Low priority columns.
  - **Execution Trace & Replay**: Interactive 7-stage deterministic pipeline visualizer with live SSE streaming status and variable replay speeds.
  - **Raw Database Record**: Inspect the raw JSON record directly saved in the local database with a one-click copy button.
- **Quick-Start Preset Templates**: Instant prompts for *Studio Launch*, *Monday Sprint*, *Trip Catch-up*, and *Deep Work Flow*.
- **Export & Markdown**: One-click Markdown plan export (`- [ ] task`) formatted for Notion, Obsidian, or Slack.

---

## 1-Click Cloud Deployment

### Deploy to Render
Click the **Deploy to Render** button above, or:
1. Log in to [dashboard.render.com](https://dashboard.render.com).
2. Click **New +** → **Blueprint**.
3. Select this repository (`Asmitkumar0123/notes-to-action`).
4. Render automatically reads [`render.yaml`](render.yaml) and provisions the Web Service with a persistent storage disk.
5. Click **Apply**.

### Deploy to Railway
Click the **Deploy on Railway** button above, or:
1. Log in to [railway.app](https://railway.app).
2. Click **+ New Project** → **Deploy from GitHub repo** → select `notes-to-action`.
3. Under project settings, add a volume mounted at `/app/data` with environment variable `LOCAL_DB_PATH=/app/data/notes-to-action-db`.
4. Generate a public domain under **Settings → Networking**.

### Deploy with Docker
```bash
docker compose up -d --build
```
The app will run at `http://localhost:3000` with data stored in the `notes_data` volume.

---

## Local Development

### Requirements
- Node.js 22+
- pnpm 10+ (`npm install -g pnpm`)

### Quick Start
```bash
# Clone the repository
git clone https://github.com/Asmitkumar0123/notes-to-action.git
cd notes-to-action

# Install dependencies
pnpm install --dangerously-allow-all-builds

# Run both the API server (port 3000) and Web App (port 5173) concurrently:
pnpm run dev
```

Open **http://localhost:5173** in your browser.

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | Auto-set | `3000` | Port for the web service (set automatically by cloud hosts) |
| `NODE_ENV` | Optional | `production` | Production environment flag |
| `LOCAL_DB_PATH` | Optional | `./local-data/notes-to-action-db` | Directory path where the embedded database persists |
| `OPENAI_API_KEY` | Optional | *None* | OpenAI API Key. If omitted, uses deterministic local fallback extraction |
| `DATABASE_URL` | Optional | *None* | Remote PostgreSQL connection string (if using external DB instead of embedded local DB) |

---

## License

MIT
