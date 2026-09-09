# TrafficGuard

Traffic-congestion classification from roadside-camera images, with an
adversarial-robustness study and a deployable web app.

UCD MSc group project (Team P14).

## What it does

Classifies a traffic-camera image into one of three congestion levels —
**Low / Medium / High** — and serves the model behind an API + web frontend.
A second track attacks that classifier with adversarial and data-poisoning
methods and evaluates defences.

## Model

- **Architecture:** ResNet18, ImageNet-pretrained; final layer replaced with
  Dropout(0.3) + Linear(3). Full fine-tuning.
- **Data:** MIO-TCD traffic-camera dataset, preprocessed into train/val/test
  splits from a manifest CSV; congestion labels assigned in the preprocessing
  pipeline.
- **Training:** AdamW, LR 1e-4 with cosine annealing, weight decay 1e-4,
  batch size 64, up to 25 epochs with early stopping (patience 5).
  Inverse-frequency class weighting + 0.1 label smoothing on CrossEntropyLoss.
  Augmentation: random crop, horizontal flip, colour jitter, rotation.
- **Evaluation:** per-class precision / recall / F1 + confusion matrix
  (scikit-learn). Test accuracy: **TODO — fill in**.

## Adversarial robustness

| Type      | Method         | Location                        |
|-----------|----------------|---------------------------------|
| Evasion   | FGSM           | `attacks/`                      |
| Evasion   | DeepFool       | `attacks/deepfool/`             |
| Poisoning | Label flipping | `attacks/Label Flipping.ipynb`  |

Defences and their evaluation are in `defences/`.
Key result: **TODO — e.g. "FGSM at ε=0.03 dropped test accuracy from X% to Y%;
adversarial training recovered it to Z%."**

## Stack

Python, PyTorch, torchvision, scikit-learn, Jupyter. Backend in `backend/`,
frontend in `frontend/`. Containerised with Docker / docker-compose;
GCP deployment documented in `DEPLOY.md`.

## Repo layout
