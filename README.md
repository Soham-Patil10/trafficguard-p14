# TrafficGuard

**Adversarial robustness for traffic-camera congestion classification — attack it, defend it, and see it happen live.**

TrafficGuard trains a CNN to read road congestion from traffic-camera images, then treats that model as something an attacker would target. It implements a battery of evasion and poisoning attacks against the classifier, a set of defences (including certified robustness), and a web app that runs the whole clean → attack → defence pipeline interactively, frame by frame.

UCD MSc Computer Science group project — Team P14.

---

## Table of contents

- [What it does](#what-it-does)
- [Architecture](#architecture)
- [The model](#the-model)
- [Dataset](#dataset)
- [Attacks](#attacks)
- [Defences](#defences)
- [Results](#results)
- [API reference](#api-reference)
- [Tech stack](#tech-stack)
- [Repository layout](#repository-layout)
- [Getting started](#getting-started)
- [Training from scratch](#training-from-scratch)
- [Deployment](#deployment)
- [License](#license)

---

## What it does

1. **Classifies congestion.** A ResNet18 model sorts a traffic-camera frame into **Low**, **Medium**, or **High** congestion — 87.4% test accuracy on 16.5k held-out images.
2. **Attacks that model.** Evasion attacks (FGSM, PGD, DeepFool) perturb input images to flip the prediction; a label-flipping poisoning attack corrupts the training set and produces deliberately compromised checkpoints at 10%, 20%, and 40% poison rates.
3. **Defends it.** Four defences — adversarial training, diffusion purification, randomised smoothing (with certified accuracy), and spatial smoothing — can be toggled individually and stacked.
4. **Shows the whole thing.** A React front end streams frames over a WebSocket, lets you dial attack strength (epsilon) in real time, switch defences on and off, compare a clean model against a poisoned one side by side, and export a PDF security report.

---

## Architecture

```
                         ┌─────────────────────────────┐
   Traffic camera  ──►    │  Preprocessing (MIO-TCD)    │
   frames                 │  data/mio_tcd_pipeline_v2   │
                          └──────────────┬──────────────┘
                                         │ labelled_manifest.csv (path, label, split)
                          ┌──────────────▼──────────────┐
                          │  Training (model/train.py)  │
                          │  ResNet18 → best.pt         │
                          └──────────────┬──────────────┘
                                         │
        ┌────────────────────────────────┼────────────────────────────────┐
        ▼                                ▼                                ▼
┌───────────────┐             ┌─────────────────────┐          ┌────────────────────┐
│  attacks/     │             │  defences/          │          │  backend/ (FastAPI)│
│  FGSM, PGD,   │             │  adv. training,     │          │  REST + WebSocket  │
│  DeepFool,    │────────────►│  diffusion purif.,  │◄─────────│  serves best.pt +  │
│  label-flip   │             │  rand. smoothing,   │          │  poisoned_*pct.pt  │
│  → poisoned.pt│             │  spatial smoothing  │          └─────────┬──────────┘
└───────────────┘             └─────────────────────┘                    │
                                                                        ▼
                                                          ┌─────────────────────────┐
                                                          │  frontend/ (React + TS) │
                                                          │  live attack/defence UI │
                                                          └─────────────────────────┘

  Packaged as a single Docker image → Google Cloud Run (europe-west1)
```

---

## The model

| | |
|---|---|
| **Backbone** | ResNet18, pretrained on ImageNet (torchvision) |
| **Head** | final FC replaced with `Dropout(p=0.3)` → `Linear(512, 3)` |
| **Fine-tuning** | full network (all layers unfrozen) — 11.2M trainable parameters |
| **Classes** | `Low`, `Medium`, `High` congestion (integer-mapped 0–2) |
| **Optimiser** | AdamW, weight decay `1e-4` |
| **LR schedule** | `1e-4` initial, `CosineAnnealingLR` |
| **Loss** | `CrossEntropyLoss` with label smoothing `0.1` (inverse-frequency class weighting available; off for the released run) |
| **Batch size** | 64 |
| **Epochs** | 25, early stopping on val accuracy (patience 5) |
| **Train augmentation** | random resized crop, horizontal flip, colour jitter, rotation |
| **Val/test transform** | deterministic resize + ImageNet normalisation |
| **Outputs** | `best.pt` (best val acc), `last.pt` (final epoch), `train_log.csv`, plus training-curve / confusion-matrix / per-class plots |
| **Evaluation** | per-class precision / recall / F1 + confusion matrix (scikit-learn `classification_report`) |

Config (paths, hyperparameters) is overridable via environment variables so the same script runs on a laptop, a lab GPU box, or Colab without edits.

---

## Dataset

[**MIO-TCD**](https://tcd.miovision.com/) — the Miovision Traffic Camera Dataset (Localization set), a large public collection of real traffic-camera stills.

- `data/mio_tcd_exploration.ipynb` — class balance, image-size distribution, sample inspection.
- `data/mio_tcd_pipeline_v2.ipynb` — the preprocessing pipeline: derives a congestion label per frame via `assign_label()`, builds `labelled_manifest.csv` (`image_path, label, split`), and writes stratified train / val / test splits.
- `data/sample_frames/` — eight frames bundled into the deployed image for the live WebSocket demo.

**Splits** (109,988 images total):

| Split | Images |
|---|---|
| Train | 76,990 |
| Validation | 16,499 |
| Test | 16,499 |

Class distribution is imbalanced — roughly 55% Low, 32% Medium, 13% High (see `model/checkpoints/class_distribution.png`).


---

## Attacks

Implemented in `attacks/` (notebooks + `updatedFGSM.py`) and exposed through the API.

| Attack | Type | Parameter(s) | Notes |
|---|---|---|---|
| **FGSM** | evasion, white-box | `epsilon` | single-step gradient sign perturbation |
| **PGD** | evasion, white-box | `epsilon`, `iterations` | iterative FGSM, stronger |
| **DeepFool** | evasion, white-box | `max_iter` | finds the minimal perturbation to cross the decision boundary |
| **Label flipping** | data poisoning | poison rate `{10%, 20%, 40%}` | corrupts training labels, retrains → `model/checkpoints/poisoned_{10,20,40}pct.pt` |

FGSM sweep results are logged to `attacks/fgsm_results.csv` with a comparison plot.

---

## Defences

Implemented in `defences/` — each as a notebook with saved result plots.

| Defence | Idea | Type | Artefacts |
|---|---|---|---|
| **Adversarial training** | train on FGSM/PGD examples so the model learns robust features | training-time | `defences/checkpoints/` |
| **Diffusion purification** | run a forward + reverse diffusion pass (`diffusers`) to strip perturbations before inference | preprocessing | `diffusion_purification_demo.png`, `forward_diffusion_steps.png` |
| **Randomised smoothing** | classify many Gaussian-noised copies and vote; yields a **certified** robust radius | certified | `certified_accuracy_curve.png`, `randomised_smoothing_results.csv` |
| **Spatial smoothing** | local median / blur filter to break high-frequency adversarial noise | preprocessing | — |

`sigma_sensitivity.png` documents how the smoothing noise level trades clean accuracy against certified robustness.

---

## Results

### Clean classifier (`best.pt`)

Evaluated on the held-out **test split — 16,499 images**.

| Metric | Value |
|---|---|
| **Test accuracy** | **87.4%** |
| Macro-avg F1 | 0.85 |
| Weighted-avg F1 | 0.87 |
| Best validation accuracy | 87.2% (epoch 15 / 25) |
| Final train accuracy | 92.3% |

| Class | Precision | Recall | F1 | Support |
|---|---|---|---|---|
| Low | 0.94 | 0.92 | 0.93 | 9,020 |
| Medium | 0.79 | 0.83 | 0.81 | 5,264 |
| High | 0.82 | 0.79 | 0.80 | 2,215 |

Plots: `model/checkpoints/confusion_matrix.png`, `training_curves.png`, `per_class_accuracy.png`.

The classifier is strongest on **Low** congestion (majority class) and weakest on **High** (rarest, ~13% of data) — the expected effect of class imbalance. The train/val gap (92% vs 87%) shows mild overfitting that the augmentation and dropout keep in check.

### Robustness (preliminary)

> The attack and defence sweeps currently committed were run on small development samples, not the full test split. Re-run them at scale before final submission and drop the numbers in here.

| Setting | Observation |
|---|---|
| FGSM, ε = 0.01–0.1 | prediction flips on most sampled images |
| FGSM, ε ≈ 0.2 | classifier accuracy collapses |
| DeepFool | crosses the decision boundary within a few iterations per image |
| Label-flip poisoning (10 / 20 / 40%) | serve `poisoned_*pct.pt` and compare against `best.pt` via `POST /compare/models` |
| Randomised smoothing | certified radii up to ~0.62 at the configured noise level, at the usual clean-accuracy cost |

---

## API reference

FastAPI backend (`backend/app.py`) — async, CORS-enabled, serves the built front end as static files.

### Model
| Method | Path | Description |
|---|---|---|
| `GET` | `/model/info` | architecture, class list, validation accuracy |
| `GET` | `/model/metrics` | live clean accuracy, robust accuracy, attack success rate |
| `GET` | `/model/robust-info` | details of the adversarially-trained model |
| `GET` | `/health` | service + model-load status |

### Compare clean vs poisoned
| Method | Path | Description |
|---|---|---|
| `GET` | `/compare/status` | available poison rates (10 / 20 / 40%) |
| `POST` | `/compare/models` | run an uploaded image through clean **and** poisoned models, return both predictions + confidences |

### Attacks
| Method | Path | Body params |
|---|---|---|
| `POST` | `/attack/fgsm` | `epsilon` |
| `POST` | `/attack/pgd` | `epsilon`, `iterations` |
| `POST` | `/attack/deepfool` | `max_iter` |
| `POST` | `/attack/poison/labelflip` | returns *not implemented at inference* (training-time only) |

### Defences
| Method | Path | Description |
|---|---|---|
| `GET` | `/defence/status` | current on/off state of each defence |
| `POST` | `/defence/toggle` | enable/disable one defence |
| `POST` | `/defence/apply` | apply active defences to an already-attacked image |
| `GET` | `/defence/epsilon-sweep` | robust accuracy vs epsilon curve |
| `GET` | `/defence/certified-radius` | certified radius for randomised smoothing |

### Demo / utility
| Method | Path | Description |
|---|---|---|
| `POST` | `/demo/full-pipeline` | clean prediction → FGSM attack → defence recovery, in one call |
| `GET` | `/samples` | preset sample frames |
| `POST` | `/report/generate` | PDF security report |
| `WS` | `/ws/stream` | frame-by-frame attack/defence stream; accepts epsilon + control messages from the client |

---

## Tech stack

**ML / training** — Python, PyTorch, torchvision, scikit-learn, NumPy, pandas, statsmodels, `diffusers`, Jupyter

**Backend** — FastAPI, Uvicorn, WebSockets, python-multipart, Pillow

**Frontend** — React 18, TypeScript, Vite, Tailwind CSS, React Router, Recharts, Axios, jsPDF, Supabase JS client

**Infra** — Docker, docker-compose, Google Cloud Run (`europe-west1`)

---

## Repository layout

```
trafficguard-p14/
├── data/            MIO-TCD exploration + preprocessing pipeline, sample frames
├── model/           ResNet18 training (train.py, trafficguard_model_v1.ipynb), checkpoints/ (best.pt, poisoned_*pct.pt, plots)
├── attacks/         FGSM, PGD, DeepFool, label-flipping; results CSVs
├── defences/        adversarial training, diffusion purification, randomised & spatial smoothing; result plots
├── backend/         FastAPI app (app.py), ML serving (ml.py), requirements.txt
├── frontend/        React + TS + Vite + Tailwind app
├── notebooks/       scratch experiments
├── Dockerfile
├── docker-compose.yml
├── DEPLOY.md        Cloud Run deployment guide
└── .gcloudignore    keeps best.pt + poisoned checkpoints in the image, excludes datasets
```

---

## Getting started

### Prerequisites
- Python 3.10+
- Node 18+ (for the front end)
- Docker (optional, for the containerised run)
- ~2 GB free RAM to load both model checkpoints

### 1. Clone
```bash
git clone https://github.com/Soham-Patil10/trafficguard-p14.git
cd trafficguard-p14
```

### 2. Backend
```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app:app --reload --port 8000
```
API now at `http://localhost:8000` — check `http://localhost:8000/health`.

### 3. Frontend
```bash
cd frontend
npm install
npm run dev
```
UI at `http://localhost:5173` (set the API base URL in `.env` — see `.env.production` for the key name).

### 4. Data (only needed for training / notebooks)
Download MIO-TCD, then run `data/mio_tcd_pipeline_v2.ipynb` to generate `labelled_manifest.csv` and the splits.

---

## Training from scratch

```bash
cd model
python train.py
```

Paths and hyperparameters are read from environment variables, e.g.:
```bash
MANIFEST_CSV=../data/labelled_manifest.csv \
OUTPUT_DIR=./checkpoints \
BATCH_SIZE=64 EPOCHS=25 LR=1e-4 \
python train.py
```
Produces `best.pt`, `last.pt`, `train_log.csv`, and the evaluation plots in the output directory. Point the backend at `best.pt` to serve it.

---

## Deployment

Single Docker image (FastAPI + pre-built React assets + `best.pt` + a poisoned checkpoint + sample frames) on Google Cloud Run.

### Local container
```bash
docker build -t trafficguard .
docker run -e PORT=8080 -p 8080:8080 trafficguard
# → http://localhost:8080
```

### Cloud Run
```bash
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
gcloud services enable run.googleapis.com cloudbuild.googleapis.com

gcloud run deploy trafficguard \
  --source . \
  --region europe-west1 \
  --memory 2Gi --cpu 1 \
  --timeout 3600 \
  --allow-unauthenticated
```

- `2Gi` memory is required to hold both PyTorch models.
- `--timeout 3600` keeps the demo WebSocket alive.
- Scales to zero when idle (free tier ≈ 2M requests/month); expect a 10–30s cold start.

Full notes in [`DEPLOY.md`](./DEPLOY.md).

---

## Acknowledgements

- [MIO-TCD dataset](https://tcd.miovision.com/) — Miovision Technologies
- ResNet: He et al., *Deep Residual Learning for Image Recognition* (2015)
- FGSM: Goodfellow et al., *Explaining and Harnessing Adversarial Examples* (2014)
- DeepFool: Moosavi-Dezfooli et al. (2016)
- Randomised smoothing: Cohen et al., *Certified Adversarial Robustness via Randomized Smoothing* (2019)

