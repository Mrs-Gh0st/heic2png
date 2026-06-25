# HEIC → IMG Converter

Full-stack web app for batch converting HEIC/HEIF images to PNG or JPEG.

## Stack
- **Frontend**: React + Vite
- **Backend**: Node.js + Express + `heic-convert`
- **Deploy**: Railway (free tier)

---

## Local Development

### Prerequisites
- Node.js 18+
- npm

### Setup

```bash
# 1. Clone the repo
git clone https://github.com/YOUR_USERNAME/heic-converter.git
cd heic-converter

# 2. Install dependencies
cd backend && npm install
cd ../frontend && npm install

# 3. Run backend (terminal 1)
cd backend && npm run dev

# 4. Run frontend (terminal 2)
cd frontend && npm run dev

# Frontend: http://localhost:5173
# Backend:  http://localhost:3001
```

---

## Deploy to Railway (Free)

### Step 1 — Push to GitHub
```bash
git init
git add .
git commit -m "init"
git remote add origin https://github.com/YOUR_USERNAME/heic-converter.git
git push -u origin main
```

### Step 2 — Deploy Backend on Railway
1. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
2. Select your repo → choose the **`backend`** folder as the root
3. Railway auto-detects Node.js and runs `npm start`
4. After deploy, copy the public URL (e.g. `https://heic-backend-xxxx.railway.app`)

### Step 3 — Deploy Frontend on Railway
1. In the same Railway project → Add Service → GitHub Repo → choose **`frontend`** folder
2. Set build command: `npm install && npm run build`
3. Set start command: `npx serve dist -l $PORT`
4. Add environment variable:
   ```
   VITE_API_URL=https://heic-backend-xxxx.railway.app
   ```
   *(Replace with your actual backend URL from Step 2)*
5. Redeploy the frontend service

### Step 4 — Set CORS on Backend
Add an environment variable on the **backend** service:
```
FRONTEND_URL=https://heic-frontend-xxxx.railway.app
```

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| POST | `/api/convert` | Upload & convert HEIC files |
| GET | `/api/download/:sessionId/zip` | Download all as ZIP |
| GET | `/api/download/:sessionId/:fileId` | Download single file |
| GET | `/api/session/:sessionId` | Get session info |
| DELETE | `/api/session/:sessionId` | Delete session & files |

### POST `/api/convert`
- Body: `multipart/form-data`
- Fields:
  - `files[]` — HEIC/HEIF files (max 89, 50MB each)
  - `format` — `"png"` or `"jpeg"` (default: `"png"`)
  - `quality` — `40–100` (JPEG only, default: `90`)

---

## Notes
- Files are automatically deleted from the server after **1 hour**
- No user accounts required — session-based
- Max 89 files per conversion batch
