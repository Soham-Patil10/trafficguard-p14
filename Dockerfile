# TrafficGuard — all-in-one image: FastAPI backend serving the built React SPA.
# Targets Hugging Face Spaces (Docker SDK, port 7860) but runs anywhere.

# ── Stage 1: build the React frontend ────────────────────────────────────────
FROM node:20-slim AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
# Uses .env.production (VITE_API_URL empty) -> bundle talks same-origin.
RUN npm run build

# ── Stage 2: Python backend + the built frontend ─────────────────────────────
FROM python:3.11-slim AS runtime
WORKDIR /app

# OpenMP runtime that torch links against
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# CPU-only PyTorch first, so the huge CUDA build is never pulled in.
# Installing it up front also satisfies torch/torchvision in requirements.txt.
RUN pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cpu

COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

# Application code
COPY backend/ ./backend/

# Runtime assets. Copying the checkpoints dirs (rather than named files) means the
# build still succeeds if a checkpoint is absent — the app degrades gracefully.
# .dockerignore keeps the large spare checkpoints out of the build context.
COPY model/checkpoints/ ./model/checkpoints/
COPY defences/checkpoints/ ./defences/checkpoints/
COPY data/sample_frames/ ./data/sample_frames/

# Built SPA from stage 1 (served by FastAPI at /)
COPY --from=frontend /app/frontend/dist ./frontend/dist

ENV PORT=7860
EXPOSE 7860
WORKDIR /app/backend
CMD ["sh", "-c", "python -m uvicorn app:app --host 0.0.0.0 --port ${PORT:-7860}"]
