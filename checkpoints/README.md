# Model Checkpoints

This directory stores saved model weights from training runs.

## Structure

Checkpoints are saved with the format:
- `{model_name}_epoch_{epoch}_step_{step}.pt` - PyTorch checkpoints
- `{model_name}_best.pt` - Best model based on validation metrics

## Loading Checkpoints

```python
import torch

# Load checkpoint
checkpoint = torch.load('agentprime-autocomplete_epoch_5_step_10000.pt')
model.load_state_dict(checkpoint['model_state_dict'])
optimizer.load_state_dict(checkpoint['optimizer_state_dict'])
epoch = checkpoint['epoch']
loss = checkpoint['loss']
```

## Checkpoint Contents

Each checkpoint contains:
- `model_state_dict` - Model weights
- `optimizer_state_dict` - Optimizer state
- `epoch` - Training epoch
- `step` - Training step
- `loss` - Training loss
- `metrics` - Validation metrics (accuracy, etc.)

