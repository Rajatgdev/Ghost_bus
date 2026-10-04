# Ghost Bus frontend

Vite + React. Deploys to Vercel (Root Directory = `frontend`). Read-only.

## Dev
```bash
npm install
npm run dev                 # http://localhost:5173  (proxies /api -> localhost:8000)
```
Run the backend too (`cd ../backend && uvicorn app.main:app --reload`), then press
**Run live cycle**.

## Deploy to Vercel
1. Import repo, Root Directory = `frontend`, Framework = Vite, Output = `dist`.
2. Edit `vercel.json` -> set the Railway URL in the `/api` rewrite.
