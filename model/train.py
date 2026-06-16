"""
TrafficGuard - ResNet18 Congestion Classifier Training Script
COMP47250 - Team Software Project - Project P14 - UCD Summer 2026

Owner: Soham (Model Training)

Trains a ResNet18 image classifier to predict urban road congestion level
(Low, Medium, High) from MIO-TCD traffic camera images.

Reads directly from labelled_manifest.csv produced by
mio_tcd_pipeline_v2.ipynb (Walid). No relabelling happens here.

Inputs:
    BASE_PATH/pipeline_output/labelled_manifest.csv (Walid's notebook output)

Outputs:
    checkpoints/best.pt
    checkpoints/last.pt
    checkpoints/train_log.csv

Usage:
    python model/train.py
"""

# -- Standard library --------------------------------------------------------
import os
import csv
import time
import random
import platform
from pathlib import Path

# -- Data --------------------------------------------------------------------
import numpy as np
import pandas as pd
from PIL import Image

# -- PyTorch -----------------------------------------------------------------
import torch
import torch.nn as nn
import torch.optim as optim
import torch.nn.functional as F
from torch.utils.data import Dataset, DataLoader
from torch.optim.lr_scheduler import CosineAnnealingLR

# -- Torchvision -------------------------------------------------------------
from torchvision import transforms, models

# -- Metrics -----------------------------------------------------------------
from sklearn.metrics import classification_report, confusion_matrix

# -- Progress bars -----------------------------------------------------------
from tqdm.auto import tqdm

# ============================================================================
# 1. Configuration & Paths
# ============================================================================

# Root of the MIO-TCD-Localization folder on THIS machine.
# Override via environment variable if needed:
#   export TRAFFICGUARD_BASE_PATH=/path/to/MIO-TCD-Localization
BASE_PATH = Path(
    os.environ.get(
        'TRAFFICGUARD_BASE_PATH',
        r'C:\Users\Soham Patil\OneDrive\Desktop\trafficguard_p14'
        r'\trafficguard-p14\data\raw\MIO-TCD-Localization'
    )
)

# Manifest CSV produced by mio_tcd_pipeline_v2.ipynb (Walid)
MANIFEST_PATH = BASE_PATH / 'pipeline_output' / 'labelled_manifest.csv'

# Folder containing the raw .jpg images on THIS machine.
# Override via environment variable if needed:
#   export TRAFFICGUARD_IMAGES_DIR=/path/to/train
IMAGES_DIR = Path(
    os.environ.get('TRAFFICGUARD_IMAGES_DIR', str(BASE_PATH / 'train'))
)

# Where model checkpoints and logs will be saved
CHECKPOINT_DIR = Path('checkpoints')
CHECKPOINT_DIR.mkdir(exist_ok=True)

# -- Hyperparameters ---------------------------------------------------------
BATCH_SIZE = 64
EPOCHS = 25
LEARNING_RATE = 1e-4
WEIGHT_DECAY = 1e-4
NUM_WORKERS = 0 if platform.system() == 'Windows' else 4
RANDOM_SEED = 42

# -- Early stopping ----------------------------------------------------------
EARLY_STOPPING_PATIENCE = 5  # Stop if val acc doesn't improve for 5 epochs

# -- Class weights -----------------------------------------------------------
USE_CLASS_WEIGHTS = True

# -- Label mapping (must match pipeline notebook assign_label() output) ------
LABEL_MAP = {'Low': 0, 'Medium': 1, 'High': 2}
CLASS_NAMES = ['Low', 'Medium', 'High']
NUM_CLASSES = len(CLASS_NAMES)

# -- ImageNet normalization --------------------------------------------------
IMAGENET_MEAN = [0.485, 0.456, 0.406]
IMAGENET_STD = [0.229, 0.224, 0.225]

# -- Reproducibility ---------------------------------------------------------
random.seed(RANDOM_SEED)
np.random.seed(RANDOM_SEED)
torch.manual_seed(RANDOM_SEED)
if torch.cuda.is_available():
    torch.cuda.manual_seed_all(RANDOM_SEED)

# -- Device ------------------------------------------------------------------
DEVICE = torch.device('cuda' if torch.cuda.is_available() else 'cpu')

# ============================================================================
# 2. Dataset & Transforms
# ============================================================================

def get_transforms(split: str) -> transforms.Compose:
    """
    Return the appropriate transform pipeline for each data split.

    Args:
        split : 'train' | 'val' | 'test'
    """
    if split == 'train':
        return transforms.Compose([
            transforms.Resize((256, 256)),
            transforms.RandomCrop(224),
            transforms.RandomHorizontalFlip(p=0.5),
            transforms.ColorJitter(
                brightness=0.3, contrast=0.3, saturation=0.15, hue=0.05
            ),
            transforms.RandomRotation(degrees=5),
            transforms.ToTensor(),
            transforms.Normalize(IMAGENET_MEAN, IMAGENET_STD),
        ])
    else:
        # Val and test: deterministic, no augmentation
        return transforms.Compose([
            transforms.Resize((224, 224)),
            transforms.ToTensor(),
            transforms.Normalize(IMAGENET_MEAN, IMAGENET_STD),
        ])

class MIOTCDDataset(Dataset):
    """
    PyTorch Dataset for the MIO-TCD congestion manifest.

    Reads labelled_manifest.csv produced by mio_tcd_pipeline_v2.ipynb.

    Expected manifest columns:
        image_id | image_path | vehicle_count | hull_area | hull_coverage |
        packing_density | mean_nn_dist_norm | density_score |
        congestion_label | split

    Args:
        manifest_path : path to labelled_manifest.csv
        split         : 'train' | 'val' | 'test'
        transform     : torchvision transform pipeline
                        (defaults to get_transforms(split) if None)
        images_dir    : if provided, image paths are resolved as
                        images_dir / image_id.jpg, overriding the
                        image_path column in the manifest.
                        Use this when running on a different machine
                        to whoever generated the manifest.
    """

    def __init__(self, manifest_path, split, transform=None, images_dir=None):
        df = pd.read_csv(manifest_path, dtype={'image_id': str})

        # -- Validate required columns ---------------------------------------
        required = {'image_id', 'congestion_label', 'split'}
        missing = required - set(df.columns)
        if missing:
            raise ValueError(
                f'Manifest is missing columns: {missing}
'
                f'Re-run mio_tcd_pipeline_v2.ipynb to regenerate it.'
            )

        # -- Filter to requested split ---------------------------------------
        self.df = df[df['split'] == split].reset_index(drop=True)
        self.transform = transform or get_transforms(split)
        self.images_dir = Path(images_dir) if images_dir else None

        # -- Validate label values -------------------------------------------
        unknown = set(self.df['congestion_label'].unique()) - set(LABEL_MAP)
        if unknown:
            raise ValueError(f'Unknown congestion_label values: {unknown}')

        # Map string labels to integer indices
        self.df = self.df.copy()
        self.df['label_idx'] = self.df['congestion_label'].map(LABEL_MAP)

        # -- Class counts (for distribution and weighted loss) ---------------
        self._counts = self.df['congestion_label'].value_counts()
        total = len(self.df)
        self.class_weights = torch.tensor(
            [total / (NUM_CLASSES * self._counts.get(c, 1))
             for c in CLASS_NAMES],
            dtype=torch.float32,
        )

    def __len__(self):
        return len(self.df)

    def _resolve_path(self, row):
        """Resolve image file path with optional root override."""
        if self.images_dir:
            return self.images_dir / f"{row['image_id']}.jpg"
        return Path(row['image_path'])

    def __getitem__(self, idx):
        row = self.df.iloc[idx]
        img_path = self._resolve_path(row)
        label = int(row['label_idx'])

        try:
            image = Image.open(img_path).convert('RGB')
        except (FileNotFoundError, OSError) as e:
            raise FileNotFoundError(
                f'Image not found: {img_path}
'
                f'Tip: set TRAFFICGUARD_IMAGES_DIR env var to your local '
                f'MIO-TCD-Localization/train/ folder.'
            ) from e

        if self.transform:
            image = self.transform(image)

        return image, label

# ============================================================================
# 3. Model Architecture
# ============================================================================

def build_model(freeze_backbone: bool = False) -> nn.Module:
    """
    Load pretrained ResNet18 and replace the classifier head for
    3-class traffic congestion classification.

    Args:
        freeze_backbone : False (default) = full fine-tuning of all layers.
                          True = only the new FC head is trained.
                          Use True only for very quick prototyping.

    Returns:
        nn.Module ready to move to device and train.
    """
    model = models.resnet18(weights=models.ResNet18_Weights.IMAGENET1K_V1)

    if freeze_backbone:
        for param in model.parameters():
            param.requires_grad = False

    # Replace final FC: Linear(512 -> 1000) becomes Dropout + Linear(512 -> 3)
    in_features = model.fc.in_features  # 512 for ResNet18
    model.fc = nn.Sequential(
        nn.Dropout(p=0.3),
        nn.Linear(in_features, NUM_CLASSES),
    )

    # Always ensure the new head is trainable
    for param in model.fc.parameters():
        param.requires_grad = True

    return model

# ============================================================================
# 4. Training & Evaluation Functions
# ============================================================================

def train_one_epoch(model, loader, criterion, optimizer, device):
    """Train for one epoch with tqdm progress bar."""
    model.train()
    running_loss, correct, total = 0.0, 0, 0

    pbar = tqdm(loader, desc='Training', leave=False)
    for images, labels in pbar:
        images = images.to(device, non_blocking=True)
        labels = labels.to(device, non_blocking=True)

        optimizer.zero_grad(set_to_none=True)
        outputs = model(images)
        loss = criterion(outputs, labels)
        loss.backward()
        optimizer.step()

        running_loss += loss.item() * images.size(0)
        preds = outputs.argmax(dim=1)
        correct += (preds == labels).sum().item()
        total += labels.size(0)

        pbar.set_postfix(
            {'loss': f'{loss.item():.4f}', 'acc': f'{correct/total:.2%}'}
        )

    return running_loss / total, correct / total

def evaluate(model, loader, criterion, device):
    """
    Evaluate model on val or test loader with tqdm progress bar.
    Returns (avg_loss, accuracy, all_preds, all_labels).
    """
    model.eval()
    running_loss, correct, total = 0.0, 0, 0
    all_preds, all_labels = [], []

    pbar = tqdm(loader, desc='Evaluating', leave=False)
    with torch.no_grad():
        for images, labels in pbar:
            images = images.to(device, non_blocking=True)
            labels = labels.to(device, non_blocking=True)

            outputs = model(images)
            loss = criterion(outputs, labels)

            running_loss += loss.item() * images.size(0)
            preds = outputs.argmax(dim=1)
            correct += (preds == labels).sum().item()
            total += labels.size(0)

            all_preds.extend(preds.cpu().numpy())
            all_labels.extend(labels.cpu().numpy())

            pbar.set_postfix({'acc': f'{correct/total:.2%}'})

    return running_loss / total, correct / total, all_preds, all_labels

# ============================================================================
# 5. Main Training Loop
# ============================================================================

def main():
    """Main training entry point."""
    print('=' * 70)
    print('TrafficGuard - ResNet18 Congestion Classifier Training')
    print('=' * 70)

    # -- Device info ---------------------------------------------------------
    print(f'
Device         : {DEVICE}'
          + (f' ({torch.cuda.get_device_name(0)})'
             if DEVICE.type == 'cuda' else ''))
    print(f'Manifest       : {MANIFEST_PATH}')
    print(f'Images dir     : {IMAGES_DIR}')
    print(f'Checkpoint dir : {CHECKPOINT_DIR}')
    print(f'Epochs         : {EPOCHS}  |  Batch size: {BATCH_SIZE}'
          f'  |  LR: {LEARNING_RATE}')
    print(f'Early stopping : patience = {EARLY_STOPPING_PATIENCE} epochs')
    print(f'Class weights  : {"Enabled" if USE_CLASS_WEIGHTS else "Disabled"}')
    print(f'Label smooth   : 0.1')
    print()

    # -- Load datasets (NO subsample - use full data) ------------------------
    print('Loading datasets...')
    train_dataset = MIOTCDDataset(
        MANIFEST_PATH, 'train', images_dir=IMAGES_DIR
    )
    val_dataset = MIOTCDDataset(
        MANIFEST_PATH, 'val', images_dir=IMAGES_DIR
    )
    test_dataset = MIOTCDDataset(
        MANIFEST_PATH, 'test', images_dir=IMAGES_DIR
    )

    print(f'  Train : {len(train_dataset):>6,}')
    print(f'  Val   : {len(val_dataset):>6,}')
    print(f'  Test  : {len(test_dataset):>6,}')
    print(f'  Total : '
          f'{len(train_dataset)+len(val_dataset)+len(test_dataset):>6,}')

    # -- Class weights -------------------------------------------------------
    print(f'
Class weights (inverse frequency):')
    for cls, w in zip(CLASS_NAMES, train_dataset.class_weights.tolist()):
        print(f'  {cls:<8}: {w:.4f}')

    # -- DataLoaders ---------------------------------------------------------
    train_loader = DataLoader(
        train_dataset,
        batch_size=BATCH_SIZE,
        shuffle=True,
        num_workers=NUM_WORKERS,
        pin_memory=(DEVICE.type == 'cuda'),
        drop_last=True,
    )
    val_loader = DataLoader(
        val_dataset,
        batch_size=BATCH_SIZE,
        shuffle=False,
        num_workers=NUM_WORKERS,
        pin_memory=(DEVICE.type == 'cuda'),
    )
    test_loader = DataLoader(
        test_dataset,
        batch_size=BATCH_SIZE,
        shuffle=False,
        num_workers=NUM_WORKERS,
        pin_memory=(DEVICE.type == 'cuda'),
    )

    print(f'
Train batches : {len(train_loader):,}')
    print(f'Val batches   : {len(val_loader):,}')
    print(f'Test batches  : {len(test_loader):,}')

    # -- Model ---------------------------------------------------------------
    print('
Building model...')
    model = build_model(freeze_backbone=False).to(DEVICE)

    total_params = sum(p.numel() for p in model.parameters())
    trainable_params = sum(
        p.numel() for p in model.parameters() if p.requires_grad
    )
    print(f'  Architecture     : ResNet18 (ImageNet pretrained, full fine-tune)')
    print(f'  Total params     : {total_params:,}')
    print(f'  Trainable params : {trainable_params:,}')

    # -- Loss, Optimizer, Scheduler ------------------------------------------
    if USE_CLASS_WEIGHTS:
        weights = train_dataset.class_weights.to(DEVICE)
        criterion = nn.CrossEntropyLoss(
            weight=weights, label_smoothing=0.1
        )
        print(f'
Loss: CrossEntropyLoss '
              f'(weighted: {[round(w, 3) for w in weights.tolist()]}, '
              f'label_smoothing=0.1)')
    else:
        criterion = nn.CrossEntropyLoss(label_smoothing=0.1)
        print(f'
Loss: CrossEntropyLoss (unweighted, label_smoothing=0.1)')

    optimizer = optim.AdamW(
        model.parameters(), lr=LEARNING_RATE, weight_decay=WEIGHT_DECAY
    )
    scheduler = CosineAnnealingLR(optimizer, T_max=EPOCHS, eta_min=1e-6)

    print(f'Optimiser: AdamW  (lr={LEARNING_RATE}, '
          f'weight_decay={WEIGHT_DECAY})')
    print(f'Scheduler: CosineAnnealingLR  (T_max={EPOCHS}, eta_min=1e-6)')

    # -- Training loop -------------------------------------------------------
    print('
' + '=' * 70)
    print('Starting training...')
    print('=' * 70)

    best_val_acc = 0.0
    epochs_without_improvement = 0
    log_path = CHECKPOINT_DIR / 'train_log.csv'

    # Write CSV header
    with open(log_path, 'w', newline='') as f:
        csv.writer(f).writerow(
            ['epoch', 'train_loss', 'train_acc', 'val_loss', 'val_acc', 'lr']
        )

    header = (f"{'Epoch':>6}  {'Train Loss':>10}  {'Train Acc':>9}  "
              f"{'Val Loss':>9}  {'Val Acc':>8}  {'LR':>9}  {'Time':>7}")
    print(header)
    print('-' * len(header))

    for epoch in range(1, EPOCHS + 1):
        t0 = time.time()

        train_loss, train_acc = train_one_epoch(
            model, train_loader, criterion, optimizer, DEVICE
        )
        val_loss, val_acc, _, _ = evaluate(
            model, val_loader, criterion, DEVICE
        )
        scheduler.step()

        current_lr = scheduler.get_last_lr()[0]
        elapsed = time.time() - t0

        # Log to CSV
        with open(log_path, 'a', newline='') as f:
            csv.writer(f).writerow(
                [epoch, train_loss, train_acc, val_loss, val_acc, current_lr]
            )

        saved = ''
        if val_acc > best_val_acc:
            best_val_acc = val_acc
            epochs_without_improvement = 0
            torch.save(
                {
                    'epoch': epoch,
                    'model_state_dict': model.state_dict(),
                    'optimizer_state_dict': optimizer.state_dict(),
                    'val_acc': val_acc,
                    'class_names': CLASS_NAMES,
                    'label_map': LABEL_MAP,
                },
                CHECKPOINT_DIR / 'best.pt',
            )
            saved = '  <- best saved'
        else:
            epochs_without_improvement += 1

        print(
            f"{epoch:>6}  {train_loss:>10.4f}  {train_acc:>8.2%}  "
            f"{val_loss:>9.4f}  {val_acc:>7.2%}  "
            f"{current_lr:>9.2e}  {elapsed:>6.1f}s" + saved
        )

        # -- Early stopping check --------------------------------------------
        if epochs_without_improvement >= EARLY_STOPPING_PATIENCE:
            print(f'
Early stopping triggered: no improvement in val_acc '
                  f'for {EARLY_STOPPING_PATIENCE} consecutive epochs.')
            break

    # Save final epoch checkpoint
    torch.save(
        {
            'epoch': epoch,
            'model_state_dict': model.state_dict(),
            'class_names': CLASS_NAMES,
        },
        CHECKPOINT_DIR / 'last.pt',
    )

    print(f'
Training complete.')
    print(f'Best val accuracy : {best_val_acc:.2%}')
    print(f'Checkpoints saved to : {CHECKPOINT_DIR}/')

    # -- Final evaluation on test set ----------------------------------------
    print('
' + '=' * 70)
    print('Evaluating on test set...')
    print('=' * 70)

    # Load best checkpoint for test evaluation
    best_ckpt = torch.load(
        CHECKPOINT_DIR / 'best.pt', map_location=DEVICE
    )
    model.load_state_dict(best_ckpt['model_state_dict'])
    print(f'Loaded best checkpoint (epoch {best_ckpt["epoch"]}, '
          f'val_acc={best_ckpt["val_acc"]:.2%})')

    _, test_acc, test_preds, test_labels = evaluate(
        model, test_loader, criterion, DEVICE
    )
    print(f'
Test accuracy: {test_acc:.2%}')
    print(f'
Classification Report:')
    print(classification_report(
        test_labels, test_preds, target_names=CLASS_NAMES
    ))

if __name__ == '__main__':
    main()
