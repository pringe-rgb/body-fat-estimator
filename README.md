# Body Fat Estimator

Full-stack web app that estimates body fat percentage from a front or side body image.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/pringe-rgb/body-fat-estimator)

## Project structure

```text
frontend/  Next.js upload UI
backend/   FastAPI + MediaPipe estimation API
render.yaml  Render deployment config for backend
```

## Features

- Upload a body image in the browser
- Send the image to a FastAPI backend
- Detect pose landmarks with MediaPipe
- Estimate body fat percentage with pose + silhouette heuristics
- Show the result and confidence in the UI

## Run locally

### 1. Backend

Install Python 3.11 or 3.12 if it is not already available.

```bash
cd backend
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

Backend runs at `http://localhost:8000`

If `python` is not recognized on Windows right after installation, reopen the terminal and try again, or use your installed Python executable directly to create the virtual environment.

### 2. Frontend

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at `http://localhost:3000`

Optional: copy `frontend/.env.local.example` to `frontend/.env.local` if you want to point the UI at a different backend URL.

## Deploy

Recommended setup:

- Frontend: Vercel
- Backend: Render

## Free deploy

Recommended fully-free setup:

- Frontend: Vercel Hobby
- Backend: Hugging Face Spaces

### Backend on Hugging Face Spaces

Use the files in [deploy/huggingface-space](C:/Users/USER/OneDrive/문서/codex/deploy/huggingface-space).

1. Create a new Hugging Face Space.
2. Choose `Docker` SDK.
3. Upload the contents of `deploy/huggingface-space` to that Space repository.
4. Wait for the Space build to finish.
5. Your API URL will look like:
   - `https://YOUR-SPACE-NAME.hf.space`

### Frontend on Vercel

1. Import this GitHub repository into Vercel.
2. Set the project root directory to `frontend`.
3. Add environment variable:
   - `NEXT_PUBLIC_API_URL=https://YOUR-SPACE-NAME.hf.space`
4. Deploy.

### Backend on Render

1. Push this repository to GitHub.
2. In Render, create a new Blueprint or Web Service from the repo.
3. Use [render.yaml](C:/Users/USER/OneDrive/문서/codex/render.yaml) or set:
   - Root directory: `backend`
   - Build command: `pip install -r requirements.txt`
   - Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
4. Add environment variable:
   - `CORS_ALLOW_ORIGINS=https://your-vercel-domain.vercel.app`

### Frontend on Vercel

1. Import the same GitHub repo into Vercel.
2. Set the project root directory to `frontend`.
3. Add environment variable:
   - `NEXT_PUBLIC_API_URL=https://your-render-domain.onrender.com`
4. Deploy.

After both are live, update the Render `CORS_ALLOW_ORIGINS` value to match your final Vercel domain if needed.

## Use the app

1. Open `http://localhost:3000`
2. Upload a front or side full-body image
3. Click `Estimate Body Fat %`
4. View the estimated percentage on screen

## API

### `POST /estimate-body-fat`

Multipart form field:

- `file`: image upload

Example JSON response:

```json
{
  "estimated_body_fat_percent": 16.4,
  "confidence": "medium",
  "view_type": "front",
  "summary": "Estimated from a front body pose using pose landmarks and body silhouette ratios. This is a rough visual heuristic, not a medical measurement."
}
```

## Notes

- The body fat estimate is a heuristic based on body proportions inferred from pose landmarks and silhouette width.
- This is not a medical device or diagnostic tool.
- Best results come from clear full-body images with minimal occlusion.
