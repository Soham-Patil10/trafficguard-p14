"""
TrafficGuard - ML core (model + FGSM attack + spatial-smoothing defence)
COMP47250 - Project P14

This module owns everything that touches PyTorch. app.py imports from here.
Keeping torch isolated here means the FastAPI layer (app.py) can be tested
without a GPU/checkpoint, and the ML pieces can be unit-tested on their own.

Public functions used by app.py:
    load_model(checkpoint_path)        -> loads weights (or a clean fallback)
    model_meta()                       -> dict of architecture / checkpoint info
    predict_pil(image)                 -> clean prediction dict
    run_fgsm(image, epsilon)           -> clean + adversarial preds + b64 images
    predict_with_defence(image, eps)   -> prediction after spatial smoothing
"""

from __future__ import annotations

import io
import base64
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

import torch
import torch.nn as nn
import torch.nn.functional as F
from torchvision import transforms, models

# ── Constants (must match the training notebook) ──────────────────────────────
CLASS_NAMES   = ["Low", "Medium", "High"]
IDX_TO_LABEL  = {0: "Low", 1: "Medium", 2: "High"}
IMAGENET_MEAN = [0.485, 0.456, 0.406]
IMAGENET_STD  = [0.229, 0.224, 0.225]
DEVICE        = torch.device("cuda" if torch.cuda.is_available() else "cpu")
SMOOTH_WINDOW = 3  # spatial-smoothing median window (matches ART SpatialSmoothing)

# ── Module-level cache ────────────────────────────────────────────────────────
_model = None          # NormalizedResNet in eval() mode
_meta = {}             # checkpoint metadata


# ── Model definition ──────────────────────────────────────────────────────────
class NormalizedResNet(nn.Module):
    """ResNet18 (3-class head) that normalises raw [0,1] pixel input internally.

    Doing normalisation *inside* the model lets FGSM operate directly in pixel
    space (the clean and adversarial images we display are real [0,1] images),
    which mirrors ART's `preprocessing=(MEAN, STD)` setup in the notebook.
    """

    def __init__(self, num_classes: int = 3):
        super().__init__()
        backbone = models.resnet18(weights=None)
        backbone.fc = nn.Sequential(
            nn.Dropout(p=0.3),
            nn.Linear(backbone.fc.in_features, num_classes),
        )
        self.backbone = backbone
        self.register_buffer("mean", torch.tensor(IMAGENET_MEAN).view(1, 3, 1, 1))
        self.register_buffer("std", torch.tensor(IMAGENET_STD).view(1, 3, 1, 1))

    def forward(self, x_pixels: torch.Tensor) -> torch.Tensor:
        x = (x_pixels - self.mean) / self.std
        return self.backbone(x)


# ── Transforms ────────────────────────────────────────────────────────────────
# NB: ToTensor only (NO Normalize) — normalisation happens inside the model.
_TO_PIXELS = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),                       # -> [0,1], shape (3,224,224)
])


def _pil_to_pixels(image: Image.Image) -> torch.Tensor:
    if image.mode != "RGB":
        image = image.convert("RGB")
    return _TO_PIXELS(image).unsqueeze(0).to(DEVICE)   # (1,3,224,224) in [0,1]


def _pixels_to_b64(x: torch.Tensor) -> str:
    """(1,3,224,224) float [0,1] tensor -> base64 JPEG string (no data: prefix)."""
    arr = (x.detach().cpu().squeeze(0).clamp(0, 1).numpy().transpose(1, 2, 0) * 255)
    pil = Image.fromarray(arr.astype(np.uint8), mode="RGB")
    buf = io.BytesIO()
    pil.save(buf, format="JPEG", quality=85)
    return base64.b64encode(buf.getvalue()).decode("utf-8")


def _softmax_np(logits_1d: np.ndarray) -> np.ndarray:
    e = np.exp(logits_1d - logits_1d.max())
    return e / e.sum()


# ── Model loading (with graceful fallback) ────────────────────────────────────
def load_model(checkpoint_path: Path | str) -> bool:
    """Load best.pt if present. Returns True if real weights were loaded.

    Falls back to an untrained ResNet18 head so the server still runs end-to-end
    (predictions are arbitrary, but FGSM/smoothing demonstrably work). This is
    what lets the dashboard light up before Soham's checkpoint is available.
    """
    global _model, _meta
    model = NormalizedResNet(num_classes=3).to(DEVICE)
    checkpoint_path = Path(checkpoint_path)

    if checkpoint_path.exists():
        ckpt = torch.load(checkpoint_path, map_location=DEVICE, weights_only=False)
        if isinstance(ckpt, dict) and "model_state_dict" in ckpt:
            state = ckpt["model_state_dict"]
            _meta = {
                "epoch": ckpt.get("epoch", "?"),
                "val_acc": float(ckpt.get("val_acc", 0.0)),
                "loaded": True,
            }
        elif isinstance(ckpt, dict):
            state = ckpt
            _meta = {"epoch": "?", "val_acc": 0.0, "loaded": True}
        else:  # a fully-pickled nn.Module was saved
            model = ckpt.to(DEVICE)
            _meta = {"epoch": "?", "val_acc": 0.0, "loaded": True}
            state = None
        if state is not None:
            # Accept both bare-backbone and wrapped state dicts
            try:
                model.load_state_dict(state)
            except Exception:
                model.backbone.load_state_dict(state)
        real = True
    else:
        _meta = {"epoch": "untrained", "val_acc": 0.0, "loaded": False}
        real = False

    model.eval()
    _model = model
    return real


def get_model() -> NormalizedResNet:
    if _model is None:
        raise RuntimeError("Model not loaded — call load_model() first.")
    return _model


def model_meta() -> dict:
    total = sum(p.numel() for p in get_model().parameters()) if _model else 0
    return {
        "architecture": "ResNet18",
        "num_classes": 3,
        "class_names": CLASS_NAMES,
        "total_params": total,
        "device": str(DEVICE),
        "checkpoint_loaded": _meta.get("loaded", False),
        "epoch": _meta.get("epoch"),
        "val_acc": round(_meta.get("val_acc", 0.0) * 100, 2),
    }


# ── Inference ─────────────────────────────────────────────────────────────────
def _predict_pixels(x: torch.Tensor) -> dict:
    with torch.no_grad():
        logits = get_model()(x)
    probs = _softmax_np(logits.cpu().numpy()[0])
    idx = int(probs.argmax())
    return {
        "label": IDX_TO_LABEL[idx],
        "idx": idx,
        "confidence": round(float(probs[idx]), 4),
        "probs": {CLASS_NAMES[i]: round(float(probs[i]), 4) for i in range(3)},
    }


def predict_pil(image: Image.Image) -> dict:
    return _predict_pixels(_pil_to_pixels(image))


# ── FGSM attack ───────────────────────────────────────────────────────────────
def _fgsm_perturb(x: torch.Tensor, epsilon: float) -> torch.Tensor:
    """Standard untargeted FGSM: x_adv = clip(x + eps * sign(grad_x loss), 0, 1).

    The label is the model's own clean prediction (untargeted), so we push the
    image away from whatever it currently thinks — the textbook formulation.
    """
    model = get_model()
    x = x.clone().detach().requires_grad_(True)
    logits = model(x)
    target = logits.argmax(dim=1).detach()       # current prediction
    loss = F.cross_entropy(logits, target)
    model.zero_grad(set_to_none=True)
    loss.backward()
    x_adv = (x + epsilon * x.grad.sign()).clamp(0, 1).detach()
    return x_adv


def run_fgsm(image: Image.Image, epsilon: float = 0.1) -> dict:
    x_clean = _pil_to_pixels(image)
    clean = _predict_pixels(x_clean)

    x_adv = _fgsm_perturb(x_clean, float(epsilon))
    attacked = _predict_pixels(x_adv)

    return {
        "clean_pred":   clean["label"],
        "attack_pred":  attacked["label"],
        "clean_conf":   clean["confidence"],
        "attack_conf":  attacked["confidence"],
        "asr":          int(clean["idx"] != attacked["idx"]),
        "epsilon":      float(epsilon),
        "clean_probs":  clean["probs"],
        "attack_probs": attacked["probs"],
        "clean_image":  _pixels_to_b64(x_clean),
        "attack_image": _pixels_to_b64(x_adv),
        "_x_adv":       x_adv,   # kept for the defence step; stripped before JSON
    }


# ── Spatial-smoothing defence ────────────────────────────────────────────────
def _median_smooth(x: torch.Tensor, window: int = SMOOTH_WINDOW) -> torch.Tensor:
    """Apply a median filter (the core of ART's SpatialSmoothing) to a [0,1] image."""
    arr = (x.detach().cpu().squeeze(0).clamp(0, 1).numpy().transpose(1, 2, 0) * 255)
    pil = Image.fromarray(arr.astype(np.uint8), mode="RGB")
    pil = pil.filter(ImageFilter.MedianFilter(size=window))
    out = torch.from_numpy(np.asarray(pil).astype(np.float32) / 255.0)
    return out.permute(2, 0, 1).unsqueeze(0).to(DEVICE)


def predict_with_defence(x_adv: torch.Tensor, window: int = SMOOTH_WINDOW) -> dict:
    """Smooth an adversarial image, then predict. Returns defended prediction + image."""
    x_def = _median_smooth(x_adv, window)
    pred = _predict_pixels(x_def)
    return {
        "defended_pred":  pred["label"],
        "defended_idx":   pred["idx"],
        "defended_conf":  pred["confidence"],
        "defended_probs": pred["probs"],
        "defended_image": _pixels_to_b64(x_def),
    }


def defend_pil(image: Image.Image, window: int = SMOOTH_WINDOW) -> dict:
    """Apply the spatial-smoothing defence to an arbitrary (already-attacked) image.

    Used by the Defence Lab: it receives the attacked image produced by the
    Attack Lab and returns the defended prediction + smoothed image.
    """
    x = _pil_to_pixels(image)
    return predict_with_defence(x, window)
