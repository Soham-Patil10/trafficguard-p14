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
_model = None          # NormalizedResNet in eval() mode (clean model)
_meta = {}             # checkpoint metadata

# Label-flip poisoned models, keyed by flip rate (e.g. 10, 20, 40).
# Each entry: {"model": NormalizedResNet, "meta": {...}}
_poisoned_models: dict[int, dict] = {}
POISON_RATES = (10, 20, 40)


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
                try:
                    model.backbone.load_state_dict(state)
                except Exception as e:
                    print(f"[TrafficGuard] ERROR: checkpoint weights could not be loaded: {e}")
                    print("[TrafficGuard] Running with random weights — predictions will be meaningless.")
                    _meta["loaded"] = False
                    real = False
                else:
                    real = True
            else:
                real = True
        else:
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


# ── Poisoned (label-flipped) model for side-by-side comparison ────────────────
def _load_state_flexible(model: NormalizedResNet, state: dict) -> None:
    """Load a state dict into either the wrapper or the bare backbone."""
    try:
        model.load_state_dict(state)
    except Exception:
        model.backbone.load_state_dict(state)


def load_poisoned_model(checkpoint_path: Path | str, rate: int) -> bool:
    """Load a label-flipped model (trained with `rate`% flipped labels) into
    its own slot in `_poisoned_models`, keyed by rate.

    Handles the label-flip notebook's whole-module save (a plain ResNet18 saved
    via torch.save(model)) by copying its weights into a NormalizedResNet backbone
    so it runs in the same [0,1] pixel space as the clean model. Returns True if
    real weights were loaded, False if the checkpoint is missing or unreadable.
    """
    checkpoint_path = Path(checkpoint_path)
    if not checkpoint_path.exists():
        _poisoned_models[rate] = {
            "model": None,
            "meta": {"epoch": "missing", "val_acc": 0.0, "loaded": False},
        }
        return False

    model = NormalizedResNet(num_classes=3).to(DEVICE)
    ckpt = torch.load(checkpoint_path, map_location=DEVICE, weights_only=False)
    meta = {"epoch": "?", "val_acc": 0.0, "loaded": True}
    try:
        if isinstance(ckpt, dict) and "model_state_dict" in ckpt:
            meta["epoch"] = ckpt.get("epoch", "?")
            meta["val_acc"] = float(ckpt.get("val_acc", 0.0))
            _load_state_flexible(model, ckpt["model_state_dict"])
        elif isinstance(ckpt, dict):
            _load_state_flexible(model, ckpt)
        elif isinstance(ckpt, NormalizedResNet):
            model = ckpt.to(DEVICE)
        else:  # a plain nn.Module (e.g. the notebook's torch.save(resnet18))
            model.backbone.load_state_dict(ckpt.state_dict())
    except Exception as e:
        print(f"[TrafficGuard] ERROR: poisoned checkpoint (rate={rate}%) could not be loaded: {e}")
        _poisoned_models[rate] = {
            "model": None,
            "meta": {"epoch": "?", "val_acc": 0.0, "loaded": False},
        }
        return False

    model.eval()
    _poisoned_models[rate] = {"model": model, "meta": meta}
    return True


def load_all_poisoned_models(checkpoints_dir: Path | str) -> dict[int, bool]:
    """Convenience loader: looks for poisoned_{rate}pct.pt for each rate in
    POISON_RATES inside `checkpoints_dir` and loads whichever exist.
    Returns {rate: loaded_bool}.
    """
    checkpoints_dir = Path(checkpoints_dir)
    results = {}
    for rate in POISON_RATES:
        path = checkpoints_dir / f"poisoned_{rate}pct.pt"
        results[rate] = load_poisoned_model(path, rate)
    return results


def poisoned_meta(rate: int | None = None) -> dict:
    """Metadata for one rate, or a summary of every loaded rate if rate=None."""
    if rate is not None:
        entry = _poisoned_models.get(rate, {"meta": {"epoch": "missing", "val_acc": 0.0, "loaded": False}})
        m = entry["meta"]
        return {
            "rate": rate,
            "checkpoint_loaded": m.get("loaded", False),
            "epoch": m.get("epoch"),
            "val_acc": round(m.get("val_acc", 0.0) * 100, 2),
        }
    return {r: poisoned_meta(r) for r in POISON_RATES}


def get_poisoned_model(rate: int) -> "NormalizedResNet | None":
    entry = _poisoned_models.get(rate)
    return entry["model"] if entry else None


# ── Inference ─────────────────────────────────────────────────────────────────
def _predict_pixels(x: torch.Tensor, model: "NormalizedResNet | None" = None) -> dict:
    m = model if model is not None else get_model()
    with torch.no_grad():
        logits = m(x)
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


def compare_pil(image: Image.Image, rate: int = 10) -> dict:
    """Predict the same image through the clean model and the poisoned model
    trained at the given flip `rate` (10/20/40).

    Returns both predictions plus the (resized) input image. The 'poisoned' entry
    is None when that rate's checkpoint hasn't been loaded.
    """
    x = _pil_to_pixels(image)
    clean = _predict_pixels(x)
    poisoned_model = get_poisoned_model(rate)
    poisoned = _predict_pixels(x, poisoned_model) if poisoned_model is not None else None
    return {
        "clean":     clean,
        "poisoned":  poisoned,
        "rate":      rate,
        "image_b64": _pixels_to_b64(x),
    }


# ── Label-flip results (from the actual training run) ─────────────────────────
# The poisoned_{rate}pct.pt checkpoints are saved as plain torch.save(model)
# objects with no embedded metadata, so there's no val_acc to read from the
# file itself. These numbers are the real measured test-set results from the
# training run documented in attacks/Label Flipping.ipynb (flip High->Low on
# a stratified 1500-image MIO-TCD subset, 10 epochs per model). If the model
# is retrained, update these to match the new notebook run.
LABELFLIP_RESULTS = {
    0:  {"test_acc": 0.6578, "n_flipped": 0,   "label": "Clean baseline"},
    10: {"test_acc": 0.6000, "n_flipped": 35,  "label": "Poisoned 10%"},
    20: {"test_acc": 0.6133, "n_flipped": 70,  "label": "Poisoned 20%"},
    40: {"test_acc": 0.5689, "n_flipped": 140, "label": "Poisoned 40%"},
}


def labelflip_report(rate: int) -> dict:
    """Summarise the effect of label-flip poisoning at `rate`% using the real
    test-set accuracy measured when the poisoned checkpoint was trained
    (see LABELFLIP_RESULTS above). Label flipping is a training-time attack —
    there's no per-request image to perturb, so this reports the accuracy
    degradation from that offline training run rather than live inference.
    """
    if get_poisoned_model(rate) is None:
        return {
            "status": "missing_checkpoint",
            "rate": rate,
            "message": (
                f"No checkpoint found for {rate}% label flipping. "
                f"Expected model/checkpoints/poisoned_{rate}pct.pt."
            ),
        }

    clean = LABELFLIP_RESULTS[0]
    poisoned = LABELFLIP_RESULTS.get(rate)
    if poisoned is None:
        return {"status": "unknown_rate", "rate": rate,
                "message": f"No recorded results for rate={rate}. Use 10, 20, or 40."}

    clean_acc = round(clean["test_acc"] * 100, 2)
    poisoned_acc = round(poisoned["test_acc"] * 100, 2)
    drop = round(clean_acc - poisoned_acc, 2)

    return {
        "status": "ok",
        "rate": rate,
        "n_flipped": poisoned["n_flipped"],
        "clean_test_acc": clean_acc,
        "poisoned_test_acc": poisoned_acc,
        "accuracy_drop": drop,
        "message": (
            f"Label-flip poisoning at {rate}% ({poisoned['n_flipped']} labels "
            f"flipped High->Low) dropped test accuracy from {clean_acc}% to "
            f"{poisoned_acc}% ({drop} pt drop)."
        ),
    }


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


# ── PGD attack ───────────────────────────────────────────────────────────────
def run_pgd(image: Image.Image, epsilon: float = 0.1, steps: int = 40, alpha: float | None = None) -> dict:
    """Projected Gradient Descent attack (Madry et al., 2018).

    Iterative FGSM where each step is projected back into the L-inf epsilon
    ball around the clean image, making it strictly stronger than single-step
    FGSM at the same epsilon.
    """
    if alpha is None:
        alpha = epsilon / 10

    x_clean = _pil_to_pixels(image)
    clean   = _predict_pixels(x_clean)
    x_adv   = x_clean.clone().detach()
    target  = torch.tensor([clean["idx"]]).to(DEVICE)

    for _ in range(steps):
        x_adv.requires_grad_(True)
        loss = F.cross_entropy(get_model()(x_adv), target)
        get_model().zero_grad(set_to_none=True)
        loss.backward()
        assert x_adv.grad is not None, "PGD: no gradient computed"
        with torch.no_grad():
            x_adv = x_adv + alpha * x_adv.grad.sign()
            delta = (x_adv - x_clean).clamp(-epsilon, epsilon)
            x_adv = (x_clean + delta).clamp(0, 1).detach()

    attacked = _predict_pixels(x_adv)
    return {
        "clean_pred":   clean["label"],
        "attack_pred":  attacked["label"],
        "clean_conf":   clean["confidence"],
        "attack_conf":  attacked["confidence"],
        "asr":          int(clean["idx"] != attacked["idx"]),
        "epsilon":      float(epsilon),
        "steps":        steps,
        "clean_probs":  clean["probs"],
        "attack_probs": attacked["probs"],
        "clean_image":  _pixels_to_b64(x_clean),
        "attack_image": _pixels_to_b64(x_adv),
        "_x_adv":       x_adv,
    }


# ── DeepFool attack (Moosavi-Dezfooli et al., 2016) ─────────────────────────
def run_deepfool(image: Image.Image, max_iter: int = 50, overshoot: float = 0.02) -> dict:
    """DeepFool: minimal-perturbation evasion attack.

    Where FGSM/PGD push the image by a FIXED epsilon budget, DeepFool searches
    for the SMALLEST perturbation that still flips the prediction, by repeatedly
    stepping across the nearest decision boundary. The returned `pert_l2` is a
    per-image robustness score: smaller means the model was easier to fool.

    Label-free — it attacks whatever the model currently predicts, so no
    ground-truth label is needed.
    """
    x_clean = _pil_to_pixels(image)
    clean   = _predict_pixels(x_clean)
    orig_idx = clean["idx"]

    x      = x_clean.clone().detach()
    r_tot  = torch.zeros_like(x_clean)
    cur_idx, n_iter = orig_idx, 0
    model  = get_model()

    while cur_idx == orig_idx and n_iter < max_iter:
        x.requires_grad_(True)
        fs = model(x)[0]                       # logits (3,)

        # gradient of every class logit w.r.t. the input
        grads = []
        for k in range(3):
            model.zero_grad(set_to_none=True)
            if x.grad is not None:
                x.grad.zero_()
            fs[k].backward(retain_graph=(k < 2))
            grads.append(x.grad.detach().clone())

        g_orig = grads[orig_idx]
        best   = None                          # (distance, w_k, f_k) of nearest boundary
        for k in range(3):
            if k == orig_idx:
                continue
            w_k = grads[k] - g_orig
            f_k = (fs[k] - fs[orig_idx]).detach()
            d_k = abs(float(f_k)) / (w_k.flatten().norm().item() + 1e-8)
            if best is None or d_k < best[0]:
                best = (d_k, w_k, f_k)

        _, w_min, f_min = best
        # minimal step across the closest boundary
        r_i   = (abs(float(f_min)) + 1e-4) * w_min / (w_min.flatten().norm().item() ** 2 + 1e-8)
        r_tot = r_tot + r_i
        x = (x_clean + (1 + overshoot) * r_tot).clamp(0, 1).detach()
        with torch.no_grad():
            cur_idx = int(model(x).argmax())
        n_iter += 1

    x_adv    = x
    attacked = _predict_pixels(x_adv)
    return {
        "clean_pred":   clean["label"],
        "attack_pred":  attacked["label"],
        "clean_conf":   clean["confidence"],
        "attack_conf":  attacked["confidence"],
        "asr":          int(clean["idx"] != attacked["idx"]),
        "pert_l2":      round(float(((1 + overshoot) * r_tot).flatten().norm()), 5),
        "iterations":   n_iter,
        "clean_probs":  clean["probs"],
        "attack_probs": attacked["probs"],
        "clean_image":  _pixels_to_b64(x_clean),
        "attack_image": _pixels_to_b64(x_adv),
        "_x_adv":       x_adv,
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


def defend_pil(image: Image.Image, window: int = SMOOTH_WINDOW, smooth: bool = True) -> dict:
    """Apply the spatial-smoothing defence to an arbitrary (already-attacked) image.

    Used by the Defence Lab: it receives the attacked image produced by the
    Attack Lab and returns the defended prediction + smoothed image.
    When smooth=False the median filter is skipped and inference runs on the
    raw image, reflecting the user having toggled the defence off.
    """
    x = _pil_to_pixels(image)
    if smooth:
        return predict_with_defence(x, window)
    pred = _predict_pixels(x)
    return {
        "defended_pred":  pred["label"],
        "defended_idx":   pred["idx"],
        "defended_conf":  pred["confidence"],
        "defended_probs": pred["probs"],
        "defended_image": _pixels_to_b64(x),
    }
 
