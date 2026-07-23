# Deploying TrafficGuard (free, all-in-one) to Hugging Face Spaces

One Docker image runs everything: the FastAPI backend serves the API **and** the
built React frontend from a single URL. Free CPU tier, PyTorch-friendly, and it
hosts the model files for you via Git LFS.

## What ships in the image
- `backend/` (FastAPI + the ML code)
- `frontend/dist/` (built inside the image from `frontend/`)
- `model/checkpoints/best.pt` (clean) and `poisoned.pt` (label-flipped) — via LFS
- `data/sample_frames/` (8 frames for the live WebSocket stream)

The 110k-image training set, spare checkpoints, and notebooks are excluded by
`.dockerignore`, so the build stays small.

## Prerequisites
- A [Hugging Face](https://huggingface.co) account
- `git` and `git-lfs` installed (`git lfs install` once)

## Steps

**1. Create the Space.** On Hugging Face → *New Space* → SDK **Docker** →
*Blank* template. Give it a name (e.g. `trafficguard`).

**2. Make the Space README declare the Docker port.** The Space's `README.md`
must start with this frontmatter (Spaces reads it to route traffic):

```yaml
---
title: TrafficGuard
emoji: 🚦
colorFrom: blue
colorTo: red
sdk: docker
app_port: 7860
pinned: false
---
```

**3. Push this project to the Space repo.** From a clone of the Space:

```bash
git lfs install
# copy the project files in (Dockerfile, backend/, frontend/, model/, data/sample_frames/ …)
git lfs track "*.pt"            # already set in .gitattributes
git add .gitattributes
git add -f model/checkpoints/best.pt model/checkpoints/poisoned.pt   # -f: they're gitignored
git add .
git commit -m "Deploy TrafficGuard all-in-one"
git push
```

`git add -f` is required because `*.pt` is in `.gitignore`; forcing the add lets
LFS pick them up. Confirm they're LFS pointers with `git lfs ls-files`.

**4. Wait for the build.** The Space builds the Dockerfile (frontend build +
torch install takes a few minutes). When it's live, open the Space URL — the
dashboard loads, and the API/WebSocket work same-origin automatically.

## Notes
- **Cold starts:** free Spaces sleep after inactivity; the first hit after idle
  is slow while torch + the models load. Fine for a demo — warm it up before a
  presentation.
- **Fair comparison (optional):** the deploy pairs `best.pt` (clean) vs
  `poisoned.pt`. To isolate poisoning as the only variable, also ship
  `clean_baseline.pt` (remove it from `.dockerignore`) and set the Space env var
  `TG_CHECKPOINT=/app/model/checkpoints/clean_baseline.pt`.
- **Local Docker test:** `docker build -t trafficguard . && docker run -p 7860:7860 trafficguard`, then open `http://localhost:7860`.
