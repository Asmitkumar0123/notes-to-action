# Deploying Notes to Action

Notes to Action is configured for 1-click cloud deployment with fullstack single-port serving and an embedded local database (PGlite) that persists across restarts.

---

## Option 1: Deploy to Render (Recommended)

Render provides free/low-cost hosting with native blueprint support via `render.yaml`.

### Step 1: Push your code to GitHub

If you haven't created a GitHub repository yet:
1. Go to [github.com/new](https://github.com/new) and create a new repository named `notes-to-action`.
2. In your terminal, run:
```bash
git remote add origin https://github.com/<YOUR_GITHUB_USERNAME>/notes-to-action.git
git branch -M main
git push -u origin main
```

### Step 2: Deploy on Render via Blueprint
1. Log in to [dashboard.render.com](https://dashboard.render.com).
2. Click **New +** in the top navigation and select **Blueprint**.
3. Connect your `notes-to-action` GitHub repository.
4. Render will automatically detect [`render.yaml`](render.yaml) and configure:
   - **Service Type**: Web Service
   - **Build Command**: `pnpm install --dangerously-allow-all-builds && pnpm run build`
   - **Start Command**: `pnpm start`
   - **Persistent Disk**: Attached at `/var/data` (stores your local SQLite/PGlite database permanently)
5. Click **Apply**. Render will build and deploy the project to your live URL (e.g. `https://notes-to-action-xxx.onrender.com`).

*(Optional)* Under the service's Environment settings, you can add `OPENAI_API_KEY` if you want OpenAI-powered task extraction, or omit it to use the built-in deterministic local extractor.

---

## Option 2: Deploy to Railway

Railway provides fast zero-config deployments with automatic Nixpacks or Docker detection.

### Step 1: Push your code to GitHub
```bash
git remote add origin https://github.com/<YOUR_GITHUB_USERNAME>/notes-to-action.git
git branch -M main
git push -u origin main
```

### Step 2: Deploy on Railway
1. Log in to [railway.app](https://railway.app).
2. Click **+ New Project** -> **Deploy from GitHub repo**.
3. Select `notes-to-action`. Railway will read [`railway.json`](railway.json) and [`Procfile`](Procfile).
4. In project settings:
   - Click **Add Volume** to add persistent storage.
   - Set the mount path to `/app/data`.
   - Set the environment variable: `LOCAL_DB_PATH=/app/data/notes-to-action-db`.
5. Under **Settings -> Networking**, click **Generate Domain** to get your public HTTPS URL.

---

## Option 3: Deploy with Docker (Any Cloud / VPS / Self-Hosted)

A multi-stage, optimized [`Dockerfile`](Dockerfile) and [`docker-compose.yml`](docker-compose.yml) are included.

### Run with Docker Compose:
```bash
docker compose up -d --build
```

The app will be accessible at `http://localhost:3000` with the embedded database volume mounted permanently at `notes_data`.

### Build & Run standalone Docker container:
```bash
docker build -t notes-to-action .
docker run -d -p 3000:3000 -v notes_data:/app/data --name notes-app notes-to-action
```

---

## Environment Variables Reference

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | Auto-set | `3000` | Port for the web service (set automatically by Render/Railway) |
| `NODE_ENV` | Optional | `production` | Production environment flag |
| `LOCAL_DB_PATH` | Optional | `./local-data/notes-to-action-db` | Directory path where the embedded PGlite database persists |
| `OPENAI_API_KEY` | Optional | *None* | OpenAI API Key. If omitted, uses deterministic local fallback extraction |
| `DATABASE_URL` | Optional | *None* | Remote PostgreSQL connection string (if you want remote DB instead of embedded local DB) |
