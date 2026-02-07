# Training Results

This directory contains training logs, metrics, and evaluation results.

## Structure

- `logs/` - Training logs (JSON, CSV)
- `metrics/` - Validation/test metrics
- `plots/` - Training curves and visualizations
- `evaluations/` - Model evaluation results

## Metrics Tracked

- **Loss**: Training and validation loss over time
- **Accuracy**: Code completion accuracy
- **Acceptance Rate**: Percentage of suggestions accepted (for RL models)
- **Latency**: Inference time per completion
- **Token Usage**: Average tokens per completion

## Example Log Format

```json
{
  "epoch": 5,
  "step": 10000,
  "train_loss": 2.34,
  "val_loss": 2.45,
  "accuracy": 0.78,
  "acceptance_rate": 0.65,
  "timestamp": "2024-01-15T10:30:00Z"
}
```

