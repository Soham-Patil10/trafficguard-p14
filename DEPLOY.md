# Deploying TrafficGuard to Google Cloud Run (free tier)

One Docker image runs everything: the FastAPI backend serves the API **and** the
built React frontend from a single URL. Cloud Run runs our existing Dockerfile
as-is — no app changes. It scales to zero, so it stays within the free tier for
demo-level traffic.

## What ships in the image
- `backend/` (FastAPI + the ML code)
- `frontend/dist/` (built inside the image from `frontend/`)
- `model/checkpoints/best.pt` (clean) and `poisoned.pt` (label-flipped)
- `data/sample_frames/` (8 frames for the live WebSocket stream)

`.gcloudignore` keeps the 110k-image dataset, spare checkpoints, and notebooks
out of the upload — **but keeps the two served `.pt` models in** (they'd
otherwise be dropped because `*.pt` is in `.gitignore`).

## Prerequisites
- A Google Cloud account with **billing enabled** (free tier stays $0 for this)
- The `gcloud` CLI installed — https://cloud.google.com/sdk/docs/install
- A GCP project (create one in the Cloud Console)

## One-time setup
```bash
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
gcloud services enable run.googleapis.com cloudbuild.googleapis.com
```

## Deploy (one command)
```bash
gcloud run deploy trafficguard \
  --source . \
  --region europe-west1 \
  --memory 2Gi \
  --cpu 1 \
  --timeout 3600 \
  --allow-unauthenticated
```

- `--source .` builds the image from our Dockerfile via Cloud Build, pushes it,
  and deploys — all in one step.
- `--memory 2Gi` is required; the default 512 MB can't hold two torch models.
- `--timeout 3600` keeps the WebSocket live stream from being cut off.
- `--allow-unauthenticated` makes it a public URL (no login wall).
- `europe-west1` (Belgium) is close to Ireland; `europe-west2` (London) also works.

When it finishes, gcloud prints a URL like `https://trafficguard-xxxxx.run.app`.
Open it — the dashboard loads, and the API/WebSocket work same-origin.

## Notes
- **Free tier & cost:** scales to zero (`min-instances=0` default), so you pay
  nothing while idle. The free tier covers ~2M requests/month. Set a budget alert
  in the Cloud Console for peace of mind.
- **Cold starts:** the first request after idle takes ~10–30s while torch and the
  models load. Warm it up before a live presentation.
- **Updating:** re-run the same `gcloud run deploy` command.
- **Fair comparison (optional):** the deploy pairs `best.pt` (clean) vs
  `poisoned.pt`. To isolate poisoning as the only variable, also ship
  `clean_baseline.pt` (remove it from `.gcloudignore` and `.dockerignore`) and
  add `--set-env-vars TG_CHECKPOINT=/app/model/checkpoints/clean_baseline.pt`.
- **Local Docker test:** `docker build -t trafficguard . && docker run -e PORT=8080 -p 8080:8080 trafficguard`, then open `http://localhost:8080`.
