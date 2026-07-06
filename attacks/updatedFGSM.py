import os, numpy as np, pandas as pd
import torch, torch.nn as nn
import torchvision.transforms as T
from PIL import Image
from torch.utils.data import Dataset, DataLoader, WeightedRandomSampler
from torchvision.models import resnet18, ResNet18_Weights
from sklearn.model_selection import train_test_split
from art.estimators.classification import PyTorchClassifier
from art.attacks.evasion import FastGradientMethod

# ── Paths ─────────────────────────────────────────────────────────────────
base_path   = r"C:\Users\Dell\Downloads\MIO-TCD-Localization\MIO-TCD-Localization"
labels_path = r"C:\Users\Dell\Downloads\congestion_labels.csv"
image_dir   = os.path.join(base_path, "train")

vehicle_counts = pd.read_csv(labels_path, dtype={'image_id': str})

# ── FIX 1: 1500 per class = 4500 total ───────────────────────────────────
# More data = higher accuracy. Run overnight if needed on CPU.
subset = vehicle_counts.groupby('congestion_label').sample(n=1500, random_state=42)

train_df, temp_df = train_test_split(
    subset, test_size=0.3, stratify=subset['congestion_label'], random_state=42
)
val_df, test_df = train_test_split(
    temp_df, test_size=0.5, stratify=temp_df['congestion_label'], random_state=42
)
print(f"Train: {len(train_df)} | Val: {len(val_df)} | Test: {len(test_df)}")

# ── FIX 2: Stronger augmentation for training ─────────────────────────────
train_transform = T.Compose([
    T.Resize((256, 256)),
    T.RandomCrop(224),               # crop variation
    T.RandomHorizontalFlip(),
    T.RandomVerticalFlip(p=0.2),
    T.ColorJitter(brightness=0.3, contrast=0.3, saturation=0.3, hue=0.1),
    T.RandomRotation(15),            # slight rotation
    T.ToTensor(),
    T.Normalize(mean=[0.485, 0.456, 0.406],
                std=[0.229, 0.224, 0.225]),
])

test_transform = T.Compose([
    T.Resize((224, 224)),
    T.ToTensor(),
    T.Normalize(mean=[0.485, 0.456, 0.406],
                std=[0.229, 0.224, 0.225]),
])

class MIOTCDCongestionDataset(Dataset):
    def __init__(self, labels_df, image_dir, transform=None):
        self.labels_df = labels_df.reset_index(drop=True)
        self.image_dir = image_dir
        self.transform = transform

    def __len__(self):
        return len(self.labels_df)

    def __getitem__(self, idx):
        row = self.labels_df.iloc[idx]
        img_path = os.path.join(self.image_dir, f"{row['image_id']}.jpg")
        image = Image.open(img_path).convert('RGB')
        label = int(row['congestion_label'])
        if self.transform:
            image = self.transform(image)
        return image, label

train_ds = MIOTCDCongestionDataset(train_df, image_dir, train_transform)
val_ds   = MIOTCDCongestionDataset(val_df,   image_dir, test_transform)
test_ds  = MIOTCDCongestionDataset(test_df,  image_dir, test_transform)

# Weighted sampler for class balance
labels_array = train_df['congestion_label'].values
class_counts = np.bincount(labels_array)
weights      = 1.0 / class_counts[labels_array]
sampler      = WeightedRandomSampler(weights, num_samples=len(weights), replacement=True)

train_loader = DataLoader(train_ds, batch_size=32, sampler=sampler, num_workers=0)
val_loader   = DataLoader(val_ds,   batch_size=32, shuffle=False,   num_workers=0)
test_loader  = DataLoader(test_ds,  batch_size=32, shuffle=False,   num_workers=0)

# ── FIX 3: Unfreeze more layers ───────────────────────────────────────────
device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
print(f"Device: {device}")

model = resnet18(weights=ResNet18_Weights.IMAGENET1K_V1)

# Freeze only early layers (layer1, layer2) — unfreeze layer3, layer4, fc
for name, param in model.named_parameters():
    param.requires_grad = False

for name, param in model.named_parameters():
    if any(x in name for x in ['layer3', 'layer4', 'fc']):
        param.requires_grad = True

model.fc = nn.Sequential(
    nn.Dropout(0.4),                  # FIX 4: Dropout prevents overfitting
    nn.Linear(model.fc.in_features if not isinstance(model.fc, nn.Sequential)
              else 512, 3)
)

# Rebuild fc cleanly
model.fc = nn.Sequential(
    nn.Dropout(0.4),
    nn.Linear(512, 3)
)
model = model.to(device)

# ── FIX 5: Differential learning rates ───────────────────────────────────
# Lower LR for pretrained layers, higher for new head
optimizer = torch.optim.AdamW([
    {'params': [p for n,p in model.named_parameters()
                if ('layer3' in n or 'layer4' in n) and p.requires_grad],
     'lr': 1e-4, 'weight_decay': 1e-4},
    {'params': model.fc.parameters(),
     'lr': 1e-3, 'weight_decay': 1e-4},
])

# ── FIX 6: Cosine annealing scheduler ────────────────────────────────────
scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=15)

criterion = nn.CrossEntropyLoss(label_smoothing=0.1)  # FIX 7: label smoothing

# ── FIX 8: More epochs + early stopping ──────────────────────────────────
best_val_acc   = 0.0
patience       = 5
patience_count = 0

for epoch in range(20):
    # ── train ──
    model.train()
    running_loss = 0.0
    for images, labels in train_loader:
        images, labels = images.to(device), labels.to(device)
        optimizer.zero_grad()
        loss = criterion(model(images), labels)
        loss.backward()
        optimizer.step()
        running_loss += loss.item()

    scheduler.step()

    # ── validate ──
    model.eval()
    correct, total = 0, 0
    with torch.no_grad():
        for images, labels in val_loader:
            images, labels = images.to(device), labels.to(device)
            preds = model(images).argmax(dim=1)
            correct += (preds == labels).sum().item()
            total   += labels.size(0)
    val_acc = correct / total
    lr_now  = optimizer.param_groups[-1]['lr']
    print(f"Epoch {epoch+1:2d} | loss={running_loss/len(train_loader):.3f} "
          f"| Val={val_acc:.2%} | LR={lr_now:.2e}")

    if val_acc > best_val_acc:
        best_val_acc   = val_acc
        patience_count = 0
        os.makedirs('models', exist_ok=True)
        torch.save(model, 'models/baseline_v1.pt')
        print(f"           ✓ Best saved ({val_acc:.2%})")
    else:
        patience_count += 1
        if patience_count >= patience:
            print(f"Early stopping at epoch {epoch+1}")
            break

print(f"\nBest val accuracy: {best_val_acc:.2%}")

# ── Evaluate on test set ──────────────────────────────────────────────────
model = torch.load('models/baseline_v1.pt', map_location=device)
model.eval()

correct, total = 0, 0
with torch.no_grad():
    for images, labels in test_loader:
        images, labels = images.to(device), labels.to(device)
        preds = model(images).argmax(dim=1)
        correct += (preds == labels).sum().item()
        total   += labels.size(0)
print(f"Test accuracy: {correct/total:.2%}")

# ── FGSM ─────────────────────────────────────────────────────────────────
clip_min = min((0.0-m)/s for m,s in zip([0.485,0.456,0.406],[0.229,0.224,0.225]))
clip_max = max((1.0-m)/s for m,s in zip([0.485,0.456,0.406],[0.229,0.224,0.225]))

optimizer_art = torch.optim.AdamW(model.parameters(), lr=1e-4)
classifier = PyTorchClassifier(
    model=model, loss=nn.CrossEntropyLoss(),
    optimizer=optimizer_art,
    input_shape=(3, 224, 224), nb_classes=3,
    clip_values=(clip_min, clip_max),
    device_type='gpu' if torch.cuda.is_available() else 'cpu'
)

x_list, y_list = [], []
for images, labels in test_loader:
    x_list.append(images.numpy())
    y_list.append(labels.numpy())
x_test = np.concatenate(x_list)
y_test = np.concatenate(y_list)

clean_preds = np.argmax(classifier.predict(x_test), axis=1)
clean_acc   = np.mean(clean_preds == y_test)
print(f"\nClean test accuracy: {clean_acc:.2%}")

results = []
for eps in [0.01, 0.05, 0.10, 0.20]:
    attack    = FastGradientMethod(estimator=classifier, eps=eps)
    x_adv     = attack.generate(x=x_test)
    adv_preds = np.argmax(classifier.predict(x_adv), axis=1)
    acc = np.mean(adv_preds == y_test)
    asr = np.mean(adv_preds != clean_preds)
    results.append({'epsilon': eps, 'clean_acc': clean_acc,
                    'attacked_acc': acc, 'asr': asr})
    print(f"ε={eps:.2f} | Attacked acc={acc:.2%} | ASR={asr:.2%}")

os.makedirs('outputs', exist_ok=True)
pd.DataFrame(results).to_csv('outputs/fgsm_results.csv', index=False)
print("\nSaved → outputs/fgsm_results.csv")
